/* ==========================================================================
   Supabase configuratie
   --------------------------------------------------------------------------
   Deze twee waarden komen uit: Supabase dashboard -> Project Settings -> API

   LET OP bij de URL: enkel het project-adres, zonder /rest/v1/ erachter.
   De library plakt zelf het juiste pad erachter. Zet je er /rest/v1/ bij,
   dan mislukt het inloggen met een misleidende foutmelding.

   De "anon key" MAG hier staan. Dat is geen geheim en geen lek: die sleutel
   geeft op zichzelf geen toegang tot je data. De beveiliging zit in de
   Row Level Security-regels (zie supabase-setup.sql), die op de servers van
   Supabase draaien en niet omzeild kunnen worden vanuit de browser.

   Zet hier NOOIT de "service_role" key. Die geeft wel volledige toegang.
   ========================================================================== */

window.SITE_CONFIG = {
  SUPABASE_URL: "https://lugreqntoihehrojloml.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1Z3JlcW50b2loZWhyb2psb21sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyOTAzNjAsImV4cCI6MjEwMTg2NjM2MH0.JG4OGTMVQLY4bTPhEgeWD9UYyoKuDSkoerLZ1PP9uRA"
};

/* Controle: is de configuratie ingevuld en klopt de vorm van de URL? */
window.SUPABASE_READY =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(window.SITE_CONFIG.SUPABASE_URL) &&
  window.SITE_CONFIG.SUPABASE_ANON_KEY.startsWith("eyJ");

if (!window.SUPABASE_READY) {
  console.warn(
    "[JoppeDS] Supabase-configuratie klopt niet. De URL moet er zo uitzien: " +
    "https://xxxx.supabase.co (zonder /rest/v1/ erachter)."
  );
}
