-- Event Manager database: run this entire file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.shows (
  id uuid primary key default gen_random_uuid(),
  date_label text not null,
  time text not null,
  venue text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique(date_label, time)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  booking_id text,
  name text not null,
  phone text not null default '',
  show_id uuid not null references public.shows(id) on update cascade on delete restrict,
  date_label text not null,
  time text not null,
  venue text not null default '',
  zone text not null default '',
  quantity integer not null check (quantity > 0),
  status text not null default 'pending' check (status in ('pending','checked_in')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seats (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  date_label text not null,
  time text not null,
  zone text not null check (zone in ('A','B')),
  row_label text not null,
  number integer not null,
  seat_code text generated always as (row_label || number::text) stored,
  status text not null default 'available' check (status in ('available','blocked')),
  unique(show_id, zone, row_label, number)
);

create table if not exists public.booking_seats (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  seat_id uuid not null references public.seats(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  unique(seat_id)
);

create table if not exists public.booking_slips (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

insert into public.shows(date_label,time,venue,sort_order) values
 ('18 ก.ย.','19:00','',1),
 ('19 ก.ย.','14:00','',2),
 ('19 ก.ย.','18:00','',3),
 ('20 ก.ย.','14:00','',4),
 ('20 ก.ย.','18:00','',5)
on conflict(date_label,time) do nothing;

insert into public.seats(show_id,date_label,time,zone,row_label,number)
select s.id,s.date_label,s.time,z.zone,r.row_label,n.number
from public.shows s
cross join (values ('A'),('B')) z(zone)
cross join (select chr(x) as row_label from generate_series(ascii('A'),ascii('M')) x) r
cross join lateral (
  select n as number from generate_series(1,6) n where z.zone='B'
  union all
  select n as number from generate_series(7,12) n where z.zone='A'
) n
on conflict(show_id,zone,row_label,number) do nothing;

-- Seat layout uses A zone columns 12..7 and B zone columns 6..1; all 1..12 are stored.

create or replace function public.assign_booking_seats(p_booking_id uuid, p_seat_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  wanted integer;
  actual integer;
  bad integer;
begin
  select * into b from public.bookings where id=p_booking_id for update;
  if not found then raise exception 'booking not found'; end if;
  wanted := b.quantity;
  actual := coalesce(array_length(p_seat_ids,1),0);
  if actual <> wanted then raise exception 'seat count mismatch: need %, got %',wanted,actual; end if;
  if (select count(*) from (select distinct unnest(p_seat_ids)) q) <> wanted then raise exception 'duplicate seats selected'; end if;

  -- Lock seats in a deterministic order so two staff devices cannot safely claim the same seat.
  perform 1 from public.seats where id = any(p_seat_ids) order by id for update;
  select count(*) into actual from public.seats where id = any(p_seat_ids);
  if actual <> wanted then raise exception 'one or more seats do not exist'; end if;

  select count(*) into bad
  from public.seats s
  where s.id=any(p_seat_ids) and (s.show_id<>b.show_id or s.status='blocked');
  if bad>0 then raise exception 'seat is blocked or belongs to another show'; end if;

  if exists (
    select 1 from public.booking_seats bs
    join public.seats s on s.id=bs.seat_id
    where bs.seat_id=any(p_seat_ids) and bs.booking_id<>p_booking_id
  ) then raise exception 'already assigned'; end if;

  delete from public.booking_seats where booking_id=p_booking_id;
  insert into public.booking_seats(booking_id,seat_id)
  select p_booking_id, unnest(p_seat_ids);

  update public.bookings set updated_at=now() where id=p_booking_id;
end;
$$;

grant execute on function public.assign_booking_seats(uuid,uuid[]) to anon, authenticated;

-- Public storage bucket for the staff app. For a production app with authentication,
-- replace these policies with authenticated-user policies.
insert into storage.buckets(id,name,public) values ('slips','slips',true)
on conflict(id) do update set public=true;

alter table public.shows enable row level security;
alter table public.bookings enable row level security;
alter table public.seats enable row level security;
alter table public.booking_seats enable row level security;
alter table public.booking_slips enable row level security;

-- This app currently has no staff login. These policies intentionally allow the venue's
-- staff devices to use the shared app. Add Supabase Auth before exposing the URL publicly.
do $$ begin
  create policy "staff can read shows" on public.shows for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "staff can manage bookings" on public.bookings for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "staff can manage seats" on public.seats for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "staff can manage booking seats" on public.booking_seats for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "staff can manage slips" on public.booking_slips for all to anon, authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "public slip read" on storage.objects for select to anon, authenticated using (bucket_id='slips');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "staff slip upload" on storage.objects for insert to anon, authenticated with check (bucket_id='slips');
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "staff slip delete" on storage.objects for delete to anon, authenticated using (bucket_id='slips');
exception when duplicate_object then null; end $$;

-- Enable realtime on the tables the UI listens to. If your project already has these
-- tables in the publication, these statements can safely be skipped.
do $$ begin alter publication supabase_realtime add table public.bookings; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.booking_seats; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.seats; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.shows; exception when duplicate_object then null; end $$;
