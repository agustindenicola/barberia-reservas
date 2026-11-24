create extension if not exists pgcrypto;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  duration integer not null check (duration > 0),
  price integer not null default 0 check (price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.opening_hours (
  weekday integer primary key check (weekday between 0 and 6),
  open boolean not null default false,
  start_time time not null default '10:00',
  end_time time not null default '18:00',
  break_start time,
  break_end time,
  updated_at timestamptz not null default now(),
  check (start_time < end_time),
  check (
    (break_start is null and break_end is null)
    or (break_start is not null and break_end is not null and break_start < break_end)
  )
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id),
  service_name text not null,
  duration integer not null check (duration > 0),
  price integer not null default 0 check (price >= 0),
  date date not null,
  time time not null,
  name text not null,
  email text not null,
  phone text not null default '',
  note text not null default '',
  manage_token text not null default encode(gen_random_bytes(24), 'hex'),
  reminder_sent_at timestamptz,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id boolean primary key default true,
  notification_email text not null default 'barberia.marianomartinez@gmail.com',
  business_address text not null default '',
  maps_url text not null default 'https://maps.app.goo.gl/UzPPS1nmSLwza3BL9?g_st=ic',
  max_days_ahead integer not null default 21 check (max_days_ahead between 1 and 90),
  slot_step integer not null default 30 check (slot_step in (15, 30, 45, 60)),
  updated_at timestamptz not null default now(),
  check (id = true)
);

create table if not exists public.availability_overrides (
  date date primary key,
  open boolean not null default true,
  start_time time not null default '13:00',
  end_time time not null default '21:00',
  break_start time,
  break_end time,
  updated_at timestamptz not null default now(),
  check (start_time < end_time),
  check (
    (break_start is null and break_end is null)
    or (break_start is not null and break_end is not null and break_start < break_end)
  )
);

