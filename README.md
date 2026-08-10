# JoppeDS Studio's — website

Portfolio-site op GitHub Pages, met contactformulier, bezoekersstatistieken,
een aanvraagpagina voor klanten en een beveiligde admin.

---

## Wat er waar draait

GitHub Pages serveert alleen bestanden. Het kan niets opslaan en geen
wachtwoorden controleren. **Supabase** (ook gratis) doet dat deel.

| Onderdeel | Waar |
|---|---|
| De website zelf | GitHub Pages |
| Berichten, aanvragen, statistieken | Supabase database |
| Inloggen op de admin | Supabase Auth |
| Teksten, projecten en reviews | Supabase database |

De sleutel in `assets/js/config.js` is de *anon key*. Die mag publiek zijn en
geeft op zichzelf geen toegang. Wat wel of niet mag, staat in de Row Level
Security-regels in `supabase-setup.sql`, en die draaien op de servers van
Supabase. Zet daar nooit de **service_role** key.

---

## Bij een update: voer het SQL-script opnieuw uit

Er zijn twee nieuwe tabellen en twee databasefuncties bijgekomen voor de
aanvraagpagina. Ga naar Supabase → **SQL Editor** → plak `supabase-setup.sql`
volledig → **Run**. Opnieuw uitvoeren is veilig: bestaande berichten,
statistieken en inhoud blijven staan.

---

## De aanvraagpagina

`aanvraag.html` is de pagina waar klanten hun project in detail beschrijven.

**Hoe het werkt**

1. Iemand stuurt je een bericht via het contactformulier.
2. Lijkt het interessant? Ga in de admin naar **Aanvragen** → **Toegangscodes**
   → vul een label in (bijvoorbeeld "Warande Kortrijk") → **Code genereren**.
3. Klik **Kopieer**. Je krijgt een kant-en-klaar mailtje met de code en de link
   op je klembord.
4. De klant vult de code in en krijgt het formulier: werktitel, beschrijving,
   doel, soort content, platform, stijl, referenties, budget, deadline, en een
   link naar zijn Google Drive-map met beeldmateriaal.
5. De aanvraag komt binnen in je admin, met een referentienummer.

**Waarom codes en geen open formulier**

Zo krijg je geen willekeurige of spam-aanvragen, en weet je bij elke aanvraag
al wie het is. Elke code werkt één keer en vervalt automatisch na de termijn
die je koos.

**Hoe de codes beveiligd zijn**

De codetabel is volledig afgeschermd: bezoekers kunnen er niets uit lezen. Het
controleren en indienen gebeurt via twee databasefuncties die alleen antwoorden
op "klopt deze ene code" — nooit met een lijst. Zonder die aanpak zou iemand
met de anon key alle codes kunnen uitlezen.

Codes bestaan uit 8 tekens uit een alfabet zonder verwarrende letters
(geen O/0, geen I/1/L). Dat zijn ruim duizend miljard combinaties, dus raden
heeft geen zin, en overtypen gaat foutloos.

---

## De admin

Ga naar `.../admin.html` en log in.

**Berichten** — alles uit het contactformulier. Antwoorden, als gelezen
markeren, verwijderen.

**Aanvragen** — projectaanvragen met titel, naam, status en datum in de lijst.
Klik **Bekijk** voor alle details in een venster. Daar zet je de status
(nieuw → in behandeling → goedgekeurd → afgerond, of afgewezen), schrijf je een
interne notitie die alleen jij ziet, en mail je de klant met één klik. Bovenaan
beheer je de toegangscodes. Filter de lijst op status met de knoppen erboven.

**Bezoekers** — bezoeken en unieke bezoekers over 7, 30 of 90 dagen, een
staafgrafiek per dag, waar bezoekers vandaan komen, welke pagina's, en het
soort toestel. Daarnaast het aantal berichten, hoeveel er ongelezen zijn,
hoeveel aanvragen openstaan en hoeveel codes nog bruikbaar zijn.

**Inhoud** — alle teksten, projecten, reviews en opleidingen. Elke sectie klapt
open en dicht zodat het overzichtelijk blijft. Klik **Wijzigingen opslaan** en
herlaad de site.

---

## Reviews

