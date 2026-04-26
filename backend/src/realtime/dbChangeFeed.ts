import type pg from 'pg'

export type DbChangeEvent = {
  table: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  row: Record<string, unknown>
}

export async function ensureDbChangeTriggers(pool: pg.Pool): Promise<void> {
  // Keep it idempotent. We intentionally do it at app startup for now.
  // In a later iteration we can move it to schema DDL.
  await pool.query(`
    create schema if not exists app_realtime;

    create or replace function app_realtime.notify_db_change() returns trigger as $$
    declare
      payload json;
    begin
      if (tg_op = 'DELETE') then
        payload := json_build_object(
          'table', tg_table_name,
          'action', tg_op,
          'row', row_to_json(old)
        );
      else
        payload := json_build_object(
          'table', tg_table_name,
          'action', tg_op,
          'row', row_to_json(new)
        );
      end if;
      perform pg_notify('db_change', payload::text);
      return null;
    end;
    $$ language plpgsql;
  `)

  const tables: Array<{ name: string; events: Array<'INSERT' | 'UPDATE' | 'DELETE'> }> = [
    { name: 'chat_messages', events: ['INSERT', 'UPDATE', 'DELETE'] },
    { name: 'chat_conversation_members', events: ['UPDATE', 'DELETE'] },
    { name: 'chat_message_mentions', events: ['INSERT', 'UPDATE'] },
  ]

  for (const t of tables) {
    for (const ev of t.events) {
      const trig = `app_realtime__${t.name}__${ev.toLowerCase()}`
      await pool.query(`drop trigger if exists ${trig} on public.${t.name}`)
      await pool.query(`
        create trigger ${trig}
        after ${ev} on public.${t.name}
        for each row execute function app_realtime.notify_db_change();
      `)
    }
  }
}

export async function startDbChangeListener(opts: {
  pool: pg.Pool
  onEvent: (e: DbChangeEvent) => void | Promise<void>
  logger?: { warn: (o: any, msg?: string) => void; error: (o: any, msg?: string) => void; info?: (o: any, msg?: string) => void }
}): Promise<() => Promise<void>> {
  const { pool, onEvent, logger } = opts
  let closed = false
  let client: pg.PoolClient | null = null
  const safeRelease = (c: pg.PoolClient | null) => {
    if (!c) return
    try {
      c.release()
    } catch {
      /* noop */
    }
  }

  async function connect(): Promise<void> {
    if (closed) return
    if (client) return
    client = await pool.connect()
    client.on('error', (err) => {
      logger?.warn({ err }, 'db_change_listener_error')
      safeRelease(client)
      client = null
      // reconnect loop below
    })
    await client.query(`listen db_change`)
    ;(client as any).on('notification', async (msg: any) => {
      if (closed) return
      if (!msg?.payload) return
      try {
        const parsed = JSON.parse(String(msg.payload)) as DbChangeEvent
        if (!parsed || typeof parsed !== 'object') return
        if (!parsed.table || !parsed.action || !parsed.row) return
        await onEvent(parsed)
      } catch (err) {
        logger?.warn({ err }, 'db_change_payload_parse_failed')
      }
    })
  }

  // background reconnect loop
  ;(async () => {
    while (!closed) {
      try {
        await connect()
      } catch (err) {
        logger?.warn({ err }, 'db_change_listener_connect_failed')
        safeRelease(client)
        client = null
      }
      await new Promise((r) => setTimeout(r, client ? 10_000 : 2_000))
    }
  })()

  return async () => {
    closed = true
    try {
      if (client) await client.query(`unlisten *`)
    } catch {
      /* noop */
    }
    safeRelease(client)
    client = null
  }
}

