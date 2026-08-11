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
      loadAanvragen();
      loadCodes();
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

/* Alfabet zonder tekens die op elkaar lijken (0/O, 1/I/L). Zo kan een klant
   een code overtypen zonder vergissingen. */
const CODE_ALFABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function nieuweCode() {
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  const t = [...buf].map((n) => CODE_ALFABET[n % CODE_ALFABET.length]).join("");
  return `JDS-${t.slice(0, 4)}-${t.slice(4, 8)}`;
}

async function loadCodes() {
  const lijst = $("#codelijst");
  const { data, error } = await sb
    .from("project_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    lijst.innerHTML = `<p class="hint">Codes laden lukte niet: ${esc(error.message)}.
      Klik op "Controleer de installatie" hierboven.</p>`;
    console.error("[JoppeDS] codes laden", error);
    return;
  }

  const open = data.filter(
    (c) => !c.gebruikt_op && (!c.verloopt_op || new Date(c.verloopt_op) > new Date())
  ).length;
  $("#codesamenvatting").textContent = `${open} bruikbaar · ${data.length} totaal`;

  if (!data.length) {
    lijst.innerHTML = `<p class="hint">Nog geen codes aangemaakt.</p>`;
    return;
  }

  lijst.innerHTML = data
    .map((c) => {
      const verlopen = c.verloopt_op && new Date(c.verloopt_op) < new Date();
      const op = c.gebruikt_op || verlopen;
      const staat = c.gebruikt_op
        ? "Gebruikt op " + datum(c.gebruikt_op)
        : verlopen
        ? "Verlopen"
        : c.verloopt_op
        ? "Geldig tot " + datum(c.verloopt_op)
        : "Onbeperkt geldig";

      return `
      <div class="code-row ${op ? "is-op" : ""}" data-code="${esc(c.code)}">
        <span class="code-row__code">${esc(c.code)}</span>
        <span class="code-row__meta">${esc(c.label || "zonder label")} · ${esc(staat)}</span>
        <span class="code-row__acts">
          ${
            op
              ? ""
              : `<button class="mini" data-kopie="${esc(c.code)}">Kopieer code</button>
                 <button class="mini" data-mail="${esc(c.code)}">Kopieer mail</button>`
          }
          <button class="mini mini--danger" data-codedel="${esc(c.code)}">Verwijderen</button>
        </span>
      </div>`;
    })
    .join("");
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
  ["Tabel project_codes",      "tabel",   "project_codes",    "toegangscodes"],
  ["Tabel project_requests",   "tabel",   "project_requests", "projectaanvragen"],
  ["Tabel reviews",            "tabel",   "reviews",          "reviews insturen"],
  ["Weergave reviews_publiek", "tabel",   "reviews_publiek",  "reviews tonen op je site"],
  ["Functie check_code",       "functie", "check_code",       "codes controleren"],
  ["Functie submit_request",   "functie", "submit_request",   "aanvragen indienen"],
  ["Functie submit_open_request", "functie", "submit_open_request", "prijsaanvragen indienen"]
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

$("#genereer").addEventListener("click", async (e) => {
  e.preventDefault();
  const note = $("#codenote");
  const btn = $("#genereer");
  const dagen = $("#c-dagen").value;

  btn.disabled = true;
  const code = nieuweCode();

  const { error } = await sb.from("project_codes").insert([
    {
      code,
      label: $("#c-label").value.trim() || null,
      email: $("#c-email").value.trim() || null,
      verloopt_op: dagen ? new Date(Date.now() + Number(dagen) * 864e5).toISOString() : null
    }
  ]);

  btn.disabled = false;

  if (error) {
    console.error("[JoppeDS] code aanmaken", error);
    note.hidden = false;
    note.className = "form__note form__note--err";
    note.textContent =
      error.code === "42P01" || /does not exist/i.test(error.message || "")
        ? "De tabel project_codes bestaat nog niet. Voer supabase-setup.sql opnieuw uit in Supabase."
        : "Code aanmaken lukte niet: " + error.message;
    return;
  }

  note.hidden = false;
  note.className = "form__note form__note--ok";
  note.textContent = `Code ${code} aangemaakt. Klik op Kopieer om hem te versturen.`;
  $("#c-label").value = "";
  $("#c-email").value = "";
  loadCodes();
});

$("#codelijst").addEventListener("click", async (e) => {
  const kopie = e.target.closest("[data-kopie]");
  const mail = e.target.closest("[data-mail]");
  const del = e.target.closest("[data-codedel]");

  const naarKlembord = async (knop, tekst, gelukt) => {
    const origineel = knop.textContent;
    try {
      await navigator.clipboard.writeText(tekst);
      knop.textContent = gelukt;
      setTimeout(() => (knop.textContent = origineel), 1600);
    } catch (err) {
      prompt("Kopieer deze tekst:", tekst);
    }
  };

  /* Alleen de code. Dit is wat de klant in het veld moet plakken. */
  if (kopie) await naarKlembord(kopie, kopie.dataset.kopie, "Gekopieerd");

  /* Het volledige mailtje, om zelf te versturen. */
  if (mail) {
    const link = location.href.split("#")[0].replace(/admin\.html.*$/, "aanvraag.html");
    const tekst =
      `Hoi,\n\n` +
      `Leuk dat je met JoppeDS Studio's wil samenwerken. Vul je projectaanvraag in via:\n` +
      `${link}\n\n` +
      `Je code is: ${mail.dataset.mail}\n\n` +
      `Deze code werkt één keer. Tot binnenkort,\nJoppe`;
    await naarKlembord(mail, tekst, "Mail gekopieerd");
  }

  if (del) {
    if (!confirm(`Code ${del.dataset.codedel} verwijderen?`)) return;
    await sb.from("project_codes").delete().eq("code", del.dataset.codedel);
    loadCodes();
  }
});

