-- ===========================================================================
--  JoppeDS Studio's — database opzetten
--  Plak dit volledige bestand in Supabase -> SQL Editor -> Run.
--  Opnieuw uitvoeren is veilig: er gaat niets verloren en niets wordt dubbel
--  aangemaakt.
-- ===========================================================================


-- ---------------------------------------------------------------------------
--  1. Berichten uit het contactformulier
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
--  2. Inhoud van de site (één rij, alles in JSON)
-- ---------------------------------------------------------------------------

create table if not exists public.site_content (
  id          integer primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

insert into public.site_content (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
--  3. Bezoekersstatistieken
--  Bewust GEEN IP-adres of persoonsgegeven. Daardoor geen cookiebanner nodig.
-- ---------------------------------------------------------------------------

create table if not exists public.pageviews (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  sessie      text not null,
  pagina      text not null,
  bron        text,
  toestel     text,
  taal        text
);

create index if not exists pageviews_created_at_idx
  on public.pageviews (created_at desc);


-- ---------------------------------------------------------------------------
--  4. Toegangscodes voor de projectaanvraag
-- ---------------------------------------------------------------------------

create table if not exists public.project_codes (
  code         text primary key,
  created_at   timestamptz not null default now(),
  label        text,
  email        text,
  verloopt_op  timestamptz,
  gebruikt_op  timestamptz
);


-- ---------------------------------------------------------------------------
--  5. Ingediende projectaanvragen
-- ---------------------------------------------------------------------------

create table if not exists public.project_requests (
  id          uuid primary key default gen_random_uuid(),
  referentie  text unique not null,
  code        text references public.project_codes(code) on delete set null,
  created_at  timestamptz not null default now(),
  naam        text not null,
  email       text not null,
  titel       text not null,
  data        jsonb not null default '{}'::jsonb,
  status      text not null default 'nieuw',
  soort       text not null default 'projectaanvraag',
  notitie     text
);

-- Voor wie deze tabel al had staan van een vorige keer
alter table public.project_requests
  add column if not exists soort text not null default 'projectaanvraag';

create index if not exists project_requests_created_at_idx
  on public.project_requests (created_at desc);


-- ---------------------------------------------------------------------------
--  6. Reviews
--  ---------------------------------------------------------------------------
--  Bezoekers kunnen zelf een review schrijven. Die komt binnen met status
--  'wachtend' en verschijnt pas op de site nadat jij hem goedkeurt.
-- ---------------------------------------------------------------------------

create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  naam        text not null,
  rol         text,
  email       text,
  sterren     smallint not null,
  tekst       text not null,
  status      text not null default 'wachtend',
  volgorde    integer not null default 0,
  bron        text not null default 'site',
  constraint reviews_sterren_bereik check (sterren between 1 and 5),
  constraint reviews_status_geldig  check (status in ('wachtend', 'zichtbaar', 'verborgen'))
);

create index if not exists reviews_status_idx
  on public.reviews (status, volgorde, created_at desc);


-- ===========================================================================
--  7. Beveiliging: Row Level Security
--  ---------------------------------------------------------------------------
--  Deze regels draaien op de servers van Supabase. Wie de JavaScript van de
--  site leest, ziet enkel de publieke anon key -- en die geeft precies zoveel
--  toegang als hieronder staat.
-- ===========================================================================

alter table public.messages         enable row level security;
alter table public.site_content     enable row level security;
alter table public.pageviews        enable row level security;
alter table public.project_codes    enable row level security;
alter table public.project_requests enable row level security;
alter table public.reviews          enable row level security;


-- ---- Berichten ------------------------------------------------------------

drop policy if exists "iedereen mag een bericht insturen" on public.messages;
create policy "iedereen mag een bericht insturen"
  on public.messages for insert to anon, authenticated
  with check (
    length(voornaam) between 1 and 80
    and length(naam)  between 1 and 80
    and length(email) between 5 and 160
    and email like '%_@_%._%'
    and length(bericht) between 1 and 4000
    and gelezen = false
  );

drop policy if exists "alleen ingelogd mag berichten lezen" on public.messages;
create policy "alleen ingelogd mag berichten lezen"
  on public.messages for select to authenticated using (true);

drop policy if exists "alleen ingelogd mag berichten bijwerken" on public.messages;
create policy "alleen ingelogd mag berichten bijwerken"
  on public.messages for update to authenticated using (true) with check (true);

drop policy if exists "alleen ingelogd mag berichten verwijderen" on public.messages;
create policy "alleen ingelogd mag berichten verwijderen"
  on public.messages for delete to authenticated using (true);


-- ---- Inhoud van de site ---------------------------------------------------

drop policy if exists "iedereen mag de inhoud lezen" on public.site_content;
create policy "iedereen mag de inhoud lezen"
  on public.site_content for select to anon, authenticated using (true);

drop policy if exists "alleen ingelogd mag de inhoud aanpassen" on public.site_content;
create policy "alleen ingelogd mag de inhoud aanpassen"
  on public.site_content for update to authenticated using (true) with check (id = 1);

drop policy if exists "alleen ingelogd mag de inhoud aanmaken" on public.site_content;
create policy "alleen ingelogd mag de inhoud aanmaken"
  on public.site_content for insert to authenticated with check (id = 1);


-- ---- Bezoekersstatistieken ------------------------------------------------

drop policy if exists "de site mag een bezoek registreren" on public.pageviews;
create policy "de site mag een bezoek registreren"
  on public.pageviews for insert to anon, authenticated
  with check (
    length(sessie) between 4 and 60
    and length(pagina) between 1 and 120
    and (bron is null or length(bron) <= 120)
    and (toestel is null or toestel in ('telefoon', 'tablet', 'computer'))
    and (taal is null or length(taal) <= 5)
  );

drop policy if exists "alleen ingelogd mag statistieken lezen" on public.pageviews;
create policy "alleen ingelogd mag statistieken lezen"
  on public.pageviews for select to authenticated using (true);


-- ---- Codes en aanvragen ---------------------------------------------------
--  Let op: hier staat GEEN enkele regel voor anon.
--  Bezoekers kunnen deze tabellen dus niet lezen en niet schrijven. Ze werken
--  uitsluitend via de twee functies onderaan dit bestand. Zonder deze aanpak
--  zou iemand met de anon key alle codes kunnen uitlezen.

drop policy if exists "alleen ingelogd beheert codes" on public.project_codes;
create policy "alleen ingelogd beheert codes"
  on public.project_codes for all to authenticated using (true) with check (true);

drop policy if exists "alleen ingelogd beheert aanvragen" on public.project_requests;
create policy "alleen ingelogd beheert aanvragen"
  on public.project_requests for all to authenticated using (true) with check (true);


-- ---- Reviews --------------------------------------------------------------

-- Iedereen mag een review insturen, maar altijd als 'wachtend'. Zo kan
-- niemand zichzelf rechtstreeks op de site zetten.
drop policy if exists "iedereen mag een review insturen" on public.reviews;
create policy "iedereen mag een review insturen"
  on public.reviews for insert to anon, authenticated
  with check (
    status = 'wachtend'
    and bron = 'site'
    and volgorde = 0
    and length(btrim(naam)) between 2 and 80
    and (rol is null or length(rol) <= 100)
    and (email is null or length(email) <= 160)
    and sterren between 1 and 5
    and length(btrim(tekst)) between 10 and 1500
  );

drop policy if exists "alleen ingelogd beheert reviews" on public.reviews;
create policy "alleen ingelogd beheert reviews"
  on public.reviews for all to authenticated using (true) with check (true);

-- Let op: er is bewust GEEN leesregel voor anon op de tabel zelf.
-- Bezoekers lezen de reviews via onderstaande weergave, die alleen de
-- goedgekeurde rijen toont en het e-mailadres van de schrijver weglaat.
-- Zonder deze tussenstap zou het e-mailadres van elke reviewer publiek
-- opvraagbaar zijn, want beveiligingsregels werken per rij, niet per kolom.

create or replace view public.reviews_publiek as
  select id, created_at, naam, rol, sterren, tekst, volgorde
    from public.reviews
   where status = 'zichtbaar';

grant select on public.reviews_publiek to anon, authenticated;

-- Supabase geeft nieuwe tabellen normaal automatisch de juiste rechten, maar
-- dat gebeurt alleen als de standaardinstellingen nog intact zijn. Deze twee
-- regels maken het expliciet, zodat het insturen van een review zeker werkt.
grant insert on public.reviews to anon, authenticated;
grant select, update, delete on public.reviews to authenticated;


-- ===========================================================================
--  8. Functies voor de aanvraagpagina
--  ---------------------------------------------------------------------------
--  "security definer" betekent dat deze functies met verhoogde rechten
--  draaien. Ze geven enkel terug wat hieronder staat -- nooit de codetabel
--  zelf. Een bezoeker kan dus alleen controleren of ZIJN code klopt, en niet
--  ontdekken welke codes er verder bestaan.
-- ===========================================================================

-- Controleer een code, zonder iets prijs te geven over andere codes.
create or replace function public.check_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select * into r from project_codes where code = upper(btrim(p_code));

  if not found then
    return jsonb_build_object('geldig', false, 'reden', 'onbekend');
  end if;
  if r.gebruikt_op is not null then
    return jsonb_build_object('geldig', false, 'reden', 'gebruikt');
  end if;
  if r.verloopt_op is not null and r.verloopt_op < now() then
    return jsonb_build_object('geldig', false, 'reden', 'verlopen');
  end if;

  return jsonb_build_object('geldig', true, 'label', coalesce(r.label, ''));
end;
$$;


-- Dien een aanvraag in. Controleert de code opnieuw, slaat de aanvraag op en
-- zet de code meteen op gebruikt zodat hij geen tweede keer werkt.
create or replace function public.submit_request(p_code text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r   record;
  ref text;
begin
  select * into r from project_codes
   where code = upper(btrim(p_code))
   for update;

  if not found then
    return jsonb_build_object('ok', false, 'reden', 'onbekend');
  end if;
  if r.gebruikt_op is not null then
    return jsonb_build_object('ok', false, 'reden', 'gebruikt');
  end if;
  if r.verloopt_op is not null and r.verloopt_op < now() then
    return jsonb_build_object('ok', false, 'reden', 'verlopen');
  end if;

  if coalesce(length(btrim(p_data->>'naam')), 0) < 2
     or coalesce(length(btrim(p_data->>'email')), 0) < 5
     or (p_data->>'email') not like '%_@_%._%'
     or coalesce(length(btrim(p_data->>'titel')), 0) < 2
     or coalesce(length(btrim(p_data->>'beschrijving')), 0) < 10 then
    return jsonb_build_object('ok', false, 'reden', 'onvolledig');
  end if;

  if length(p_data::text) > 30000 then
    return jsonb_build_object('ok', false, 'reden', 'tegroot');
  end if;

  ref := 'AV-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  insert into project_requests (referentie, code, naam, email, titel, data)
  values (
    ref,
    r.code,
    btrim(p_data->>'naam'),
    btrim(p_data->>'email'),
    btrim(p_data->>'titel'),
    p_data
  );

  update project_codes set gebruikt_op = now() where code = r.code;

  return jsonb_build_object('ok', true, 'referentie', ref);
end;
$$;


-- Een prijsaanvraag heeft geen code nodig: die komt van je eigen prijzenpagina.
-- De controle op inhoud en lengte gebeurt hier, zodat een bezoeker niets
-- rechtstreeks in de tabel kan schrijven.
create or replace function public.submit_open_request(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare ref text;
begin
  if coalesce(length(btrim(p_data->>'naam')), 0) < 2
     or coalesce(length(btrim(p_data->>'email')), 0) < 5
     or (p_data->>'email') not like '%_@_%._%'
     or coalesce(length(btrim(p_data->>'beschrijving')), 0) < 10 then
    return jsonb_build_object('ok', false, 'reden', 'onvolledig');
  end if;

  if length(p_data::text) > 30000 then
    return jsonb_build_object('ok', false, 'reden', 'tegroot');
  end if;

  ref := 'PA-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  insert into project_requests (referentie, code, naam, email, titel, data, soort)
  values (
    ref,
    null,
    btrim(p_data->>'naam'),
    btrim(p_data->>'email'),
    coalesce(nullif(btrim(p_data->>'titel'), ''), 'Prijsaanvraag'),
    p_data,
    'prijsaanvraag'
  );

  return jsonb_build_object('ok', true, 'referentie', ref);
end;
$$;


-- Wie mag deze functies aanroepen
revoke all on function public.check_code(text)             from public;
revoke all on function public.submit_request(text, jsonb)  from public;
revoke all on function public.submit_open_request(jsonb)   from public;
grant execute on function public.check_code(text)            to anon, authenticated;
grant execute on function public.submit_request(text, jsonb) to anon, authenticated;
grant execute on function public.submit_open_request(jsonb)  to anon, authenticated;


-- Zeg tegen de API-laag dat ze de nieuwe tabellen en functies moet oppikken.
-- Zonder dit duurt het soms enkele minuten voor een nieuwe functie bereikbaar
-- is, en krijg je intussen de melding dat de functie niet gevonden wordt.
notify pgrst, 'reload schema';


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
