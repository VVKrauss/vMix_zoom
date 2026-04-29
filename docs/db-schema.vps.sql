--
-- PostgreSQL database dump
--

\restrict y9OUHR9p18LeA8eHBfVf5mqysmaDdA6yrkCareF9FJG85dqZFtB9elWiaRQR8mY

-- Dumped from database version 17.6 (Debian 17.6-2.pgdg13+1)
-- Dumped by pg_dump version 17.6 (Debian 17.6-2.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY "public"."direct_conversation_pairs" DROP CONSTRAINT IF EXISTS "direct_conversation_pairs_user_b_fkey";
ALTER TABLE IF EXISTS ONLY "public"."direct_conversation_pairs" DROP CONSTRAINT IF EXISTS "direct_conversation_pairs_user_a_fkey";
ALTER TABLE IF EXISTS ONLY "public"."direct_conversation_pairs" DROP CONSTRAINT IF EXISTS "direct_conversation_pairs_conversation_id_fkey";
DROP TRIGGER IF EXISTS "tg_users_mirror_presence_public" ON "public"."users";
DROP TRIGGER IF EXISTS "app_realtime__user_presence_public__update" ON "public"."user_presence_public";
DROP TRIGGER IF EXISTS "app_realtime__user_presence_public__insert" ON "public"."user_presence_public";
DROP TRIGGER IF EXISTS "app_realtime__user_presence_public__delete" ON "public"."user_presence_public";
DROP TRIGGER IF EXISTS "app_realtime__chat_messages__update" ON "public"."chat_messages";
DROP TRIGGER IF EXISTS "app_realtime__chat_messages__insert" ON "public"."chat_messages";
DROP TRIGGER IF EXISTS "app_realtime__chat_messages__delete" ON "public"."chat_messages";
DROP TRIGGER IF EXISTS "app_realtime__chat_message_mentions__update" ON "public"."chat_message_mentions";
DROP TRIGGER IF EXISTS "app_realtime__chat_message_mentions__insert" ON "public"."chat_message_mentions";
DROP TRIGGER IF EXISTS "app_realtime__chat_conversation_members__update" ON "public"."chat_conversation_members";
DROP TRIGGER IF EXISTS "app_realtime__chat_conversation_members__delete" ON "public"."chat_conversation_members";
DROP INDEX IF EXISTS "public"."users_id_uq";
DROP INDEX IF EXISTS "public"."chat_conversations_id_uq";
DROP INDEX IF EXISTS "public"."chat_conversation_members_user_idx";
ALTER TABLE IF EXISTS ONLY "public"."user_presence_public" DROP CONSTRAINT IF EXISTS "user_presence_public_pkey";
ALTER TABLE IF EXISTS ONLY "public"."direct_conversation_pairs" DROP CONSTRAINT IF EXISTS "direct_conversation_pairs_pkey";
ALTER TABLE IF EXISTS ONLY "public"."direct_conversation_pairs" DROP CONSTRAINT IF EXISTS "direct_conversation_pairs_conversation_id_key";
ALTER TABLE IF EXISTS ONLY "public"."chat_conversation_members" DROP CONSTRAINT IF EXISTS "chat_conversation_members_pk";
DROP TABLE IF EXISTS "public"."users";
DROP TABLE IF EXISTS "public"."user_presence_public";
DROP TABLE IF EXISTS "public"."user_global_roles";
DROP TABLE IF EXISTS "public"."user_favorites";
DROP TABLE IF EXISTS "public"."user_contact_list_hides";
DROP TABLE IF EXISTS "public"."user_blocks";
DROP TABLE IF EXISTS "public"."subscription_plans";
DROP TABLE IF EXISTS "public"."space_rooms";
DROP TABLE IF EXISTS "public"."site_news";
DROP TABLE IF EXISTS "public"."rooms";
DROP TABLE IF EXISTS "public"."room_role_assignments";
DROP TABLE IF EXISTS "public"."room_members";
DROP TABLE IF EXISTS "public"."roles";
DROP TABLE IF EXISTS "public"."role_permissions";
DROP TABLE IF EXISTS "public"."refresh_sessions";
DROP TABLE IF EXISTS "public"."push_subscriptions";
DROP TABLE IF EXISTS "public"."plan_entitlements";
DROP TABLE IF EXISTS "public"."permissions";
DROP TABLE IF EXISTS "public"."moderation_actions";
DROP TABLE IF EXISTS "public"."live_sessions";
DROP TABLE IF EXISTS "public"."live_session_participants";
DROP TABLE IF EXISTS "public"."join_tokens";
DROP TABLE IF EXISTS "public"."guests";
DROP TABLE IF EXISTS "public"."events";
DROP TABLE IF EXISTS "public"."event_registrations";
DROP TABLE IF EXISTS "public"."direct_conversation_pairs";
DROP TABLE IF EXISTS "public"."contact_aliases";
DROP TABLE IF EXISTS "public"."chat_messages_live_session";
DROP TABLE IF EXISTS "public"."chat_messages";
DROP TABLE IF EXISTS "public"."chat_message_mentions";
DROP TABLE IF EXISTS "public"."chat_conversations";
DROP TABLE IF EXISTS "public"."chat_conversation_notification_mutes";
DROP TABLE IF EXISTS "public"."chat_conversation_members";
DROP TABLE IF EXISTS "public"."chat_conversation_join_requests";
DROP TABLE IF EXISTS "public"."chat_conversation_invites";
DROP TABLE IF EXISTS "public"."auth_identities";
DROP TABLE IF EXISTS "public"."audit_logs";
DROP TABLE IF EXISTS "public"."app_version";
DROP TABLE IF EXISTS "public"."accounts";
DROP TABLE IF EXISTS "public"."account_usage_counters";
DROP TABLE IF EXISTS "public"."account_subscriptions";
DROP TABLE IF EXISTS "public"."account_role_assignments";
DROP TABLE IF EXISTS "public"."account_members";
DROP TABLE IF EXISTS "public"."account_entitlement_overrides";
DROP TABLE IF EXISTS "public"."access_invites";
DROP FUNCTION IF EXISTS "public"."tg_mirror_user_presence_public"();
DROP FUNCTION IF EXISTS "app_realtime"."notify_db_change"();
DROP EXTENSION IF EXISTS "uuid-ossp";
DROP EXTENSION IF EXISTS "pgcrypto";
DROP SCHEMA IF EXISTS "app_realtime";
--
-- Name: app_realtime; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "app_realtime";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "public";


--
-- Name: EXTENSION "pgcrypto"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "pgcrypto" IS 'cryptographic functions';


--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "public";


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: notify_db_change(); Type: FUNCTION; Schema: app_realtime; Owner: -
--

CREATE FUNCTION "app_realtime"."notify_db_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
    $$;


--
-- Name: tg_mirror_user_presence_public(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION "public"."tg_mirror_user_presence_public"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.user_presence_public (
    user_id,
    last_active_at,
    presence_last_background_at,
    profile_show_online,
    updated_at
  )
  values (
    new.id,
    new.last_active_at,
    new.presence_last_background_at,
    coalesce(new.profile_show_online, true),
    now()
  )
  on conflict (user_id) do update set
    last_active_at = excluded.last_active_at,
    presence_last_background_at = excluded.presence_last_background_at,
    profile_show_online = excluded.profile_show_online,
    updated_at = excluded.updated_at;
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: access_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."access_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid",
    "event_id" "uuid",
    "created_by_user_id" "uuid" NOT NULL,
    "invite_code" "text" NOT NULL,
    "invite_type" "text" NOT NULL,
    "role_hint" "text",
    "max_uses" integer,
    "used_count" integer DEFAULT 0 NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "access_invites_invite_type_check" CHECK (("invite_type" = ANY (ARRAY['guest'::"text", 'member'::"text", 'speaker'::"text", 'backstage'::"text", 'listener'::"text"])))
);


--
-- Name: account_entitlement_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."account_entitlement_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "value_type" "text" NOT NULL,
    "bool_value" boolean,
    "int_value" integer,
    "string_value" "text",
    "json_value" "jsonb",
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "account_entitlement_overrides_value_type_check" CHECK (("value_type" = ANY (ARRAY['boolean'::"text", 'integer'::"text", 'string'::"text", 'json'::"text"])))
);


