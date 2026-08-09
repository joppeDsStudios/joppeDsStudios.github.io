/* ==========================================================================
   Bezoekersteller
   --------------------------------------------------------------------------
   Registreert per paginabezoek één regel in Supabase.

   Bewust NIET opgeslagen: IP-adres, naam, e-mailadres, of iets anders
   waarmee iemand herkend kan worden. Er wordt ook geen cookie gezet.
   Daardoor is er geen cookiebanner nodig en blijft dit binnen de GDPR.

   Wel opgeslagen: welke pagina, waar de bezoeker vandaan kwam, het soort
   toestel, de taal van de browser, en een willekeurig sessienummer dat
   verdwijnt zodra het tabblad sluit.
   ========================================================================== */

(function () {
  const sb = window.getSupabase();
  if (!sb) return;

  /* Niet meten tijdens lokaal testen */
  const host = location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "") return;

  /* Respecteer "Do Not Track" */
  if (navigator.doNotTrack === "1" || window.doNotTrack === "1") return;

  /* Sessienummer: leeft alleen zolang dit tabblad open staat */
  let sid = sessionStorage.getItem("jds_sid");
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("jds_sid", sid);
  }

  const breedte = window.innerWidth;
  const toestel = breedte < 640 ? "telefoon" : breedte < 1024 ? "tablet" : "computer";

  /* Alleen de herkomstsite, niet de volledige link */
  let bron = "direct";
  if (document.referrer) {
    try {
      const u = new URL(document.referrer);
      if (u.hostname !== location.hostname) bron = u.hostname.replace(/^www\./, "");
    } catch (e) { /* ongeldige referrer, laat op direct staan */ }
  }

  const rij = {
    sessie: sid,
    pagina: location.pathname.split("/").pop() || "index.html",
    bron: bron,
    toestel: toestel,
    taal: (navigator.language || "").slice(0, 5)
  };

  /* Stil versturen. Lukt het niet, dan merkt de bezoeker daar niets van. */
  sb.from("pageviews").insert([rij]).then(
    () => {},
    () => {}
  );
})();
