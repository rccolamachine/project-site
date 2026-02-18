import Link from "next/link";
import DesktopBadge from "../components/DesktopBadge";

const sections = [
  {
    title: "Play",
    cards: [
      {
        title: "Farm Idle",
        description:
          "Grow a farm, water on schedule, and optimize harvest timing for profit. Addictive!",
        href: "/farm",
        cta: "Start farming",
      },
      {
        title: "Pixelbooth",
        description: "Take and make pixel art from your webcam.",
        href: "/pixelbooth",
        cta: "Let's get snapping",
      },
      {
        title: "Reactor",
        description:
          "Fun little molecular modeling sandbox: throw some atoms into a box, change the conditions and the physics, and watch matter change. New: can you synthesize the molecules in the catalogue?",
        href: "/reactor",
        cta: "Do computational chemistry",
      },
      {
        title: "Button MMORPG",
        description:
          "Click the button for everyone. Or reset it and reveal your shame.",
        href: "/button",
        cta: "Play now",
      },
    ],
  },
  {
    title: "Learn",
    cards: [
      {
        title: "About",
        description: "Short bio + links. More to come!",
        href: "/about",
        cta: "Read more",
      },
      {
        title: "Guestbook",
        description: "Drop a note and see what visitors have been saying.",
        href: "/guestbook",
        cta: "View guestbook",
      },
      {
        title: "Resume",
        description: "Rob's experience, projects, and the printable version.",
        href: "/resume",
        cta: "View resume",
      },
      {
        title: "To-Do",
        description:
          "Always fixing. Always building. Track what's shipping next.",
        href: "/todo",
        cta: "See roadmap",
      },
    ],
  },
];

const newBadgeStyle = {
  display: "inline-block",
  margin: "0 6px 0 2px",
  padding: "1px 7px",
  borderRadius: 999,
  border: "1px solid rgba(255, 207, 92, 0.55)",
  background: "rgba(52, 36, 16, 0.58)",
  color: "#ffe4a8",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.3,
  lineHeight: 1.25,
  verticalAlign: "baseline",
};

function renderDescriptionWithNewBadge(description) {
  const marker = "New:";
  const idx = description.indexOf(marker);
  if (idx < 0) return description;
  const before = description.slice(0, idx).trimEnd();
  const after = description.slice(idx + marker.length).trimStart();
  return (
    <>
      {before}
      <br />
      <span style={newBadgeStyle}>NEW</span> {after}
    </>
  );
}

export default function Home() {
  const sectionPanelStyle = {
    marginTop: 16,
    padding: 16,
    borderRadius: 18,
    border: "1px solid var(--line)",
    background:
      "linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.02))",
    boxShadow: "var(--shadow)",
  };

  return (
    <section className="page">
      <header style={{ marginBottom: 16 }}>
        <h1>Hi, I&apos;m Rob.</h1>
        <p className="lede">
          Personal site for photos, projects, and whatever I&apos;m building
          next.
        </p>
      </header>

      {sections.map((section) => (
        <div key={section.title} style={sectionPanelStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ margin: 0 }}>{section.title}</h2>
            {section.title === "Play" ? <DesktopBadge small /> : null}
          </div>
          <div className="cardRow">
            {section.cards.map((card) => (
              <div className="card" key={card.title}>
                <h2>{card.title}</h2>
                <p>{renderDescriptionWithNewBadge(card.description)}</p>
                <Link className="btn" href={card.href}>
                  {card.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
