-- Meetings and tasks that an admin assigns to a designer. The designer must accept or reject (with a reason).
-- Only ACCEPTED meetings reserve time: the database refuses two overlapping accepted meetings for one designer.
create extension if not exists btree_gist;

create table meetings (
  id uuid primary key default gen_random_uuid(),
  designer_id uuid not null references designers(id) on delete restrict,
  client_id uuid references clients(id) on delete set null,
  title text not null check (length(trim(title)) >= 3),
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'requested'
    check (status in ('requested','accepted','rejected','cancelled')),
  requested_by uuid not null references users(id),
  responded_at timestamptz,
  rejection_reason text,
  acknowledged_at timestamptz,            -- admin has seen the designer's response
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (status <> 'rejected' or length(trim(coalesce(rejection_reason, ''))) >= 3),
  constraint meetings_no_overlap exclude using gist
    (designer_id with =, tstzrange(starts_at, ends_at) with &&) where (status = 'accepted')
);
create index meetings_designer_time_idx on meetings(designer_id, starts_at);
create index meetings_status_idx on meetings(status);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  designer_id uuid not null references designers(id) on delete restrict,
  client_id uuid references clients(id) on delete set null,
  title text not null check (length(trim(title)) >= 3),
  description text,
  due_date date,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'assigned'
    check (status in ('assigned','accepted','rejected','completed','cancelled')),
  assigned_by uuid not null references users(id),
  responded_at timestamptz,
  rejection_reason text,
  completed_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'rejected' or length(trim(coalesce(rejection_reason, ''))) >= 3)
);
create index tasks_designer_idx on tasks(designer_id, status);

create trigger meetings_touch before update on meetings for each row execute function touch_updated_at();
create trigger tasks_touch before update on tasks for each row execute function touch_updated_at();

-- A designer may only answer a request (and only change the answer fields). Admin may change anything.
create function guard_meeting_update() returns trigger language plpgsql as $$
begin
  if app_role_name() = 'designer' then
    if old.status <> 'requested' or new.status not in ('accepted','rejected') then
      raise exception 'A designer can only accept or reject a requested meeting';
    end if;
    if (new.designer_id, new.client_id, new.title, new.description, new.location, new.starts_at, new.ends_at, new.requested_by, new.acknowledged_at)
       is distinct from
       (old.designer_id, old.client_id, old.title, old.description, old.location, old.starts_at, old.ends_at, old.requested_by, old.acknowledged_at) then
      raise exception 'A designer cannot edit meeting details';
    end if;
  end if;
  return new;
end $$;
create trigger meetings_guard before update on meetings for each row execute function guard_meeting_update();

create function guard_task_update() returns trigger language plpgsql as $$
begin
  if app_role_name() = 'designer' then
    if not ((old.status = 'assigned' and new.status in ('accepted','rejected'))
         or (old.status = 'accepted' and new.status = 'completed')) then
      raise exception 'A designer can only accept/reject an assigned task or complete an accepted task';
    end if;
    if (new.designer_id, new.client_id, new.title, new.description, new.due_date, new.priority, new.assigned_by, new.acknowledged_at)
       is distinct from
       (old.designer_id, old.client_id, old.title, old.description, old.due_date, old.priority, old.assigned_by, old.acknowledged_at) then
      raise exception 'A designer cannot edit task details';
    end if;
  end if;
  return new;
end $$;
create trigger tasks_guard before update on tasks for each row execute function guard_task_update();

grant select, insert, update on meetings, tasks to app_user;
alter table meetings enable row level security;
alter table tasks enable row level security;

create policy meetings_read on meetings for select to app_user
  using (app_role_name() = 'admin' or designer_id = app_designer_id());
create policy meetings_insert on meetings for insert to app_user
  with check (app_role_name() = 'admin' and requested_by = app_uid());
create policy meetings_update on meetings for update to app_user
  using (app_role_name() = 'admin' or designer_id = app_designer_id())
  with check (app_role_name() = 'admin' or designer_id = app_designer_id());

create policy tasks_read on tasks for select to app_user
  using (app_role_name() = 'admin' or designer_id = app_designer_id());
create policy tasks_insert on tasks for insert to app_user
  with check (app_role_name() = 'admin' and assigned_by = app_uid());
create policy tasks_update on tasks for update to app_user
  using (app_role_name() = 'admin' or designer_id = app_designer_id())
  with check (app_role_name() = 'admin' or designer_id = app_designer_id());
