import "./about.css";
import Link from "next/link";

export const metadata = {
  title: "About · rccolamachine",
  description:
    "About Rob — systems thinker, builder, and fan of simple rules creating surprising order.",
};

const INTERNAL_LINKS = [
  {
    title: "Farm Idle Sim",
    href: "/farm",
    desc: "A quiet loop where numbers slowly go up.",
  },
  {
    title: "Molecular Reactor",
    href: "/reactor",
    desc: "Atoms, sliders, and curiosity in a box.",
  },
  {
    title: "Button MMORPG",
    href: "/button",
    desc: "A strange shared counter experiment.",
  },
  {
    title: "Pixelbooth",
    href: "/pixelbooth",
    desc: "Camera → canvas → pixel grid.",
  },
  {
    title: "Guestbook",
    href: "/guestbook",
    desc: "Snapshots from the pixel booth.",
  },

  {
    title: "Resume",
    href: "/resume",
    desc: "Professional details and work history.",
  },
];

const EXTERNAL_LINKS = [
  {
    label: "GitHub",
    value: "github.com/rccolamachine",
    href: "https://github.com/rccolamachine",
    note: "Code + experiments",
  },
  {
    label: "LinkedIn",
    value: "linkedin.com/in/robert-chapleski",
    href: "https://www.linkedin.com/in/robert-chapleski",
    note: "Career timeline",
  },
  {
    label: "MySite",
    value: "rccolamachine.com",
    href: "https://rccolamachine.com",
    note: "You are here",
  },
  {
    label: "EmailMe",
    value: "robert.chapleski@gmail.com",
    href: "mailto:robert.chapleski@gmail.com",
    note: "Direct contact",
  },
];

