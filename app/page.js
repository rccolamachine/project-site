import Image from "next/image";
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
      {
        title: "Mixtape",
        description:
          "New: Songs that are in my head when I wake up in the morning. Play a mixtape from my past.",
        href: "/mixtape",
        cta: "Hear the voices",
      },
      {
        title: "Pager",
        description:
          "New: 07734! Page Rob, like it was the 90s. Only over the internet.",
        href: "/pager",
        cta: "Bleep Bleep",
      },
      {
        title: "Packets",
        description: "New: Track Rob's radios via APRS.",
        href: "/packet",
        cta: "Follow Rob",
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

function renderDescriptionWithNewBadge(description) {
  const marker = "New:";
  const idx = description.indexOf(marker);
  if (idx < 0) return description;
  const before = description.slice(0, idx).trimEnd();
  const after = description.slice(idx + marker.length).trimStart();
  return (
    <>
      {before ? (
        <>
          {before}
          <br />
        </>
      ) : null}
      <span className="ui-badgeNew">NEW</span> {after}
    </>
  );
}

export default function Home() {
  return (
    <section className="page">
      <header className="homeHero">
        <div className="homeHeroCopy">
          <h1>Hi, I&apos;m Rob.</h1>
          <p className="lede">
            Personal site for photos, projects, and whatever I&apos;m building
            next.
          </p>
        </div>
        <div className="homeHeroArt" aria-hidden="true">
          <Image
            src="/brand/pixel-rob.png"
            alt=""
            className="homeHeroAvatar"
            width={144}
            height={144}
            priority
          />
        </div>
      </header>

      {sections.map((section) => (
        <div key={section.title} className="homeSectionPanel">
          <div className="homeSectionHeader">
            <h2 className="homeSectionTitle">{section.title}</h2>
            {section.title === "Play" ? <DesktopBadge small /> : null}
          </div>
          <div className="cardRow">
            {section.cards.map((card) => (
              <div className="card" key={card.title}>
                <h2>{card.title}</h2>
                <p>{renderDescriptionWithNewBadge(card.description)}</p>
                <Link
                  className="btn"
                  href={card.href}
                  prefetch={
                    card.href === "/reactor" || card.href === "/farm"
                      ? false
                      : undefined
                  }
                >
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
