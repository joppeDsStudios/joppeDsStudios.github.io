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
}

/* --------------------------------------------------------------------------
   Tabs
   -------------------------------------------------------------------------- */

let statsGeladen = false;
let aanvragenGeladen = false;

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

  const ongelezen = data.filter((m) => !m.gelezen).length;
  $("#badge").textContent = ongelezen ? `(${ongelezen})` : "";

  if (!data.length) {
    list.innerHTML = `<div class="empty"><strong>Nog geen berichten</strong>Zodra iemand het contactformulier invult, verschijnt het bericht hier.</div>`;
    return;
  }

  list.innerHTML = data
    .map(
      (m) => `
      <article class="msg ${m.gelezen ? "" : "is-new"}" data-id="${m.id}">
        <div class="msg__top">
          <span class="msg__from">${esc(m.voornaam)} ${esc(m.naam)}</span>
          <span class="msg__meta">${esc(datum(m.created_at))}</span>
        </div>
        <p class="msg__meta" style="margin:0 0 12px">${esc(m.email)}</p>
        <p class="msg__body">${esc(m.bericht)}</p>
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
   Zelftest
   --------------------------------------------------------------------------
   Controleert stap voor stap of de database klaarstaat. Zo zie je meteen
   wat er ontbreekt in plaats van een vage foutmelding op de aanvraagpagina.
   -------------------------------------------------------------------------- */

async function testInstallatie() {
  const uit = $("#diagnose");
  uit.innerHTML = `<p class="hint">Bezig met controleren…</p>`;

  const stappen = [];

  const meld = (naam, ok, detail) => stappen.push({ naam, ok, detail });

  /* 1. Tabel met codes */
  {
    const { error } = await sb.from("project_codes").select("code").limit(1);
    meld("Tabel project_codes", !error, error?.message);
  }

  /* 2. Tabel met aanvragen */
  {
    const { error } = await sb.from("project_requests").select("id").limit(1);
    meld("Tabel project_requests", !error, error?.message);
  }

  /* 3. Functie die de code controleert */
  {
    const { data, error } = await sb.rpc("check_code", { p_code: "JDS-TEST-TEST" });
    const ok = !error && data && typeof data.geldig === "boolean";
    meld(
      "Functie check_code",
      ok,
      error?.message || (ok ? "" : "gaf een onverwacht antwoord terug")
    );
  }

  /* 4. Functie die de aanvraag indient. We sturen bewust een onbestaande
        code: het antwoord "onbekend" bewijst dat de functie werkt, zonder
        dat er iets wordt opgeslagen. */
  {
    const { data, error } = await sb.rpc("submit_request", {
      p_code: "JDS-TEST-TEST",
      p_data: {}
    });
    const ok = !error && data && data.ok === false && data.reden === "onbekend";
    meld(
      "Functie submit_request",
      ok,
      error?.message || (ok ? "" : "gaf een onverwacht antwoord terug")
    );
  }

  const alles = stappen.every((s) => s.ok);

  uit.innerHTML = `
    <div class="check-list">
      ${stappen
        .map(
          (s) => `
        <div class="check-row ${s.ok ? "is-ok" : "is-nok"}">
          <span class="check-row__mark">${s.ok ? "✓" : "✕"}</span>
          <span>${esc(s.naam)}</span>
          ${s.detail ? `<span class="check-row__detail">${esc(s.detail)}</span>` : ""}
        </div>`
        )
        .join("")}
    </div>
    <p class="hint" style="margin-top:14px">
      ${
        alles
          ? "Alles staat klaar. Genereer een code en test hem op de aanvraagpagina."
          : "Er ontbreekt iets. Ga naar Supabase → SQL Editor → New query, plak het volledige bestand supabase-setup.sql en klik Run. Opnieuw uitvoeren is veilig: bestaande gegevens blijven staan."
      }
    </p>`;
}

$("#diagnoseknop").addEventListener("click", (e) => {
  e.preventDefault();
  testInstallatie();
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
  const rijen = statusFilter ? aanvragen.filter((a) => a.status === statusFilter) : aanvragen;

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

  lijst.innerHTML = rijen
    .map(
      (a) => `
      <article class="req ${a.status === "nieuw" ? "is-nieuw" : ""}" data-id="${a.id}">
        <div class="req__main">
          <div class="req__titel">${esc(a.titel)}</div>
          <div class="req__wie">${esc(a.naam)} · ${esc(a.referentie)} · ${esc(datum(a.created_at))}</div>
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
        <p class="msg__meta">${esc(a.referentie)} · ingediend ${esc(datum(a.created_at))} · code ${esc(a.code || "—")}</p>
      </div>
      <button class="mini" data-sluit="1">Sluiten</button>
    </div>

    <div class="sheet__body">
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
      </div>

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
  const [berTotaal, berOngelezen, aanvOpen, aanvTotaal, codesOpen] = await Promise.all([
    sb.from("messages").select("id", { count: "exact", head: true }),
    sb.from("messages").select("id", { count: "exact", head: true }).eq("gelezen", false),
    sb.from("project_requests").select("id", { count: "exact", head: true })
      .in("status", ["nieuw", "in behandeling"]),
    sb.from("project_requests").select("id", { count: "exact", head: true }),
    sb.from("project_codes").select("code", { count: "exact", head: true }).is("gebruikt_op", null)
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

function buildEditor(bewaarOpen) {
  const open = bewaarOpen || openSecties();
  const isOpen = (k) => (open.has(k) ? "open" : "");

  const p = work.projecten || [];
  const s = work.stats || [];
  const f = work.over?.feiten || [];
  const rv = work.reviews || [];
  const o = work.opleidingen || [];
  const soc = work.footer?.socials || [];

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

  <details class="group" data-g="reviews" ${isOpen("reviews")}>
    <summary><span>Reviews</span><span class="group__sub">${
      rv.length ? telling(rv.length, "review", "reviews") : "verborgen op de site"
    }</span></summary>
    <div class="group__body">
      <p class="hint">
        Staan er geen reviews, dan verdwijnt de hele sectie automatisch van de site.
      </p>
      ${rv
        .map(
          (x, i) => `
        <div class="item">
          ${itemHead(x.naam || "Review " + (i + 1), "reviews", i, rv.length)}
          <div class="grid2">
            ${field(`reviews.${i}.naam`, "Naam", "Warande Kortrijk")}
            ${field(`reviews.${i}.rol`, "Functie of bedrijf", "Communicatieverantwoordelijke")}
          </div>
          ${keuze(`reviews.${i}.sterren`, "Beoordeling", STERREN)}
          ${area(`reviews.${i}.tekst`, "Wat zeggen ze?", 4)}
        </div>`
        )
        .join("")}
      ${addBtn("reviews", "Review toevoegen")}
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
    <summary><span>Onderaan de pagina</span><span class="group__sub">${telling(soc.length, "link", "links")}</span></summary>
    <div class="group__body">
      <p class="hint">Deze links staan zowel bij contact als in de footer.</p>
      ${field("footer.tekst", "Naam in de footer")}
      ${soc
        .map(
          (x, i) => `
        <div class="item">
          ${itemHead(x.label || "Link " + (i + 1), "footer.socials", i, soc.length)}
          <div class="grid2">
            ${field(`footer.socials.${i}.label`, "Naam", "YouTube")}
            ${field(`footer.socials.${i}.url`, "Link", "https://…")}
          </div>
        </div>`
        )
        .join("")}
      ${addBtn("footer.socials", "Link toevoegen")}
    </div>
  </details>`;
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
  opleidingen: { titel: "", instituut: "" },
  "footer.socials": { label: "", url: "" }
};

/* Typen slaat direct op in het werkgeheugen, nog niet in de database */
function veldGewijzigd(e) {
  const el = e.target.closest("[data-path]");
  if (!el) return;

  let v;
  if (el.dataset.kind === "lines") {
    v = el.value.split("\n").map((x) => x.trim()).filter(Boolean);
  } else if (el.tagName === "SELECT" && /^-?\d+$/.test(el.value)) {
    v = Number(el.value);
  } else {
    v = el.value;
  }

  setPath(work, el.dataset.path, v);
  status("Niet opgeslagen wijzigingen", "");
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
    arr.push(JSON.parse(JSON.stringify(BLANKS[path])));
    setPath(work, path, arr);
  } else if (del) {
    if (!confirm("Dit onderdeel verwijderen?")) return;
    getPath(work, del.dataset.arr).splice(Number(del.dataset.i), 1);
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
  if (pad) open.add(pad.split(".")[0]);

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
