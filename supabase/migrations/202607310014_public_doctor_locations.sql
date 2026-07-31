begin;

alter table public.clinicians
  add column city text,
  add column practice_address text,
  add column latitude numeric(9, 6),
  add column longitude numeric(9, 6),
  add constraint clinicians_city_length
    check (city is null or char_length(city) between 2 and 120),
  add constraint clinicians_practice_address_length
    check (practice_address is null or char_length(practice_address) between 3 and 240),
  add constraint clinicians_latitude_range
    check (latitude is null or latitude between -90 and 90),
  add constraint clinicians_longitude_range
    check (longitude is null or longitude between -180 and 180),
  add constraint clinicians_location_pair
    check ((latitude is null) = (longitude is null));

revoke all on function public.search_public_doctors(text) from public;
drop function public.search_public_doctors(text);

create function public.search_public_doctors(requested_search text default null)
returns table (
  clinician_id uuid,
  full_name text,
  specialty text,
  clinic_name text,
  clinic_country text,
  city text,
  practice_address text,
  latitude numeric,
  longitude numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select clinician.id, clinician.full_name, clinician.specialty,
    clinician.clinic_name, clinician.clinic_country::text, clinician.city,
    clinician.practice_address, clinician.latitude, clinician.longitude
  from public.clinicians clinician
  where clinician.verification_status = 'approved'
    and (
      nullif(btrim(requested_search), '') is null
      or clinician.full_name ilike '%' || btrim(requested_search) || '%'
      or clinician.specialty ilike '%' || btrim(requested_search) || '%'
      or clinician.clinic_name ilike '%' || btrim(requested_search) || '%'
      or clinician.clinic_country ilike '%' || btrim(requested_search) || '%'
      or clinician.city ilike '%' || btrim(requested_search) || '%'
      or clinician.practice_address ilike '%' || btrim(requested_search) || '%'
    )
  order by clinician.full_name
  limit 100
$$;

revoke all on function public.search_public_doctors(text)
  from public;
grant execute on function public.search_public_doctors(text)
  to anon, authenticated;

commit;
