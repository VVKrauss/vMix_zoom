from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CsvSource:
    path: Path
    stage_table: str
    copy_columns: list[str]


def read_text(path: Path) -> str:
    # CSV exported from Supabase is UTF-8 with standard quoting.
    # Preserve newlines exactly; Postgres COPY ... CSV can handle quoted newlines.
    return path.read_text(encoding="utf-8", errors="strict")


def copy_from_csv(stage_table: str, columns: list[str], csv_text: str) -> str:
    cols = ", ".join(columns)
    # Use COPY ... FROM stdin WITH CSV HEADER to accept the header row.
    # Terminate with \. for psql.
    return (
        f"COPY {stage_table} ({cols}) FROM stdin WITH (FORMAT csv, HEADER true);\n"
        + csv_text.rstrip("\n")
        + "\n\\.\n\n"
    )


def main() -> None:
    dump_dir = Path(r"c:\Users\kraus\Downloads\dump")

    sources: list[CsvSource] = [
        CsvSource(
            path=dump_dir / "users_rows.csv",
            stage_table="stage_users",
            copy_columns=[
                "id",
                "email",
                "phone",
                "password_hash",
                "display_name",
                "avatar_url",
                "status",
                "is_email_verified",
                "is_phone_verified",
                "created_at",
                "updated_at",
                "last_login_at",
                "room_ui_preferences",
                "profile_slug",
                "profile_search_closed",
                "profile_search_allow_by_name",
                "profile_search_allow_by_email",
                "profile_search_allow_by_slug",
                "dm_allow_from",
                "profile_view_allow_from",
                "profile_show_avatar",
                "profile_show_slug",
                "profile_show_last_active",
                "messenger_pinned_conversation_ids",
                "profile_dm_receipts_private",
                "last_active_at",
                "profile_show_online",
                "presence_last_background_at",
            ],
        ),
        CsvSource(
            path=dump_dir / "chat_conversations_rows.csv",
            stage_table="stage_chat_conversations",
            copy_columns=[
                "id",
                "kind",
                "space_room_slug",
                "title",
                "created_by",
                "created_at",
                "closed_at",
                "last_message_at",
                "last_message_preview",
                "message_count",
                "channel_posting_mode",
                "channel_comments_mode",
                "channel_is_public",
                "group_is_public",
                "public_nick",
                "avatar_path",
                "avatar_thumb_path",
                "required_subscription_plan",
            ],
        ),
        CsvSource(
            path=dump_dir / "chat_conversation_members_rows.csv",
            stage_table="stage_chat_conversation_members",
            copy_columns=["conversation_id", "user_id", "role", "joined_at", "last_read_at"],
        ),
        CsvSource(
            path=dump_dir / "chat_messages_rows.csv",
            stage_table="stage_chat_messages",
            copy_columns=[
                "id",
                "conversation_id",
                "sender_user_id",
                "sender_peer_id",
                "sender_name_snapshot",
                "kind",
                "body",
                "created_at",
                "meta",
                "reply_to_message_id",
                "edited_at",
                "quote_to_message_id",
            ],
        ),
        CsvSource(
            path=dump_dir / "chat_conversation_invites_rows.csv",
            stage_table="stage_chat_conversation_invites",
            copy_columns=["id", "conversation_id", "token", "created_by", "created_at", "revoked_at"],
        ),
    ]

    out_path = Path("dump.redflow.import.sql")

    sql: list[str] = []
    sql.append("-- Generated from Supabase CSV exports\n")
    sql.append("-- Purpose: import messenger-relevant data into redflow schema\n\n")
    sql.append("begin;\n\n")

    # Stage tables: keep everything as text to make COPY robust.
    sql.append("create temporary table stage_users (\n")
    sql.append("  id text,\n")
    sql.append("  email text,\n")
    sql.append("  phone text,\n")
    sql.append("  password_hash text,\n")
    sql.append("  display_name text,\n")
    sql.append("  avatar_url text,\n")
    sql.append("  status text,\n")
    sql.append("  is_email_verified text,\n")
    sql.append("  is_phone_verified text,\n")
    sql.append("  created_at text,\n")
    sql.append("  updated_at text,\n")
    sql.append("  last_login_at text,\n")
    sql.append("  room_ui_preferences text,\n")
    sql.append("  profile_slug text,\n")
    sql.append("  profile_search_closed text,\n")
    sql.append("  profile_search_allow_by_name text,\n")
    sql.append("  profile_search_allow_by_email text,\n")
    sql.append("  profile_search_allow_by_slug text,\n")
    sql.append("  dm_allow_from text,\n")
    sql.append("  profile_view_allow_from text,\n")
    sql.append("  profile_show_avatar text,\n")
    sql.append("  profile_show_slug text,\n")
    sql.append("  profile_show_last_active text,\n")
    sql.append("  messenger_pinned_conversation_ids text,\n")
    sql.append("  profile_dm_receipts_private text,\n")
    sql.append("  last_active_at text,\n")
    sql.append("  profile_show_online text,\n")
    sql.append("  presence_last_background_at text\n")
    sql.append(");\n\n")

    sql.append("create temporary table stage_chat_conversations (\n")
    sql.append("  id text,\n")
    sql.append("  kind text,\n")
    sql.append("  space_room_slug text,\n")
    sql.append("  title text,\n")
    sql.append("  created_by text,\n")
    sql.append("  created_at text,\n")
    sql.append("  closed_at text,\n")
    sql.append("  last_message_at text,\n")
    sql.append("  last_message_preview text,\n")
    sql.append("  message_count text,\n")
    sql.append("  channel_posting_mode text,\n")
    sql.append("  channel_comments_mode text,\n")
    sql.append("  channel_is_public text,\n")
    sql.append("  group_is_public text,\n")
    sql.append("  public_nick text,\n")
    sql.append("  avatar_path text,\n")
    sql.append("  avatar_thumb_path text,\n")
    sql.append("  required_subscription_plan text\n")
    sql.append(");\n\n")

    sql.append("create temporary table stage_chat_conversation_members (\n")
    sql.append("  conversation_id text,\n")
    sql.append("  user_id text,\n")
    sql.append("  role text,\n")
    sql.append("  joined_at text,\n")
    sql.append("  last_read_at text\n")
    sql.append(");\n\n")

    sql.append("create temporary table stage_chat_messages (\n")
    sql.append("  id text,\n")
    sql.append("  conversation_id text,\n")
    sql.append("  sender_user_id text,\n")
    sql.append("  sender_peer_id text,\n")
    sql.append("  sender_name_snapshot text,\n")
    sql.append("  kind text,\n")
    sql.append("  body text,\n")
    sql.append("  created_at text,\n")
    sql.append("  meta text,\n")
    sql.append("  reply_to_message_id text,\n")
    sql.append("  edited_at text,\n")
    sql.append("  quote_to_message_id text\n")
    sql.append(");\n\n")

    sql.append("create temporary table stage_chat_conversation_invites (\n")
    sql.append("  id text,\n")
    sql.append("  conversation_id text,\n")
    sql.append("  token text,\n")
    sql.append("  created_by text,\n")
    sql.append("  created_at text,\n")
    sql.append("  revoked_at text\n")
    sql.append(");\n\n")

    sql.append("-- Load staging data from CSVs\n\n")
    for s in sources:
        csv_text = read_text(s.path)
        sql.append(copy_from_csv(s.stage_table, s.copy_columns, csv_text))

    sql.append("-- Import into redflow tables\n\n")
    sql.append(
        """
insert into public.users (id, email, display_name, avatar_url, password_hash, created_at, updated_at)
select
  nullif(id, '')::uuid,
  nullif(email, '')::citext,
  coalesce(nullif(display_name, ''), split_part(email, '@', 1), 'user') as display_name,
  nullif(avatar_url, ''),
  nullif(password_hash, ''),
  coalesce(nullif(created_at,'')::timestamptz, now()) as created_at,
  coalesce(nullif(updated_at,'')::timestamptz, nullif(created_at,'')::timestamptz, now()) as updated_at
from stage_users
where nullif(id, '') is not null and nullif(email, '') is not null
on conflict (id) do nothing;
"""
    )

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
  nullif(id,'')::uuid,
  kind,
  nullif(title,''),
  case
    when kind = 'channel' then coalesce(nullif(channel_is_public,'')::boolean, false)
    when kind = 'group' then coalesce(nullif(group_is_public,'')::boolean, false)
    else false
  end as is_public,
  nullif(public_nick,''),
  nullif(avatar_path,''),
  nullif(avatar_thumb_path,''),
  nullif(required_subscription_plan,''),
  nullif(channel_posting_mode,''),
  nullif(channel_comments_mode,''),
  coalesce(nullif(created_at,'')::timestamptz, now()) as created_at,
  coalesce(nullif(created_at,'')::timestamptz, now()) as updated_at
