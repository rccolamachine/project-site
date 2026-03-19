import Image from "next/image";
import Link from "next/link";
import { statSync } from "node:fs";
import { join } from "node:path";
import { HOME_SECTIONS } from "@/data/siteNavigation";
import DesktopBadge from "../components/DesktopBadge";
import FarmWinHomeCorner from "../components/FarmWinHomeCorner";
import HomeContactForm from "../components/HomeContactForm";

function getPublicAssetVersion(assetPath) {
  const safeAssetPath = String(assetPath || "")
    .trim()
    .replace(/^\/+/, "");
  if (!safeAssetPath) return "1";

  try {
    const absolutePath = join(process.cwd(), "public", safeAssetPath);
    return String(Math.floor(statSync(absolutePath).mtimeMs));
  } catch {
    return "1";
  }
}

const CONTACT_ICON_VERSION = getPublicAssetVersion("/brand/contact-ufo.png");
const HOME_SECTION_ICON_VERSIONS = Object.fromEntries(
  HOME_SECTIONS.map((section) => [
    section.title,
    getPublicAssetVersion(section.iconPath),
  ]),
);

function getSectionTitleClassName(sectionTitle) {
  if (sectionTitle === "Play") return "home-playTitle";
  if (sectionTitle === "Learn") return "home-learnTitle";
  return "";
}

function getSectionIconClassName(sectionTitle) {
  if (sectionTitle === "Play") return "home-playIconImage";
  if (sectionTitle === "Learn") return "home-learnIconImage";
  return "";
}

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
            next. Systems builder, QA engineer, and computational
            chemist.
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

      {HOME_SECTIONS.map((section) => (
        <div key={section.title} className="homeSectionPanel">
          <div className="homeSectionHeader">
            <h2
              className={`homeSectionTitle ${getSectionTitleClassName(section.title)}`.trim()}
            >
              <span>{section.title}</span>
              {section.iconPath ? (
                <Image
                  src={`${section.iconPath}?v=${HOME_SECTION_ICON_VERSIONS[section.title] || "1"}`}
                  alt=""
                  className={getSectionIconClassName(section.title)}
                  width={24}
                  height={24}
                  unoptimized
                  aria-hidden="true"
                />
              ) : null}
            </h2>
            {section.showDesktopBadge ? (
              <div className="homePlayBadgeWrap">
                <DesktopBadge />
              </div>
            ) : null}
          </div>
          <div className="cardRow">
            {section.cards.map((card) => (
              <div
                className={`card${card.title === "Farm Idle" ? " home-farm-card" : ""}`}
                key={card.title}
              >
                {card.title === "Farm Idle" ? <FarmWinHomeCorner /> : null}
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

      <div className="homeSectionPanel">
        <div className="homeSectionHeader">
          <h2 className="homeSectionTitle home-contactTitle">
            <span>Contact</span>
            <Image
              src={`/brand/contact-ufo.png?v=${CONTACT_ICON_VERSION}`}
              alt=""
              className="home-contactUfoImage"
              width={24}
              height={24}
              unoptimized
              aria-hidden="true"
            />
          </h2>
        </div>
        <div className="card home-contactCard">
          <p className="lede home-contactLede">
            Sorry, I can&apos;t come to the phone right now... You know the drill.
          </p>
          <HomeContactForm />
        </div>
      </div>
    </section>
  );
}
