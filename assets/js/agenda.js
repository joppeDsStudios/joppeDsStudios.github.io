/* ==========================================================================
   Agenda
   --------------------------------------------------------------------------
   Je eigen planning, met drie weergaven. Deadlines van lopende projecten
   verschijnen er automatisch bij, zodat je nooit een oplevering mist zonder
   ze zelf te moeten overtypen.
   ========================================================================== */

const AG_SOORTEN = {
  opname:    { naam: "Opname",     kleur: "#ff5b52" },
  montage:   { naam: "Montage",    kleur: "#7fb2ff" },
  livestream:{ naam: "Livestream", kleur: "#c77dff" },
  afspraak:  { naam: "Afspraak",   kleur: "#ffdf59" },
  deadline:  { naam: "Deadline",   kleur: "#ff8ac4" },
  school:    { naam: "School",     kleur: "#4fd18b" },
  vrij:      { naam: "Vrij",       kleur: "#8c92a3" }
};

const AG_HERHALING = [
  { v: "geen",     t: "Eenmalig" },
  { v: "dagelijks",t: "Elke dag" },
  { v: "wekelijks",t: "Elke week" },
  { v: "2wekelijks", t: "Om de twee weken" },
  { v: "maandelijks", t: "Elke maand" }
];

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni",
                 "juli", "augustus", "september", "oktober", "november", "december"];

let agenda = [];
let agWeergave = "maand";
let agAnker = new Date();
let agFilter = new Set();
let agendaGeladen = false;

/* --------------------------------------------------------------------------
   Datumhulpjes
   -------------------------------------------------------------------------- */

const iso = (d) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};
const vandaagIso = () => iso(new Date());

/* Maandag als eerste dag van de week, zoals we het hier gewend zijn */
function weekStart(d) {
  const x = new Date(d);
  const dag = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dag);
  x.setHours(0, 0, 0, 0);
  return x;
}

