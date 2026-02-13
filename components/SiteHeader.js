"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const routeLabel = (pathname) => {
  if (pathname === "/") return "cola";
  if (pathname.startsWith("/pictures")) return "pictures";
  if (pathname.startsWith("/about")) return "about";
  if (pathname.startsWith("/photobooth")) return "photobooth";
  if (pathname.startsWith("/guestbook")) return "guestbook";
  if (pathname.startsWith("/resume")) return "resume";
  return "cola";
};

function singularizeForHeader(word) {
  const w = String(word || "")
    .trim()
    .toLowerCase();
  if (!w) return "";

  // If it ends with "s", drop the last "s"
  // pictures -> picture, projects -> project, uploads -> upload
  if (w.length > 1 && w.endsWith("s")) return w.slice(0, -1);

  return w;
}

function titleFromPath(pathname) {
  // "/" -> "cola"
  if (!pathname || pathname === "/") return "cola";

  // "/guestbook" -> "guestbook"
  // "/photos/123" -> "photos"
  const first =
    pathname.split("?")[0].split("#")[0].split("/").filter(Boolean)[0] ||
    "cola";
  return first.toLowerCase();
}

export default function SiteHeader() {
  const pathname = usePathname();
  const raw = titleFromPath(pathname);
  const middle = raw === "cola" ? "cola" : singularizeForHeader(raw);

  return (
    <header className="nav">
      <div className="navInner">
        <Link className="brand" href="/">
          <span className="frame">rc</span>
          <span className="mid">{middle}</span>
          <span className="frame">machine</span>
        </Link>

        <nav className="links" aria-label="Primary">
          <Link className={pathname === "/" ? "active" : ""} href="/">
            Home
          </Link>
          <Link
            className={pathname.startsWith("/pictures") ? "active" : ""}
            href="/pictures"
          >
            Pictures
          </Link>
          <Link
            className={pathname.startsWith("/about") ? "active" : ""}
            href="/about"
          >
            About
          </Link>
          <Link
            className={pathname.startsWith("/resume") ? "active" : ""}
            href="/resume"
          >
            Resume
          </Link>
          <Link
            className={pathname.startsWith("/button") ? "active" : ""}
            href="/button"
          >
            Button
          </Link>
          <Link
            className={pathname.startsWith("/photobooth") ? "active" : ""}
            href="/photobooth"
          >
            Photobooth
          </Link>
          <Link
            className={pathname.startsWith("/guestbook") ? "active" : ""}
            href="/guestbook"
          >
            Guestbook
          </Link>
        </nav>
      </div>
    </header>
  );
}
