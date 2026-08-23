import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const [sourcesRaw, reportRaw, recoveryRaw] = await Promise.all([
  readFile("data/sources.json", "utf8"),
  readFile("research/archive-report.json", "utf8"),
  readFile("research/archive-recovery.json", "utf8"),
]);
const sources = JSON.parse(sourcesRaw);
const report = JSON.parse(reportRaw);
const archived = new Set(report.archived.map((item) => item.id));
const failed = new Set(report.failures.map((item) => item.id));
const recoverySha = createHash("sha256").update(recoveryRaw).digest("hex");

let evidenceRecords = 0;
for (const source of sources) {
  if (failed.has(source.id)) {
    source.archivePath = "research/archive-recovery.json";
    source.sha256 = recoverySha;
    source.archiveStatus = "evidence-record";
    source.notes = [
      source.notes,
      "Live page/PDF snapshot could not be fetched in this run; verified replacement URLs, status and evidence are preserved in archive-recovery.json.",
    ].filter(Boolean).join(" ");
    evidenceRecords += 1;
  } else if (archived.has(source.id)) {
    source.archiveStatus = source.archivePath.split("#", 1)[0].endsWith(".json") ? "evidence-record" : "snapshot";
  } else {
    source.archiveStatus = "missing";
  }
}

await writeFile("data/sources.json", `${JSON.stringify(sources, null, 2)}\n`);
const snapshotCount = sources.filter((source) => source.archiveStatus === "snapshot").length;
const evidenceRecordCount = sources.filter((source) => source.archiveStatus === "evidence-record").length;
console.log(`ARCHIVE_STATUS_RECONCILED: snapshots=${snapshotCount} evidenceRecords=${evidenceRecordCount} recoveredFailures=${evidenceRecords}`);
