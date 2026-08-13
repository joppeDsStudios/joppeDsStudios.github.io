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
create table if not exists public.project_requests (
  id          uuid primary key default gen_random_uuid(),
  referentie  text unique not null,
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
-- Voor wie deze tabellen al had staan: de kolom "code" van het oude
-- codesysteem mag weg, en "soort" gebruiken we niet meer.
alter table public.project_requests drop column if exists code;
alter table public.project_requests drop column if exists soort;


create index if not exists project_requests_created_at_idx
  on public.project_requests (created_at desc);


-- ---------------------------------------------------------------------------
--  5b. Projectvolgsysteem
--  ---------------------------------------------------------------------------
--  Elke aanvraag krijgt een volgcode. Daarmee kan de klant op de statuspagina
--  zien hoe ver het project staat, opgeleverd werk bekijken en feedback geven.
--  De code geeft alleen toegang tot dat ene project.
-- ---------------------------------------------------------------------------

alter table public.project_requests
  add column if not exists volgcode        text unique,
  add column if not exists pakket          text,
  add column if not exists fase            text not null default 'aangevraagd',
  add column if not exists rondes          integer not null default 2,
  add column if not exists rondes_op       integer not null default 0,
  add column if not exists levering        timestamptz,
  add column if not exists klantnota       text,
  add column if not exists afwijsreden     text,
  add column if not exists goedgekeurd_op  timestamptz,
  add column if not exists betaling_nodig  boolean not null default false,
  add column if not exists betaling_bedrag text,
  add column if not exists betaling_link   text,
  add column if not exists betaald         boolean not null default false,
  add column if not exists verwijder_op    timestamptz,
  add column if not exists prijs           text,
  add column if not exists gratis          boolean not null default false,
  add column if not exists contract_tekst  text,
  add column if not exists contract_naam   text,
  add column if not exists contract_op     timestamptz,
  add column if not exists extra_gevraagd  text;

-- Opgeleverd werk: montages, thumbnails, previews
create table if not exists public.project_files (
  id           uuid primary key default gen_random_uuid(),
  aanvraag_id  uuid not null references public.project_requests(id) on delete cascade,
  created_at   timestamptz not null default now(),
  titel        text not null,
  soort        text not null default 'video',
  url          text not null,
  notitie      text,
  ronde        integer not null default 1,
  status       text not null default 'open',
  zichtbaar    boolean not null default true,
  finaal       boolean not null default false
);

-- Voor wie deze tabel al had staan
alter table public.project_files
  add column if not exists finaal boolean not null default false;

create index if not exists project_files_aanvraag_idx
  on public.project_files (aanvraag_id, created_at desc);

-- Berichten tussen jou en de klant, per project
create table if not exists public.project_berichten (
  id           uuid primary key default gen_random_uuid(),
  aanvraag_id  uuid not null references public.project_requests(id) on delete cascade,
  levering_id  uuid references public.project_files(id) on delete set null,
  created_at   timestamptz not null default now(),
  van          text not null default 'klant',
  bericht      text not null,
  gelezen      boolean not null default false
);

create index if not exists project_berichten_idx
  on public.project_berichten (aanvraag_id, created_at);


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
alter table public.project_requests enable row level security;
alter table public.reviews             enable row level security;
alter table public.reviews          enable row level security;
alter table public.project_files    enable row level security;
alter table public.project_berichten enable row level security;


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



-- ---- Opgeleverd werk en projectberichten ----------------------------------
--  Ook hier geen enkele regel voor anon: de klant komt er alleen bij via de
--  functies onderaan, en enkel met de volgcode van zijn eigen project.

drop policy if exists "alleen ingelogd beheert leveringen" on public.project_files;
create policy "alleen ingelogd beheert leveringen"
  on public.project_files for all to authenticated using (true) with check (true);

drop policy if exists "alleen ingelogd beheert projectberichten" on public.project_berichten;
create policy "alleen ingelogd beheert projectberichten"
  on public.project_berichten for all to authenticated using (true) with check (true);


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


-- Dien een aanvraag in. Controleert de code opnieuw, slaat de aanvraag op en
-- zet de code meteen op gebruikt zodat hij geen tweede keer werkt.


-- Een prijsaanvraag heeft geen code nodig: die komt van je eigen prijzenpagina.
-- De controle op inhoud en lengte gebeurt hier, zodat een bezoeker niets
-- rechtstreeks in de tabel kan schrijven.
create or replace function public.submit_open_request(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ref  text;
  volg text;
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

  ref := 'PR-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  volg := 'JDS-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4))
                || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));

  -- Het aantal rondes wordt hier vastgelegd zoals het pakket op dít moment
  -- is. Verander je later een pakket of haal je het weg, dan blijft dit
  -- project gewoon werken met wat er toen afgesproken was.
  insert into project_requests
    (referentie, naam, email, titel, data, volgcode, pakket, rondes, fase, status)
  values (
    ref,
    btrim(p_data->>'naam'),
    btrim(p_data->>'email'),
    coalesce(nullif(btrim(p_data->>'titel'), ''), 'Naamloos project'),
    p_data,
    volg,
    nullif(btrim(coalesce(p_data->>'pakket', '')), ''),
    greatest(0, least(9, coalesce((p_data->>'rondes')::int, 2))),
    'aangevraagd',
    'nieuw'
  );

  return jsonb_build_object('ok', true, 'referentie', ref, 'volgcode', volg);
