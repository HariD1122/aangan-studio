-- Phone calls handled by the VaaniVoice AI agent, plus every raw webhook delivery (for audit and duplicate protection).
-- Transcripts, recordings and raw payloads are personal data: only admins (and the designer assigned to the lead) can read them.
create table voice_calls (
  id uuid primary key default gen_random_uuid(),
  provider_call_id text unique,                 -- VaaniVoice call_id
  room_name text unique,                        -- VaaniVoice room_name (links the early "started" event to the final report)
  direction text not null default 'outbound',
  phone text,                                   -- the customer's number (E.164), if known
  customer_name text,                           -- name typed by the admin for a test call, if any
  status text not null default 'started'
    check (status in ('started','ended','processing','done','needs_review','failed')),
  duration_seconds numeric,
  end_reason text,
  provider_summary text,                        -- VaaniVoice's own summary
  transcript text,
  entities jsonb,
  dispositions jsonb,
  recording_url text,
  notes jsonb,                                  -- short notes + extracted fields written by Gemini (AI suggestions, not confirmed facts)
  client_id uuid references clients(id) on delete set null,
  attempts int not null default 0,
  error text,
  started_by uuid references users(id),         -- set when an admin pressed "Start a test call"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index voice_calls_client_idx on voice_calls(client_id);
create index voice_calls_status_idx on voice_calls(status, updated_at);
create trigger voice_calls_touch before update on voice_calls for each row execute function touch_updated_at();

create table voice_call_events (
  id uuid primary key default gen_random_uuid(),
  payload_hash text not null unique,            -- identical re-deliveries are ignored
  event text,
  provider_call_id text,
  room_name text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table voice_calls enable row level security;
alter table voice_call_events enable row level security;
grant select on voice_calls, voice_call_events to app_user;

create policy voice_calls_read on voice_calls for select to app_user using (
  app_role_name() = 'admin'
  or exists (select 1 from designer_assignments a
              where a.client_id = voice_calls.client_id and a.unassigned_at is null and a.designer_id = app_designer_id()));
create policy voice_events_admin_read on voice_call_events for select to app_user using (app_role_name() = 'admin');
