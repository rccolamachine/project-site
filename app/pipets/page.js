import PageIntro from "@/components/PageIntro";
import PipetsFrame from "./PipetsFrame";
import "./pipets.css";

export const metadata = {
  title: "pipets | rccolamachine",
  description:
    "A live, read-only window into a little pet that lives on a Raspberry Pi: it explores a big world, builds things, and keeps a research journal with its own photos and recordings.",
};

// The pet and its world live in their own project (the petworld repo) and run on a
// Raspberry Pi at home. The Pi pushes a read-only feed to the petworld cloud app, which
// serves the watch page embedded here.
// NEXT_PUBLIC_PIPETS_WATCH_URL is the new name; the old PETWORLD name still works until Vercel is switched
const WATCH_URL = process.env.NEXT_PUBLIC_PIPETS_WATCH_URL || process.env.NEXT_PUBLIC_PETWORLD_WATCH_URL || "";

export default function PipetsPage() {
  return (
    <section className="page petPage">
      <PageIntro
        title="pipets"
        lede="A small, earnest, slightly awkward creature lives full-time on a Raspberry Pi in my house. Its world runs on our clock (same sun, moon and seasons), and nothing here is scripted: it decides what to do, makes friends, builds its home up from a tent, and keeps a research journal with its own photos, videos and sound recordings. This page is a read-only window. Just watch."
      />
      {WATCH_URL ? (
        <PipetsFrame src={WATCH_URL} />
      ) : (
        <div className="petFeedNotice">The pet is still moving in. Check back soon.</div>
      )}
    </section>
  );
}