end;
$$;



-- ---------------------------------------------------------------------------
--  Projectvolgsysteem
--  ---------------------------------------------------------------------------
--  De klant heeft alleen zijn volgcode. Deze functies geven precies terug wat
--  hij mag zien van zijn eigen project, en niets meer: geen interne notities,
--  geen e-mailadressen van anderen, geen lijst van andere projecten.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
--  Het project ophalen met de volgcode
--  ---------------------------------------------------------------------------
--  Geeft precies terug wat de klant mag zien. Je interne notitie, je marges
--  en alle andere projecten blijven onbereikbaar.
--  Downloadlinks worden pas meegestuurd in de fase "download" en daarna, en
--  alleen voor bestanden die als finaal gemarkeerd zijn.
-- ---------------------------------------------------------------------------

create or replace function public.haal_traject(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a    record;
  best jsonb;
  ber  jsonb;
  mag  boolean;
begin
  perform public.ruim_projecten_op();

  select * into a from project_requests where volgcode = upper(btrim(p_code));
  if not found then
    return jsonb_build_object('ok', false, 'reden', 'onbekend');
  end if;

  -- Downloaden mag pas als het project daar is aanbeland en, indien van
  -- toepassing, de betaling gebeurd is.
  mag := a.fase in ('download', 'afgewerkt')
         and (a.gratis = true or a.betaling_nodig = false or a.betaald = true);

  -- Van een versie die nog niet vrijgegeven is, sturen we bewust GEEN volledige
  -- link mee: alleen het id dat nodig is om het bestand in beeld te tonen.
  -- Zo staat er nergens een adres dat rechtstreeks naar het bestand leidt,
  -- ook niet in het antwoord van de server.
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]'::jsonb) into best
    from (
      select id, created_at, titel, soort, notitie, ronde, status, finaal,
             -- alleen het kijk-id, nooit de bewerkbare deellink
             case
               when url ~ '/file/d/([A-Za-z0-9_-]{10,})'
                 then substring(url from '/file/d/([A-Za-z0-9_-]{10,})')
               when url ~ '[?&]id=([A-Za-z0-9_-]{10,})'
                 then substring(url from '[?&]id=([A-Za-z0-9_-]{10,})')
               else null
             end as drive_id,
             case
               when url ~ '(youtube\.com/(watch\?v=|embed/|live/|shorts/)|youtu\.be/)'
                 then substring(url from '(?:youtube\.com/(?:watch\?v=|embed/|live/|shorts/)|youtu\.be/)([A-Za-z0-9_-]{6,})')
               else null
             end as youtube_id,
             case when finaal and mag then url else null end as download_url
        from project_files
       where aanvraag_id = a.id and zichtbaar = true
    ) x;

  select coalesce(jsonb_agg(y order by y.created_at), '[]'::jsonb) into ber
    from (
      select id, created_at, van, bericht, levering_id
        from project_berichten
       where aanvraag_id = a.id
    ) y;

  return jsonb_build_object(
    'ok', true,
    'titel', a.titel,
    'naam', a.naam,
    'pakket', a.pakket,
    'referentie', a.referentie,
    'aangevraagd', a.created_at,
    'fase', a.fase,
    'afwijsreden', a.afwijsreden,
    'rondes', a.rondes,
    'rondes_op', a.rondes_op,
    'rondes_over', greatest(0, a.rondes - a.rondes_op),
    'levering', a.levering,
    'nota', a.klantnota,
    'betaling_nodig', a.betaling_nodig,
    'betaling_bedrag', a.betaling_bedrag,
    'betaling_link', a.betaling_link,
    'betaald', a.betaald,
    'prijs', a.prijs,
    'gratis', a.gratis,
    'contract_tekst', a.contract_tekst,
    'contract_naam', a.contract_naam,
    'contract_op', a.contract_op,
    'extra_gevraagd', a.extra_gevraagd,
    'mag_downloaden', mag,
    'verwijder_op', a.verwijder_op,
    'bestanden', best,
    'berichten', ber
  );