--
-- Name: account_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."account_members" (
    "account_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "membership_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invited_by_user_id" "uuid",
    CONSTRAINT "account_members_membership_status_check" CHECK (("membership_status" = ANY (ARRAY['active'::"text", 'invited'::"text", 'removed'::"text"])))
);


--
-- Name: account_role_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."account_role_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "assigned_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: account_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."account_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "billing_period" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_period_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_period_end" timestamp with time zone NOT NULL,
    "canceled_at" timestamp with time zone,
    "trial_ends_at" timestamp with time zone,
    "external_provider" "text",
    "external_subscription_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "account_subscriptions_billing_period_check" CHECK (("billing_period" = ANY (ARRAY['monthly'::"text", 'yearly'::"text", 'custom'::"text"]))),
    CONSTRAINT "account_subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'expired'::"text"])))
);


--
-- Name: account_usage_counters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."account_usage_counters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "metric_code" "text" NOT NULL,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "value" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "account_type" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "accounts_account_type_check" CHECK (("account_type" = ANY (ARRAY['personal'::"text", 'team'::"text", 'studio'::"text", 'tutor'::"text"]))),
    CONSTRAINT "accounts_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'suspended'::"text", 'closed'::"text"])))
);


--
-- Name: app_version; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."app_version" (
    "id" boolean DEFAULT true NOT NULL,
    "major" integer DEFAULT 0 NOT NULL,
    "minor" integer DEFAULT 1 NOT NULL,
    "patch" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_version_nonnegative" CHECK ((("major" >= 0) AND ("minor" >= 0) AND ("patch" >= 0))),
    CONSTRAINT "app_version_singleton" CHECK (("id" = true))
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_user_id" "uuid",
    "actor_guest_id" "uuid",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid",
    "action" "text" NOT NULL,
    "old_data" "jsonb",
    "new_data" "jsonb",
    "ip" "inet",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: auth_identities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."auth_identities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_user_id" "text",
    "provider_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    CONSTRAINT "auth_identities_provider_check" CHECK (("provider" = ANY (ARRAY['password'::"text", 'google'::"text", 'apple'::"text", 'magic_link'::"text"])))
);


