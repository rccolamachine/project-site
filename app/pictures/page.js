import Image from "next/image";
import PageIntro from "@/components/PageIntro";

const photos = [
  { src: "/pictures/01.jpg", title: "Morning light", year: "2026" },
  { src: "/pictures/02.jpg", title: "Street scene", year: "2026" },
  { src: "/pictures/03.jpg", title: "Quiet corner", year: "2026" },
];

export default function Pictures() {
  return (
    <section className="page">
      <PageIntro title="Pictures" lede="A small gallery. Add more anytime." />

      <div className="grid">
        {photos.map((p) => (
          <figure key={p.src} className="tile">
            <Image src={p.src} alt={p.title} width={1200} height={800} />
            <figcaption>
              <div className="capTitle">{p.title}</div>
              <div className="capMeta">{p.year}</div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
