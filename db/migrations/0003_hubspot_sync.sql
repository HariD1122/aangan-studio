-- One-way sync queue Neon -> HubSpot, plus a demo flag so sample records are never mistaken for real ones.
-- The local database is always saved first; a trigger queues the client and a worker pushes it to HubSpot later.
alter table clients add column is_demo boolean not null default false;
alter table clients add column source text;
alter table designers add column is_demo boolean not null default false;

create table hubspot_sync (
  client_id uuid primary key references clients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','synced','failed')),
  hubspot_contact_id text,
  hubspot_deal_id text,
  attempts int not null default 0,
  last_error text,
  last_synced_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  queued_at timestamptz not null default now(),   -- last local change; the worker only marks "synced" if this did not move meanwhile
  updated_at timestamptz not null default now()
);
create index hubspot_sync_due_idx on hubspot_sync(status, next_attempt_at);

create function queue_hubspot_sync(p_client uuid) returns void language sql security definer set search_path = public as $$
  insert into hubspot_sync(client_id) values (p_client)
  on conflict (client_id) do update
    set status = 'pending', queued_at = now(), next_attempt_at = now(), attempts = 0, last_error = null, updated_at = now();
$$;

create function trg_queue_client() returns trigger language plpgsql security definer set search_path = public as $$
begin perform queue_hubspot_sync(new.id); return new; end $$;
create trigger clients_queue_ins after insert on clients for each row execute function trg_queue_client();
create trigger clients_queue_upd after update of full_name, phone, email, project_type, project_location, property_type, area_value, area_unit,
    budget_min, budget_max, timeline, expected_start_date, requirements, qualification_status, lead_stage, is_demo
  on clients for each row execute function trg_queue_client();

create function trg_queue_assignment() returns trigger language plpgsql security definer set search_path = public as $$
begin perform queue_hubspot_sync(new.client_id); return new; end $$;
create trigger assignments_queue after insert or update on designer_assignments for each row execute function trg_queue_assignment();

create function trg_queue_meeting() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id is not null and new.status = 'accepted' then perform queue_hubspot_sync(new.client_id); end if;
  return new;
end $$;
create trigger meetings_queue after insert or update of status on meetings for each row execute function trg_queue_meeting();

create function trg_queue_designer_rename() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform queue_hubspot_sync(a.client_id) from designer_assignments a where a.designer_id = new.id and a.unassigned_at is null;
  return new;
end $$;
create trigger designers_queue after update of full_name on designers for each row execute function trg_queue_designer_rename();

-- Only admins can see sync status. The worker runs with the owner connection (bypasses RLS).
alter table hubspot_sync enable row level security;
grant select on hubspot_sync to app_user;
create policy hubspot_sync_admin_read on hubspot_sync for select to app_user using (app_role_name() = 'admin');
