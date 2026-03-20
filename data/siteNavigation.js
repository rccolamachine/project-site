const ROUTE_CATALOG = [
  {
    href: "/",
    label: "Home",
    nav: true,
    sitemap: true,
  },
  {
    href: "/farm",
    label: "Farm",
    nav: true,
    sitemap: true,
    home: {
      section: "Play",
      title: "Farm Idle",
      description: "Grow a farm, sell your crops, buy a house. Addictive!",
      cta: "Start farming",
    },
    about: {
      title: "Farm Idle Sim",
      desc: "A quiet loop where numbers slowly go up.",
    },
  },
  {
    href: "/pixelbooth",
    label: "Pixelbooth",
    nav: true,
    sitemap: true,
    home: {
      section: "Play",
      title: "Pixelbooth",
      description: "Take and make pixel art from your webcam.",
      cta: "Let's get snapping",
    },
    about: {
      title: "Pixelbooth",
      desc: "Camera to canvas to pixel grid.",
    },
  },
  {
    href: "/reactor",
    label: "Reactor",
    nav: true,
    sitemap: true,
    home: {
      section: "Play",
      title: "Reactor",
      description:
        "Chemical sandbox: throw some atoms into a box, change the conditions, and watch matter change. Can you synthesize the molecules in the catalogue? New: build your own automation flow!",
      cta: "Do computational chemistry",
    },
    about: {
      title: "Molecular Reactor",
      desc: "Atoms, controls, and curiosity in a box.",
    },
  },
  {
    href: "/button",
    label: "Button",
    nav: true,
    sitemap: true,
    home: {
      section: "Play",
      title: "Button MMORPG",
      description:
        "Click the button for everyone. Or reset it and reveal your shame.",
      cta: "Play now",
    },
    about: {
      title: "Button MMORPG",
      desc: "A strange shared counter experiment.",
    },
  },
  {
    href: "/mixtape",
    label: "Mixtape",
    nav: true,
    sitemap: true,
    home: {
      section: "Play",
      title: "Mixtape",
      description:
        "New: Songs that are in my head when I wake up in the morning. Play a mixtape from my past.",
      cta: "Hear the voices",
    },
    about: {
      title: "Mixtape",
      desc: "Wake-up songs and throwback playlists.",
    },
  },
  {
    href: "/pager",
    label: "Pager",
    nav: true,
    sitemap: true,
    home: {
      section: "Play",
      title: "Pager",
      description: "New: 07734! Page Rob, like it was the 90s. Only over the internet.",
      cta: "Bleep Bleep",
    },
    about: {
      title: "Pager",
      desc: "Page Rob like it is the 90s.",
    },
  },
  {
    href: "/packet",
    label: "Packets",
    nav: true,
    sitemap: true,
    home: {
      section: "Play",
      title: "Packets",
      description: "New: Track Rob's radios via APRS.",
      cta: "Follow Rob",
    },
    about: {
      title: "Packets",
      desc: "Live APRS packet radio tracking.",
    },
  },
  {
    href: "/about",
    label: "About",
    nav: true,
    sitemap: true,
    home: {
      section: "Learn",
      title: "About",
      description:
        "Systems builder, QA engineer, and computational chemist.",
      cta: "Read more",
    },
    about: {
      title: "About",
      desc: "Who I am and how I think about systems.",
    },
  },
  {
    href: "/guestbook",
    label: "Guestbook",
    nav: true,
    sitemap: true,
    home: {
      section: "Learn",
      title: "Guestbook",
      description: "Drop a note and see what visitors have been saying.",
      cta: "View guestbook",
    },
    about: {
      title: "Guestbook",
      desc: "Saved Pixelbooth snaps and messages.",
    },
  },
  {
    href: "/resume",
    label: "Resume",
    nav: true,
    sitemap: true,
    home: {
      section: "Learn",
      title: "Resume",
      description: "Rob's experience, projects, and the printable version.",
      cta: "View resume",
    },
    about: {
      title: "Resume",
      desc: "Professional details and work history.",
    },
  },
  {
    href: "/publications",
    label: "Publications",
    nav: true,
    sitemap: true,
    home: {
      section: "Learn",
      title: "Publications",
      description:
        "New: Research papers, citations, and links to Rob's published work.",
      cta: "Browse publications",
    },
    about: {
      title: "Publications",
      desc: "Research papers and source links.",
    },
  },
  {
    href: "/todo",
    label: "To-Do",
    nav: true,
    sitemap: true,
    home: {
      section: "Learn",
      title: "To-Do",
      description: "Always fixing. Always building. Track what's shipping next.",
      cta: "See roadmap",
    },
    about: {
      title: "To-Do",
      desc: "Roadmap, fixes, and what is next.",
    },
  },
  {
    href: "/pictures",
    label: "Pictures",
    nav: false,
    sitemap: true,
    about: {
      title: "Pictures",
      desc: "A small gallery for photo drops.",
    },
  },
];

const HOME_SECTION_META = {
  Play: {
    iconPath: "/brand/play-slide.png",
    showDesktopBadge: true,
  },
  Learn: {
    iconPath: "/brand/learn-school.png",
    showDesktopBadge: false,
  },
};

const HOME_SECTION_ORDER = ["Play", "Learn"];

export const HEADER_NAV_LINKS = ROUTE_CATALOG.filter((route) => route.nav).map(
  ({ href, label }) => ({ href, label }),
);

export const SITEMAP_PATHS = ROUTE_CATALOG.filter((route) => route.sitemap).map(
  (route) => route.href,
);

export const ABOUT_INTERNAL_LINKS = ROUTE_CATALOG.filter(
  (route) => route.about && route.href !== "/about",
).map((route) => ({
  title: route.about.title,
  href: route.href,
  desc: route.about.desc,
}));

export const HOME_SECTIONS = HOME_SECTION_ORDER.map((sectionName) => ({
  title: sectionName,
  ...HOME_SECTION_META[sectionName],
  cards: ROUTE_CATALOG.filter((route) => route.home?.section === sectionName).map(
    (route) => ({
      title: route.home.title,
      description: route.home.description,
      href: route.href,
      cta: route.home.cta,
    }),
  ),
}));
