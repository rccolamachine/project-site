"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { HOME_SECTIONS } from "@/data/siteNavigation";

function singularizeForHeader(word) {
  const w = String(word || "")
    .trim()
    .toLowerCase();
  if (!w) return "";

  if (w.length > 1 && w.endsWith("s")) return w.slice(0, -1);

  return w;
}

function titleFromPath(pathname) {
  if (!pathname || pathname === "/") return "cola";

  const first =
    pathname.split("?")[0].split("#")[0].split("/").filter(Boolean)[0] ||
    "cola";
  return first.toLowerCase();
}

function isRouteActive(pathname, href) {
  const safePathname = String(pathname || "");
  const safeHref = String(href || "");
  if (!safeHref) return false;
  if (safeHref === "/") return safePathname === "/";
  return safePathname === safeHref || safePathname.startsWith(`${safeHref}/`);
}

function linksFromSection(sectionName) {
  const section = HOME_SECTIONS.find(
    (item) => String(item?.title || "").toLowerCase() === sectionName.toLowerCase(),
  );
  if (!Array.isArray(section?.cards)) return [];

  return section.cards.map((card) => ({
    href: card.href,
    label: card.title,
  }));
}

function groupHasActiveRoute(pathname, links) {
  return links.some((link) => isRouteActive(pathname, link.href));
}

const NAV_DROPDOWNS = [
  { key: "play", label: "Play", links: linksFromSection("Play") },
  { key: "learn", label: "Learn", links: linksFromSection("Learn") },
];

function closeOpenNavDropdowns(exceptDropdown = null) {
  if (typeof document === "undefined") return;
  const openDropdowns = document.querySelectorAll(".navDropdown[open]");
  openDropdowns.forEach((node) => {
    if (node !== exceptDropdown) {
      node.removeAttribute("open");
    }
  });
}

export default function SiteHeader() {
  const pathname = usePathname();
  const isHomeActive = isRouteActive(pathname, "/");
  const raw = titleFromPath(pathname);
  const middle = raw === "cola" ? "cola" : singularizeForHeader(raw);
  const brandTextLength = `rc${middle}machine`.length;
  const brandFontSize =
    brandTextLength >= 22
      ? 8
      : brandTextLength >= 18
        ? 9
      : brandTextLength >= 15
          ? 10
          : 11;

  useEffect(() => {
    closeOpenNavDropdowns();
  }, [pathname]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".navDropdown")) return;
      closeOpenNavDropdowns();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeOpenNavDropdowns();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <header className="nav">
      <div className="navInner">
        <Link
          className="brand"
          href="/"
          prefetch={false}
          style={{ "--brand-font-size": `${brandFontSize}px` }}
        >
          <span className="brandArt" aria-hidden="true">
            <Image
              src="/brand/pixel-rob.png"
              alt=""
              className="brandAvatar"
              width={48}
              height={48}
              priority
            />
          </span>
          <span className="brandText">
            <span className="frame">rc</span>
            <span className="mid">{middle}</span>
            <span className="frame">machine</span>
          </span>
        </Link>

        <nav className="links" aria-label="Primary">
          <Link
            aria-current={isHomeActive ? "page" : undefined}
            className={`navControl${isHomeActive ? " active" : ""}`}
            href="/"
            prefetch={false}
          >
            Home
          </Link>

          {NAV_DROPDOWNS.map((group) => {
            const isGroupActive = groupHasActiveRoute(pathname, group.links);
            return (
              <details
                key={group.key}
                className={`navDropdown${isGroupActive ? " active" : ""}`}
                onToggle={(event) => {
                  const dropdown = event.currentTarget;
                  if (!(dropdown instanceof HTMLDetailsElement) || !dropdown.open) return;
                  closeOpenNavDropdowns(dropdown);
                }}
              >
                <summary className="navControl navDropdownSummary">{group.label}</summary>
                <div className="navDropdownMenu">
                  {group.links.map((route) => {
                    const isItemActive = isRouteActive(pathname, route.href);
                    return (
                      <Link
                        key={route.href}
                        aria-current={isItemActive ? "page" : undefined}
                        className={`navControl navDropdownLink${
                          isItemActive ? " active" : ""
                        }`}
                        href={route.href}
                        prefetch={false}
                      >
                        {route.label}
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