--
-- Name: chat_conversation_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_conversation_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone
);


--
-- Name: chat_conversation_join_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_conversation_join_requests" (
    "request_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: chat_conversation_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_conversation_members" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_read_at" timestamp with time zone,
    CONSTRAINT "chat_conversation_members_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'owner'::"text", 'moderator'::"text", 'admin'::"text"])))
);


--
-- Name: chat_conversation_notification_mutes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_conversation_notification_mutes" (
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "muted" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: chat_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "space_room_slug" "text",
    "title" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "closed_at" timestamp with time zone,
    "last_message_at" timestamp with time zone,
    "last_message_preview" "text",
    "message_count" integer DEFAULT 0 NOT NULL,
    "channel_posting_mode" "text",
    "channel_comments_mode" "text",
    "channel_is_public" boolean DEFAULT false NOT NULL,
    "group_is_public" boolean DEFAULT false NOT NULL,
    "public_nick" "text",
    "avatar_path" "text",
    "avatar_thumb_path" "text",
    "required_subscription_plan" "text",
    CONSTRAINT "chat_conversations_channel_comments_mode_check" CHECK (("channel_comments_mode" = ANY (ARRAY['everyone'::"text", 'disabled'::"text"]))),
    CONSTRAINT "chat_conversations_channel_posting_mode_check" CHECK (("channel_posting_mode" = ANY (ARRAY['admins_only'::"text", 'everyone'::"text"]))),
    CONSTRAINT "chat_conversations_kind_check" CHECK (("kind" = ANY (ARRAY['room'::"text", 'direct'::"text", 'group'::"text", 'channel'::"text"]))),
    CONSTRAINT "chat_conversations_public_nick_format_check" CHECK ((("public_nick" IS NULL) OR ("public_nick" ~ '^[a-z0-9_]{3,32}$'::"text")))
);


--
-- Name: chat_message_mentions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_message_mentions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "message_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "read_at" timestamp with time zone
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_user_id" "uuid",
    "sender_peer_id" "text",
    "sender_name_snapshot" "text" NOT NULL,
    "kind" "text" DEFAULT 'text'::"text" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reply_to_message_id" "uuid",
    "edited_at" timestamp with time zone,
    "quote_to_message_id" "uuid",
    CONSTRAINT "chat_messages_body_len_check" CHECK (("char_length"("body") <= 4000)),
    CONSTRAINT "chat_messages_kind_check" CHECK (("kind" = ANY (ARRAY['text'::"text", 'system'::"text", 'reaction'::"text", 'image'::"text", 'audio'::"text"])))
);

ALTER TABLE ONLY "public"."chat_messages" REPLICA IDENTITY FULL;


