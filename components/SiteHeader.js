"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();
  const middle = "cola";

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
            className={pathname.startsWith("/farm") ? "active" : ""}
            href="/farm"
            prefetch={false}
          >
            Farm
          </Link>
          <Link
            className={pathname.startsWith("/pixelbooth") ? "active" : ""}
            href="/pixelbooth"
          >
            Pixelbooth
          </Link>
          <Link
            className={pathname.startsWith("/reactor") ? "active" : ""}
            href="/reactor"
            prefetch={false}
          >
            Reactor
          </Link>
          <Link
            className={pathname.startsWith("/button") ? "active" : ""}
            href="/button"
          >
            Button
          </Link>
          <Link
            className={pathname.startsWith("/about") ? "active" : ""}
            href="/about"
          >
            About
          </Link>
          <Link
            className={pathname.startsWith("/guestbook") ? "active" : ""}
            href="/guestbook"
          >
            Guestbook
          </Link>
          <Link
            className={pathname.startsWith("/resume") ? "active" : ""}
            href="/resume"
          >
            Resume
          </Link>
          <Link
            className={pathname.startsWith("/todo") ? "active" : ""}
            href="/todo"
          >
            To-Do
          </Link>
          <Link
            className={pathname.startsWith("/pictures") ? "active" : ""}
            href="/pictures"
          >
            Pictures
          </Link>
        </nav>
      </div>
    </header>
  );
}
