"use client";

import React, { useEffect, useMemo, useRef } from "react";

const SECTION_GAP = 16;

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
          "Developed Playwright (TypeScript) automation for complex GraphQL and REST workflows",
          "Improved CI-driven release stability through deterministic API validation and end-to-end test design",
          "Leveraged AI-assisted development tools to accelerate locator strategy, test generation, and debugging",
        ],
      },
      {
        company: "Unqork",
        title: "Backend Quality Lead",
        right: "Jul 2021 – Jun 2025 · Remote",
        bullets: [
          "Led backend quality strategy across five product teams and mentored eight engineers",
          "Designed RBAC validation framework for authentication, authorization, and role expansion",
          "Validated OpenAPI contracts and integrations (SSO, OAuth2, Workato)",
          "Benchmarked MongoDB performance during schema migrations and data restructuring",
          "Diagnosed distributed backend failures using Datadog logs and telemetry",
          "Architected validation strategy for new GenAI product prior to release",
        ],
      },
      {
        company:
          "Oak Ridge National Laboratory · The University of Tennessee, Knoxville · Virginia Tech",
        title: "Computational Chemist & Postdoctoral Research Associate",
        right: "2012 – 2021",
        bullets: [
          "Designed and executed multi-scale atomistic and molecular simulation models on national supercomputing infrastructure",
          "Automated high-throughput computational pipelines for reproducible data transformation and analysis",
          "Published peer-reviewed research translating theoretical models into experimentally actionable insight",
        ],
      },
      {
        company: "Carroll County Public Schools",
        title: "High School Teacher: Physics & Chemistry",
        right: "2007 – 2012 · Westminster, MD",
        bullets: [
          "Taught high school physics and chemistry, designing rigorous curriculum and communicating complex technical concepts clearly",
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
          "Built full-stack camera application with client-side image processing and server-side persistence",
          "Designed RESTful API routes with validation safeguards and structured response contracts",
          "Balanced client-side responsiveness with backend storage and performance trade-offs",
        ],
      },
      {
        company: "Reactive Simulation Sandbox",
        title: "JavaScript · Systems Modeling",
        href: "https://rccolamachine.com/reactor",
        printText: "rccolamachine.com/reactor",
        bullets: [
          "Implemented browser-based reactive system modeling interacting entities",
          "Evaluated algorithmic trade-offs between physical realism and real-time performance",
        ],
      },
    ],
    [],
  );

  return (
    <section className="page resumePage">
      <style jsx global>{`
        .resumeTopBar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

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

        .resumePaper a {
          color: inherit;
          text-decoration: none;
          transition: color 120ms ease;
        }

        .resumePaper a:hover,
        .resumePaper a:focus-visible {
          color: #8fe8ff;
          text-decoration: underline;
        }

        @media print {
          html,
          body {
            background: #fff !important;
            color: #000 !important;
          }

          body.print-resume * {
            visibility: hidden !important;
          }

          body.print-resume .resumePaper,
          body.print-resume .resumePaper * {
            visibility: visible !important;
          }

          body.print-resume .resumePaper {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 0.6in !important;
          }

          .noPrint {
            display: none !important;
          }
          .role {
            break-inside: avoid-page;
          }
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

      <article className="resumePaper" ref={paperRef}>
        <header className="resumeHeader">
          <div>
            <div className="resumeName">Rob Chapleski Jr., Ph.D.</div>
            <div className="resumeTitle">
              Senior Software Engineer · JavaScript Full-Stack · Quality &
              Automation
            </div>
          </div>

          <div className="resumeContact">
            <div>United States · Remote</div>
            <div>
              <span className="screenOnly">
                {LINKS.map((l, idx) => (
                  <React.Fragment key={l.href}>
                    <a href={l.href} target="_blank" rel="noreferrer noopener">
                      {l.label}
                    </a>
                    {idx < LINKS.length - 1 && <span className="dot">•</span>}
                  </React.Fragment>
                ))}
              </span>

              <span className="printOnly">
                {LINKS.map((l, idx) => (
                  <React.Fragment key={l.printText}>
                    {l.printText}
                    {idx < LINKS.length - 1 && <span className="dot">•</span>}
                  </React.Fragment>
                ))}
              </span>
            </div>
          </div>
        </header>

        <Section title="Professional Summary">
          <p className="resumeP">
            Software Developer with expertise in automation architecture, API
            design and validation, CI/CD systems, and distributed platform
            quality. Experienced collaborating across engineering teams to
            design resilient systems, de-risk architectural changes, and ship
            reliable SaaS products. Integrates AI-assisted development tools
            into daily workflows to accelerate delivery while maintaining strong
            engineering judgment and system integrity.
          </p>
        </Section>

        <Section title="Core Competencies">
          <ul className="competencies">
            <li>Full-stack JavaScript (React, Node.js)</li>
            <li>Automation framework architecture</li>
            <li>API validation (REST, GraphQL, OpenAPI)</li>
            <li>RBAC & access control systems</li>
            <li>CI/CD integration & release gating</li>
            <li>Performance & load testing</li>
            <li>Distributed system debugging</li>
            <li>AI-assisted engineering workflows</li>
          </ul>
        </Section>

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
                      {p.printText}
                    </a>
                  </span>
                  <span className="printOnly">{p.printText}</span>
                </>
              }
              bullets={p.bullets}
            />
          ))}
        </Section>

        <Section title="Technical Skills">
          <p className="resumeP">
            JavaScript · TypeScript · Node.js · React · GraphQL · REST · MongoDB
            · Playwright · Selenium · CodeceptJS · Postman · K6 · GitLab CI ·
            Datadog · Jira · AI-assisted development tools (ChatGPT, Codex)
          </p>
        </Section>

        <Section title="Education">
          <p className="resumeP">
            Software Developer Certificate – Fullstack Academy / Virginia Tech
            (2024)
            <br />
            Ph.D. Chemistry – Virginia Tech (2017)
            <br />
            B.S. Chemistry – Towson University Honors College, Summa cum laude
            (2007)
          </p>
        </Section>
      </article>
    </section>
  );
}

function Section({ title, children }) {
  return (
    <section style={{ marginTop: SECTION_GAP }}>
      <h2 className="resumeH2">{title}</h2>
      {children}
    </section>
  );
}

function Role({ company, title, right, bullets }) {
  return (
    <div className="role">
      <div className="roleTop">
        <div>
          <div className="roleCompany">{company}</div>
          <div className="roleTitle">{title}</div>
        </div>
        <div className="roleRight">{right}</div>
      </div>
      <ul className="roleBullets">
        {bullets.map((b, i) => (
          <li key={`${company}-${i}`}>{b}</li>
        ))}
      </ul>
    </div>
  );
}
