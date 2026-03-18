import Image from "next/image";
import PageIntro from "@/components/PageIntro";
import PublicationTitle from "@/components/publications/PublicationTitle";
import { publicationsCatalog } from "@/data/publicationsCatalog";
import { getResolvedPublications } from "@/lib/publications/catalog";
import styles from "./publications.module.css";

export const metadata = {
  title: "Publications | rccolamachine",
  description:
    "Computational chemistry publication list with PDF availability and source links.",
};

export default async function PublicationsPage() {
  const publications = await getResolvedPublications(publicationsCatalog);

  return (
    <section className="page">
      <PageIntro
        title="Publications"
        lede="Computational chemistry papers I have written and contributed to."
      />

      <div className={styles.publicationsGrid}>
        {publications.map((publication) => {
          const previewHref = publication.pdfPath || publication.sourceUrl;
          const hasPdf = Boolean(publication.pdfPath);

          return (
            <article className={`card ${styles.publicationCard}`} key={publication.slug}>
              <a
                href={previewHref}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.publicationPreviewLink}
                aria-label={`Open ${hasPdf ? "PDF" : "source page"} for ${publication.title}`}
              >
                {publication.previewPath ? (
                  <Image
                    src={publication.previewPath}
                    alt={`Preview image for ${publication.title}`}
                    fill
                    sizes="(max-width: 900px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className={styles.publicationPreviewImage}
                  />
                ) : (
                  <div className={styles.publicationPreviewFallback}>
                    <span>Preview coming soon</span>
                  </div>
                )}
              </a>
              <PublicationTitle
                title={publication.title}
                className={styles.publicationTitle}
                formulaClassName={styles.chemFormula}
                subClassName={styles.chemSub}
              />
              <p className={styles.publicationMeta}>
                {publication.journal} {publication.year ? `(${publication.year})` : ""}
              </p>
              <div className={styles.publicationActions}>
                {hasPdf ? (
                  <a
                    href={publication.pdfPath}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn"
                  >
                    Open PDF
                  </a>
                ) : (
                  <button type="button" className="btn" disabled>
                    PDF coming soon
                  </button>
                )}
                <a
                  href={publication.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn"
                >
                  Source page
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
