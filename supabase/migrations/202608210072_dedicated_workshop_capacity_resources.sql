begin;

alter table public.workshop_schedule_resources
  add column resource_category text,
  add column resource_type text;

update public.workshop_schedule_resources
set resource_category = case when kind = 'mechanic' then 'personnel' else 'workstation' end,
  resource_type = kind::text;

alter table public.workshop_schedule_resources
  alter column resource_category set not null,
  alter column resource_type set not null,
  drop constraint workshop_schedule_resources_workshop_id_kind_display_name_key,
  add constraint workshop_schedule_resources_category_check
    check (resource_category in ('personnel', 'workstation')),
  add constraint workshop_schedule_resources_type_check check (
    (resource_category = 'personnel' and resource_type in (
      'mechanic', 'electrician', 'painter', 'body_technician',
      'diagnostic_technician', 'tyre_technician', 'other_personnel'
    )) or
    (resource_category = 'workstation' and resource_type in (
      'bay', 'ramp', 'lift', 'paint_booth', 'diagnostic_station',
      'tyre_station', 'wash_station', 'other_workstation'
    ))
  ),
  add constraint workshop_schedule_resources_workshop_type_name_key
    unique (workshop_id, resource_category, resource_type, display_name);

create table public.workshop_personnel_workstation_assignments (
  personnel_resource_id uuid primary key
    references public.workshop_schedule_resources(id) on delete cascade,
  workstation_resource_id uuid not null
    references public.workshop_schedule_resources(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by_auth_user_id uuid references auth.users(id) on delete set null,
  check (personnel_resource_id <> workstation_resource_id)
);

create index workshop_personnel_station_workstation_idx
  on public.workshop_personnel_workstation_assignments(workstation_resource_id);

alter table public.workshop_personnel_workstation_assignments enable row level security;
revoke all on table public.workshop_personnel_workstation_assignments
  from public, anon, authenticated;

create function public.get_my_workshop_capacity_resources()
returns table (
  workshop_id uuid,
  workshop_name text,
  workshop_city text,
  daily_capacity integer,
  resource_id uuid,
  resource_category text,
  resource_type text,
  resource_name text,
  resource_active boolean,
  assigned_station_id uuid,
  assigned_station_name text,
  absences jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select workshop.id, workshop.display_name, workshop.city,
    workshop.daily_booking_capacity,
    resource.id, resource.resource_category, resource.resource_type,
    resource.display_name, resource.active,
    station.id, station.display_name,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', absence.id,
        'startsAt', absence.starts_at,
        'endsAt', absence.ends_at,
        'reason', absence.reason
      ) order by absence.starts_at)
      from public.workshop_resource_absences absence
      where absence.resource_id = resource.id
        and absence.ends_at > now() - interval '30 days'
    ), '[]'::jsonb)
  from public.workshops workshop
  left join public.workshop_schedule_resources resource
    on resource.workshop_id = workshop.id
  left join public.workshop_personnel_workstation_assignments assignment
    on assignment.personnel_resource_id = resource.id
  left join public.workshop_schedule_resources station
    on station.id = assignment.workstation_resource_id
  where private.can_manage_automotive_workshop(workshop.id)
  order by workshop.display_name, resource.resource_category,
    resource.display_name;
$$;

