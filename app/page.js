import Link from "next/link";

export default function Home() {
  return (
    <section className="page">
      <h1>Hi, I’m Rob.</h1>
      <p className="lede">
        Personal site for photos, projects, and whatever I’m building next.
      </p>

      <div className="cardRow">
        <div className="card">
          <h2>Pictures</h2>
          <p>A small gallery (easy to expand).</p>
          <Link className="btn" href="/pictures">
            View pictures
          </Link>
        </div>

        <div className="card">
          <h2>About</h2>
          <p>Short bio + links.</p>
          <Link className="btn" href="/about">
            Read more
          </Link>
        </div>

        <div className="card">
          <h2>Photobooth</h2>
          <p>Live camera view in a canvas.</p>
          <Link className="btn" href="/photobooth">
            Try it
          </Link>
        </div>
      </div>
    </section>
  );
}
