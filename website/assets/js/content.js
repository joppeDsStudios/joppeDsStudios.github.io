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

  team: {
    titel: "Het team",
    tekst: "De mensen achter JoppeDS Studio's.",
    leden: []
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

  prijzen: {
    zichtbaar: false,
    titel: "Wat het kost",
    tekst:
      "Elk project is anders, dus dit zijn richtprijzen. Vertel me wat je in gedachten hebt en ik maak een voorstel op maat.",
    voetnoot: "Alle prijzen zijn richtprijzen. Voor scholen en verenigingen kijk ik graag wat mogelijk is.",
    pakketten: [
      {
        naam: "Short-form",
        prijs: "€ 75",
        eenheid: "per video",
        beschrijving: "Een korte video voor Shorts, Reels of TikTok.",
        punten: ["Tot 60 seconden", "Montage en ondertiteling", "Eén ronde feedback"],
        uitgelicht: false
      },
      {
        naam: "Long-form",
        prijs: "€ 250",
        eenheid: "vanaf",
        beschrijving: "Een volwaardige video voor YouTube of je website.",
        punten: [
          "Tot 10 minuten",
          "Kleurcorrectie en geluidsmix",
          "Thumbnail inbegrepen",
          "Twee rondes feedback"
        ],
        uitgelicht: true
      },
      {
        naam: "Livestream",
        prijs: "Op aanvraag",
        eenheid: "",
        beschrijving: "Multi-cam livestream met overlays en green screen.",
        punten: ["Meerdere camera's", "Live overlays en widgets", "Opname achteraf"],
        uitgelicht: false
      }
    ]
  },

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
    ondertitel: "Create. Analyze. Improve. Repeat.",
    copyright: "Alle rechten voorbehouden.",
    kopSocials: "Volg mij",
    kopLinks: "Snel naar",
    socials: [{ label: "YouTube", url: "https://www.youtube.com/@JoppeDS" }],
    links: [
      { label: "Contact", url: "#contact" },
      { label: "Projecten", url: "#projecten" }
    ],
    toonReviewknop: true,
    toonAdminlink: true
  },

  /* ------------------------------------------------------------------------
     Formulieren
     ------------------------------------------------------------------------
     Beide formulieren worden opgebouwd uit onderstaande beschrijving. Pas je
     hier iets aan in de admin, dan verandert het formulier op de site mee.

     Velden met "vast: true" mogen niet verwijderd worden: de database heeft
     ze nodig om te weten wie er aanvraagt en waarover het gaat. De tekst
     erop mag je wel vrij aanpassen.
     ------------------------------------------------------------------------ */
  formulieren: {
    projectaanvraag: {
      kop: "Vertel me over je project",
      tekst:
        "Hoe vollediger je dit invult, hoe scherper ik kan inschatten wat er nodig is. Weet je iets nog niet? Laat het gerust leeg.",
      knop: "Aanvraag indienen",
      voetnoot: "Je kan dit maar één keer indienen met deze code.",
      bedankt:
        "Bedankt. Ik bekijk je aanvraag en neem contact op via het e-mailadres dat je opgaf.",
      groepen: [
        {
          titel: "Jouw gegevens",
          velden: [
            { id: "naam", label: "Naam", type: "text", verplicht: true, half: true, vast: true },
            { id: "email", label: "E-mailadres", type: "email", verplicht: true, half: true, vast: true },
            { id: "bedrijf", label: "Bedrijf of kanaal", type: "text", half: true, placeholder: "Optioneel" },
            { id: "telefoon", label: "Telefoonnummer", type: "tel", half: true, placeholder: "Optioneel" }
          ]
        },
        {
          titel: "Het project",
          velden: [
            { id: "titel", label: "Titel", type: "text", verplicht: true, vast: true,
              placeholder: "Bijvoorbeeld: Aftermovie zomerfestival" },
            { id: "beschrijving", label: "Wat wil je precies laten maken? Wie is je doelgroep?",
              type: "textarea", verplicht: true, vast: true, regels: 6,
              placeholder: "Beschrijf het idee, de boodschap en voor wie het bedoeld is." },
            { id: "doel", label: "Wat moet het opleveren?", type: "select",
              opties: ["Meer naamsbekendheid", "Meer verkoop of inschrijvingen", "Entertainment",
                       "Informeren of uitleggen", "Sfeerbeeld of herinnering", "Iets anders"] }
          ]
        },
        {
          titel: "Vorm en platform",
          velden: [
            { id: "formaat", label: "Soort content", type: "select", half: true,
              opties: ["Long-form", "Short-form", "Long-form én short-form", "Livestream",
                       "Thumbnail design", "Iets anders"] },
            { id: "lengte", label: "Gewenste lengte", type: "text", half: true,
              placeholder: "Bijvoorbeeld: 8 à 10 minuten" },
            { id: "platform", label: "Platform", type: "vinkjes",
              opties: ["YouTube", "TikTok", "Instagram", "Facebook", "Twitch", "LinkedIn",
                       "Eigen website", "Intern gebruik"] },
            { id: "aantal", label: "Hoeveel video's?", type: "number", kort: true, placeholder: "1" }
          ]
        },
        {
          titel: "Stijl",
          velden: [
            { id: "stijl", label: "Welke richting zie je voor je?", type: "vinkjes",
              opties: ["Cinematisch", "Snel en energiek", "Rustig en informatief", "Gaming",
                       "Vlog", "Documentair", "Humoristisch", "Zakelijk"] },
            { id: "referenties", label: "Voorbeelden die je aanspreken", type: "textarea", regels: 3,
              placeholder: "Plak hier links naar video's met een stijl die je goed vindt." }
          ]
        },
        {
          titel: "Praktisch",
          velden: [
            { id: "budget", label: "Budget", type: "select", half: true,
              opties: ["Minder dan € 100", "€ 100 – € 250", "€ 250 – € 500", "€ 500 – € 1000",
                       "Meer dan € 1000", "Nog te bespreken"] },
            { id: "deadline", label: "Wanneer heb je het nodig?", type: "date", half: true },
            { id: "drive", label: "Link naar je bestanden", type: "url",
              placeholder: "https://drive.google.com/…",
              hint: "Zet je beeldmateriaal, logo's en muziek in een Google Drive-map en zet die op \"iedereen met de link kan bekijken\"." },
            { id: "assets", label: "Wat zit er in die map?", type: "textarea", regels: 3,
              placeholder: "Bijvoorbeeld: 40 minuten ruwe beelden, logo in SVG, twee muzieknummers." }
          ]
        },
        {
          titel: "Nog iets kwijt?",
          velden: [
            { id: "extra", label: "Extra informatie", type: "textarea", regels: 4,
              placeholder: "Alles wat ik verder moet weten." }
          ]
        }
      ]
    },

    prijsaanvraag: {
      kop: "Vraag dit pakket aan",
      tekst:
        "Vul kort in wat je nodig hebt, dan bezorg ik je een voorstel op maat. Je zit nergens aan vast.",
      knop: "Aanvraag versturen",
      voetnoot: "Je krijgt een antwoord op het e-mailadres dat je opgeeft.",
      bedankt: "Bedankt. Ik bekijk je aanvraag en neem snel contact op.",
      groepen: [
        {
          titel: "",
          velden: [
            { id: "pakket", label: "Welk pakket?", type: "select", vast: true, opties: [] },
            { id: "naam", label: "Naam", type: "text", verplicht: true, half: true, vast: true },
            { id: "email", label: "E-mailadres", type: "email", verplicht: true, half: true, vast: true },
            { id: "telefoon", label: "Telefoonnummer", type: "tel", half: true, placeholder: "Optioneel" },
            { id: "deadline", label: "Wanneer heb je het nodig?", type: "date", half: true },
            { id: "beschrijving", label: "Waarover gaat het?", type: "textarea", verplicht: true,
              vast: true, regels: 5,
              placeholder: "Vertel kort wat je wil laten maken en voor wie het bedoeld is." }
          ]
        }
      ]
    }
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