/* --------------------------------------------------------------------------
   Projectaanvragen
   -------------------------------------------------------------------------- */

const STATUSSEN = ["nieuw", "in behandeling", "goedgekeurd", "afgerond", "afgewezen"];
const badgeKlasse = (s) => "badge--" + (s === "in behandeling" ? "behandeling" : s);

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
  const openstaand = data.filter((a) => a.status === "nieuw" || a.status === "in behandeling").length;
  $("#badge-aanvragen").textContent = openstaand ? `(${openstaand})` : "";
  toonAanvragen();
}

function toonAanvragen() {
  const lijst = $("#aanvraaglijst");
  const term = zoek.aanvragen;

  let rijen = statusFilter ? aanvragen.filter((a) => a.status === statusFilter) : aanvragen;
  const voorZoeken = rijen.length;

  rijen = rijen.filter((a) =>
    past([a.titel, a.naam, a.email, a.referentie, a.status, a.notitie,
          JSON.stringify(a.data || {})], term)
  );

  if (term && !rijen.length) {
    lijst.innerHTML = gevonden(0, voorZoeken, term) +
      `<div class="empty"><strong>Niets gevonden</strong>Probeer een ander woord, of zet de filter op Alles.</div>`;
    return;
  }

  if (!rijen.length) {
    lijst.innerHTML = `<div class="empty"><strong>${
      aanvragen.length ? "Geen aanvragen met deze status" : "Nog geen aanvragen"
    }</strong>${
      aanvragen.length
        ? "Kies een andere filter."
        : "Genereer hierboven een code en stuur die naar een klant."
    }</div>`;
    return;
  }

  lijst.innerHTML = gevonden(rijen.length, voorZoeken, term) + rijen
    .map(
      (a) => `
      <article class="req ${a.status === "nieuw" ? "is-nieuw" : ""}" data-id="${a.id}">
        <div class="req__main">
          <div class="req__titel">${markeer(a.titel, term)}</div>
          <div class="req__wie">${markeer(a.naam, term)} · ${markeer(a.referentie, term)} · ${esc(datum(a.created_at))}</div>
        </div>
        <div class="req__acts">
          <span class="badge ${badgeKlasse(a.status)}">${esc(a.status)}</span>
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
  const d = a.data || {};
  const dlg = $("#detail");

  dlg.innerHTML = `
    <div class="sheet__head">
      <div>
        <h2>${esc(a.titel)}</h2>
        <p class="msg__meta">${esc(a.referentie)} · ingediend ${esc(datum(a.created_at))} · ${
          a.soort === "prijsaanvraag" ? "via de prijzenpagina" : "code " + esc(a.code || "—")
        }</p>
      </div>
      <button class="mini" data-sluit="1">Sluiten</button>
    </div>

    <div class="sheet__body">
      ${
        /* Nieuwe aanvragen sturen mee wat er precies gevraagd werd. Zo klopt
           dit overzicht ook nadat je het formulier later hebt aangepast.
           Oudere aanvragen vallen terug op de vaste lijst eronder. */
        Array.isArray(d._velden) && d._velden.length
          ? `<div class="dl">${d._velden.map((v) => rij(v.label, v.waarde)).join("")}</div>`
          : `
        <div class="dl">
          ${rij("Naam", d.naam || a.naam)}
          ${rij("E-mailadres", d.email || a.email)}
          ${rij("Bedrijf of kanaal", d.bedrijf)}
          ${rij("Telefoon", d.telefoon)}
        </div>

        <div class="dl">
          ${rij("Beschrijving", d.beschrijving)}
          ${rij("Doel", d.doel)}
          ${rij("Soort content", d.formaat)}
          ${rij("Gewenste lengte", d.lengte)}
          ${rij("Aantal video's", d.aantal)}
          ${rij("Platform", d.platform)}
          ${rij("Stijl", d.stijl)}
          ${rij("Referenties", d.referenties)}
        </div>

        <div class="dl">
          ${rij("Budget", d.budget)}
          ${rij("Deadline", d.deadline)}
          ${rij("Bestanden", d.drive)}
          ${rij("Inhoud van de map", d.assets)}
          ${rij("Extra informatie", d.extra)}
        </div>`
      }

      <div class="field">
        <label for="d-notitie">Jouw notitie (alleen jij ziet dit)</label>
        <textarea id="d-notitie" rows="3">${esc(a.notitie || "")}</textarea>
      </div>
    </div>

    <div class="sheet__foot">
      <div class="field" style="flex:1 1 180px">
        <label for="d-status">Status</label>
        <select id="d-status">
          ${STATUSSEN.map(
            (s) => `<option ${s === a.status ? "selected" : ""}>${s}</option>`
          ).join("")}
        </select>
      </div>
      <button class="btn btn--fill" data-bewaar="${a.id}">Opslaan</button>
      <a class="mini" href="mailto:${esc(a.email)}?subject=${encodeURIComponent(
        "Je projectaanvraag " + a.referentie
      )}">Mail de klant</a>
    </div>`;

  dlg.showModal();
}

$("#detail").addEventListener("click", async (e) => {
  const dlg = $("#detail");

  if (e.target.closest("[data-sluit]")) { dlg.close(); return; }

  const bewaar = e.target.closest("[data-bewaar]");
  if (bewaar) {
    bewaar.disabled = true;
    const { error } = await sb
      .from("project_requests")
      .update({
        status: $("#d-status").value,
        notitie: $("#d-notitie").value.trim() || null
      })
      .eq("id", bewaar.dataset.bewaar);
    bewaar.disabled = false;

    if (error) { alert("Opslaan lukte niet: " + error.message); return; }
    dlg.close();
    loadAanvragen();
  }
});

/* Klik naast het venster om te sluiten */
$("#detail").addEventListener("mousedown", (e) => {
  if (e.target.id === "detail") $("#detail").close();
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

$("#reviewbewerk").addEventListener("mousedown", (e) => {
  if (e.target.id === "reviewbewerk") $("#reviewbewerk").close();
});

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
  const [berTotaal, berOngelezen, aanvOpen, aanvTotaal, codesOpen, revWacht, revZicht] = await Promise.all([
    sb.from("messages").select("id", { count: "exact", head: true }),
    sb.from("messages").select("id", { count: "exact", head: true }).eq("gelezen", false),
    sb.from("project_requests").select("id", { count: "exact", head: true })
      .in("status", ["nieuw", "in behandeling"]),
    sb.from("project_requests").select("id", { count: "exact", head: true }),
    sb.from("project_codes").select("code", { count: "exact", head: true }).is("gebruikt_op", null),
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
      <p class="hint">Hoogste dag: ${piek} ${piek === 1 ? "bezoek" : "bezoeken"}. Er staan ${n(codesOpen)} ongebruikte codes klaar.</p>
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
            ${keuze(`prijzen.pakketten.${i}.uitgelicht`, "Uitlichten", [
              { v: "", t: "Gewoon" },
              { v: "ja", t: "Uitgelicht met label" }
            ])}
          </div>
          ${area(`prijzen.pakketten.${i}.beschrijving`, "Korte beschrijving", 2)}
          ${lines(`prijzen.pakketten.${i}.punten`, "Wat zit erin", "één per regel")}
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

  ${formulierEditor("projectaanvraag", "Formulier: projectaanvraag",
    "Dit is het formulier op de aanvraagpagina, dat klanten met een code invullen.",
    isOpen)}

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
  status("Niet opgeslagen wijzigingen", "");

  /* Bij een schakelaar verandert de samenvatting rechts van de titel mee. */
  if (el.dataset.kind === "bool") buildEditor(openSecties());
}

$("#editor").addEventListener("input", veldGewijzigd);
$("#editor").addEventListener("change", veldGewijzigd);

$("#editor").addEventListener("click", (e) => {
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

  /* Hou de sectie waarin je bezig bent openstaan */
  const open = openSecties();
  const pad = (add || del || mv).dataset.add || (add || del || mv).dataset.arr;
  if (pad) {
    const deel = pad.split(".");
    /* formulieren.prijsaanvraag.… hoort bij de sectie "form-prijsaanvraag" */
    open.add(deel[0] === "formulieren" ? "form-" + deel[1] : deel[0]);
  }

  buildEditor(open);
  status("Niet opgeslagen wijzigingen", "");
});

function status(msg, kind) {
  const el = $("#savestatus");
  el.textContent = msg;
  el.className = "status " + kind;
}

async function loadEditor() {
  work = await window.loadContent();
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
