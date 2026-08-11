/* ==========================================================================
   JoppeDS Studio's — publieke site
   ========================================================================== */

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const dig = (obj, path) => path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);

/* --------------------------------------------------------------------------
   Timecode in de topbalk — 25 beelden per seconde, zoals bij PAL
   -------------------------------------------------------------------------- */
(function timecode() {
  const el = $("#tc");
  if (!el) return;
  const pad = (n) => String(n).padStart(2, "0");
  setInterval(() => {
    const d = new Date();
    const f = Math.floor((d.getMilliseconds() / 1000) * 25);
    el.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}:${pad(f)}`;
  }, 40);
})();

/* --------------------------------------------------------------------------
   Menu op telefoon
   -------------------------------------------------------------------------- */
(function menu() {
  const knop = $("#menuknop");
  const nav = $("#nav");
  if (!knop || !nav) return;

  const zet = (open) => {
    nav.classList.toggle("is-open", open);
    knop.setAttribute("aria-expanded", String(open));
    knop.setAttribute("aria-label", open ? "Menu sluiten" : "Menu openen");
  };

  knop.addEventListener("click", () => zet(!nav.classList.contains("is-open")));

  /* Na het kiezen van een bestemming hoort het menu dicht te gaan */
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) zet(false); });

  /* Klik ergens anders, of Escape */
  document.addEventListener("click", (e) => {
    if (!nav.contains(e.target) && !knop.contains(e.target)) zet(false);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") zet(false); });

  /* Bij het terugschalen naar een breed scherm moet het menu weer normaal doen */
  window.matchMedia("(min-width: 901px)").addEventListener("change", (m) => {
    if (m.matches) zet(false);
  });
})();

/* --------------------------------------------------------------------------
   Topbalk krijgt een lijn zodra je scrollt
   -------------------------------------------------------------------------- */
(function stickyBar() {
  const bar = $("#topbar");
  if (!bar) return;
  const onScroll = () => bar.classList.toggle("is-stuck", window.scrollY > 12);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
})();

$("#jaar").textContent = new Date().getFullYear();

/* --------------------------------------------------------------------------
   Afbeelding met terugval op de placeholder
   Bestaat het bestand niet, dan blijft het gearceerde kader staan.
   -------------------------------------------------------------------------- */
function imgTag(src, alt) {
  if (!src) return "";
  return `<img src="${esc(src)}" alt="${esc(alt)}" hidden
            onload="this.hidden=false" onerror="this.remove()">`;
}

/* --------------------------------------------------------------------------
   Getallen laten optellen (1.39K, 500.7K, ...)
   -------------------------------------------------------------------------- */
function countUp(el, raw) {
  const m = String(raw).match(/^([\d.,]+)\s*(.*)$/);
  if (!m) { el.textContent = raw; return; }

  const target = parseFloat(m[1].replace(",", "."));
  const suffix = m[2] || "";
  const decs = (m[1].split(".")[1] || "").length;

  if (!isFinite(target) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = raw;
    return;
  }

  const dur = 1100;
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min((now - t0) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (target * eased).toFixed(decs) + suffix;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* --------------------------------------------------------------------------
   Onthullen bij scrollen + tally-lampjes aanzetten
   -------------------------------------------------------------------------- */
function observeReveals() {
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        if (e.target.classList.contains("src")) e.target.classList.add("is-live");
        if (e.target.dataset.count) {
          countUp(e.target, e.target.dataset.count);
          delete e.target.dataset.count;
        }
        io.unobserve(e.target);
      });
    },
    { threshold: 0.16, rootMargin: "0px 0px -40px 0px" }
  );
  $$(".reveal, .src, [data-count]").forEach((el) => io.observe(el));
}

/* --------------------------------------------------------------------------
   Inhoud renderen
   -------------------------------------------------------------------------- */
function render(c) {
  /* Losse tekstjes met data-bind */
  $$("[data-bind]").forEach((el) => {
    const v = dig(c, el.dataset.bind);
    if (typeof v === "string" && v.trim()) el.textContent = v;
  });

  /* Statistiekenstrook */
  $("#readout").innerHTML = (c.stats || [])
    .map(
      (s) => `
      <div class="readout__cell">
        <div class="readout__val">${s.prefix ? `<small>${esc(s.prefix)}</small>` : ""}<span data-count="${esc(s.value)}">0</span></div>
        <div class="readout__lbl">${esc(s.label)}</div>
      </div>`
    )
    .join("");

  /* Over mij */
  $("#over-tekst").innerHTML = String(c.over?.tekst || "")
    .split(/\n\s*\n/)
    .map((p) => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");

  $("#over-feiten").innerHTML = (c.over?.feiten || [])
    .map((f) => `<li><span>${esc(f.label)}</span><span>${esc(f.value)}</span></li>`)
    .join("");

  /* Foto bij "Over mij".
     Belangrijk: de afbeelding kan al geladen zijn voor dit script draait.
     Dan is het load-event allang gepasseerd en zou een listener nooit meer
     afgaan. Daarom eerst controleren of de afbeelding er al is. */
  const foto = $("#over-foto");
  if (foto) {
    const toon = () => (foto.hidden = false);
    const weg = () => foto.remove();

    if (c.over?.foto) foto.src = c.over.foto;

    if (foto.complete) {
      foto.naturalWidth > 0 ? toon() : weg();
    } else {
      foto.addEventListener("load", toon);
      foto.addEventListener("error", weg);
    }
  }

  /* Team */
  const leden = c.team?.leden || [];
  const teamSec = $("#team");
  if (teamSec) {
    teamSec.hidden = leden.length === 0;
    $("#nav-team").hidden = leden.length === 0;

    if (leden.length) {
      $("#team-titel").textContent = c.team.titel || "Het team";
      $("#team-tekst").textContent = c.team.tekst || "";
      $("#team-tekst").hidden = !c.team.tekst;

      $("#team-leden").innerHTML = leden
        .map(
          (l, i) => `
        <figure class="lid reveal">
          <div class="frame frame--vierkant" data-label="Foto">
            ${l.foto ? imgTag(l.foto, l.naam) : ""}
          </div>
          <figcaption>
            <span class="lid__naam">${esc(l.naam)}</span>
            ${l.functie ? `<span class="lid__functie">${esc(l.functie)}</span>` : ""}
            ${
              l.link
                ? `<a class="lid__link" href="${esc(l.link)}" target="_blank" rel="noopener">
                     ${esc(l.linkLabel || "Bekijk profiel")} <span aria-hidden="true">&rarr;</span>
                   </a>`
                : ""
            }
          </figcaption>
        </figure>`
        )
        .join("");
    }
  }

  /* Reviews.
     Eerst de goedgekeurde reviews uit de database. Staan die er nog niet,
     dan vallen we terug op de reviews die in de admin zijn ingetypt. */
  const reviews = (window.__reviews && window.__reviews.length)
    ? window.__reviews
    : (c.reviews || []);

  /* De sectie blijft altijd staan: ook zonder reviews moet iemand er een
     kunnen schrijven. Alleen de uitleg wisselt. */
  const leegmelding = $("#reviews-leeg");
  if (leegmelding) leegmelding.hidden = reviews.length > 0;

  const sterren = (n) => {
    const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    if (!v) return "";
    return `
      <div class="stars" role="img" aria-label="${v} van 5 sterren">
        ${[1, 2, 3, 4, 5]
          .map(
            (i) => `
          <svg class="star ${i <= v ? "is-on" : ""}" width="15" height="15"
               viewBox="0 0 20 19" aria-hidden="true">
            <path d="M10 0l2.6 6.3 6.8.5-5.2 4.4 1.6 6.6L10 14.3 4.2 17.8l1.6-6.6L.6 6.8l6.8-.5z"
                  fill="currentColor"/>
          </svg>`
          )
          .join("")}
      </div>`;
  };

  $("#reviews").innerHTML = reviews
    .map(
      (r) => `
      <figure class="quote reveal">
        ${sterren(r.sterren)}
        <blockquote>${esc(r.tekst)}</blockquote>
        <figcaption>
          <span class="quote__naam">${esc(r.naam)}</span>
          ${r.rol ? `<span class="quote__rol">${esc(r.rol)}</span>` : ""}
        </figcaption>
      </figure>`
    )
    .join("");

  /* Projectenrack */
  $("#rack").innerHTML = (c.projecten || [])
    .map((p, i) => {
      const src = p.afbeelding || `assets/img/${p.slug || "project-" + (i + 1)}.jpg`;
      const nr = String(i + 1).padStart(2, "0");
      return `
      <article class="src">
        <div class="src__id"><span class="tally"></span><span>SRC ${nr}</span></div>

        <div class="src__body">
          <p class="src__type">${esc(p.type || "Project")}</p>
          <h3 class="src__title">${esc(p.titel)}</h3>
          <p class="src__desc">${esc(p.beschrijving)}</p>
          <ul class="chips">${(p.stats || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
          ${
            p.link
              ? `<a class="src__link" href="${esc(p.link)}" target="_blank" rel="noopener">
                   ${esc(p.linkLabel || "Bekijken")} <span aria-hidden="true">&rarr;</span>
                 </a>`
              : ""
          }
        </div>

        <div class="frame frame--16x9" data-label="${esc(p.titel)} — 16:9">
          ${imgTag(src, p.titel)}
        </div>
      </article>`;
    })
    .join("");

  /* Prijzen.
     De hele sectie blijft weg tot je haar in de admin aanzet. Staat ze aan,
     dan vervangt ze de aparte aanvraagpagina. */
  const pr = c.prijzen || {};
  const prSec = $("#prijzen-sectie");
  const pakketten = (pr.pakketten || []).filter((x) => x && x.naam);
  const prijzenAan = !!pr.zichtbaar && pakketten.length > 0;
  window.__prijzenAan = prijzenAan;

  if (prSec) {
    prSec.hidden = !pr.zichtbaar || pakketten.length === 0;

    if (!prSec.hidden) {
      if (pr.titel) $("#prijzen-titel").textContent = pr.titel;
      $("#prijzen-tekst").textContent = pr.tekst || "";
      $("#prijzen-voet").textContent = pr.voetnoot || "";
      $("#prijzen-voet").hidden = !pr.voetnoot;

      $("#prijzen").innerHTML = pakketten
        .map(
          (t) => `
        <article class="tarief ${t.uitgelicht ? "is-uit" : ""} reveal">
          ${t.uitgelicht ? `<span class="tarief__vlag">Meest gekozen</span>` : ""}
          <h3 class="tarief__naam">${esc(t.naam)}</h3>
          <p class="tarief__prijs ${/\d/.test(t.prijs || "") ? "" : "tarief__prijs--tekst"}">
            ${esc(t.prijs || "")}
            ${t.eenheid ? `<span>${esc(t.eenheid)}</span>` : ""}
          </p>
          ${t.beschrijving ? `<p class="tarief__wat">${esc(t.beschrijving)}</p>` : ""}
          <ul class="tarief__punten">
            ${(t.punten || [])
              .map(
                (p) => `<li>
                  <svg width="12" height="9" viewBox="0 0 13 10" aria-hidden="true">
                    <path d="M1 5.2 4.4 8.6 12 1" stroke="currentColor" stroke-width="1.8"
                          fill="none" stroke-linecap="square"/>
                  </svg>${esc(p)}</li>`
              )
              .join("")}
          </ul>
          <button class="btn ${t.uitgelicht ? "btn--fill" : ""}"
                  data-prijs-open="${esc(t.naam)}">${esc(pr.knoptekst || "Vraag ernaar")}</button>
        </article>`
        )
        .join("");
    }
  }

  /* Opleidingen */
  $("#courses").innerHTML = (c.opleidingen || [])
    .map(
      (o) => `
      <div class="course">
        <div class="course__mark" aria-hidden="true">
          <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
            <path d="M1 5.2 4.4 8.6 12 1" stroke="currentColor" stroke-width="1.8"
                  stroke-linecap="square"/>
          </svg>
        </div>
        <h3>${esc(o.titel)}</h3>
        <p>${esc(o.instituut)}</p>
      </div>`
    )
    .join("");

  /* Links bij contact en in de footer */
  const socials = c.footer?.socials || [];
  $("#contact-links").innerHTML = socials
    .map(
      (s) =>
        `<li><span>${esc(s.label)}</span><span><a href="${esc(s.url)}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none">${esc(
          s.url.replace(/^https?:\/\/(www\.)?/, "")
        )}</a></span></li>`
    )
    .join("");

  $("#footer-links").innerHTML = socials
    .map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>`)
    .join("");

  /* Eigen links onderaan */
  $("#footer-eigen").innerHTML = (c.footer?.links || [])
    .map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`)
    .join("");

  $("#footer-ondertitel").textContent = c.footer?.ondertitel || "";

  const kopS = $("#footer-kop-socials"), kopL = $("#footer-kop-links");
  kopS.textContent = c.footer?.kopSocials || "";
  kopL.textContent = c.footer?.kopLinks || "";
  kopS.hidden = !socials.length;
  kopL.hidden = !(c.footer?.links || []).length;
  $("#footer-copyright").textContent = c.footer?.copyright ? "· " + c.footer.copyright : "";

  /* De vaste links onderaan, elk apart aan of uit te zetten */
  const vast = [];
  if (!prijzenAan) vast.push(`<a href="aanvraag.html">Projectaanvraag</a>`);
  if (c.footer?.toonReviewknop !== false) vast.push(`<a href="#" data-review-open>Schrijf een review</a>`);
  if (c.footer?.toonAdminlink !== false) vast.push(`<a href="admin.html">Admin</a>`);
  $("#footer-vast").innerHTML = vast.join("");

  /* --------------------------------------------------------------------
     Staan de prijzen aan, dan vervalt de aparte aanvraagpagina: bezoekers
     kiezen dan eerst een pakket en vragen dat rechtstreeks aan.
     -------------------------------------------------------------------- */
  const cta = $("#nav-cta");
  if (cta) {
    if (prijzenAan) {
      cta.href = "#prijzen-sectie";
      cta.textContent = c.prijzen?.knoplabel || "Prijzen";
    } else {
      cta.href = "aanvraag.html";
      cta.textContent = "Projectaanvraag";
    }
  }

  window.__content = c;
  observeReveals();
}

/* --------------------------------------------------------------------------
   Contactformulier
   -------------------------------------------------------------------------- */
(function contactForm() {
  const form = $("#contactform");
  const note = $("#formnote");
  const btn = $("#formsubmit");
  if (!form) return;

  const say = (msg, kind) => {
    note.hidden = false;
    note.textContent = msg;
    note.className = "form__note form__note--" + kind;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const data = {
      voornaam: $("#voornaam").value.trim(),
      naam: $("#naam").value.trim(),
      email: $("#email").value.trim(),
      bericht: $("#bericht").value.trim()
    };

    if (!data.voornaam || !data.naam || !data.email || !data.bericht) {
      say("Vul alle velden in voor je verstuurt.", "err");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
      say("Dat e-mailadres klopt niet. Controleer het even.", "err");
      return;
    }
    /* Honeypot: alleen bots vullen dit veld in. */
    if ($("#website").value) { say(window.__content?.contact?.bedankt || "Verstuurd.", "ok"); form.reset(); return; }

    const sb = window.getSupabase();
    if (!sb) {
      say("Het formulier is nog niet gekoppeld aan de database. Vul assets/js/config.js in.", "err");
      return;
    }

    btn.disabled = true;
    const origineel = btn.textContent;
    btn.textContent = "Versturen…";

    const { error } = await sb.from("messages").insert([data]);

    btn.disabled = false;
    btn.textContent = origineel;

    if (error) {
      say(dbFout(error, "Je bericht versturen"), "err");
      return;
    }

    form.reset();
    say(window.__content?.contact?.bedankt || "Bedankt, je bericht is verstuurd.", "ok");
  });
})();

/* Vertaalt een databasefout naar iets waar je wat mee kan. De volledige
   fout gaat naar de console, zodat je die kan opzoeken als het nodig is. */
function dbFout(error, wat) {
  console.error("[JoppeDS] " + wat, error);

  const code = error?.code || "";
  const msg = (error?.message || "").toLowerCase();

  if (code === "42P01" || msg.includes("does not exist") || msg.includes("schema cache")) {
    return "Dit deel van de database bestaat nog niet. Voer supabase-setup.sql opnieuw uit in Supabase.";
  }
  if (code === "42501" || msg.includes("row-level security") || msg.includes("permission denied")) {
    return "De database weigerde dit. Voer supabase-setup.sql opnieuw uit in Supabase.";
  }
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) {
    return "Geen verbinding met de server. Controleer je internetverbinding.";
  }
  return wat + " lukte niet: " + (error?.message || "onbekende fout");
}

/* --------------------------------------------------------------------------
   Reviews ophalen en zelf laten schrijven
   -------------------------------------------------------------------------- */

/* De goedgekeurde reviews komen uit een aparte weergave in de database die
   het e-mailadres van de schrijver niet meestuurt. */
async function haalReviews() {
  const sb = window.getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("reviews_publiek")
      .select("*")
      .order("volgorde", { ascending: true })
      .order("created_at", { ascending: false });
    return error || !data ? [] : data;
  } catch (e) {
    return [];
  }
}

(function reviewFormulier() {
  const dlg = $("#reviewdlg");
  if (!dlg) return;

  const form = $("#reviewform");
  const note = $("#reviewnote");
  const btn = $("#reviewverzend");
  const tekst = $("#r-tekst");

  const zeg = (msg, soort) => {
    note.hidden = false;
    note.textContent = msg;
    note.className = "form__note form__note--" + soort;
  };

  /* Openen en sluiten */
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-review-open]")) {
      e.preventDefault();
      note.hidden = true;
      dlg.showModal();
    }
    if (e.target.closest("[data-review-sluit]")) dlg.close();
  });
  dlg.addEventListener("mousedown", (e) => {
    if (e.target === dlg) dlg.close();
  });

  /* Tekstteller */
  tekst.addEventListener("input", () => {
    $("#r-teller").textContent = tekst.value.length;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const gekozen = form.querySelector('input[name="sterren"]:checked');
    const data = {
      naam: $("#r-naam").value.trim(),
      rol: $("#r-rol").value.trim() || null,
      email: $("#r-email").value.trim() || null,
      sterren: gekozen ? Number(gekozen.value) : 0,
      tekst: tekst.value.trim(),
      status: "wachtend",
      bron: "site",
      volgorde: 0
    };

    const mist = [];
    if (!data.sterren) mist.push("een aantal sterren");
    if (data.naam.length < 2) mist.push("je naam");
    if (data.tekst.length < 10) mist.push("een review van minstens 10 tekens");
    if (!$("#r-akkoord").checked) mist.push("je akkoord onderaan");

    if (mist.length) { zeg("Vul nog aan: " + mist.join(", ") + ".", "err"); return; }

    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) {
      zeg("Dat e-mailadres klopt niet. Laat het gerust leeg als je liever niets opgeeft.", "err");
      return;
    }

    /* Honeypot: alleen bots vullen dit veld in. */
    if ($("#r-web").value) { zeg("Bedankt voor je review.", "ok"); form.reset(); return; }

    const sb = window.getSupabase();
    if (!sb) { zeg("Het formulier is nog niet gekoppeld aan de database.", "err"); return; }

    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "Versturen…";

    const { error } = await sb.from("reviews").insert([data]);

    btn.disabled = false;
    btn.textContent = orig;

    if (error) {
      zeg(dbFout(error, "Je review versturen"), "err");
      return;
    }

    form.reset();
    $("#r-teller").textContent = "0";
    zeg("Bedankt. Je review is verstuurd en verschijnt zodra Joppe hem nagelezen heeft.", "ok");
  });
})();

/* --------------------------------------------------------------------------
   Prijsaanvraag
   --------------------------------------------------------------------------
   Klik je bij een pakket op de knop, dan opent dit formulier met dat pakket
   al ingevuld. De velden komen uit de admin, niet uit deze code.
   -------------------------------------------------------------------------- */

(function prijsFormulier() {
  const dlg = $("#prijsdlg");
  if (!dlg) return;

  const form = $("#prijsform");
  const note = $("#prijsnote");
  const btn = $("#prijsverzend");
  const doel = $("#prijsvelden");

  const zeg = (msg, soort) => {
    note.hidden = false;
    note.textContent = msg;
    note.className = "form__note form__note--" + soort;
  };

  const def = () => {
    const d = JSON.parse(
      JSON.stringify(window.__content?.formulieren?.prijsaanvraag || { groepen: [] })
    );
    /* De keuzelijst met pakketten vullen met wat er echt op de site staat */
    const namen = (window.__content?.prijzen?.pakketten || [])
      .filter((x) => x && x.naam)
      .map((x) => x.naam);
    (d.groepen || []).forEach((g) =>
      (g.velden || []).forEach((v) => {
        if (v.id === "pakket") v.opties = namen;
      })
    );
    return d;
  };

  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-prijs-open]");
    if (open) {
      e.preventDefault();
      const d = def();

      $("#prijs-kop").textContent = d.kop || "Vraag dit pakket aan";
      $("#prijs-tekst").textContent = d.tekst || "";
      $("#prijs-voet").textContent = d.voetnoot || "";
      $("#prijsverzend").textContent = d.knop || "Aanvraag versturen";

      window.bouwFormulier(doel, d, { prefix: "p-", nummers: false });

      /* Het gekozen pakket vooraf invullen */
      const keuze = doel.querySelector("#p-pakket");
      if (keuze) keuze.value = open.dataset.prijsOpen;

      note.hidden = true;
      dlg.showModal();
      const eerste = doel.querySelector("#p-naam");
      if (eerste) eerste.focus();
    }

    if (e.target.closest("[data-prijs-sluit]")) dlg.close();
  });

  dlg.addEventListener("mousedown", (e) => { if (e.target === dlg) dlg.close(); });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = def();
    const waarden = window.leesFormulier(doel, d, "p-");

    const mist = window.controleerFormulier(waarden, d);
    if (mist.length) { zeg("Vul nog aan: " + mist.join(", ") + ".", "err"); return; }

    /* Honeypot: alleen bots vullen dit veld in. */
    if ($("#p-web").value) { zeg(d.bedankt || "Bedankt.", "ok"); form.reset(); return; }

    const sb = window.getSupabase();
    if (!sb) { zeg("Het formulier is nog niet gekoppeld aan de database.", "err"); return; }

    waarden.titel = waarden.pakket ? "Prijsaanvraag: " + waarden.pakket : "Prijsaanvraag";

    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = "Versturen…";

    const { data, error } = await sb.rpc("submit_open_request", { p_data: waarden });

    btn.disabled = false;
    btn.textContent = orig;

    if (error) { zeg(dbFout(error, "Je aanvraag versturen"), "err"); return; }
    if (!data?.ok) {
      zeg(
        data?.reden === "onvolledig"
          ? "Er ontbreken nog verplichte velden."
          : "Versturen lukte niet. Probeer het zo nog eens.",
        "err"
      );
      return;
    }

    doel.querySelectorAll("input, textarea, select").forEach((el) => {
      if (el.type === "checkbox") el.checked = false;
      else el.value = "";
    });
    zeg((d.bedankt || "Bedankt.") + " Je referentie is " + data.referentie + ".", "ok");
  });
})();

/* --------------------------------------------------------------------------
   Starten
   -------------------------------------------------------------------------- */
Promise.all([window.loadContent(), haalReviews()]).then(([inhoud, reviews]) => {
  window.__reviews = reviews;
  render(inhoud);
});
