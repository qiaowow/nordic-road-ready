#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesPath = path.join(root, "data", "sources.json");
const assetsPath = path.join(root, "data", "assets.json");
const sources = JSON.parse(await readFile(sourcesPath, "utf8"));
const assets = JSON.parse(await readFile(assetsPath, "utf8"));
const failures = [];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

async function fetchBytes(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "NordicRoadReadyResearch/1.0" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

async function fetchReadable(url) {
  return (await fetchBytes(`https://r.jina.ai/${url}`)).toString("utf8");
}

async function snapshot(source) {
  const archiveFilePath = source.archivePath.split("#", 1)[0];
  const target = path.resolve(root, archiveFilePath);
  if (!target.startsWith(root + path.sep)) throw new Error("archive path leaves workspace");
  await mkdir(path.dirname(target), { recursive: true });
  try {
    const existing = await readFile(target);
    if (existing.length > 0) {
      source.sha256 = sha256(existing);
      source.archiveStatus = path.extname(target).toLowerCase() === ".json" ? "evidence-record" : "snapshot";
      return { id: source.id, archivePath: source.archivePath, sha256: source.sha256, bytes: existing.length, reused: true };
    }
  } catch {
    // Missing snapshots are fetched below.
  }
  const extension = path.extname(target).toLowerCase();
  let bytes;
  if (extension === ".pdf") {
    bytes = await fetchBytes(source.url);
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("response is not a PDF");
  } else if (extension === ".json") {
    const relatedAssets = assets.filter((asset) => asset.sourceId === source.id);
    bytes = Buffer.from(JSON.stringify({ archivedAt: new Date().toISOString(), source, assets: relatedAssets }, null, 2));
  } else {
    let readable;
    try {
      readable = await fetchReadable(source.url);
    } catch {
      readable = (await fetchBytes(source.url)).toString("utf8");
    }
    const html = `<!doctype html><meta charset="utf-8"><title>${escapeHtml(source.title)}</title>`
      + `<h1>${escapeHtml(source.title)}</h1><p>Publisher: ${escapeHtml(source.publisher)}</p>`
      + `<p>Original URL: <a href="${source.url}">${source.url}</a></p>`
      + `<p>Archived: ${new Date().toISOString()}</p><pre>${escapeHtml(readable)}</pre>`;
    bytes = Buffer.from(html);
  }
  await writeFile(target, bytes);
  source.sha256 = sha256(bytes);
  source.archiveStatus = extension === ".json" ? "evidence-record" : "snapshot";
  return { id: source.id, archivePath: source.archivePath, sha256: source.sha256, bytes: bytes.length };
}

const queue = [...sources];
const results = [];
async function worker() {
  while (queue.length) {
    const source = queue.shift();
    try { results.push(await snapshot(source)); }
    catch (error) {
      source.archiveStatus = "missing";
      failures.push({ id: source.id, url: source.url, error: String(error) });
    }
  }
}

await Promise.all(Array.from({ length: 3 }, () => worker()));
await writeFile(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
await mkdir(path.join(root, "research"), { recursive: true });
await writeFile(
  path.join(root, "research", "archive-report.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), archived: results, failures }, null, 2) + "\n",
);

console.log(`ARCHIVE_DONE: archived=${results.length} failures=${failures.length}`);
if (failures.length) {
  for (const failure of failures) console.error(`- ${failure.id}: ${failure.error}`);
  process.exitCode = 1;
}
