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

alter table public.reservations
  add column if not exists manage_token text not null default encode(gen_random_bytes(24), 'hex');

create unique index if not exists reservations_manage_token_idx
  on public.reservations (manage_token);

alter table public.availability_overrides enable row level security;

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
  schedule_open boolean;
  schedule_start time;
  schedule_end time;
  schedule_break_start time;
  schedule_break_end time;
begin
  perform pg_advisory_xact_lock(hashtext(p_date::text));

  select
    coalesce(ao.open, oh.open),
    coalesce(ao.start_time, oh.start_time),
    coalesce(ao.end_time, oh.end_time),
    coalesce(ao.break_start, oh.break_start),
    coalesce(ao.break_end, oh.break_end)
  into
    schedule_open,
    schedule_start,
    schedule_end,
    schedule_break_start,
    schedule_break_end
  from public.opening_hours oh
  left join public.availability_overrides ao on ao.date = p_date
  where oh.weekday = extract(dow from p_date)::integer;

  if not coalesce(schedule_open, false) then
    raise exception 'day_closed';
  end if;

  if p_time < schedule_start or (p_time + make_interval(mins => p_duration))::time > schedule_end then
    raise exception 'outside_opening_hours';
  end if;

  if schedule_break_start is not null
    and schedule_break_end is not null
    and p_time < schedule_break_end
    and schedule_break_start < (p_time + make_interval(mins => p_duration))::time
  then
    raise exception 'break_unavailable';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.status = 'confirmed'
      and r.date = p_date
      and p_time < (r.time + make_interval(mins => r.duration))
      and r.time < (p_time + make_interval(mins => p_duration))
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
    p_service_id,
    p_service_name,
    p_duration,
    p_price,
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
  schedule_open boolean;
  schedule_start time;
  schedule_end time;
  schedule_break_start time;
  schedule_break_end time;
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

  select
    coalesce(ao.open, oh.open),
    coalesce(ao.start_time, oh.start_time),
    coalesce(ao.end_time, oh.end_time),
    coalesce(ao.break_start, oh.break_start),
    coalesce(ao.break_end, oh.break_end)
  into
    schedule_open,
    schedule_start,
    schedule_end,
    schedule_break_start,
    schedule_break_end
  from public.opening_hours oh
  left join public.availability_overrides ao on ao.date = p_date
  where oh.weekday = extract(dow from p_date)::integer;

  if not coalesce(schedule_open, false) then
    raise exception 'day_closed';
  end if;

  if p_time < schedule_start or (p_time + make_interval(mins => p_duration))::time > schedule_end then
    raise exception 'outside_opening_hours';
  end if;

  if schedule_break_start is not null
    and schedule_break_end is not null
    and p_time < schedule_break_end
    and schedule_break_start < (p_time + make_interval(mins => p_duration))::time
  then
    raise exception 'break_unavailable';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.status = 'confirmed'
      and r.id <> current_reservation.id
      and r.date = p_date
      and p_time < (r.time + make_interval(mins => r.duration))
      and r.time < (p_time + make_interval(mins => p_duration))
  ) then
    raise exception 'slot_unavailable';
  end if;

  update public.reservations
  set
    service_id = p_service_id,
    service_name = p_service_name,
    duration = p_duration,
    price = p_price,
    date = p_date,
    time = p_time
  where id = current_reservation.id
  returning * into updated;

  return updated;
end;
$$;

grant execute on function public.get_reservation_by_token(text) to anon, authenticated;
grant execute on function public.cancel_reservation_by_token(text) to anon, authenticated;
grant execute on function public.reschedule_reservation_by_token(text, uuid, text, integer, integer, date, time) to anon, authenticated;
grant select on public.availability_overrides to anon, authenticated;
grant insert, update on public.availability_overrides to authenticated;
