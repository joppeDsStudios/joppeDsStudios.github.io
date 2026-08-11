/* ==========================================================================
   Projectaanvraag
   --------------------------------------------------------------------------
   De code wordt gecontroleerd door een functie in de database, niet in deze
   JavaScript. Er staat hier dus nergens een lijst van geldige codes, en die
   is ook niet op te vragen met de sleutel uit config.js.
   ========================================================================== */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const sb = window.getSupabase();

$("#jaar").textContent = new Date().getFullYear();

let actieveCode = null;
let inhoud = null;

const formDef = () =>
  JSON.parse(JSON.stringify(
    inhoud?.formulieren?.projectaanvraag ||
    window.DEFAULT_CONTENT.formulieren.projectaanvraag
  ));

/* Inhoud ophalen. Staan de prijzen aan, dan verloopt aanvragen via de
   pakketten op de website en heeft deze pagina geen functie meer. */
window.loadContent().then((c) => {
  inhoud = c;
  const pakketten = (c.prijzen?.pakketten || []).filter((x) => x && x.naam);
  if (c.prijzen?.zichtbaar && pakketten.length) {
    $("#stap-code").hidden = true;
    $("#stap-prijzen").hidden = false;
  }
});

/* --------------------------------------------------------------------------
   Meldingen
   -------------------------------------------------------------------------- */

function melding(el, tekst, soort) {
  el.hidden = false;
  el.textContent = tekst;
  el.className = "form__note form__note--" + soort;
}

const REDENEN = {
  onbekend: "Deze code kennen we niet. Controleer of je hem juist overnam.",
  gebruikt: "Deze code is al gebruikt. Vraag Joppe om een nieuwe.",
  verlopen: "Deze code is verlopen. Vraag Joppe om een nieuwe.",
  onvolledig: "Er ontbreken nog verplichte velden. Kijk het formulier even na.",
  tegroot: "Je aanvraag is te lang. Kort de tekstvelden wat in."
};

/* Vertaalt een technische databasefout naar iets bruikbaars, en zet het
   volledige probleem in de console voor als je moet uitzoeken wat er scheelt. */
function fout(error, wat) {
  console.error("[JoppeDS] " + wat, error);

  const code = error?.code || "";
  const msg = (error?.message || "").toLowerCase();

  if (code === "PGRST202" || msg.includes("could not find the function")) {
    return "De aanvraagfunctie ontbreekt nog in de database. Laat Joppe het bestand supabase-setup.sql opnieuw uitvoeren.";
  }
  if (code === "42501" || msg.includes("permission denied")) {
    return "Deze pagina heeft geen toestemming van de database. Laat Joppe supabase-setup.sql opnieuw uitvoeren.";
  }
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return "Geen verbinding met de server. Controleer je internetverbinding en probeer opnieuw.";
  }
  return wat + " lukte niet: " + (error?.message || "onbekende fout");
}

/* --------------------------------------------------------------------------
   Code opschonen
   --------------------------------------------------------------------------
   Werkt ook als iemand het hele mailtje plakt in plaats van enkel de code:
   dan wordt de code eruit gevist.
   -------------------------------------------------------------------------- */

function normaliseerCode(tekst) {
  const t = (tekst || "").toUpperCase();

  /* Staat er ergens een volledige code in de tekst? Neem die. */
  const m = t.match(/JDS[^A-Z0-9]?([A-Z0-9]{4})[^A-Z0-9]?([A-Z0-9]{4})/);
  if (m) return `JDS-${m[1]}-${m[2]}`;

  /* Anders: opbouwen terwijl er getypt wordt. */
  const ruw = t.replace(/[^A-Z0-9]/g, "").slice(0, 11);
  let uit = ruw.slice(0, 3);
  if (ruw.length > 3) uit += "-" + ruw.slice(3, 7);
  if (ruw.length > 7) uit += "-" + ruw.slice(7, 11);
  return uit;
}

const codeveld = $("#code");

codeveld.addEventListener("input", () => {
  const aanEinde = codeveld.selectionStart === codeveld.value.length;
  codeveld.value = normaliseerCode(codeveld.value);
  if (aanEinde) codeveld.setSelectionRange(codeveld.value.length, codeveld.value.length);
});

/* --------------------------------------------------------------------------
   Stap 1: code controleren
   -------------------------------------------------------------------------- */

$("#codeform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = $("#codenote");
  const btn = $("#codebtn");
  const code = normaliseerCode(codeveld.value);
  codeveld.value = code;

  if (code.length < 5) {
    melding(note, "Vul eerst je volledige code in.", "err");
    return;
  }
  if (!sb) {
    melding(note, "De pagina is niet gekoppeld aan de database. Controleer assets/js/config.js.", "err");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Controleren…";

  const { data, error } = await sb.rpc("check_code", { p_code: code });

  btn.disabled = false;
  btn.textContent = "Formulier openen";

  if (error) {
    melding(note, fout(error, "Controleren"), "err");
    return;
  }
  if (!data?.geldig) {
    melding(note, REDENEN[data?.reden] || "Deze code werkt niet.", "err");
    return;
  }

  actieveCode = code;
  $("#codelabel").textContent = data.label ? "— " + data.label : "";

  /* Het formulier wordt opgebouwd uit de beschrijving in de admin */
  const def = formDef();
  $("#form-kop").textContent = def.kop || "Vertel me over je project";
  $("#form-tekst").textContent = def.tekst || "";
  $("#form-voet").textContent = def.voetnoot || "";
  $("#verzend").textContent = def.knop || "Aanvraag indienen";
  window.bouwFormulier($("#formvelden"), def, { prefix: "f-", nummers: true });

  $("#stap-code").hidden = true;
  $("#stap-form").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  const eerste = $("#f-naam");
  if (eerste) eerste.focus();
});

/* --------------------------------------------------------------------------
   Stap 2: aanvraag indienen
   -------------------------------------------------------------------------- */

const vinkjes = (id) =>
  $$(`#${id} input:checked`).map((c) => c.value);

$("#projectform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = $("#formnote");
  const btn = $("#verzend");
  const def = formDef();

  const payload = window.leesFormulier($("#formvelden"), def, "f-");

  /* Eerst hier controleren, zodat je niet op de server moet wachten.
     De database controleert het daarna nog een keer. */
  const mist = window.controleerFormulier(payload, def);
  if (mist.length) {
    melding(note, "Vul nog aan: " + mist.join(", ") + ".", "err");
    note.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (payload.drive && !/^https?:\/\//i.test(payload.drive)) {
    melding(note, "De link naar je bestanden moet met https:// beginnen.", "err");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Indienen…";

  const { data, error } = await sb.rpc("submit_request", {
    p_code: actieveCode,
    p_data: payload
  });

  btn.disabled = false;
  btn.textContent = def.knop || "Aanvraag indienen";

  if (error) {
    melding(note, fout(error, "Indienen"), "err");
    return;
  }
  if (!data?.ok) {
    melding(note, REDENEN[data?.reden] || "Indienen lukte niet.", "err");
    return;
  }

  $("#ref").textContent = data.referentie;
  if (def.bedankt) $("#klaar-tekst").textContent = def.bedankt;
  $("#stap-form").hidden = true;
  $("#stap-klaar").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

/* Waarschuw als je wegklikt met een halfingevuld formulier */
window.addEventListener("beforeunload", (e) => {
  const titel = $("#f-titel");
  if (!$("#stap-form").hidden && titel && titel.value.trim()) {
    e.preventDefault();
    e.returnValue = "";
  }
});