--
-- Name: chat_messages_live_session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_messages_live_session" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "live_session_id" "uuid" NOT NULL,
    "participant_id" "uuid" NOT NULL,
    "message_type" "text" NOT NULL,
    "body" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chat_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'system'::"text", 'reaction'::"text"])))
);


--
-- Name: contact_aliases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."contact_aliases" (
    "owner_user_id" "uuid" NOT NULL,
    "contact_user_id" "uuid" NOT NULL,
    "alias" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "display_avatar_url" "text",
    CONSTRAINT "contact_aliases_has_display" CHECK (((("alias" IS NOT NULL) AND (("char_length"("btrim"("alias")) >= 1) AND ("char_length"("btrim"("alias")) <= 64))) OR (("display_avatar_url" IS NOT NULL) AND (("char_length"("btrim"("display_avatar_url")) >= 1) AND ("char_length"("btrim"("display_avatar_url")) <= 2048)))))
);


--
-- Name: direct_conversation_pairs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."direct_conversation_pairs" (
    "user_a" "uuid" NOT NULL,
    "user_b" "uuid" NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "direct_conversation_pairs_not_self" CHECK (("user_a" <> "user_b")),
    CONSTRAINT "direct_conversation_pairs_order" CHECK (("user_a" < "user_b"))
);


--
-- Name: event_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."event_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "guest_id" "uuid",
    "registration_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_event_registration_identity" CHECK ((("user_id" IS NOT NULL) OR ("guest_id" IS NOT NULL))),
    CONSTRAINT "event_registrations_registration_type_check" CHECK (("registration_type" = ANY (ARRAY['audience'::"text", 'speaker'::"text", 'backstage'::"text"]))),
    CONSTRAINT "event_registrations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'canceled'::"text"])))
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "event_type" "text" NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "visibility" "text" DEFAULT 'unlisted'::"text" NOT NULL,
    "access_mode" "text" DEFAULT 'open'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "events_access_mode_check" CHECK (("access_mode" = ANY (ARRAY['open'::"text", 'invite_only'::"text", 'request_only'::"text", 'password'::"text"]))),
    CONSTRAINT "events_event_type_check" CHECK (("event_type" = ANY (ARRAY['meeting'::"text", 'rehearsal'::"text", 'lesson'::"text", 'livestream'::"text"]))),
    CONSTRAINT "events_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'scheduled'::"text", 'live'::"text", 'ended'::"text", 'canceled'::"text"]))),
    CONSTRAINT "events_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'unlisted'::"text", 'public'::"text"])))
);


--
-- Name: guests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."guests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "guest_name" "text" NOT NULL,
    "access_code" "text",
    "created_by_user_id" "uuid",
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: join_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."join_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "live_session_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "guest_id" "uuid",
    "token_hash" "text" NOT NULL,
    "scope" "text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "join_tokens_scope_check" CHECK (("scope" = ANY (ARRAY['join'::"text", 'publish'::"text", 'subscribe'::"text", 'backstage'::"text"])))
);


--
-- Name: live_session_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."live_session_participants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "live_session_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "guest_id" "uuid",
    "identity_type" "text" NOT NULL,
    "access_role" "text" NOT NULL,
    "chat_policy" "text" DEFAULT 'enabled'::"text" NOT NULL,
    "media_publish_policy" "text" DEFAULT 'allowed'::"text" NOT NULL,
    "backstage_access" boolean DEFAULT false NOT NULL,
    "participant_name" "text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "left_at" timestamp with time zone,
    "connection_status" "text" DEFAULT 'connecting'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "live_session_participants_access_role_check" CHECK (("access_role" = ANY (ARRAY['host'::"text", 'co_host'::"text", 'speaker'::"text", 'participant'::"text", 'registered_listener'::"text", 'anonymous_listener'::"text"]))),
    CONSTRAINT "live_session_participants_chat_policy_check" CHECK (("chat_policy" = ANY (ARRAY['enabled'::"text", 'read_only'::"text", 'disabled'::"text"]))),
    CONSTRAINT "live_session_participants_connection_status_check" CHECK (("connection_status" = ANY (ARRAY['connecting'::"text", 'active'::"text", 'dropped'::"text", 'left'::"text"]))),
    CONSTRAINT "live_session_participants_identity_type_check" CHECK (("identity_type" = ANY (ARRAY['user'::"text", 'guest'::"text", 'service'::"text"]))),
    CONSTRAINT "live_session_participants_media_publish_policy_check" CHECK (("media_publish_policy" = ANY (ARRAY['allowed'::"text", 'on_request'::"text", 'disabled'::"text"])))
);


