-- Phase 1 core schema (plain PostgreSQL / Neon). Applied by `npm run db:migrate`.
create extension if not exists pgcrypto;
create extension if not exists citext;

create type app_role as enum ('admin','front_desk','designer','viewer');

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  password_hash text not null,
  full_name text not null default '',
  role app_role not null default 'front_desk',
  can_assign_leads boolean not null default false,
  is_active boolean not null default true,
  failed_logins int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_user_idx on sessions(user_id);

create table designers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references users(id) on delete set null,
  full_name text not null,
  email text, phone text, photo_url text, portfolio_url text,
  specializations text[] not null default '{}',
  experience_years int check (experience_years >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text,
  preferred_contact text check (preferred_contact in ('phone','email','whatsapp')),
  project_type text, project_location text, property_type text,
  area_value numeric(12,2) check (area_value > 0),
  area_unit text check (area_unit in ('sqft','sqm')),
  budget_min numeric(14,2), budget_max numeric(14,2),
  budget_currency text not null default 'INR',
  timeline text, expected_start_date date,
  requirements text,
  qualification_status text not null default 'unreviewed'
    check (qualification_status in ('unreviewed','qualified','not_qualified','needs_review')),
  lead_stage text not null default 'new',
  follow_up_date date, follow_up_notes text,
  hubspot_contact_id text, hubspot_deal_id text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (budget_max is null or budget_min is null or budget_max >= budget_min)
);
create index clients_phone_idx on clients(phone);

create table designer_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  designer_id uuid not null references designers(id) on delete restrict,
  assigned_by uuid references users(id),
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz
);
-- only one active designer per client (also stops two people assigning at once)
create unique index one_active_assignment on designer_assignments(client_id) where unassigned_at is null;
create index assignments_designer_idx on designer_assignments(designer_id) where unassigned_at is null;

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table studio_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create function touch_updated_at() returns trigger language plpgsql as
$$ begin new.updated_at = now(); return new; end $$;
create trigger users_touch before update on users for each row execute function touch_updated_at();
create trigger designers_touch before update on designers for each row execute function touch_updated_at();
create trigger clients_touch before update on clients for each row execute function touch_updated_at();

-- ---------- Row Level Security ----------
-- The app connects as the owner, then runs each request as role `app_user` with
-- `app.user_id` set inside a transaction (see src/server/db.ts). RLS then applies.
create role app_user nologin;
grant app_user to current_user;
grant usage on schema public to app_user;
grant select, insert, update, delete on designers, clients, designer_assignments, studio_settings to app_user;
grant select, insert on audit_logs to app_user;
grant select on users to app_user;

create function app_uid() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

create function app_role_name() returns app_role language sql stable security definer set search_path = public as
$$ select role from users where id = app_uid() and is_active $$;

create function app_designer_id() returns uuid language sql stable security definer set search_path = public as
$$ select d.id from designers d where d.user_id = app_uid() $$;

create function app_can_assign() returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'admin' or can_assign_leads from users where id = app_uid() and is_active), false) $$;

grant execute on function app_uid(), app_role_name(), app_designer_id(), app_can_assign() to app_user;

alter table users enable row level security;
alter table designers enable row level security;
alter table clients enable row level security;
alter table designer_assignments enable row level security;
alter table audit_logs enable row level security;
alter table studio_settings enable row level security;

-- users: you can see yourself; admin sees everyone. Writes happen only in server auth code (owner), never as app_user.
create policy users_read on users for select to app_user using (id = app_uid() or app_role_name() = 'admin');

create policy designers_read on designers for select to app_user using (
  app_role_name() in ('admin','front_desk','viewer') or id = app_designer_id());
create policy designers_admin_write on designers for all to app_user
  using (app_role_name() = 'admin') with check (app_role_name() = 'admin');

create policy clients_read on clients for select to app_user using (
  app_role_name() in ('admin','front_desk','viewer')
  or exists (select 1 from designer_assignments a
             where a.client_id = clients.id and a.unassigned_at is null and a.designer_id = app_designer_id()));
create policy clients_insert on clients for insert to app_user with check (app_role_name() in ('admin','front_desk'));
create policy clients_update on clients for update to app_user
  using (app_role_name() in ('admin','front_desk')) with check (app_role_name() in ('admin','front_desk'));

create policy assignments_read on designer_assignments for select to app_user using (
  app_role_name() in ('admin','front_desk','viewer') or designer_id = app_designer_id());
create policy assignments_write on designer_assignments for all to app_user
  using (app_can_assign()) with check (app_can_assign());

create policy audit_read on audit_logs for select to app_user using (app_role_name() = 'admin');
create policy audit_insert on audit_logs for insert to app_user with check (actor_id = app_uid());
create policy settings_admin on studio_settings for all to app_user
  using (app_role_name() = 'admin') with check (app_role_name() = 'admin');
