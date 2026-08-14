/* ==========================================================================
   Bibliotheek
   --------------------------------------------------------------------------
   Een plek voor tutorials, inspiratie en tools. YouTube-links krijgen
   automatisch hun voorbeeldafbeelding, zodat je in één oogopslag ziet wat wat
   is. Daarvoor is geen API-sleutel nodig.
   ========================================================================== */


let bib = [];
let bibZoek = "";
let bibMap = "";
let bibAlleenFav = false;
let bibGeladen = false;

/* --------------------------------------------------------------------------
   Herkennen wat voor link het is
   -------------------------------------------------------------------------- */

function videoId(url) {
  const m = String(url || "").match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/
  );
  return m ? m[1] : null;
}

function bronVan(url) {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    if (h.includes("youtube") || h.includes("youtu.be")) return "YouTube";
    if (h.includes("vimeo")) return "Vimeo";
    if (h.includes("tiktok")) return "TikTok";
    if (h.includes("instagram")) return "Instagram";
    if (h.includes("reddit")) return "Reddit";
    if (h.includes("blackmagicdesign")) return "Blackmagic";
    return h;
  } catch (e) {
    return null;
  }
}

/* De voorbeeldafbeelding van een YouTube-video. Werkt zonder API-sleutel. */
const videoBeeld = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/* --------------------------------------------------------------------------
   Laden en tonen
   -------------------------------------------------------------------------- */

async function loadBib() {
  const { data, error } = await sb
    .from("bibliotheek")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    $("#bib-lijst").innerHTML =
      `<div class="empty"><strong>Bibliotheek laden lukte niet</strong>${esc(error.message)}.
       Voer supabase-setup.sql opnieuw uit.</div>`;
    console.error("[JoppeDS] bibliotheek", error);
    return;
  }

  bib = data || [];
  toonBibFilters();
  toonBib();
}

function toonBibFilters() {
  const mappen = [...new Set(bib.map((b) => b.map).filter(Boolean))].sort();
  const tellen = (m) => bib.filter((b) => b.map === m).length;

  $("#bib-filters").innerHTML = `
    <button class="mini ${bibMap === "" && !bibAlleenFav ? "is-on" : ""}" data-bibmap="">
      Alles (${bib.length})
    </button>
    ${mappen
      .map(
        (m) => `<button class="mini ${bibMap === m ? "is-on" : ""}" data-bibmap="${esc(m)}">
                  ${esc(m)} (${tellen(m)})
                </button>`
      )
      .join("")}
    <button class="mini ${bibAlleenFav ? "is-on" : ""}" data-bibfav="1">
      ★ Favorieten (${bib.filter((b) => b.favoriet).length})
    </button>`;
}