end;
$$;


-- ---------------------------------------------------------------------------
--  Accenten weghalen zonder extra uitbreiding te moeten installeren
-- ---------------------------------------------------------------------------

create or replace function public.unaccent_simpel(p text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(p, ''),
    'àáâãäåèéêëìíîïòóôõöùúûüçñýÿÀÁÂÃÄÅÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜÇÑÝ',
    'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY'
  );
$$;


-- ---------------------------------------------------------------------------
--  De klant tekent de overeenkomst
--  ---------------------------------------------------------------------------
--  Pas als dit gebeurd is, gaat het project verder. Bij een gratis project is
--  er niets te tekenen en slaat het traject deze stap over.
--  De tekst zoals die op het moment van tekenen gold, wordt mee bewaard.
--  Verandert de tekst later, dan blijft staan waar de klant echt mee akkoord
--  ging.
-- ---------------------------------------------------------------------------

create or replace function public.teken_contract(p_code text, p_naam text, p_akkoord boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a record;
begin
  select * into a from project_requests where volgcode = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reden', 'onbekend'); end if;

  if a.fase <> 'contract' then
    return jsonb_build_object('ok', false, 'reden', 'fase');
  end if;
  if p_akkoord is not true then
    return jsonb_build_object('ok', false, 'reden', 'geenakkoord');
  end if;
  if length(btrim(coalesce(p_naam, ''))) < 3 then
    return jsonb_build_object('ok', false, 'reden', 'naam');
  end if;

  -- De handtekening moet overeenkomen met de naam uit de aanvraag. We kijken
  -- soepel: hoofdletters, accenten, leestekens en dubbele spaties tellen niet
  -- mee. Wie "jan de smet" tekent voor "Jan De Smet" komt dus gewoon door.
  if translate(lower(regexp_replace(btrim(p_naam), '[^[:alnum:] ]', '', 'g')),
               'àáâãäåèéêëìíîïòóôõöùúûüýÿñç', 'aaaaaaeeeeiiiiooooouuuuyync')
     is distinct from
     translate(lower(regexp_replace(btrim(a.naam), '[^[:alnum:] ]', '', 'g')),
               'àáâãäåèéêëìíîïòóôõöùúûüýÿñç', 'aaaaaaeeeeiiiiooooouuuuyync')
  then
    return jsonb_build_object('ok', false, 'reden', 'naamfout');
  end if;

  -- De handtekening moet overeenkomen met de naam uit de aanvraag.
  -- We vergelijken soepel: hoofdletters, dubbele spaties, punten en accenten
  -- maken niet uit. Iemand anders zijn naam intypen lukt wel niet.
  if regexp_replace(lower(unaccent_simpel(btrim(p_naam))), '[^a-z]', '', 'g')
     <> regexp_replace(lower(unaccent_simpel(btrim(a.naam))), '[^a-z]', '', 'g') then
    return jsonb_build_object('ok', false, 'reden', 'naamfout',
                              'verwacht', a.naam);
  end if;

  update project_requests
     set contract_naam = btrim(p_naam),
         contract_op   = now(),
         fase          = 'ingepland'
   where id = a.id;

  insert into project_berichten (aanvraag_id, van, bericht)
  values (a.id, 'systeem',
          btrim(p_naam) || ' tekende de overeenkomst voor ' ||
          coalesce(nullif(a.prijs, ''), 'het afgesproken bedrag') || '.');

  return jsonb_build_object('ok', true);
end;
$$;


-- ---------------------------------------------------------------------------
--  De klant vraagt een extra feedbackronde
--  ---------------------------------------------------------------------------
--  Zijn de rondes uit het pakket op, dan kan de klant nog vragen om er een
--  bij te krijgen. Dat kent hij zichzelf niet toe: het verzoek komt bij jou
--  terecht en jij beslist.
-- ---------------------------------------------------------------------------

create or replace function public.vraag_extra_ronde(p_code text, p_tekst text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a record;
begin
  select * into a from project_requests where volgcode = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reden', 'onbekend'); end if;
  if a.extra_gevraagd is not null then
    return jsonb_build_object('ok', false, 'reden', 'albezig');
  end if;
  if length(btrim(coalesce(p_tekst, ''))) < 5 then
    return jsonb_build_object('ok', false, 'reden', 'lengte');
  end if;

  update project_requests set extra_gevraagd = btrim(p_tekst) where id = a.id;

  insert into project_berichten (aanvraag_id, van, bericht)
  values (a.id, 'klant', 'Verzoek om een extra feedbackronde: ' || btrim(p_tekst));

  return jsonb_build_object('ok', true);
end;
$$;


-- ---------------------------------------------------------------------------
--  De klant heeft het eindbestand opgehaald
--  ---------------------------------------------------------------------------
--  Daarmee is het project rond. De wisdatum wordt gezet en er komen twee
--  afsluitende berichten in het gesprek.
-- ---------------------------------------------------------------------------

create or replace function public.markeer_gedownload(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a record;
begin
  select * into a from project_requests where volgcode = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reden', 'onbekend'); end if;

  -- Alleen als hij echt mocht downloaden, en nog niet afgerond is
  if a.fase <> 'download' then
    return jsonb_build_object('ok', true, 'gewijzigd', false);
  end if;
  if a.betaling_nodig and not a.betaald and not a.gratis then
    return jsonb_build_object('ok', false, 'reden', 'betaling');
  end if;

  update project_requests
     set fase = 'afgewerkt',
         status = 'afgerond',
         verwijder_op = now() + interval '3 days'
   where id = a.id;

  insert into project_berichten (aanvraag_id, van, bericht)
  values (a.id, 'joppe', 'Bedankt! Hopelijk tot snel!');

  insert into project_berichten (aanvraag_id, van, bericht)
  values (a.id, 'systeem',
          'U mag de pagina verlaten, na 3 dagen wordt het project verwijderd.');

  return jsonb_build_object('ok', true, 'gewijzigd', true);
end;
$$;


-- ---------------------------------------------------------------------------
--  De klant haalde het eindbestand op
--  ---------------------------------------------------------------------------
--  Daarmee is het project rond. De teller van drie dagen begint te lopen.
-- ---------------------------------------------------------------------------

create or replace function public.markeer_gedownload(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a record;
begin
  select * into a from project_requests where volgcode = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reden', 'onbekend'); end if;

  -- Alleen wanneer downloaden echt mocht, en nog niet eerder afgerond.
  if a.fase <> 'download' then
    return jsonb_build_object('ok', true, 'gewijzigd', false);
  end if;
  if a.betaling_nodig and not a.betaald and not a.gratis then
    return jsonb_build_object('ok', false, 'reden', 'betaling');
  end if;

  update project_requests
     set fase = 'afgewerkt',
         status = 'afgerond',
         verwijder_op = now() + interval '3 days'
   where id = a.id;

  insert into project_berichten (aanvraag_id, van, bericht)
  values (a.id, 'joppe', 'Bedankt! Hopelijk tot snel!');

  insert into project_berichten (aanvraag_id, van, bericht)
  values (a.id, 'systeem',
          'U mag de pagina verlaten, na 3 dagen wordt het project verwijderd.');

  return jsonb_build_object('ok', true, 'gewijzigd', true);
end;
$$;


-- ---------------------------------------------------------------------------
--  De klant stuurt een bericht
-- ---------------------------------------------------------------------------

create or replace function public.geef_feedback(p_code text, p_bericht text, p_levering uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a record;
begin
  select * into a from project_requests where volgcode = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reden', 'onbekend'); end if;
  if length(btrim(p_bericht)) < 2 or length(p_bericht) > 4000 then
    return jsonb_build_object('ok', false, 'reden', 'lengte');
  end if;

  insert into project_berichten (aanvraag_id, levering_id, van, bericht)
  values (a.id, p_levering, 'klant', btrim(p_bericht));

  return jsonb_build_object('ok', true);
end;
$$;


-- ---------------------------------------------------------------------------
--  De klant keurt een versie goed
--  ---------------------------------------------------------------------------
--  Daarna gaat het project naar de betaling, of meteen naar downloaden als
--  er niets te betalen valt.
-- ---------------------------------------------------------------------------

create or replace function public.keur_goed(p_code text, p_levering uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a record; l record;
begin
  select * into a from project_requests where volgcode = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reden', 'onbekend'); end if;

  select * into l from project_files where id = p_levering and aanvraag_id = a.id;
  if not found then return jsonb_build_object('ok', false, 'reden', 'onbekend'); end if;
  if a.fase not in ('feedback', 'aanpassen') then
    return jsonb_build_object('ok', false, 'reden', 'fase');
  end if;

  update project_files set status = 'goedgekeurd' where id = l.id;

  update project_requests
     set fase = case when betaling_nodig and not betaald then 'betaling' else 'download' end
   where id = a.id;

  insert into project_berichten (aanvraag_id, levering_id, van, bericht)
  values (a.id, l.id, 'systeem', 'De klant keurde "' || l.titel || '" goed.');

  return jsonb_build_object('ok', true);
end;
$$;


-- ---------------------------------------------------------------------------
--  De klant vraagt een aanpassing
--  ---------------------------------------------------------------------------
--  Dit verbruikt één feedbackronde. Zijn de rondes op, dan wordt de vraag wel
--  doorgegeven, maar telt ze niet mee: jullie spreken dan samen iets af.
-- ---------------------------------------------------------------------------

create or replace function public.vraag_aanpassing(p_code text, p_levering uuid, p_tekst text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare a record; l record; nog integer;
begin
  select * into a from project_requests where volgcode = upper(btrim(p_code));
  if not found then return jsonb_build_object('ok', false, 'reden', 'onbekend'); end if;

  select * into l from project_files where id = p_levering and aanvraag_id = a.id;
  if not found then return jsonb_build_object('ok', false, 'reden', 'onbekend'); end if;

  if length(btrim(p_tekst)) < 5 then
    return jsonb_build_object('ok', false, 'reden', 'lengte');
  end if;
  if a.fase not in ('feedback', 'aanpassen') then
    return jsonb_build_object('ok', false, 'reden', 'fase');
  end if;

  nog := greatest(0, a.rondes - a.rondes_op);

  update project_files set status = 'aanpassing' where id = l.id;

  insert into project_berichten (aanvraag_id, levering_id, van, bericht)
  values (a.id, l.id, 'klant', btrim(p_tekst));

  update project_requests
     set fase = 'aanpassen',
         rondes_op = case when nog > 0 then rondes_op + 1 else rondes_op end
   where id = a.id;

  return jsonb_build_object('ok', true, 'binnen_pakket', nog > 0,
                            'rondes_over', greatest(0, nog - 1));
end;
$$;


-- ---------------------------------------------------------------------------
--  Opruimen
--  ---------------------------------------------------------------------------
--  Een afgewerkt project verdwijnt drie dagen na oplevering, inclusief alle
--  bestanden en berichten. Zo blijft er niets van klantgegevens rondslingeren.
--  Deze functie draait vanzelf telkens iemand de tracker of de admin opent.
-- ---------------------------------------------------------------------------

create or replace function public.ruim_projecten_op()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare weg integer;
begin
  with d as (
    delete from project_requests
     where fase = 'afgewerkt'
       and verwijder_op is not null
       and verwijder_op < now()
    returning 1
  )
  select count(*) into weg from d;
  return coalesce(weg, 0);
end;
$$;


-- Wie mag deze functies aanroepen
revoke all on function public.submit_open_request(jsonb)          from public;
revoke all on function public.haal_traject(text)                  from public;
revoke all on function public.teken_contract(text, text, boolean)  from public;
revoke all on function public.vraag_extra_ronde(text, text)        from public;
revoke all on function public.markeer_gedownload(text)             from public;
revoke all on function public.markeer_gedownload(text)             from public;
revoke all on function public.geef_feedback(text, text, uuid)     from public;
revoke all on function public.keur_goed(text, uuid)               from public;
revoke all on function public.vraag_aanpassing(text, uuid, text)  from public;
revoke all on function public.ruim_projecten_op()                 from public;
grant execute on function public.submit_open_request(jsonb)         to anon, authenticated;
grant execute on function public.haal_traject(text)                 to anon, authenticated;
grant execute on function public.teken_contract(text, text, boolean) to anon, authenticated;
grant execute on function public.vraag_extra_ronde(text, text)       to anon, authenticated;
grant execute on function public.markeer_gedownload(text)            to anon, authenticated;
grant execute on function public.markeer_gedownload(text)            to anon, authenticated;
grant execute on function public.geef_feedback(text, text, uuid)    to anon, authenticated;
grant execute on function public.keur_goed(text, uuid)              to anon, authenticated;
grant execute on function public.vraag_aanpassing(text, uuid, text) to anon, authenticated;
grant execute on function public.ruim_projecten_op()                to authenticated;


-- Zeg tegen de API-laag dat ze de nieuwe tabellen en functies moet oppikken.
-- Zonder dit duurt het soms enkele minuten voor een nieuwe functie bereikbaar
-- is, en krijg je intussen de melding dat de functie niet gevonden wordt.
notify pgrst, 'reload schema';


-- ===========================================================================
--  9. Opslag voor opgeleverd werk
--  ---------------------------------------------------------------------------
--  Hierin komen thumbnails en andere bestanden die je via de admin uploadt.
--  Publiek leesbaar, want de klant moet ze kunnen bekijken via zijn link.
--  Alleen jij, ingelogd, kan er iets in zetten of uit verwijderen.
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('leveringen', 'leveringen', true)
on conflict (id) do nothing;

drop policy if exists "iedereen mag leveringen bekijken" on storage.objects;
create policy "iedereen mag leveringen bekijken"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'leveringen');

drop policy if exists "alleen ingelogd mag leveringen plaatsen" on storage.objects;
create policy "alleen ingelogd mag leveringen plaatsen"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'leveringen');

drop policy if exists "alleen ingelogd mag leveringen verwijderen" on storage.objects;
create policy "alleen ingelogd mag leveringen verwijderen"
  on storage.objects for delete to authenticated
  using (bucket_id = 'leveringen');


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
