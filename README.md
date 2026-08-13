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


## De admin

Ga naar `.../admin.html` en log in.

**Berichten** — alles uit het contactformulier. Antwoorden, als gelezen
markeren, verwijderen.

**Projecten** — alle projecten met titel, naam, fase en datum, filterbaar per fase.
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



## Diensten en projecten

De dienstensectie staat standaard **uit**. Zet hem aan via **Inhoud** →
**Prijzen** → het schuifje bovenaan. Zolang die uit staat, wijst de knop in je
menu naar je contactformulier.

Klikt iemand bij een pakket op de knop, dan opent een formulier met dat pakket
al ingevuld. Na verzenden krijgt de klant een **volgcode**. Daarmee volgt hij
zijn project op `traject.html`.

Het formulier zelf pas je aan onder **Inhoud** → **Formulier prijsaanvraag**:
per veld de vraag, het soort, of het verplicht is, en of het op halve breedte
staat. Naam, e-mailadres, titel en beschrijving staan gemarkeerd als **vast**
en kan je niet verwijderen — de database heeft ze nodig. De teksten erop mag
je wel vrij veranderen.

---

## De fases van een project

In de admin, tabblad **Projecten**, zie je bij elk project precies één logische
volgende stap.

| Fase | Wat er gebeurt |
|---|---|
| 1 · Goedkeuring | Je vult de **prijs** in en kiest Goedkeuren of Afwijzen. Wil je het gratis doen, vink dan **Gratis** aan: de klant ziet de prijs doorstreept en hoeft niets te tekenen. |
| 2 · Wacht op akkoord | De klant leest de overeenkomst en tekent met zijn naam. Pas daarna gaat het project verder. Bij een gratis project wordt deze stap overgeslagen. |
| 3 · Bevestigd | Staat op je to-do. |
| 4 · In productie | Je geeft een richtdatum door (los knopje, zonder upload). Upload je de eerste versie, dan gaat het project vanzelf naar feedback. |
| 5 · Klaar voor feedback | De klant keurt goed of vraagt een aanpassing. Elke aanpassing verbruikt een ronde. |
| 6 · Betaling | De klant ziet bedrag en betaallink. Je kan de finale versie al klaarzetten: zichtbaar, maar niet downloadbaar. |
| 7 · Downloaden | Na "Betaling ontvangen" komt de download vrij. |
| 8 · Afgewerkt | Na drie dagen wist de database het project met alles erin. |

### Een testproject aanmaken

Onderaan het tabblad **Projecten** staat een knop om een nepproject te maken.
Dat loopt door dezelfde functie als een echte aanvraag, dus wat je erop test
gedraagt zich later net zo. De titel begint met [TEST]; verwijderen doe je met
de knop Verwijder.

### Vooruit en terug in het traject

In de fasebalk bovenaan een project staan pijltjes links en rechts van de
bollen. Daarmee ga je een stap vooruit of terug. Je kan ook rechtstreeks op een
bol klikken om naar die stap te springen.

Het meeste gaat vanzelf: een eerste versie uploaden zet het project op
feedback, een finale versie zet het op betaling (of meteen op downloaden bij
een gratis project), en zodra de klant het eindbestand ophaalt gaat het naar
afgewerkt.

### Automatisch bijwerken

De statuspagina van de klant haalt zichzelf elke twintig seconden opnieuw op,
en meteen wanneer hij terugkeert naar het tabblad. Zet jij een project een stap
verder, dan ziet de klant dat vanzelf, met een korte melding "Er is iets nieuws
op deze pagina". Er wordt alleen opnieuw getekend als er echt iets veranderd
is, dus zijn scrollpositie blijft staan.

Supabase heeft ook een Realtime-functie, maar die kan hier niet gebruikt
worden: Realtime luistert rechtstreeks op de tabellen, en de klant heeft daar
bewust geen leesrechten. Zou ik die geven, dan kon iedereen alle projecten
lezen.

### Feedbackrondes

