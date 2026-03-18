const FOOTER_LINKS = [
  { href: "https://www.rccolamachine.com", label: "rccolamachine" },
  { href: "https://github.com/rccolamachine", label: "GitHub" },
  {
    href: "https://www.linkedin.com/in/robert-chapleski",
    label: "LinkedIn",
  },
  { href: "mailto:rob@mail.rccolamachine.com", label: "Email" },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footerInner">
        <span>&copy; {new Date().getFullYear()} Rob Chapleski</span>
        {FOOTER_LINKS.map((link) => (
          <span key={link.href}>
            <span className="dot"> &middot; </span>
            <a
              href={link.href}
              target={link.href.startsWith("http") ? "_blank" : undefined}
              rel={link.href.startsWith("http") ? "noreferrer" : undefined}
            >
              {link.label}
            </a>
          </span>
        ))}
      </div>
    </footer>
  );
}