--
-- Name: live_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."live_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "session_type" "text" NOT NULL,
    "status" "text" DEFAULT 'preparing'::"text" NOT NULL,
    "started_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_by_user_id" "uuid" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "live_sessions_session_type_check" CHECK (("session_type" = ANY (ARRAY['call'::"text", 'team'::"text", 'tutor'::"text", 'stream'::"text"]))),
    CONSTRAINT "live_sessions_status_check" CHECK (("status" = ANY (ARRAY['preparing'::"text", 'live'::"text", 'paused'::"text", 'ended'::"text"])))
);


--
-- Name: moderation_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."moderation_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "live_session_id" "uuid",
    "room_id" "uuid",
    "target_user_id" "uuid",
    "target_guest_id" "uuid",
    "action_type" "text" NOT NULL,
    "reason" "text",
    "created_by_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "moderation_actions_action_type_check" CHECK (("action_type" = ANY (ARRAY['mute'::"text", 'unmute'::"text", 'kick'::"text", 'ban'::"text", 'warning'::"text"])))
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."permissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "description" "text"
);


--
-- Name: plan_entitlements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."plan_entitlements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "value_type" "text" NOT NULL,
    "bool_value" boolean,
    "int_value" integer,
    "string_value" "text",
    "json_value" "jsonb",
    CONSTRAINT "plan_entitlements_value_type_check" CHECK (("value_type" = ANY (ARRAY['boolean'::"text", 'integer'::"text", 'string'::"text", 'json'::"text"])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "endpoint" "text" NOT NULL,
    "subscription" "jsonb" NOT NULL,
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: refresh_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."refresh_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "refresh_token_hash" "text" NOT NULL,
    "user_agent" "text",
    "ip" "inet",
    "device_label" "text",
    "expires_at" timestamp with time zone NOT NULL,
    "revoked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."role_permissions" (
    "role_id" "uuid" NOT NULL,
    "permission_id" "uuid" NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "scope_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    CONSTRAINT "roles_scope_type_check" CHECK (("scope_type" = ANY (ARRAY['global'::"text", 'account'::"text", 'room'::"text", 'session'::"text"])))
);


--
-- Name: room_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."room_members" (
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "membership_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invited_by_user_id" "uuid",
    CONSTRAINT "room_members_membership_status_check" CHECK (("membership_status" = ANY (ARRAY['active'::"text", 'invited'::"text", 'removed'::"text"])))
);


--
-- Name: room_role_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."room_role_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "room_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "assigned_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."rooms" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "slug" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "owner_user_id" "uuid" NOT NULL,
    "room_type" "text" NOT NULL,
    "visibility" "text" DEFAULT 'unlisted'::"text" NOT NULL,
    "access_mode" "text" DEFAULT 'open'::"text" NOT NULL,
    "password_hash" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rooms_access_mode_check" CHECK (("access_mode" = ANY (ARRAY['open'::"text", 'invite_only'::"text", 'request_only'::"text", 'password'::"text"]))),
    CONSTRAINT "rooms_room_type_check" CHECK (("room_type" = ANY (ARRAY['call'::"text", 'team'::"text", 'tutor'::"text", 'stream'::"text"]))),
    CONSTRAINT "rooms_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text", 'deleted'::"text"]))),
    CONSTRAINT "rooms_visibility_check" CHECK (("visibility" = ANY (ARRAY['private'::"text", 'unlisted'::"text", 'public'::"text"])))
);


