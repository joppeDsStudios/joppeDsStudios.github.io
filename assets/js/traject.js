/* ==========================================================================
   Projectstatus
   --------------------------------------------------------------------------
   De klant vult zijn volgcode in en ziet dan zijn eigen project: hoe ver het
   staat, wat er al opgeleverd is, en de berichten heen en weer.

   Alles verloopt via functies in de database. Deze pagina kan dus niets
   opvragen van andere projecten, ook niet met de sleutel uit config.js.
   ========================================================================== */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

/* Klik naast het venster om te sluiten.
   De scrollbalk hoort bij het dialoogvenster zelf, dus een klik daarop had
   als doelwit het venster en sloot het per ongeluk. Daarom vergelijken we
   de muispositie met de randen in plaats van het doelwit. */
function sluitBijKlikNaast(dlg) {
  dlg.addEventListener("mousedown", (e) => {
    const r = dlg.getBoundingClientRect();
    const binnen =
      e.clientX >= r.left && e.clientX <= r.right &&
      e.clientY >= r.top && e.clientY <= r.bottom;
    if (!binnen) dlg.close();
  });
}

const sb = window.getSupabase();
$("#jaar").textContent = new Date().getFullYear();

let code = null;
let project = null;

/* De vaste volgorde van een project. Elke fase krijgt een korte uitleg,
   zodat een klant niet hoeft te raden wat er nu gebeurt. */
const FASEN = [
  ["aangevraagd", "Aanvraag ontvangen",
   "Je aanvraag staat genoteerd. Joppe bekijkt ze en laat snel weten of hij ze aanneemt."],
  ["contract", "Overeenkomst tekenen",
   "Je aanvraag is aangenomen. Lees de overeenkomst en teken om te starten."],
  ["ingepland", "Bevestigd en ingepland",
   "Alles is rond. Je project staat in de planning."],
  ["productie", "In productie",
   "Er wordt aan gewerkt: monteren, kleuren, geluid."],
  ["feedback", "Klaar voor jouw feedback",
   "Er staat werk klaar. Bekijk het en laat weten wat je ervan vindt."],
  ["betaling", "Betaling",
   "Je keurde de versie goed. Na betaling komt het eindbestand vrij."],
  ["download", "Klaar om te downloaden",
   "Je eindbestand staat klaar, zonder watermerk."],
  ["afgewerkt", "Afgewerkt",
   "Alles is opgeleverd. Bedankt voor de samenwerking."]
];

const SOORTEN = {
  video: "Video",
  thumbnail: "Thumbnail",
  afbeelding: "Afbeelding",
  anders: "Bestand"
};


/* --------------------------------------------------------------------------
   Google Drive
   --------------------------------------------------------------------------
   Uit een gewone deellink halen we het bestands-id. Daarmee kunnen we het
   bestand rechtstreeks in beeld tonen en, als het mag, laten downloaden
   zonder dat je eerst naar Drive moet.
   -------------------------------------------------------------------------- */

