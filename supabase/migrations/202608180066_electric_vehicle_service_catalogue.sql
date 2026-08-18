begin;

alter type public.automotive_vehicle_type
  add value if not exists 'electric_vehicle' after 'car_van';

commit;