--
-- Name: site_news; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."site_news" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "published_at" "date" DEFAULT ("timezone"('utc'::"text", "now"()))::"date" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: space_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."space_rooms" (
    "slug" "text" NOT NULL,
    "host_user_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "retain_instance" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "access_mode" "text" DEFAULT 'link'::"text" NOT NULL,
    "chat_visibility" "text" DEFAULT 'everyone'::"text" NOT NULL,
    "banned_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "approved_joiners" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "display_name" "text",
    "avatar_url" "text",
    "guest_policy" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "require_creator_host_for_join" boolean DEFAULT false NOT NULL,
    "room_admin_user_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "cumulative_open_seconds" bigint DEFAULT 0 NOT NULL,
    "open_session_started_at" timestamp with time zone,
    CONSTRAINT "space_rooms_access_mode_check" CHECK (("access_mode" = ANY (ARRAY['link'::"text", 'approval'::"text", 'invite_only'::"text"]))),
    CONSTRAINT "space_rooms_avatar_url_len" CHECK ((("avatar_url" IS NULL) OR ("char_length"("avatar_url") <= 2048))),
    CONSTRAINT "space_rooms_chat_visibility_check" CHECK (("chat_visibility" = ANY (ARRAY['everyone'::"text", 'authenticated_only'::"text", 'staff_only'::"text", 'closed'::"text"]))),
    CONSTRAINT "space_rooms_display_name_len" CHECK ((("display_name" IS NULL) OR ("char_length"("display_name") <= 160))),
    CONSTRAINT "space_rooms_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'closed'::"text"])))
);


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."subscription_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "title" "text" NOT NULL,
    "product_family" "text" NOT NULL,
    "tier_code" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "monthly_price" numeric(12,2),
    "yearly_price" numeric(12,2),
    "currency" "text" DEFAULT 'EUR'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "subscription_plans_product_family_check" CHECK (("product_family" = ANY (ARRAY['meetings'::"text", 'tutor'::"text", 'stream'::"text"]))),
    CONSTRAINT "subscription_plans_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'archived'::"text"])))
);


--
-- Name: user_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_blocks" (
    "blocker_user_id" "uuid" NOT NULL,
    "blocked_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_blocks_not_self" CHECK (("blocker_user_id" <> "blocked_user_id"))
);


--
-- Name: user_contact_list_hides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_contact_list_hides" (
    "owner_user_id" "uuid" NOT NULL,
    "hidden_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_contact_list_hides_not_self" CHECK (("owner_user_id" <> "hidden_user_id"))
);


--
-- Name: user_favorites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_favorites" (
    "user_id" "uuid" NOT NULL,
    "favorite_user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "user_favorites_not_self" CHECK (("user_id" <> "favorite_user_id"))
);


--
-- Name: user_global_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_global_roles" (
    "user_id" "uuid" NOT NULL,
    "role_id" "uuid" NOT NULL,
    "assigned_by_user_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_presence_public; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_presence_public" (
    "user_id" "uuid" NOT NULL,
    "last_active_at" timestamp with time zone,
    "presence_last_background_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "profile_show_online" boolean DEFAULT true NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "phone" "text",
    "password_hash" "text",
    "display_name" "text" NOT NULL,
    "avatar_url" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "is_email_verified" boolean DEFAULT false NOT NULL,
    "is_phone_verified" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_login_at" timestamp with time zone,
    "room_ui_preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "profile_slug" "text",
    "profile_search_closed" boolean DEFAULT false NOT NULL,
    "profile_search_allow_by_name" boolean DEFAULT false NOT NULL,
    "profile_search_allow_by_email" boolean DEFAULT true NOT NULL,
    "profile_search_allow_by_slug" boolean DEFAULT false NOT NULL,
    "dm_allow_from" "text" DEFAULT 'everyone'::"text" NOT NULL,
    "profile_view_allow_from" "text" DEFAULT 'everyone'::"text" NOT NULL,
    "profile_show_avatar" boolean DEFAULT true NOT NULL,
    "profile_show_slug" boolean DEFAULT true NOT NULL,
    "profile_show_last_active" boolean DEFAULT true NOT NULL,
    "messenger_pinned_conversation_ids" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "profile_dm_receipts_private" boolean DEFAULT false NOT NULL,
    "last_active_at" timestamp with time zone,
    "profile_show_online" boolean DEFAULT true NOT NULL,
    "presence_last_background_at" timestamp with time zone,
    CONSTRAINT "users_dm_allow_from_check" CHECK (("dm_allow_from" = ANY (ARRAY['everyone'::"text", 'contacts_only'::"text"]))),
    CONSTRAINT "users_profile_view_allow_from_check" CHECK (("profile_view_allow_from" = ANY (ARRAY['everyone'::"text", 'contacts_only'::"text"]))),
    CONSTRAINT "users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'blocked'::"text", 'pending'::"text", 'deleted'::"text"])))
);


--
-- Name: chat_conversation_members chat_conversation_members_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_conversation_members"
    ADD CONSTRAINT "chat_conversation_members_pk" PRIMARY KEY ("conversation_id", "user_id");


--
-- Name: direct_conversation_pairs direct_conversation_pairs_conversation_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."direct_conversation_pairs"
    ADD CONSTRAINT "direct_conversation_pairs_conversation_id_key" UNIQUE ("conversation_id");


