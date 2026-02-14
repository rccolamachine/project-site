export default function Footer() {
  return (
    <footer className="footer">
      <div className="footerInner">
        <span>© {new Date().getFullYear()} Rob Chapleski</span>
        <span className="dot">•</span>
        <a
          href="https://www.rccolamachine.com"
          target="_blank"
          rel="noreferrer"
        >
          rccolamachine
        </a>
        <span className="dot">•</span>
        <a
          href="https://github.com/rccolamachine"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        <span className="dot">•</span>
        <a
          href="https://www.linkedin.com/in/robert-chapleski"
          target="_blank"
          rel="noreferrer"
        >
          LinkedIn
        </a>
      </div>
    </footer>
  );
}