function driveId(url) {
  const s = String(url || "");
  const m =
    s.match(/\/file\/d\/([A-Za-z0-9_-]{10,})/) ||
    s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) ||
    s.match(/\/d\/([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
}

function youtubeId(url) {
  const m = String(url || "").match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return m ? m[1] : null;
}

/* Het bestand in beeld tonen.
   De server stuurt bewust alleen een kijk-id mee, geen volledige link. Zo
   staat er nergens op deze pagina een adres dat rechtstreeks naar het
   bestand leidt. */
function voorbeeld(b) {
  if (b.youtube_id) {
    return `<div class="levering__kader">
        <iframe src="https://www.youtube-nocookie.com/embed/${esc(b.youtube_id)}"
                title="${esc(b.titel)}" loading="lazy" allowfullscreen
                referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>`;
  }
  if (b.drive_id) {
    return `<div class="levering__kader">
        <iframe src="https://drive.google.com/file/d/${esc(b.drive_id)}/preview"
                title="${esc(b.titel)}" loading="lazy" allowfullscreen></iframe>
      </div>`;
  }
  return `<div class="levering__kader levering__kader--leeg">
      <span>Geen voorbeeld beschikbaar</span>
    </div>`;
}

/* De knop waarmee de klant het bestand binnenhaalt. Bij Drive maken we er een
   rechtstreekse downloadlink van. */
function downloadKnop(b) {
  if (!b.download_url) return "";
  const dr = driveId(b.download_url);
  const link = dr
    ? `https://drive.google.com/uc?export=download&id=${dr}`
    : b.download_url;
  return `<a class="btn btn--fill" href="${esc(link)}" target="_blank" rel="noopener" download>
            Downloaden
          </a>`;
}

function melding(el, tekst, soort) {
  el.hidden = false;
  el.textContent = tekst;
  el.className = "form__note form__note--" + soort;
}

function datum(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("nl-BE", {
    day: "numeric", month: "long", year: "numeric"
  });
}

function datumTijd(iso) {
  return new Date(iso).toLocaleString("nl-BE", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

/* --------------------------------------------------------------------------
   Code opschonen, net als op de aanvraagpagina
   -------------------------------------------------------------------------- */

function normaliseerCode(tekst) {
  const t = (tekst || "").toUpperCase();
  const m = t.match(/JDS[^A-Z0-9]?([A-Z0-9]{4})[^A-Z0-9]?([A-Z0-9]{4})/);
  if (m) return `JDS-${m[1]}-${m[2]}`;

  const ruw = t.replace(/[^A-Z0-9]/g, "").slice(0, 11);
  let uit = ruw.slice(0, 3);
  if (ruw.length > 3) uit += "-" + ruw.slice(3, 7);
  if (ruw.length > 7) uit += "-" + ruw.slice(7, 11);
  return uit;
}

const codeveld = $("#code");
codeveld.addEventListener("input", () => {
  const eind = codeveld.selectionStart === codeveld.value.length;
  codeveld.value = normaliseerCode(codeveld.value);
  if (eind) codeveld.setSelectionRange(codeveld.value.length, codeveld.value.length);
});

/* --------------------------------------------------------------------------
   Project ophalen
   -------------------------------------------------------------------------- */

async function laad(stil) {
  const note = $("#codenote");
  const btn = $("#codebtn");

  if (!sb) {
    melding(note, "Deze pagina is nog niet gekoppeld aan de database.", "err");
    return false;
  }

  if (!stil) { btn.disabled = true; btn.textContent = "Zoeken…"; }

  const { data, error } = await sb.rpc("haal_traject", { p_code: code });

  if (!stil) { btn.disabled = false; btn.textContent = "Project openen"; }

  if (error) {
    console.error("[JoppeDS] traject ophalen", error);
    melding(note,
      /schema cache|does not exist/i.test(error.message || "")
        ? "Het volgsysteem staat nog niet klaar in de database."
        : "Ophalen lukte niet. Probeer het zo nog eens.", "err");
    return false;
  }
  if (!data?.ok) {
    melding(note, "We vinden geen project met deze code. Controleer of je hem juist overnam.", "err");
    return false;
  }

  project = data;
  localStorage.setItem("jds_volgcode", code);
  toon();
  return true;
}

/* --------------------------------------------------------------------------
   Alles op het scherm zetten
   -------------------------------------------------------------------------- */

function toon() {
  vorigeStand = stand(project);
  $("#stap-code").hidden = true;
  $("#stap-project").hidden = false;

  $("#pr-titel").textContent = project.titel;
  $("#pr-pakket").textContent = project.pakket || "Project";

  const meta = [
    "Aangevraagd op " + datum(project.aangevraagd),
    project.levering ? "Verwachte oplevering " + datum(project.levering) : ""
  ].filter(Boolean);
  $("#pr-meta").textContent = meta.join(" · ");

  /* Tijdlijn.
     "aanpassen" is geen eigen stap in de balk: het hoort bij de feedbackstap,
     want je zit dan nog altijd in diezelfde ronde. Zonder deze vertaling vindt
     findIndex niets en worden alle bolletjes grijs. */
  const balkFase = project.fase === "aanpassen" ? "feedback" : project.fase;
  const nu = FASEN.findIndex((f) => f[0] === balkFase);
  const gestopt = project.fase === "geannuleerd";

  /* De versies onder de feedbackstap.
     Die lijst groeit mee met het pakket: hoeveel rondes er zijn, bepaalt
     hoeveel stappen er staan. Voeg je later een pakket toe met meer of
     minder rondes, dan klopt dit automatisch. */
  function versieStappen() {
    const best = (project.bestanden || []).slice().reverse();  /* oud naar nieuw */
    const gewoon = best.filter((b) => !b.finaal);
    const totaal = Math.max(project.rondes || 0, gewoon.length);
    const rij = [];

    for (let n = 1; n <= totaal; n++) {
      const b = gewoon[n - 1];
      rij.push({
        naam: "Versie " + n,
        klaar: !!b && (b.status === "goedgekeurd" || b.status === "aanpassing" || b.status === "verlopen"),
        nu: !!b && b.status === "open" && ["feedback", "aanpassen"].includes(project.fase),
        uitleg: !b
          ? "Nog niet nodig."
          : b.status === "goedgekeurd" ? "Door jou goedgekeurd."
          : b.status === "aanpassing" ? "Je vroeg een aanpassing."
          : b.status === "verlopen" ? "Vervangen door een nieuwere versie."
          : "Staat klaar om te bekijken."
      });
    }

    const fin = best.find((b) => b.finaal);
    rij.push({
      naam: "Finale versie",
      klaar: !!fin && ["betaling", "download", "afgewerkt"].includes(project.fase),
      nu: !!fin && project.fase === "feedback",
      uitleg: fin ? "Zonder watermerk." : "Volgt zodra je akkoord bent."
    });

    return rij;
  }

  $("#pr-tijdlijn").innerHTML = gestopt
    ? `<li class="stap is-nu"><span class="stap__bol"></span>
         <div><strong>Stopgezet</strong><span>Dit project loopt niet meer. Neem contact op als dat een vergissing is.</span></div>
       </li>`
    : FASEN.map(([sleutel, titel, uitleg], i) => {
        const staat = i < nu ? "is-klaar" : i === nu ? "is-nu" : "";
        if (sleutel === "feedback" && project.fase === "aanpassen") {
          titel = "Je feedback wordt verwerkt";
          uitleg = "Joppe past aan wat je doorgaf. Je krijgt bericht zodra de nieuwe versie klaarstaat.";
        }

        /* Onder de feedbackstap tonen we de losse versies, zodat je ziet
           waar je zit in het aantal rondes. */
        const sub =
          sleutel === "feedback" && i <= nu
            ? `<ol class="substap">${versieStappen()
                .map(
                  (v) => `
                  <li class="substap__item ${v.klaar ? "is-klaar" : v.nu ? "is-nu" : ""}">
                    <span class="substap__bol"></span>
                    <span class="substap__naam">${esc(v.naam)}</span>
                    <span class="substap__uitleg">${esc(v.uitleg)}</span>
                  </li>`
                )
                .join("")}</ol>`
            : "";

        return `
        <li class="stap ${staat}">
          <span class="stap__bol"></span>
          <div>
            <strong>${esc(titel)}</strong>
            <span>${esc(uitleg)}</span>
            ${sub}
          </div>
        </li>`;
      }).join("");

  $("#pr-nota").textContent = project.nota || "";
  $("#pr-nota").hidden = !project.nota;

  /* Feedbackrondes */
  const over = Math.max(0, (project.rondes || 0) - (project.rondes_op || 0));
  $("#pr-rondes").textContent =
    project.rondes ? `${over} van ${project.rondes} feedbackrondes over` : "";

  /* De projectcode, zodat de klant hem kan terugvinden */
  const codevak = $("#pr-code");
  if (codevak) codevak.textContent = code;

  /* Afgewezen? Dan één duidelijke boodschap en terug naar de site. */
  if (project.fase === "afgewezen") {
    $("#afgewezen-reden").textContent =
      project.afwijsreden || "Joppe kon deze opdracht niet aannemen.";
    if (!$("#afgewezendlg").open) $("#afgewezendlg").showModal();
  }

  /* Gratis project? Dan één keer laten zien wat het normaal zou kosten. */
  /* Eén keer per bezoek tonen, niet voorgoed onderdrukken: anders zie je het
     na de eerste keer nooit meer terug, ook niet bij een nieuw project. */
  if (project.gratis && project.prijs && !sessionStorage.getItem("jds_gratis_" + code)) {
    $("#gratis-bedrag").textContent = project.prijs;
    if (!$("#gratisdlg").open) $("#gratisdlg").showModal();
  }

  /* Wacht op handtekening? Dan meteen de overeenkomst tonen. */
  if (project.fase === "contract" && !project.contract_op) {
    $("#contract-tekst").textContent = project.contract_tekst || "";
    $("#contract-prijs").textContent = project.prijs || "Nog te bepalen";
    const hint = $("#ct-naamhint");
    if (hint) hint.textContent = "Vul in: " + (project.naam || "je naam uit de aanvraag");
    if (!$("#contractdlg").open) $("#contractdlg").showModal();
  }

  /* Waar zit je in je feedbackrondes? */
  const rondevak = $("#pr-rondemelding");
  if (rondevak) {
    const op = project.rondes_op || 0;
    const tot = project.rondes || 0;
    if (["feedback", "aanpassen"].includes(project.fase) && tot) {
      const nu = Math.min(op + 1, tot);
      rondevak.hidden = false;
      rondevak.textContent =
        op >= tot
          ? `Je gebruikte al je ${tot} feedbackrondes. Stuur gerust nog een bericht als er iets moet wijzigen.`
          : `Je zit aan je ${nu}e feedbackronde van ${tot}. Geef gerust aanpassingen door.`;
    } else {
      rondevak.hidden = true;
    }
  }

  /* Afwijzing of betaling apart in beeld */
  const info = $("#pr-info");
  if (info) {
    if (project.fase === "afgewezen") {
      info.hidden = false;
      info.className = "form__note form__note--err";
      info.textContent = "Deze aanvraag is niet aangenomen." +
        (project.afwijsreden ? " Reden: " + project.afwijsreden : "");
    } else if (project.gratis && project.prijs) {
      info.hidden = false;
      info.className = "form__note form__note--ok";
      info.innerHTML = `Dit project is <strong>gratis</strong> voor jou. ` +
        `Normaal kost dit <s>${esc(project.prijs)}</s>. ` +
        `<button class="linkknop" data-gratisopnieuw>Nog eens tonen</button>`;
    } else if (project.fase === "betaling" && project.betaling_nodig && !project.betaald) {
      info.hidden = false;
      info.className = "form__note";
      info.innerHTML =
        `<strong>Klaar voor betaling.</strong> ` +
        (project.betaling_bedrag ? `Bedrag: ${esc(project.betaling_bedrag)}. ` : "") +
        `Zodra de betaling binnen is, komt je eindbestand vrij.` +
        (project.betaling_link
          ? `<div style="margin-top:10px"><a class="btn btn--fill" href="${esc(project.betaling_link)}"
               target="_blank" rel="noopener">Betalen</a></div>`
          : "");
    } else if (project.fase === "afgewerkt" && project.verwijder_op) {
      info.hidden = false;
      info.className = "form__note";
      info.textContent =
        "Dit project wordt op " + datum(project.verwijder_op) +
        " automatisch gewist. Sla je bestanden voor die tijd op.";
    } else {
      info.hidden = true;
    }
  }

  /* Opgeleverd werk */
  const best = project.bestanden || [];
  const rondesOp = project.rondes_op || 0;
  const rondesTot = project.rondes || 0;
  const rondesOver = Math.max(0, rondesTot - rondesOp);
  const inFeedback = ["feedback", "aanpassen"].includes(project.fase);

  /* Alleen de nieuwste versie staat open; oudere klappen we in. */
  const nieuwste = best.length ? best[0].id : null;

  $("#pr-bestanden").innerHTML = best.length
    ? best.map((b) => {
        const open = b.id === nieuwste;
        /* Zijn de rondes op, dan valt er niets meer te kiezen: de versie geldt
           als aanvaard. Wel kan je nog een extra ronde vragen. */
        const magVragen = inFeedback && open && !b.finaal
                          && b.status !== "goedgekeurd" && rondesOver > 0;
        const magKeuren = inFeedback && open && b.status !== "goedgekeurd" && rondesOver > 0;
        const rondesLeeg = inFeedback && open && !b.finaal
                           && b.status !== "goedgekeurd" && rondesOver === 0;

        return `
        <article class="levering ${open ? "" : "is-ingeklapt"}" data-id="${esc(b.id)}">
          <button class="levering__vouw" data-vouw="${esc(b.id)}" ${open ? "hidden" : ""}>
            <span>${esc(b.titel)} · ronde ${b.ronde}</span>
            <span class="levering__vouwlabel">Bekijken</span>
          </button>

          <div class="levering__inhoud" ${open ? "" : "hidden"}>
            ${voorbeeld(b)}
            <div class="levering__body">
              <div class="levering__top">
                <span class="badge">${esc(SOORTEN[b.soort] || "Bestand")} · ronde ${b.ronde}</span>
                ${b.finaal ? `<span class="badge badge--ok">Finale versie</span>` : ""}
                ${
                  b.status === "goedgekeurd" ? `<span class="badge badge--ok">Goedgekeurd</span>`
                  : b.status === "aanpassing" ? `<span class="badge badge--wacht">Aanpassing gevraagd</span>`
                  : ""
                }
                <span class="msg__meta">${esc(datumTijd(b.created_at))}</span>
              </div>

              <h3>${esc(b.titel)}</h3>
              ${b.notitie ? `<p class="levering__nota">${esc(b.notitie)}</p>` : ""}

              <div class="levering__acts">
                ${
                  b.finaal
                    ? `<button class="btn btn--fill" data-download="${esc(b.id)}">Download</button>`
                    : ""
                }
                ${magKeuren ? `<button class="btn btn--fill" data-ok="${esc(b.id)}">Goedkeuren</button>` : ""}
                ${
                  magVragen
                    ? `<button class="btn" data-fb="${esc(b.id)}" data-titel="${esc(b.titel)}">Aanpassing vragen</button>`
                    : ""
                }
              </div>

              ${
                rondesLeeg
                  ? `<div class="rondeop">
                       <p class="rondeop__tekst">
                         Je gebruikte al je ${rondesTot} feedbackrondes, dus deze versie
                         geldt als afgewerkt. Wil je toch nog iets wijzigen?
                       </p>
                       ${
                         project.extra_gevraagd
                           ? `<p class="field__hint">
                                Je vroeg een extra ronde aan. Joppe laat weten of dat lukt.
                              </p>`
                           : `<button class="btn" data-extra="1">Extra ronde aanvragen</button>`
                       }
                     </div>`
                  : ""
              }
            </div>
          </div>
        </article>`;
      }).join("")
    : `<p class="field__hint">Er staat nog niets klaar. Zodra er werk opgeleverd wordt, verschijnt het hier.</p>`;

  /* Berichten */
  const ber = project.berichten || [];
  $("#pr-berichten").innerHTML = ber.length
    ? ber.map((b) => `
        <div class="bericht ${
          b.van === "klant" ? "is-klant" : b.van === "systeem" ? "is-systeem" : ""
        }">
          <div class="bericht__wie">${
            b.van === "klant" ? "Jij" : b.van === "systeem" ? "Systeem" : "Joppe"
          } · ${esc(datumTijd(b.created_at))}</div>
          <p>${esc(b.bericht)}</p>
        </div>`).join("")
    : `<p class="field__hint">Nog geen berichten.</p>`;
}

/* --------------------------------------------------------------------------
   Acties
   -------------------------------------------------------------------------- */

$("#codeform").addEventListener("submit", async (e) => {
  e.preventDefault();
  code = normaliseerCode(codeveld.value);
  codeveld.value = code;
  if (code.length < 5) {
    melding($("#codenote"), "Vul eerst je volledige volgcode in.", "err");
    return;
  }
  await laad(false);
});

$("#uitloggen").addEventListener("click", () => {
  /* Ook de code uit het webadres halen: anders logt de pagina bij het
     herladen meteen weer in met dezelfde code. */
  localStorage.removeItem("jds_volgcode");
  location.href = location.pathname;
});

/* Feedback en goedkeuren */
$("#pr-bestanden").addEventListener("click", async (e) => {
  /* Een oudere versie weer openklappen */
  const vouw = e.target.closest("[data-vouw]");
  if (vouw) {
    const kaart = vouw.closest(".levering");
    kaart.classList.remove("is-ingeklapt");
    kaart.querySelector(".levering__inhoud").hidden = false;
    vouw.hidden = true;
    return;
  }

  /* Downloaden. De server geeft de link alleen vrij als alles rond is;
     hier tonen we uitleg in plaats van een lege knop. */
  const dl = e.target.closest("[data-download]");
  if (dl) {
    const b = (project.bestanden || []).find((x) => x.id === dl.dataset.download);
    if (!b) return;

    if (!b.download_url) {
      const bedrag = project.prijs || project.betaling_bedrag || "";
      $("#betaal-bedrag").textContent = bedrag ? "Te betalen: " + bedrag : "";
      /* Puur de link openen: het betalen zelf gebeurt volledig bij Wero. */
      $("#betaal-knop").innerHTML = project.betaling_link
        ? `<a class="btn btn--fill" href="${esc(project.betaling_link)}" target="_blank"
              rel="noopener">Betaal via Wero</a>`
        : `<p class="field__hint">
             Joppe bezorgt je het betaalverzoek nog.
           </p>`;
      $("#betaaldlg").showModal();
      return;
    }

    /* Bij Drive maken we er een rechtstreekse downloadlink van. */
    const m = String(b.download_url).match(/\/file\/d\/([A-Za-z0-9_-]{10,})/);
    window.open(
      m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : b.download_url,
      "_blank",
      "noopener"
    );

    /* Het ophalen van het eindbestand sluit het project af. */
    sb.rpc("markeer_gedownload", { p_code: code }).then(() => laad(true));

    /* Even wachten zodat de download echt begint voor het venster opent. */
    setTimeout(() => {
      const al = localStorage.getItem("jds_review_" + code);
      $("#klaar-review").hidden = !!al;
      $("#klaar-dank").hidden = !al;
      $("#klaardlg").showModal();
    }, 700);
    return;
  }

  const fb = e.target.closest("[data-fb]");
  if (fb) {
    $("#fbform").dataset.levering = fb.dataset.fb;
    $("#fb-op").textContent = "Over: " + fb.dataset.titel;
    const over = Math.max(0, (project.rondes || 0) - (project.rondes_op || 0));
    const w = $("#fb-waarschuwing");
    if (w) {
      w.hidden = over > 1;
      w.textContent = over === 1
        ? "Dit is je laatste feedbackronde. Zet er dus alles in wat je wil aanpassen."
        : "";
    }
    $("#fb-tekst").value = "";
    $("#fbdlg").showModal();
    return;
  }

  const ok = e.target.closest("[data-ok]");
  if (ok) {
    if (!confirm("Ben je zeker? Daarna gaat het project naar de laatste stap.")) return;
    ok.disabled = true;
    const { error } = await sb.rpc("keur_goed", { p_code: code, p_levering: ok.dataset.ok });
    ok.disabled = false;
    if (error) { alert("Doorgeven lukte niet."); return; }
    await laad(true);
    return;
  }
});

/* ---- Afgewezen: één knop, dan terug naar de site ---- */
$("#afgewezen-ok").addEventListener("click", () => {
  $("#afgewezendlg").close();
  location.href = "index.html";
});


/* --------------------------------------------------------------------------
   Automatisch bijwerken
   --------------------------------------------------------------------------
   De pagina haalt zichzelf regelmatig opnieuw op, zodat de klant een nieuwe
   versie of een faseovergang ziet zonder te herladen.

   Waarom niet Supabase Realtime? Dat luistert rechtstreeks op de tabellen, en
   de klant heeft daar bewust geen leesrechten: alles loopt via één beveiligde
   functie die eerst de volgcode controleert. Realtime zou dus niets
   doorgeven, tenzij we iedereen leesrechten geven op alle projecten. Daarom
   periodiek ophalen via diezelfde functie.

   We halen alleen op als het tabblad zichtbaar is, en we tekenen alleen
   opnieuw als er echt iets veranderd is. Zo blijft je scrollpositie staan en
   springt er niets weg terwijl je typt.
   -------------------------------------------------------------------------- */

const HERHAAL_MS = 20000;
let vorigeStand = null;

function stand(p) {
  if (!p) return "";
  return [
    p.fase, p.rondes, p.rondes_op, p.betaald, p.extra_gevraagd ? 1 : 0,
    (p.bestanden || []).map((b) => b.id + b.status + (b.finaal ? "f" : "")).join(","),
    (p.berichten || []).length
  ].join("|");
}

/* Laat kort zien dat er iets nieuws is */
function meldVernieuwd() {
  const balk = $("#pr-vernieuwd");
  if (!balk) return;
  balk.hidden = false;
  clearTimeout(meldVernieuwd._t);
  meldVernieuwd._t = setTimeout(() => (balk.hidden = true), 6000);
}

async function kijkNaarUpdates() {
  if (document.hidden || !code || !sb) return;
  /* Niet storen terwijl er een venster openstaat: dan ben je aan het lezen
     of invullen. */
  if (document.querySelector("dialog[open]")) return;

  try {
    const { data, error } = await sb.rpc("haal_traject", { p_code: code });
    if (error || !data?.ok) return;
    if (stand(data) === vorigeStand) return;

    project = data;
    vorigeStand = stand(data);
    toon();
    meldVernieuwd();
  } catch (e) {
    /* Netwerk even weg? Dan proberen we het gewoon straks opnieuw. */
  }
}

setInterval(kijkNaarUpdates, HERHAAL_MS);

/* Kom je terug naar het tabblad, dan meteen kijken. */
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) kijkNaarUpdates();
});
window.addEventListener("focus", kijkNaarUpdates);

/* ---- Herladen ---- */
$("#herlaad").addEventListener("click", async (e) => {
  const knop = e.currentTarget;
  knop.disabled = true;
  const origineel = knop.textContent;
  knop.textContent = "Bezig…";
  await laad(true);
  knop.disabled = false;
  knop.textContent = "Bijgewerkt";
  setTimeout(() => (knop.textContent = origineel), 1400);
});

/* ---- Extra feedbackronde aanvragen ---- */
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-extra]")) {
    $("#ex-tekst").value = "";
    $("#ex-note").hidden = true;
    $("#extradlg").showModal();
  }
  if (e.target.closest("[data-extrasluit]")) $("#extradlg").close();
});
sluitBijKlikNaast($("#extradlg"));

