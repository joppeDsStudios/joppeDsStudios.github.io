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

  /* Reviews */
  const reviews = c.reviews || [];
  const revSec = $("#reviews-sectie");
  if (revSec) revSec.hidden = reviews.length === 0;

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
      say("Versturen lukte niet. Probeer opnieuw, of mail rechtstreeks.", "err");
      return;
    }

    form.reset();
    say(window.__content?.contact?.bedankt || "Bedankt, je bericht is verstuurd.", "ok");
  });
})();

/* --------------------------------------------------------------------------
   Starten
   -------------------------------------------------------------------------- */
window.loadContent().then(render);
