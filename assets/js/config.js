/* ==========================================================================
   Supabase configuratie
   --------------------------------------------------------------------------
   Vul hieronder de twee waarden in uit je Supabase-project:
   Supabase dashboard -> Project Settings -> API

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

/* Zolang bovenstaande niet ingevuld is, draait de site op de standaardinhoud
   uit content.js en toont het contactformulier een nette foutmelding. */
window.SUPABASE_READY =
  !window.SITE_CONFIG.SUPABASE_URL.includes("JOUW-PROJECT") &&
  !window.SITE_CONFIG.SUPABASE_ANON_KEY.includes("JOUW-ANON-KEY");
