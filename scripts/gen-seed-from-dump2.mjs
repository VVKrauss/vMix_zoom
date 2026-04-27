import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const dumpDir = path.resolve(repoRoot, 'dump2')

const outPath = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : path.resolve(repoRoot, 'public-seed.dump2.sql')

function parseOnlyTablesArg() {
  const arg = process.argv.find((a) => a.startsWith('--only='))
  if (!arg) return null
  const raw = arg.slice('--only='.length).trim()
  if (!raw) return null
  const tables = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return tables.length ? tables : null
}

/**
 * Order matters for FK constraints.
 * Keep this list minimal and explicit; missing files are skipped.
 */
const tableOrder = [
  // identity + roles
  'users',
  'roles',
  'permissions',
  'role_permissions',
  'user_global_roles',

  // social graph / prefs
  'contact_aliases',
  'user_favorites',
  'user_blocks',
  'user_contact_list_hides',
  'user_presence_public',

  // messenger core
  'chat_conversations',
  'chat_conversation_members',
  'chat_conversation_notification_mutes',
  'chat_conversation_invites',
  'chat_conversation_join_requests',
  'chat_messages',
  'chat_message_mentions',

  // push + misc
  'push_subscriptions',
  'site_news',
  'space_rooms',
  'app_version',
]

function csvPathForTable(table) {
  return path.join(dumpDir, `${table}_rows.csv`)
}

function readFirstLine(filePath) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(256 * 1024)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    const s = buf.subarray(0, n).toString('utf8')
    const idx = s.indexOf('\n')
    if (idx < 0) throw new Error('csv_header_too_long_or_missing_newline')
    return s.slice(0, idx).replace(/\r$/, '')
  } finally {
    fs.closeSync(fd)
  }
}

function writeCopyBlock(out, table, filePath) {
  const header = readFirstLine(filePath)
  if (!header.trim()) throw new Error(`empty_header:${table}`)
  const cols = header.split(',').map((c) => c.trim()).filter(Boolean)
  if (!cols.length) throw new Error(`bad_header:${table}`)

  out.write(`\n-- dump2/${path.basename(filePath)}\n`)
  out.write(`COPY public.${table} (${cols.join(', ')}) FROM STDIN WITH (FORMAT csv, HEADER true);\n`)

  const content = fs.readFileSync(filePath, 'utf8')
  out.write(normalizeCsv(content, cols, table))
  out.write('\\.\n')
}

