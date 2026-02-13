export const metadata = {
  title: "About · rccolamachine",
  description: "A personal about page for Rob and the rccolamachine site.",
};

export default function AboutPage() {
  return (
    <section className="page">
      <header style={{ marginBottom: 16 }}>
        <h1>About</h1>
        <p className="lede">
          I’m Rob. This site is part portfolio, part playground, part “what
          happens if I just build it?”
        </p>
      </header>

      <div className="aboutGrid">
        <div className="card aboutCard">
          <h2>Who I am</h2>
          <p>
            I’m a QA automation and test engineering person who likes systems,
            structure, and clean feedback loops. I’ve worked in fast moving SaaS
            environments where quality can drift unless somebody cares enough to
            keep the bar high.
          </p>
          <p>
            Before software, I spent years doing computational chemistry
            research. That background shaped how I think: I like experiments,
            reproducibility, and using evidence to make decisions.
          </p>
          <p>
            rccolamachine is my place to mix those instincts with fun. If
            something seems a little “game-like” or delightfully
            over-engineered, that’s on purpose.
          </p>

          <div className="aboutTags" aria-label="Highlights">
            <span className="tag">Curious builder</span>
            <span className="tag">Detail obsessed</span>
            <span className="tag">Systems thinker</span>
            <span className="tag">Calm under pressure</span>
            <span className="tag">Actually ships</span>
          </div>
        </div>

        <div className="card aboutCard">
          <h2>What I’m into</h2>

          <ul className="aboutList">
            <li>
              <strong>Retro games and cozy grind loops</strong>
              <span>
                {" "}
                The kind where numbers go up, inventory fills, stats improve,
                and hours vanish.
              </span>
            </li>
            <li>
              <strong>Pixel art, weird UI, and nostalgic vibes</strong>
              <span>
                {" "}
                I like interfaces that feel like a tiny toy, not a corporate
                dashboard.
              </span>
            </li>
            <li>
              <strong>Photography experiments</strong>
              <span>
                {" "}
                I’m into the process more than perfection. Cheap cameras, manual
                control, and figuring it out.
              </span>
            </li>
            <li>
              <strong>
                Home media servers and “how far can I push this?” tinkering
              </strong>
              <span>
                {" "}
                Jellyfin, transcoding settings, hardware decoding, upscaling old
                rips, the whole rabbit hole.
              </span>
            </li>
            <li>
              <strong>Precious metals and little artifacts</strong>
              <span>
                {" "}
                Platinum, palladium, silver, hallmarks, weights, history. It’s
                half collecting, half detective work.
              </span>
            </li>
            <li>
              <strong>Genealogy and family history</strong>
              <span>
                {" "}
                I love chasing records and connecting dots across time.
              </span>
            </li>
          </ul>

          <div className="aboutCTA">
            <a className="btn" href="/photobooth">
              Try Photobooth
            </a>
            <a className="btn" href="/guestbook">
              Guestbook
            </a>
            <a className="btn" href="/resume">
              Resume
            </a>
          </div>
        </div>

        <div className="card aboutCard aboutWide">
          <h2>Why this site exists</h2>
          <p style={{ marginTop: 0 }}>
            I wanted a personal site that feels alive. Not a static template,
            not a “hello world” portfolio, and not a social feed I don’t
            control.
          </p>
          <p>
            So this is where I test ideas: pixel UI experiments,
            camera-to-canvas tricks, saving data to a tiny backend, and building
            pages that feel cohesive. It’s also a nice way to prove I can build
            full features end to end.
          </p>

          <div className="miniGrid" aria-label="Site themes">
            <div className="miniCard">
              <div className="miniTitle">Play</div>
              <div className="miniText">
                Retro UI, tiny interactions, weird little delights.
              </div>
            </div>
            <div className="miniCard">
              <div className="miniTitle">Build</div>
              <div className="miniText">
                Next.js pages, APIs, data storage, real functionality.
              </div>
            </div>
            <div className="miniCard">
              <div className="miniTitle">Ship</div>
              <div className="miniText">
                Make it work, make it stable, make it understandable.
              </div>
            </div>
          </div>
        </div>

        <div className="card aboutCard aboutWide">
          <h2>Links</h2>
          <p style={{ marginTop: 0 }}>If you want to poke around more:</p>

          <div className="aboutLinks">
            <div className="aboutLinkRow">
              <span className="aboutLinkLabel">GitHub</span>
              <span className="aboutLinkValue">github.com/YOUR_HANDLE</span>
            </div>
            <div className="aboutLinkRow">
              <span className="aboutLinkLabel">LinkedIn</span>
              <span className="aboutLinkValue">
                linkedin.com/in/YOUR_HANDLE
              </span>
            </div>
            <div className="aboutLinkRow">
              <span className="aboutLinkLabel">Portfolio</span>
              <span className="aboutLinkValue">rccolamachine.com</span>
            </div>
          </div>

          <p className="lede" style={{ marginTop: 14 }}>
            I keep email private here. The guestbook stores it for me, not for
            public display.
          </p>
        </div>
      </div>
    </section>
  );
}
