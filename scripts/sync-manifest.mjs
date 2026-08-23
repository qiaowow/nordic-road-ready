#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = async (name) => JSON.parse(await readFile(path.join(root, "data", name), "utf8"));
const [manifest, questions, sources, assets] = await Promise.all([
  read("manifest.json"),
  read("questions.json"),
  read("sources.json"),
  read("assets.json"),
]);

manifest.generatedAt = new Date().toISOString();
manifest.questionIds = questions.map(({ id }) => id);
manifest.sourceIds = sources.map(({ id }) => id);
manifest.assetIds = assets.map(({ id }) => id);
manifest.countries = ["NO", "IS"].map((country) => ({
  country,
  questionIds: questions.filter((question) => question.country === country).map(({ id }) => id),
  minimumPublishedQuestions: manifest.releasePolicy.minimumPublishedQuestionsPerCountry,
}));

await writeFile(path.join(root, "data", "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`MANIFEST_SYNCED: questions=${questions.length} sources=${sources.length} assets=${assets.length}`);
