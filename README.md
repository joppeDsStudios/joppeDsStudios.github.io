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

Er zijn tabellen en functies bijgekomen voor de aanvraagpagina en de reviews. Ga naar Supabase → **SQL Editor** → plak `supabase-setup.sql`
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

**Reviews** — de wachtrij met ingestuurde reviews en alles wat op je site
staat. Zie verderop.

**Bezoekers** — bezoeken en unieke bezoekers over 7, 30 of 90 dagen, een
staafgrafiek per dag, waar bezoekers vandaan komen, welke pagina's, en het
soort toestel. Daarnaast het aantal berichten, hoeveel er ongelezen zijn,
hoeveel aanvragen openstaan, hoeveel codes nog bruikbaar zijn, en hoeveel
reviews op je nalezing wachten.

**Inhoud** — alle teksten, projecten, team, prijzen, formulieren, footer en
opleidingen. Elke sectie klapt
open en dicht zodat het overzichtelijk blijft. Klik **Wijzigingen opslaan** en
herlaad de site.

---

## Reviews

Bezoekers kunnen nu zelf een review schrijven. Op je site staat onder de
reviews een knop **Schrijf een review**, en in de footer staat dezelfde link
zodat hij ook bereikbaar is als er nog geen reviews zijn.

**Alles gaat eerst langs jou.** Een ingestuurde review komt binnen met de
status *wacht op nalezing* en staat niet op je site. In de admin, tabblad
**Reviews**, zie je de wachtrij. Daar kan je per review:

- **Op de site zetten** — hij verschijnt meteen bij je reviews
- **Verbergen** — je houdt hem, maar hij is niet zichtbaar
- **Bewerken** — typfouten rechtzetten of de sterren aanpassen
- **Verwijderen** — definitief weg
- **↑ ↓** — de volgorde bepalen van wat op je site staat
- **+ Zelf toevoegen** — voor reviews die je per mail of bericht kreeg

Zonder moderatie zou binnen een week de eerste spam op je portfolio staan.
Vandaar deze tussenstap.

### Waarom het e-mailadres veilig is

De schrijver mag optioneel zijn e-mailadres achterlaten zodat jij hem kan
bereiken. Dat adres mag natuurlijk niet publiek zijn. Beveiligingsregels in
Supabase werken per rij, niet per kolom — zou de site de reviewtabel
rechtstreeks uitlezen, dan kwamen die adressen mee.

Daarom leest je site niet de tabel maar een aparte weergave
(`reviews_publiek`) die alleen goedgekeurde reviews toont en het e-mailadres
weglaat. Alleen jij ziet het, ingelogd in de admin.

### Je bestaande reviews

Reviews werden vroeger ingetypt in het tabblad **Inhoud**. Dat is nu weg, want
twee plaatsen voor hetzelfde is vragen om verwarring. Heb je daar nog reviews
staan, dan verschijnt bovenaan het tabblad Reviews eenmalig een knop om ze
over te nemen. Zolang je dat niet doet, blijven ze gewoon op je site staan.

## Deelafbeelding

`assets/img/deelafbeelding.png` is wat mensen zien als je je link deelt in
WhatsApp, Discord, Instagram of Slack: je logo op je eigen achtergrond met
"JoppeDS Studio's — Create. Analyze. Improve. Repeat.".

De verwijzingen staan in de `<head>` van `index.html` en `aanvraag.html`.
**Belangrijk:** daar staat `https://joppeds.github.io` als adres. Neem je
later een eigen domein, vervang dan die adressen, anders blijft de afbeelding
naar de oude plek wijzen. Zoek op `og:` om ze te vinden.

Deelafbeeldingen worden gecached. Verander je hem, gebruik dan de debugger van
Facebook of LinkedIn om het geheugen te wissen, anders blijf je de oude zien.

---

## Team

Onder "Over mij" kan je een teamsectie tonen: foto, naam, functie en een link
naar iemands social media. Beheer die via **Inhoud** → **Team**.

Staat er niemand in, dan blijft de sectie weg van je site en verdwijnt "Team"
ook uit het menu. Zet de foto's in `assets/img` (vierkant werkt het best, zo'n
800 × 800) en verwijs ernaar, of plak een volledige link.

---

## Prijzen en aanvragen

De prijzensectie staat standaard **uit**. Je zet hem aan via **Inhoud** →
**Prijzen** → het schuifje bovenaan.

**Belangrijk: prijzen en de aanvraagpagina sluiten elkaar uit.** Zodra je de
prijzen aanzet, gebeurt dit automatisch:

- de knop in het menu heet "Prijzen" en brengt bezoekers naar je pakketten
- de link naar de aanvraagpagina verdwijnt uit de footer
- wie `aanvraag.html` toch opent, krijgt een verwijzing naar je pakketten

Klikt iemand bij een pakket op de knop, dan opent een formulier met dat pakket
al ingevuld. Zo'n aanvraag heeft geen code nodig en komt gewoon binnen bij
**Aanvragen**, herkenbaar aan het label "via prijzen".

Zet je de prijzen weer uit, dan werkt de aanvraagpagina met codes gewoon weer.

---

## Beide formulieren aanpassen

Onder **Inhoud** staan **Formulier: prijsaanvraag** en **Formulier:
projectaanvraag**. Daar bepaal je zelf welke vragen er gesteld worden.

Per veld kan je instellen: de vraag, het soort veld (tekst, keuzelijst,
aankruisvakjes, datum, getal, ...), een voorbeeldtekst, uitleg eronder, of het
verplicht is, en of het op halve breedte staat. Velden en hele blokken kan je
toevoegen, verslepen en verwijderen.

Sommige velden zijn gemarkeerd als **vast**: naam, e-mailadres, titel en
beschrijving. Die kan je niet verwijderen, want de database heeft ze nodig om
te weten wie er aanvraagt en waarover het gaat. De tekst erop mag je wel vrij
veranderen.

Bij elke ingediende aanvraag wordt bewaard wélke vraag er precies gesteld werd.
Pas je het formulier later aan, dan blijven oudere aanvragen dus kloppen.

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
  js/formulier.js       Bouwt beide aanvraagformulieren op
  js/analytics.js       Bezoekersteller
  js/admin.js           Logica van de admin
  img/                  Afbeeldingen
```

---

## Als er iets misgaat

**Inloggen lukt niet** — controleer dat `SUPABASE_URL` er zo uitziet:
`https://xxxx.supabase.co`, zonder `/rest/v1/` erachter. Controleer ook of je
gebruiker bevestigd is in Authentication → Users.

**Iets werkt niet (code, review, formulier)** — log in op de admin. Staat er
bovenaan een rode balk, dan ontbreekt er iets in je database en zegt die balk
precies wat. Voor de details: **Aanvragen** → **Toegangscodes** →
**Controleer de installatie**. Die test loopt alle negen onderdelen af (zes tabellen, één
weergave, twee databasefuncties) en zegt precies welk stuk ontbreekt. Bijna
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
