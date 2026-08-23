#!/usr/bin/env node

/**
 * Dependency-free release gate for the content pack.
 *
 * Examples:
 *   node scripts/validate-content.mjs
 *   node scripts/validate-content.mjs --min-published=30 --min-per-country=15
 *   MIN_PUBLISHED_QUESTIONS=30 node scripts/validate-content.mjs
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "..");

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function optionValue(argv, names) {
  for (const name of names) {
    const prefix = `${name}=`;
    const inline = argv.find((argument) => argument.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const index = argv.indexOf(name);
    if (index >= 0 && argv[index + 1]) return argv[index + 1];
  }
  return undefined;
}

function positiveInteger(value, fallback, label, errors) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    errors.push(`${label} must be a non-negative integer; received ${JSON.stringify(value)}`);
    return fallback;
  }
  return parsed;
}

function add(errors, message) {
  errors.push(message);
}

function checkUnique(items, label, errors) {
  const seen = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || item.id.length === 0) {
      add(errors, `${label} has an item without a non-empty id`);
      continue;
    }
    if (seen.has(item.id)) add(errors, `${label} has duplicate id: ${item.id}`);
    seen.add(item.id);
  }
  return seen;
}

function isDate(value, { dateTime = false } = {}) {
  if (typeof value !== "string" || value.length === 0) return false;
  const pattern = dateTime
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/
    : /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().startsWith(value.slice(0, 10));
}

function checkDate(value, label, errors, options) {
  if (!isDate(value, options)) add(errors, `${label} must be a valid ISO ${options?.dateTime ? "datetime" : "date"}: ${JSON.stringify(value)}`);
}

function checkIdArray(value, label, knownIds, errors, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    add(errors, `${label} must be a${allowEmpty ? "" : " non-empty"} array`);
    return;
  }
  const seen = new Set();
  for (const id of value) {
    if (typeof id !== "string" || id.length === 0) add(errors, `${label} contains an invalid id`);
    else if (seen.has(id)) add(errors, `${label} contains duplicate id: ${id}`);
    else if (knownIds && !knownIds.has(id)) add(errors, `${label} references missing id: ${id}`);
    seen.add(id);
  }
}

function parseDataRoot(argv) {
  const supplied = optionValue(argv, ["--data-dir", "--dataRoot"]);
  const env = process.env.CONTENT_DATA_DIR;
  return path.resolve(defaultRoot, supplied || env || "data");
}

function main() {
  const argv = process.argv.slice(2);
  const errors = [];
  const dataRoot = parseDataRoot(argv);
  let manifest;
  let questions;
  let sources;
  let assets;
  try {
    manifest = readJson(path.join(dataRoot, "manifest.json"));
    questions = readJson(path.join(dataRoot, "questions.json"));
    sources = readJson(path.join(dataRoot, "sources.json"));
    assets = readJson(path.join(dataRoot, "assets.json"));
  } catch (error) {
    console.error(`CONTENT_INVALID: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  if (!Array.isArray(questions)) add(errors, "questions.json must contain an array");
  if (!Array.isArray(sources)) add(errors, "sources.json must contain an array");
  if (!Array.isArray(assets)) add(errors, "assets.json must contain an array");
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) add(errors, "manifest.json must contain an object");
  if (errors.length > 0) {
    console.error(`CONTENT_INVALID: ${errors.join("\n")}`);
    process.exitCode = 1;
    return;
  }

  const questionIds = checkUnique(questions, "questions", errors);
  const sourceIds = checkUnique(sources, "sources", errors);
  const assetIds = checkUnique(assets, "assets", errors);
  const phase3FactsPath = path.join(defaultRoot, "research", "official-sources-phase3.json");
  const phase3Facts = fs.existsSync(phase3FactsPath) ? readJson(phase3FactsPath).facts ?? [] : [];
  const phase3FactById = new Map(phase3Facts.map((fact) => [fact.id, fact]));
  const countries = new Set(["NO", "IS"]);
  const statuses = new Set(["draft", "verified", "published", "retired"]);
  const questionTypes = new Set(["single_choice", "multiple_choice", "true_false", "image_choice"]);
  const categories = new Set(["priority", "signs", "speed", "lights", "safety", "weather", "parking", "tolls", "vehicles"]);
  const riskTypes = new Set(["safety-critical", "seasonal", "cost", "navigation", "general"]);
  const sourceTypes = new Set(["official-guidance", "official-law", "road-authority", "public-safety", "licensed-media"]);
  const authorityLevels = new Set(["government", "road-authority", "official-safety", "secondary"]);
  const archiveStatuses = new Set(["snapshot", "evidence-record", "missing"]);
  const assetTypes = new Set(["image", "icon", "diagram"]);
  const assetGrades = new Set(["A", "B", "C"]);
  const assetLicenses = new Set(["cc0", "cc-by", "cc-by-sa", "government-open", "public-domain"]);

  if (manifest.schemaVersion !== 1) add(errors, "manifest.schemaVersion must be 1");
  if (typeof manifest.id !== "string" || !manifest.id) add(errors, "manifest.id is required");
  if (typeof manifest.version !== "string" || !manifest.version) add(errors, "manifest.version is required");
  if (manifest.locale !== "zh-CN") add(errors, "manifest.locale must be zh-CN");
  checkDate(manifest.generatedAt, "manifest.generatedAt", errors, { dateTime: true });
  checkIdArray(manifest.questionIds, "manifest.questionIds", questionIds, errors, { allowEmpty: false });
  checkIdArray(manifest.sourceIds, "manifest.sourceIds", sourceIds, errors, { allowEmpty: false });
  checkIdArray(manifest.assetIds, "manifest.assetIds", assetIds, errors);

  const policy = manifest.releasePolicy;
  if (!policy || typeof policy !== "object") add(errors, "manifest.releasePolicy is required");
  else {
    for (const field of [
      "minimumPublishedQuestions",
      "minimumPublishedQuestionsPerCountry",
      "minimumVerifiedOrPublishedQuestions",
      "minimumImageQuestions",
      "minimumRealPhotoQuestions",
    ]) {
      if (!Number.isInteger(policy[field]) || policy[field] < 0) add(errors, `manifest.releasePolicy.${field} must be a non-negative integer`);
    }
    if (policy.requireTwoSources !== true) add(errors, "manifest.releasePolicy.requireTwoSources must be true");
    if (policy.requireLicensedAssets !== true) add(errors, "manifest.releasePolicy.requireLicensedAssets must be true");
  }

  const published = [];
  const countryPublished = new Map();
  const publishedPrompts = new Map();
  for (const question of questions) {
    const label = `question ${question.id || "<missing>"}`;
    if (!countries.has(question.country)) add(errors, `${label}.country must be NO or IS`);
    if (question.locale !== "zh-CN") add(errors, `${label}.locale must be zh-CN`);
    if (!questionTypes.has(question.type)) add(errors, `${label}.type is unsupported: ${question.type}`);
    if (!categories.has(question.category)) add(errors, `${label}.category is unsupported: ${question.category}`);
    if (!riskTypes.has(question.riskType)) add(errors, `${label}.riskType is unsupported: ${question.riskType}`);
    if (!statuses.has(question.status)) add(errors, `${label}.status is unsupported: ${question.status}`);
    if (!Number.isInteger(question.tripPriority) || question.tripPriority < 1) add(errors, `${label}.tripPriority must be a positive integer`);
    if (typeof question.prompt !== "string" || question.prompt.trim().length < 8) add(errors, `${label}.prompt is too short`);
    if (typeof question.explanation !== "string" || question.explanation.trim().length < 8) add(errors, `${label}.explanation is required`);
    checkDate(question.lastReviewedAt, `${label}.lastReviewedAt`, errors);
    if (question.appliesFrom !== null && question.appliesFrom !== undefined) checkDate(question.appliesFrom, `${label}.appliesFrom`, errors);
    if (question.appliesTo !== null && question.appliesTo !== undefined) checkDate(question.appliesTo, `${label}.appliesTo`, errors);
    if (typeof question.appliesFrom === "string" && typeof question.appliesTo === "string" && question.appliesFrom > question.appliesTo) add(errors, `${label}.appliesFrom must not be after appliesTo`);
    if (!Array.isArray(question.tags) || question.tags.length === 0 || question.tags.some((tag) => typeof tag !== "string" || !tag.trim())) add(errors, `${label}.tags must contain non-empty strings`);
    const phase3Tags = Array.isArray(question.tags) ? question.tags.filter((tag) => tag.startsWith("phase3:")) : [];
    for (const tag of phase3Tags) {
      const factId = tag.slice("phase3:".length);
      const fact = phase3FactById.get(factId);
      if (!fact) {
        add(errors, `${label} references unknown Phase 3 fact: ${factId}`);
        continue;
      }
      const expectedCountry = fact.country === "Norway" ? "NO" : fact.country === "Iceland" ? "IS" : undefined;
      if (question.country !== expectedCountry) add(errors, `${label} country does not match Phase 3 fact ${factId}`);
      const citedUrls = new Set((question.sourceIds || []).map((id) => sources.find((source) => source.id === id)?.url).filter(Boolean));
      for (const requiredUrl of [fact.primaryUrl, fact.secondSource?.url]) {
        if (requiredUrl && !citedUrls.has(requiredUrl)) add(errors, `${label} must cite the exact official URL from Phase 3 fact ${factId}: ${requiredUrl}`);
      }
    }

    const options = question.options;
    if (!Array.isArray(options) || options.length < 2 || options.length > 6) add(errors, `${label}.options must contain 2–6 options`);
    const optionIds = new Set();
    if (Array.isArray(options)) {
      for (const option of options) {
        if (!option || typeof option.id !== "string" || !option.id) add(errors, `${label} has an option without an id`);
        else if (optionIds.has(option.id)) add(errors, `${label} has duplicate option id: ${option.id}`);
        else optionIds.add(option.id);
        if (!option || typeof option.text !== "string" || !option.text.trim()) add(errors, `${label} has an option without text`);
      }
    }
    if (!Array.isArray(question.correctOptionIds) || question.correctOptionIds.length === 0) add(errors, `${label}.correctOptionIds must be non-empty`);
    else {
      if (question.type === "single_choice" || question.type === "true_false" || question.type === "image_choice") {
        if (question.correctOptionIds.length !== 1) add(errors, `${label} must have exactly one correct option`);
      }
      for (const correctId of question.correctOptionIds) if (!optionIds.has(correctId)) add(errors, `${label}.correctOptionIds references missing option: ${correctId}`);
    }
    checkIdArray(question.sourceIds, `${label}.sourceIds`, sourceIds, errors, { allowEmpty: false });
    checkIdArray(question.assetIds, `${label}.assetIds`, assetIds, errors);
    if (question.type === "image_choice" && (!Array.isArray(question.assetIds) || question.assetIds.length === 0)) {
      add(errors, `${label}.image_choice must reference at least one image asset`);
    }

    if (question.status === "published") {
      published.push(question);
      countryPublished.set(question.country, (countryPublished.get(question.country) || 0) + 1);
      const normalizedPrompt = question.prompt.toLocaleLowerCase("zh-CN").replace(/[\p{P}\p{S}\s]+/gu, "");
      if (publishedPrompts.has(normalizedPrompt)) {
        add(errors, `${label} duplicates published prompt from ${publishedPrompts.get(normalizedPrompt)}`);
      } else publishedPrompts.set(normalizedPrompt, question.id);
      if (!Array.isArray(question.sourceIds) || new Set(question.sourceIds).size < 2) add(errors, `${label} must cite at least two distinct sources`);
      const countrySources = (question.sourceIds || []).map((id) => sources.find((source) => source.id === id)).filter(Boolean);
      if (new Set(countrySources.map((source) => source.url)).size < 2) add(errors, `${label} must cite at least two distinct source URLs`);
      if (countrySources.some((source) => source.country !== question.country)) add(errors, `${label} cites a source from another country`);
      if (!countrySources.every((source) => source.claimCoverage?.includes(question.id))) add(errors, `${label} has a cited source without claimCoverage for this question`);
    }
  }

  for (const source of sources) {
    const label = `source ${source.id || "<missing>"}`;
    if (!countries.has(source.country)) add(errors, `${label}.country must be NO or IS`);
    if (typeof source.title !== "string" || !source.title.trim()) add(errors, `${label}.title is required`);
    if (typeof source.publisher !== "string" || !source.publisher.trim()) add(errors, `${label}.publisher is required`);
    if (!sourceTypes.has(source.sourceType)) add(errors, `${label}.sourceType is unsupported: ${source.sourceType}`);
    if (!authorityLevels.has(source.authorityLevel)) add(errors, `${label}.authorityLevel is unsupported: ${source.authorityLevel}`);
    if (typeof source.url !== "string" || !/^https:\/\//.test(source.url)) add(errors, `${label}.url must be an https URL`);
    checkDate(source.accessedAt, `${label}.accessedAt`, errors);
    if (source.publishedAt !== undefined) checkDate(source.publishedAt, `${label}.publishedAt`, errors);
    if (source.publishedAt && source.publishedAt > source.accessedAt) add(errors, `${label}.publishedAt cannot be after accessedAt`);
    if (typeof source.archivePath !== "string" || !source.archivePath.trim()) add(errors, `${label}.archivePath is required`);
    if (!archiveStatuses.has(source.archiveStatus)) add(errors, `${label}.archiveStatus is unsupported: ${source.archiveStatus}`);
    if (typeof source.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(source.sha256)) add(errors, `${label}.sha256 must be a 64-character hex SHA-256`);
    if (!Array.isArray(source.claimCoverage) || source.claimCoverage.some((id) => !questionIds.has(id))) add(errors, `${label}.claimCoverage must contain existing question IDs`);
  }

  for (const asset of assets) {
    const label = `asset ${asset.id || "<missing>"}`;
    if (!assetTypes.has(asset.type)) add(errors, `${label}.type is unsupported: ${asset.type}`);
    if (!countries.has(asset.country)) add(errors, `${label}.country must be NO or IS`);
    if (!assetGrades.has(asset.grade)) add(errors, `${label}.grade must be A, B or C`);
    if (typeof asset.countryEvidence !== "string" || !asset.countryEvidence.trim()) add(errors, `${label}.countryEvidence is required`);
    if (typeof asset.url !== "string" || !/^https:\/\//.test(asset.url)) add(errors, `${label}.url must be an https URL`);
    if (!assetLicenses.has(asset.license)) add(errors, `${label}.license is unsupported: ${asset.license}`);
    if (typeof asset.licenseUrl !== "string" || !/^https:\/\//.test(asset.licenseUrl)) add(errors, `${label}.licenseUrl must be an https URL`);
    if (typeof asset.attribution !== "string" || !asset.attribution.trim()) add(errors, `${label}.attribution is required`);
    if (!sourceIds.has(asset.sourceId)) add(errors, `${label}.sourceId references missing source: ${asset.sourceId}`);
    else if (sources.find((source) => source.id === asset.sourceId)?.country !== asset.country) add(errors, `${label}.sourceId country does not match asset.country`);
    checkDate(asset.downloadedAt, `${label}.downloadedAt`, errors);
    if (typeof asset.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(asset.sha256)) add(errors, `${label}.sha256 must be a 64-character hex SHA-256`);
    if (asset.localPath !== undefined && (typeof asset.localPath !== "string" || !asset.localPath.trim() || asset.localPath.includes(".."))) add(errors, `${label}.localPath must be a safe non-empty relative path`);
    if (typeof asset.localPath === "string" && asset.localPath.trim() && !asset.localPath.includes("..")) {
      const localAssetPath = path.resolve(defaultRoot, asset.localPath);
      if (!fs.existsSync(localAssetPath)) add(errors, `${label}.localPath does not exist: ${asset.localPath}`);
      else {
        const localHash = crypto.createHash("sha256").update(fs.readFileSync(localAssetPath)).digest("hex");
        const expectedLocalHash = asset.optimizedSha256 || asset.sha256;
        if (localHash.toLowerCase() !== expectedLocalHash.toLowerCase()) add(errors, `${label}.${asset.optimizedSha256 ? "optimizedSha256" : "sha256"} does not match the local file`);
      }
    }
    if (asset.sourcePageUrl !== undefined && (typeof asset.sourcePageUrl !== "string" || !/^https:\/\//.test(asset.sourcePageUrl))) add(errors, `${label}.sourcePageUrl must be an https URL`);
    if (asset.countryEvidenceUrl !== undefined && (typeof asset.countryEvidenceUrl !== "string" || !/^https:\/\//.test(asset.countryEvidenceUrl))) add(errors, `${label}.countryEvidenceUrl must be an https URL`);
    if (asset.signCode !== undefined && (typeof asset.signCode !== "string" || !asset.signCode.trim())) add(errors, `${label}.signCode must be a non-empty string when present`);
    if (asset.sourceArchiveSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(asset.sourceArchiveSha256)) add(errors, `${label}.sourceArchiveSha256 must be a 64-character hex SHA-256`);
    if (asset.optimizedSha256 !== undefined && !/^[a-f0-9]{64}$/i.test(asset.optimizedSha256)) add(errors, `${label}.optimizedSha256 must be a 64-character hex SHA-256`);
    if (asset.optimizedBytes !== undefined && (!Number.isInteger(asset.optimizedBytes) || asset.optimizedBytes <= 0)) add(errors, `${label}.optimizedBytes must be a positive integer`);
    if (asset.originalArchivePath !== undefined && (typeof asset.originalArchivePath !== "string" || !asset.originalArchivePath.trim() || asset.originalArchivePath.includes(".."))) add(errors, `${label}.originalArchivePath must be a safe non-empty relative path`);
    if (typeof asset.originalArchivePath === "string" && asset.originalArchivePath.trim() && !asset.originalArchivePath.includes("..")) {
      const originalAssetPath = path.resolve(defaultRoot, asset.originalArchivePath);
      if (!fs.existsSync(originalAssetPath)) add(errors, `${label}.originalArchivePath does not exist: ${asset.originalArchivePath}`);
      else {
        const originalHash = crypto.createHash("sha256").update(fs.readFileSync(originalAssetPath)).digest("hex");
        if (originalHash.toLowerCase() !== asset.sha256.toLowerCase()) add(errors, `${label}.sha256 does not match the preserved original file`);
      }
    }
  }

  for (const question of published) {
    for (const assetId of question.assetIds || []) {
      const asset = assets.find((candidate) => candidate.id === assetId);
      if (asset && asset.country !== question.country) add(errors, `question ${question.id} uses image/material from ${asset.country}, expected ${question.country}`);
      if (asset && (!asset.license || !asset.licenseUrl || !asset.countryEvidence)) add(errors, `question ${question.id} uses an asset without country/license evidence`);
    }
  }

  const manifestQuestionSet = new Set(manifest.questionIds || []);
  const manifestSourceSet = new Set(manifest.sourceIds || []);
  const manifestAssetSet = new Set(manifest.assetIds || []);
  for (const id of questionIds) if (!manifestQuestionSet.has(id)) add(errors, `manifest.questionIds is missing ${id}`);
  for (const id of sourceIds) if (!manifestSourceSet.has(id)) add(errors, `manifest.sourceIds is missing ${id}`);
  for (const id of assetIds) if (!manifestAssetSet.has(id)) add(errors, `manifest.assetIds is missing ${id}`);
  if (manifest.countries && Array.isArray(manifest.countries)) {
    for (const country of ["NO", "IS"]) {
      const entry = manifest.countries.find((item) => item.country === country);
      if (!entry) add(errors, `manifest.countries is missing ${country}`);
      else {
        checkIdArray(entry.questionIds, `manifest.countries.${country}.questionIds`, questionIds, errors, { allowEmpty: false });
        const expected = questions.filter((question) => question.country === country).map((question) => question.id);
        if (new Set(entry.questionIds).size !== expected.length || expected.some((id) => !entry.questionIds.includes(id))) add(errors, `manifest.countries.${country}.questionIds does not match question country assignments`);
      }
    }
  } else add(errors, "manifest.countries must be an array");

  const minTotal = positiveInteger(
    optionValue(argv, ["--min-published", "--min-published-questions"]) ?? process.env.MIN_PUBLISHED_QUESTIONS,
    policy && typeof policy === "object" ? policy.minimumPublishedQuestions : 0,
    "minimum published question threshold",
    errors,
  );
  const minPerCountry = positiveInteger(
    optionValue(argv, ["--min-per-country", "--min-published-per-country"]) ?? process.env.MIN_PUBLISHED_PER_COUNTRY,
    policy && typeof policy === "object" ? policy.minimumPublishedQuestionsPerCountry : 0,
    "minimum published per-country threshold",
    errors,
  );
  const verifiedOrPublishedCount = questions.filter((question) =>
    question.status === "verified" || question.status === "published",
  ).length;
  if (verifiedOrPublishedCount < policy.minimumVerifiedOrPublishedQuestions) {
    add(errors, `verified/published candidate count ${verifiedOrPublishedCount} is below threshold ${policy.minimumVerifiedOrPublishedQuestions}`);
  }
  if (published.length < minTotal) add(errors, `published question count ${published.length} is below threshold ${minTotal}`);
  for (const country of countries) {
    const count = countryPublished.get(country) || 0;
    if (count < minPerCountry) add(errors, `${country} published question count ${count} is below threshold ${minPerCountry}`);
  }

  const photoAssetIds = new Set(
    assets
      .filter((asset) => asset.localPath?.replaceAll("\\", "/").includes("/photos/"))
      .map((asset) => asset.id),
  );
  const imageQuestionCount = published.filter((question) => question.assetIds?.length > 0).length;
  const realPhotoQuestions = published.filter((question) =>
    question.assetIds?.some((id) => photoAssetIds.has(id)),
  );
  const realPhotoQuestionCount = realPhotoQuestions.length;
  const assignedPhotoIds = realPhotoQuestions.flatMap((question) =>
    question.assetIds.filter((id) => photoAssetIds.has(id)),
  );
  if (new Set(assignedPhotoIds).size < realPhotoQuestionCount) {
    add(errors, `real-photo questions must use distinct local photo assets; ${realPhotoQuestionCount} questions use ${new Set(assignedPhotoIds).size} unique photos`);
  }
  for (const question of realPhotoQuestions) {
    if (!photoAssetIds.has(question.assetIds[0])) add(errors, `question ${question.id} must list its real photo first so the learning UI displays it`);
  }
  for (const question of published.filter((candidate) => candidate.type === "image_choice")) {
    const firstAsset = assets.find((asset) => asset.id === question.assetIds[0]);
    if (!firstAsset?.signCode) add(errors, `question ${question.id} image_choice must display an official sign asset first`);
  }
  if (imageQuestionCount < policy.minimumImageQuestions) {
    add(errors, `image question count ${imageQuestionCount} is below threshold ${policy.minimumImageQuestions}`);
  }
  if (realPhotoQuestionCount < policy.minimumRealPhotoQuestions) {
    add(errors, `real-photo question count ${realPhotoQuestionCount} is below threshold ${policy.minimumRealPhotoQuestions}`);
  }
  for (const country of countries) {
    const countryImageCount = published.filter((question) =>
      question.country === country && question.assetIds?.length > 0,
    ).length;
    const countryPhotoCount = realPhotoQuestions.filter((question) => question.country === country).length;
    const countryImageThreshold = Math.floor(policy.minimumImageQuestions / countries.size);
    const countryPhotoThreshold = Math.floor(policy.minimumRealPhotoQuestions / countries.size);
    if (countryImageCount < countryImageThreshold) add(errors, `${country} image question count ${countryImageCount} is below balanced threshold ${countryImageThreshold}`);
    if (countryPhotoCount < countryPhotoThreshold) add(errors, `${country} real-photo question count ${countryPhotoCount} is below balanced threshold ${countryPhotoThreshold}`);
  }

  const summary = `questions=${questions.length} candidates=${verifiedOrPublishedCount} published=${published.length} sources=${sources.length} assets=${assets.length} imageQuestions=${imageQuestionCount} realPhotoQuestions=${realPhotoQuestionCount} thresholds=${minTotal}/${minPerCountry}`;
  if (errors.length > 0) {
    console.error(`CONTENT_INVALID: ${errors.length} issue(s)\n- ${errors.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log(`CONTENT_OK: ${summary}`);
  }
}

main();
