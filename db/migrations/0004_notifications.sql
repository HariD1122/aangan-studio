-- Queue of messages to send to the team's Telegram group. A trigger queues one "new lead" alert per new REAL client
-- (demo clients never alert). The worker sends them later and retries if Telegram is unavailable.
create table notification_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_lead')),
  client_id uuid not null references clients(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts int not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, client_id)               -- one alert per lead, even if the trigger fires twice
);
create index notification_queue_due_idx on notification_queue(status, next_attempt_at);

create function trg_queue_new_lead() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not new.is_demo then
    insert into notification_queue(kind, client_id) values ('new_lead', new.id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger clients_new_lead after insert on clients for each row execute function trg_queue_new_lead();

alter table notification_queue enable row level security;
grant select on notification_queue to app_user;
create policy notification_queue_admin_read on notification_queue for select to app_user using (app_role_name() = 'admin');
