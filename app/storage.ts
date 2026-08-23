"use client";

export type ProgressState = {
  answered: number;
  correct: number;
  completedIds: string[];
  wrong: Record<string, { dueAt: string; intervalIndex: number; correctStreak: number }>;
  refresh: Record<string, string>;
  favorites: string[];
  updatedAt: string;
};

const DB_NAME = "nordic-road-ready";
const STORE_NAME = "learner";
const PROGRESS_KEY = "progress";

export const emptyProgress: ProgressState = {
  answered: 0,
  correct: 0,
  completedIds: [],
  wrong: {},
  refresh: {},
  favorites: [],
  updatedAt: new Date(0).toISOString(),
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadProgress(): Promise<ProgressState> {
  if (typeof indexedDB === "undefined") return emptyProgress;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(PROGRESS_KEY);
    request.onsuccess = () => resolve({ ...emptyProgress, ...(request.result ?? {}) });
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function saveProgress(progress: ProgressState): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(progress, PROGRESS_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function exportProgress(progress: ProgressState): Promise<void> {
  const blob = new Blob([JSON.stringify({ schemaVersion: 1, progress }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `nordic-road-ready-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importProgress(file: File): Promise<ProgressState> {
  if (file.size > 1024 * 1024) throw new Error("备份文件过大");
  const parsed = JSON.parse(await file.text()) as { schemaVersion?: number; progress?: unknown };
  if (parsed.schemaVersion !== 1 || !parsed.progress || typeof parsed.progress !== "object") {
    throw new Error("备份文件格式不受支持");
  }
  const candidate = parsed.progress as Partial<ProgressState>;
  const answered = candidate.answered;
  const correct = candidate.correct;
  const isStringList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === "string");
  if (
    typeof answered !== "number" ||
    typeof correct !== "number" ||
    !Number.isInteger(answered) ||
    !Number.isInteger(correct) ||
    answered < 0 ||
    correct < 0 ||
    correct > answered ||
    !isStringList(candidate.completedIds) ||
    !isStringList(candidate.favorites) ||
    !candidate.wrong ||
    typeof candidate.wrong !== "object"
  ) {
    throw new Error("备份文件内容不完整");
  }
  const wrongEntries = Object.entries(candidate.wrong);
  if (wrongEntries.some(([id, value]) =>
    !id ||
    !value ||
    typeof value.dueAt !== "string" ||
    Number.isNaN(Date.parse(value.dueAt)) ||
    !Number.isInteger(value.intervalIndex) ||
    value.intervalIndex < 0 ||
    !Number.isInteger(value.correctStreak) ||
    value.correctStreak < 0
  )) {
    throw new Error("备份文件中的错题记录无效");
  }
  const refreshEntries = Object.entries(candidate.refresh ?? {});
  if (refreshEntries.some(([id, dueAt]) => !id || typeof dueAt !== "string" || Number.isNaN(Date.parse(dueAt)))) {
    throw new Error("备份文件中的巩固记录无效");
  }
  const next: ProgressState = {
    answered,
    correct,
    completedIds: Array.from(new Set(candidate.completedIds)),
    favorites: Array.from(new Set(candidate.favorites)),
    wrong: Object.fromEntries(wrongEntries),
    refresh: Object.fromEntries(refreshEntries),
    updatedAt: new Date().toISOString(),
  };
  await saveProgress(next);
  return next;
}

export async function requestPersistentStorage(): Promise<{
  supported: boolean;
  granted: boolean;
  usage?: number;
  quota?: number;
}> {
  if (!navigator.storage) return { supported: false, granted: false };
  const estimate = await navigator.storage.estimate();
  const alreadyPersistent = navigator.storage.persisted
    ? await navigator.storage.persisted()
    : false;
  const granted = alreadyPersistent || (navigator.storage.persist
    ? await navigator.storage.persist()
    : false);
  return { supported: true, granted, usage: estimate.usage, quota: estimate.quota };
}