function normalizeCsv(input, columns, table) {
  const expectedCols = columns.length
  // Some *_rows.csv files may contain unquoted newlines inside fields (invalid CSV).
  // Heuristic: treat '\n' as end-of-row only when we're NOT inside quotes AND we already
  // have (expectedCols - 1) commas collected (i.e. we can complete the row).
  const s = input.replace(/\r\n/g, '\n')
  const firstNl = s.indexOf('\n')
  if (firstNl < 0) throw new Error(`csv_missing_newline:${table}`)
  const header = s.slice(0, firstNl)
  let i = firstNl + 1

  const rows = []
  let rowNum = 0

  while (i < s.length) {
    if (s[i] === '\n') {
      i += 1
      continue
    }
    rowNum += 1
    const row = []
    let field = ''
    let inQuotes = false

    while (i < s.length) {
      const ch = s[i]

      if (inQuotes) {
        if (ch === '"') {
          const next = s[i + 1]
          if (next === '"') {
            field += '"'
            i += 2
            continue
          }
          inQuotes = false
          i += 1
          continue
        }
        field += ch
        i += 1
        continue
      }

      if (ch === '"') {
        inQuotes = true
        i += 1
        continue
      }

      if (ch === ',') {
        row.push(field)
        field = ''
        i += 1
        continue
      }

      if (ch === '\n') {
        // only finish the row if we have enough columns; otherwise it's a broken newline inside a field
        if (row.length >= expectedCols - 1) {
          row.push(field)
          field = ''
          i += 1
          break
        }
        field += '\n'
        i += 1
        continue
      }

      field += ch
      i += 1
    }

    // EOF without newline
    if (i >= s.length && (field.length || row.length)) {
      row.push(field)
      field = ''
    }

    // Trailing empty fields might be missing if the source line ends with commas and then a broken newline.
    while (row.length < expectedCols) row.push('')

    // Table-specific fixes:
    // - In COPY ... CSV default NULL is empty string. Our schema requires chat_messages.body NOT NULL.
    if (table === 'chat_messages') {
      const kindIdx = columns.indexOf('kind')
      const bodyIdx = columns.indexOf('body')
      if (kindIdx >= 0 && bodyIdx >= 0) {
        const kind = String(row[kindIdx] ?? '').trim()
        const body = String(row[bodyIdx] ?? '')
        if (!body.trim()) {
          if (kind === 'image') row[bodyIdx] = '[image]'
          else if (kind === 'reaction') row[bodyIdx] = 'reaction'
          else if (kind === 'system') row[bodyIdx] = 'system'
          else row[bodyIdx] = kind || '[message]'
        }
      }
    }

    // - dump2/space_rooms_rows.csv exports uuid[] columns as JSON-ish strings like "[]",
    //   but Postgres expects array literals: '{}' or '{uuid,...}'.
    if (table === 'space_rooms') {
      for (const col of ['banned_user_ids', 'approved_joiners', 'room_admin_user_ids']) {
        const idx = columns.indexOf(col)
        if (idx < 0) continue
        const v = String(row[idx] ?? '').trim()
        if (!v) {
          row[idx] = '{}'
          continue
        }
        if (v === '{}' || v === '{ }') {
          row[idx] = '{}'
          continue
        }
        // Common dump2 formats:
        // - [] or ["uuid", "uuid2"] (JSON)
        // - {} or {uuid,uuid2} (already Postgres)
        if (v.startsWith('[') && v.endsWith(']')) {
          try {
            const arr = JSON.parse(v)
            if (Array.isArray(arr)) {
              const cleaned = arr
                .map((x) => String(x ?? '').trim())
                .filter(Boolean)
              row[idx] = `{${cleaned.join(',')}}`
              continue
            }
          } catch {
            // fall through: keep original value (will likely error and show us the exact row)
          }
        }
        if (v === '[]') {
          row[idx] = '{}'
          continue
        }
      }
    }

    if (row.length !== expectedCols) {
      const preview = row.slice(0, 6).map((v) => String(v).slice(0, 80)).join(' | ')
      throw new Error(`csv_bad_row:${table}:row_${rowNum}:expected_${expectedCols}_got_${row.length}: ${preview}`)
    }
    rows.push(row)
  }

  return [header + '\n', ...rows.map((r) => r.map(csvEscape).join(',') + '\n')].join('')
}

function csvEscape(v) {
  const s = String(v ?? '')
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function main() {
  if (!fs.existsSync(dumpDir)) {
    console.error(`dump dir not found: ${dumpDir}`)
    process.exit(1)
  }

  const onlyTables = parseOnlyTablesArg()
  if (onlyTables) {
    const unknown = onlyTables.filter((t) => !tableOrder.includes(t))
    if (unknown.length) {
      console.error(`Unknown table(s) in --only: ${unknown.join(', ')}`)
      console.error(`Allowed: ${tableOrder.join(', ')}`)
      process.exit(1)
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  const out = fs.createWriteStream(outPath, { encoding: 'utf8' })

  out.write('-- Generated by scripts/gen-seed-from-dump2.mjs\n')
  out.write("-- Source: ./dump2/*_rows.csv\n")
  out.write('SET client_encoding = \'UTF8\';\n')
  out.write('SET standard_conforming_strings = on;\n')
  out.write('SET check_function_bodies = false;\n')
  out.write('SET client_min_messages = warning;\n')
  out.write('SET row_security = off;\n')

  let written = 0
  const tablesToWrite = onlyTables ?? tableOrder
  for (const table of tablesToWrite) {
    const p = csvPathForTable(table)
    if (!fs.existsSync(p)) continue
    writeCopyBlock(out, table, p)
    written += 1
  }

  out.end(() => {
    console.log(`Wrote: ${outPath}`)
    console.log(`Tables included: ${written}/${tablesToWrite.length}`)
  })
}

main()