function toonBib() {
  const zoek = bibZoek.toLowerCase();

  const rijen = bib.filter((b) => {
    if (bibAlleenFav && !b.favoriet) return false;
    if (bibMap && b.map !== bibMap) return false;
    if (!zoek) return true;
    return [b.titel, b.omschrijving, b.map, b.bron, (b.tags || []).join(" ")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(zoek);
  });

  if (!rijen.length) {
    $("#bib-lijst").innerHTML = `
      <div class="empty">
        <strong>${bib.length ? "Niets gevonden" : "Je bibliotheek is nog leeg"}</strong>
        ${
          bib.length
            ? "Probeer een andere zoekterm of map."
            : "Plak hier links naar tutorials, inspirerende video's of handige tools."
        }
      </div>`;
    return;
  }

  $("#bib-lijst").innerHTML = `
    <div class="bib-raster">
      ${rijen
        .map((b) => `
          <article class="bibkaart" data-id="${esc(b.id)}">
            <a class="bibkaart__beeld" href="${esc(b.url)}" target="_blank" rel="noopener"
               data-bibopen="${esc(b.id)}">
              ${
                b.video_id
                  ? `<img src="${esc(videoBeeld(b.video_id))}" alt="" loading="lazy" decoding="async"
                          onerror="this.hidden=true">
                     <span class="bibkaart__bron">${esc(b.bron || "Video")}</span>`
                  : `<span class="bibkaart__bron">${esc(b.bron || "Link")}</span>`
              }
              <span class="bibkaart__open">Openen</span>
            </a>

            <div class="bibkaart__body">
              <div class="bibkaart__top">
                <h3 class="bibkaart__titel">${esc(b.titel)}</h3>
                <button class="bibkaart__ster ${b.favoriet ? "is-on" : ""}"
                        data-bibfavo="${esc(b.id)}" title="Favoriet">★</button>
              </div>
              ${b.omschrijving ? `<p class="bibkaart__tekst">${esc(b.omschrijving)}</p>` : ""}

              <div class="bibkaart__tags">
                <span class="bibkaart__map">${esc(b.map)}</span>
                ${(b.tags || []).map((t) => `<span class="bibtag" data-bibtag="${esc(t)}">${esc(t)}</span>`).join("")}
              </div>

              <div class="bibkaart__acts">
                <a class="mini" href="${esc(b.url)}" target="_blank" rel="noopener"
                   data-bibopen="${esc(b.id)}">Openen</a>
                <button class="mini" data-bibbewerk="${esc(b.id)}">Bewerken</button>
                ${b.aantal_open ? `<span class="bibkaart__teller">${b.aantal_open}× geopend</span>` : ""}
              </div>
            </div>
          </article>`)
        .join("")}
    </div>`;
}

/* --------------------------------------------------------------------------
   Toevoegen en bewerken
   -------------------------------------------------------------------------- */

function bewerkBib(item) {
  const nieuw = !item;
  const b = item || {
    titel: "", url: "", omschrijving: "", map: "Algemeen", tags: [], favoriet: false
  };
  const mappen = [...new Set([...bib.map((x) => x.map), "Algemeen", "Tutorials",
                              "Inspiratie", "Tools", "Muziek", "Thumbnails"])].filter(Boolean).sort();
  const dlg = $("#bibvenster");

  dlg.innerHTML = `
    <div class="sheet__head">
      <div><h2>${nieuw ? "Link toevoegen" : "Bewerken"}</h2></div>
      <button class="mini" type="button" data-bibsluit="1">Sluiten</button>
    </div>

    <form class="sheet__body form" id="bibform">
      <div class="field">
        <label for="bb-url">Link</label>
        <input id="bb-url" type="url" maxlength="600" value="${esc(b.url)}"
               placeholder="https://youtu.be/…">
        <p class="field__hint" id="bb-hint"></p>
      </div>

      <div class="field">
        <label for="bb-titel">Titel</label>
        <input id="bb-titel" type="text" maxlength="200" value="${esc(b.titel)}"
               placeholder="Waar gaat het over?">
      </div>

      <div class="field">
        <label for="bb-omschrijving">Waarom bewaar je dit?</label>
        <textarea id="bb-omschrijving" rows="3" maxlength="800"
          placeholder="Bijvoorbeeld: goede uitleg over kleurcorrectie in Resolve.">${esc(b.omschrijving || "")}</textarea>
      </div>

      <div class="field">
        <label for="bb-map">Map</label>
        <input id="bb-map" type="text" maxlength="60" value="${esc(b.map)}" list="bb-mappen">
        <datalist id="bb-mappen">
          ${mappen.map((m) => `<option value="${esc(m)}">`).join("")}
        </datalist>
      </div>

      <div class="field">
        <label for="bb-tags">Tags</label>
        <input id="bb-tags" type="text" maxlength="200" value="${esc((b.tags || []).join(", "))}"
               placeholder="resolve, kleur, beginner">
      </div>

      <label class="schakel">
        <input type="checkbox" id="bb-fav" ${b.favoriet ? "checked" : ""}>
        <span class="schakel__spoor"><span class="schakel__knop"></span></span>
        <span class="schakel__tekst"><strong>Favoriet</strong></span>
      </label>

      <div class="form__note" id="bb-note" hidden></div>
    </form>

    <div class="sheet__foot">
      <button class="btn btn--fill" data-bibbewaar="${nieuw ? "nieuw" : b.id}">Opslaan</button>
      ${nieuw ? "" : `<button class="mini mini--danger" data-bibweg="${b.id}">Verwijderen</button>`}
      <button class="mini" type="button" data-bibsluit="1">Annuleren</button>
    </div>`;

  dlg.showModal();

  /* Plak je een YouTube-link, dan laten we meteen zien dat we hem herkennen. */
  const toonHint = () => {
    const u = $("#bb-url").value.trim();
    const id = videoId(u);
    const bron = bronVan(u);
    $("#bb-hint").textContent = id
      ? "YouTube-video herkend: de voorbeeldafbeelding wordt automatisch getoond."
      : bron
      ? "Bron: " + bron
      : "";
  };
  $("#bb-url").addEventListener("input", toonHint);
  toonHint();

  if (nieuw) setTimeout(() => $("#bb-url").focus(), 60);
}

/* --------------------------------------------------------------------------
   Knoppen
   -------------------------------------------------------------------------- */

$("#bib-nieuw").addEventListener("click", () => bewerkBib(null));

(function bibZoekveld() {
  const veld = $("#bib-zoek");
  const wis = $('[data-wis="bib-zoek"]');
  veld.addEventListener("input", () => {
    bibZoek = veld.value.trim();
    wis.hidden = !veld.value;
    toonBib();
  });
  wis.addEventListener("click", () => {
    veld.value = "";
    bibZoek = "";
    wis.hidden = true;
    toonBib();
    veld.focus();
  });
})();

$("#bib-filters").addEventListener("click", (e) => {
  const m = e.target.closest("[data-bibmap]");
  if (m) { bibMap = m.dataset.bibmap; bibAlleenFav = false; toonBibFilters(); toonBib(); return; }
  const f = e.target.closest("[data-bibfav]");
  if (f) { bibAlleenFav = !bibAlleenFav; bibMap = ""; toonBibFilters(); toonBib(); }
});

$("#bib-lijst").addEventListener("click", async (e) => {
  /* Op een tag klikken zoekt daarop */
  const tag = e.target.closest("[data-bibtag]");
  if (tag) {
    $("#bib-zoek").value = tag.dataset.bibtag;
    bibZoek = tag.dataset.bibtag;
    $('[data-wis="bib-zoek"]').hidden = false;
    toonBib();
    return;
  }

  const fav = e.target.closest("[data-bibfavo]");
  if (fav) {
    const b = bib.find((x) => x.id === fav.dataset.bibfavo);
    await sb.from("bibliotheek").update({ favoriet: !b.favoriet }).eq("id", b.id);
    b.favoriet = !b.favoriet;
    toonBibFilters();
    toonBib();
    return;
  }

  const bew = e.target.closest("[data-bibbewerk]");
  if (bew) { bewerkBib(bib.find((x) => x.id === bew.dataset.bibbewerk)); return; }

  /* Bijhouden hoe vaak je iets opende, zodat je ziet wat je echt gebruikt */
  const open = e.target.closest("[data-bibopen]");
  if (open) {
    const b = bib.find((x) => x.id === open.dataset.bibopen);
    if (b) {
      b.aantal_open = (b.aantal_open || 0) + 1;
      sb.from("bibliotheek")
        .update({ aantal_open: b.aantal_open, laatst_open: new Date().toISOString() })
        .eq("id", b.id)
        .then(() => {}, () => {});
    }
  }
});

$("#bibvenster").addEventListener("click", async (e) => {
  const dlg = $("#bibvenster");
  if (e.target.closest("[data-bibsluit]")) { dlg.close(); return; }

  const weg = e.target.closest("[data-bibweg]");
  if (weg) {
    if (!confirm("Deze link verwijderen?")) return;
    await sb.from("bibliotheek").delete().eq("id", weg.dataset.bibweg);
    dlg.close();
    await loadBib();
    return;
  }

  const bewaar = e.target.closest("[data-bibbewaar]");
  if (!bewaar) return;

  const note = $("#bb-note");
  const url = $("#bb-url").value.trim();
  const titel = $("#bb-titel").value.trim();

  if (!/^https?:\/\//i.test(url)) {
    note.hidden = false;
    note.className = "form__note form__note--err";
    note.textContent = "Plak een link die met https:// begint.";
    return;
  }
  if (titel.length < 2) {
    note.hidden = false;
    note.className = "form__note form__note--err";
    note.textContent = "Geef de link een titel, dan vind je hem later terug.";
    return;
  }

  const rij = {
    titel,
    url,
    omschrijving: $("#bb-omschrijving").value.trim() || null,
    map: $("#bb-map").value.trim() || "Algemeen",
    favoriet: $("#bb-fav").checked,
    tags: $("#bb-tags").value.split(",").map((t) => t.trim()).filter(Boolean),
    bron: bronVan(url),
    video_id: videoId(url)
  };

  bewaar.disabled = true;
  const id = bewaar.dataset.bibbewaar;
  const { error } =
    id === "nieuw"
      ? await sb.from("bibliotheek").insert([rij])
      : await sb.from("bibliotheek").update(rij).eq("id", id);
  bewaar.disabled = false;

  if (error) {
    note.hidden = false;
    note.className = "form__note form__note--err";
    note.textContent = "Opslaan lukte niet: " + error.message;
    return;
  }

  dlg.close();
  await loadBib();
});

sluitBijKlikNaast($("#bibvenster"));
