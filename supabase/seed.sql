-- Fictional automotive development data only. No Auth user, password,
-- customer contact information, payment data, or historical medical record is
-- created by this seed.

insert into public.service_providers (
  id, legal_name, display_name, country_code, status
) values (
  '10000000-0000-4000-8000-000000000001',
  'Pitster Demo Services SRL', 'Pitster Demo Workshop', 'RO', 'active'
) on conflict (id) do nothing;

insert into public.workshops (
  id, service_provider_id, slug, display_name, country_code, status,
  description, public_phone, public_email, city, address,
  accepts_booking_requests, offers_pickup, offers_courtesy_car, active_from
) values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'pitster-demo-workshop', 'Pitster Demo Workshop', 'RO', 'active',
  'Fictional workshop used for local automotive administration testing.',
  null, null, 'Bucharest', 'Demo address 1', false, false, false, current_date
) on conflict (id) do nothing;
