// app/guestbook/page.jsx
import GuestbookClient from "./GuestbookClient";

export const dynamic = "force-dynamic";

export default function GuestbookPage() {
  return (
    <section className="page">
      <h1>Guestbook</h1>
      <div className="guestbookCtaRow">
        <p className="lede">Saved photobooth snaps + messages.</p>
        <a className="btn" href="/photobooth">
          {`--> Go to Photobooth`}
        </a>
      </div>

      <GuestbookClient />
    </section>
  );
}