$("#extraform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = $("#ex-note");
  const tekst = $("#ex-tekst").value.trim();
  const knop = $("#ex-verstuur");

  if (tekst.length < 5) {
    melding(note, "Beschrijf even wat je nog wil aanpassen.", "err");
    return;
  }

  knop.disabled = true;
  knop.textContent = "Versturen…";
  const { data, error } = await sb.rpc("vraag_extra_ronde", { p_code: code, p_tekst: tekst });
  knop.disabled = false;
  knop.textContent = "Aanvraag versturen";

  if (error || !data?.ok) {
    melding(note, data?.reden === "albezig"
      ? "Je vroeg al een extra ronde aan. Joppe laat snel iets weten."
      : "Versturen lukte niet. Probeer het zo nog eens.", "err");
    return;
  }

  $("#extradlg").close();
  await laad(true);
});

/* ---- Bedankvenster na de download, met review ---- */
$("#kr-later").addEventListener("click", () => $("#klaardlg").close());
$("#klaar-sluit").addEventListener("click", () => $("#klaardlg").close());
sluitBijKlikNaast($("#klaardlg"));

$("#klaarreviewform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = $("#kr-note");
  const gekozen = document.querySelector('input[name="krsterren"]:checked');
  const tekst = $("#kr-tekst").value.trim();
  const knop = $("#kr-verstuur");

  if (!gekozen) { melding(note, "Kies eerst een aantal sterren.", "err"); return; }
  if (tekst.length < 10) { melding(note, "Schrijf iets meer, minstens 10 tekens.", "err"); return; }

  knop.disabled = true;
  knop.textContent = "Versturen…";

  const { error } = await sb.from("reviews").insert([{
    naam: project.naam || "Klant",
    rol: $("#kr-rol").value.trim() || project.pakket || null,
    sterren: Number(gekozen.value),
    tekst,
    status: "wachtend",
    bron: "site",
    volgorde: 0
  }]);

  knop.disabled = false;
  knop.textContent = "Review versturen";

  if (error) {
    console.error("[JoppeDS] review", error);
    melding(note, "Versturen lukte niet. Probeer het zo nog eens.", "err");
    return;
  }

  localStorage.setItem("jds_review_" + code, "1");
  $("#klaar-review").hidden = true;
  $("#klaar-dank").hidden = false;
});

