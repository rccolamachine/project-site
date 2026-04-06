"use client";

import React, { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
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
          "Developed Playwright (TypeScript) automation for complex end-to-end workflows spanning GraphQL, REST, UI, and mocked-response test paths",
          "Expanded and refactored automated coverage within a large existing suite, improving release confidence for healthcare workflow functionality",
          "Supported CI-driven quality tracking through GitLab, Xray, and reporting integrations while contributing reusable test components and peer review across the automation codebase",
        ],
      },
      {
        company: "Unqork",
        title: "Backend Quality Lead",
        right: "Jul 2021 - Jun 2025, Remote",
        bullets: [
          "Led backend quality strategy across five product teams and mentored eight QA engineers supporting platform, data, CI/CD, and integration-heavy feature areas",
          "Designed the RBAC validation methodology and automation framework for authentication, authorization, permissions, and role hierarchy expansion",
          "Validated internal APIs, OpenAPI contracts, and external integrations including SSO, OAuth2, and Workato",
          "Benchmarked migration and data-performance behavior using Postman and K6, and diagnosed distributed backend failures through Datadog telemetry and MongoDB investigation",
          "Served as release quality gatekeeper for new platform capabilities, defining required test coverage and driving manual-to-automated validation before launch",
        ],
      },
      {
        company:
          "Oak Ridge National Laboratory / The University of Tennessee, Knoxville / Virginia Tech",
        title: "Postdoctoral Researcher / Computational Chemist",
        right: "2012 - 2021",
        bullets: [
          "Designed and executed large-scale computational chemistry models on high-performance computing infrastructure",
          "Automated multi-step scientific workflows for reproducible data transformation, simulation, and analysis",
          "Published peer-reviewed research translating theoretical models into experimentally useful insight",
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
        company: "rccolamachine.com - Full-Stack Interactive Systems Portfolio",
        title:
          "Next.js / React / JavaScript & TypeScript / API Routes / External Service Integrations / Real-Time UI Patterns",
        href: "https://rccolamachine.com",
        printText: "rccolamachine.com",
        bullets: [
          "Built and maintain a multi-project web platform featuring interactive media tools, shared-state experiments, browser-based simulation, web-to-radio messaging flows, and live telemetry dashboards",
          "Designed API-backed workflows with validation, rate limiting, request normalization, polling, and status tracking across several independent applications",
          "Integrated external network services and protocols to connect browser experiences with APRS data and pager/radio delivery paths",
          "Developed highly interactive browser applications including camera-to-pixel processing, shared counter state, and real-time simulation controls",
          "Documented architecture, implementation flow, and roadmap decisions publicly to communicate system behavior and engineering tradeoffs",
        ],
      },
    ],
    [],
  );

  return (
    <section className="page resumePage">
      <header className={`${styles.noPrint} ${styles.resumeTopBar}`}>
        <h1 className={styles.resumeTopTitle}>Resume</h1>
        <div className={styles.resumeTopRow}>
          <p className={styles.resumeTopDescription}>
            Download a printer-friendly PDF version of my current experience,
            projects, and technical skills.
          </p>
          <button
            className={`btn ${styles.resumeDownloadBtn}`}
            onClick={downloadPDF}
          >
            Download PDF
          </button>
        </div>
      </header>

      <article
        className={`${styles.resumePaper} resumePaper resumePrintTarget`}
        ref={paperRef}
      >
        <header className={styles.resumeHeader}>
          <div>
            <div className={styles.resumeName}>Rob Chapleski Jr., Ph.D.</div>
            <div className={styles.resumeTitle}>
              Senior / Lead SDET - Quality Engineering - Automation Architecture
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
            Senior quality engineer and automation leader with experience
            building test architecture, validating APIs and distributed systems,
            and leading release quality across complex SaaS platforms. Strong
            background in backend quality strategy, RBAC and integration
            testing, CI/CD release gating, and observability-driven debugging.
            Also builds full-stack JavaScript applications that demonstrate
            practical systems design, API workflows, and interactive product
            thinking.
          </p>
        </Section>

        <Section title="Core Competencies">
          <ul className={styles.competencies}>
            <li>Automation architecture & framework design</li>
            <li>API validation (REST, GraphQL, OpenAPI)</li>
            <li>Backend & platform quality strategy</li>
            <li>RBAC, authN/authZ, & access control testing</li>
            <li>CI/CD integration & release gating</li>
            <li>Performance & load testing</li>
            <li>Distributed system debugging & observability</li>
            <li>JavaScript/TypeScript test development</li>
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

        <Section title="Independent Engineering Projects">
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
            Playwright - JavaScript - TypeScript - API Testing - GraphQL - REST
            - OpenAPI - Selenium - CodeceptJS - Postman - K6 - GitLab CI - Xray
            - Allure - TestRail - Datadog - MongoDB - React - Node.js -
            AI-assisted development tools
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

      <div className={`${styles.noPrint} ${styles.resumeBottomLinkWrap}`}>
        <Link className="btn" href="/publications" prefetch={false}>
          View Publications
        </Link>
      </div>
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