from stage_chat_conversations
where nullif(id,'') is not null and kind in ('group','channel')
on conflict (id) do nothing;
"""
    )

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
  nullif(c.id,'')::uuid,
  'direct',
  least(m.user_a, m.user_b)::uuid as direct_user_a,
  greatest(m.user_a, m.user_b)::uuid as direct_user_b,
  coalesce(nullif(c.created_at,'')::timestamptz, now()) as created_at,
  coalesce(nullif(c.created_at,'')::timestamptz, now()) as updated_at
from stage_chat_conversations c
join (
  select
    nullif(conversation_id,'') as conversation_id,
    min(nullif(user_id,'')) as user_a,
    max(nullif(user_id,'')) as user_b,
    count(distinct nullif(user_id,'')) as cnt
  from stage_chat_conversation_members
  where nullif(conversation_id,'') is not null
  group by nullif(conversation_id,'')
) m on m.conversation_id = c.id
where nullif(c.id,'') is not null
  and c.kind = 'direct'
  and m.cnt = 2
  and m.user_a is not null and m.user_b is not null and m.user_a <> m.user_b
on conflict (id) do nothing;
"""
    )

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
  nullif(m.last_read_at,'')::timestamptz,
  coalesce(nullif(m.joined_at,'')::timestamptz, now()) as created_at