Elke aanpassing die de klant vraagt, verbruikt een ronde. Zijn de rondes op,
dan verdwijnt de knop **Goedkeuren**: die versie geldt dan als aanvaard. De
klant kan wel een **extra ronde aanvragen** met een korte uitleg. Dat verzoek
verschijnt bovenaan je projectdossier, met knoppen om toe te kennen of af te
wijzen. Ken je toe, dan gaat het project meteen terug naar "aanpassen".

Een finale versie hoeft de klant niet meer goed te keuren: die is bij het
uploaden al aanvaard.

Op de statuspagina ziet de klant onder "Klaar voor jouw feedback" een lijstje
met Versie 1, Versie 2, ... en Finale versie. Dat lijstje volgt het aantal
rondes van het pakket, dus het klopt ook bij nieuwe pakketten die je later
toevoegt.

Bij het tekenen moet de naam overeenkomen met de naam uit de aanvraag.
Hoofdletters, accenten en leestekens tellen niet mee, dus "jan de smet" werkt
ook voor "Jan De Smet".

### De overeenkomst

De prijs staat groot bovenaan bij de klant. Bij goedkeuring stel je die in en krijgt de klant een overeenkomst te
tekenen: opdracht, prijs, betaling na goedkeuring, aantal feedbackrondes,
levering, rechten, aangeleverd materiaal, annuleren en de bewaartermijn.

De basistekst pas je aan onder **Inhoud** → **Overeenkomst**. Daar kan je
{naam}, {titel}, {pakket}, {rondes} en {prijs} gebruiken; die worden per
project ingevuld. Per project kan je de tekst nog bijstellen voor je goedkeurt.

De getekende tekst wordt bewaard zoals hij op dat moment gold. Verander je later
je basistekst, dan blijft staan waar de klant echt mee akkoord ging.

---


## Google Drive en het downloadslot

Zet je bestand op Drive, klik **Delen** en kies **Iedereen met de link**. Plak
die link in de admin bij een oplevering.

De site haalt het bestands-id uit die link en toont het bestand meteen in beeld
op de statuspagina van de klant. Vanaf fase 6 wordt diezelfde link omgezet naar
een rechtstreekse downloadlink, zodat de klant niet eerst naar Drive moet.

YouTube-links werken ook: die spelen af in de pagina. Handig voor grote video's,
want dan hoeft er niets gedownload te worden om te bekijken.

Markeer een oplevering als **finale versie** voor de versie zonder watermerk.
Alleen die is te downloaden, en pas nadat de betaling rond is.

### Wat het downloadslot wel en niet doet

De server stuurt bij een niet-finale versie **geen enkele link** mee: geen
deellink, geen downloadlink. Alleen het id dat nodig is om het bestand in beeld
te tonen. De knop "Openen" is weg, en daarmee ook de weg naar de Drive-pagina
waar Google zelf een downloadknop zet.

**Maar wees hier eerlijk over naar jezelf:** zolang een Drive-bestand op
"iedereen met de link" staat, kan iemand die het id uit de pagina plukt daar
technisch nog steeds een download van maken. Dat is een eigenschap van Drive,
niet iets wat ik in de site kan dichtzetten.

Wat wél echt beschermt:

1. **Zet een watermerk op elke versie die nog niet betaald is.** Dat is de
   professionele standaard en de enige bescherming die niet te omzeilen valt.
2. **Zet reviewvideo's als verborgen video op YouTube** in plaats van Drive.
   Downloaden is daar een stuk lastiger, en afspelen werkt beter.
3. Zet het finale bestand pas op Drive nadat de betaling binnen is.

---

## Vindbaarheid in Google

Zie **SEO.md** voor wat er in de site zit en wat je zelf moet doen. Kort:
begin met Google Search Console en zet je link in je YouTube-beschrijving.

Let op: het webadres `joppedsstudios.github.io` staat in `index.html`,
`robots.txt` en `sitemap.xml`. Neem je een eigen domein, vervang het dan overal.

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
traject.html            Projectstatus voor de klant
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

**Het oude codesysteem is weg.** De aparte aanvraagpagina met toegangscodes
bestaat niet meer. Aanvragen komen nu binnen via je diensten, en de codes die
er nu zijn, zijn **volgcodes**: daarmee volgt een klant zijn eigen project.

**Iets werkt niet (review, formulier, project)** — log in op de admin. Staat er
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