/* ---- Gratisvenster ---- */
document.addEventListener("click", (e) => {
  if (e.target.closest("[data-gratisopnieuw]")) {
    $("#gratis-bedrag").textContent = project?.prijs || "";
    $("#gratisdlg").showModal();
  }
});

$("#gratis-ok").addEventListener("click", () => {
  /* Eén keer tonen is genoeg; daarna blijft het bij de melding bovenaan. */
  sessionStorage.setItem("jds_gratis_" + code, "1");
  $("#gratisdlg").close();
});
sluitBijKlikNaast($("#gratisdlg"));

/* ---- Betaalvenster ---- */
$("#betaaldlg").addEventListener("click", (e) => {
  if (e.target.closest("[data-betaalsluit]")) $("#betaaldlg").close();
});
sluitBijKlikNaast($("#betaaldlg"));

/* ---- De overeenkomst tekenen ---- */
$("#contractdlg").addEventListener("click", (e) => {
  if (e.target.closest("[data-contractsluit]")) $("#contractdlg").close();
});
sluitBijKlikNaast($("#contractdlg"));

$("#contractform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = $("#ct-note");
  const naam = $("#ct-naam").value.trim();
  const knop = $("#ct-teken");

  if (!$("#ct-akkoord").checked) {
    melding(note, "Vink eerst aan dat je akkoord gaat.", "err");
    return;
  }
  if (naam.length < 3) {
    melding(note, "Vul je volledige naam in als handtekening.", "err");
    return;
  }

  knop.disabled = true;
  knop.textContent = "Bezig…";
  const { data, error } = await sb.rpc("teken_contract", {
    p_code: code, p_naam: naam, p_akkoord: true
  });
  knop.disabled = false;
  knop.textContent = "Tekenen en starten";

  if (error || !data?.ok) {
    melding(note,
      data?.reden === "naamfout"
        ? `De naam moet overeenkomen met de naam uit je aanvraag: ${project.naam}.`
        : "Tekenen lukte niet. Probeer het zo nog eens.",
      "err");
    return;
  }

  $("#contractdlg").close();
  await laad(true);
});

