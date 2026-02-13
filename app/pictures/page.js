const photos = [
  { src: "/pictures/01.jpg", title: "Morning light", year: "2026" },
  { src: "/pictures/02.jpg", title: "Street scene", year: "2026" },
  { src: "/pictures/03.jpg", title: "Quiet corner", year: "2026" },
];

export default function Pictures() {
  return (
    <section className="page">
      <h1>Pictures</h1>
      <p className="lede">A small gallery. Add more anytime.</p>

      <div className="grid">
        {photos.map((p) => (
          <figure key={p.src} className="tile">
            <img src={p.src} alt={p.title} loading="lazy" />
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
