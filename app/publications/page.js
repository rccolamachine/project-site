import PageIntro from "@/components/PageIntro";
import { publicationsCatalog } from "@/data/publicationsCatalog";
import { getResolvedPublications } from "@/lib/publications/catalog";
import PublicationsClient from "./PublicationsClient";

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

      <PublicationsClient publications={publications} />
    </section>
  );
}
