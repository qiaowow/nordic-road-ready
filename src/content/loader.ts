import manifestJson from "../../data/manifest.json";
import questionsJson from "../../data/questions.json";
import sourcesJson from "../../data/sources.json";
import assetsJson from "../../data/assets.json";

import type {
  Asset,
  ContentBundle,
  CountryCode,
  Manifest,
  Question,
  Source,
} from "./types";

/**
 * The JSON files are deliberately imported statically. This makes the same
 * content pack available to the browser, SSR and offline builds without a
 * runtime filesystem dependency.
 */
const manifest = manifestJson as Manifest;
const questions = questionsJson as Question[];
const sources = sourcesJson as Source[];
const assets = assetsJson as Asset[];

export function loadContent(): ContentBundle {
  // Return shallow collection copies so a screen cannot accidentally mutate
  // the module-level seed data for another learner or request.
  return {
    manifest: { ...manifest, releasePolicy: { ...manifest.releasePolicy } },
    questions: questions.map((question) => ({
      ...question,
      options: question.options.map((option) => ({ ...option })),
      correctOptionIds: [...question.correctOptionIds],
      sourceIds: [...question.sourceIds],
      assetIds: [...question.assetIds],
      tags: [...question.tags],
    })),
    sources: sources.map((source) => ({
      ...source,
      claimCoverage: [...source.claimCoverage],
    })),
    assets: assets.map((asset) => ({ ...asset })),
  };
}

/** Alias useful to callers that prefer an explicit bundle name. */
export const loadContentBundle = loadContent;

export function getQuestion(
  id: string,
  bundle: ContentBundle = loadContent(),
): Question | undefined {
  return bundle.questions.find((question) => question.id === id);
}

export function getQuestions(
  country?: CountryCode,
  bundle: ContentBundle = loadContent(),
): Question[] {
  return country
    ? bundle.questions.filter((question) => question.country === country)
    : [...bundle.questions];
}

export function getSource(
  id: string,
  bundle: ContentBundle = loadContent(),
): Source | undefined {
  return bundle.sources.find((source) => source.id === id);
}

export function getAsset(
  id: string,
  bundle: ContentBundle = loadContent(),
): Asset | undefined {
  return bundle.assets.find((asset) => asset.id === id);
}
