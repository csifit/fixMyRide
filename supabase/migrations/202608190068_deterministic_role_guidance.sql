begin;

create table public.user_guidance_preferences (
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('workshop_manager', 'service_organisation')),
  guide_key text not null check (guide_key ~ '^[a-z0-9_]{2,80}$'),
  guidance_version integer not null default 1 check (guidance_version > 0),
  dismissed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (auth_user_id, role, guide_key)
);

create trigger user_guidance_preferences_updated_at
before update on public.user_guidance_preferences
for each row execute function public.set_updated_at();

alter table public.user_guidance_preferences enable row level security;
revoke all on table public.user_guidance_preferences from public, anon, authenticated;

create function public.get_my_guidance_preferences(requested_role text)
returns table (guide_key text, guidance_version integer, dismissed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select preference.guide_key, preference.guidance_version, preference.dismissed_at
  from public.user_guidance_preferences preference
  where preference.auth_user_id = (select auth.uid())
    and preference.role = requested_role
  order by preference.guide_key
$$;

create function public.dismiss_my_guidance(
  requested_role text,
  requested_guide_key text,
  requested_guidance_version integer
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required.';
  end if;
  if requested_role not in ('workshop_manager', 'service_organisation')
    or requested_guide_key !~ '^[a-z0-9_]{2,80}$'
    or requested_guidance_version < 1 then
    raise exception using errcode = '22023', message = 'Invalid guidance preference.';
  end if;

  insert into public.user_guidance_preferences(
    auth_user_id, role, guide_key, guidance_version, dismissed_at
  ) values (
    (select auth.uid()), requested_role, requested_guide_key,
    requested_guidance_version, now()
  )
  on conflict (auth_user_id, role, guide_key) do update set
    guidance_version = excluded.guidance_version,
    dismissed_at = excluded.dismissed_at,
    updated_at = now();
end;
$$;

revoke all on function public.get_my_guidance_preferences(text)
  from public, anon, authenticated;
revoke all on function public.dismiss_my_guidance(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_my_guidance_preferences(text) to authenticated;
grant execute on function public.dismiss_my_guidance(text, text, integer) to authenticated;

comment on table public.user_guidance_preferences is
  'Per-user dismissal state for deterministic role and page guidance. Checklist completion remains derived from operational data.';

commit;
