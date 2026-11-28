import PageIntro from "@/components/PageIntro";
import PipetsFrame from "./PipetsFrame";
import "./pipets.css";

export const metadata = {
  title: "Pipets | rccolamachine",
  description:
    "A live, read-only window into two small creatures on a Raspberry Pi. They explore a big world, learn, build, and keep research journals.",
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
        title="Pipets"
        lede="Two small, awkward cube creatures live full-time on a Raspberry Pi in my house. Their world runs on our clock, and nothing is scripted: they learn, make friends, build their homes up from a tent, and keep research journals with their own photos and recordings. This page is a read-only window. Just watch."
      />
      {WATCH_URL ? (
        <PipetsFrame src={WATCH_URL} />
      ) : (
        <div className="petFeedNotice">The pet is still moving in. Check back soon.</div>
      )}
    </section>
  );
}
