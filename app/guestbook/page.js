// app/guestbook/page.jsx
import GuestbookClient from "./GuestbookClient";

export const dynamic = "force-dynamic";

export default function GuestbookPage() {
  return (
    <section className="page">
      <header style={{ marginBottom: 16 }}>
        <h1>Guestbook</h1>
        <p className="lede">Saved Pixelbooth snaps + messages.</p>
      </header>
      <div className="guestbookCtaRow">
        <a className="btn" href="/pixelbooth">
          {`Go to Pixelbooth`}
        </a>
      </div>

      <GuestbookClient />
    </section>
  );
}
