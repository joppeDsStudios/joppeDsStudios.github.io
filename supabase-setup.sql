-- ===========================================================================
--  JoppeDS Studio's — database opzetten
--  Plak dit volledige bestand in Supabase -> SQL Editor -> Run.
--  Je hoeft dit maar één keer te doen.
-- ===========================================================================


-- ---------------------------------------------------------------------------
--  1. Tabel voor de berichten uit het contactformulier
-- ---------------------------------------------------------------------------

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  voornaam    text not null,
  naam        text not null,
  email       text not null,
  bericht     text not null,
  gelezen     boolean not null default false
);

create index if not exists messages_created_at_idx
  on public.messages (created_at desc);


-- ---------------------------------------------------------------------------
--  2. Tabel voor de inhoud van de site (één rij, alles in JSON)
-- ---------------------------------------------------------------------------

create table if not exists public.site_content (
  id          integer primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

insert into public.site_content (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;


-- ===========================================================================
--  3. Beveiliging: Row Level Security
--  ---------------------------------------------------------------------------
--  Dit is het hart van de beveiliging. Deze regels draaien op de servers van
--  Supabase. Wie de JavaScript van de site leest, ziet enkel de publieke
--  anon key -- en die geeft precies zoveel toegang als hieronder staat.
-- ===========================================================================

alter table public.messages     enable row level security;
alter table public.site_content enable row level security;


-- ---- Berichten ------------------------------------------------------------

-- Iedereen mag een bericht insturen, met redelijke grenzen tegen misbruik.
drop policy if exists "iedereen mag een bericht insturen" on public.messages;
create policy "iedereen mag een bericht insturen"
  on public.messages
  for insert
  to anon, authenticated
  with check (
    length(voornaam) between 1 and 80
    and length(naam)  between 1 and 80
    and length(email) between 5 and 160
    and email like '%_@_%._%'
    and length(bericht) between 1 and 4000
    and gelezen = false
  );

-- Alleen wie ingelogd is, kan berichten lezen. Bezoekers dus niet.
drop policy if exists "alleen ingelogd mag berichten lezen" on public.messages;
create policy "alleen ingelogd mag berichten lezen"
  on public.messages
  for select
  to authenticated
  using (true);

drop policy if exists "alleen ingelogd mag berichten bijwerken" on public.messages;
create policy "alleen ingelogd mag berichten bijwerken"
  on public.messages
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "alleen ingelogd mag berichten verwijderen" on public.messages;
create policy "alleen ingelogd mag berichten verwijderen"
  on public.messages
  for delete
  to authenticated
  using (true);


-- ---- Inhoud van de site ---------------------------------------------------

-- De inhoud staat op de publieke site, dus iedereen mag ze lezen.
drop policy if exists "iedereen mag de inhoud lezen" on public.site_content;
create policy "iedereen mag de inhoud lezen"
  on public.site_content
  for select
  to anon, authenticated
  using (true);

-- Alleen wie ingelogd is, kan de inhoud aanpassen.
drop policy if exists "alleen ingelogd mag de inhoud aanpassen" on public.site_content;
create policy "alleen ingelogd mag de inhoud aanpassen"
  on public.site_content
  for update
  to authenticated
  using (true)
  with check (id = 1);

drop policy if exists "alleen ingelogd mag de inhoud aanmaken" on public.site_content;
create policy "alleen ingelogd mag de inhoud aanmaken"
  on public.site_content
  for insert
  to authenticated
  with check (id = 1);


-- ===========================================================================
--  Klaar.
--
--  Nog twee dingen te doen in het Supabase dashboard:
--
--  1) Authentication -> Users -> Add user
--     Maak hier jouw admin-account met e-mailadres en wachtwoord.
--     Vink "Auto Confirm User" aan.
--
--  2) Authentication -> Sign In / Providers -> Email
--     Zet "Allow new users to sign up" UIT.
--     Zo kan niemand anders zelf een account aanmaken.
-- ===========================================================================
