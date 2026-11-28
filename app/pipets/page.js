import PageIntro from "@/components/PageIntro";
import PipetsFrame from "./PipetsFrame";
import "./pipets.css";

export const metadata = {
  title: "Pipets | rccolamachine",
  description:
    "A live, read-only window into two small creatures that live on a Raspberry Pi: they explore a big world on our clock, learn as they go, build things, and keep research journals with their own photos and recordings.",
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
        lede="Two small, earnest, slightly awkward cube creatures live full-time on a Raspberry Pi in my house. Their world runs on our clock (same sun, moon, weather and seasons) and is full of towns, townsfolk, plants and animals. Nothing here is scripted: they decide what to do, learn what to eat and what to fear, make friends, build their homes up from a tent, and keep research journals with their own photos, videos and sound recordings. This page is a read-only window. Switch between 2D and 3D, or just watch."
      />
      {WATCH_URL ? (
        <PipetsFrame src={WATCH_URL} />
      ) : (
        <div className="petFeedNotice">The pet is still moving in. Check back soon.</div>
      )}
    </section>
  );
}