create function public.create_workshop_capacity_resource(
  requested_workshop_id uuid,
  requested_category text,
  requested_type text,
  requested_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  storage_kind public.workshop_resource_kind;
begin
  if not private.can_manage_automotive_workshop(requested_workshop_id) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_name, ''))) not between 2 and 120 then
    raise exception 'Resource name is required' using errcode = '23514';
  end if;
  if (requested_category = 'personnel' and requested_type in (
      'mechanic', 'electrician', 'painter', 'body_technician',
      'diagnostic_technician', 'tyre_technician', 'other_personnel'
    )) then
    storage_kind := 'mechanic';
  elsif (requested_category = 'workstation' and requested_type in (
      'bay', 'ramp', 'lift', 'paint_booth', 'diagnostic_station',
      'tyre_station', 'wash_station', 'other_workstation'
    )) then
    storage_kind := case when requested_type = 'ramp' then 'ramp'
      else 'bay' end;
  else
    raise exception 'A valid personnel or workstation type is required'
      using errcode = '23514';
  end if;

  insert into public.workshop_schedule_resources(
    workshop_id, kind, resource_category, resource_type, display_name
  ) values (
    requested_workshop_id, storage_kind, requested_category,
    requested_type, btrim(requested_name)
  ) returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.create_workshop_schedule_resource(
  requested_workshop_id uuid,
  requested_kind public.workshop_resource_kind,
  requested_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  if not private.can_manage_automotive_workshop(requested_workshop_id) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(requested_name, ''))) not between 2 and 120 then
    raise exception 'Resource name is required' using errcode = '23514';
  end if;
  insert into public.workshop_schedule_resources(
    workshop_id, kind, resource_category, resource_type, display_name
  ) values (
    requested_workshop_id, requested_kind,
    case when requested_kind = 'mechanic' then 'personnel' else 'workstation' end,
    requested_kind::text, btrim(requested_name)
  ) returning id into created_id;
  return created_id;
end;
$$;

create function public.set_workshop_personnel_workstation(
  requested_personnel_resource_id uuid,
  requested_workstation_resource_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  personnel public.workshop_schedule_resources%rowtype;
  station public.workshop_schedule_resources%rowtype;
begin
  select resource.* into personnel
  from public.workshop_schedule_resources resource
  where resource.id = requested_personnel_resource_id
  for update;

  if personnel.id is null
    or personnel.resource_category <> 'personnel'
    or not personnel.active
    or not private.can_manage_automotive_workshop(personnel.workshop_id) then
    raise exception 'Personnel resource is unavailable' using errcode = '42501';
  end if;

  if requested_workstation_resource_id is null then
    delete from public.workshop_personnel_workstation_assignments
    where personnel_resource_id = personnel.id;
    return;
  end if;

  select resource.* into station
  from public.workshop_schedule_resources resource
  where resource.id = requested_workstation_resource_id
  for update;

  if station.id is null
    or station.workshop_id <> personnel.workshop_id
    or station.resource_category <> 'workstation'
    or not station.active then
    raise exception 'Workstation resource is unavailable' using errcode = '23514';
  end if;

  insert into public.workshop_personnel_workstation_assignments(
    personnel_resource_id, workstation_resource_id,
    assigned_by_auth_user_id
  ) values (
    personnel.id, station.id, (select auth.uid())
  ) on conflict (personnel_resource_id) do update
    set workstation_resource_id = excluded.workstation_resource_id,
      assigned_at = now(),
      assigned_by_auth_user_id = excluded.assigned_by_auth_user_id;
end;
$$;

create function public.set_workshop_daily_booking_capacity(
  requested_workshop_id uuid,
  requested_daily_capacity integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if requested_daily_capacity is null or requested_daily_capacity not between 1 and 200 then
    raise exception 'Daily capacity must be between 1 and 200'
      using errcode = '23514';
  end if;
  update public.workshops workshop
  set daily_booking_capacity = requested_daily_capacity
  where workshop.id = requested_workshop_id
    and private.can_manage_automotive_workshop(workshop.id);
  if not found then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.get_my_workshop_capacity_resources()
  from public, anon, authenticated;
revoke all on function public.create_workshop_capacity_resource(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.set_workshop_personnel_workstation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_workshop_daily_booking_capacity(uuid, integer)
  from public, anon, authenticated;

grant execute on function public.get_my_workshop_capacity_resources()
  to authenticated;
grant execute on function public.create_workshop_capacity_resource(uuid, text, text, text)
  to authenticated;
grant execute on function public.set_workshop_personnel_workstation(uuid, uuid)
  to authenticated;
grant execute on function public.set_workshop_daily_booking_capacity(uuid, integer)
  to authenticated;

comment on table public.workshop_personnel_workstation_assignments is
  'Current default placement of location personnel at physical workshop stations.';
comment on function public.get_my_workshop_capacity_resources() is
  'Returns role-scoped personnel, workstations, availability, and current station assignments.';
comment on function public.set_workshop_personnel_workstation(uuid, uuid) is
  'Assigns or unassigns one personnel resource to a workstation in the same authorized workshop.';

commit;
