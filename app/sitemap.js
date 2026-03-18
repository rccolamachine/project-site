import { SITEMAP_PATHS } from "@/data/siteNavigation";

export default function sitemap() {
  const baseUrl = "https://rccolamachine.com";
  const lastModified = new Date();

  return SITEMAP_PATHS.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified,
  }));
}
