export default function Footer() {
  return (
    <footer className="footer">
      <div className="footerInner">
        <span>© {new Date().getFullYear()} Rob Chapleski</span>
        <span className="dot">•</span>
        <span>rccolamachine</span>
        <span className="dot">•</span>
        <a href="https://github.com/" target="_blank" rel="noreferrer">
          GitHub
        </a>
        <span className="dot">•</span>
        <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer">
          LinkedIn
        </a>
      </div>
    </footer>
  );
}
