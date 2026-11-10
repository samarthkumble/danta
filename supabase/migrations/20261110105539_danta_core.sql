-- Danta schema. Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- Row level security is on with no policies: only the server, using the secret key, reads or writes.
create extension if not exists pgcrypto;

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text not null,
  country text not null default 'IN',
  currency text not null default 'USD',
  warranty_days int not null default 180,
  warranty_terms text not null default '',
  created_at timestamptz not null default now()
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  name text not null,
  kind text not null default 'dentist'
);

create table cases (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  public_token text not null unique default encode(gen_random_bytes(12), 'hex'),
  patient_name text not null,
  patient_email text not null,
  home_city text not null default '',
  language text not null default 'en',
  status text not null default 'draft',
  quote_text text not null default '',
  plan jsonb,
  issues jsonb not null default '[]'::jsonb,
  totals jsonb,
  spend_limit_cents int not null default 0,
  demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  idx int not null,
  title text not null,
  trip int not null default 1,
  starts_on date,
  ends_on date,
  min_gap_days int not null default 0,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'USD',
  status text not null default 'planned'
    check (status in ('planned','due','invoiced','paid','partially_refunded','refunded')),
  paypal_order_id text,
  paypal_capture_id text,
  paypal_invoice_id text,
  invoice_url text,
  refunded_cents int not null default 0 check (refunded_cents >= 0),
  paid_at timestamptz,
  unique (case_id, idx)
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  stage_id uuid references stages(id) on delete cascade,
  resource_id uuid references resources(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  stage_id uuid references stages(id) on delete set null,
  kind text not null check (kind in ('deposit','stage','refund')),
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'USD',
  paypal_ref text,
  status text not null default 'pending',
  request_id text not null unique,
  created_at timestamptz not null default now()
);

create table agent_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  tool text not null,
  args jsonb not null default '{}'::jsonb,
  reason text not null default '',
  status text not null default 'proposed'
    check (status in ('proposed','approved','executed','rejected','blocked','failed')),
  limit_check jsonb,
  result jsonb,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  stage_id uuid references stages(id) on delete set null,
  note text not null,
  verdict jsonb,
  refund_cents int not null default 0,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table events (
  id bigint generated always as identity primary key,
  case_id uuid references cases(id) on delete cascade,
  actor text not null,
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table webhook_events (
  id text primary key,
  event_type text not null,
  verified boolean not null,
  resource jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index on stages (case_id);
create index on payments (case_id);
create index on agent_actions (case_id);
create index on events (case_id, created_at);
create index on appointments (case_id);

alter table clinics enable row level security;
alter table resources enable row level security;
alter table cases enable row level security;
alter table stages enable row level security;
alter table appointments enable row level security;
alter table payments enable row level security;
alter table agent_actions enable row level security;
alter table claims enable row level security;
alter table events enable row level security;
alter table webhook_events enable row level security;
