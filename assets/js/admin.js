/* ==========================================================================
   JoppeDS Studio's — admin
   Inloggen, berichten lezen en de inhoud van de site aanpassen.
   ========================================================================== */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* Klik naast het venster om te sluiten.
   Let op: de scrollbalk hoort bij het dialoogvenster zelf, dus een klik
   daarop had als doelwit het venster en sloot het per ongeluk. Daarom
   vergelijken we de muispositie met de randen in plaats van het doelwit. */
function sluitBijKlikNaast(dlg) {
  dlg.addEventListener("mousedown", (e) => {
    const r = dlg.getBoundingClientRect();
    const binnen =
      e.clientX >= r.left && e.clientX <= r.right &&
      e.clientY >= r.top && e.clientY <= r.bottom;
    if (!binnen) dlg.close();
  });
}

/* Waarde ophalen of zetten via een pad zoals "over.feiten.0.label" */
const getPath = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const setPath = (o, p, v) => {
  const keys = p.split(".");
  const last = keys.pop();
  const t = keys.reduce((a, k) => (a[k] = a[k] ?? {}), o);
  t[last] = v;
};

const sb = window.getSupabase();
let work = null; /* de inhoud die je op dit moment bewerkt */

/* --------------------------------------------------------------------------
   Inloggen
   -------------------------------------------------------------------------- */

const loginview = $("#loginview");
const panel = $("#panel");
const loginnote = $("#loginnote");

function noteLogin(msg, kind) {
  loginnote.hidden = false;
  loginnote.textContent = msg;
  loginnote.className = "form__note form__note--" + kind;
}

if (!sb) {
  noteLogin(
    "Nog niet gekoppeld. Vul je Supabase-gegevens in bij assets/js/config.js en herlaad deze pagina.",
    "err"
  );
  $("#loginbtn").disabled = true;
}

$("#loginform").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!sb) return;

  const btn = $("#loginbtn");
  btn.disabled = true;
  btn.textContent = "Bezig…";

  const { error } = await sb.auth.signInWithPassword({
    email: $("#l-email").value.trim(),
    password: $("#l-pass").value
  });

  btn.disabled = false;
  btn.textContent = "Inloggen";

  if (error) {
    noteLogin("Inloggen lukte niet. Controleer je e-mailadres en wachtwoord.", "err");
    return;
  }
  start();
});

$("#logout").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.reload();
});

/* Al ingelogd? Dan meteen door. De sessie wordt door Supabase bewaard. */
(async function checkSession() {
  if (!sb) return;
  const { data } = await sb.auth.getSession();
  if (data.session) start();
})();

async function start() {
  const { data } = await sb.auth.getUser();
  $("#who").textContent = data?.user?.email || "";
  loginview.hidden = true;
  panel.hidden = false;
  await Promise.all([loadMessages(), loadEditor()]);

  /* Stil controleren of de database compleet is. Ontbreekt er iets, dan
     verschijnt er bovenaan een waarschuwing met wat je moet doen. */
  testInstallatie(true);

  /* Even tellen hoeveel reviews wachten, zodat je dat op het tabblad ziet
     zonder het te openen. */
  const { count } = await sb
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "wachtend");
  if (count) $("#badge-reviews").textContent = `(${count})`;
}

/* --------------------------------------------------------------------------
   Tabs
   -------------------------------------------------------------------------- */

let statsGeladen = false;
let aanvragenGeladen = false;
let reviewsGeladen = false;

$$(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("is-on", x === t));
    $$(".tabpane").forEach((p) => (p.hidden = p.id !== "pane-" + t.dataset.tab));

    /* Statistieken pas ophalen wanneer je ze echt bekijkt */
    if (t.dataset.tab === "bezoekers" && !statsGeladen) {
      statsGeladen = true;
      loadStats();
    }
    if (t.dataset.tab === "aanvragen" && !aanvragenGeladen) {
      aanvragenGeladen = true;
      sb.rpc("ruim_projecten_op").then(() => loadAanvragen());
    }
    if (t.dataset.tab === "reviews" && !reviewsGeladen) {
      reviewsGeladen = true;
      loadReviews();
    }
  })
);

/* --------------------------------------------------------------------------
   Berichten
   -------------------------------------------------------------------------- */

