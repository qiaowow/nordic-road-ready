import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [researchRaw, assetsRaw, sourcesRaw] = await Promise.all([
  readFile("research/image-manifest.json", "utf8"),
  readFile("data/assets.json", "utf8"),
  readFile("data/sources.json", "utf8"),
]);

const research = JSON.parse(researchRaw);
const assets = JSON.parse(assetsRaw);
const sources = JSON.parse(sourcesRaw);
const assetIds = new Set(assets.map((asset) => asset.id));
const sourceIds = new Set(sources.map((source) => source.id));
const manifestSha = createHash("sha256").update(researchRaw).digest("hex");

function countryCode(country) {
  if (country === "Norway") return "NO";
  if (country === "Iceland") return "IS";
  throw new Error(`Unsupported country: ${country}`);
}

function licenseCode(license) {
  const normalized = license.toUpperCase();
  if (normalized === "CC0") return "cc0";
  if (normalized.startsWith("CC BY-SA")) return "cc-by-sa";
  if (normalized.startsWith("CC BY")) return "cc-by";
  throw new Error(`Unsupported photo license: ${license}`);
}

function pageTitle(item) {
  const filePart = decodeURIComponent(new URL(item.sourcePageURL).pathname.split("/").at(-1) ?? item.id)
    .replace(/^File:/, "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replaceAll("_", " ");
  return filePart || item.id;
}

let addedAssets = 0;
let addedSources = 0;
for (const item of research.assets) {
  if (assetIds.has(item.id)) continue;
  const country = countryCode(item.country);
  if (item.assetType === "official-sign") {
    assets.push({
      id: item.id,
      type: "image",
      country,
      title: `${country === "NO" ? "挪威" : "冰岛"}官方 ${item.signCode} 标志：${item.description}`,
      url: item.sourceURL,
      alt: `${country === "NO" ? "挪威" : "冰岛"}官方交通标志 ${item.signCode}：${item.description}`,
      grade: "A",
      countryEvidence: item.locationEvidence,
      countryEvidenceUrl: item.locationEvidenceURL,
      license: "government-open",
      licenseText: item.license,
      licenseUrl: item.licenseURL,
      termsUrl: item.termsURL,
      attribution: item.officialAgency,
      officialAgency: item.officialAgency,
      sourceId: country === "NO" ? "src-assets-no-official-signs" : "src-assets-is-official-signs",
      downloadedAt: item.downloadDate,
      sha256: item.originalSHA256,
      sourceArchiveSha256: item.sourceArchiveSHA256,
      localPath: item.localPath,
      sourcePageUrl: item.sourcePageURL,
      signCode: item.signCode,
      derivation: item.derivation,
    });
    assetIds.add(item.id);
    addedAssets += 1;
    continue;
  }
  if (item.assetType !== "local-photo") continue;
  const title = pageTitle(item);
  const sourceId = `src-asset-${item.id}`;

  if (!sourceIds.has(sourceId)) {
    sources.push({
      id: sourceId,
      country,
      title: `${title} photo source`,
      publisher: item.sourcePageURL.includes("commons.wikimedia.org") ? "Wikimedia Commons" : item.author,
      sourceType: "licensed-media",
      authorityLevel: "secondary",
      url: item.sourcePageURL,
      language: "en",
      accessedAt: item.downloadDate,
      archivePath: "research/image-manifest.json",
      sha256: manifestSha,
      claimCoverage: [],
      notes: "License, location evidence and original binary hash are preserved in the research image manifest.",
    });
    sourceIds.add(sourceId);
    addedSources += 1;
  }

  assets.push({
    id: item.id,
    type: "image",
    country,
    title: `${country === "NO" ? "挪威" : "冰岛"}当地实景：${title}`,
    url: item.sourceURL,
    alt: `${country === "NO" ? "挪威" : "冰岛"}当地道路实景，${title}`,
    grade: "B",
    countryEvidence: item.locationEvidence,
    countryEvidenceUrl: item.locationEvidenceURL,
    license: licenseCode(item.license),
    licenseText: item.license,
    licenseUrl: item.licenseURL,
    attribution: item.author,
    author: item.author,
    sourceId,
    downloadedAt: item.downloadDate,
    sha256: item.originalSHA256,
    localPath: item.localPath,
    sourcePageUrl: item.sourcePageURL,
    derivation: item.derivation,
  });
  assetIds.add(item.id);
  addedAssets += 1;
}

for (const source of sources) {
  if (source.id.startsWith("src-assets-") && source.id.includes("-photo-")) {
    source.sourceType = "licensed-media";
  }
}

await Promise.all([
  writeFile("data/assets.json", `${JSON.stringify(assets, null, 2)}\n`),
  writeFile("data/sources.json", `${JSON.stringify(sources, null, 2)}\n`),
]);

console.log(`RESEARCH_ASSETS_MERGED: assets=${addedAssets} sources=${addedSources} totals=${assets.length}/${sources.length}`);
