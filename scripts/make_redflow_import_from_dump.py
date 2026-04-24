from __future__ import annotations

from dataclasses import dataclass
import io
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class CopyBlock:
    source_table: str  # e.g. public.users
    target_table: str  # e.g. stage_users
    header: str  # full COPY ... FROM stdin; line
    lines: list[str]  # includes header, data lines, trailing \. line (with newlines)


TABLE_MAP: dict[str, str] = {
    "public.users": "stage_users",
    "public.chat_conversations": "stage_chat_conversations",
    "public.chat_conversation_members": "stage_chat_conversation_members",
    "public.chat_messages": "stage_chat_messages",
    "public.chat_conversation_invites": "stage_chat_conversation_invites",
}


def iter_lines(path: Path) -> Iterable[str]:
    """
    Stream a pg_dump file line-by-line.

    Supports common encodings we observed in practice:
    - UTF-8
    - UTF-16 (with BOM), which often shows up as 0xFF 0xFE at start
    """
    with path.open("rb") as bf:
        prefix = bf.read(4)
        bf.seek(0)

        # UTF-16 BOM: FF FE (LE) or FE FF (BE). Let Python handle endianness via "utf-16".
        if prefix.startswith(b"\xff\xfe") or prefix.startswith(b"\xfe\xff"):
            tf = io.TextIOWrapper(bf, encoding="utf-16", errors="surrogateescape", newline="")
        else:
            tf = io.TextIOWrapper(bf, encoding="utf-8", errors="surrogateescape", newline="")

        with tf:
            for line in tf:
                yield line


def extract_copy_blocks(dump_path: Path) -> list[CopyBlock]:
    blocks: list[CopyBlock] = []

    capturing = False
    current_lines: list[str] = []
    current_src_table: str | None = None
    current_header: str | None = None

    for line in iter_lines(dump_path):
        if not capturing:
            if not line.startswith("COPY "):
                continue

            # e.g. "COPY public.users (..cols..) FROM stdin;\n"
            parts = line.split()
            if len(parts) < 2:
                continue
            src_table = parts[1]
            if src_table not in TABLE_MAP:
                continue

            capturing = True
            current_src_table = src_table
            current_header = line
            current_lines = [line]
            continue

        # capturing
        current_lines.append(line)
        if line.strip() == r"\.":
            assert current_src_table is not None
            assert current_header is not None
            blocks.append(
                CopyBlock(
                    source_table=current_src_table,
                    target_table=TABLE_MAP[current_src_table],
                    header=current_header,
                    lines=current_lines,
                )
            )
            capturing = False
            current_lines = []
            current_src_table = None
            current_header = None

    return blocks


def rewrite_copy_header(header: str, target_table: str) -> str:
    # Replace "COPY public.foo" with "COPY stage_foo"
    # Keep column list and "FROM stdin;" as-is.
    # Example:
    #   COPY public.users (id, email, ...) FROM stdin;
    # ->COPY stage_users (id, email, ...) FROM stdin;
    parts = header.split(None, 2)
    if len(parts) < 3 or parts[0] != "COPY":
        raise ValueError(f"Unexpected COPY header: {header!r}")
    return f"COPY {target_table} {parts[2]}"


