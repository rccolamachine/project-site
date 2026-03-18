import { promises as fs } from "node:fs";
import path from "node:path";

const PREVIEW_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const PDF_EXTENSION = ".pdf";
const FILE_PREFIX = "pub-";
const PREVIEW_SUFFIX = "-preview";

function getPublicationsDirectory() {
  return path.join(process.cwd(), "public", "publications");
}

export function normalizePublicationFileKey(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const baseName = path.basename(fileName, ext);

  if (baseName.endsWith(PREVIEW_SUFFIX)) {
    return baseName.slice(0, -PREVIEW_SUFFIX.length);
  }

  return baseName;
}

export async function getPublicationAssetMap() {
  const publicationsDir = getPublicationsDirectory();

  try {
    const dirEntries = await fs.readdir(publicationsDir, { withFileTypes: true });
    const fileMap = new Map();

    for (const entry of dirEntries) {
      if (!entry.isFile()) continue;

      const fileName = entry.name;
      const ext = path.extname(fileName).toLowerCase();
      const key = normalizePublicationFileKey(fileName);
      const existing = fileMap.get(key) ?? { key };

      if (ext === PDF_EXTENSION) {
        existing.pdfPath = `/publications/${fileName}`;
      } else if (PREVIEW_EXTENSIONS.has(ext)) {
        existing.previewPath = `/publications/${fileName}`;
      }

      fileMap.set(key, existing);
    }

    return fileMap;
  } catch (error) {
    if (error && error.code === "ENOENT") return new Map();
    throw error;
  }
}

function buildKeyCandidates(publication) {
  return [
    publication.pdfFileName
      ? normalizePublicationFileKey(publication.pdfFileName)
      : null,
    `${FILE_PREFIX}${publication.slug}`,
    publication.slug,
  ].filter(Boolean);
}

export function resolvePublicationAssets(publication, publicationAssetMap) {
  const matches = buildKeyCandidates(publication)
    .map((key) => publicationAssetMap.get(key))
    .filter(Boolean);

  return {
    ...publication,
    pdfPath: matches.find((entry) => entry.pdfPath)?.pdfPath ?? null,
    previewPath: matches.find((entry) => entry.previewPath)?.previewPath ?? null,
  };
}

export function sortPublicationsByYearAndTitle(publications) {
  return [...publications].sort(
    (a, b) => b.year - a.year || a.title.localeCompare(b.title),
  );
}

export async function getResolvedPublications(catalog) {
  const publicationAssetMap = await getPublicationAssetMap();
  const resolved = catalog.map((item) =>
    resolvePublicationAssets(item, publicationAssetMap),
  );
  return sortPublicationsByYearAndTitle(resolved);
}