from stage_chat_conversation_members m
join public.chat_conversations c on c.id = nullif(m.conversation_id,'')::uuid
join public.users u on u.id = nullif(m.user_id,'')::uuid
where nullif(m.conversation_id,'') is not null and nullif(m.user_id,'') is not null
on conflict (conversation_id, user_id) do nothing;
"""
    )

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
  coalesce(nullif(msg.body,''), '') as body,
  case when nullif(msg.meta,'') is null then null else nullif(msg.meta,'')::jsonb end as meta,
  coalesce(nullif(msg.created_at,'')::timestamptz, now()) as created_at,
  nullif(msg.edited_at,'')::timestamptz,
  nullif(msg.reply_to_message_id,'')::uuid
from stage_chat_messages msg
join public.chat_conversations c on c.id = nullif(msg.conversation_id,'')::uuid
where nullif(msg.id,'') is not null
  and nullif(msg.conversation_id,'') is not null
  and msg.kind in ('text','image','audio','reaction','system')
on conflict (id) do nothing;
"""
    )

    sql.append(
        """
insert into public.conversation_invites (token, conversation_id, created_by_user_id, created_at)
select
  nullif(i.token,''),
  nullif(i.conversation_id,'')::uuid,
  nullif(i.created_by,'')::uuid,
  coalesce(nullif(i.created_at,'')::timestamptz, now()) as created_at
from stage_chat_conversation_invites i
join public.chat_conversations c on c.id = nullif(i.conversation_id,'')::uuid
where nullif(i.token,'') is not null
  and i.revoked_at is null
  and nullif(i.conversation_id,'') is not null
on conflict (token) do nothing;
"""
    )

    sql.append("\ncommit;\n")

    out_path.write_text("".join(sql), encoding="utf-8", newline="\n")
    print(f"written {out_path}")


if __name__ == "__main__":
    main()