$("#fbdlg").addEventListener("click", (e) => {
  if (e.target.closest("[data-fb-sluit]")) $("#fbdlg").close();
});
sluitBijKlikNaast($("#fbdlg"));

$("#fbform").addEventListener("submit", async (e) => {
  e.preventDefault();
  const note = $("#fb-note");
  const veld = $("#fb-tekst");
  const knop = $("#fb-verstuur");
  const levering = $("#fbform").dataset.levering || null;

  if (veld.value.trim().length < 5) {
    melding(note, "Beschrijf iets uitgebreider wat er anders mag.", "err");
    return;
  }

  knop.disabled = true;
  knop.textContent = "Versturen…";

  /* Hangt de feedback aan een bepaalde versie, dan telt het als een
     aanpassingsronde. Een losse vraag kost geen ronde. */
  const { data, error } = levering
    ? await sb.rpc("vraag_aanpassing", {
        p_code: code, p_levering: levering, p_tekst: veld.value.trim()
      })
    : await sb.rpc("geef_feedback", {
        p_code: code, p_bericht: veld.value.trim(), p_levering: null
      });

  knop.disabled = false;
  knop.textContent = "Feedback versturen";

  if (error || !data?.ok) {
    melding(note, "Versturen lukte niet. Probeer het zo nog eens.", "err");
    return;
  }

  veld.value = "";
  $("#fbdlg").close();
  await laad(true);
});

