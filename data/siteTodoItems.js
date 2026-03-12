export const SITE_TODO_ITEMS = [
  {
    id: "pb-email-fix",
    title: "Pixelbooth: fix email field/handling",
    area: "Pixelbooth",
    priority: "P1",
    status: "done",
    notes:
      "Email input/submit isn't correct (validation, formatting, or wiring). Fix UI + API contract and confirm it persists/gets displayed correctly. Progress update: emails are currently being sent to the user when specified, but never to Rob's email.",
    links: [{ label: "Open Pixelbooth", href: "/pixelbooth" }],
  },
  {
    id: "gb-photo-storage",
    title: "Guestbook: fix photo storage",
    area: "Guestbook",
    priority: "P1",
    status: "done",
    notes:
      "Store uploaded photos reliably (avoid huge payloads / broken persistence). Decide DB vs blob storage strategy and update API accordingly.",
    links: [{ label: "Open Guestbook", href: "/guestbook" }],
  },
  {
    id: "gb-get-endpoint",
    title: "Guestbook: fix GET pictures endpoint",
    area: "Guestbook",
    priority: "P1",
    status: "done",
    notes:
      "GET should return the correct shape, newest-first ordering, and include photo URLs/data consistently. Confirm caching headers for Vercel.",
    links: [{ label: "Open Guestbook", href: "/guestbook" }],
  },
  {
    id: "pics-move-to-db",
    title: "Pictures page: move photos to database",
    area: "Pictures",
    priority: "P1",
    status: "todo",
    notes:
      "Stop hardcoding/local-file listing for the public gallery. Store metadata in DB, load via API, and render grid from DB results.",
    links: [{ label: "Open Pictures", href: "/pictures" }],
  },
  {
    id: "game-scores-on-guestbook",
    title: "Guestbook: add game scores",
    area: "Guestbook",
    priority: "P2",
    status: "todo",
    notes:
      "Show game progress on Guestbook (UI and API) -- farm snapshot, molecule catalog progress, button clicks",
    links: [{ label: "Open Guestbook", href: "/guestbook" }],
  },
  {
    id: "reactor-page-make-all-molecules",
    title: "Reactor: track first and last time each molecule was made",
    area: "Reactor",
    priority: "P2",
    status: "done",
    notes:
      "Add API endpoints and database storage to record the first and most recent time each molecule was made. Include this shared history in everyone's catalogue.",
    links: [{ label: "Open Reactor", href: "/reactor" }],
  },
  {
    id: "reactor-page-in-mobile",
    title: "Fix Reactor page on mobile",
    area: "Reactor",
    priority: "P3",
    status: "todo",
    notes:
      "Currently the Reactor page is pretty broken on mobile (overflow, controls hard to use). Make it responsive and usable on smaller screens, or disable the page on mobile with a message. It's a bit of a niche use case but would be nice to have it work decently.",
    links: [{ label: "Open Reactor", href: "/reactor" }],
  },
  {
    id: "reactor-catalogue-api-saves",
    title: "Move Reactor catalogue to API saves",
    area: "Reactor",
    priority: "P3",
    status: "todo",
    notes:
      "Move Reactor catalogue persistence out of local/client storage and into API-backed saves so catalogue progress is stored centrally.",
    links: [{ label: "Open Reactor", href: "/reactor" }],
  },
  {
    id: "update-about-page",
    title: "About page: fill it with stuff",
    area: "About",
    priority: "P1",
    status: "done",
    notes:
      "Add content and stylize About page. Include bio, links, and whatever else seems fun. It's been a placeholder for too long. Add spotify playlist? Fix Links.",
    links: [{ label: "Open About", href: "/about" }],
  },
  {
    id: "mixtape-restore-full-spotify",
    title: "Mixtape: restore Full Spotify playlist features",
    area: "Mixtape",
    priority: "P1",
    status: "done",
    notes:
      "After Spotify allows creating a new app/client key again, re-enable and verify Full Mixtape Spotify functionality (playlist loading, lookup/search, and player flow) with live API credentials.",
    links: [{ label: "Open Mixtape", href: "/mixtape" }],
  },
  {
    id: "populate-pictures-page",
    title: "Pictures page: populate with photos",
    area: "Pictures",
    priority: "P2",
    status: "todo",
    notes:
      "Add albums/content for the Pictures page. Take and add pictures. Add Pixel art gallery? Make it easy to add new photos/albums over time. Add pictures page to Home and About, and restore it to the main header once the gallery feels substantial enough.",
    links: [{ label: "Open Pictures", href: "/pictures" }],
  },
  {
    id: "farm-multiplayer-online",
    title: "Move farm to api saves and have users play on the same farm",
    area: "Farm",
    priority: "P3",
    status: "todo",
    notes:
      "Need to add to backend-- separate endpoint for entire farm and for each user. Currently handling everything with local storage and encrypted JSON.",
    links: [{ label: "Open Farm", href: "/farm" }],
  },
  {
    id: "standardize-page-headers",
    title: "Standardize page headers",
    area: "General",
    priority: "P2",
    status: "done",
    notes:
      "Inconsistent header styles across pages. Standardize on a style for H1s and ledes, and update all pages to match for a more cohesive feel.",
  },
  {
    id: "add-packet-page",
    title: "Add Packet page",
    area: "Packet radio",
    priority: "P3",
    status: "done",
    notes:
      "Add page exhibiting live Packet tracking data from local iGate/APRS feed. Try to get a map working with real-time position updates. Could be fun and also a neat demo of live data handling.",
    links: [{ label: "Open Packets", href: "/packet" }],
  },
  {
    id: "architecture-diagrams-all-pages",
    title: "Add architecture diagrams for all pages",
    area: "General",
    priority: "P3",
    status: "todo",
    notes:
      "Create architecture diagrams across all major pages, using a consistent card/toggle pattern and per-page flow content.",
  },
  {
    id: "add-pager-page",
    title: "Add Pager page",
    area: "General",
    priority: "P3",
    status: "done",
    notes:
      "POCSAG pager flow is now implemented with a dedicated page and API wiring. FLEX and Zebra are deferred for now.",
  },
  {
    id: "add-print-postcard-functionality",
    title: "Add Postcard printing functionality to Pixelbooth",
    area: "Pixelbooth",
    priority: "P3",
    status: "todo",
    notes:
      "Add CUPS printing support to the Pixelbooth app. Users will be able to print their photos as postcards directly from the browser to a thermal printer in Rob's apartment.",
    links: [{ label: "Open Pixelbooth", href: "/pixelbooth" }],
  },
  {
    id: "auth-users-and-permissions",
    title: "Add users/auth system with permissions",
    area: "General",
    priority: "P1",
    status: "todo",
    notes:
      "Create user accounts + authentication so user saves can be stored server-side by user. Add role/permission checks for protected endpoints/features (for example: sending pager messages and future printing actions).",
  },
  {
    id: "pixelbooth-style-upgrade",
    title: "Pixelbooth: style upgrade and UI polish",
    area: "Pixelbooth",
    priority: "P4",
    status: "done",
    notes:
      "Make some design tweaks on the Pixelbooth page, including the Pixelation slider.",
    links: [{ label: "Open Pixelbooth", href: "/pixelbooth" }],
  },
  {
    id: "add-favicon",
    title: "Add Favicon",
    area: "General",
    priority: "P3",
    status: "done",
    notes: "Add a favicon to the site for better branding and user experience.",
  },
];
