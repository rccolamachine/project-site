export default function sitemap() {
  const baseUrl = "https://rccolamachine.com";

  return [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/resume`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/photobooth`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/guestbook`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/button`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/todo`,
      lastModified: new Date(),
    },
  ];
}
