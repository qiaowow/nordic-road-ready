import manifestJson from "../../data/manifest.json";
import questionsJson from "../../data/questions.json";
import sourcesJson from "../../data/sources.json";
import assetsJson from "../../data/assets.json";

import type {
  Asset,
  ContentBundle,
  CountryCode,
  Manifest,
  Progress,
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

export function createInitialProgress(
  updatedAt = new Date().toISOString(),
): Progress {
  return {
    answeredQuestionIds: [],
    correctQuestionIds: [],
    bookmarkedQuestionIds: [],
    byCountry: {
      NO: { answered: 0, correct: 0, mastered: 0 },
      IS: { answered: 0, correct: 0, mastered: 0 },
    },
    streakDays: 0,
    updatedAt,
  };
}

/**
 * Apply one answer to a progress snapshot. Re-answering a question updates
 * correctness without inflating the answered counter.
 */
export function recordAnswer(
  progress: Progress,
  question: Question,
  selectedOptionId: string,
  answeredAt = new Date().toISOString(),
): Progress {
  const answeredBefore = progress.answeredQuestionIds.includes(question.id);
  const correctBefore = progress.correctQuestionIds.includes(question.id);
  const isCorrect = question.correctOptionIds.includes(selectedOptionId);
  const answeredQuestionIds = answeredBefore
    ? [...progress.answeredQuestionIds]
    : [...progress.answeredQuestionIds, question.id];
  const correctQuestionIds = isCorrect
    ? correctBefore
      ? [...progress.correctQuestionIds]
      : [...progress.correctQuestionIds, question.id]
    : progress.correctQuestionIds.filter((id) => id !== question.id);

  const currentCountry = progress.byCountry[question.country];
  const answered = answeredBefore ? currentCountry.answered : currentCountry.answered + 1;
  const correct = correctQuestionIds.includes(question.id)
    ? correctBefore || isCorrect
      ? currentCountry.correct + (correctBefore || !isCorrect ? 0 : 1)
      : currentCountry.correct
    : Math.max(0, currentCountry.correct - (correctBefore ? 1 : 0));
  const mastered = correctQuestionIds.includes(question.id)
    ? Math.max(currentCountry.mastered, correct)
    : currentCountry.mastered;

  return {
    ...progress,
    answeredQuestionIds,
    correctQuestionIds,
    byCountry: {
      ...progress.byCountry,
      [question.country]: { answered, correct, mastered },
    },
    updatedAt: answeredAt,
  };
}
