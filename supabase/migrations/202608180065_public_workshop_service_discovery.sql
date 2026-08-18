begin;

create function public.search_public_workshops_v3(
  requested_search text default null,
  requested_service_code text default null
)
returns table (
  workshop_id uuid, workshop_slug text, display_name text, description text,
  country_code char(2), city text, practice_address text,
  latitude numeric, longitude numeric, public_phone text, public_email text,
  offers_pickup boolean, offers_courtesy_car boolean,
  service_categories text[], price_from_cents integer
)
language sql stable security definer set search_path = ''
as $$
  select workshop.id, workshop.slug, workshop.display_name,
    workshop.description, workshop.country_code, workshop.city,
    workshop.address, workshop.latitude, workshop.longitude,
    workshop.public_phone, workshop.public_email, workshop.offers_pickup,
    workshop.offers_courtesy_car,
    coalesce(summary.categories, array[]::text[]), summary.price_from_cents
  from public.workshops workshop
  left join lateral (
    select array_agg(distinct service.category order by service.category) categories,
      min(service.price_from_cents) price_from_cents
    from public.workshop_services service
    where service.workshop_id = workshop.id and service.active
  ) summary on true
  where private.is_workshop_discoverable(workshop.id)
    and (nullif(btrim(requested_search), '') is null
      or concat_ws(' ', workshop.display_name, workshop.description,
        workshop.city, workshop.address,
        array_to_string(summary.categories, ' '))
        ilike '%' || btrim(requested_search) || '%')
    and (nullif(btrim(requested_service_code), '') is null or exists (
      select 1
      from public.workshop_services matching_service
      where matching_service.workshop_id = workshop.id
        and matching_service.active
        and matching_service.service_code = btrim(requested_service_code)
    ))
  order by workshop.display_name
$$;

revoke all on function public.search_public_workshops_v3(text, text)
  from public, anon, authenticated;
grant execute on function public.search_public_workshops_v3(text, text)
  to anon, authenticated;

comment on function public.search_public_workshops_v3(text, text) is
  'Public workshop discovery with exact active service-code matching for the browsable service catalogue.';

commit;
