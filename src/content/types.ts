/**
 * Shared content contracts for the Nordic road-rules course.
 *
 * The seed data is intentionally kept as plain JSON so that it can be used by
 * the web app and by the dependency-free release validator. These types are
 * the single source of truth for consumers written in TypeScript.
 */

export const CONTENT_COUNTRIES = ["NO", "IS"] as const;
export type CountryCode = (typeof CONTENT_COUNTRIES)[number];

export const QUESTION_STATUSES = ["draft", "verified", "published", "retired"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const QUESTION_TYPES = [
  "single_choice",
  "multiple_choice",
  "true_false",
  "image_choice",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_CATEGORIES = [
  "priority",
  "signs",
  "speed",
  "lights",
  "safety",
  "weather",
  "parking",
  "tolls",
  "vehicles",
] as const;
export type QuestionCategory = (typeof QUESTION_CATEGORIES)[number];

export const DIFFICULTIES = ["core", "advanced"] as const;
export type QuestionDifficulty = (typeof DIFFICULTIES)[number];

export const RISK_TYPES = [
  "safety-critical",
  "seasonal",
  "cost",
  "navigation",
  "general",
] as const;
export type RiskType = (typeof RISK_TYPES)[number];

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  country: CountryCode;
  locale: "zh-CN";
  type: QuestionType;
  category: QuestionCategory;
  difficulty: QuestionDifficulty;
  riskType: RiskType;
  /** ISO date range for a rule; null means there is no fixed boundary. */
  appliesFrom: string | null;
  appliesTo: string | null;
  /** Smaller values are surfaced earlier in a trip-focused lesson. */
  tripPriority: number;
  prompt: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  explanation: string;
  sourceIds: string[];
  assetIds: string[];
  tags: string[];
  status: QuestionStatus;
  lastReviewedAt: string;
}

export const SOURCE_TYPES = [
  "official-guidance",
  "official-law",
  "road-authority",
  "public-safety",
  "licensed-media",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const AUTHORITY_LEVELS = [
  "government",
  "road-authority",
  "official-safety",
  "secondary",
] as const;
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

export interface Source {
  id: string;
  country: CountryCode;
  title: string;
  publisher: string;
  sourceType: SourceType;
  authorityLevel: AuthorityLevel;
  url: string;
  language: string;
  accessedAt: string;
  /** Path or key used by an offline pack when an archive is available. */
  archivePath: string;
  /** A page/PDF snapshot, a documented recovery record, or currently missing. */
  archiveStatus: "snapshot" | "evidence-record" | "missing";
  /** SHA-256 of the archived source or canonical URL fingerprint. */
  sha256: string;
  /** Stable claim IDs/labels covered by this source. */
  claimCoverage: string[];
  /** Optional because many government pages do not expose a publication date. */
  publishedAt?: string;
  notes?: string;
}

export const ASSET_TYPES = ["image", "icon", "diagram"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_LICENSES = [
  "cc0",
  "cc-by",
  "cc-by-sa",
  "government-open",
  "public-domain",
] as const;
export type AssetLicense = (typeof ASSET_LICENSES)[number];

export const ASSET_GRADES = ["A", "B", "C"] as const;
export type AssetGrade = (typeof ASSET_GRADES)[number];

export interface Asset {
  id: string;
  type: AssetType;
  /** The country represented by the asset; required for all course assets. */
  country: CountryCode;
  title: string;
  url: string;
  alt: string;
  grade: AssetGrade;
  /** Human-readable evidence that the image depicts the declared country. */
  countryEvidence: string;
  license: AssetLicense;
  licenseUrl: string;
  attribution: string;
  sourceId: string;
  downloadedAt: string;
  sha256: string;
  /** Optional local-pack path from the research image manifest. */
  localPath?: string;
  /** Public page documenting the asset, distinct from the binary URL. */
  sourcePageUrl?: string;
  /** Official traffic-sign code when this image is a sign. */
  signCode?: string;
  licenseText?: string;
  termsUrl?: string;
  countryEvidenceUrl?: string;
  officialAgency?: string;
  author?: string;
  sourceArchiveSha256?: string;
  /** SHA-256 for the web-optimized derivative referenced by localPath. */
  optimizedSha256?: string;
  optimizedBytes?: number;
  /** Preserved original download used to prove provenance. */
  originalArchivePath?: string;
  derivation?: string;
}

export interface CountryManifestEntry {
  country: CountryCode;
  questionIds: string[];
  minimumPublishedQuestions: number;
}

export interface Manifest {
  schemaVersion: 1;
  id: string;
  version: string;
  locale: "zh-CN";
  generatedAt: string;
  questionIds: string[];
  sourceIds: string[];
  assetIds: string[];
  countries: CountryManifestEntry[];
  releasePolicy: {
    minimumPublishedQuestions: number;
    minimumPublishedQuestionsPerCountry: number;
    minimumVerifiedOrPublishedQuestions: number;
    minimumImageQuestions: number;
    minimumRealPhotoQuestions: number;
    requireTwoSources: boolean;
    requireLicensedAssets: boolean;
  };
}

export interface CountryProgress {
  answered: number;
  correct: number;
  mastered: number;
}

export interface Progress {
  /** Optional because anonymous/offline learners may not have an account. */
  learnerId?: string;
  answeredQuestionIds: string[];
  correctQuestionIds: string[];
  bookmarkedQuestionIds: string[];
  byCountry: Record<CountryCode, CountryProgress>;
  streakDays: number;
  lastStudiedAt?: string;
  updatedAt: string;
}

export interface ContentBundle {
  manifest: Manifest;
  questions: Question[];
  sources: Source[];
  assets: Asset[];
}
