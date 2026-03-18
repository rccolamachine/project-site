"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HEADER_NAV_LINKS } from "@/data/siteNavigation";

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

export default function SiteHeader() {
  const pathname = usePathname();
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
          {HEADER_NAV_LINKS.map((route) => (
            <Link
              key={route.href}
              className={isRouteActive(pathname, route.href) ? "active" : ""}
              href={route.href}
              prefetch={false}
            >
              {route.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
