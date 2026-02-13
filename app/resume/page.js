"use client";

import { useEffect, useRef } from "react";

const SECTION_GAP = 16;

export default function ResumePage() {
  const paperRef = useRef(null);

  useEffect(() => {
    const prev = document.title;
    document.title = "Rob_Chapleski_Lead_SDET_Resume";
    return () => {
      document.title = prev;
    };
  }, []);

  const downloadPDF = () => {
    // Add a body class that switches the page into "resume-only print mode"
    document.body.classList.add("print-resume");
    // Give the DOM a beat to apply styles before print dialog snapshots
    requestAnimationFrame(() => {
      window.print();
      // Remove class after returning from print dialog
      setTimeout(() => document.body.classList.remove("print-resume"), 200);
    });
  };

  return (
    <section className="resumePage">
      {/* Local, page-only styles (includes print rules) */}
      <style jsx global>{`
        /* ---------- Screen layout helpers ---------- */
        .resumeTopBar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
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
        .resumeLinks a {
          color: inherit;
          text-decoration: underline;
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

        /* ---------- Role block (reused by Education now) ---------- */
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
        .roleDates {
          font-weight: 600;
        }
        .roleLoc {
          opacity: 0.9;
        }

        .roleArea {
          margin-top: 8px;
          font-size: 12.5px;
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

        .skillsGrid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px 16px;
        }
        .skillsHead {
          font-size: 12.5px;
          margin-bottom: 2px;
        }
        .skillsLine {
          font-size: 12.5px;
          line-height: 1.45;
          opacity: 0.95;
        }

        /* ---------- Print: ONLY resume contents ---------- */
        @media print {
          /* Ensure clean white output */
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

          /* Avoid column weirdness on narrow printers */
          .competencies {
            columns: 2;
          }

          /* Reduce risk of awkward page breaks */
          .role {
            break-inside: avoid-page;
          }

          /* Prevent browser printing URL after links if it tries */
          a[href]::after {
            content: "" !important;
          }

          /* Some browsers add header/footer; user must disable:
             - Chrome: Print dialog -> "Headers and footers" unchecked
             We can't programmatically force that off. */
        }

        @page {
          size: letter;
          margin: 0;
        }
      `}</style>

      <div className="noPrint resumeTopBar">
        <h1 style={{ margin: 0 }}>Resume</h1>
        <button className="btn" onClick={downloadPDF}>
          Download PDF
        </button>
      </div>

      <article className="resumePaper" ref={paperRef} aria-label="Resume">
        {/* HEADER */}
        <header className="resumeHeader">
          <div>
            <div className="resumeName">Rob Chapleski Jr., Ph.D.</div>
            <div className="resumeTitle">
              Lead / Senior SDET · Quality Engineering
            </div>
          </div>

          <div className="resumeContact">
            <div>United States · Remote</div>
            <div className="resumeLinks">
              {/* screen: clickable */}
              <span className="screenOnly">
                <a
                  href="https://www.linkedin.com/in/robert-chapleski"
                  target="_blank"
                  rel="noreferrer"
                >
                  LinkedIn
                </a>
                <span className="dot">•</span>
                <a
                  href="https://github.com/YOUR_HANDLE"
                  target="_blank"
                  rel="noreferrer"
                >
                  GitHub
                </a>
                <span className="dot">•</span>
                <a
                  href="https://rccolamachine.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  Portfolio
                </a>
              </span>

              {/* print: raw URLs */}
              <span className="printOnly">
                linkedin.com/in/robert-chapleski <span className="dot">•</span>{" "}
                github.com/YOUR_HANDLE <span className="dot">•</span>{" "}
                rccolamachine.com
              </span>
            </div>
          </div>
        </header>

        {/* PROFILE */}
        <section style={{ marginTop: SECTION_GAP }}>
          <h2 className="resumeH2">Profile</h2>
          <p className="resumeP">
            Lead-level Software Development Engineer in Test with deep
            experience designing automation strategy, backend quality systems,
            and CI integrated test frameworks for complex SaaS platforms. Known
            for building durable API and RBAC validation, owning release gates,
            and mentoring teams toward automation maturity. Comfortable
            operating at technical depth with senior engineering leadership
            while staying grounded in product risk, reliability, and user
            outcomes. Brings a rigorous scientific mindset to debugging,
            measurement, and systems thinking.
          </p>
        </section>

        {/* CORE COMPETENCIES */}
        <section style={{ marginTop: SECTION_GAP }}>
          <h2 className="resumeH2">Core Competencies</h2>
          <ul className="competencies">
            <li>Quality strategy & release gates</li>
            <li>Playwright E2E automation</li>
            <li>API testing (GraphQL, REST)</li>
            <li>RBAC & security validation</li>
            <li>Test architecture & patterns</li>
            <li>CI pipelines & reporting</li>
            <li>Performance testing & analysis</li>
            <li>Mentorship & cross functional leadership</li>
          </ul>
        </section>

        {/* EXPERIENCE */}
        <section style={{ marginTop: SECTION_GAP }}>
          <h2 className="resumeH2">Experience</h2>

          <div className="role">
            <div className="roleTop">
              <div>
                <div className="roleCompany">Accumulus Technologies</div>
                <div className="roleTitle">Senior Test Automation Engineer</div>
              </div>
              <div className="roleRight">
                <div className="roleDates">Jun 2025 to Sep 2025</div>
                <div className="roleLoc">Remote</div>
              </div>
            </div>

            <div className="roleArea">
              <strong>Automation Architecture</strong>
            </div>
            <ul className="roleBullets">
              <li>
                Developed and refactored 50 plus Playwright TypeScript end to
                end tests within a 2000 test suite covering GraphQL and REST
                workflows
              </li>
              <li>
                Implemented Page Object Model abstractions and reusable SDK
                components to improve test maintainability and reduce locator
                fragility
              </li>
              <li>
                Leveraged mocked GraphQL responses and API driven setup to
                stabilize complex UI workflows and increase deterministic
                coverage
              </li>
            </ul>

            <div className="roleArea">
              <strong>CI & Release Quality</strong>
            </div>
            <ul className="roleBullets">
              <li>
                Maintained 100 percent release pass rate through GitLab CI
                pipelines integrated with Xray and Allure reporting
              </li>
              <li>
                Practiced shift left quality through refinement participation,
                UX feedback, and proactive defect identification, using AI tools
                to accelerate problem solving and test design
              </li>
            </ul>
          </div>

          <div className="role">
            <div className="roleTop">
              <div>
                <div className="roleCompany">Unqork</div>
                <div className="roleTitle">Backend Quality Assurance Lead</div>
              </div>
              <div className="roleRight">
                <div className="roleDates">Jul 2021 to Jun 2025</div>
                <div className="roleLoc">Remote</div>
              </div>
            </div>

            <div className="roleArea">
              <strong>Quality Leadership</strong>
            </div>
            <ul className="roleBullets">
              <li>
                Led backend quality strategy across five product teams and
                mentored eight QA engineers, serving as release gatekeeper for
                authentication, RBAC, integrations, data, and platform control
                plane work
              </li>
              <li>
                Defined test requirements and release readiness criteria for
                major platform initiatives, including application versioning and
                version merge functionality
              </li>
            </ul>

            <div className="roleArea">
              <strong>API & Security Testing</strong>
            </div>
            <ul className="roleBullets">
              <li>
                Designed and maintained a comprehensive RBAC test suite covering
                authentication, authorization, role hierarchies, and permission
                expansion across internal endpoints
              </li>
              <li>
                Validated OpenAPI documentation and integrations including SSO,
                OAuth2, and Workato connectors, collaborating closely with
                senior and principal engineers on architecture and risk
              </li>
            </ul>

            <div className="roleArea">
              <strong>Performance & Observability</strong>
            </div>
            <ul className="roleBullets">
              <li>
                Conducted performance benchmarking using Postman and K6 to
                evaluate large scale database migrations and CRUD optimization
                risk
              </li>
              <li>
                Leveraged Datadog logs and MongoDB queries to diagnose backend
                defects and improve service reliability
              </li>
            </ul>
          </div>

          <div className="role">
            <div className="roleTop">
              <div>
                <div className="roleCompany">Oak Ridge National Laboratory</div>
                <div className="roleTitle">
                  Postdoctoral Researcher · Chemical Separations Group
                </div>
              </div>
              <div className="roleRight">
                <div className="roleDates">Jan 2020 to Jul 2021</div>
                <div className="roleLoc">Oak Ridge, TN</div>
              </div>
            </div>

            <div className="roleArea">
              <strong>Large Scale Computation</strong>
            </div>
            <ul className="roleBullets">
              <li>
                Executed high performance computational simulations on national
                laboratory supercomputing resources to study adsorption
                mechanisms on rare earth mineral analogues
              </li>
              <li>
                Built automated scripting pipelines to transform simulation
                outputs into structured inputs for downstream calculations,
                improving throughput and reproducibility
              </li>
            </ul>

            <div className="roleArea">
              <strong>Research & Publication</strong>
            </div>
            <ul className="roleBullets">
              <li>
                Published peer reviewed research and translated theoretical
                results into actionable insights for experimental collaborators
                and proposal development
              </li>
              <li>
                Authored a chapter in the Handbook on the Physics and Chemistry
                of Rare Earths and contributed to peer reviewed journal
                publications
              </li>
            </ul>
          </div>

          <div className="role">
            <div className="roleTop">
              <div>
                <div className="roleCompany">University of Tennessee</div>
                <div className="roleTitle">
                  Postdoctoral Researcher · Computational Physical Chemistry
                </div>
              </div>
              <div className="roleRight">
                <div className="roleDates">Jul 2017 to Jan 2020</div>
                <div className="roleLoc">Knoxville, TN</div>
              </div>
            </div>

            <div className="roleArea">
              <strong>Computational Modeling</strong>
            </div>
            <ul className="roleBullets">
              <li>
                Applied density functional theory to characterize surface
                reaction mechanisms and interpret experimental outcomes under
                multiple conditions
              </li>
              <li>
                Mentored graduate and undergraduate researchers and contributed
                to publications through rigorous modeling, analysis, and
                technical writing
              </li>
            </ul>
          </div>

          <div className="role">
            <div className="roleTop">
              <div>
                <div className="roleCompany">Virginia Tech</div>
                <div className="roleTitle">
                  Graduate Research Assistant · Computational Physical Chemistry
                </div>
              </div>
              <div className="roleRight">
                <div className="roleDates">Aug 2012 to May 2017</div>
                <div className="roleLoc">Blacksburg, VA</div>
              </div>
            </div>

            <div className="roleArea">
              <strong>Experimental Systems & Quality</strong>
            </div>
            <ul className="roleBullets">
              <li>
                Maintained and designed ultra-high vacuum scientific apparatus
                for advanced data collection, operating in tightly controlled
                conditions and ensuring measurement integrity across experiments
              </li>
              <li>
                Trained undergraduate students in analytical chemistry
                laboratory methods with emphasis on quality in chemical
                analysis, documentation, and repeatable technique
              </li>
              <li>
                Developed and executed large scale computational models to study
                gas surface reaction pathways, adsorption, and catalytic
                hydrolysis mechanisms, including chemical agent simulants
              </li>
            </ul>
          </div>

          <div className="role">
            <div className="roleTop">
              <div>
                <div className="roleCompany">Carroll County Public Schools</div>
                <div className="roleTitle">
                  High School Teacher · Physics & Chemistry
                </div>
              </div>
              <div className="roleRight">
                <div className="roleDates">Jul 2007 to Jun 2012</div>
                <div className="roleLoc">Maryland</div>
              </div>
            </div>

            <div className="roleArea">
              <strong>Leadership & Communication</strong>
            </div>
            <ul className="roleBullets">
              <li>
                Taught physics and chemistry to diverse learners and built
                rigorous course materials, strengthening the communication and
                coaching skills that translate directly to mentoring engineers
                and aligning teams
              </li>
              <li>
                Developed curriculum used across the county and led student
                organizations, demonstrating ownership, stakeholder alignment,
                and delivery under real world constraints
              </li>
            </ul>
          </div>
        </section>

        {/* EDUCATION (now matches role styling) */}
        <section style={{ marginTop: SECTION_GAP }}>
          <h2 className="resumeH2">Education</h2>

          <div className="role" style={{ marginTop: 8 }}>
            <div className="roleTop">
              <div>
                <div className="roleCompany">
                  Fullstack Academy / Virginia Tech
                </div>
                <div className="roleTitle">Software Developer Certificate</div>
              </div>
              <div className="roleRight">
                <div className="roleDates">Feb 2024</div>
                <div className="roleLoc">Remote</div>
              </div>
            </div>
          </div>

          <div className="role">
            <div className="roleTop">
              <div>
                <div className="roleCompany">Virginia Tech</div>
                <div className="roleTitle">Ph.D. Chemistry</div>
              </div>
              <div className="roleRight">
                <div className="roleDates">May 2017</div>
                <div className="roleLoc">Blacksburg, VA</div>
              </div>
            </div>
          </div>

          <div className="role">
            <div className="roleTop">
              <div>
                <div className="roleCompany">Towson University</div>
                <div className="roleTitle">
                  B.S. Chemistry · Honors College · Summa cum laude
                </div>
              </div>
              <div className="roleRight">
                <div className="roleDates">May 2007</div>
                <div className="roleLoc">Towson, MD</div>
              </div>
            </div>
          </div>
        </section>

        {/* SKILLS */}
        <section style={{ marginTop: SECTION_GAP }}>
          <h2 className="resumeH2">Skills</h2>

          <div className="skillsGrid">
            <div>
              <div className="skillsHead">
                <strong>Test Automation & Frameworks</strong>
              </div>
              <div className="skillsLine">
                Playwright · TypeScript · Selenium · CodeceptJS
              </div>
            </div>
            <div>
              <div className="skillsHead">
                <strong>APIs & Security</strong>
              </div>
              <div className="skillsLine">GraphQL · REST · RBAC · OAuth2</div>
            </div>
            <div>
              <div className="skillsHead">
                <strong>CI/CD & Observability</strong>
              </div>
              <div className="skillsLine">
                GitLab CI · Xray · Allure · Datadog
              </div>
            </div>
            <div>
              <div className="skillsHead">
                <strong>Data & Performance</strong>
              </div>
              <div className="skillsLine">MongoDB · K6 · Postman · OpenAPI</div>
            </div>
          </div>
        </section>

        {/* STRENGTHS */}
        <section style={{ marginTop: SECTION_GAP }}>
          <h2 className="resumeH2">Strengths</h2>
          <p className="resumeP" style={{ marginBottom: 0 }}>
            Strategic leadership · Architectural thinking · Technical depth ·
            Cross-functional communication · Detail-oriented
          </p>
        </section>
      </article>
    </section>
  );
}
