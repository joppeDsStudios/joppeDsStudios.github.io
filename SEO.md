# Gevonden worden in Google

Alles wat ik in de site kon inbouwen, zit erin. Maar de helft van vindbaarheid
gebeurt buiten je website. Dit bestand legt allebei uit.

---

## Wat er nu in de site zit

**Je teksten staan in de HTML zelf.** Dit was het grootste probleem. Je site
haalde alles op uit Supabase met JavaScript, dus wie de broncode opvroeg, zag
een zo goed als lege pagina. Google kan JavaScript uitvoeren, maar doet dat in
een tweede ronde die dagen kan duren en soms overgeslagen wordt.

Nu staat je echte tekst in `index.html`: je projecten, je "over mij", je
statistieken en je opleidingen. JavaScript vervangt ze zodra de site laadt.
Van bijna niets naar ruim 440 woorden leesbare tekst.

> Pas je iets aan in de admin, dan hoef je die HTML niet bij te werken. Het is
> een vangnet voor zoekmachines, geen tweede plek om te beheren. Alleen als je
> iets grondig wijzigt (een project weghalen bijvoorbeeld) is het slim om de
> tekst in `index.html` ook eens gelijk te trekken.

**Titel en omschrijving.** Je titel was "Create. Analyze. Improve. Repeat." —
een slogan die niemand intikt. Nu: *Videomontage, livestreams en thumbnails ·
JoppeDS Studio's Kortrijk*. Woorden die mensen echt zoeken.

**Gestructureerde gegevens.** Er staat nu JSON-LD in je pagina die Google
vertelt dat je een videostudio bent in Kortrijk, wie je bent, welke diensten je
levert en dat je YouTube-kanaal van jou is. Dat is wat een rijker zoekresultaat
mogelijk maakt.

**robots.txt en sitemap.xml.** Wijzen Google naar je startpagina en houden je
admin en de statuspagina van klanten eruit.

**Je foto's zijn 85% lichter.** Van 5,6 MB naar 0,84 MB, zonder zichtbaar
kwaliteitsverlies. Laadsnelheid weegt mee in de rangschikking, en op mobiele
data scheelt dit seconden.

**Verder:** canonical-tag, alt-teksten die beschrijven wat er te zien is,
lazy loading, afmetingen op afbeeldingen tegen verspringende pagina's, en één
consistent webadres in alle deel-tags (dat stond eerder dubbel en met twee
verschillende domeinen).

---

## Wat jij moet doen

### 1. Google Search Console (belangrijkst)

Zonder dit tast je in het duister.

1. Ga naar [search.google.com/search-console](https://search.google.com/search-console)
2. Voeg je site toe als **URL-prefix**: `https://joppedsstudios.github.io/`
3. Bevestig eigendom met de **HTML-tag**-methode: Google geeft je een regel
   `<meta name="google-site-verification" ...>`. Plak die in `index.html`,
   vlak onder de `<title>`-regel.
4. Ga naar **Sitemaps** en dien in: `sitemap.xml`
5. Ga naar **URL-inspectie**, plak je adres en klik **Indexering aanvragen**

Reken op twee tot acht weken voor je in de resultaten opduikt. Dat is normaal
en betekent niet dat er iets fout zit.

### 2. Links naar je site (weegt het zwaarst)

Google beoordeelt je vooral op wie er naar je verwijst. Voor jou:

- Zet je link in de **over-sectie van je YouTube-kanaal**
- Zet hem in je **Instagram- en TikTok-bio**
- Zet hem in de **beschrijving onder elke video** die je post
- Vraag **Warande, Textuur, het FAS-museum en Amba Amba** of ze je mogen
  vermelden met een link bij de video die je voor hen maakte

Eén link van een museumsite weegt zwaarder dan honderd trefwoorden op je eigen
pagina.

### 3. Eigen domeinnaam

`joppeds.be` kost ongeveer tien euro per jaar, oogt professioneler en de `.be`
helpt bij Belgische zoekopdrachten. Werkt gewoon met GitHub Pages: je zet het
domein in Settings → Pages en maakt een `CNAME`-bestand.

Doe je dat, zoek dan overal `joppedsstudios.github.io` en vervang het. Het
staat in `index.html` (vier keer), `robots.txt` en `sitemap.xml`.

---

## Waar je realistisch op kan mikken

Op **"JoppeDS"** sta je snel eerste. Dat is je merknaam, daar concurreert
niemand mee.

Op **"videograaf Kortrijk"** kom je voorlopig niet in de buurt. Daar zitten
bedrijven met jaren aan links en een adres in Google Maps.

Mik op wat specifiek is en waar minder concurrentie zit:

- "Minecraft thumbnail maker"
- "aftermovie jeugdbeweging Kortrijk"
- "livestream green screen Kortrijk"
- "video-editor Minecraft Nederlands"

Minder zoekvolume, maar wel precies de mensen die jou zoeken.

---

## Wat ik bewust níét gedaan heb

**Geen valse beoordelingen in de zoekresultaten.** Ik kon `aggregateRating` in
de gestructureerde gegevens zetten, waardoor er gouden sterretjes in Google
verschijnen. Maar dat mag alleen met échte reviews, en Google straft sites af
die dat verzinnen. Zodra je een handvol goedgekeurde reviews hebt, kunnen we
het correct toevoegen — zeg maar wanneer.

**Geen trefwoorden-meta-tag.** Google negeert die al sinds 2009.

**Geen trefwoorden volgestopt in je teksten.** Dat werkt niet meer en leest
slecht. Je tekst is nu geschreven voor mensen, met de juiste woorden er
natuurlijk in.

---

## Nadien controleren

- **Rich Results Test** ([search.google.com/test/rich-results](https://search.google.com/test/rich-results)) —
  controleert je gestructureerde gegevens
- **PageSpeed Insights** ([pagespeed.web.dev](https://pagespeed.web.dev)) —
  controleert laadsnelheid
- **`site:joppedsstudios.github.io`** intikken in Google — toont wat er al
  geïndexeerd is