def main() -> None:
    dump_path = Path("dump.sql")
    out_path = Path("dump.redflow.import.sql")

    blocks = extract_copy_blocks(dump_path)
    by_src = {b.source_table: b for b in blocks}
    missing = [t for t in TABLE_MAP.keys() if t not in by_src]
    if missing:
        raise SystemExit(f"Missing COPY blocks in dump.sql: {', '.join(missing)}")

    sql: list[str] = []
    sql.append("-- Generated from dump.sql (Supabase pg_dump)\n")
    sql.append("-- Purpose: import messenger-relevant data into redflow schema\n\n")
    sql.append("begin;\n\n")

    sql.append("create temporary table stage_users (\n")
    # Some exports contain empty UUIDs as "", so keep as text for COPY robustness.
    sql.append("  id text,\n")
    sql.append("  email text,\n")
    sql.append("  phone text,\n")
    sql.append("  password_hash text,\n")
    sql.append("  display_name text,\n")
    sql.append("  avatar_url text,\n")
    sql.append("  status text,\n")
    sql.append("  is_email_verified boolean,\n")
    sql.append("  is_phone_verified boolean,\n")
    sql.append("  created_at timestamptz,\n")
    sql.append("  updated_at timestamptz,\n")
    sql.append("  last_login_at timestamptz,\n")
    sql.append("  room_ui_preferences jsonb,\n")
    sql.append("  profile_slug text,\n")
    sql.append("  profile_search_closed boolean,\n")
    sql.append("  profile_search_allow_by_name boolean,\n")
    sql.append("  profile_search_allow_by_email boolean,\n")
    sql.append("  profile_search_allow_by_slug boolean,\n")
    sql.append("  dm_allow_from text,\n")
    sql.append("  profile_view_allow_from text,\n")
    sql.append("  profile_show_avatar boolean,\n")
    sql.append("  profile_show_slug boolean,\n")
    sql.append("  profile_show_last_active boolean,\n")
    # In the original Supabase schema this field is not a Postgres uuid[] in our export
    # (it can appear as a JSON-like string "[]"). We don't import it into redflow,
    # so keep it as text to make COPY robust.
    sql.append("  messenger_pinned_conversation_ids text,\n")
    sql.append("  profile_dm_receipts_private boolean,\n")
    sql.append("  last_active_at timestamptz,\n")
    sql.append("  profile_show_online boolean,\n")
    sql.append("  presence_last_background_at timestamptz\n")
    sql.append(");\n\n")

    sql.append("create temporary table stage_chat_conversations (\n")
    sql.append("  id text,\n")
    sql.append("  kind text,\n")
    sql.append("  space_room_slug text,\n")
    sql.append("  title text,\n")
    sql.append("  created_by text,\n")
    sql.append("  created_at timestamptz,\n")
    sql.append("  closed_at timestamptz,\n")
    sql.append("  last_message_at timestamptz,\n")
    sql.append("  last_message_preview text,\n")
    sql.append("  message_count integer,\n")
    sql.append("  channel_posting_mode text,\n")
    sql.append("  channel_comments_mode text,\n")
    sql.append("  channel_is_public boolean,\n")
    sql.append("  group_is_public boolean,\n")
    sql.append("  public_nick text,\n")
    sql.append("  avatar_path text,\n")
    sql.append("  avatar_thumb_path text,\n")
    sql.append("  required_subscription_plan text\n")
    sql.append(");\n\n")

    sql.append("create temporary table stage_chat_conversation_members (\n")
    sql.append("  conversation_id text,\n")
    sql.append("  user_id text,\n")
    sql.append("  role text,\n")
    sql.append("  joined_at timestamptz,\n")
    sql.append("  last_read_at timestamptz\n")
    sql.append(");\n\n")

    sql.append("create temporary table stage_chat_messages (\n")
    sql.append("  id text,\n")
    sql.append("  conversation_id text,\n")
    sql.append("  sender_user_id text,\n")
    sql.append("  sender_peer_id text,\n")
    sql.append("  sender_name_snapshot text,\n")
    sql.append("  kind text,\n")
    sql.append("  body text,\n")
    sql.append("  created_at timestamptz,\n")
    sql.append("  meta jsonb,\n")
    sql.append("  reply_to_message_id text,\n")
    sql.append("  edited_at timestamptz,\n")
    sql.append("  quote_to_message_id text\n")
    sql.append(");\n\n")

    sql.append("create temporary table stage_chat_conversation_invites (\n")
    sql.append("  id text,\n")
    sql.append("  conversation_id text,\n")
    sql.append("  token text,\n")
    sql.append("  created_by text,\n")
    sql.append("  created_at timestamptz,\n")
    sql.append("  revoked_at timestamptz\n")
    sql.append(");\n\n")

    sql.append("-- Load staging data from pg_dump COPY blocks\n")
    for src_table, tgt_table in TABLE_MAP.items():
        block = by_src[src_table]
        rewritten = rewrite_copy_header(block.lines[0], tgt_table)
        sql.append(rewritten)
        for l in block.lines[1:]:
            # Some dumps contain stray empty rows inside COPY data.
            # COPY text format treats them as rows with missing columns -> hard error.
            s = l.strip()
            if s in ("", '""'):
                continue
            sql.append(l)
        sql.append("\n")

    sql.append("-- Import into redflow tables\n\n")

    # Users
    sql.append(
        """
insert into public.users (id, email, display_name, avatar_url, password_hash, created_at, updated_at)
select
  nullif(id, '')::uuid,
  email::citext,
  coalesce(nullif(display_name, ''), split_part(email, '@', 1), 'user') as display_name,
  avatar_url,
  password_hash,
  coalesce(created_at, now()) as created_at,
  coalesce(updated_at, created_at, now()) as updated_at
from stage_users
where nullif(id, '') is not null and email is not null and email <> ''
on conflict (id) do nothing;
"""
    )

    # Conversations: group/channel first
    sql.append(
        """
insert into public.chat_conversations (
  id,
  kind,
  title,
  is_public,
  public_nick,
  avatar_path,
  avatar_thumb_path,
  required_subscription_plan,
  posting_mode,
  comments_mode,
  created_at,
  updated_at
)
select
  nullif(id, '')::uuid,
  kind,
  title,
  case
    when kind = 'channel' then coalesce(channel_is_public, false)
    when kind = 'group' then coalesce(group_is_public, false)
    else false
  end as is_public,
  public_nick,
  avatar_path,
  avatar_thumb_path,
  required_subscription_plan,
  channel_posting_mode,
  channel_comments_mode,
  coalesce(created_at, now()) as created_at,
  coalesce(created_at, now()) as updated_at
from stage_chat_conversations
where nullif(id, '') is not null and kind in ('group','channel')
on conflict (id) do nothing;
"""
    )

    # Conversations: direct (derive direct_user_a/b from members)
    sql.append(
        """
insert into public.chat_conversations (
  id,
  kind,
  direct_user_a,
  direct_user_b,
  created_at,
  updated_at
)
select
  nullif(c.id, '')::uuid,
  'direct',
  least(m.user_a, m.user_b)::uuid as direct_user_a,
  greatest(m.user_a, m.user_b)::uuid as direct_user_b,
  coalesce(c.created_at, now()) as created_at,
  coalesce(c.created_at, now()) as updated_at
from stage_chat_conversations c
join (
  select
    nullif(conversation_id, '') as conversation_id,
    min(nullif(user_id, '')) as user_a,
    max(nullif(user_id, '')) as user_b,
    count(distinct nullif(user_id, '')) as cnt
  from stage_chat_conversation_members
  where nullif(conversation_id, '') is not null
  group by nullif(conversation_id, '')
) m on m.conversation_id = c.id
where nullif(c.id,'') is not null and c.kind = 'direct' and m.cnt = 2 and m.user_a is not null and m.user_b is not null and m.user_a <> m.user_b
on conflict (id) do nothing;
"""
    )

    # Members (only for conversations we actually imported)
    sql.append(
        """
insert into public.chat_conversation_members (
  conversation_id,
  user_id,
  role,
  last_read_at,
  created_at
)
select
  nullif(m.conversation_id,'')::uuid,
  nullif(m.user_id,'')::uuid,
  coalesce(nullif(m.role,''), 'member') as role,
  m.last_read_at,
  coalesce(m.joined_at, now()) as created_at
from stage_chat_conversation_members m
join public.chat_conversations c on c.id = nullif(m.conversation_id,'')::uuid
join public.users u on u.id = nullif(m.user_id,'')::uuid
where nullif(m.conversation_id,'') is not null and nullif(m.user_id,'') is not null
on conflict (conversation_id, user_id) do nothing;
"""
    )

    # Messages (filter kinds to what our schema allows)
    sql.append(
        """
insert into public.chat_messages (
  id,
  conversation_id,
  sender_user_id,
  kind,
  body,
  meta,
  created_at,
  edited_at,
  reply_to_message_id
)
select
  nullif(msg.id,'')::uuid,
  nullif(msg.conversation_id,'')::uuid,
  nullif(msg.sender_user_id,'')::uuid,
  msg.kind,
  coalesce(msg.body, '') as body,
  msg.meta,
  coalesce(msg.created_at, now()) as created_at,
  msg.edited_at,
  nullif(msg.reply_to_message_id,'')::uuid
from stage_chat_messages msg
join public.chat_conversations c on c.id = nullif(msg.conversation_id,'')::uuid
where nullif(msg.id,'') is not null
  and nullif(msg.conversation_id,'') is not null
  and msg.kind in ('text','image','audio','reaction','system')
on conflict (id) do nothing;
"""
    )

    # Invites -> conversation_invites (skip revoked)
    sql.append(
        """
insert into public.conversation_invites (token, conversation_id, created_by_user_id, created_at)
select
  i.token,
  nullif(i.conversation_id,'')::uuid,
  nullif(i.created_by,'')::uuid,
  coalesce(i.created_at, now()) as created_at
from stage_chat_conversation_invites i
join public.chat_conversations c on c.id = nullif(i.conversation_id,'')::uuid
where i.token is not null and i.token <> '' and i.revoked_at is null and nullif(i.conversation_id,'') is not null
on conflict (token) do nothing;
"""
    )

    sql.append("\ncommit;\n")

    out_path.write_text("".join(sql), encoding="utf-8")
    print(f"written {out_path}")


if __name__ == "__main__":
    main()

