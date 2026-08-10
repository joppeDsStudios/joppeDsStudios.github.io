/* ==========================================================================
   Standaardinhoud
   --------------------------------------------------------------------------
   Dit is de inhoud waarmee de site draait zolang er nog niets in Supabase
   staat. Zodra je iets opslaat via de admin-pagina, wordt dit overschreven
   door de versie uit de database.
   ========================================================================== */

window.DEFAULT_CONTENT = {
  hero: {
    studio: "JoppeDS Studio's",
    kicker: "Content creation studio",
    titel: "JoppeDS Studio's",
    ondertitel:
      "Video, livestreams en thumbnails. Van eerste opname tot laatste render.",
    knop1: "Bekijk mijn werk",
    knop2: "Neem contact op"
  },

  stats: [
    { label: "Abonnees", value: "1.39K", prefix: "+" },
    { label: "Weergaven", value: "500.7K", prefix: "+" },
    { label: "Kijkuren", value: "4.2K", prefix: "+" }
  ],

  over: {
    titel: "Over mij",
    tekst:
      "Ik ben Joppe. Mijn passie is content creation.\n\nIk ben 14 jaar en werk intussen 3 jaar met DaVinci Resolve. Wat begon als een Minecraft-kanaal groeide uit tot JoppeDS Studio's: video's, livestreams met multi-cam en green screen, en thumbnail design.",
    feiten: [
      { label: "Leeftijd", value: "14 jaar" },
      { label: "DaVinci Resolve", value: "3 jaar ervaring" },
      { label: "Basis", value: "Kortrijk, België" }
    ],
    foto: ""
  },

  projecten: [
    {
      titel: "YouTube Kanaal",
      type: "Kanaal",
      beschrijving:
        "JoppeDS is mijn Minecraft YouTube kanaal. Hierop post ik zowel long-form als short-form content, en ook live streams.",
      stats: ["+1.39K abonnees", "+500.7K weergaven", "+4.2K kijkuren"],
      link: "https://www.youtube.com/@JoppeDS",
      linkLabel: "Open kanaal",
      afbeelding: "",
      slug: "youtube-kanaal"
    },
    {
      titel: "Podcast",
      type: "Minecraft",
      beschrijving:
        "Een video-podcast over de nieuwste update van Minecraft. Opgenomen met meerdere camera's en volledig zelf gemonteerd.",
      stats: ["+1.4K weergaven", "+50 kijkuren"],
      link: "https://youtu.be/U1b25fVeWHA",
      linkLabel: "Bekijk podcast",
      afbeelding: "",
      slug: "podcast"
    },
    {
      titel: "Live Talkshow",
      type: "Minecraft",
      beschrijving:
        "Een live talkshow over Minecraft, met live multi-cam, live green screen, live overlays en live widgets.",
      stats: ["+240 weergaven", "14 kijkuren"],
      link: "https://www.youtube.com/live/tKQonOO1juE",
      linkLabel: "Bekijk talkshow",
      afbeelding: "",
      slug: "talkshow"
    },
    {
      titel: "Promotievideo's",
      type: "In opdracht",
      beschrijving:
        "Promotievideo's gemaakt voor Warande Kortrijk, Textuur Kortrijk, FAS Luchtvaartmuseum en Amba Amba.",
      stats: ["Warande Kortrijk", "Textuur Kortrijk", "FAS Luchtvaartmuseum", "Amba Amba"],
      link: "",
      linkLabel: "",
      afbeelding: "",
      slug: "promo"
    },
    {
      titel: "Thumbnail design",
      type: "Design",
      beschrijving:
        "Thumbnail design voor YouTube, zowel gaming als real-life content. Gespecialiseerd in Minecraft thumbnails.",
      stats: ["Gaming", "Real-life", "Minecraft"],
      link: "",
      linkLabel: "",
      afbeelding: "",
      slug: "thumbnails"
    }
  ],

  reviews: [
    {
      naam: "Voeg je eerste review toe",
      rol: "Via de admin, tabblad Inhoud",
      sterren: 5,
      tekst:
        "Deze sectie verdwijnt automatisch van de site zolang er geen reviews zijn. Vul er één in en ze verschijnt vanzelf."
    }
  ],

  opleidingen: [
    { titel: "Masterclass Audio", instituut: "Quindo" },
    { titel: "Masterclass Live Streaming", instituut: "Quindo" },
    { titel: "Masterclass Green Screen", instituut: "Quindo" }
  ],

  contact: {
    titel: "Neem contact op",
    tekst:
      "Een video nodig, een livestream te regelen of gewoon een vraag? Laat hieronder een bericht achter, ik antwoord zo snel mogelijk.",
    knop: "Verstuur bericht",
    bedankt: "Bedankt. Je bericht is verstuurd, ik neem snel contact op."
  },

  footer: {
    tekst: "JoppeDS Studio's",
    socials: [{ label: "YouTube", url: "https://www.youtube.com/@JoppeDS" }]
  }
};

/* ==========================================================================
   Supabase helper
   ========================================================================== */

window.getSupabase = function () {
  if (!window.SUPABASE_READY || !window.supabase) return null;
  if (!window._sbClient) {
    window._sbClient = window.supabase.createClient(
      window.SITE_CONFIG.SUPABASE_URL,
      window.SITE_CONFIG.SUPABASE_ANON_KEY
    );
  }
  return window._sbClient;
};

/* Haalt de inhoud op uit Supabase. Lukt dat niet, dan valt de site terug op
   de standaardinhoud hierboven, zodat de pagina nooit leeg blijft. */
window.loadContent = async function () {
  const fallback = JSON.parse(JSON.stringify(window.DEFAULT_CONTENT));
  const sb = window.getSupabase();
  if (!sb) return fallback;

  try {
    const { data, error } = await sb
      .from("site_content")
      .select("data")
      .eq("id", 1)
      .single();
    if (error || !data || !data.data) return fallback;
    return Object.assign(fallback, data.data);
  } catch (e) {
    return fallback;
  }
};