Onder de projecten staat een reviewsectie met sterren. Beheer die via
**Inhoud** → **Reviews**: naam, functie of bedrijf, beoordeling van 1 tot 5
sterren, en de tekst. Kies "Geen sterren tonen" als je bij een bepaalde review
liever alleen het citaat laat staan.

Staan er geen reviews, dan verdwijnt de hele sectie automatisch van de site.
Je hoeft dus niets uit te zetten zolang je er nog geen hebt.

---

## Bezoekersstatistieken

**Wat je niet kan zien: wie er langskomt.** Namen, e-mailadressen en
IP-adressen worden bewust niet opgeslagen. Geen enkele analysetool toont je de
naam van een gewone bezoeker. Wat je wel krijgt zijn aantallen en herkomst.

Omdat er geen cookie gezet wordt en er geen persoonsgegevens bijgehouden
worden, heb je **geen cookiebanner nodig** en zit je goed met de GDPR.
Bezoekers met "Do Not Track" aan worden niet geteld. Lokaal testen telt ook
niet mee.

Wil je later land, browserversie en bezoekduur erbij: **GoatCounter** of
**Cloudflare Web Analytics** zijn gratis en privacyvriendelijk. Die cijfers
bekijk je dan wel op hun site, niet in je eigen admin.

---

## Afbeeldingen

| Bestand | Waar | Verhouding |
|---|---|---|
| `logo.svg` | Logo en favicon | vierkant |
| `joppe.jpg` | Over mij | 4:5 staand |
| `youtube-kanaal.jpg` | Project | 16:9 |
| `podcast.jpg` | Project | 16:9 |
| `talkshow.jpg` | Project | 16:9 |
| `promo.jpg` | Project | 16:9 |
| `thumbnails.jpg` | Project | 16:9 |

Nieuw project? Vul in de admin het veld **Bestandsnaam** in (bijvoorbeeld
`aftermovie`) en zet `assets/img/aftermovie.jpg` in de repo. Of plak een
volledige link in **Link naar afbeelding**.

> **Tip: verklein je foto's.** Enkele van je afbeeldingen zijn nu 4K en bijna
> 2 MB. Ze worden op de site nooit groter dan 1600 px breed getoond. Sla ze op
> als JPEG op 1600 × 900 met kwaliteit 80 — dat scheelt bezoekers op mobiele
> data al snel enkele seconden laadtijd. `promo.jpg` (1,9 MB) is de grootste
> winst.

---

## Bestanden

```
index.html              De publieke site
aanvraag.html           Projectaanvraag met toegangscode
admin.html              De beveiligde admin
supabase-setup.sql      Database + beveiligingsregels
.nojekyll               Nodig zodat GitHub Pages alles serveert
README.md               Dit bestand
assets/
  css/style.css         Stijl van site en aanvraagpagina
  css/admin.css         Stijl van de admin
  js/config.js          Supabase-sleutels
  js/content.js         Standaardinhoud + database-helper
  js/main.js            Logica van de site
  js/aanvraag.js        Logica van de aanvraagpagina
  js/analytics.js       Bezoekersteller
  js/admin.js           Logica van de admin
  img/                  Afbeeldingen
```

---

## Als er iets misgaat

**Inloggen lukt niet** — controleer dat `SUPABASE_URL` er zo uitziet:
`https://xxxx.supabase.co`, zonder `/rest/v1/` erachter. Controleer ook of je
gebruiker bevestigd is in Authentication → Users.

**Een code werkt niet** — ga in de admin naar **Aanvragen** → **Toegangscodes**
→ **Controleer de installatie**. Die test loopt de vier onderdelen af (twee
tabellen, twee databasefuncties) en zegt precies welk stuk ontbreekt. Bijna
altijd is het antwoord: het SQL-script opnieuw uitvoeren.

Werkt de test wel maar de code niet? Kopieer de code met de knop **Kopieer
code**, niet met **Kopieer mail** — die tweede zet het hele bericht op je
klembord. Het codeveld vist een code overigens zelf uit geplakte tekst, dus
beide zouden moeten lukken.

**Foto bij "Over mij" verschijnt niet** — controleer of het bestand exact
`assets/img/joppe.jpg` heet, met kleine letters.

**Site toont de oude tekst** — herlaad met Ctrl+F5.

**Berichten of aanvragen komen niet binnen** — open F12 → Console op de
betreffende pagina en kijk welke fout er staat bij het versturen.
