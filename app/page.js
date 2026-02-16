import Link from "next/link";

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
        title: "Photobooth",
        description: "Live camera view in a canvas.",
        href: "/photobooth",
        cta: "Launch booth",
      },
      {
        title: "Reactor",
        description:
          "Fun little molecular modeling sandbox: throw some atoms into a box, change the conditions and the physics, and watch matter change.",
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
    title: "Info",
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
        cta: "Sign guestbook",
      },
      {
        title: "Resume",
        description: "Experience, projects, and the printable version.",
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

export default function Home() {
  return (
    <section className="page">
      <h1>Hi, I&apos;m Rob.</h1>
      <p className="lede">
        Personal site for photos, projects, and whatever I&apos;m building next.
      </p>

      {sections.map((section) => (
        <div key={section.title}>
          <h2>{section.title}</h2>
          <div className="cardRow">
            {section.cards.map((card) => (
              <div className="card" key={card.title}>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
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
