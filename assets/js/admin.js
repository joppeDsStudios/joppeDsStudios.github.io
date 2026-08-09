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

$$(".tab").forEach((t) =>
  t.addEventListener("click", () => {
    $$(".tab").forEach((x) => x.classList.toggle("is-on", x === t));
    $$(".tabpane").forEach((p) => (p.hidden = p.id !== "pane-" + t.dataset.tab));

    /* Statistieken pas ophalen wanneer je ze echt bekijkt */
    if (t.dataset.tab === "bezoekers" && !statsGeladen) {
      statsGeladen = true;
      loadStats();
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

  if (!data.length) {
    view.innerHTML = `<div class="empty"><strong>Nog geen bezoeken in deze periode</strong>Statistieken worden pas geteld zodra de site online staat op GitHub Pages.</div>`;
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

  view.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="kpi__val">${bezoeken}</div><div class="kpi__lbl">Bezoeken</div></div>
      <div class="kpi"><div class="kpi__val">${sessies}</div><div class="kpi__lbl">Unieke bezoekers</div></div>
      <div class="kpi"><div class="kpi__val">${vandaag}</div><div class="kpi__lbl">Vandaag</div></div>
      <div class="kpi"><div class="kpi__val">${gem}</div><div class="kpi__lbl">Gemiddeld per dag</div></div>
    </div>

    <div class="group">
      <h2>Bezoeken per dag</h2>
      <p class="hint">Hoogste dag: ${piek} ${piek === 1 ? "bezoek" : "bezoeken"}.</p>
      <div class="bars">
        ${dagen
          .map(
            ([d, n]) =>
              `<div class="bar ${n === piek && n > 0 ? "is-top" : ""}"
                    style="height:${Math.max((n / piek) * 100, 1.5)}%"
                    title="${esc(kort(d))} — ${n}"></div>`
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

function buildEditor() {
  const p = work.projecten || [];
  const s = work.stats || [];
  const f = work.over?.feiten || [];
  const o = work.opleidingen || [];
  const soc = work.footer?.socials || [];

  $("#editor").innerHTML = `

  <div class="group">
    <h2>Bovenaan de pagina</h2>
    <p class="hint">De eerste woorden die bezoekers zien.</p>
    ${field("hero.studio", "Naam studio")}
    ${field("hero.kicker", "Bovenschrift")}
    ${area("hero.ondertitel", "Ondertitel", 3)}
    <div class="grid2">
      ${field("hero.knop1", "Tekst knop 1")}
      ${field("hero.knop2", "Tekst knop 2")}
    </div>
  </div>

  <div class="group">
    <h2>Statistieken</h2>
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

  <div class="group">
    <h2>Over mij</h2>
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

  <div class="group">
    <h2>Projecten</h2>
    <p class="hint">Laat de link leeg als er nog niets online staat.</p>
    ${p
      .map(
        (x, i) => `
      <div class="item">
        ${itemHead((x.titel || "Project " + (i + 1)), "projecten", i, p.length)}
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

  <div class="group">
    <h2>Opleidingen</h2>
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

  <div class="group">
    <h2>Contact</h2>
    <p class="hint">De tekst boven het formulier en de bevestiging erna.</p>
    ${field("contact.titel", "Titel")}
    ${area("contact.tekst", "Tekst", 3)}
    <div class="grid2">
      ${field("contact.knop", "Tekst op de knop")}
      ${field("contact.bedankt", "Bevestiging na versturen")}
    </div>
  </div>

  <div class="group">
    <h2>Onderaan de pagina</h2>
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
  </div>`;
}

/* Nieuwe, lege items per lijst */
const BLANKS = {
  stats: { value: "", label: "", prefix: "+" },
  "over.feiten": { label: "", value: "" },
  projecten: {
    titel: "Nieuw project", type: "", beschrijving: "",
    stats: [], link: "", linkLabel: "Bekijken", afbeelding: "", slug: ""
  },
  opleidingen: { titel: "", instituut: "" },
  "footer.socials": { label: "", url: "" }
};

/* Typen slaat direct op in het werkgeheugen, nog niet in de database */
$("#editor").addEventListener("input", (e) => {
  const el = e.target.closest("[data-path]");
  if (!el) return;
  const v = el.dataset.kind === "lines"
    ? el.value.split("\n").map((x) => x.trim()).filter(Boolean)
    : el.value;
  setPath(work, el.dataset.path, v);
  status("Niet opgeslagen wijzigingen", "");
});

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

  buildEditor();
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
