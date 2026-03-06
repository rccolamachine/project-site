import PageIntro from "@/components/PageIntro";
import GuestbookPageClient from "./GuestbookPageClient";

export const dynamic = "force-dynamic";

export default function GuestbookPage() {
  return (
    <section className="page">
      <PageIntro title="Guestbook" lede="Saved Pixelbooth snaps + messages." />
      <GuestbookPageClient />
    </section>
  );
}
