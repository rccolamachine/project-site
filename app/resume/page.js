"use client";

import React, { useEffect, useMemo, useRef } from "react";
import styles from "./resume.module.css";

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
      {
        label: "Email",
        href: "mailto:rob@mail.rccolamachine.com",
        printText: "robert.chapleski@gmail.com",
      },
    ],
    [],
  );

  const EXPERIENCE = useMemo(
    () => [
      {
        company: "Accumulus Technologies",
        title: "Senior Test Automation Engineer",
        right: "Jun 2025 - Sep 2025, Remote",
        bullets: [
          "Developed Playwright (TypeScript) automation for complex GraphQL and REST workflows",
          "Improved CI-driven release stability through deterministic API validation and end-to-end test design",
          "Leveraged AI-assisted development tools to accelerate locator strategy, test generation, and debugging",
        ],
      },
      {
        company: "Unqork",
        title: "Backend Quality Lead",
        right: "Jul 2021 - Jun 2025, Remote",
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
          "Oak Ridge National Laboratory / The University of Tennessee, Knoxville / Virginia Tech",
        title: "Computational Chemist & Postdoctoral Research Associate",
        right: "2012 - 2021",
        bullets: [
          "Designed and executed multi-scale atomistic and molecular simulation models on national supercomputing infrastructure",
          "Automated high-throughput computational pipelines for reproducible data transformation and analysis",
          "Published peer-reviewed research translating theoretical models into experimentally actionable insight",
        ],
      },
      {
        company: "Carroll County Public Schools",
        title: "High School Teacher: Physics & Chemistry",
        right: "2007 - 2012, Westminster, MD",
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
        title: "Next.js / React / API Routes / Object Storage",
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
        title: "JavaScript / Systems Modeling",
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
      <header className={`${styles.noPrint} ${styles.resumeTopBar}`}>
        <h1>Resume</h1>
        <button className="btn" onClick={downloadPDF}>
          Download PDF
        </button>
      </header>

      <article className={`${styles.resumePaper} resumePrintTarget`} ref={paperRef}>
        <header className={styles.resumeHeader}>
          <div>
            <div className={styles.resumeName}>Rob Chapleski Jr., Ph.D.</div>
            <div className={styles.resumeTitle}>
              Senior Software Engineer - JavaScript Full-Stack - Quality &
              Automation
            </div>
          </div>

          <div className={styles.resumeContact}>
            <div>United States - Remote</div>
            <div>
              <span className={styles.screenOnly}>
                {LINKS.map((l, idx) => (
                  <React.Fragment key={l.href}>
                    <a href={l.href} target="_blank" rel="noreferrer noopener">
                      {l.label}
                    </a>
                    {idx < LINKS.length - 1 && (
                      <span className={styles.dot}>&bull;</span>
                    )}
                  </React.Fragment>
                ))}
              </span>

              <span className={`${styles.printOnly} ${styles.printContactList}`}>
                {LINKS.map((l) => (
                  <span key={l.printText}>{l.printText}</span>
                ))}
              </span>
            </div>
          </div>
        </header>

        <Section title="Professional Summary">
          <p className={styles.resumeP}>
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
          <ul className={styles.competencies}>
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
                  <span className={styles.screenOnly}>
                    <a href={p.href} target="_blank" rel="noreferrer noopener">
                      {p.printText}
                    </a>
                  </span>
                  <span className={styles.printOnly}>{p.printText}</span>
                </>
              }
              bullets={p.bullets}
            />
          ))}
        </Section>

        <Section title="Technical Skills">
          <p className={styles.resumeP}>
            JavaScript - TypeScript - Node.js - React - GraphQL - REST -
            MongoDB - Playwright - Selenium - CodeceptJS - Postman - K6 - GitLab
            CI - Datadog - Jira - AI-assisted development tools (ChatGPT,
            Codex)
          </p>
        </Section>

        <Section title="Education">
          <p className={styles.resumeP}>
            Software Developer Certificate - Fullstack Academy / Virginia Tech
            (2024)
            <br />
            Ph.D. Chemistry - Virginia Tech (2017)
            <br />
            B.S. Chemistry - Towson University Honors College, Summa cum laude
            (2007)
          </p>
        </Section>
      </article>
    </section>
  );
}

function Section({ title, children }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.resumeH2}>{title}</h2>
      {children}
    </section>
  );
}

function Role({ company, title, right, bullets }) {
  return (
    <div className={styles.role}>
      <div className={styles.roleTop}>
        <div>
          <div className={styles.roleCompany}>{company}</div>
          <div className={styles.roleTitle}>{title}</div>
        </div>
        <div className={styles.roleRight}>{right}</div>
      </div>
      <ul className={styles.roleBullets}>
        {bullets.map((b, i) => (
          <li key={`${company}-${i}`}>{b}</li>
        ))}
      </ul>
    </div>
  );
}
