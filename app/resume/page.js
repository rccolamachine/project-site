"use client";

import React, { useEffect, useMemo, useRef } from "react";

const SECTION_GAP = 16;

/**
 * ResumePage
 * - Single-file, self-contained resume renderer + print-to-PDF workflow.
 * - Data-driven: edit arrays below (LINKS / EXPERIENCE / PROJECTS) instead of JSX.
 * - Style preserved: matches your existing “resume paper” look + print-only mode.
 */
export default function ResumePage() {
  const paperRef = useRef(null);

  useEffect(() => {
    const prev = document.title;
    document.title = "Rob_Chapleski_Resume";
    return () => {
      document.title = prev;
    };
  }, []);

  const downloadPDF = () => {
    document.body.classList.add("print-resume");
    requestAnimationFrame(() => {
      window.print();
      setTimeout(() => document.body.classList.remove("print-resume"), 200);
    });
  };

  const LINKS = useMemo(
    () => [
      {
        label: "LinkedIn",
        href: "https://www.linkedin.com/in/robert-chapleski",
        printText: "linkedin.com/in/robert-chapleski",
      },
      {
        label: "GitHub",
        href: "https://github.com/rccolamachine",
        printText: "github.com/rccolamachine",
      },
      {
        label: "Portfolio",
        href: "https://rccolamachine.com",
        printText: "rccolamachine.com",
      },
    ],
    [],
  );

  const EXPERIENCE = useMemo(
    () => [
      {
        company: "Accumulus Technologies",
        title: "Senior Test Automation Engineer",
        right: "Jun 2025 – Sep 2025 · Remote",
        bullets: [
          "Developed Playwright automation for GraphQL and REST workflows",
          "Improved CI-driven release stability through API validation",
          "Contributed to reusable automation abstractions and code reviews",
        ],
      },
      {
        company: "Unqork",
        title: "Backend Quality Lead",
        right: "Jul 2021 – Jun 2025 · Remote",
        bullets: [
          "Led backend quality strategy across five product teams and mentored eight engineers",
          "Designed RBAC validation framework covering authentication and authorization systems",
          "Validated OpenAPI documentation and integrations (SSO, OAuth2, Workato)",
          "Executed MongoDB performance benchmarking during schema migrations",
          "Used Datadog telemetry to diagnose distributed backend failures",
          "Architected testing strategy for new GenAI product",
        ],
      },
      {
        company: "Research & Computational Systems",
        title: "ORNL · UTK · Virginia Tech",
        right: "2012 – 2021",
        bullets: [
          "Executed large-scale simulations on national supercomputing infrastructure",
          "Built scripting pipelines to automate computational workflows",
          "Published peer-reviewed research in complex systems modeling",
        ],
      },
    ],
    [],
  );

  const PROJECTS = useMemo(
    () => [
      {
        company: "Interactive Photobooth Platform",
        title: "Next.js · React · API Routes · Object Storage",
        href: "https://rccolamachine.com/photobooth",
        printText: "rccolamachine.com/photobooth",
        bullets: [
          "Built full-stack camera application with client-side image processing",
          "Designed API routes for persistence, validation, and structured contracts",
          "Balanced UX responsiveness with server-side storage trade-offs",
        ],
      },
      {
        company: "Reactive Simulation Sandbox",
        title: "JavaScript · Systems Modeling",
        href: "https://rccolamachine.com/reactor",
        printText: "rccolamachine.com/reactor",
        bullets: [
          "Implemented browser-based reactive system modeling interacting entities",
          "Evaluated algorithmic trade-offs between realism and performance",
        ],
      },
    ],
    [],
  );

  return (
    <section className="page resumePage">
      {/* Local, page-only styles (includes print rules) */}
      <style jsx global>{`
        /* ---------- Screen layout helpers ---------- */
        .resumeTopBar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        /* Explicit screen/print toggles */
        .screenOnly {
          display: inline;
        }
        .printOnly {
          display: none;
        }
        @media print {
          .screenOnly {
            display: none !important;
          }
          .printOnly {
            display: inline !important;
          }
        }

        /* ---------- Resume paper styles (screen) ---------- */
        .resumePaper {
          background: #fff;
          color: #000;
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 12px;
          padding: 22px;
        }

        .resumeHeader {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          border-bottom: 1px solid rgba(0, 0, 0, 0.12);
          padding-bottom: 12px;
        }

        .resumeName {
          font-size: 22px;
          font-weight: 800;
          letter-spacing: 0.2px;
          margin-bottom: 2px;
        }
        .resumeTitle {
          font-size: 13px;
          font-weight: 600;
          opacity: 0.9;
        }

        .resumeContact {
          text-align: right;
          font-size: 12px;
          line-height: 1.4;
          opacity: 0.9;
        }

        .dot {
          margin: 0 8px;
          opacity: 0.65;
        }

        .resumeH2 {
          margin: 0 0 8px;
          font-size: 13px;
          letter-spacing: 0.2px;
          text-transform: uppercase;
          font-weight: 800;
        }

        .resumeP {
          margin: 0;
          font-size: 12.5px;
          line-height: 1.55;
        }

        .competencies {
          margin: 0;
          padding-left: 18px;
          columns: 2;
          column-gap: 26px;
          font-size: 12.5px;
          line-height: 1.5;
        }
        .competencies li {
          break-inside: avoid;
          margin: 0 0 4px;
        }

        /* ---------- Role block ---------- */
        .role {
          margin-top: 14px;
        }
        .roleTop {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
        }
        .roleCompany {
          font-weight: 800;
          font-size: 13px;
        }
        .roleTitle {
          font-weight: 600;
          font-size: 12.5px;
          opacity: 0.92;
          margin-top: 1px;
        }
        .roleRight {
          text-align: right;
          font-size: 12px;
          opacity: 0.9;
          white-space: nowrap;
        }

        .roleBullets {
          margin: 6px 0 0;
          padding-left: 18px;
          font-size: 12.5px;
          line-height: 1.5;
        }
        .roleBullets li {
          margin: 0 0 4px;
        }

        /* Links: clean by default, icy-blue on hover/focus (no highlight) */
        .resumePaper a {
          color: inherit;
          text-decoration: none;
          transition:
            color 120ms ease,
            opacity 120ms ease,
            text-decoration-color 120ms ease;
        }

        .resumePaper a:hover,
        .resumePaper a:focus-visible {
          color: #8fe8ff; /* icy blue */
          text-decoration: underline; /* optional: remove if you want zero underline always */
          text-decoration-thickness: 1px;
          text-underline-offset: 2px;
        }

        .resumePaper a:active {
          opacity: 0.9;
        }

        /* ---------- Print: ONLY resume contents ---------- */
        @media print {
          html,
          body {
            background: #fff !important;
            color: #000 !important;
          }

          /* Hide everything by default */
          body.print-resume * {
            visibility: hidden !important;
          }

          /* Show only the resume paper */
          body.print-resume .resumePaper,
          body.print-resume .resumePaper * {
            visibility: visible !important;
          }

          /* Position resume paper at top-left and remove borders */
          body.print-resume .resumePaper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0.6in !important; /* printable margin */
            box-shadow: none !important;
          }

          /* Hide the download button / top bar in print */
          .noPrint {
            display: none !important;
          }

          /* Reduce risk of awkward page breaks */
          .role {
            break-inside: avoid-page;
          }

          /* Prevent browser printing URL after links if it tries */
          a[href]::after {
            content: "" !important;
          }
        }

        @page {
          size: letter;
          margin: 0;
        }
      `}</style>

      <header className="noPrint resumeTopBar">
        <h1>Resume</h1>
        <button className="btn" onClick={downloadPDF}>
          Download PDF
        </button>
      </header>

      <article className="resumePaper" ref={paperRef} aria-label="Resume">
        {/* HEADER */}
        <header className="resumeHeader">
          <div>
            <div className="resumeName">Rob Chapleski Jr., Ph.D.</div>
            <div className="resumeTitle">
              Senior Software Engineer · Quality Architecture · Full-Stack
              Systems
            </div>
          </div>

          <div className="resumeContact">
            <div>United States · Remote</div>

            {/* Screen: clickable; Print: raw URLs */}
            <div>
              <span className="screenOnly">
                {LINKS.map((l, idx) => (
                  <React.Fragment key={l.href}>
                    <a href={l.href} target="_blank" rel="noreferrer noopener">
                      {l.label}
                    </a>
                    {idx < LINKS.length - 1 ? (
                      <span className="dot">•</span>
                    ) : null}
                  </React.Fragment>
                ))}
              </span>

              <span className="printOnly">
                {LINKS.map((l, idx) => (
                  <React.Fragment key={l.printText}>
                    {l.printText}
                    {idx < LINKS.length - 1 ? (
                      <span className="dot">•</span>
                    ) : null}
                  </React.Fragment>
                ))}
              </span>
            </div>
          </div>
        </header>

        {/* SUMMARY */}
        <Section title="Professional Summary">
          <p className="resumeP">
            Senior Software Engineer with expertise in automation architecture,
            API validation, CI/CD integration, and full-stack JavaScript
            systems. Experienced collaborating with engineering leadership to
            improve release reliability, design resilient access control models,
            and strengthen platform quality across distributed SaaS
            environments. Combines strong technical depth with systems thinking
            and pragmatic delivery.
          </p>
        </Section>

        {/* CORE COMPETENCIES */}
        <Section title="Core Competencies">
          <ul className="competencies">
            <li>Automation framework design</li>
            <li>Full-stack JavaScript systems</li>
            <li>API validation (REST, GraphQL)</li>
            <li>RBAC & access control modeling</li>
            <li>CI/CD integration</li>
            <li>Performance & load testing</li>
            <li>Distributed system debugging</li>
            <li>Technical mentorship & leadership</li>
          </ul>
        </Section>

        {/* EXPERIENCE */}
        <Section title="Experience">
          {EXPERIENCE.map((r) => (
            <Role
              key={`${r.company}-${r.title}`}
              company={r.company}
              title={r.title}
              right={r.right}
              bullets={r.bullets}
            />
          ))}
        </Section>

        {/* PROJECTS */}
        <Section title="Selected Projects">
          {PROJECTS.map((p) => (
            <Role
              key={p.href}
              company={p.company}
              title={p.title}
              right={
                <>
                  <span className="screenOnly">
                    <a href={p.href} target="_blank" rel="noreferrer noopener">
                      {toPrettyHostPath(p.href)}
                    </a>
                  </span>
                  <span className="printOnly">{p.printText}</span>
                </>
              }
              bullets={p.bullets}
              compactTop
            />
          ))}
        </Section>

        {/* SKILLS */}
        <Section title="Technical Skills">
          <p className="resumeP">
            JavaScript · TypeScript · Node.js · React · GraphQL · REST · MongoDB
            · Playwright · Selenium · CodeceptJS · Postman · K6 · GitLab CI ·
            Datadog · Jira · AI-assisted development tools
          </p>
        </Section>

        {/* EDUCATION */}
        <Section title="Education">
          <p className="resumeP">
            Software Developer Certificate – Fullstack Academy / Virginia Tech
            (2024)
            <br />
            Ph.D. Chemistry – Virginia Tech (2017)
            <br />
            B.S. Chemistry – Towson University, Summa cum laude (2007)
          </p>
        </Section>
      </article>
    </section>
  );
}

/** Small presentational wrappers for consistency */
function Section({ title, children }) {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <h2 className="resumeH2">{title}</h2>
      {children}
    </section>
  );
}

function Role({ company, title, right, bullets, compactTop = false }) {
  return (
    <div className="role" style={compactTop ? { marginTop: 8 } : undefined}>
      <div className="roleTop">
        <div>
          <div className="roleCompany">{company}</div>
          <div className="roleTitle">{title}</div>
        </div>
        <div className="roleRight">{right}</div>
      </div>
      {bullets?.length ? (
        <ul className="roleBullets">
          {bullets.map((b, i) => (
            <li key={`${company}-${i}`}>{b}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** rccolamachine.com/xyz pretty printing */
function toPrettyHostPath(url) {
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, "");
    const path = (u.pathname || "/").replace(/\/$/, "");
    return `${host}${path}`;
  } catch {
    return url;
  }
}
