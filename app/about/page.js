import "./about.css";
import Image from "next/image";
import Link from "next/link";
import { ABOUT_INTERNAL_LINKS } from "@/data/siteNavigation";

export const metadata = {
  title: "About | rccolamachine",
  description:
    "About Rob - systems thinker, builder, and fan of simple rules creating surprising order.",
};

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
    label: "Website",
    value: "rccolamachine.com",
    href: "https://rccolamachine.com",
    note: "You are here",
  },
  {
    label: "Email",
    value: "rob@mail.rccolamachine.com",
    href: "mailto:rob@mail.rccolamachine.com",
    note: "Direct contact",
  },
];

export default function AboutPage() {
  return (
    <section className="page">
      <header className="homeHero aboutHeader">
        <div className="homeHeroCopy">
          <h1>About</h1>
          <p className="lede">
            I&apos;m Rob. I like building small systems that feel complete.
            <span className="aboutLedeBreak">
              This site is where I experiment, tinker, and occasionally
              over-engineer things for fun.
            </span>
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

      <div className="aboutGrid">
        <div className="card aboutCard">
          <h2>Who I am</h2>

          <p className="aboutTight">
            I&apos;m a systems-minded builder who learns best by making interactive
            things. If an idea can be poked, observed, and iterated on, it gets
            clear fast.
          </p>

          <p className="aboutTight">
            This site is my sandbox: playful on the surface, structured
            underneath, and built around small loops with visible feedback.
          </p>

          <div className="aboutButtons">
            <Link className="btn" href="/reactor">
              Molecular Reactor
            </Link>
            <Link className="btn" href="/farm">
              Farm Idle Sim
            </Link>
            <Link className="btn" href="/pixelbooth">
              Pixelbooth
            </Link>
          </div>
        </div>

        <div className="card aboutCard">
          <h2>Why QA?</h2>

          <p className="aboutTight">
            Before software QA, I spent years in computational chemistry
            research. The work demanded rigorous methods, reproducible results,
            and careful interpretation of noisy systems.
          </p>

          <p className="aboutTight">
            Over time, I realized what I loved most was the reliability mindset
            behind the work: designing checks, validating assumptions, and
            building feedback loops teams can trust.
          </p>

          <p className="aboutTight">
            QA is a natural extension of that background. I care about
            evidence, clear communication, and helping teams ship confidently.
          </p>

          <div className="aboutButtons">
            <Link className="btn" href="/resume">
              Resume
            </Link>
            <Link className="btn" href="/publications">
              Publications
            </Link>
            <Link className="btn" href="/todo">
              To-Do
            </Link>
          </div>
        </div>

        <div className="card aboutCard aboutWide">
          <h2>How I think</h2>

          <ul className="aboutList">
            <li>
              <strong>I trust feedback.</strong>
              <span> Systems should tell you what they are doing.</span>
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
                When you find something difficult, there is usually a lesson
                embedded within. Overcoming it makes you stronger.
              </span>
            </li>
          </ul>
        </div>

        <div className="card aboutCard aboutWide">
          <h2>Explore</h2>
          <p className="aboutSubtle aboutSubtleTop">
            The site is one cohesive toybox. Here are the main rooms:
          </p>

          <div className="aboutFeatureGrid">
            {ABOUT_INTERNAL_LINKS.map((x) => (
              <Link key={x.href} className="featureCard" href={x.href}>
                <div className="featureTitle">{x.title}</div>
                <div className="featureDesc">{x.desc}</div>
              </Link>
            ))}
          </div>

          <p className="lede aboutLedeFollowup">
            Part portfolio, part lab, part snackable little universe.
          </p>
        </div>

        <div className="card aboutCard aboutWide">
          <h2>Links</h2>

          <div className="aboutLinks" role="list">
            {EXTERNAL_LINKS.map((x) => (
              <a
                className="aboutLinkRow"
                role="listitem"
                key={x.label}
                href={x.href}
                target="_blank"
                rel="noreferrer"
              >
                <div className="aboutLinkLabel">{x.label}</div>
                <div className="aboutLinkValue">
                  <span className="aboutLinkMain">{x.value}</span>
                  {x.note ? (
                    <span className="aboutLinkNote">{x.note}</span>
                  ) : null}
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