/* Gewone vraag, kost geen feedbackronde */
$("#pr-verstuur").addEventListener("click", async (e) => {
  e.preventDefault();
  const tekst = $("#pr-vraag").value.trim();
  const note = $("#pr-note");

  if (tekst.length < 3) { melding(note, "Schrijf even kort je vraag.", "err"); return; }

  const { data, error } = await sb.rpc("geef_feedback", {
    p_code: code,
    p_bericht: tekst,
    p_levering: null
  });

  if (error || !data?.ok) { melding(note, "Versturen lukte niet.", "err"); return; }

  $("#pr-vraag").value = "";
  melding(note, "Verstuurd. Je krijgt bericht zodra Joppe geantwoord heeft.", "ok");
  await laad(true);
});

/* --------------------------------------------------------------------------
   Starten
   --------------------------------------------------------------------------
   Kwam je hier via een link met je code erin, of was je hier al eens?
   Dan hoef je niets opnieuw in te typen.
   -------------------------------------------------------------------------- */

(function start() {
  const uitLink = new URLSearchParams(location.search).get("code");
  const bewaard = localStorage.getItem("jds_volgcode");
  const gevonden = uitLink || bewaard;

  if (!gevonden) return;

  code = normaliseerCode(gevonden);
  codeveld.value = code;
  laad(true).then((gelukt) => {
    if (!gelukt) localStorage.removeItem("jds_volgcode");
  });
})();