export default function AboutPage() {
  return (
    <section className="page">
      <header className="aboutHeader">
        <h1>About</h1>
        <p className="lede">
          I’m Rob. I like building small systems that feel complete.
          <span className="aboutLedeBreak">
            This site is where I experiment, tinker, and occasionally
            over-engineer things for fun.
          </span>
        </p>
      </header>

      <div className="aboutGrid">
        {/* Who I Am */}
        <div className="card aboutCard">
          <h2>Who I am</h2>

          <p className="aboutTight">
            I’m drawn to emergence — when simple rules create behavior that
            feels bigger than the parts. It’s the same vibe as temperature
            emerging from chaotic molecular motion, or a system suddenly
            “clicking” into something coherent.
          </p>

          <p className="aboutTight">
            That’s why I like making interactive things. If I can turn an idea
            into something you can poke, observe, and iterate on, it gets
            clearer fast. I learn best by doing — and usually by getting stuck
            for a while first.
          </p>

          <p className="aboutTight">
            rccolamachine is my sandbox for that: playful on the surface,
            structured underneath. (Sometimes it even feels like a salmon lox
            bagel: ingredients that shouldn’t work together somehow becoming a
            perfect whole.)
          </p>

          <div className="aboutButtons">
            <Link className="btn" href="/reactor">
              Reactor
            </Link>
            <Link className="btn" href="/farm">
              Farm Sim
            </Link>
            <Link className="btn" href="/pixelbooth">
              Pixelbooth
            </Link>
          </div>
        </div>

        {/* Why QA */}
        <div className="card aboutCard">
          <h2>Why QA?</h2>

          <p className="aboutTight">
            I spent years doing computational chemistry research, modeling
            reactive systems like the breakdown of chemical warfare agents and
            the formation of buckyballs.
          </p>

          <p className="aboutTight">
            I genuinely loved the science — especially the elegance of simple
            physical rules giving rise to complex, coherent behavior. I’m drawn
            to emergence: temperature from chaotic molecular motion, structure
            from randomness, systems that make more sense together than they do
            apart.
          </p>

          <p className="aboutTight">
            Along the way, I realized that what excited me most wasn’t just the
            chemistry itself, but the logic and computational systems behind it:
            writing code, building simulations, designing experiments that could
            be reproduced and trusted.
          </p>

          <p className="aboutTight">
            I also found that I enjoyed explaining those systems — mentoring
            teammates, breaking down complicated ideas, and helping people see
            how the pieces fit together.
          </p>

          <p className="aboutTight">
            Moving into quality engineering felt less like leaving science and
            more like applying the same mindset in a different environment. I
            still build structured systems and reliable feedback loops — just in
            software instead of molecular dynamics and quantum mechanics.
          </p>

          <p className="aboutTight">
            Science is still something I explore, but now it’s driven by
            curiosity rather than obligation.
          </p>

          <div className="aboutButtons">
            <Link className="btn" href="/resume">
              Resume
            </Link>
            <Link className="btn" href="/guestbook">
              Guestbook
            </Link>
            <Link className="btn" href="/pictures">
              Pictures
            </Link>
          </div>
        </div>

        {/* How I Think */}
        <div className="card aboutCard aboutWide">
          <h2>How I think</h2>

          <ul className="aboutList">
            <li>
              <strong>I trust feedback.</strong>
              <span> Systems should tell you what they’re doing.</span>
            </li>
            <li>
              <strong>I prefer reproducibility over cleverness.</strong>
              <span> If it works once, it should work again.</span>
            </li>
            <li>
              <strong>I learn by building.</strong>
              <span>
                {" "}
                Turning an idea into something interactive forces clarity.
              </span>
            </li>
            <li>
              <strong>The path to learning is through frustration.</strong>
              <span>
                {" "}
                When you find something difficult, there’s usually a lesson
                embedded within. Overcoming will make you grow stronger. Suffer
                through harder problems to grow more.
              </span>
            </li>
            <li>
              <strong>I like emergence.</strong>
              <span>
                {" "}
                Simple rules producing behavior that feels surprisingly
                coherent.
              </span>
            </li>
          </ul>
        </div>

        {/* Personal Philosophy */}
        <div className="card aboutCard aboutWide">
          <h2>Personal philosophy</h2>

          <p className="aboutTight">
            I don’t have a rigid end goal for my career. I care more about
            direction than destination. As long as I’m moving forward in a
            positive direction — building on what I’ve learned and applying it
            in useful ways — I’m doing well.
          </p>

          <p className="aboutTight">
            One thing I value deeply is the unusual mix of skills I’ve picked up
            along the way: scientific modeling, analytical and testing
            methodologies, teaching, systems thinking, automation architecture,
            debugging, and building interactive experiments. Individually
            they’re useful. Together, they compound.
          </p>

          <p className="aboutTight">
            I’ve learned that transferable skills are where the real leverage
            is. The domain changes — chemistry, education, software — but the
            underlying instincts carry forward.
          </p>

          <p className="aboutTight">
            The things I’m happiest building tend to share the same pattern: a
            few clear rules, good feedback, and room for surprising behavior to
            emerge. That could be a test suite, a small idle loop, a physics
            toy, or a camera pipeline that turns light into pixel grids.
          </p>

          <p className="aboutTight">
            If something has internal consistency and a bit of “this shouldn’t
            work, but it does,” I’m probably going to enjoy it.
          </p>

          <div className="aboutButtons">
            <Link className="btn" href="/reactor">
              Try the Reactor
            </Link>
            <Link className="btn" href="/pixelbooth">
              Try Pixelbooth
            </Link>
            <Link className="btn" href="/button">
              Button MMORPG
            </Link>
          </div>
        </div>

        {/* Explore */}
        <div className="card aboutCard aboutWide">
          <h2>Explore</h2>
          <p className="aboutSubtle" style={{ marginTop: 0 }}>
            The site is one cohesive toybox. Here are the main rooms:
          </p>

          <div className="aboutFeatureGrid">
            {INTERNAL_LINKS.map((x) => (
              <Link key={x.href} className="featureCard" href={x.href}>
                <div className="featureTitle">{x.title}</div>
                <div className="featureDesc">{x.desc}</div>
                <div className="featureHint">Open →</div>
              </Link>
            ))}
          </div>

          <p className="lede" style={{ marginTop: 12 }}>
            Part portfolio, part lab, part snackable little universe.
          </p>
        </div>

        {/* Links */}
        <div className="card aboutCard aboutWide">
          <h2>Links</h2>

          <div className="aboutLinks" role="list">
            {EXTERNAL_LINKS.map((x) => (
              <div className="aboutLinkRow" role="listitem" key={x.label}>
                <div className="aboutLinkLabel">{x.label}</div>
                <div className="aboutLinkValue">
                  <a
                    className="aboutLinkAnchor"
                    href={x.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {x.value}
                  </a>
                  {x.note ? (
                    <span className="aboutLinkNote">{x.note}</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
