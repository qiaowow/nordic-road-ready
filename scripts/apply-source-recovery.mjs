import { readFile, writeFile } from "node:fs/promises";

const [sourcesRaw, recoveryRaw] = await Promise.all([
  readFile("data/sources.json", "utf8"),
  readFile("research/archive-recovery.json", "utf8"),
]);
const sources = JSON.parse(sourcesRaw);
const recovery = JSON.parse(recoveryRaw);
const sourceById = new Map(sources.map((source) => [source.id, source]));

let updated = 0;
for (const item of recovery.failures) {
  const source = sourceById.get(item.sourceId);
  if (!source || item.verificationStatus?.startsWith("unverified")) continue;
  const nextUrl = item.replacementUrl ?? item.archiveUrl;
  if (!nextUrl || !nextUrl.startsWith("https://") || source.url === nextUrl) continue;
  source.notes = [
    source.notes,
    `Recovered on ${item.accessDate}: ${item.status}. Previous URL: ${source.url}`,
  ].filter(Boolean).join(" ");
  source.url = nextUrl;
  if (!new URL(nextUrl).pathname.toLowerCase().endsWith(".pdf")) {
    source.archivePath = `source-archive/${source.id}.html`;
  }
  updated += 1;
}

await writeFile("data/sources.json", `${JSON.stringify(sources, null, 2)}\n`);
console.log(`SOURCE_RECOVERY_APPLIED: updated=${updated}`);
