-- Supabase Cloud to Docker PostgreSQL Migration
-- Generated: 2025-01-19
-- Project: Host Club Management System

-- ===========================================================================
-- EXTENSIONS
-- ===========================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===========================================================================
-- SCHEMA: public
-- ===========================================================================

-- ===========================================================================
-- TABLES
-- ===========================================================================

-- Table: staffs
CREATE TABLE public.staffs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    staff_id character varying NOT NULL,
    display_name character varying NOT NULL,
    email character varying NOT NULL,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT staffs_pkey PRIMARY KEY (id),
    CONSTRAINT staffs_staff_id_key UNIQUE (staff_id),
    CONSTRAINT staffs_email_key UNIQUE (email)
);

-- Table: stores
CREATE TABLE public.stores (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    store_id text NOT NULL,
    base_fee integer DEFAULT 0 NOT NULL,
    guarantee_count integer DEFAULT 0 NOT NULL,
    under_guarantee_penalty integer DEFAULT 0 NOT NULL,
    charge_per_person integer DEFAULT 0 NOT NULL,
    exclude_tax boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    hoshos_url text,
    store_phone text,
    open_time time without time zone,
    close_time time without time zone,
    id_required text,
    male_price integer DEFAULT 0,
    panel_fee integer DEFAULT 0,
    is_transfer boolean DEFAULT false,
    outstaff_accessible boolean DEFAULT true,
    first_request_limit integer DEFAULT 0 NOT NULL,
    billing_address text,
    visit_restriction character varying DEFAULT '20歳以上',
    CONSTRAINT stores_pkey PRIMARY KEY (id),
    CONSTRAINT stores_store_id_key UNIQUE (store_id)
);

-- Table: staff_logs
CREATE TABLE public.staff_logs (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    store_id text NOT NULL,
    staff_name text NOT NULL,
    guest_count integer DEFAULT 1 NOT NULL,
    guided_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    staff_type character varying DEFAULT 'staff',
    store_was_recommended boolean DEFAULT false,
    CONSTRAINT staff_logs_pkey PRIMARY KEY (id)
);

-- Table: store_holidays
CREATE TABLE public.store_holidays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_id text NOT NULL,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT store_holidays_pkey PRIMARY KEY (id)
);

-- Table: outstaff_store_recommendations
CREATE TABLE public.outstaff_store_recommendations (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    store_id text NOT NULL,
    is_recommended boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    updated_by uuid,
    CONSTRAINT outstaff_store_recommendations_pkey PRIMARY KEY (id),
    CONSTRAINT outstaff_store_recommendations_store_id_key UNIQUE (store_id)
);

-- Table: staff_targets
CREATE TABLE public.staff_targets (
    id integer NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    target_count integer DEFAULT 100 NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT staff_targets_pkey PRIMARY KEY (id)
);

-- Create sequence for staff_targets
CREATE SEQUENCE public.staff_targets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.staff_targets_id_seq OWNED BY public.staff_targets.id;
ALTER TABLE ONLY public.staff_targets ALTER COLUMN id SET DEFAULT nextval('public.staff_targets_id_seq'::regclass);

-- Table: staff_chats
CREATE TABLE public.staff_chats (
    id integer NOT NULL,
    message text NOT NULL,
    sender_id uuid NOT NULL,
    sender_name character varying NOT NULL,
    sender_role character varying DEFAULT 'staff' NOT NULL,
    sent_at timestamp without time zone DEFAULT now(),
    message_type character varying DEFAULT 'text',
    is_edited boolean DEFAULT false,
    edited_at timestamp without time zone,
    reply_to_id integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT staff_chats_pkey PRIMARY KEY (id)
);

-- Create sequence for staff_chats
CREATE SEQUENCE public.staff_chats_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.staff_chats_id_seq OWNED BY public.staff_chats.id;
ALTER TABLE ONLY public.staff_chats ALTER COLUMN id SET DEFAULT nextval('public.staff_chats_id_seq'::regclass);

-- Table: store_status_requests
CREATE TABLE public.store_status_requests (
    id integer NOT NULL,
    store_id text NOT NULL,
    status_type text NOT NULL,
    message text NOT NULL,
    has_time_limit boolean DEFAULT false NOT NULL,
    has_count_limit boolean DEFAULT false NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    is_consumed boolean DEFAULT false NOT NULL,
    consumed_at timestamp with time zone,
    staff_log_id uuid,
    chat_message_id integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT store_status_requests_pkey PRIMARY KEY (id)
);

-- Create sequence for store_status_requests
CREATE SEQUENCE public.store_status_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.store_status_requests_id_seq OWNED BY public.store_status_requests.id;
ALTER TABLE ONLY public.store_status_requests ALTER COLUMN id SET DEFAULT nextval('public.store_status_requests_id_seq'::regclass);

-- Table: _auth_redirect_urls_config
CREATE TABLE public._auth_redirect_urls_config (
    id integer NOT NULL,
    url text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    notes text,
    CONSTRAINT _auth_redirect_urls_config_pkey PRIMARY KEY (id)
);

-- Create sequence for _auth_redirect_urls_config
CREATE SEQUENCE public._auth_redirect_urls_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public._auth_redirect_urls_config_id_seq OWNED BY public._auth_redirect_urls_config.id;
ALTER TABLE ONLY public._auth_redirect_urls_config ALTER COLUMN id SET DEFAULT nextval('public._auth_redirect_urls_config_id_seq'::regclass);

-- ===========================================================================
-- ENUMS
-- ===========================================================================

-- Create enum for status_type
CREATE TYPE public.status_type AS ENUM (
    '今初回ほしいです',
    '席に余裕があります',
    '満席に近いです',
    '本日は満席です',
    '特別イベント開催中'
);

-- ===========================================================================
-- FOREIGN KEY CONSTRAINTS
-- ===========================================================================

-- Foreign key constraints will be added after data import

-- ===========================================================================
-- INDEXES
-- ===========================================================================

-- Indexes will be created after data import for better performance

-- ===========================================================================
-- FUNCTIONS
-- ===========================================================================

-- Function: uuid_generate_v4 (if not exists)
CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
    RETURNS uuid
    LANGUAGE sql
    AS $$
        SELECT gen_random_uuid();
$$;

-- ===========================================================================
-- DATA PLACEHOLDERS
-- ===========================================================================
-- Data will be inserted after schema creation

COMMIT; 