function plusDagen(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const kortDatum = (s) => {
  const d = new Date(s + "T00:00:00");
  return `${d.getDate()} ${MAANDEN[d.getMonth()]}`;
};

const tijdKort = (t) => (t ? t.slice(0, 5) : "");

/* --------------------------------------------------------------------------
   Herhalingen uitrekenen
   --------------------------------------------------------------------------
   Een herhalende afspraak staat één keer in de database. Hieronder maken we
   er losse verschijningen van, zodat ze in elke weergave op de juiste dag
   staan zonder honderden rijen op te slaan.
   -------------------------------------------------------------------------- */

function verschijningen(item, vanaf, tot) {
  const uit = [];
  const start = new Date(item.datum + "T00:00:00");
  const grens = item.herhaal_tot ? new Date(item.herhaal_tot + "T00:00:00") : tot;
  const duur = item.tot_datum
    ? Math.round((new Date(item.tot_datum) - new Date(item.datum)) / 864e5)
    : 0;

  if (item.herhaling === "geen") {
    for (let i = 0; i <= duur; i++) {
      const d = plusDagen(start, i);
      if (d >= vanaf && d <= tot) uit.push({ ...item, _dag: iso(d), _deel: duur > 0 });
    }
    return uit;
  }

  const stap = { dagelijks: 1, wekelijks: 7, "2wekelijks": 14 }[item.herhaling];
  let d = new Date(start);
  let veiligheid = 0;

  while (d <= tot && d <= grens && veiligheid++ < 800) {
    if (d >= vanaf) uit.push({ ...item, _dag: iso(d), _herhaald: true });
    if (item.herhaling === "maandelijks") {
      d = new Date(d);
      d.setMonth(d.getMonth() + 1);
    } else {
      d = plusDagen(d, stap);
    }
  }
  return uit;
}

/* Alles wat op een bepaalde dag valt: eigen afspraken plus projectdeadlines */
function opDag(dagIso, vanaf, tot) {
  const eigen = agenda
    .filter((a) => !agFilter.size || agFilter.has(a.soort))
    .flatMap((a) => verschijningen(a, vanaf, tot))
    .filter((a) => a._dag === dagIso);

  const deadlines =
    !agFilter.size || agFilter.has("deadline")
      ? aanvragen
          .filter((p) => p.levering && !["afgewerkt", "afgewezen"].includes(p.fase))
          .filter((p) => p.levering.slice(0, 10) === dagIso)
          .map((p) => ({
            id: "p-" + p.id,
            titel: p.titel,
            soort: "deadline",
            hele_dag: true,
            _dag: dagIso,
            _project: p.id,
            notitie: "Oplevering voor " + p.naam
          }))
      : [];

  return [...deadlines, ...eigen].sort((a, b) =>
    (a.begin_tijd || "00:00").localeCompare(b.begin_tijd || "00:00")
  );
}

const agKleur = (a) => a.kleur || AG_SOORTEN[a.soort]?.kleur || "#8c92a3";

/* --------------------------------------------------------------------------
   Laden
   -------------------------------------------------------------------------- */

async function loadAgenda() {
  const { data, error } = await sb.from("agenda").select("*").order("datum");
  if (error) {
    $("#ag-weergavevak").innerHTML =
      `<div class="empty"><strong>Agenda laden lukte niet</strong>${esc(error.message)}.
       Voer supabase-setup.sql opnieuw uit.</div>`;
    console.error("[JoppeDS] agenda", error);
    return;
  }
  agenda = data || [];

  /* Zonder projecten kunnen we geen deadlines tonen */
  if (!aanvragen.length) await loadAanvragen();

  /* Hoeveel staat er vandaag te gebeuren? */
  const n = opDag(vandaagIso(), plusDagen(new Date(), -1), plusDagen(new Date(), 1)).length;
  $("#badge-agenda").textContent = n ? `(${n})` : "";

  toonFilters();
  toonAgenda();
}

function toonFilters() {
  $("#ag-filters").innerHTML = Object.entries(AG_SOORTEN)
    .map(
      ([k, v]) => `
      <button class="ag-filter ${agFilter.has(k) || !agFilter.size ? "is-on" : ""}"
              data-agfilter="${k}" style="--kleur:${v.kleur}">
        <span class="ag-stip"></span>${esc(v.naam)}
      </button>`
    )
    .join("");
}

/* --------------------------------------------------------------------------
   De drie weergaven
   -------------------------------------------------------------------------- */

function toonAgenda() {
  if (agWeergave === "maand") toonMaand();
  else if (agWeergave === "week") toonWeek();
  else toonLijst();
}

function toonMaand() {
  const jaar = agAnker.getFullYear();
  const maand = agAnker.getMonth();
  $("#ag-titel").textContent = `${MAANDEN[maand]} ${jaar}`;

  const eerste = new Date(jaar, maand, 1);
  const start = weekStart(eerste);
  const cellen = [];
  for (let i = 0; i < 42; i++) cellen.push(plusDagen(start, i));

  const vanaf = cellen[0];
  const tot = cellen[cellen.length - 1];
  const nu = vandaagIso();

  $("#ag-weergavevak").innerHTML = `
    <div class="kal">
      <div class="kal__kop">${DAGEN.map((d) => `<span>${d}</span>`).join("")}</div>
      <div class="kal__raster">
        ${cellen
          .map((d) => {
            const dag = iso(d);
            const items = opDag(dag, vanaf, tot);
            const buiten = d.getMonth() !== maand;
            return `
            <div class="kal__dag ${buiten ? "is-buiten" : ""} ${dag === nu ? "is-vandaag" : ""}"
                 data-nieuwop="${dag}">
              <span class="kal__nr">${d.getDate()}</span>
              <div class="kal__items">
                ${items
                  .slice(0, 3)
                  .map(
                    (a) => `
                  <button class="kal__item ${a.klaar ? "is-klaar" : ""}"
                          data-open="${esc(a.id)}" style="--kleur:${agKleur(a)}"
                          title="${esc(a.titel)}">
                    ${a.hele_dag || !a.begin_tijd ? "" : `<b>${esc(tijdKort(a.begin_tijd))}</b> `}
                    ${esc(a.titel)}
                  </button>`
                  )
                  .join("")}
                ${items.length > 3
                  ? `<button class="kal__meer" data-dagopen="${dag}">+${items.length - 3} meer</button>`
                  : ""}
              </div>
            </div>`;
          })
          .join("")}
      </div>
    </div>`;
}

function toonWeek() {
  const start = weekStart(agAnker);
  const dagen = Array.from({ length: 7 }, (_, i) => plusDagen(start, i));
  const eind = dagen[6];

  $("#ag-titel").textContent =
    `${start.getDate()} ${MAANDEN[start.getMonth()]} – ${eind.getDate()} ${MAANDEN[eind.getMonth()]}`;

  const nu = vandaagIso();

  $("#ag-weergavevak").innerHTML = `
    <div class="week">
      ${dagen
        .map((d) => {
          const dag = iso(d);
          const items = opDag(dag, start, eind);
          return `
          <div class="week__dag ${dag === nu ? "is-vandaag" : ""}">
            <div class="week__kop">
              <span class="week__naam">${DAGEN[(d.getDay() + 6) % 7]}</span>
              <span class="week__nr">${d.getDate()}</span>
              <button class="week__plus" data-nieuwop="${dag}" title="Toevoegen">+</button>
            </div>
            <div class="week__items">
              ${items.length
                ? items
                    .map(
                      (a) => `
                  <button class="week__item ${a.klaar ? "is-klaar" : ""}"
                          data-open="${esc(a.id)}" style="--kleur:${agKleur(a)}">
                    <span class="week__tijd">${
                      a.hele_dag ? "Hele dag" : tijdKort(a.begin_tijd) || "—"
                    }</span>
                    <span class="week__titel">${esc(a.titel)}</span>
                  </button>`
                    )
                    .join("")
                : `<p class="week__leeg">—</p>`}
            </div>
          </div>`;
        })
        .join("")}
    </div>`;
}

function toonLijst() {
  const start = new Date(agAnker);
  start.setHours(0, 0, 0, 0);
  const eind = plusDagen(start, 60);

  $("#ag-titel").textContent = "Komende twee maanden";

  const rijen = [];
  for (let d = new Date(start); d <= eind; d = plusDagen(d, 1)) {
    const dag = iso(d);
    const items = opDag(dag, start, eind);
    if (items.length) rijen.push({ dag, items, d: new Date(d) });
  }

  if (!rijen.length) {
    $("#ag-weergavevak").innerHTML =
      `<div class="empty"><strong>Niets gepland</strong>Klik op + Nieuw om iets toe te voegen.</div>`;
    return;
  }

  const nu = vandaagIso();

  $("#ag-weergavevak").innerHTML = `
    <div class="aglijst">
      ${rijen
        .map(
          (r) => `
        <div class="aglijst__dag ${r.dag === nu ? "is-vandaag" : ""}">
          <div class="aglijst__datum">
            <span class="aglijst__nr">${r.d.getDate()}</span>
            <span class="aglijst__maand">${MAANDEN[r.d.getMonth()].slice(0, 3)}</span>
            <span class="aglijst__weekdag">${DAGEN[(r.d.getDay() + 6) % 7]}</span>
          </div>
          <div class="aglijst__items">
            ${r.items
              .map(
                (a) => `
              <button class="aglijst__item ${a.klaar ? "is-klaar" : ""}"
                      data-open="${esc(a.id)}" style="--kleur:${agKleur(a)}">
                <span class="aglijst__tijd">${
                  a.hele_dag ? "Hele dag" : (tijdKort(a.begin_tijd) || "") +
                    (a.eind_tijd ? " – " + tijdKort(a.eind_tijd) : "")
                }</span>
                <span class="aglijst__titel">${esc(a.titel)}</span>
                ${a.plaats ? `<span class="aglijst__plaats">${esc(a.plaats)}</span>` : ""}
                <span class="badge" style="border-color:${agKleur(a)};color:${agKleur(a)}">
                  ${esc(AG_SOORTEN[a.soort]?.naam || a.soort)}
                </span>
              </button>`
              )
              .join("")}
          </div>
        </div>`
        )
        .join("")}
    </div>`;
}

/* --------------------------------------------------------------------------
   Toevoegen en bewerken
   -------------------------------------------------------------------------- */

function bewerkAgenda(item, dagIso) {
  const nieuw = !item;
  const a = item || {
    titel: "", soort: "afspraak", datum: dagIso || vandaagIso(),
    begin_tijd: "", eind_tijd: "", hele_dag: false, plaats: "", notitie: "",
    herhaling: "geen", herhaal_tot: "", klaar: false, aanvraag_id: null
  };
  const dlg = $("#agendavenster");

  const projecten = aanvragen.filter((p) => !["afgewerkt", "afgewezen"].includes(p.fase));

  dlg.innerHTML = `
    <div class="sheet__head">
      <div><h2>${nieuw ? "Nieuw in de agenda" : "Bewerken"}</h2></div>
      <button class="mini" type="button" data-agsluit="1">Sluiten</button>
    </div>

    <form class="sheet__body form" id="agform">
      <div class="field">
        <label for="ag-titelveld">Wat staat er te gebeuren?</label>
        <input id="ag-titelveld" type="text" maxlength="140" value="${esc(a.titel)}"
               placeholder="Opname aftermovie">
      </div>

      <div class="form__row">
        <div class="field">
          <label for="ag-soort">Soort</label>
          <select id="ag-soort">
            ${Object.entries(AG_SOORTEN)
              .map(([k, v]) => `<option value="${k}" ${k === a.soort ? "selected" : ""}>${esc(v.naam)}</option>`)
              .join("")}
          </select>
        </div>
        <div class="field">
          <label for="ag-datum">Datum</label>
          <input id="ag-datum" type="date" value="${esc(a.datum || "")}">
        </div>
      </div>

      <label class="schakel">
        <input type="checkbox" id="ag-heledag" ${a.hele_dag ? "checked" : ""}>
        <span class="schakel__spoor"><span class="schakel__knop"></span></span>
        <span class="schakel__tekst"><strong>Hele dag</strong></span>
      </label>

      <div class="form__row" id="ag-tijdvak" ${a.hele_dag ? "hidden" : ""}>
        <div class="field">
          <label for="ag-begin">Van</label>
          <input id="ag-begin" type="time" value="${esc(tijdKort(a.begin_tijd))}">
        </div>
        <div class="field">
          <label for="ag-eind">Tot</label>
          <input id="ag-eind" type="time" value="${esc(tijdKort(a.eind_tijd))}">
        </div>
      </div>

      <div class="form__row">
        <div class="field">
          <label for="ag-herhaling">Herhaling</label>
          <select id="ag-herhaling">
            ${AG_HERHALING.map((h) => `<option value="${h.v}" ${h.v === a.herhaling ? "selected" : ""}>${esc(h.t)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="ag-herhaaltot">Herhalen tot</label>
          <input id="ag-herhaaltot" type="date" value="${esc(a.herhaal_tot || "")}">
        </div>
      </div>

      <div class="form__row">
        <div class="field">
          <label for="ag-plaats">Waar</label>
          <input id="ag-plaats" type="text" maxlength="140" value="${esc(a.plaats || "")}">
        </div>
        <div class="field">
          <label for="ag-project">Hoort bij project</label>
          <select id="ag-project">
            <option value="">Geen</option>
            ${projecten
              .map((p) => `<option value="${p.id}" ${p.id === a.aanvraag_id ? "selected" : ""}>${esc(p.titel)}</option>`)
              .join("")}
          </select>
        </div>
      </div>

      <div class="field">
        <label for="ag-notitie">Notitie</label>
        <textarea id="ag-notitie" rows="3" maxlength="1000">${esc(a.notitie || "")}</textarea>
      </div>

      <label class="schakel">
        <input type="checkbox" id="ag-klaar" ${a.klaar ? "checked" : ""}>
        <span class="schakel__spoor"><span class="schakel__knop"></span></span>
        <span class="schakel__tekst"><strong>Afgehandeld</strong></span>
      </label>

      <div class="form__note" id="ag-note" hidden></div>
    </form>

    <div class="sheet__foot">
      <button class="btn btn--fill" data-agbewaar="${nieuw ? "nieuw" : a.id}">Opslaan</button>
      ${nieuw ? "" : `<button class="mini mini--danger" data-agweg="${a.id}">Verwijderen</button>`}
      ${nieuw ? "" : `<button class="mini" data-agkopie="${a.id}">Dupliceren</button>`}
      <button class="mini" type="button" data-agsluit="1">Annuleren</button>
    </div>`;

  dlg.showModal();
  $("#ag-heledag").addEventListener("change", (e) => {
    $("#ag-tijdvak").hidden = e.target.checked;
  });
}

/* --------------------------------------------------------------------------
   Knoppen
   -------------------------------------------------------------------------- */

$("#ag-weergave").addEventListener("click", (e) => {
  const k = e.target.closest("[data-weergave]");
  if (!k) return;
  $$("#ag-weergave .mini").forEach((x) => x.classList.toggle("is-on", x === k));
  agWeergave = k.dataset.weergave;
  toonAgenda();
});

$("#ag-filters").addEventListener("click", (e) => {
  const k = e.target.closest("[data-agfilter]");
  if (!k) return;
  const s = k.dataset.agfilter;
  if (agFilter.has(s)) agFilter.delete(s);
  else agFilter.add(s);
  /* Alles aan is hetzelfde als geen filter */
  if (agFilter.size === Object.keys(AG_SOORTEN).length) agFilter.clear();
  toonFilters();
  toonAgenda();
});

function verzet(richting) {
  if (agWeergave === "maand") agAnker.setMonth(agAnker.getMonth() + richting);
  else if (agWeergave === "week") agAnker = plusDagen(agAnker, richting * 7);
  else agAnker = plusDagen(agAnker, richting * 30);
  toonAgenda();
}

$("#ag-vorige").addEventListener("click", () => verzet(-1));
$("#ag-volgende").addEventListener("click", () => verzet(1));
$("#ag-vandaag").addEventListener("click", () => { agAnker = new Date(); toonAgenda(); });
$("#ag-nieuw").addEventListener("click", () => bewerkAgenda(null, null));

$("#ag-weergavevak").addEventListener("click", (e) => {
  const open = e.target.closest("[data-open]");
  if (open) {
    const id = open.dataset.open;
    /* Een deadline hoort bij een project: open dat dossier. */
    if (id.startsWith("p-")) {
      const p = aanvragen.find((x) => x.id === id.slice(2));
      if (p) {
        $$(".tab").forEach((t) => t.classList.toggle("is-on", t.dataset.tab === "aanvragen"));
        $$(".tabpane").forEach((x) => (x.hidden = x.id !== "pane-aanvragen"));
        toonDetail(p);
      }
      return;
    }
    bewerkAgenda(agenda.find((x) => x.id === id));
    return;
  }

  const meer = e.target.closest("[data-dagopen]");
  if (meer) {
    agWeergave = "week";
    agAnker = new Date(meer.dataset.dagopen + "T00:00:00");
    $$("#ag-weergave .mini").forEach((x) => x.classList.toggle("is-on", x.dataset.weergave === "week"));
    toonAgenda();
    return;
  }

  const nieuwop = e.target.closest("[data-nieuwop]");
  if (nieuwop) bewerkAgenda(null, nieuwop.dataset.nieuwop);
});

$("#agendavenster").addEventListener("click", async (e) => {
  const dlg = $("#agendavenster");
  if (e.target.closest("[data-agsluit]")) { dlg.close(); return; }

  const weg = e.target.closest("[data-agweg]");
  if (weg) {
    if (!confirm("Dit uit je agenda verwijderen?")) return;
    await sb.from("agenda").delete().eq("id", weg.dataset.agweg);
    dlg.close();
    await loadAgenda();
    return;
  }

  const kopie = e.target.closest("[data-agkopie]");
  if (kopie) {
    const a = agenda.find((x) => x.id === kopie.dataset.agkopie);
    const { id, created_at, ...rest } = a;
    await sb.from("agenda").insert([{ ...rest, titel: rest.titel + " (kopie)" }]);
    dlg.close();
    await loadAgenda();
    return;
  }

  const bewaar = e.target.closest("[data-agbewaar]");
  if (!bewaar) return;

  const note = $("#ag-note");
  const titel = $("#ag-titelveld").value.trim();
  const datum = $("#ag-datum").value;

  if (titel.length < 2) {
    note.hidden = false;
    note.className = "form__note form__note--err";
    note.textContent = "Geef even aan wat er te gebeuren staat.";
    return;
  }
  if (!datum) {
    note.hidden = false;
    note.className = "form__note form__note--err";
    note.textContent = "Kies een datum.";
    return;
  }

  const heleDag = $("#ag-heledag").checked;
  const rij = {
    titel,
    soort: $("#ag-soort").value,
    datum,
    hele_dag: heleDag,
    begin_tijd: heleDag ? null : ($("#ag-begin").value || null),
    eind_tijd: heleDag ? null : ($("#ag-eind").value || null),
    plaats: $("#ag-plaats").value.trim() || null,
    notitie: $("#ag-notitie").value.trim() || null,
    herhaling: $("#ag-herhaling").value,
    herhaal_tot: $("#ag-herhaaltot").value || null,
    klaar: $("#ag-klaar").checked,
    aanvraag_id: $("#ag-project").value || null
  };

  bewaar.disabled = true;
  const id = bewaar.dataset.agbewaar;
  const { error } =
    id === "nieuw"
      ? await sb.from("agenda").insert([rij])
      : await sb.from("agenda").update(rij).eq("id", id);
  bewaar.disabled = false;

  if (error) {
    note.hidden = false;
    note.className = "form__note form__note--err";
    note.textContent = "Opslaan lukte niet: " + error.message;
    return;
  }

  dlg.close();
  await loadAgenda();
});

sluitBijKlikNaast($("#agendavenster"));

/* --------------------------------------------------------------------------
   Uitvoer naar een agenda-app
   --------------------------------------------------------------------------
   Een .ics-bestand kan je importeren in Google Agenda, Apple Agenda of je
   telefoon. Zo staat je planning ook daar, zonder koppeling of abonnement.
   -------------------------------------------------------------------------- */

$("#ag-export").addEventListener("click", () => {
  const stempel = (d, t) =>
    d.replace(/-/g, "") + (t ? "T" + t.slice(0, 5).replace(":", "") + "00" : "");

  const regels = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JoppeDS Studio's//Agenda//NL",
    "CALSCALE:GREGORIAN"
  ];

  const veilig = (t) => String(t || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

  agenda.forEach((a) => {
    regels.push("BEGIN:VEVENT");
    regels.push("UID:" + a.id + "@joppeds");
    regels.push("DTSTAMP:" + stempel(vandaagIso(), "00:00") + "Z");

    if (a.hele_dag || !a.begin_tijd) {
      regels.push("DTSTART;VALUE=DATE:" + a.datum.replace(/-/g, ""));
    } else {
      regels.push("DTSTART:" + stempel(a.datum, a.begin_tijd));
      if (a.eind_tijd) regels.push("DTEND:" + stempel(a.datum, a.eind_tijd));
    }

    const regel = { dagelijks: "DAILY", wekelijks: "WEEKLY",
                    "2wekelijks": "WEEKLY;INTERVAL=2", maandelijks: "MONTHLY" }[a.herhaling];
    if (regel) {
      regels.push("RRULE:FREQ=" + regel +
        (a.herhaal_tot ? ";UNTIL=" + a.herhaal_tot.replace(/-/g, "") : ""));
    }

    regels.push("SUMMARY:" + veilig(a.titel));
    if (a.plaats) regels.push("LOCATION:" + veilig(a.plaats));
    if (a.notitie) regels.push("DESCRIPTION:" + veilig(a.notitie));
    regels.push("END:VEVENT");
  });

  regels.push("END:VCALENDAR");

  const blob = new Blob([regels.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "joppeds-agenda.ics";
  a.click();
  URL.revokeObjectURL(a.href);
});
