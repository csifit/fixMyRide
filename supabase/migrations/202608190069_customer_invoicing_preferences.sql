begin;

alter table public.service_providers
  add column customer_invoicing_enabled boolean not null default true;

alter table public.workshops
  add column customer_invoicing_enabled boolean;

comment on column public.service_providers.customer_invoicing_enabled is
  'Organisation default for recording customer invoice details in Pitster.';
comment on column public.workshops.customer_invoicing_enabled is
  'Optional workshop override. Null inherits the service organisation default.';

create function public.get_my_customer_invoicing_preferences()
returns table (
  provider_id uuid,
  provider_name text,
  provider_default_enabled boolean,
  workshop_id uuid,
  workshop_name text,
  workshop_override_enabled boolean,
  effective_enabled boolean,
  can_manage_provider boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    provider.id,
    provider.display_name,
    provider.customer_invoicing_enabled,
    workshop.id,
    workshop.display_name,
    workshop.customer_invoicing_enabled,
    coalesce(workshop.customer_invoicing_enabled, provider.customer_invoicing_enabled),
    private.can_manage_service_organisation(provider.id)
  from public.workshops workshop
  join public.service_providers provider on provider.id = workshop.service_provider_id
  where private.can_manage_automotive_workshop(workshop.id)
  order by provider.display_name, workshop.display_name
$$;

revoke all on function public.get_my_customer_invoicing_preferences()
  from public, anon, authenticated;
grant execute on function public.get_my_customer_invoicing_preferences()
  to authenticated;

create function public.update_my_provider_customer_invoicing_preference(
  requested_provider_id uuid,
  new_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_service_organisation(requested_provider_id) then
    raise exception 'Service organisation owner access required' using errcode = '42501';
  end if;

  update public.service_providers provider
  set customer_invoicing_enabled = new_enabled
  where provider.id = requested_provider_id;

  if not found then
    raise exception 'Service organisation is unavailable' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_my_provider_customer_invoicing_preference(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.update_my_provider_customer_invoicing_preference(uuid, boolean)
  to authenticated;

create function public.update_my_workshop_customer_invoicing_preference(
  requested_workshop_id uuid,
  new_override_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_automotive_workshop(requested_workshop_id) then
    raise exception 'Workshop manager access required' using errcode = '42501';
  end if;

  update public.workshops workshop
  set customer_invoicing_enabled = new_override_enabled
  where workshop.id = requested_workshop_id;

  if not found then
    raise exception 'Workshop is unavailable' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_my_workshop_customer_invoicing_preference(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.update_my_workshop_customer_invoicing_preference(uuid, boolean)
  to authenticated;

create function private.enforce_customer_invoicing_preference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoicing_enabled boolean;
begin
  select coalesce(workshop.customer_invoicing_enabled, provider.customer_invoicing_enabled)
  into invoicing_enabled
  from public.service_booking_requests booking
  join public.workshops workshop on workshop.id = booking.workshop_id
  join public.service_providers provider on provider.id = workshop.service_provider_id
  where booking.id = new.booking_request_id;

  if invoicing_enabled is false then
    if tg_op = 'INSERT' then
      new.invoice_number := null;
      new.invoice_issued_on := null;
      new.invoice_total_cents := null;
      new.invoice_currency := null;
    else
      new.invoice_number := old.invoice_number;
      new.invoice_issued_on := old.invoice_issued_on;
      new.invoice_total_cents := old.invoice_total_cents;
      new.invoice_currency := old.invoice_currency;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_customer_invoicing_preference()
  from public, anon, authenticated;

create trigger vehicle_service_records_customer_invoicing_preference
before insert or update of invoice_number, invoice_issued_on, invoice_total_cents, invoice_currency
on public.vehicle_service_records
for each row execute function private.enforce_customer_invoicing_preference();

commit;