--
-- Name: direct_conversation_pairs direct_conversation_pairs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."direct_conversation_pairs"
    ADD CONSTRAINT "direct_conversation_pairs_pkey" PRIMARY KEY ("user_a", "user_b");


--
-- Name: user_presence_public user_presence_public_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_presence_public"
    ADD CONSTRAINT "user_presence_public_pkey" PRIMARY KEY ("user_id");


--
-- Name: chat_conversation_members_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chat_conversation_members_user_idx" ON "public"."chat_conversation_members" USING "btree" ("user_id");


--
-- Name: chat_conversations_id_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "chat_conversations_id_uq" ON "public"."chat_conversations" USING "btree" ("id");


--
-- Name: users_id_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "users_id_uq" ON "public"."users" USING "btree" ("id");


--
-- Name: chat_conversation_members app_realtime__chat_conversation_members__delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "app_realtime__chat_conversation_members__delete" AFTER DELETE ON "public"."chat_conversation_members" FOR EACH ROW EXECUTE FUNCTION "app_realtime"."notify_db_change"();


--
-- Name: chat_conversation_members app_realtime__chat_conversation_members__update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "app_realtime__chat_conversation_members__update" AFTER UPDATE ON "public"."chat_conversation_members" FOR EACH ROW EXECUTE FUNCTION "app_realtime"."notify_db_change"();


--
-- Name: chat_message_mentions app_realtime__chat_message_mentions__insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "app_realtime__chat_message_mentions__insert" AFTER INSERT ON "public"."chat_message_mentions" FOR EACH ROW EXECUTE FUNCTION "app_realtime"."notify_db_change"();


--
-- Name: chat_message_mentions app_realtime__chat_message_mentions__update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "app_realtime__chat_message_mentions__update" AFTER UPDATE ON "public"."chat_message_mentions" FOR EACH ROW EXECUTE FUNCTION "app_realtime"."notify_db_change"();


--
-- Name: chat_messages app_realtime__chat_messages__delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "app_realtime__chat_messages__delete" AFTER DELETE ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "app_realtime"."notify_db_change"();


--
-- Name: chat_messages app_realtime__chat_messages__insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "app_realtime__chat_messages__insert" AFTER INSERT ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "app_realtime"."notify_db_change"();


--
-- Name: chat_messages app_realtime__chat_messages__update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "app_realtime__chat_messages__update" AFTER UPDATE ON "public"."chat_messages" FOR EACH ROW EXECUTE FUNCTION "app_realtime"."notify_db_change"();


--
-- Name: user_presence_public app_realtime__user_presence_public__delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "app_realtime__user_presence_public__delete" AFTER DELETE ON "public"."user_presence_public" FOR EACH ROW EXECUTE FUNCTION "app_realtime"."notify_db_change"();


--
-- Name: user_presence_public app_realtime__user_presence_public__insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "app_realtime__user_presence_public__insert" AFTER INSERT ON "public"."user_presence_public" FOR EACH ROW EXECUTE FUNCTION "app_realtime"."notify_db_change"();


--
-- Name: user_presence_public app_realtime__user_presence_public__update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "app_realtime__user_presence_public__update" AFTER UPDATE ON "public"."user_presence_public" FOR EACH ROW EXECUTE FUNCTION "app_realtime"."notify_db_change"();


--
-- Name: users tg_users_mirror_presence_public; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER "tg_users_mirror_presence_public" AFTER INSERT OR UPDATE OF "last_active_at", "presence_last_background_at", "profile_show_online" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."tg_mirror_user_presence_public"();


--
-- Name: direct_conversation_pairs direct_conversation_pairs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."direct_conversation_pairs"
    ADD CONSTRAINT "direct_conversation_pairs_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE CASCADE;


--
-- Name: direct_conversation_pairs direct_conversation_pairs_user_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."direct_conversation_pairs"
    ADD CONSTRAINT "direct_conversation_pairs_user_a_fkey" FOREIGN KEY ("user_a") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: direct_conversation_pairs direct_conversation_pairs_user_b_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."direct_conversation_pairs"
    ADD CONSTRAINT "direct_conversation_pairs_user_b_fkey" FOREIGN KEY ("user_b") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict y9OUHR9p18LeA8eHBfVf5mqysmaDdA6yrkCareF9FJG85dqZFtB9elWiaRQR8mY