create table if not exists public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time not null,
  duration integer not null default 30 check (duration > 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists reservations_unique_active_slot
  on public.reservations (date, time)
  where status = 'confirmed';

create index if not exists reservations_date_idx
  on public.reservations (date);

create index if not exists blocked_slots_date_idx
  on public.blocked_slots (date);

create unique index if not exists blocked_slots_unique_start
  on public.blocked_slots (date, time);

create unique index if not exists reservations_manage_token_idx
  on public.reservations (manage_token);

do $$
begin
  alter publication supabase_realtime add table public.reservations;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.blocked_slots;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.availability_overrides;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.opening_hours;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.services;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.app_settings;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

create or replace view public.reservation_slots as
select
  id,
  date,
  time,
  duration,
  status
from public.reservations
where status = 'confirmed';

create or replace function public.create_reservation(
  p_service_id uuid,
  p_service_name text,
  p_duration integer,
  p_price integer,
  p_date date,
  p_time time,
  p_name text,
  p_email text,
  p_phone text default '',
  p_note text default ''
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted public.reservations;
  selected_service public.services;
  schedule_open boolean;
  schedule_start time;
  schedule_end time;
  schedule_break_start time;
  schedule_break_end time;
  schedule_slot_step integer;
  max_days_ahead integer;
  explicit_open_override boolean;
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  perform pg_advisory_xact_lock(hashtext(p_date::text));

  select *
  into selected_service
  from public.services
  where id = p_service_id
    and active = true;

  if selected_service.id is null then
    raise exception 'service_unavailable';
  end if;

  if length(trim(coalesce(p_phone, ''))) = 0 then
    raise exception 'phone_required';
  end if;

  select coalesce(s.max_days_ahead, 21)
  into max_days_ahead
  from public.app_settings s
  where s.id = true;

  if p_date < business_today then
    raise exception 'past_date';
  end if;

  select exists (
    select 1
    from public.availability_overrides ao
    where ao.date = p_date
      and ao.open = true
  )
  into explicit_open_override;

  if p_date > business_today + coalesce(max_days_ahead, 21) and not explicit_open_override then
    raise exception 'date_too_far';
  end if;

  select
    coalesce(ao.open, oh.open),
    coalesce(ao.start_time, oh.start_time),
    coalesce(ao.end_time, oh.end_time),
    coalesce(ao.break_start, oh.break_start),
    coalesce(ao.break_end, oh.break_end),
    coalesce(s.slot_step, 30)
  into
    schedule_open,
    schedule_start,
    schedule_end,
    schedule_break_start,
    schedule_break_end,
    schedule_slot_step
  from public.opening_hours oh
  left join public.availability_overrides ao on ao.date = p_date
  left join public.app_settings s on s.id = true
  where oh.weekday = extract(dow from p_date)::integer;

  if not coalesce(schedule_open, false) then
    raise exception 'day_closed';
  end if;

  if p_time < schedule_start or (p_time + make_interval(mins => selected_service.duration))::time > schedule_end then
    raise exception 'outside_opening_hours';
  end if;

  if ((extract(epoch from (p_time - schedule_start)) / 60)::integer % schedule_slot_step) <> 0 then
    raise exception 'invalid_slot_step';
  end if;

  if schedule_break_start is not null
    and schedule_break_end is not null
    and p_time < schedule_break_end
    and schedule_break_start < (p_time + make_interval(mins => selected_service.duration))::time
  then
    raise exception 'break_unavailable';
  end if;

  if exists (
    select 1
    from public.blocked_slots b
    where b.date = p_date
      and p_time < (b.time + make_interval(mins => b.duration))
      and b.time < (p_time + make_interval(mins => selected_service.duration))
  ) then
    raise exception 'slot_blocked';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.status = 'confirmed'
      and r.date = p_date
      and p_time < (r.time + make_interval(mins => r.duration))
      and r.time < (p_time + make_interval(mins => selected_service.duration))
  ) then
    raise exception 'slot_unavailable';
  end if;

  insert into public.reservations (
    service_id,
    service_name,
    duration,
    price,
    date,
    time,
    name,
    email,
    phone,
    note,
    status
  )
  values (
    selected_service.id,
    selected_service.name,
    selected_service.duration,
    selected_service.price,
    p_date,
    p_time,
    p_name,
    p_email,
    coalesce(p_phone, ''),
    coalesce(p_note, ''),
    'confirmed'
  )
  returning * into inserted;

  return inserted;
end;
$$;

create or replace function public.get_reservation_by_token(
  p_manage_token text
)
returns public.reservations
language sql
security definer
set search_path = public
as $$
  select *
  from public.reservations
  where manage_token = p_manage_token
    and status = 'confirmed'
  limit 1;
$$;

create or replace function public.cancel_reservation_by_token(
  p_manage_token text
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.reservations;
begin
  update public.reservations
  set status = 'cancelled'
  where manage_token = p_manage_token
    and status = 'confirmed'
  returning * into updated;

  if updated.id is null then
    raise exception 'reservation_not_found';
  end if;

  return updated;
end;
$$;

create or replace function public.reschedule_reservation_by_token(
  p_manage_token text,
  p_service_id uuid,
  p_service_name text,
  p_duration integer,
  p_price integer,
  p_date date,
  p_time time
)
returns public.reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_reservation public.reservations;
  updated public.reservations;
  selected_service public.services;
  schedule_open boolean;
  schedule_start time;
  schedule_end time;
  schedule_break_start time;
  schedule_break_end time;
  schedule_slot_step integer;
  max_days_ahead integer;
  explicit_open_override boolean;
  business_today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  perform pg_advisory_xact_lock(hashtext(p_date::text));

  select *
  into current_reservation
  from public.reservations
  where manage_token = p_manage_token
    and status = 'confirmed'
  for update;

  if current_reservation.id is null then
    raise exception 'reservation_not_found';
  end if;

  select *
  into selected_service
  from public.services
  where id = p_service_id
    and active = true;

  if selected_service.id is null then
    raise exception 'service_unavailable';
  end if;

  select coalesce(s.max_days_ahead, 21)
  into max_days_ahead
  from public.app_settings s
  where s.id = true;

  if p_date < business_today then
    raise exception 'past_date';
  end if;

  select exists (
    select 1
    from public.availability_overrides ao
    where ao.date = p_date
      and ao.open = true
  )
  into explicit_open_override;

  if p_date > business_today + coalesce(max_days_ahead, 21) and not explicit_open_override then
    raise exception 'date_too_far';
  end if;

  select
    coalesce(ao.open, oh.open),
    coalesce(ao.start_time, oh.start_time),
    coalesce(ao.end_time, oh.end_time),
    coalesce(ao.break_start, oh.break_start),
    coalesce(ao.break_end, oh.break_end),
    coalesce(s.slot_step, 30)
  into
    schedule_open,
    schedule_start,
    schedule_end,
    schedule_break_start,
    schedule_break_end,
    schedule_slot_step
  from public.opening_hours oh
  left join public.availability_overrides ao on ao.date = p_date
  left join public.app_settings s on s.id = true
  where oh.weekday = extract(dow from p_date)::integer;

  if not coalesce(schedule_open, false) then
    raise exception 'day_closed';
  end if;

  if p_time < schedule_start or (p_time + make_interval(mins => selected_service.duration))::time > schedule_end then
    raise exception 'outside_opening_hours';
  end if;

  if ((extract(epoch from (p_time - schedule_start)) / 60)::integer % schedule_slot_step) <> 0 then
    raise exception 'invalid_slot_step';
  end if;

  if schedule_break_start is not null
    and schedule_break_end is not null
    and p_time < schedule_break_end
    and schedule_break_start < (p_time + make_interval(mins => selected_service.duration))::time
  then
    raise exception 'break_unavailable';
  end if;

  if exists (
    select 1
    from public.blocked_slots b
    where b.date = p_date
      and p_time < (b.time + make_interval(mins => b.duration))
      and b.time < (p_time + make_interval(mins => selected_service.duration))
  ) then
    raise exception 'slot_blocked';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.status = 'confirmed'
      and r.id <> current_reservation.id
      and r.date = p_date
      and p_time < (r.time + make_interval(mins => r.duration))
      and r.time < (p_time + make_interval(mins => selected_service.duration))
  ) then
    raise exception 'slot_unavailable';
  end if;

  update public.reservations
  set
    service_id = selected_service.id,
    service_name = selected_service.name,
    duration = selected_service.duration,
    price = selected_service.price,
    date = p_date,
    time = p_time,
    reminder_sent_at = null
  where id = current_reservation.id
  returning * into updated;

  return updated;
end;
$$;

insert into public.services (name, duration, price, active, sort_order)
values
  ('Corte', 30, 0, true, 10),
  ('Corte + barba', 60, 0, true, 20),
  ('Perfilado de barba', 30, 6000, true, 30)
on conflict do nothing;

insert into public.opening_hours (weekday, open, start_time, end_time, break_start, break_end)
values
  (0, false, '13:00', '21:00', null, null),
  (1, false, '13:00', '21:00', null, null),
  (2, true, '13:00', '21:00', null, null),
  (3, true, '13:00', '21:00', null, null),
  (4, true, '13:00', '21:00', null, null),
  (5, true, '13:00', '21:00', null, null),
  (6, true, '13:00', '21:00', null, null)
on conflict (weekday) do nothing;

insert into public.app_settings (id, notification_email, business_address, maps_url, max_days_ahead, slot_step)
values (true, 'barberia.marianomartinez@gmail.com', '', 'https://maps.app.goo.gl/UzPPS1nmSLwza3BL9?g_st=ic', 21, 30)
on conflict (id) do nothing;

alter table public.services enable row level security;
alter table public.opening_hours enable row level security;
alter table public.reservations enable row level security;
alter table public.app_settings enable row level security;
alter table public.availability_overrides enable row level security;
alter table public.blocked_slots enable row level security;

drop policy if exists "Public can read active services" on public.services;
create policy "Public can read active services"
  on public.services
  for select
  using (active = true);

drop policy if exists "Authenticated admin can manage services" on public.services;
create policy "Authenticated admin can manage services"
  on public.services
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Public can read opening hours" on public.opening_hours;
create policy "Public can read opening hours"
  on public.opening_hours
  for select
  using (true);

drop policy if exists "Public can read availability overrides" on public.availability_overrides;
create policy "Public can read availability overrides"
  on public.availability_overrides
  for select
  using (true);

drop policy if exists "Authenticated admin can manage availability overrides" on public.availability_overrides;
create policy "Authenticated admin can manage availability overrides"
  on public.availability_overrides
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Public can read blocked slots" on public.blocked_slots;
create policy "Public can read blocked slots"
  on public.blocked_slots
  for select
  using (true);

drop policy if exists "Authenticated admin can manage blocked slots" on public.blocked_slots;
create policy "Authenticated admin can manage blocked slots"
  on public.blocked_slots
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated admin can manage opening hours" on public.opening_hours;
create policy "Authenticated admin can manage opening hours"
  on public.opening_hours
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Public can read confirmed reservation slots" on public.reservations;

drop policy if exists "Public can read reservations for MVP admin" on public.reservations;
drop policy if exists "Authenticated admin can read reservations" on public.reservations;
create policy "Authenticated admin can read reservations"
  on public.reservations
  for select
  to authenticated
  using (true);

drop policy if exists "Public can cancel reservations for MVP admin" on public.reservations;
drop policy if exists "Authenticated admin can cancel reservations" on public.reservations;
create policy "Authenticated admin can cancel reservations"
  on public.reservations
  for update
  to authenticated
  using (true)
  with check (status in ('confirmed', 'cancelled'));

drop policy if exists "Public can manage services for MVP admin" on public.services;

drop policy if exists "Public can manage opening hours for MVP admin" on public.opening_hours;

drop policy if exists "Public can manage settings for MVP admin" on public.app_settings;
drop policy if exists "Public can read settings" on public.app_settings;
create policy "Public can read settings"
  on public.app_settings
  for select
  using (true);

drop policy if exists "Authenticated admin can manage settings" on public.app_settings;
create policy "Authenticated admin can manage settings"
  on public.app_settings
  for all
  to authenticated
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant select on public.services to anon, authenticated;
grant select on public.opening_hours to anon, authenticated;
grant select on public.availability_overrides to anon, authenticated;
grant select on public.blocked_slots to anon, authenticated;
grant select on public.reservation_slots to anon, authenticated;
grant select on public.app_settings to anon, authenticated;
grant select, update on public.reservations to authenticated;
grant select, update on public.reservations to service_role;
grant insert, update on public.services to authenticated;
grant insert, update on public.opening_hours to authenticated;
grant insert, update on public.availability_overrides to authenticated;
grant insert, update, delete on public.blocked_slots to authenticated;
grant insert, update on public.app_settings to authenticated;
grant execute on function public.create_reservation(
  uuid,
  text,
  integer,
  integer,
  date,
  time,
  text,
  text,
  text,
  text
) to anon, authenticated;
grant execute on function public.get_reservation_by_token(text) to anon, authenticated;
grant execute on function public.cancel_reservation_by_token(text) to anon, authenticated;
grant execute on function public.reschedule_reservation_by_token(text, uuid, text, integer, integer, date, time) to anon, authenticated;