function datum(iso) {
  const d = new Date(iso);
  return d.toLocaleString("nl-BE", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

/* --------------------------------------------------------------------------
   Zoeken
   --------------------------------------------------------------------------
   Eén set hulpjes voor de drie lijsten. Er wordt in het geheugen gefilterd,
   dus zoeken gaat meteen zonder de database opnieuw te bevragen.
   -------------------------------------------------------------------------- */

const zoek = { berichten: "", aanvragen: "", reviews: "" };

/* Zet de gevonden woorden in het geel. Eerst ontsnappen, dan pas markeren,
   zodat er nooit HTML uit de database in de pagina belandt. */
function markeer(tekst, term) {
  const veilig = esc(tekst);
  if (!term) return veilig;
  const patroon = esc(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return veilig.replace(new RegExp(patroon, "gi"), (m) => `<mark>${m}</mark>`);
}

const past = (velden, term) =>
  !term || velden.filter(Boolean).join(" \u0001 ").toLowerCase().includes(term.toLowerCase());

const gevonden = (aantal, totaal, term) =>
  term ? `<p class="zoek__aantal">${aantal} van ${totaal} gevonden voor "${esc(term)}"</p>` : "";

/* De drie zoekvelden aan hun lijst hangen */
[["zoek-berichten", "berichten", () => toonBerichten()],
 ["zoek-aanvragen", "aanvragen", () => toonAanvragen()],
 ["zoek-reviews",   "reviews",   () => toonReviews()]].forEach(([id, sleutel, toon]) => {
  const veld = $("#" + id);
  if (!veld) return;
  const wis = $(`[data-wis="${id}"]`);

  veld.addEventListener("input", () => {
    zoek[sleutel] = veld.value.trim();
    wis.hidden = !veld.value;
    toon();
  });

  wis.addEventListener("click", () => {
    veld.value = "";
    zoek[sleutel] = "";
    wis.hidden = true;
    toon();
    veld.focus();
  });
});

/* --------------------------------------------------------------------------
   Berichten
   -------------------------------------------------------------------------- */

let berichten = [];

async function loadMessages() {
  const list = $("#msglist");
  list.innerHTML = `<div class="empty">Berichten laden…</div>`;

  const { data, error } = await sb
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<div class="empty"><strong>Berichten laden lukte niet</strong>${esc(error.message)}</div>`;
    return;
  }

  berichten = data;
  const ongelezen = data.filter((m) => !m.gelezen).length;
  $("#badge").textContent = ongelezen ? `(${ongelezen})` : "";
  toonBerichten();
}

function toonBerichten() {
  const list = $("#msglist");
  const term = zoek.berichten;
  const rijen = berichten.filter((m) =>
    past([m.voornaam, m.naam, m.email, m.bericht], term)
  );

  if (!berichten.length) {
    list.innerHTML = `<div class="empty"><strong>Nog geen berichten</strong>Zodra iemand het contactformulier invult, verschijnt het bericht hier.</div>`;
    return;
  }
  if (!rijen.length) {
    list.innerHTML = gevonden(0, berichten.length, term) +
      `<div class="empty"><strong>Niets gevonden</strong>Probeer een ander woord.</div>`;
    return;
  }

  list.innerHTML = gevonden(rijen.length, berichten.length, term) + rijen
    .map(
      (m) => `
      <article class="msg ${m.gelezen ? "" : "is-new"}" data-id="${m.id}">
        <div class="msg__top">
          <span class="msg__from">${markeer(m.voornaam + " " + m.naam, term)}</span>
          <span class="msg__meta">${esc(datum(m.created_at))}</span>
        </div>
        <p class="msg__meta" style="margin:0 0 12px">${markeer(m.email, term)}</p>
        <p class="msg__body">${markeer(m.bericht, term)}</p>
        <div class="msg__acts">
          <a class="mini" href="mailto:${esc(m.email)}?subject=${encodeURIComponent(
            "Re: je bericht via JoppeDS Studio's"
          )}">Antwoorden</a>
          <button class="mini" data-act="toggle">${m.gelezen ? "Markeer ongelezen" : "Markeer gelezen"}</button>
          <button class="mini mini--danger" data-act="del">Verwijderen</button>
        </div>
      </article>`
    )
    .join("");
}

$("#msglist").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const card = btn.closest(".msg");
  const id = card.dataset.id;

  if (btn.dataset.act === "toggle") {
    const nu = card.classList.contains("is-new");
    await sb.from("messages").update({ gelezen: nu }).eq("id", id);
    loadMessages();
  }

  if (btn.dataset.act === "del") {
    if (!confirm("Dit bericht definitief verwijderen?")) return;
    await sb.from("messages").delete().eq("id", id);
    loadMessages();
  }
});

/* --------------------------------------------------------------------------
   Toegangscodes
   -------------------------------------------------------------------------- */



/* --------------------------------------------------------------------------
   Volgcodes
   --------------------------------------------------------------------------
   Elke aanvraag krijgt er automatisch een. Deze functie is er voor het geval
   een oud project er nog geen heeft.
   -------------------------------------------------------------------------- */

/* Alfabet zonder tekens die op elkaar lijken (geen O/0, geen I/1/L), zodat
   overtypen foutloos gaat. */
const CODE_ALFABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function nieuweCode() {
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  const t = [...buf].map((n) => CODE_ALFABET[n % CODE_ALFABET.length]).join("");
  return `JDS-${t.slice(0, 4)}-${t.slice(4, 8)}`;
}

/* --------------------------------------------------------------------------
   Installatiecontrole
   --------------------------------------------------------------------------
   Loopt elk onderdeel van de database af. Zo zie je meteen wát er ontbreekt,
   in plaats van ergens op de site een vage foutmelding te krijgen.
   Draait ook stil bij het inloggen; ontbreekt er iets, dan verschijnt er
   bovenaan een waarschuwing.
   -------------------------------------------------------------------------- */

const ONDERDELEN = [
  ["Tabel messages",           "tabel",   "messages",         "het contactformulier"],
  ["Tabel site_content",       "tabel",   "site_content",     "de teksten van je site"],
  ["Tabel pageviews",          "tabel",   "pageviews",        "bezoekersstatistieken"],
  ["Tabel project_requests",   "tabel",   "project_requests", "projectaanvragen"],
  ["Tabel reviews",            "tabel",   "reviews",          "reviews insturen"],
  ["Weergave reviews_publiek", "tabel",   "reviews_publiek",  "reviews tonen op je site"],
  ["Functie check_code",       "functie", "check_code",       "codes controleren"],
  ["Functie submit_request",   "functie", "submit_request",   "aanvragen indienen"],
  ["Functie submit_open_request", "functie", "submit_open_request", "prijsaanvragen indienen"],
  ["Tabel project_files",      "tabel",   "project_files",     "opgeleverd werk tonen"],
  ["Tabel project_berichten",  "tabel",   "project_berichten", "berichten met de klant"],
  ["Functie haal_traject",     "functie", "haal_traject",      "de statuspagina"]
];

async function checkOnderdeel(soort, naam) {
  try {
    if (soort === "tabel") {
      const { error } = await sb.from(naam).select("*", { count: "exact", head: true });
      return { ok: !error, detail: error?.message };
    }
    if (naam === "check_code") {
      const { data, error } = await sb.rpc("check_code", { p_code: "JDS-TEST-TEST" });
      return { ok: !error && typeof data?.geldig === "boolean", detail: error?.message };
    }
    if (naam === "haal_traject") {
      const { data, error } = await sb.rpc("haal_traject", { p_code: "JDS-TEST-TEST" });
      return { ok: !error && data?.ok === false, detail: error?.message };
    }
    if (naam === "submit_open_request") {
      /* Bewust leeg: het antwoord "onvolledig" bewijst dat de functie werkt,
         zonder dat er iets wordt opgeslagen. */
      const { data, error } = await sb.rpc("submit_open_request", { p_data: {} });
      return {
        ok: !error && data?.ok === false && data?.reden === "onvolledig",
        detail: error?.message
      };
    }
    /* Bewust een onbestaande code: het antwoord "onbekend" bewijst dat de
       functie werkt, zonder dat er iets wordt opgeslagen. */
    const { data, error } = await sb.rpc("submit_request", { p_code: "JDS-TEST-TEST", p_data: {} });
    return {
      ok: !error && data?.ok === false && data?.reden === "onbekend",
      detail: error?.message
    };
  } catch (e) {
    return { ok: false, detail: String(e?.message || e) };
  }
}

async function testInstallatie(stil) {
  const uit = $("#diagnose");
  if (!stil) uit.innerHTML = `<p class="hint">Bezig met controleren…</p>`;

  const stappen = [];
  for (const [label, soort, naam, waarvoor] of ONDERDELEN) {
    stappen.push({ label, waarvoor, ...(await checkOnderdeel(soort, naam)) });
  }

  const stuk = stappen.filter((s) => !s.ok);

  /* Waarschuwing bovenaan de admin, zodat je het niet kan missen */
  const banner = $("#installwaarschuwing");
  if (stuk.length) {
    banner.hidden = false;
    banner.innerHTML =
      `<strong>${stuk.length === 1 ? "Eén onderdeel ontbreekt" : stuk.length + " onderdelen ontbreken"} in de database.</strong> ` +
      `Daardoor werkt ${esc(stuk.map((s) => s.waarvoor).join(", "))} nog niet. ` +
      `Ga naar Supabase → SQL Editor → New query, plak het volledige bestand ` +
      `<code>supabase-setup.sql</code> en klik Run. Opnieuw uitvoeren is veilig: ` +
      `bestaande gegevens blijven staan.`;
  } else {
    banner.hidden = true;
  }

  if (stil) return !stuk.length;

  uit.innerHTML = `
    <div class="check-list">
      ${stappen
        .map(
          (s) => `
        <div class="check-row ${s.ok ? "is-ok" : "is-nok"}">
          <span class="check-row__mark">${s.ok ? "✓" : "✕"}</span>
          <span>${esc(s.label)}</span>
          ${s.detail ? `<span class="check-row__detail">${esc(s.detail)}</span>` : ""}
        </div>`
        )
        .join("")}
    </div>
    <p class="hint" style="margin-top:14px">
      ${
        stuk.length
          ? "Voer supabase-setup.sql opnieuw volledig uit in Supabase. Bestaande gegevens blijven staan."
          : "Alles staat klaar."
      }
    </p>`;

  return !stuk.length;
}

$("#diagnoseknop").addEventListener("click", (e) => {
  e.preventDefault();
  testInstallatie(false);
});



/* --------------------------------------------------------------------------
   Projectaanvragen
   -------------------------------------------------------------------------- */

const STATUSSEN = ["nieuw", "in behandeling", "goedgekeurd", "afgerond", "afgewezen"];
const FASE_KORT = {
  aangevraagd: "Te beoordelen",
  contract: "Wacht op akkoord",
  ingepland: "Ingepland",
  productie: "In productie",
  feedback: "Bij de klant",
  aanpassen: "Aanpassen",
  betaling: "Wacht op betaling",
  download: "Klaar",
  afgewerkt: "Afgewerkt",
  afgewezen: "Afgewezen"
};

const faseKlasse = (f) =>
  f === "aangevraagd" ? "badge--nieuw"
  : f === "afgewezen" ? "badge--afgewezen"
  : f === "afgewerkt" ? "badge--afgerond"
  : f === "download" ? "badge--goedgekeurd"
  : "badge--behandeling";

let aanvragen = [];
let statusFilter = "";

async function loadAanvragen() {
  const lijst = $("#aanvraaglijst");
  lijst.innerHTML = `<div class="empty">Aanvragen laden…</div>`;

  const { data, error } = await sb
    .from("project_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    lijst.innerHTML = `<div class="empty"><strong>Aanvragen laden lukte niet</strong>${esc(error.message)}</div>`;
    return;
  }

  aanvragen = data;
  const openstaand = data.filter((a) => !["afgewerkt", "afgewezen"].includes(a.fase)).length;
  $("#badge-aanvragen").textContent = openstaand ? `(${openstaand})` : "";
  toonAanvragen();
}

function toonAanvragen() {
  const lijst = $("#aanvraaglijst");
  const term = zoek.aanvragen;

  let rijen = statusFilter ? aanvragen.filter((a) => a.fase === statusFilter) : aanvragen;
  const voorZoeken = rijen.length;

  rijen = rijen.filter((a) =>
    past([a.titel, a.naam, a.email, a.referentie, a.volgcode, a.pakket, a.notitie,
          JSON.stringify(a.data || {})], term)
  );

  if (term && !rijen.length) {
    lijst.innerHTML = gevonden(0, voorZoeken, term) +
      `<div class="empty"><strong>Niets gevonden</strong>Probeer een ander woord, of zet de filter op Alles.</div>`;
    return;
  }

  if (!rijen.length) {
    lijst.innerHTML = `<div class="empty"><strong>${
      aanvragen.length ? "Geen projecten in deze fase" : "Nog geen projecten"
    }</strong>${
      aanvragen.length
        ? "Kies een andere filter."
        : "Projecten komen binnen via de diensten op je website."
    }</div>`;
    return;
  }

  lijst.innerHTML = gevonden(rijen.length, voorZoeken, term) + rijen
    .map(
      (a) => `
      <article class="req ${a.fase === "aangevraagd" ? "is-nieuw" : ""}" data-id="${a.id}">
        <div class="req__main">
          <div class="req__titel">${markeer(a.titel, term)}</div>
          <div class="req__wie">${markeer(a.naam, term)} · ${markeer(a.referentie, term)} · ${esc(datum(a.created_at))}</div>
        </div>
        <div class="req__acts">
          <span class="badge ${faseKlasse(a.fase)}">${esc(FASE_KORT[a.fase] || a.fase)}</span>
          <button class="mini" data-open="${a.id}">Bekijk</button>
          <button class="mini mini--danger" data-del="${a.id}">Verwijder</button>
        </div>
      </article>`
    )
    .join("");
}

$("#statusfilter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-status]");
  if (!b) return;
  $$("#statusfilter .mini").forEach((x) => x.classList.toggle("is-on", x === b));
  statusFilter = b.dataset.status;
  toonAanvragen();
});

$("#aanvraaglijst").addEventListener("click", async (e) => {
  const open = e.target.closest("[data-open]");
  const del = e.target.closest("[data-del]");

  if (open) toonDetail(aanvragen.find((a) => a.id === open.dataset.open));

  if (del) {
    const a = aanvragen.find((x) => x.id === del.dataset.del);
    if (!confirm(`Aanvraag "${a.titel}" definitief verwijderen?`)) return;
    await sb.from("project_requests").delete().eq("id", a.id);
    loadAanvragen();
  }
});


/* --------------------------------------------------------------------------
   Projectbegeleiding
   --------------------------------------------------------------------------
   Alles wat de klant op de statuspagina ziet, stuur je hiervandaan aan.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   Het projectsysteem
   --------------------------------------------------------------------------
   Elk project doorloopt vaste fases. De knoppen die je ziet, horen bij de
   fase waarin het project zit: zo hoef je nooit te zoeken wat de volgende
   stap is.
   -------------------------------------------------------------------------- */

const FASEN = [
  ["aangevraagd", "1 · Goedkeuring",        "Bekijk de aanvraag en beslis of je ze aanneemt."],
  ["contract",    "2 · Wacht op akkoord",   "De klant moet de overeenkomst nog tekenen."],
  ["ingepland",   "3 · Bevestigd",          "Staat op je to-do. Plan in wanneer je begint."],
  ["productie",   "4 · In productie",       "Je bent aan het werk. Geef een richtdatum door."],
  ["feedback",    "5 · Klaar voor feedback","De klant bekijkt je versie."],
  ["aanpassen",   "5 · Aanpassing bezig",   "Je verwerkt de opmerkingen van de klant."],
  ["betaling",    "6 · Betaling",           "Wacht op betaling voor je het eindbestand vrijgeeft."],
  ["download",    "7 · Klaar om te downloaden", "De klant kan het eindbestand ophalen."],
  ["afgewerkt",   "8 · Afgewerkt",          "Klaar. Het project wist zichzelf na drie dagen."],
  ["afgewezen",   "Afgewezen",              "Deze aanvraag neem je niet aan."]
];

const FASE_NAAM = Object.fromEntries(FASEN.map(([k, n]) => [k, n]));


/* De overeenkomst die de klant tekent.
   {prijs}, {titel}, {pakket}, {rondes} en {naam} worden ingevuld met de
   gegevens van dit project. Je kan de tekst aanpassen onder Inhoud. */
const STANDAARD_CONTRACT = `Tussen JoppeDS Studio's en {naam}

1. Opdracht
Ik maak voor jou: {titel}{pakketregel}, zoals beschreven in je aanvraag.

2. Prijs
{prijs}. Vast bedrag. Vraag je later werk dat buiten de opdracht valt, dan
spreken we eerst een nieuwe prijs af.

3. Betaling
Je betaalt nadat je het eindresultaat goedkeurt. Tot de betaling binnen is,
kan je het bestand bekijken maar niet downloaden.

4. Aanpassingen
Je hebt {rondes} feedbackronde(s). Geef per ronde in één keer door wat er
anders mag. Zijn je rondes op, dan spreken we samen af wat extra werk kost.

5. Levering
Je krijgt het eindbestand digitaal. De opleverdatum is een richtlijn; bij
vertraging laat ik dat tijdig weten.

6. Rechten
Na betaling mag je het werk gebruiken voor het doel dat je opgaf. Ik blijf de
maker en mag het tonen in mijn portfolio, tenzij je daar bezwaar tegen maakt.

7. Jouw materiaal
Je bevestigt dat je het materiaal dat je aanlevert mag gebruiken. Ik ben niet
aansprakelijk voor claims van derden daarover.

8. Annuleren
Annuleer je na de start, dan betaal je het deel dat al gemaakt is. Annuleer je
ervoor, dan betaal je niets.

9. Bewaartermijn
Drie dagen na afronding wordt alles uit dit systeem gewist. Bewaar je
eindbestand dus zelf op tijd.`;


/* De contracttekst met de gegevens van dit project ingevuld */
function contractTekst(a, prijs) {
  const basis = work?.contract?.tekst || STANDAARD_CONTRACT;
  const p = prijs ?? a.prijs;
  return basis
    .replace(/\{naam\}/g, a.naam || "de klant")
    .replace(/\{titel\}/g, a.titel || "je project")
    .replace(/\{pakketregel\}/g, a.pakket ? ` (pakket ${a.pakket})` : "")
    .replace(/\{pakket\}/g, a.pakket || "op maat")
    .replace(/\{rondes\}/g, String(a.rondes ?? 2))
    .replace(/\{prijs\}/g, p || "het afgesproken bedrag");
}


/* Prijzen tonen we zonder euroteken in het veld: dat staat er vast voor.
   Bij het opslaan zetten we het er weer bij, zodat de klant "€ 250" ziet. */
function bedragZonderEuro(v) {
  return String(v || "").replace(/^\s*€\s*/, "").trim();
}
function metEuro(v) {
  const t = String(v || "").trim();
  return t ? (/^€/.test(t) ? t : "€ " + t) : "";
}

const AFWIJSREDENEN = [
  "Mijn agenda zit vol voor deze periode",
  "De deadline is niet haalbaar",
  "Dit valt buiten wat ik aanbied",
  "Het budget past niet bij de opdracht",
  "Onvoldoende informatie om te starten",
  "Andere reden"
];

const SOORTEN = [
  { v: "video", t: "Video" },
  { v: "short", t: "Short of reel" },
  { v: "thumbnail", t: "Thumbnail" },
  { v: "afbeelding", t: "Afbeelding" },
  { v: "anders", t: "Ander bestand" }
];

let leveringen = [];
let projectberichten = [];

async function laadProject(id) {
  const [best, ber] = await Promise.all([
    sb.from("project_files").select("*").eq("aanvraag_id", id).order("created_at", { ascending: false }),
    sb.from("project_berichten").select("*").eq("aanvraag_id", id).order("created_at")
  ]);
  leveringen = best.data || [];
  projectberichten = ber.data || [];
}

/* --------------------------------------------------------------------------
   Google Drive
   --------------------------------------------------------------------------
   Je zet je bestanden op Drive en plakt de deellink. Hieronder halen we het
   bestands-id eruit, zodat de klant het rechtstreeks kan bekijken en later
   downloaden zonder eerst naar Drive te moeten.
   -------------------------------------------------------------------------- */

function driveId(url) {
  const s = String(url || "");
  const m =
    s.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) ||
    s.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

function driveSoort(url) {
  const s = String(url || "");
  if (/drive\.google\.com\/drive\/folders\//.test(s)) return "map";
  return driveId(s) ? "bestand" : null;
}

/* --------------------------------------------------------------------------
   Het paneel per fase
   -------------------------------------------------------------------------- */

function faseBalk(a) {
  const zichtbaar = FASEN.filter(([k]) => k !== "afgewezen" && k !== "aanpassen");
  const huidig = a.fase === "aanpassen" ? "feedback" : a.fase;
  const nu = zichtbaar.findIndex(([k]) => k === huidig);

  if (a.fase === "afgewezen") {
    return `<div class="fasebalk fasebalk--weg">
        <span>Afgewezen${a.afwijsreden ? " · " + esc(a.afwijsreden) : ""}</span>
        <button class="fasepijl" data-stap="aangevraagd" title="Terug naar de beoordeling">&larr;</button>
      </div>`;
  }

  const vorige = nu > 0 ? zichtbaar[nu - 1] : null;
  const volgende = nu >= 0 && nu < zichtbaar.length - 1 ? zichtbaar[nu + 1] : null;

  return `
    <div class="fasebalk">
      <button class="fasepijl" ${vorige ? `data-stap="${vorige[0]}" title="Terug naar ${esc(vorige[1])}"` : "disabled"}>&larr;</button>

      ${zichtbaar
        .map(
          ([k, n], i) => `
        <button class="fasebalk__stap ${i < nu ? "is-klaar" : i === nu ? "is-nu" : ""}"
                data-stap="${esc(k)}" title="${esc(n)}">${i + 1}</button>`
        )
        .join("")}

      <button class="fasepijl" ${volgende ? `data-stap="${volgende[0]}" title="Door naar ${esc(volgende[1])}"` : "disabled"}>&rarr;</button>

      <span class="fasebalk__naam">
        ${esc(FASE_NAAM[a.fase] || a.fase)}
        ${
          ["feedback", "aanpassen"].includes(a.fase) && a.rondes
            ? `<span class="fasebalk__ronde">Feedback ${Math.min((a.rondes_op || 0) + 1, a.rondes)}/${a.rondes}</span>`
            : ""
        }
      </span>
    </div>`;
}


/* De knoppen die bij deze fase horen */

/* Vroeg de klant een extra feedbackronde? Dan zie je dat bovenaan, met de
   knoppen om toe te kennen of te weigeren. */

/* De volgorde van het traject, gebruikt door de pijltjes in de fasebalk. */
const VOLGORDE = ["aangevraagd", "contract", "ingepland", "productie",
                  "feedback", "betaling", "download", "afgewerkt"];

function volgendeFase(fase) {
  const nu = VOLGORDE.indexOf(fase === "aanpassen" ? "feedback" : fase);
  return nu >= 0 && nu < VOLGORDE.length - 1 ? VOLGORDE[nu + 1] : null;
}


function extraVerzoek(a) {
  if (!a.extra_gevraagd) return "";
  return `
    <div class="verzoek">
      <p class="verzoek__kop">De klant vraagt een extra feedbackronde</p>
      <p class="verzoek__tekst">${esc(a.extra_gevraagd)}</p>
      <div class="verzoek__acts">
        <button class="btn btn--fill" data-extratoe="${a.id}">Toekennen</button>
        <button class="mini" data-extraweg="${a.id}">Afwijzen</button>
      </div>
    </div>`;
}

function faseActies(a) {
  const over = Math.max(0, (a.rondes || 0) - (a.rondes_op || 0));

  switch (a.fase) {
    case "aangevraagd":
      return `
        <div class="fasekaart">
          <h3 class="fasekaart__kop">Neem je deze opdracht aan?</h3>
          <p class="hint">
            Kijk het tabblad "De aanvraag" na. Keur je goed, dan krijgt de klant
            de overeenkomst te tekenen en start het traject.
          </p>

          <div class="form__row">
            <div class="field">
              <label for="pf-prijs">Prijs</label>
              <div class="euro">
                <input id="pf-prijs" type="text" maxlength="40" placeholder="250"
                       value="${esc(bedragZonderEuro(a.prijs))}">
              </div>
            </div>
            <div class="field">
              <label for="pf-rondes0">Feedbackrondes</label>
              <input id="pf-rondes0" type="number" min="0" max="9" value="${a.rondes ?? 2}">
            </div>
          </div>

          <label class="schakel">
            <input type="checkbox" id="pf-gratis" ${a.gratis ? "checked" : ""}>
            <span class="schakel__spoor"><span class="schakel__knop"></span></span>
            <span class="schakel__tekst">
              <strong>Gratis voor deze klant</strong>
              <span>De klant ziet de prijs doorstreept en hoeft niets te tekenen of te betalen.</span>
            </span>
          </label>

          <details class="group" id="contractgroep">
            <summary><span>De overeenkomst</span><span class="group__sub">wat de klant tekent</span></summary>
            <div class="group__body">
              <div class="field">
                <label for="pf-contract">Tekst</label>
                <textarea id="pf-contract" rows="14">${esc(a.contract_tekst || contractTekst(a))}</textarea>
              </div>
              <button class="mini" data-contractherstel="1">Zet de standaardtekst terug</button>
            </div>
          </details>

          <div class="form__note" id="pf-gknote" hidden></div>

          <div class="fasekaart__acts">
            <button class="btn btn--fill" data-goedkeuren="${a.id}">Goedkeuren</button>
            <button class="btn" data-afwijzen="${a.id}">Afwijzen</button>
          </div>
        </div>`;

    case "contract":
      return `
        <div class="fasekaart">
          <h3 class="fasekaart__kop">Wacht op het akkoord van de klant</h3>
          <p class="hint">
            De klant ziet de overeenkomst op zijn statuspagina en moet die tekenen
            voor het project verder kan. Prijs: ${esc(a.prijs || "niet ingevuld")}.
          </p>
          <div class="fasekaart__acts">
            <button class="mini" data-kopieer-mail="${esc(a.volgcode || "")}">Herinnering mailen</button>
            <button class="mini" data-naarfase="aangevraagd">Terug naar goedkeuring</button>
          </div>
        </div>`;

    case "ingepland":
      return `
        <div class="fasekaart">
          <h3 class="fasekaart__kop">Klaar om te starten?</h3>
          <p class="hint">Zet het project op productie zodra je eraan begint.</p>
          <div class="fasekaart__acts">
            <button class="btn btn--fill" data-naarfase="productie">Start de productie</button>
          </div>
        </div>`;

    case "productie":
      return `
        <div class="fasekaart">
          <h3 class="fasekaart__kop">Wanneer verwacht je de eerste versie?</h3>
          <p class="hint">Een richtdatum voor de klant. Je kan die later altijd aanpassen.</p>
          <div class="form__row">
            <div class="field">
              <label for="pf-levering">Verwachte eerste versie</label>
              <input id="pf-levering" type="date" value="${a.levering ? a.levering.slice(0, 10) : ""}">
            </div>
            <div class="field" style="align-self:end">
              <button class="btn" data-datumdoor="${a.id}">Datum doorgeven</button>
            </div>
          </div>
          <div class="form__note" id="pf-datumnote" hidden></div>
          <p class="hint">
            Ben je klaar met de eerste versie? Zet ze hieronder online: het project
            gaat dan vanzelf naar de feedbackfase.
          </p>
          <div class="fasekaart__acts">
            <button class="btn btn--fill" data-upload="${a.id}">Eerste versie uploaden</button>
          </div>
        </div>`;

    case "feedback":
      return `
        ${extraVerzoek(a)}
        <div class="fasekaart">
          <h3 class="fasekaart__kop">De klant bekijkt je versie</h3>
          <p class="hint">
            ${over} van ${a.rondes} feedbackrondes over. Vraagt de klant een aanpassing,
            dan springt het project vanzelf naar "aanpassing bezig".
          </p>
          <div class="fasekaart__acts">
            <button class="btn" data-naarfase="aanpassen">Ik ben aan het aanpassen</button>
            <button class="mini" data-extraronde="${a.id}">+ 1 extra ronde</button>
          </div>
        </div>`;

    case "aanpassen":
      return `
        ${extraVerzoek(a)}
        <div class="fasekaart">
          <h3 class="fasekaart__kop">Je verwerkt de opmerkingen</h3>
          <p class="hint">
            ${over} van ${a.rondes} rondes over. Voeg je nieuwe versie hieronder toe
            en zet het project terug klaar voor feedback.
          </p>
          <div class="fasekaart__acts">
            <button class="btn btn--fill" data-upload="${a.id}">Nieuwe versie uploaden</button>
            <button class="mini" data-extraronde="${a.id}">+ 1 extra ronde</button>
          </div>
        </div>`;

    case "betaling":
      return `
        <div class="fasekaart">
          <h3 class="fasekaart__kop">Wachten op betaling</h3>
          <p class="hint">
            De klant ziet het bedrag en je betaallink op zijn statuspagina.
            Zodra je het geld ziet, vink je hieronder af.
          </p>
          <div class="form__row">
            <div class="field">
              <label for="pf-bedrag2">Bedrag</label>
              <input id="pf-bedrag2" type="text" value="${esc(a.betaling_bedrag || "")}">
            </div>
            <div class="field">
              <label for="pf-betaallink2">Betaallink</label>
              <input id="pf-betaallink2" type="url" value="${esc(a.betaling_link || "")}">
            </div>
          </div>
          <div class="fasekaart__acts">
            <button class="btn btn--fill" data-betaald="${a.id}">Betaling ontvangen</button>
            ${
              leveringen.some((l) => l.finaal)
                ? ""
                : `<button class="btn" data-upload="${a.id}">Finale versie klaarzetten</button>`
            }
          </div>
          <p class="hint">
            Je kan de finale versie nu al klaarzetten. De klant ziet dat ze er is,
            maar kan pas downloaden nadat je de betaling hebt aangeduid.
          </p>
        </div>`;

    case "download":
      return `
        <div class="fasekaart">
          <h3 class="fasekaart__kop">Zet het eindbestand klaar</h3>
          <p class="hint">
            Voeg hieronder de versie zonder watermerk toe en vink "finale versie" aan.
            Alleen die kan de klant downloaden.
          </p>
          <div class="fasekaart__acts">
            ${
              leveringen.some((l) => l.finaal)
                ? `<button class="btn btn--fill" data-naarfase="afgewerkt">Project afsluiten</button>`
                : `<button class="btn btn--fill" data-upload="${a.id}">Finale versie uploaden</button>`
            }
          </div>
        </div>`;

    case "afgewerkt":
      return `
        <div class="fasekaart fasekaart--klaar">
          <h3 class="fasekaart__kop">Afgewerkt</h3>
          <div class="field">
            <label for="pf-dank">Nog een woordje meegeven?</label>
            <textarea id="pf-dank" rows="2" maxlength="600"
              placeholder="Bedankt voor de samenwerking, en tot een volgende keer."></textarea>
          </div>
          <div class="fasekaart__acts" style="margin-bottom:8px">
            <button class="mini" data-dankbericht="${a.id}">Versturen</button>
          </div>
          <p class="hint">
            ${
              a.verwijder_op
                ? "Dit project wist zichzelf op " + datum(a.verwijder_op) + ", inclusief alle bestanden en berichten."
                : "Dit project wordt binnenkort automatisch gewist."
            }
          </p>
          <div class="fasekaart__acts">
            <button class="mini" data-naarfase="download">Terug openzetten</button>
          </div>
        </div>`;

    case "afgewezen":
      return `
        <div class="fasekaart">
          <h3 class="fasekaart__kop">Afgewezen</h3>
          <p class="hint">${esc(a.afwijsreden || "Zonder opgegeven reden.")}</p>
          <div class="fasekaart__acts">
            <button class="mini" data-naarfase="aangevraagd">Toch opnieuw bekijken</button>
          </div>
        </div>`;

    default:
      return "";
  }
}

function projectPaneel(a) {
  const over = Math.max(0, (a.rondes || 0) - (a.rondes_op || 0));
  const toonWerk = !["aangevraagd", "contract", "afgewezen"].includes(a.fase);

  return `
    ${faseBalk(a)}

    <div id="pf-kaart">${faseActies(a)}</div>

    ${
      toonWerk
        ? `
    <div class="werkkop">
      <h3 class="sub-kop" style="margin:0">Opgeleverd werk</h3>
      ${
        ["feedback", "aanpassen", "download"].includes(a.fase)
          ? `<button class="mini" data-upload="${a.id}">+ Versie uploaden</button>`
          : ""
      }
    </div>
    <div id="pf-leveringen">${leveringHtml()}</div>

    <h3 class="sub-kop">Berichten met de klant</h3>
    <div class="gesprek">${berichtHtml()}</div>
    <div class="field">
      <label for="pb-tekst">Antwoorden</label>
      <textarea id="pb-tekst" rows="3" maxlength="3000"></textarea>
    </div>
    <button class="btn" data-projectbericht="${a.id}">Bericht versturen</button>`
        : ""
    }`;
}

/* De tab "Details bijstellen" */
function detailsPaneel(a) {
  const over = Math.max(0, (a.rondes || 0) - (a.rondes_op || 0));
  return `
    <div class="form">
      <div class="form__row">
        <div class="field">
          <label for="pf-fase">Fase</label>
          <select id="pf-fase">
            ${FASEN.map(([k, t]) => `<option value="${k}" ${k === a.fase ? "selected" : ""}>${esc(t)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="pf-levering2">Verwachte oplevering</label>
          <input id="pf-levering2" type="date" value="${a.levering ? a.levering.slice(0, 10) : ""}">
        </div>
      </div>

      <div class="form__row">
        <div class="field">
          <label for="pf-rondes">Feedbackrondes in totaal</label>
          <input id="pf-rondes" type="number" min="0" max="9" value="${a.rondes ?? 2}">
        </div>
        <div class="field">
          <label for="pf-op">Al gebruikt</label>
          <input id="pf-op" type="number" min="0" max="9" value="${a.rondes_op ?? 0}">
        </div>
      </div>
      <p class="hint" style="margin:-6px 0 0">${over} ${over === 1 ? "ronde" : "rondes"} over.</p>

      <div class="form__row">
        <div class="field">
          <label for="pf-pakket">Pakket</label>
          <input id="pf-pakket" type="text" value="${esc(a.pakket || "")}">
        </div>
        <div class="field">
          <label for="pf-prijs2">Prijs</label>
          <div class="euro">
            <input id="pf-prijs2" type="text" value="${esc(bedragZonderEuro(a.prijs))}">
          </div>
        </div>
      </div>

      <label class="schakel">
        <input type="checkbox" id="pf-gratis2" ${a.gratis ? "checked" : ""}>
        <span class="schakel__spoor"><span class="schakel__knop"></span></span>
        <span class="schakel__tekst"><strong>Gratis voor deze klant</strong></span>
      </label>

      <div class="field">
        <label for="pf-betaallink3">Betaallink</label>
        <input id="pf-betaallink3" type="url" value="${esc(a.betaling_link || "")}"
               placeholder="Wero, Payconiq, …">
      </div>

      <div class="field">
        <label for="pf-nota">Bericht bij de voortgang</label>
        <textarea id="pf-nota" rows="2" maxlength="500">${esc(a.klantnota || "")}</textarea>
      </div>

      <div class="field">
        <label for="d-notitie">Jouw notitie (alleen jij ziet dit)</label>
        <textarea id="d-notitie" rows="3">${esc(a.notitie || "")}</textarea>
      </div>

      ${
        a.contract_op
          ? `<div class="form__note form__note--ok">
               Getekend door ${esc(a.contract_naam || "de klant")} op ${esc(datum(a.contract_op))}.
             </div>`
          : ""
      }

      <button class="btn btn--fill" data-projectbewaar="${a.id}">Opslaan</button>
    </div>`;
}

function leveringHtml() {
  if (!leveringen.length) {
    return `<p class="hint">Nog niets opgeleverd. Voeg hieronder je eerste versie toe.</p>`;
  }
  return leveringen
    .map(
      (b) => `
      <div class="code-row">
        <span class="code-row__code">${esc(b.titel)}${b.finaal ? " ★" : ""}</span>
        <span class="code-row__meta">
          ronde ${b.ronde} · ${esc(b.soort)} · ${esc(datum(b.created_at))}
          ${b.finaal ? " · finale versie" : ""}
          ${b.status === "goedgekeurd" ? " · goedgekeurd" : b.status === "aanpassing" ? " · aanpassing gevraagd" : ""}
          ${b.zichtbaar ? "" : " · verborgen"}
          ${driveSoort(b.url) ? " · Drive" : ""}
        </span>
        <span class="code-row__acts">
          <a class="mini" href="${esc(b.url)}" target="_blank" rel="noopener">Openen</a>
          <button class="mini" data-finaal="${b.id}">${b.finaal ? "Niet finaal" : "Finaal"}</button>
          <button class="mini" data-toonlevering="${b.id}">${b.zichtbaar ? "Verbergen" : "Tonen"}</button>
          <button class="mini mini--danger" data-weglevering="${b.id}">Verwijderen</button>
        </span>
      </div>`
    )
    .join("");
}

function berichtHtml() {
  if (!projectberichten.length) return `<p class="hint">Nog geen berichten.</p>`;
  return projectberichten
    .map(
      (b) => `
      <div class="bericht ${b.van === "klant" ? "is-klant" : b.van === "systeem" ? "is-systeem" : ""}">
        <div class="bericht__wie">${
          b.van === "klant" ? "Klant" : b.van === "systeem" ? "Systeem" : "Jij"
        } · ${esc(datum(b.created_at))}</div>
        <p>${esc(b.bericht)}</p>
      </div>`
    )
    .join("");
}


/* Wat er automatisch mee verandert bij een faseovergang.
   Een afgewerkt project krijgt hier zijn wisdatum: drie dagen later ruimt de
   database het op, inclusief bestanden en berichten. */
function faseExtra(fase) {
  if (fase === "afgewerkt") {
    return {
      status: "afgerond",
      verwijder_op: new Date(Date.now() + 3 * 864e5).toISOString()
    };
  }
  if (fase === "afgewezen") return { status: "afgewezen" };
  /* Ga je terug uit "afgewerkt", dan mag de wisdatum weer weg. */
  return { verwijder_op: null };
}

/* Het detailvenster opnieuw opbouwen met verse gegevens */
async function herlaadDetail(id) {
  await loadAanvragen();
  const a = aanvragen.find((x) => x.id === id);
  if (a) toonDetail(a);
}

/* Afwijzen met een reden uit de lijst, of een eigen tekst */
function toonAfwijsvenster(id) {
  const dlg = $("#afwijsvenster");
  dlg.innerHTML = `
    <div class="sheet__head">
      <div>
        <h2>Aanvraag afwijzen</h2>
        <p class="hint" style="margin:0">De klant ziet de reden op zijn statuspagina.</p>
      </div>
      <button class="mini" type="button" data-awsluit="1">Sluiten</button>
    </div>

    <div class="sheet__body">
      <div class="form">
        <div class="field">
          <label for="aw-reden">Reden</label>
          <select id="aw-reden">
            ${AFWIJSREDENEN.map((r) => `<option>${esc(r)}</option>`).join("")}
          </select>
        </div>
        <div class="field" id="aw-eigenvak" hidden>
          <label for="aw-eigen">Je eigen woorden</label>
          <textarea id="aw-eigen" rows="3" maxlength="600"
            placeholder="Schrijf hier wat je de klant wil laten weten."></textarea>
        </div>
        <div class="field">
          <label class="schakel">
            <input type="checkbox" id="aw-bericht" checked>
            <span class="schakel__spoor"><span class="schakel__knop"></span></span>
            <span class="schakel__tekst">
              <strong>Zet de reden ook bij de berichten</strong>
              <span>Zo blijft het bewaard in het gesprek met deze klant.</span>
            </span>
          </label>
        </div>
        <div class="form__note" id="aw-note" hidden></div>
      </div>
    </div>

    <div class="sheet__foot">
      <button class="btn btn--fill" data-awbevestig="${id}">Afwijzen</button>
      <button class="mini" type="button" data-awsluit="1">Annuleren</button>
    </div>`;

  dlg.showModal();

  $("#aw-reden").addEventListener("change", (e) => {
    $("#aw-eigenvak").hidden = e.target.value !== "Andere reden";
  });
}

$("#afwijsvenster").addEventListener("click", async (e) => {
  const dlg = $("#afwijsvenster");
  if (e.target.closest("[data-awsluit]")) { dlg.close(); return; }

  const ok = e.target.closest("[data-awbevestig]");
  if (!ok) return;

  const gekozen = $("#aw-reden").value;
  const eigen = $("#aw-eigen") ? $("#aw-eigen").value.trim() : "";
  const reden = gekozen === "Andere reden" ? eigen : gekozen;

  if (!reden) {
    const note = $("#aw-note");
    note.hidden = false;
    note.className = "form__note form__note--err";
    note.textContent = "Schrijf nog even je eigen reden.";
    return;
  }

  ok.disabled = true;
  const id = ok.dataset.awbevestig;
  const { error } = await sb.from("project_requests").update({
    fase: "afgewezen", status: "afgewezen", afwijsreden: reden
  }).eq("id", id);
  ok.disabled = false;

  if (error) { alert("Afwijzen lukte niet: " + error.message); return; }

  if ($("#aw-bericht").checked) {
    await sb.from("project_berichten").insert([{
      aanvraag_id: id, van: "systeem", bericht: "Aanvraag afgewezen: " + reden
    }]);
  }

  dlg.close();
  await herlaadDetail(id);
});

sluitBijKlikNaast($("#afwijsvenster"));

/* ---- Detailvenster ---- */

const rij = (label, waarde) => {
  if (waarde === null || waarde === undefined) return "";
  const v = Array.isArray(waarde) ? waarde.join(", ") : String(waarde).trim();
  if (!v) return "";
  const isLink = /^https?:\/\//i.test(v);
  return `
    <div class="dl__row">
      <span class="dl__lbl">${esc(label)}</span>
      <span class="dl__val">${
        isLink
          ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>`
          : esc(v)
      }</span>
    </div>`;
};

function toonDetail(a) {
  if (!a) return;
  /* Bestanden van het vorige project mogen hier niet blijven hangen. */
  if ($("#detail").dataset.project !== a.id) { leveringen = []; projectberichten = []; }
  const d = a.data || {};
  const dlg = $("#detail");

  dlg.innerHTML = `
    <div class="sheet__head">
      <div>
        <h2>${esc(a.titel)}</h2>
        <div class="kopcodes">
          <span class="kopcode"><span>Klant</span> ${esc(a.naam)}</span>
          <span class="kopcode"><span>Project</span> ${esc(a.referentie)}</span>
          ${a.volgcode ? `<span class="kopcode kopcode--geel"><span>Volgcode</span> ${esc(a.volgcode)}</span>` : ""}
          ${a.pakket ? `<span class="kopcode"><span>Pakket</span> ${esc(a.pakket)}</span>` : ""}
        </div>
      </div>
      <button class="mini" data-sluit="1">Sluiten</button>
    </div>

    <div class="sheet__tabs">
      <button class="tab is-on" data-dtab="project">Project</button>
      <button class="tab" data-dtab="aanvraag">De aanvraag</button>
      <button class="tab" data-dtab="details">Details bijstellen</button>
    </div>

    <div class="sheet__body">
      <div data-dpaneel="project">${projectPaneel(a)}</div>

      <div data-dpaneel="aanvraag" hidden>
        ${
          Array.isArray(d._velden) && d._velden.length
            ? `<div class="dl">${d._velden.map((v) => rij(v.label, v.waarde)).join("")}</div>`
            : `<div class="dl">
                 ${rij("Naam", d.naam || a.naam)}
                 ${rij("E-mailadres", d.email || a.email)}
                 ${rij("Telefoon", d.telefoon)}
                 ${rij("Beschrijving", d.beschrijving)}
                 ${rij("Deadline", d.deadline)}
               </div>`
        }
      </div>

      <div data-dpaneel="details" hidden>${detailsPaneel(a)}</div>
    </div>

    <div class="sheet__foot">
      <a class="mini" href="mailto:${esc(a.email)}?subject=${encodeURIComponent("Je project " + a.titel)}">Mail de klant</a>
      ${a.volgcode ? `<button class="mini" data-kopieer-volg="${esc(a.volgcode)}">Kopieer volgcode</button>` : ""}
      ${a.volgcode ? `<button class="mini" data-kopieer-mail="${esc(a.volgcode)}">Kopieer mail</button>` : ""}
      ${
        a.volgcode
          ? `<a class="mini" href="traject.html?code=${esc(a.volgcode)}" target="_blank" rel="noopener">Bekijk als klant</a>`
          : `<button class="mini" data-maakvolg="${a.id}">Volgcode aanmaken</button>`
      }
    </div>`;

  dlg.dataset.project = a.id;
  dlg.showModal();

  laadProject(a.id).then(() => {
    /* De fasekaart hangt af van de opgeleverde bestanden (staat er al een
       finale versie?). Die komen pas na het openen binnen, dus tekenen we
       de kaart daarna opnieuw. Anders kan de knop even verkeerd staan. */
    const kaart = $("#pf-kaart");
    if (kaart) kaart.innerHTML = faseActies(a);

    const vak = $("#pf-leveringen");
    if (vak) vak.innerHTML = leveringHtml();
    const g = dlg.querySelector(".gesprek");
    if (g) g.innerHTML = berichtHtml();
  });
}

/* --------------------------------------------------------------------------
   Uploadvenster
   --------------------------------------------------------------------------
   Eén plek om een versie toe te voegen. Vanuit productie start dit meteen
   de feedbackfase.
   -------------------------------------------------------------------------- */

function toonUpload(a) {
  const dlg = $("#uploadvenster");
  const eersteVersie = a.fase === "productie";
  const finaleFase = a.fase === "download";
  const ronde = finaleFase ? (a.rondes_op || 0) + 1 : (a.rondes_op || 0) + 1;

  dlg.innerHTML = `
    <div class="sheet__head">
      <div>
        <h2>${eersteVersie ? "Eerste versie uploaden" : finaleFase ? "Finale versie uploaden" : "Nieuwe versie uploaden"}</h2>
        <p class="hint" style="margin:0">
          Zet je bestand op Drive, kies Delen → Iedereen met de link, en plak die hier.
        </p>
      </div>
      <button class="mini" type="button" data-upsluit="1">Sluiten</button>
    </div>

    <div class="sheet__body">
      <div class="form">
        <div class="form__row">
          <div class="field">
            <label for="nl-titel">Titel</label>
            <input id="nl-titel" type="text" maxlength="120"
                   value="${finaleFase ? "Finale versie" : "Versie " + ronde}">
          </div>
          <div class="field">
            <label for="nl-soort">Soort</label>
            <select id="nl-soort">
              ${SOORTEN.map((o) => `<option value="${o.v}">${esc(o.t)}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="field">
          <label for="nl-url">Link naar Google Drive of YouTube</label>
          <input id="nl-url" type="url" maxlength="500"
                 placeholder="https://drive.google.com/file/d/… of https://youtu.be/…">
        </div>

        <label class="schakel">
          <input type="checkbox" id="nl-finaal" ${finaleFase ? "checked" : ""}>
          <span class="schakel__spoor"><span class="schakel__knop"></span></span>
          <span class="schakel__tekst">
            <strong>Finale versie</strong>
            <span>Zonder watermerk. Alleen deze is downloadbaar, en pas na betaling.</span>
          </span>
        </label>

        <div id="nl-betaalvak" ${finaleFase ? "" : "hidden"}>
          <div class="form__row">
            <div class="field">
              <label for="nl-bedrag">Te betalen</label>
              <div class="euro">
                <input id="nl-bedrag" type="text" maxlength="40" value="${esc(bedragZonderEuro(a.prijs))}">
              </div>
            </div>
            <div class="field">
              <label for="nl-betaallink">Betaallink</label>
              <input id="nl-betaallink" type="url" maxlength="500"
                     value="${esc(a.betaling_link || "")}" placeholder="Je Wero-verzoek">
            </div>
          </div>
        </div>

        <div class="field">
          <label for="nl-notitie">Toelichting voor de klant</label>
          <textarea id="nl-notitie" rows="3" maxlength="800"></textarea>
        </div>

        <div class="form__row">
          <div class="field field--kort">
            <label for="nl-ronde">Ronde</label>
            <input id="nl-ronde" type="number" min="1" max="9" value="${ronde}">
          </div>
        </div>

        <div class="form__note" id="nl-note" hidden></div>
      </div>
    </div>

    <div class="sheet__foot">
      <button class="btn btn--fill" data-nieuwelevering="${a.id}">
        ${eersteVersie ? "Uploaden en naar feedback" : "Uploaden"}
      </button>
      <button class="mini" type="button" data-upsluit="1">Annuleren</button>
    </div>`;

  dlg.showModal();

  /* Bij een finale versie hoort de betaallink erbij: de klant heeft die nodig
     zodra hij op Download klikt. */
  $("#nl-finaal").addEventListener("change", (e) => {
    $("#nl-betaalvak").hidden = !e.target.checked;
  });
}

$("#uploadvenster").addEventListener("click", (e) => {
  if (e.target.closest("[data-upsluit]")) $("#uploadvenster").close();
});
sluitBijKlikNaast($("#uploadvenster"));

/* Het uploadvenster staat buiten het projectvenster, dus het heeft een eigen
   afhandelaar nodig. Hing dit aan #detail, dan kwam de klik nooit aan. */
$("#uploadvenster").addEventListener("click", async (e) => {
});



/* Wisselen tussen de tabbladen in het venster */
$("#detail").addEventListener("click", (e) => {
  const t = e.target.closest("[data-dtab]");
  if (!t) return;
  const dlg = $("#detail");
  dlg.querySelectorAll("[data-dtab]").forEach((x) => x.classList.toggle("is-on", x === t));
  dlg.querySelectorAll("[data-dpaneel]").forEach((p) => {
    p.hidden = p.dataset.dpaneel !== t.dataset.dtab;
  });
});

$("#detail").addEventListener("click", (e) => {
  const t = e.target.closest("[data-sub]");
  if (!t) return;
  $$("#detail .tabs--sub .tab").forEach((x) => x.classList.toggle("is-on", x === t));
  $$("#detail [data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.sub));
});

$("#detail").addEventListener("click", async (e) => {
  const dlg = $("#detail");

  if (e.target.closest("[data-sluit]")) { dlg.close(); return; }

  /* Volgcode aanmaken voor oudere aanvragen die er nog geen hebben */
  const maakvolg = e.target.closest("[data-maakvolg]");
  if (maakvolg) {
    const code = nieuweCode();
    const { error } = await sb.from("project_requests").update({ volgcode: code }).eq("id", maakvolg.dataset.maakvolg);
    if (error) { alert("Aanmaken lukte niet: " + error.message); return; }
    await loadAanvragen();
    toonDetail(aanvragen.find((x) => x.id === maakvolg.dataset.maakvolg));
    return;
  }

  const kv = e.target.closest("[data-kopieer-volg]");
  if (kv) {
    await navigator.clipboard.writeText(kv.dataset.kopieerVolg).catch(() => {});
    kv.textContent = "Gekopieerd";
    setTimeout(() => (kv.textContent = "Kopieer"), 1600);
    return;
  }

  const km = e.target.closest("[data-kopieer-mail]");
  if (km) {
    const link = location.href.split("#")[0].replace(/admin\.html.*$/, "traject.html");
    const tekst =
      `Hoi,\n\nJe project staat genoteerd. Met deze volgcode kan je op elk moment ` +
      `bekijken hoe ver het staat, opgeleverd werk bekijken en feedback geven:\n\n` +
      `${km.dataset.kopieerMail}\n${link}?code=${km.dataset.kopieerMail}\n\n` +
      `Bewaar deze code goed.\n\nGroeten,\nJoppe`;
    await navigator.clipboard.writeText(tekst).catch(() => {});
    km.textContent = "Gekopieerd";
    setTimeout(() => (km.textContent = "Kopieer mail"), 1600);
    return;
  }

  /* Voortgang opslaan */
  const pb = e.target.closest("[data-projectbewaar]");
  if (pb) {
    pb.disabled = true;
    const { error } = await sb.from("project_requests").update({
      fase: $("#pf-fase").value,
      levering: $("#pf-levering2").value || null,
      rondes: Number($("#pf-rondes").value) || 0,
      rondes_op: Number($("#pf-op").value) || 0,
      pakket: $("#pf-pakket").value.trim() || null,
      prijs: metEuro($("#pf-prijs2").value) || null,
      gratis: $("#pf-gratis2").checked,
      betaling_nodig: !$("#pf-gratis2").checked,
      betaling_link: $("#pf-betaallink3").value.trim() || null,
      notitie: $("#d-notitie").value.trim() || null,
      klantnota: $("#pf-nota").value.trim() || null,
      ...faseExtra($("#pf-fase").value)
    }).eq("id", pb.dataset.projectbewaar);
    pb.disabled = false;
    if (error) { alert("Opslaan lukte niet: " + error.message); return; }
    await loadAanvragen();
    toonDetail(aanvragen.find((x) => x.id === pb.dataset.projectbewaar));
    return;
  }

  /* Levering toevoegen */

  /* Het uploadvenster openen */
  const up = e.target.closest("[data-upload]");
  if (up) {
    toonUpload(aanvragen.find((x) => x.id === up.dataset.upload));
    return;
  }

  /* Alleen de datum doorgeven, zonder verder iets te wijzigen */
  const dd = e.target.closest("[data-datumdoor]");
  if (dd) {
    const note = $("#pf-datumnote");
    const waarde = $("#pf-levering").value;
    if (!waarde) {
      note.hidden = false;
      note.className = "form__note form__note--err";
      note.textContent = "Kies eerst een datum.";
      return;
    }
    dd.disabled = true;
    const { error } = await sb.from("project_requests")
      .update({ levering: waarde }).eq("id", dd.dataset.datumdoor);
    dd.disabled = false;
    if (error) { alert("Opslaan lukte niet: " + error.message); return; }

    await sb.from("project_berichten").insert([{
      aanvraag_id: dd.dataset.datumdoor, van: "systeem",
      bericht: "De verwachte opleverdatum staat op " +
        new Date(waarde).toLocaleDateString("nl-BE", { day: "2-digit", month: "long", year: "numeric" }) + "."
    }]);
    note.hidden = false;
    note.className = "form__note form__note--ok";
    note.textContent = "Doorgegeven aan de klant.";
    return;
  }

  /* ---- Fases ---- */

  /* Goedkeuren: het project start en de klant krijgt zijn traject */
  const gk = e.target.closest("[data-goedkeuren]");
  if (gk) {
    const note = $("#pf-gknote");
    const zegG = (m) => {
      note.hidden = false;
      note.className = "form__note form__note--err";
      note.textContent = m;
    };

    const prijs = metEuro($("#pf-prijs").value);
    const gratis = $("#pf-gratis").checked;
    const rondes = Number($("#pf-rondes0").value) || 0;

    if (!prijs) {
      zegG("Vul eerst de prijs in. Ook bij een gratis project: de klant ziet dan wat het normaal kost.");
      return;
    }

    gk.disabled = true;

    /* Gratis? Dan is er niets te tekenen en gaat het project meteen door. */
    const velden = {
      prijs,
      gratis,
      rondes,
      status: "goedgekeurd",
      goedgekeurd_op: new Date().toISOString(),
      afwijsreden: null,
      betaling_nodig: !gratis,
      betaling_bedrag: gratis ? null : prijs,
      fase: gratis ? "ingepland" : "contract",
      contract_tekst: gratis ? null : $("#pf-contract").value.trim()
    };

    const { error } = await sb.from("project_requests").update(velden).eq("id", gk.dataset.goedkeuren);
    gk.disabled = false;
    if (error) { zegG("Goedkeuren lukte niet: " + error.message); return; }

    await sb.from("project_berichten").insert([{
      aanvraag_id: gk.dataset.goedkeuren, van: "systeem",
      bericht: gratis
        ? "Je aanvraag is goedgekeurd. Dit project is gratis, je hoeft niets te tekenen."
        : "Je aanvraag is goedgekeurd. Teken de overeenkomst om te starten."
    }]);
    await herlaadDetail(gk.dataset.goedkeuren);
    return;
  }

  /* Standaardtekst van het contract terugzetten */
  const ch = e.target.closest("[data-contractherstel]");
  if (ch) {
    const id = $("#detail").dataset.project;
    const a = aanvragen.find((x) => x.id === id);
    $("#pf-contract").value = contractTekst(a, $("#pf-prijs").value.trim());
    return;
  }


  /* Afwijzen met een reden */
  const aw = e.target.closest("[data-afwijzen]");
  if (aw) {
    toonAfwijsvenster(aw.dataset.afwijzen);
    return;
  }

  /* Een eigen bedankje bij een afgerond project */
  const dank = e.target.closest("[data-dankbericht]");
  if (dank) {
    const tekst = $("#pf-dank").value.trim();
    if (tekst.length < 2) return;
    dank.disabled = true;
    await sb.from("project_berichten").insert([{
      aanvraag_id: dank.dataset.dankbericht, van: "joppe", bericht: tekst
    }]);
    dank.disabled = false;
    await herlaadDetail(dank.dataset.dankbericht);
    return;
  }

  /* Vooruit of terug in het traject, via de pijltjes of door op een bol te
     klikken. Zo kan je een stap overslaan én terugkeren. */
  const stap = e.target.closest("[data-stap]");
  if (stap) {
    const id = $("#detail").dataset.project;
    const fase = stap.dataset.stap;
    stap.disabled = true;
    const { error } = await sb.from("project_requests")
      .update({ fase, ...faseExtra(fase) }).eq("id", id);
    stap.disabled = false;
    if (error) { alert("Wisselen lukte niet: " + error.message); return; }
    await herlaadDetail(id);
    return;
  }

  /* Van fase wisselen via de knoppen in de fasekaart */
  const nf = e.target.closest("[data-naarfase]");
  if (nf) {
    const id = $("#detail").dataset.project;
    const fase = nf.dataset.naarfase;
    nf.disabled = true;

    const velden = { fase: fase, ...faseExtra(fase) };
    const datumveld = $("#pf-levering");
    if (fase === "feedback" && datumveld && datumveld.value) velden.levering = datumveld.value;

    const { error } = await sb.from("project_requests").update(velden).eq("id", id);
    nf.disabled = false;
    if (error) { alert("Wisselen lukte niet: " + error.message); return; }

    /* Bij het afsluiten hoort een afsluitend bericht in het gesprek. */
    if (fase === "afgewerkt") {
      await sb.from("project_berichten").insert([{
        aanvraag_id: id, van: "systeem",
        bericht: "Dit project is afgerond. Bedankt voor de samenwerking! " +
                 "Vergeet je bestand niet te bewaren: over drie dagen wordt alles gewist."
      }]);
    }

    await herlaadDetail(id);
    return;
  }

  /* Een gevraagde extra ronde toekennen of afwijzen */
  const et = e.target.closest("[data-extratoe]");
  if (et) {
    const a = aanvragen.find((x) => x.id === et.dataset.extratoe);
    await sb.from("project_requests").update({
      rondes: (a.rondes || 0) + 1, extra_gevraagd: null, fase: "aanpassen"
    }).eq("id", a.id);
    await sb.from("project_berichten").insert([{
      aanvraag_id: a.id, van: "systeem",
      bericht: "Je kreeg een extra feedbackronde. Joppe verwerkt je opmerkingen."
    }]);
    await herlaadDetail(a.id);
    return;
  }

  const ew = e.target.closest("[data-extraweg]");
  if (ew) {
    const reden = prompt("Wat wil je de klant laten weten?",
      "Een extra ronde valt buiten het pakket. Laat weten wat je in gedachten hebt, dan bekijk ik wat mogelijk is.");
    if (reden === null) return;
    await sb.from("project_requests").update({ extra_gevraagd: null }).eq("id", ew.dataset.extraweg);
    if (reden.trim()) {
      await sb.from("project_berichten").insert([{
        aanvraag_id: ew.dataset.extraweg, van: "joppe", bericht: reden.trim()
      }]);
    }
    await herlaadDetail(ew.dataset.extraweg);
    return;
  }

  /* Een extra feedbackronde toekennen */
  const er = e.target.closest("[data-extraronde]");
  if (er) {
    const a = aanvragen.find((x) => x.id === er.dataset.extraronde);
    await sb.from("project_requests").update({ rondes: (a.rondes || 0) + 1 }).eq("id", a.id);
    await sb.from("project_berichten").insert([{
      aanvraag_id: a.id, van: "systeem", bericht: "Je kreeg een extra feedbackronde."
    }]);
    await herlaadDetail(a.id);
    return;
  }

  /* Betaling ontvangen */
  const bt = e.target.closest("[data-betaald]");
  if (bt) {
    bt.disabled = true;
    const { error } = await sb.from("project_requests").update({
      betaald: true,
      fase: "download",
      betaling_bedrag: $("#pf-bedrag2").value.trim() || null,
      betaling_link: $("#pf-betaallink2").value.trim() || null
    }).eq("id", bt.dataset.betaald);
    bt.disabled = false;
    if (error) { alert("Opslaan lukte niet: " + error.message); return; }
    await sb.from("project_berichten").insert([{
      aanvraag_id: bt.dataset.betaald, van: "systeem",
      bericht: "Je betaling is ontvangen. Je eindbestand staat klaar."
    }]);
    await herlaadDetail(bt.dataset.betaald);
    return;
  }

  /* Een levering als finale versie markeren */
  const fn = e.target.closest("[data-finaal]");
  if (fn) {
    const b = leveringen.find((x) => x.id === fn.dataset.finaal);
    await sb.from("project_files").update({ finaal: !b.finaal }).eq("id", b.id);
    await herlaadDetail(b.aanvraag_id);
    return;
  }

  /* Levering tonen, verbergen of verwijderen */
  const tl = e.target.closest("[data-toonlevering]");
  if (tl) {
    const b = leveringen.find((x) => x.id === tl.dataset.toonlevering);
    await sb.from("project_files").update({ zichtbaar: !b.zichtbaar }).eq("id", b.id);
    await herlaadDetail(b.aanvraag_id);
    return;
  }
  const wl = e.target.closest("[data-weglevering]");
  if (wl) {
    const b = leveringen.find((x) => x.id === wl.dataset.weglevering);
    if (!confirm("Deze levering verwijderen?")) return;
    await sb.from("project_files").delete().eq("id", wl.dataset.weglevering);
    await herlaadDetail(b.aanvraag_id);
    return;
  }

  /* Bericht naar de klant */
  const pber = e.target.closest("[data-projectbericht]");
  if (pber) {
    const tekst = $("#pb-tekst").value.trim();
    if (tekst.length < 2) return;
    pber.disabled = true;
    await sb.from("project_berichten").insert([{
      aanvraag_id: pber.dataset.projectbericht, van: "joppe", bericht: tekst
    }]);
    await sb.from("project_berichten").update({ gelezen: true })
      .eq("aanvraag_id", pber.dataset.projectbericht).eq("van", "klant");
    pber.disabled = false;
    await herlaadDetail(pber.dataset.projectbericht);
    return;
  }


});

/* Klik naast het venster om te sluiten */
sluitBijKlikNaast($("#detail"));

/* Uploaden gebeurt in een eigen venster, dus dit hoort hier en niet bij de
   luisteraar van het projectvenster: een klik in het ene venster bereikt het
   andere niet. */
$("#uploadvenster").addEventListener("click", async (e) => {
  const nl = e.target.closest("[data-nieuwelevering]");
  if (!nl) return;
    const note = $("#nl-note");
    const zeg = (m, k) => { note.hidden = false; note.textContent = m; note.className = "form__note form__note--" + k; };
    const id = nl.dataset.nieuwelevering;
    const a = aanvragen.find((x) => x.id === id);
    const titel = $("#nl-titel").value.trim();
    const url = $("#nl-url").value.trim();
    const finaal = $("#nl-finaal").checked;
    const ronde = Number($("#nl-ronde").value) || 1;

    if (!titel) { zeg("Geef de versie een titel.", "err"); return; }
    if (!url) { zeg("Plak de link naar je bestand op Drive of YouTube.", "err"); return; }
    if (!/^https?:\/\//i.test(url)) { zeg("De link moet met https:// beginnen.", "err"); return; }

    nl.disabled = true;
    nl.textContent = "Bezig…";

    try {
      const { error } = await sb.from("project_files").insert([{
        aanvraag_id: id, titel, soort: $("#nl-soort").value, url, finaal, ronde,
        status: finaal ? "goedgekeurd" : "open",
        notitie: $("#nl-notitie").value.trim() || null
      }]);
      if (error) throw error;

      /* Een finale versie hoeft de klant niet meer goed te keuren: die stap is
         al gezet. Wel moet de betaalinfo kloppen voor de downloadknop. */
      if (finaal) {
        const bedrag = metEuro($("#nl-bedrag")?.value) || null;
        const link = $("#nl-betaallink")?.value.trim() || null;
        await sb.from("project_requests").update({
          betaling_bedrag: bedrag,
          betaling_link: link,
          prijs: bedrag || a?.prijs || null
        }).eq("id", id);
      }

      /* Eerdere versies inklappen: alleen de nieuwste staat open bij de klant. */
      await sb.from("project_files").update({ status: "verlopen" })
        .eq("aanvraag_id", id).eq("status", "open").neq("ronde", ronde);

      /* De klant hoort te weten dat er iets nieuws staat. */
      if (!finaal) {
        await sb.from("project_berichten").insert([{
          aanvraag_id: id, van: "systeem",
          bericht: `Er staat een nieuwe versie klaar om te bekijken: ${titel}.`
        }]);
      }

      /* Het traject schuift vanzelf op:
         een gewone versie zet productie om in feedback, een finale versie
         gaat naar de betaling, of meteen naar downloaden als er niets te
         betalen valt. */
      if (finaal) {
        const gratis = a?.gratis || !a?.betaling_nodig;
        const volgende = gratis || a?.betaald ? "download" : "betaling";
        await sb.from("project_requests").update({ fase: volgende }).eq("id", id);
        await sb.from("project_berichten").insert([{
          aanvraag_id: id, van: "systeem",
          bericht: volgende === "betaling"
            ? "De finale versie staat klaar. Na betaling kan je ze downloaden."
            : "De finale versie staat klaar om te downloaden."
        }]);
      } else if (a && a.fase === "productie") {
        await sb.from("project_requests").update({ fase: "feedback" }).eq("id", id);
      }

      nl.disabled = false;
      nl.textContent = "Uploaden";
      $("#uploadvenster").close();
      await herlaadDetail(id);
    } catch (err) {
    nl.disabled = false;
    nl.textContent = "Uploaden";
    zeg(err.message || "Toevoegen lukte niet.", "err");
  }
});


/* --------------------------------------------------------------------------
   Herladen
   --------------------------------------------------------------------------
   Werk je in twee tabbladen, of wijzigde er iets buiten de admin, dan haal je
   hiermee alles opnieuw op zonder de pagina te verversen.
   -------------------------------------------------------------------------- */

$("#herlaadknop").addEventListener("click", async (e) => {
  const knop = e.currentTarget;
  knop.disabled = true;
  const origineel = knop.textContent;
  knop.textContent = "Bezig…";

  const taken = [loadMessages()];
  if (aanvragenGeladen) taken.push(loadAanvragen());
  if (reviewsGeladen) taken.push(loadReviews());
  if (statsGeladen) taken.push(loadStats());
  await Promise.all(taken);

  knop.disabled = false;
  knop.textContent = "Bijgewerkt";
  setTimeout(() => (knop.textContent = origineel), 1400);
});

/* --------------------------------------------------------------------------
   Testproject
   --------------------------------------------------------------------------
   Maakt een volledig nepproject aan zodat je het traject kan doorlopen zonder
   een echte klant. Werkt met dezelfde functie als een echte aanvraag, dus wat
   je hier test, gedraagt zich later net zo.
   -------------------------------------------------------------------------- */

const TESTNAMEN = ["Test Janssens", "Proef Peeters", "Demo De Vries", "Voorbeeld Van Damme"];

$("#testproject").addEventListener("click", async (e) => {
  const knop = e.currentTarget;
  const naam = TESTNAMEN[Math.floor(Math.random() * TESTNAMEN.length)];
  const pakketten = (work?.prijzen?.pakketten || []).filter((x) => x && x.naam);
  const pakket = pakketten.length ? pakketten[0] : null;

  knop.disabled = true;
  knop.textContent = "Bezig…";

  const { data, error } = await sb.rpc("submit_open_request", {
    p_data: {
      naam,
      email: "test@voorbeeld.be",
      titel: "[TEST] " + (pakket ? pakket.naam + " voor een testklant" : "Testproject"),
      beschrijving:
        "Dit is een testproject dat je zelf aanmaakte. Loop het traject gerust " +
        "helemaal door; verwijder het achteraf met de knop Verwijder.",
      telefoon: "0470 00 00 00",
      pakket: pakket ? pakket.naam : null,
      rondes: Number(pakket?.rondes ?? 2),
      _velden: [
        { label: "Naam", waarde: naam },
        { label: "E-mailadres", waarde: "test@voorbeeld.be" },
        { label: "Waarover gaat het?", waarde: "Een testproject om het traject uit te proberen." }
      ]
    }
  });

  knop.disabled = false;
  knop.textContent = "+ Testproject aanmaken";

  if (error || !data?.ok) {
    alert("Aanmaken lukte niet: " + (error?.message || data?.reden || "onbekende fout"));
    return;
  }

  await loadAanvragen();
  const nieuw = aanvragen.find((x) => x.referentie === data.referentie);
  if (nieuw) toonDetail(nieuw);
});

/* --------------------------------------------------------------------------
   Reviews
   --------------------------------------------------------------------------
   Reviews die bezoekers zelf insturen komen binnen als "wachtend" en staan
   niet op de site tot je ze goedkeurt.
   -------------------------------------------------------------------------- */

let reviews = [];
let reviewFilter = "wachtend";

const RSTATUS = {
  wachtend: { label: "Wacht op nalezing", klasse: "badge--nieuw" },
  zichtbaar: { label: "Op de site", klasse: "badge--goedgekeurd" },
  verborgen: { label: "Verborgen", klasse: "badge--afgewezen" }
};

const sterrenRij = (n) =>
  `<span class="stars">${[1, 2, 3, 4, 5]
    .map(
      (i) => `<svg class="star ${i <= n ? "is-on" : ""}" width="14" height="14"
        viewBox="0 0 20 19" aria-hidden="true"><path d="M10 0l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L10 14.3 4.2 17.8l1.6-6.6L.6 6.8l6.8-.5z" fill="currentColor"/></svg>`
    )
    .join("")}</span>`;

async function loadReviews() {
  const lijst = $("#reviewlijst");
  lijst.innerHTML = `<div class="empty">Reviews laden…</div>`;

  const { data, error } = await sb
    .from("reviews")
    .select("*")
    .order("volgorde", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    lijst.innerHTML = `<div class="empty"><strong>Reviews laden lukte niet</strong>${esc(error.message)}.
      Voer supabase-setup.sql opnieuw uit in Supabase.</div>`;
    console.error("[JoppeDS] reviews laden", error);
    return;
  }

  reviews = data;
  const wachtend = data.filter((r) => r.status === "wachtend").length;
  $("#badge-reviews").textContent = wachtend ? `(${wachtend})` : "";

  toonOverzet();
  toonReviews();
}

/* Eenmalige overname van reviews die eerder in het tabblad Inhoud stonden */
function toonOverzet() {
  const vak = $("#reviewoverzet");
  const oud = (work?.reviews || []).filter((r) => r && r.tekst);

  if (!oud.length || reviews.length) { vak.innerHTML = ""; return; }

  vak.innerHTML = `
    <div class="group" style="border-color:var(--accent)">
      <h2>Je hebt nog ${oud.length} ${oud.length === 1 ? "review" : "reviews"} in het tabblad Inhoud</h2>
      <p class="hint">
        Reviews worden nu hier beheerd. Neem ze één keer over, dan staan ze samen
        met de ingestuurde reviews op één plek.
      </p>
      <button class="btn btn--fill" id="overzetknop">Neem ze over</button>
    </div>`;

  $("#overzetknop").addEventListener("click", async (e) => {
    const knop = e.target;
    knop.disabled = true;
    knop.textContent = "Bezig…";

    const rijen = oud.map((r, i) => ({
      naam: r.naam || "Onbekend",
      rol: r.rol || null,
      sterren: Math.min(5, Math.max(1, Number(r.sterren) || 5)),
      tekst: r.tekst,
      status: "zichtbaar",
      volgorde: i,
      bron: "admin"
    }));

    const { error } = await sb.from("reviews").insert(rijen);
    if (error) { alert("Overnemen lukte niet: " + error.message); knop.disabled = false; return; }

    /* Uit de oude plek halen zodat ze niet dubbel verschijnen */
    work.reviews = [];
    await sb.from("site_content").upsert({ id: 1, data: work, updated_at: new Date().toISOString() });

    loadReviews();
  });
}

function toonReviews() {
  const lijst = $("#reviewlijst");
  const term = zoek.reviews;

  let rijen = reviewFilter ? reviews.filter((r) => r.status === reviewFilter) : reviews;
  const voorZoeken = rijen.length;

  rijen = rijen.filter((r) => past([r.naam, r.rol, r.email, r.tekst], term));

  if (term && !rijen.length) {
    lijst.innerHTML = gevonden(0, voorZoeken, term) +
      `<div class="empty"><strong>Niets gevonden</strong>Probeer een ander woord, of kies een andere filter.</div>`;
    return;
  }

  if (!rijen.length) {
    const leeg = {
      wachtend: ["Niets om na te lezen", "Nieuwe reviews van bezoekers verschijnen hier eerst."],
      zichtbaar: ["Nog niets op de site", "Keur een review goed of voeg er zelf een toe."],
      verborgen: ["Niets verborgen", "Reviews die je verbergt komen hier terecht."],
      "": ["Nog geen reviews", "Bezoekers kunnen er een schrijven via de knop op je site."]
    }[reviewFilter];
    lijst.innerHTML = `<div class="empty"><strong>${esc(leeg[0])}</strong>${esc(leeg[1])}</div>`;
    return;
  }

  const zichtbaarLijst = reviewFilter === "zichtbaar";

  lijst.innerHTML = gevonden(rijen.length, voorZoeken, term) + rijen
    .map((r, i) => {
      const st = RSTATUS[r.status] || RSTATUS.wachtend;
      return `
      <article class="rev ${r.status === "wachtend" ? "is-nieuw" : ""}" data-id="${r.id}">
        <div class="rev__top">
          ${sterrenRij(r.sterren)}
          <span class="badge ${st.klasse}">${esc(st.label)}</span>
          <span class="msg__meta">${esc(datum(r.created_at))}${
            r.bron === "admin" ? " · zelf toegevoegd" : ""
          }</span>
        </div>

        <p class="rev__tekst">${markeer(r.tekst, term)}</p>

        <p class="rev__wie">
          <strong>${markeer(r.naam, term)}</strong>${r.rol ? " · " + markeer(r.rol, term) : ""}
          ${r.email ? ` · <a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : ""}
        </p>

        <div class="rev__acts">
          ${r.status !== "zichtbaar" ? `<button class="mini" data-zet="zichtbaar">Op de site zetten</button>` : ""}
          ${r.status !== "verborgen" ? `<button class="mini" data-zet="verborgen">Verbergen</button>` : ""}
          <button class="mini" data-bewerk="1">Bewerken</button>
          ${
            zichtbaarLijst
              ? `<button class="mini" data-schuif="op" ${i === 0 ? "disabled" : ""}>&uarr;</button>
                 <button class="mini" data-schuif="neer" ${i === rijen.length - 1 ? "disabled" : ""}>&darr;</button>`
              : ""
          }
          <button class="mini mini--danger" data-weg="1">Verwijderen</button>
        </div>
      </article>`;
    })
    .join("");
}

$("#reviewfilter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rstatus]");
  if (!b) return;
  $$("#reviewfilter [data-rstatus]").forEach((x) => x.classList.toggle("is-on", x === b));
  reviewFilter = b.dataset.rstatus;
  toonReviews();
});

$("#reviewlijst").addEventListener("click", async (e) => {
  const kaart = e.target.closest(".rev");
  if (!kaart) return;
  const r = reviews.find((x) => x.id === kaart.dataset.id);
  if (!r) return;

  const zet = e.target.closest("[data-zet]");
  const weg = e.target.closest("[data-weg]");
  const bewerk = e.target.closest("[data-bewerk]");
  const schuif = e.target.closest("[data-schuif]");

  if (zet) {
    const nieuw = zet.dataset.zet;
    /* Nieuw goedgekeurde reviews achteraan zetten */
    const achteraan = nieuw === "zichtbaar" && r.status !== "zichtbaar"
      ? Math.max(0, ...reviews.filter((x) => x.status === "zichtbaar").map((x) => x.volgorde)) + 1
      : r.volgorde;
    await sb.from("reviews").update({ status: nieuw, volgorde: achteraan }).eq("id", r.id);
    loadReviews();
  }

  if (weg) {
    if (!confirm(`De review van ${r.naam} definitief verwijderen?`)) return;
    await sb.from("reviews").delete().eq("id", r.id);
    loadReviews();
  }

  if (bewerk) bewerkReview(r);

  if (schuif) {
    const rij = reviews.filter((x) => x.status === "zichtbaar");
    const i = rij.findIndex((x) => x.id === r.id);
    const j = schuif.dataset.schuif === "op" ? i - 1 : i + 1;
    if (j < 0 || j >= rij.length) return;
    await Promise.all([
      sb.from("reviews").update({ volgorde: j }).eq("id", rij[i].id),
      sb.from("reviews").update({ volgorde: i }).eq("id", rij[j].id)
    ]);
    loadReviews();
  }
});

/* ---- Review bewerken of zelf toevoegen ---- */

function bewerkReview(r) {
  const nieuw = !r;
  const d = r || { naam: "", rol: "", email: "", sterren: 5, tekst: "", status: "zichtbaar" };
  const dlg = $("#reviewbewerk");

  dlg.innerHTML = `
    <div class="sheet__head">
      <div>
        <h2>${nieuw ? "Review toevoegen" : "Review bewerken"}</h2>
        <p class="hint" style="margin:0">${
          nieuw
            ? "Voor reviews die je per mail of bericht kreeg."
            : "Pas gerust typfouten aan, maar laat de inhoud van de schrijver intact."
        }</p>
      </div>
      <button class="mini" type="button" data-rsluit="1">Sluiten</button>
    </div>

    <div class="sheet__body">
      <div class="form">
        <div class="form__row">
          <div class="field">
            <label for="rb-naam">Naam</label>
            <input id="rb-naam" type="text" maxlength="80" value="${esc(d.naam)}">
          </div>
          <div class="field">
            <label for="rb-rol">Bedrijf, kanaal of functie</label>
            <input id="rb-rol" type="text" maxlength="100" value="${esc(d.rol || "")}">
          </div>
        </div>

        <div class="form__row">
          <div class="field">
            <label for="rb-sterren">Sterren</label>
            <select id="rb-sterren">
              ${[5, 4, 3, 2, 1]
                .map((n) => `<option value="${n}" ${n === d.sterren ? "selected" : ""}>${"★".repeat(n)}${"☆".repeat(5 - n)}  (${n})</option>`)
                .join("")}
            </select>
          </div>
          <div class="field">
            <label for="rb-status">Status</label>
            <select id="rb-status">
              ${Object.entries(RSTATUS)
                .map(([k, v]) => `<option value="${k}" ${k === d.status ? "selected" : ""}>${esc(v.label)}</option>`)
                .join("")}
            </select>
          </div>
        </div>

        <div class="field">
          <label for="rb-tekst">Review</label>
          <textarea id="rb-tekst" rows="5" maxlength="1500">${esc(d.tekst)}</textarea>
        </div>

        <div class="field">
          <label for="rb-email">E-mailadres</label>
          <input id="rb-email" type="email" maxlength="160" value="${esc(d.email || "")}"
                 placeholder="Optioneel, komt nooit op de site">
        </div>

        <div class="form__note" id="rb-note" hidden></div>
      </div>
    </div>

    <div class="sheet__foot">
      <button class="btn btn--fill" data-rbewaar="${nieuw ? "nieuw" : r.id}">Opslaan</button>
      <button class="mini" type="button" data-rsluit="1">Annuleren</button>
    </div>`;

  dlg.showModal();
}

$("#reviewnieuw").addEventListener("click", (e) => { e.preventDefault(); bewerkReview(null); });

$("#reviewbewerk").addEventListener("click", async (e) => {
  const dlg = $("#reviewbewerk");
  if (e.target.closest("[data-rsluit]")) { dlg.close(); return; }

  const bewaar = e.target.closest("[data-rbewaar]");
  if (!bewaar) return;

  const rij = {
    naam: $("#rb-naam").value.trim(),
    rol: $("#rb-rol").value.trim() || null,
    email: $("#rb-email").value.trim() || null,
    sterren: Number($("#rb-sterren").value),
    tekst: $("#rb-tekst").value.trim(),
    status: $("#rb-status").value
  };

  const note = $("#rb-note");
  if (rij.naam.length < 2 || rij.tekst.length < 10) {
    note.hidden = false;
    note.className = "form__note form__note--err";
    note.textContent = "Vul minstens een naam en een review van 10 tekens in.";
    return;
  }

  bewaar.disabled = true;
  const id = bewaar.dataset.rbewaar;

  const { error } =
    id === "nieuw"
      ? await sb.from("reviews").insert([{ ...rij, bron: "admin", volgorde: reviews.length }])
      : await sb.from("reviews").update(rij).eq("id", id);

  bewaar.disabled = false;

  if (error) {
    note.hidden = false;
    note.className = "form__note form__note--err";
    note.textContent = "Opslaan lukte niet: " + error.message;
    return;
  }

  dlg.close();
  loadReviews();
});

sluitBijKlikNaast($("#reviewbewerk"));

/* --------------------------------------------------------------------------
   Reservekopie van de inhoud
   -------------------------------------------------------------------------- */

function backupMelding(tekst, soort) {
  const el = $("#backup-note");
  el.hidden = false;
  el.textContent = tekst;
  el.className = "form__note form__note--" + soort;
}

$("#backup-download").addEventListener("click", (e) => {
  e.preventDefault();

  const kopie = {
    bewaard_op: new Date().toISOString(),
    versie: 1,
    inhoud: work
  };

  const blob = new Blob([JSON.stringify(kopie, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `joppeds-inhoud-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);

  backupMelding("Kopie gedownload. Bewaar het bestand ergens veilig.", "ok");
});

$("#backup-kies").addEventListener("click", (e) => {
  e.preventDefault();
  $("#backup-bestand").click();
});

$("#backup-bestand").addEventListener("change", async (e) => {
  const bestand = e.target.files?.[0];
  if (!bestand) return;

  try {
    const tekst = await bestand.text();
    const kopie = JSON.parse(tekst);
    const inhoud = kopie.inhoud || kopie;

    /* Even kijken of dit werkelijk een kopie van deze site is */
    if (!inhoud || typeof inhoud !== "object" || (!inhoud.hero && !inhoud.projecten)) {
      backupMelding("Dit lijkt geen kopie van deze site te zijn.", "err");
      return;
    }

    const aantal = (inhoud.projecten || []).length;
    if (!confirm(
      `Deze kopie bevat ${aantal} ${aantal === 1 ? "project" : "projecten"}` +
      (kopie.bewaard_op ? ` en is van ${new Date(kopie.bewaard_op).toLocaleString("nl-BE")}` : "") +
      `.\n\nAlles wat nu in de editor staat wordt vervangen. Doorgaan?`
    )) return;

    work = inhoud;
    buildEditor();
    status("Kopie geladen. Klik op Wijzigingen opslaan om ze door te voeren.", "");
    backupMelding("Kopie geladen in de editor. Nog niet opgeslagen.", "ok");
  } catch (err) {
    console.error("[JoppeDS] kopie inlezen", err);
    backupMelding("Dit bestand kon niet gelezen worden.", "err");
  } finally {
    e.target.value = "";
  }
});

/* --------------------------------------------------------------------------
   Bezoekers
   -------------------------------------------------------------------------- */

let dagenBereik = 7;

function telOp(rijen, veld) {
  const m = new Map();
  rijen.forEach((r) => {
    const k = r[veld] || "onbekend";
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function tabel(titel, kop, rijen, totaal) {
  if (!rijen.length) return "";
  return `
    <div class="group">
      <h2>${esc(titel)}</h2>
      <table class="tbl">
        <thead><tr><th>${esc(kop)}</th><th>Bezoeken</th></tr></thead>
        <tbody>
          ${rijen
            .slice(0, 10)
            .map(
              ([k, n]) => `<tr>
                <td>${esc(k)}</td>
                <td>${n}${totaal ? ` <span style="color:var(--muted)">(${Math.round((n / totaal) * 100)}%)</span>` : ""}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

async function loadStats() {
  const view = $("#statsview");
  view.innerHTML = `<div class="empty">Statistieken laden…</div>`;

  const vanaf = new Date(Date.now() - dagenBereik * 864e5).toISOString();

  const { data, error } = await sb
    .from("pageviews")
    .select("created_at, pagina, bron, toestel, sessie")
    .gte("created_at", vanaf)
    .order("created_at", { ascending: false })
    .limit(20000);

  if (error) {
    view.innerHTML = `<div class="empty"><strong>Statistieken laden lukte niet</strong>${esc(error.message)}</div>`;
    return;
  }

  /* Cijfers over berichten en aanvragen erbij halen. head:true betekent dat
     we alleen het aantal opvragen, niet de inhoud. */
  const [berTotaal, berOngelezen, aanvOpen, aanvTotaal, revWacht, revZicht] = await Promise.all([
    sb.from("messages").select("id", { count: "exact", head: true }),
    sb.from("messages").select("id", { count: "exact", head: true }).eq("gelezen", false),
    sb.from("project_requests").select("id", { count: "exact", head: true })
      .in("status", ["nieuw", "in behandeling"]),
    sb.from("project_requests").select("id", { count: "exact", head: true }),
    sb.from("reviews").select("id", { count: "exact", head: true }).eq("status", "wachtend"),
    sb.from("reviews").select("id", { count: "exact", head: true }).eq("status", "zichtbaar")
  ]);

  const n = (r) => r?.count ?? 0;

  const kpiWerk = `
    <div class="kpis">
      <div class="kpi">
        <div class="kpi__val">${n(berTotaal)}</div>
        <div class="kpi__lbl">Berichten totaal</div>
      </div>
      <div class="kpi">
        <div class="kpi__val" style="${n(berOngelezen) ? "color:var(--accent)" : ""}">${n(berOngelezen)}</div>
        <div class="kpi__lbl">Ongelezen</div>
      </div>
      <div class="kpi">
        <div class="kpi__val" style="${n(aanvOpen) ? "color:var(--accent)" : ""}">${n(aanvOpen)}</div>
        <div class="kpi__lbl">Open aanvragen</div>
      </div>
      <div class="kpi">
        <div class="kpi__val">${n(aanvTotaal)}</div>
        <div class="kpi__lbl">Aanvragen totaal</div>
      </div>
      <div class="kpi">
        <div class="kpi__val" style="${n(revWacht) ? "color:var(--accent)" : ""}">${n(revWacht)}</div>
        <div class="kpi__lbl">Reviews na te lezen</div>
      </div>
      <div class="kpi">
        <div class="kpi__val">${n(revZicht)}</div>
        <div class="kpi__lbl">Reviews op de site</div>
      </div>
    </div>`;

  if (!data.length) {
    view.innerHTML =
      kpiWerk +
      `<div class="empty"><strong>Nog geen bezoeken in deze periode</strong>Bezoeken worden pas geteld zodra de site online staat op GitHub Pages.</div>`;
    return;
  }

  const bezoeken = data.length;
  const sessies = new Set(data.map((r) => r.sessie)).size;

  /* Bezoeken per dag, van oud naar nieuw */
  const perDag = new Map();
  for (let i = dagenBereik - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
    perDag.set(d, 0);
  }
  data.forEach((r) => {
    const d = r.created_at.slice(0, 10);
    if (perDag.has(d)) perDag.set(d, perDag.get(d) + 1);
  });

  const dagen = [...perDag.entries()];
  const piek = Math.max(...dagen.map((d) => d[1]), 1);
  const vandaag = perDag.get(new Date().toISOString().slice(0, 10)) || 0;
  const gem = Math.round((bezoeken / dagenBereik) * 10) / 10;

  const kort = (iso) => {
    const d = new Date(iso);
    return `${d.getDate()}/${d.getMonth() + 1}`;
  };

  /* Cijfers over berichten en aanvragen erbij halen. head:true betekent dat
     we alleen het aantal opvragen, niet de inhoud. */
  view.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="kpi__val">${bezoeken}</div><div class="kpi__lbl">Bezoeken</div></div>
      <div class="kpi"><div class="kpi__val">${sessies}</div><div class="kpi__lbl">Unieke bezoekers</div></div>
      <div class="kpi"><div class="kpi__val">${vandaag}</div><div class="kpi__lbl">Vandaag</div></div>
      <div class="kpi"><div class="kpi__val">${gem}</div><div class="kpi__lbl">Gemiddeld per dag</div></div>
    </div>

    ${kpiWerk}

    <div class="group">
      <h2>Bezoeken per dag</h2>
      <p class="hint">Hoogste dag: ${piek} ${piek === 1 ? "bezoek" : "bezoeken"}. </p>
      <div class="bars">
        ${dagen
          .map(
            ([d, nn]) =>
              `<div class="bar ${nn === piek && nn > 0 ? "is-top" : ""}"
                    style="height:${Math.max((nn / piek) * 100, 1.5)}%"
                    title="${esc(kort(d))} — ${nn}"></div>`
          )
          .join("")}
      </div>
      <div class="axis"><span>${esc(kort(dagen[0][0]))}</span><span>${esc(kort(dagen[dagen.length - 1][0]))}</span></div>
    </div>

    ${tabel("Waar bezoekers vandaan komen", "Bron", telOp(data, "bron"), bezoeken)}
    ${tabel("Welke pagina's", "Pagina", telOp(data, "pagina"), bezoeken)}
    ${tabel("Soort toestel", "Toestel", telOp(data, "toestel"), bezoeken)}
  `;
}

$("#range").addEventListener("click", (e) => {
  const b = e.target.closest("[data-days]");
  if (!b) return;
  $$("#range .mini").forEach((x) => x.classList.toggle("is-on", x === b));
  dagenBereik = Number(b.dataset.days);
  loadStats();
});

/* --------------------------------------------------------------------------
   Inhoud bewerken
   -------------------------------------------------------------------------- */

const field = (path, label, ph = "") => `
  <div class="field">
    <label>${esc(label)}</label>
    <input type="text" data-path="${path}" value="${esc(getPath(work, path) ?? "")}" placeholder="${esc(ph)}">
  </div>`;

const area = (path, label, rows = 6, hint = "") => `
  <div class="field">
    <label>${esc(label)}${hint ? ` — ${esc(hint)}` : ""}</label>
    <textarea rows="${rows}" data-path="${path}">${esc(getPath(work, path) ?? "")}</textarea>
  </div>`;

/* Lijst van losse regels (array van strings) in één tekstvak */
const lines = (path, label, hint) => `
  <div class="field">
    <label>${esc(label)}${hint ? ` — ${esc(hint)}` : ""}</label>
    <textarea rows="4" data-path="${path}" data-kind="lines">${esc(
      (getPath(work, path) || []).join("\n")
    )}</textarea>
  </div>`;

const itemHead = (nr, arrPath, i, len) => `
  <div class="item__head">
    <span class="item__nr">${esc(nr)}</span>
    <div class="item__tools">
      <button class="mini" data-move="up"   data-arr="${arrPath}" data-i="${i}" ${i === 0 ? "disabled" : ""}>&uarr;</button>
      <button class="mini" data-move="down" data-arr="${arrPath}" data-i="${i}" ${i === len - 1 ? "disabled" : ""}>&darr;</button>
      <button class="mini mini--danger" data-del="1" data-arr="${arrPath}" data-i="${i}">Verwijderen</button>
    </div>
  </div>`;

const addBtn = (arrPath, label) =>
  `<button class="mini" data-add="${arrPath}">+ ${esc(label)}</button>`;

/* Keuzelijst, bijvoorbeeld voor het aantal sterren */
const keuze = (path, label, opties) => {
  const nu = String(getPath(work, path) ?? "");
  return `
  <div class="field">
    <label>${esc(label)}</label>
    <select data-path="${path}">
      ${opties
        .map(
          (o) =>
            `<option value="${esc(o.v)}" ${String(o.v) === nu ? "selected" : ""}>${esc(o.t)}</option>`
        )
        .join("")}
    </select>
  </div>`;
};

/* Aan/uit-schakelaar, bijvoorbeeld om een hele sectie te verbergen */
const schakelaar = (path, label, uitleg) => `
  <label class="schakel">
    <input type="checkbox" data-path="${path}" data-kind="bool" ${getPath(work, path) ? "checked" : ""}>
    <span class="schakel__spoor"><span class="schakel__knop"></span></span>
    <span class="schakel__tekst">
      <strong>${esc(label)}</strong>
      ${uitleg ? `<span>${esc(uitleg)}</span>` : ""}
    </span>
  </label>`;

const STERREN = [
  { v: 5, t: "★★★★★  (5)" },
  { v: 4, t: "★★★★☆  (4)" },
  { v: 3, t: "★★★☆☆  (3)" },
  { v: 2, t: "★★☆☆☆  (2)" },
  { v: 1, t: "★☆☆☆☆  (1)" },
  { v: 0, t: "Geen sterren tonen" }
];

/* Onthoudt welke secties openstaan, zodat ze na een wijziging niet
   allemaal dichtklappen. */
/* De onderdelen van het tabblad Inhoud, in de volgorde van het zijmenu.
   Er staat er telkens één open: elf uitklapblokken onder elkaar was niet
   te overzien. */
const SECTIES = [
  ["hero", "Bovenaan", "De site"],
  ["stats", "Statistieken", "De site"],
  ["over", "Over mij", "De site"],
  ["team", "Team", "De site"],
  ["projecten", "Projecten", "De site"],
  ["opleidingen", "Opleidingen", "De site"],
  ["prijzen", "Prijzen", "Aanvragen"],
  ["form-prijsaanvraag", "Formulier prijsaanvraag", "Aanvragen"],
  ["contract", "Overeenkomst", "Aanvragen"],
  ["contact", "Contactformulier", "Onderaan"],
  ["footer", "Footer", "Onderaan"]
];

let actieveSectie = "hero";

function bouwZijnav() {
  const nav = $("#zijnav");
  if (!nav) return;

  let vorige = "";
  nav.innerHTML = SECTIES.map(([sleutel, naam, groep]) => {
    const kop = groep !== vorige ? `<span class="zijnav__kop">${esc(groep)}</span>` : "";
    vorige = groep;
    return kop + `<button class="zijnav__knop ${sleutel === actieveSectie ? "is-on" : ""}"
                    data-sectie="${sleutel}">${esc(naam)}</button>`;
  }).join("");
}

function toonSectie(sleutel) {
  actieveSectie = sleutel;
  $$("#editor details").forEach((d) => {
    d.hidden = d.dataset.g !== sleutel;
    d.open = d.dataset.g === sleutel;
  });
  $$("#zijnav .zijnav__knop").forEach((b) => b.classList.toggle("is-on", b.dataset.sectie === sleutel));
  $(".inhoud__paneel")?.scrollTo({ top: 0 });
}

function openSecties() {
  return new Set($$("#editor details[open]").map((d) => d.dataset.g));
}


/* --------------------------------------------------------------------------
   Formulieren bewerken
   --------------------------------------------------------------------------
   Beide aanvraagformulieren worden opgebouwd uit een beschrijving. Hieronder
   bouwen we de editor daarvoor.

   Velden met "vast" mogen niet weg: de database heeft ze nodig om te weten
   wie er aanvraagt en waarover het gaat. De teksten erop mag je wel vrij
   veranderen.
   -------------------------------------------------------------------------- */

const VELDSOORTEN = [
  { v: "text", t: "Tekst, één regel" },
  { v: "textarea", t: "Tekst, meerdere regels" },
  { v: "email", t: "E-mailadres" },
  { v: "tel", t: "Telefoonnummer" },
  { v: "url", t: "Link" },
  { v: "number", t: "Getal" },
  { v: "date", t: "Datum" },
  { v: "select", t: "Keuzelijst" },
  { v: "vinkjes", t: "Aankruisvakjes" }
];

function veldEditor(basis, v, i, aantal) {
  const heeftOpties = v.type === "select" || v.type === "vinkjes";
  return `
    <div class="item item--veld">
      <div class="item__head">
        <span class="item__nr">${esc(v.label || "Veld " + (i + 1))}${v.vast ? " · vast" : ""}</span>
        <div class="item__tools">
          <button class="mini" data-move="up"   data-arr="${basis}" data-i="${i}" ${i === 0 ? "disabled" : ""}>&uarr;</button>
          <button class="mini" data-move="down" data-arr="${basis}" data-i="${i}" ${i === aantal - 1 ? "disabled" : ""}>&darr;</button>
          ${
            v.vast
              ? `<button class="mini" disabled title="Dit veld is nodig voor de database">Vast</button>`
              : `<button class="mini mini--danger" data-del="1" data-arr="${basis}" data-i="${i}">Verwijderen</button>`
          }
        </div>
      </div>

      ${field(`${basis}.${i}.label`, "Vraag aan de bezoeker")}

      <div class="grid2">
        ${keuze(`${basis}.${i}.type`, "Soort veld", VELDSOORTEN)}
        ${field(`${basis}.${i}.placeholder`, "Grijze voorbeeldtekst")}
      </div>

      ${field(`${basis}.${i}.hint`, "Uitleg onder het veld")}

      ${heeftOpties ? lines(`${basis}.${i}.opties`, "Keuzes", "één per regel") : ""}

      <div style="display:grid;gap:8px;margin-top:6px">
        ${schakelaar(`${basis}.${i}.verplicht`, "Verplicht invullen")}
        ${schakelaar(`${basis}.${i}.half`, "Halve breedte",
          "Staat dit veld en het volgende beide op half, dan komen ze naast elkaar.")}
      </div>
    </div>`;
}

function formulierEditor(sleutel, naam, uitleg, isOpen) {
  const def = work.formulieren?.[sleutel] || { groepen: [] };
  const groepen = def.groepen || [];
  const aantalVelden = groepen.reduce((n, g) => n + (g.velden || []).length, 0);

  return `
  <details class="group" data-g="form-${sleutel}" ${isOpen("form-" + sleutel)}>
    <summary><span>${esc(naam)}</span><span class="group__sub">${aantalVelden} velden</span></summary>
    <div class="group__body">
      <p class="hint">${esc(uitleg)}</p>

      ${field(`formulieren.${sleutel}.kop`, "Titel boven het formulier")}
      ${area(`formulieren.${sleutel}.tekst`, "Tekst onder de titel", 2)}
      <div class="grid2">
        ${field(`formulieren.${sleutel}.knop`, "Tekst op de verzendknop")}
        ${field(`formulieren.${sleutel}.voetnoot`, "Zinnetje onder de knop")}
      </div>
      ${area(`formulieren.${sleutel}.bedankt`, "Bevestiging na verzenden", 2)}

      ${groepen
        .map(
          (g, gi) => `
        <div class="item item--blok">
          <div class="item__head">
            <span class="item__nr">Blok ${gi + 1}</span>
            <div class="item__tools">
              <button class="mini" data-move="up"   data-arr="formulieren.${sleutel}.groepen" data-i="${gi}" ${gi === 0 ? "disabled" : ""}>&uarr;</button>
              <button class="mini" data-move="down" data-arr="formulieren.${sleutel}.groepen" data-i="${gi}" ${gi === groepen.length - 1 ? "disabled" : ""}>&darr;</button>
              ${
                groepen.length > 1
                  ? `<button class="mini mini--danger" data-del="1" data-arr="formulieren.${sleutel}.groepen" data-i="${gi}">Blok weg</button>`
                  : ""
              }
            </div>
          </div>

          ${field(`formulieren.${sleutel}.groepen.${gi}.titel`, "Titel van dit blok", "Laat leeg voor geen titel")}

          ${(g.velden || [])
            .map((v, vi) =>
              veldEditor(`formulieren.${sleutel}.groepen.${gi}.velden`, v, vi, (g.velden || []).length)
            )
            .join("")}

          ${addBtn(`formulieren.${sleutel}.groepen.${gi}.velden`, "Veld toevoegen")}
        </div>`
        )
        .join("")}

      ${addBtn(`formulieren.${sleutel}.groepen`, "Blok toevoegen")}
    </div>
  </details>`;
}

function buildEditor(bewaarOpen) {
  const open = bewaarOpen || openSecties();
  const isOpen = (k) => (open.has(k) ? "open" : "");

  const p = work.projecten || [];
  const s = work.stats || [];
  const f = work.over?.feiten || [];
  const pk = work.prijzen?.pakketten || [];
  const lid = work.team?.leden || [];
  const o = work.opleidingen || [];
  const soc = work.footer?.socials || [];
  const fl = work.footer?.links || [];

  const telling = (n, enkel, meer) => `${n} ${n === 1 ? enkel : meer}`;

  $("#editor").innerHTML = `

  <details class="group" data-g="hero" ${isOpen("hero")}>
    <summary><span>Bovenaan de pagina</span><span class="group__sub">Titel en knoppen</span></summary>
    <div class="group__body">
      <p class="hint">De eerste woorden die bezoekers zien.</p>
      ${field("hero.studio", "Naam studio")}
      ${field("hero.kicker", "Bovenschrift")}
      ${area("hero.ondertitel", "Ondertitel", 3)}
      <div class="grid2">
        ${field("hero.knop1", "Tekst knop 1")}
        ${field("hero.knop2", "Tekst knop 2")}
      </div>
    </div>
  </details>

  <details class="group" data-g="stats" ${isOpen("stats")}>
    <summary><span>Statistieken</span><span class="group__sub">${telling(s.length, "cijfer", "cijfers")}</span></summary>
    <div class="group__body">
      <p class="hint">De cijfers onder de titel. Ze tellen op bij het laden.</p>
      ${s
        .map(
          (x, i) => `
        <div class="item">
          ${itemHead("Cijfer " + (i + 1), "stats", i, s.length)}
          <div class="grid2">
            ${field(`stats.${i}.value`, "Waarde", "1.39K")}
            ${field(`stats.${i}.label`, "Label", "Abonnees")}
          </div>
          ${field(`stats.${i}.prefix`, "Voorvoegsel", "+")}
        </div>`
        )
        .join("")}
      ${addBtn("stats", "Cijfer toevoegen")}
    </div>
  </details>

  <details class="group" data-g="over" ${isOpen("over")}>
    <summary><span>Over mij</span><span class="group__sub">${telling(f.length, "feit", "feiten")}</span></summary>
    <div class="group__body">
      <p class="hint">Laat een lege regel tussen twee alinea's.</p>
      ${field("over.titel", "Titel")}
      ${area("over.tekst", "Tekst", 8)}
      ${field("over.foto", "Link naar je foto", "assets/img/joppe.jpg")}
      <div style="margin-top:8px">
        ${f
          .map(
            (x, i) => `
          <div class="item">
            ${itemHead("Feit " + (i + 1), "over.feiten", i, f.length)}
            <div class="grid2">
              ${field(`over.feiten.${i}.label`, "Label")}
              ${field(`over.feiten.${i}.value`, "Waarde")}
            </div>
          </div>`
          )
          .join("")}
        ${addBtn("over.feiten", "Feit toevoegen")}
      </div>
    </div>
  </details>


  <details class="group" data-g="team" ${isOpen("team")}>
    <summary><span>Team</span><span class="group__sub">${
      lid.length ? telling(lid.length, "persoon", "personen") : "verborgen op de site"
    }</span></summary>
    <div class="group__body">
      <p class="hint">
        Zolang hier niemand staat, blijft de teamsectie weg van je site.
        Zet de foto's in assets/img en verwijs ernaar, of plak een volledige link.
      </p>
      ${field("team.titel", "Titel")}
      ${area("team.tekst", "Tekst onder de titel", 2)}
      ${lid
        .map(
          (x, i) => `
        <div class="item">
          ${itemHead(x.naam || "Persoon " + (i + 1), "team.leden", i, lid.length)}
          <div class="grid2">
            ${field(`team.leden.${i}.naam`, "Naam")}
            ${field(`team.leden.${i}.functie`, "Functie", "Editor")}
          </div>
          ${field(`team.leden.${i}.foto`, "Foto", "assets/img/naam.jpg")}
          <div class="grid2">
            ${field(`team.leden.${i}.link`, "Link naar social media", "https://…")}
            ${field(`team.leden.${i}.linkLabel`, "Tekst van de link", "Instagram")}
          </div>
        </div>`
        )
        .join("")}
      ${addBtn("team.leden", "Persoon toevoegen")}
    </div>
  </details>

  <details class="group" data-g="projecten" ${isOpen("projecten")}>
    <summary><span>Projecten</span><span class="group__sub">${telling(p.length, "project", "projecten")}</span></summary>
    <div class="group__body">
      <p class="hint">Laat de link leeg als er nog niets online staat.</p>
      ${p
        .map(
          (x, i) => `
        <div class="item">
          ${itemHead(x.titel || "Project " + (i + 1), "projecten", i, p.length)}
          <div class="grid2">
            ${field(`projecten.${i}.titel`, "Titel")}
            ${field(`projecten.${i}.type`, "Soort", "Minecraft")}
          </div>
          ${area(`projecten.${i}.beschrijving`, "Beschrijving", 3)}
          ${lines(`projecten.${i}.stats`, "Statistieken", "één per regel")}
          <div class="grid2">
            ${field(`projecten.${i}.link`, "Link")}
            ${field(`projecten.${i}.linkLabel`, "Tekst van de link", "Bekijken")}
          </div>
          <div class="grid2">
            ${field(`projecten.${i}.afbeelding`, "Link naar afbeelding")}
            ${field(`projecten.${i}.slug`, "Bestandsnaam", "podcast")}
          </div>
        </div>`
        )
        .join("")}
      ${addBtn("projecten", "Project toevoegen")}
    </div>
  </details>

  <details class="group" data-g="prijzen" ${isOpen("prijzen")}>
    <summary><span>Prijzen</span><span class="group__sub">${
      work.prijzen?.zichtbaar ? telling(pk.length, "pakket", "pakketten") : "verborgen op de site"
    }</span></summary>
    <div class="group__body">
      ${schakelaar(
        "prijzen.zichtbaar",
        "Toon de prijzensectie op de site",
        "Staat dit uit, dan bestaat de sectie niet voor bezoekers. Je kan alles hieronder rustig klaarzetten en later aanzetten."
      )}

      <div style="margin-top:20px">
        ${field("prijzen.titel", "Titel")}
        ${area("prijzen.tekst", "Tekst onder de titel", 3)}
      </div>

      ${pk
        .map(
          (x, i) => `
        <div class="item">
          ${itemHead(x.naam || "Pakket " + (i + 1), "prijzen.pakketten", i, pk.length)}
          <div class="grid2">
            ${field(`prijzen.pakketten.${i}.naam`, "Naam", "Long-form")}
            ${field(`prijzen.pakketten.${i}.prijs`, "Prijs", "€ 250")}
          </div>
          <div class="grid2">
            ${field(`prijzen.pakketten.${i}.eenheid`, "Onder de prijs", "vanaf")}
            ${field(`prijzen.pakketten.${i}.rondes`, "Aantal feedbackrondes", "2")}
          </div>
          <div style="margin:10px 0">
            ${schakelaar(`prijzen.pakketten.${i}.uitgelicht`, "Dit pakket uitlichten",
              "Er komt dan een label bovenaan en de knop wordt geel.")}
          </div>
          ${field(`prijzen.pakketten.${i}.label`, "Tekst op dat label", "Meest gekozen")}
          ${area(`prijzen.pakketten.${i}.beschrijving`, "Korte beschrijving", 2)}
          ${lines(`prijzen.pakketten.${i}.punten`, "Wat zit erin", "één per regel")}

          <div style="margin-top:14px">
            ${schakelaar(`prijzen.pakketten.${i}.formulier.gebruikEigen`,
              "Eigen aanvraagformulier voor dit pakket",
              "Staat dit uit, dan gebruikt dit pakket het algemene formulier voor prijsaanvragen.")}
          </div>

          ${
            x.formulier?.gebruikEigen
              ? `<div class="item item--blok" style="margin-top:12px">
                   ${field(`prijzen.pakketten.${i}.formulier.kop`, "Titel boven het formulier")}
                   ${area(`prijzen.pakketten.${i}.formulier.tekst`, "Tekst onder de titel", 2)}
                   <div class="grid2">
                     ${field(`prijzen.pakketten.${i}.formulier.knop`, "Tekst op de knop")}
                     ${field(`prijzen.pakketten.${i}.formulier.bedankt`, "Bevestiging na verzenden")}
                   </div>
                   ${(x.formulier.groepen?.[0]?.velden || [])
                     .map((v, vi) =>
                       veldEditor(
                         `prijzen.pakketten.${i}.formulier.groepen.0.velden`,
                         v, vi, x.formulier.groepen[0].velden.length
                       )
                     )
                     .join("")}
                   ${addBtn(`prijzen.pakketten.${i}.formulier.groepen.0.velden`, "Veld toevoegen")}
                 </div>`
              : ""
          }
        </div>`
        )
        .join("")}
      ${addBtn("prijzen.pakketten", "Pakket toevoegen")}

      <div style="margin-top:16px">
        ${area("prijzen.voetnoot", "Kleine tekst onderaan", 2)}
      </div>
    </div>
  </details>

  ${formulierEditor("prijsaanvraag", "Formulier: prijsaanvraag",
    "Dit formulier opent wanneer iemand bij een pakket op de knop klikt. Het pakket wordt automatisch ingevuld.",
    isOpen)}


  <details class="group" data-g="contract" ${isOpen("contract")}>
    <summary><span>Overeenkomst</span><span class="group__sub">wat de klant tekent</span></summary>
    <div class="group__body">
      <p class="hint">
        Dit is de basistekst. Bij elk project kan je hem nog aanpassen voor je
        goedkeurt. Laat leeg om de ingebouwde tekst te gebruiken.
        Beschikbaar: {naam}, {titel}, {pakket}, {rondes} en {prijs}.
      </p>
      ${area("contract.tekst", "Tekst", 16)}
      <button class="mini" data-standaardcontract="1">Laad de ingebouwde tekst</button>
    </div>
  </details>

  <details class="group" data-g="opleidingen" ${isOpen("opleidingen")}>
    <summary><span>Opleidingen</span><span class="group__sub">${telling(o.length, "opleiding", "opleidingen")}</span></summary>
    <div class="group__body">
      <p class="hint">Masterclasses, cursussen en workshops.</p>
      ${o
        .map(
          (x, i) => `
        <div class="item">
          ${itemHead(x.titel || "Opleiding " + (i + 1), "opleidingen", i, o.length)}
          <div class="grid2">
            ${field(`opleidingen.${i}.titel`, "Titel")}
            ${field(`opleidingen.${i}.instituut`, "Waar")}
          </div>
        </div>`
        )
        .join("")}
      ${addBtn("opleidingen", "Opleiding toevoegen")}
    </div>
  </details>

  <details class="group" data-g="contact" ${isOpen("contact")}>
    <summary><span>Contact</span><span class="group__sub">Formulier</span></summary>
    <div class="group__body">
      <p class="hint">De tekst boven het formulier en de bevestiging erna.</p>
      ${field("contact.titel", "Titel")}
      ${area("contact.tekst", "Tekst", 3)}
      <div class="grid2">
        ${field("contact.knop", "Tekst op de knop")}
        ${field("contact.bedankt", "Bevestiging na versturen")}
      </div>
    </div>
  </details>

  <details class="group" data-g="footer" ${isOpen("footer")}>
    <summary><span>Onderaan de pagina</span><span class="group__sub">${telling(soc.length, "social", "socials")}</span></summary>
    <div class="group__body">
      ${field("footer.tekst", "Naam in de footer")}
      ${field("footer.ondertitel", "Zin onder je naam", "Create. Analyze. Improve. Repeat.")}
      ${field("footer.copyright", "Tekst naast het jaartal", "Alle rechten voorbehouden.")}

      <div class="grid2" style="margin-top:18px">
        ${field("footer.kopSocials", "Titel boven je socials", "Volg mij")}
        ${field("footer.kopLinks", "Titel boven je eigen links", "Snel naar")}
      </div>

      <p class="hint" style="margin:22px 0 10px">
        Socials. Deze verschijnen zowel bij contact als onderaan.
      </p>
      ${soc
        .map(
          (x, i) => `
        <div class="item">
          ${itemHead(x.label || "Social " + (i + 1), "footer.socials", i, soc.length)}
          <div class="grid2">
            ${field(`footer.socials.${i}.label`, "Naam", "YouTube")}
            ${field(`footer.socials.${i}.url`, "Link", "https://…")}
          </div>
        </div>`
        )
        .join("")}
      ${addBtn("footer.socials", "Social toevoegen")}

      <p class="hint" style="margin:22px 0 10px">
        Eigen links onderaan. Verwijs naar een sectie met bijvoorbeeld #contact,
        of naar een volledige webpagina.
      </p>
      ${fl
        .map(
          (x, i) => `
        <div class="item">
          ${itemHead(x.label || "Link " + (i + 1), "footer.links", i, fl.length)}
          <div class="grid2">
            ${field(`footer.links.${i}.label`, "Tekst", "Contact")}
            ${field(`footer.links.${i}.url`, "Waarheen", "#contact")}
          </div>
        </div>`
        )
        .join("")}
      ${addBtn("footer.links", "Link toevoegen")}

      <div style="margin-top:22px;display:grid;gap:10px">
        ${schakelaar("footer.toonReviewknop", "Toon \"Schrijf een review\" onderaan",
          "De knop bij je reviews blijft altijd staan; dit gaat enkel over de footer.")}
        ${schakelaar("footer.toonAdminlink", "Toon de link naar de admin",
          "Zet je die uit, dan bereik je de admin nog steeds via /admin.html.")}
      </div>
    </div>
  </details>`;

  /* Het zijmenu en de zichtbare sectie bijwerken */
  bouwZijnav();
  toonSectie(SECTIES.some(([k]) => k === actieveSectie) ? actieveSectie : "hero");
}
/* Wat er verschijnt als je op "toevoegen" klikt.
   Paden met een nummer erin (formulieren.x.groepen.0.velden) worden op hun
   vorm herkend, want het nummer verschilt per blok. */
function leegItem(path) {
  if (path.endsWith(".velden")) {
    return { id: "veld" + Date.now().toString(36), label: "Nieuwe vraag", type: "text" };
  }
  if (path.endsWith(".groepen")) {
    return { titel: "Nieuw blok", velden: [] };
  }
  return BLANKS[path] || {};
}

/* Nieuwe, lege items per lijst */
const BLANKS = {
  stats: { value: "", label: "", prefix: "+" },
  "over.feiten": { label: "", value: "" },
  projecten: {
    titel: "Nieuw project", type: "", beschrijving: "",
    stats: [], link: "", linkLabel: "Bekijken", afbeelding: "", slug: ""
  },
  reviews: { naam: "", rol: "", sterren: 5, tekst: "" },
  "team.leden": { naam: "", functie: "", foto: "", link: "", linkLabel: "" },
  "footer.links": { label: "", url: "" },
  "prijzen.pakketten": {
    naam: "Nieuw pakket", prijs: "", eenheid: "", beschrijving: "", punten: [], uitgelicht: ""
  },
  opleidingen: { titel: "", instituut: "" },
  "footer.socials": { label: "", url: "" }
};

/* Typen slaat direct op in het werkgeheugen, nog niet in de database */
function veldGewijzigd(e) {
  const el = e.target.closest("[data-path]");
  if (!el) return;

  let v;
  if (el.dataset.kind === "bool") {
    v = el.checked;
  } else if (el.dataset.kind === "lines") {
    v = el.value.split("\n").map((x) => x.trim()).filter(Boolean);
  } else if (el.tagName === "SELECT" && /^-?\d+$/.test(el.value)) {
    v = Number(el.value);
  } else {
    v = el.value;
  }

  setPath(work, el.dataset.path, v);

  /* Zet je een eigen formulier aan, dan beginnen we met een kopie van het
     algemene. Zo hoef je niet vanaf nul te vertrekken. */
  if (v === true && el.dataset.path.endsWith(".formulier.gebruikEigen")) {
    const basis = el.dataset.path.replace(".gebruikEigen", "");
    const huidig = getPath(work, basis) || {};
    if (!huidig.groepen || !huidig.groepen.length) {
      const bron = JSON.parse(JSON.stringify(work.formulieren?.prijsaanvraag || { groepen: [] }));
      setPath(work, basis, Object.assign({ gebruikEigen: true }, bron));
    }
  }

  status("Niet opgeslagen wijzigingen", "");

  /* Bij een schakelaar verandert de samenvatting rechts van de titel mee. */
  if (el.dataset.kind === "bool") buildEditor();
}

document.addEventListener("click", (e) => {
  const knop = e.target.closest("#zijnav .zijnav__knop");
  if (knop) toonSectie(knop.dataset.sectie);
});

$("#editor").addEventListener("input", veldGewijzigd);
$("#editor").addEventListener("change", veldGewijzigd);

$("#editor").addEventListener("click", (e) => {
  if (e.target.closest("[data-standaardcontract]")) {
    e.preventDefault();
    setPath(work, "contract.tekst", STANDAARD_CONTRACT);
    buildEditor(openSecties());
    status("Niet opgeslagen wijzigingen", "");
    return;
  }
  const add = e.target.closest("[data-add]");
  const del = e.target.closest("[data-del]");
  const mv  = e.target.closest("[data-move]");

  if (add) {
    const path = add.dataset.add;
    const arr = getPath(work, path) || [];
    arr.push(JSON.parse(JSON.stringify(leegItem(path))));
    setPath(work, path, arr);
  } else if (del) {
    const rij = getPath(work, del.dataset.arr) || [];
    const weg = rij[Number(del.dataset.i)];
    if (weg && weg.vast) {
      alert("Dit veld is nodig om te weten wie er aanvraagt. Je kan de tekst erop wel aanpassen.");
      return;
    }
    if (!confirm("Dit onderdeel verwijderen?")) return;
    rij.splice(Number(del.dataset.i), 1);
  } else if (mv) {
    const arr = getPath(work, mv.dataset.arr);
    const i = Number(mv.dataset.i);
    const j = mv.dataset.move === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  } else return;

  buildEditor();
  status("Niet opgeslagen wijzigingen", "");
});

function status(msg, kind) {
  const el = $("#savestatus");
  el.textContent = msg;
  el.className = "status " + kind;
}

async function loadEditor() {
  work = window.herstelVerplicht(await window.loadContent());
  buildEditor();
  status("", "");
}

$("#reload").addEventListener("click", async () => {
  if (!confirm("Opnieuw laden? Niet-opgeslagen wijzigingen gaan verloren.")) return;
  await loadEditor();
});

$("#save").addEventListener("click", async () => {
  const btn = $("#save");
  btn.disabled = true;
  status("Opslaan…", "");

  const { error } = await sb
    .from("site_content")
    .upsert({ id: 1, data: work, updated_at: new Date().toISOString() });

  btn.disabled = false;

  if (error) {
    status("Opslaan lukte niet: " + error.message, "err");
    return;
  }
  status("Opgeslagen. Herlaad de site om het resultaat te zien.", "ok");
});

/* Waarschuw voor je wegklikt met openstaande wijzigingen */
window.addEventListener("beforeunload", (e) => {
  if ($("#savestatus")?.textContent.startsWith("Niet opgeslagen")) {
    e.preventDefault();
    e.returnValue = "";
  }
});
