/* ==========================================================================
   Formulierbouwer
   --------------------------------------------------------------------------
   Bouwt een formulier op uit de beschrijving die in de admin staat. Zowel de
   projectaanvraag als de prijsaanvraag gebruiken dit, zodat je beide op
   dezelfde manier kan aanpassen zonder aan de code te komen.
   ========================================================================== */

(function () {
  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  /* Eén veld omzetten naar HTML */
  function veldHtml(v, prefix) {
    const id = prefix + v.id;
    const ster = v.verplicht ? ' <span class="verplicht">*</span>' : "";
    const hint = v.hint ? `<p class="field__hint">${esc(v.hint)}</p>` : "";
    const ph = v.placeholder ? ` placeholder="${esc(v.placeholder)}"` : "";
    const klasse = "field" + (v.kort ? " field--kort" : "");

    let invoer;

    switch (v.type) {
      case "textarea":
        invoer = `<textarea id="${id}" data-veld="${esc(v.id)}" rows="${v.regels || 4}"
                    maxlength="4000"${ph}></textarea>`;
        break;

      case "select":
        invoer = `<select id="${id}" data-veld="${esc(v.id)}">
            <option value="">Kies…</option>
            ${(v.opties || []).map((o) => `<option>${esc(o)}</option>`).join("")}
          </select>`;
        break;

      case "vinkjes":
        return `
          <div class="field">
            <label>${esc(v.label)}${ster}</label>
            <div class="checks" data-vinkjes="${esc(v.id)}">
              ${(v.opties || [])
                .map(
                  (o) => `<label class="check">
                            <input type="checkbox" value="${esc(o)}"><span>${esc(o)}</span>
                          </label>`
                )
                .join("")}
            </div>
            ${hint}
          </div>`;

      case "number":
        invoer = `<input id="${id}" data-veld="${esc(v.id)}" type="number" min="0" max="9999"${ph}>`;
        break;

      case "date":
        invoer = `<input id="${id}" data-veld="${esc(v.id)}" type="date">`;
        break;

      default:
        invoer = `<input id="${id}" data-veld="${esc(v.id)}" type="${esc(v.type || "text")}"
                    maxlength="300"${ph}>`;
    }

    return `
      <div class="${klasse}">
        <label for="${id}">${esc(v.label)}${ster}</label>
        ${invoer}
        ${hint}
      </div>`;
  }

  /* Velden die naast elkaar mogen staan, samen in een rij zetten */
  function groepHtml(groep, nr, prefix, toonNummers) {
    const velden = groep.velden || [];
    const stukken = [];

    for (let i = 0; i < velden.length; i++) {
      const v = velden[i];
      const volgende = velden[i + 1];

      if (v.half && volgende && volgende.half) {
        stukken.push(
          `<div class="form__row">${veldHtml(v, prefix)}${veldHtml(volgende, prefix)}</div>`
        );
        i++;
      } else {
        stukken.push(veldHtml(v, prefix));
      }
    }

    const kop = groep.titel
      ? `<h2 class="fset__kop" id="${prefix}grp${nr}">
           ${toonNummers ? `<span class="fset__nr">${String(nr).padStart(2, "0")}</span>` : ""}
           ${esc(groep.titel)}
         </h2>`
      : "";

    return `
      <div class="fset" ${groep.titel ? `role="group" aria-labelledby="${prefix}grp${nr}"` : ""}>
        ${kop}
        ${stukken.join("")}
      </div>`;
  }

  /* Het volledige formulier opbouwen in een element */
  window.bouwFormulier = function (doel, def, opties = {}) {
    const prefix = opties.prefix || "f-";
    const groepen = def.groepen || [];
    doel.innerHTML = groepen
      .map((g, i) => groepHtml(g, i + 1, prefix, opties.nummers !== false))
      .join("");
  };

  /* De ingevulde waarden uitlezen.
     Naast de losse waarden komt er een lijst met label en antwoord mee, zodat
     de admin later precies ziet wat er gevraagd werd, ook als je het
     formulier daarna nog aanpast. */
  window.leesFormulier = function (doel, def, prefix = "f-") {
    const uit = {};
    const overzicht = [];

    (def.groepen || []).forEach((g) => {
      (g.velden || []).forEach((v) => {
        let waarde;

        if (v.type === "vinkjes") {
          const vak = doel.querySelector(`[data-vinkjes="${CSS.escape(v.id)}"]`);
          waarde = vak
            ? Array.from(vak.querySelectorAll("input:checked")).map((c) => c.value)
            : [];
        } else {
          const el = doel.querySelector(`#${CSS.escape(prefix + v.id)}`);
          waarde = el ? el.value.trim() : "";
        }

        uit[v.id] = waarde;

        const leeg = Array.isArray(waarde) ? !waarde.length : !waarde;
        if (!leeg) {
          overzicht.push({
            label: v.label,
            waarde: Array.isArray(waarde) ? waarde.join(", ") : waarde
          });
        }
      });
    });

    uit._velden = overzicht;
    return uit;
  };

  /* Controleren of alles wat verplicht is ingevuld is */
  window.controleerFormulier = function (waarden, def) {
    const mist = [];

    (def.groepen || []).forEach((g) => {
      (g.velden || []).forEach((v) => {
        if (!v.verplicht) return;
        const w = waarden[v.id];
        const leeg = Array.isArray(w) ? !w.length : !String(w || "").trim();
        if (leeg) mist.push(v.label.toLowerCase());
      });
    });

    if (waarden.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(waarden.email)) {
      mist.push("een geldig e-mailadres");
    }
    if (waarden.beschrijving && waarden.beschrijving.length < 10) {
      mist.push("een beschrijving van minstens 10 tekens");
    }

    return mist;
  };
})();
