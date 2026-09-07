"use client";
export type LearningItem = {
    attempts: number;
    correct: number;
    lastCorrect: boolean;
    step: number;
    mastered: boolean;
    lastAnsweredAt: string;
    dueAt: string | null;
};
export type ProgressState = {
    answered: number;
    correct: number;
    completedIds: string[];
    readIds: string[];
    favorites: string[];
    items: Record<string, LearningItem>;
    events: string[];
    updatedAt: string;
};
export const emptyProgress: ProgressState = { answered: 0, correct: 0, completedIds: [], readIds: [], favorites: [], items: {}, events: [], updatedAt: new Date(0).toISOString() };
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const integer = (v: unknown): v is number => Number.isInteger(v) && Number(v) >= 0;
export function normalizeProgress(value: unknown): ProgressState {
    if (!value || typeof value !== "object")
        throw new Error("备份内容不完整");
    const p = value as Partial<ProgressState> & {
        wrong?: Record<string, {
            dueAt: string;
        }>;
        refresh?: Record<string, string>;
    };
    if (!integer(p.answered) || !integer(p.correct) || p.correct > p.answered || !strings(p.completedIds) || !strings(p.favorites))
        throw new Error("学习记录格式无效");
    const items: Record<string, LearningItem> = {};
    if (p.items) {
        if (typeof p.items !== "object" || Array.isArray(p.items))
            throw new Error("复习记录格式无效");
        for (const [id, x] of Object.entries(p.items)) {
            if (!x || !integer(x.attempts) || !integer(x.correct) || x.correct > x.attempts || !integer(x.step) || x.step > 4 || typeof x.lastCorrect !== "boolean" || typeof x.mastered !== "boolean" || !date(x.lastAnsweredAt) || (x.dueAt !== null && !date(x.dueAt)))
                throw new Error("复习记录无效");
            items[id] = { ...x };
        }
    }
    else {
        // v1 completed only proves an attempt, not mastery.
        for (const id of new Set([...p.completedIds, ...Object.keys(p.wrong ?? {}), ...Object.keys(p.refresh ?? {})])) {
            const due = p.wrong?.[id]?.dueAt ?? p.refresh?.[id] ?? new Date(0).toISOString();
            items[id] = { attempts: 1, correct: 0, lastCorrect: false, step: 0, mastered: false, lastAnsweredAt: new Date(0).toISOString(), dueAt: date(due) ? due : new Date(0).toISOString() };
        }
    }
    if (p.readIds !== undefined && !strings(p.readIds))
        throw new Error("阅读记录无效");
    return { answered: p.answered, correct: p.correct, completedIds: [...new Set(p.completedIds)], favorites: [...new Set(p.favorites)], readIds: [...new Set(p.readIds ?? [])], items, events: strings(p.events) ? p.events.slice(-2000) : [], updatedAt: date(p.updatedAt) ? p.updatedAt : new Date(0).toISOString() };
}
function openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined")
            return reject(new Error("浏览器未提供本地存储，请使用普通浏览模式"));
        const request = indexedDB.open("nordic-road-ready", 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("learner"))
            request.result.createObjectStore("learner"); };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("本地数据库被其他页面占用，请关闭重复打开的本站页面再试"));
    });
}
export async function loadProgress(): Promise<ProgressState> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const tx = db.transaction("learner", "readonly");
        const r = tx.objectStore("learner").get("progress");
        r.onsuccess = () => { try {
            resolve(r.result ? normalizeProgress(r.result) : structuredClone(emptyProgress));
        }
        catch (e) {
            reject(e);
        } };
        r.onerror = () => reject(r.error);
        tx.oncomplete = () => db.close();
        tx.onabort = () => { db.close(); reject(tx.error); };
    });
}
async function writeProgress(progress: ProgressState): Promise<void> {
    const db = await openDatabase();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction("learner", "readwrite");
            tx.objectStore("learner").put(progress, "progress");
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }
    finally {
        db.close();
    }
}
let saveQueue: Promise<void> = Promise.resolve();
export function saveProgress(progress: ProgressState): Promise<void> {
    const snapshot = structuredClone(progress);
    const task = saveQueue.then(() => writeProgress(snapshot));
    saveQueue = task.catch(() => { });
    return task;
}
export function mergeProgress(current: ProgressState, incoming: ProgressState): ProgressState {
    const items = { ...current.items };
    for (const [id, x] of Object.entries(incoming.items))
        if (!items[id] || x.lastAnsweredAt > items[id].lastAnsweredAt)
            items[id] = x;
    return { ...current, items, answered: Math.max(current.answered, incoming.answered), correct: Math.max(current.correct, incoming.correct),
        completedIds: [...new Set([...current.completedIds, ...incoming.completedIds])], readIds: [...new Set([...current.readIds, ...incoming.readIds])],
        favorites: [...new Set([...current.favorites, ...incoming.favorites])], events: [...new Set([...current.events, ...incoming.events])].slice(-2000), updatedAt: new Date().toISOString() };
}
export async function importProgress(file: File): Promise<ProgressState> {
    if (file.size > 4 * 1024 * 1024)
        throw new Error("备份文件过大");
    const parsed = JSON.parse(await file.text());
    if (![1, 2].includes(parsed.schemaVersion))
        throw new Error("不支持的备份版本");
    return normalizeProgress(parsed.progress);
}
export function exportProgress(progress: ProgressState) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 2, progress }, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `北境自驾课-进度-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function requestPersistentStorage() {
    if (!navigator.storage)
        return { supported: false, granted: false };
    const granted = await navigator.storage.persisted?.() || await navigator.storage.persist?.() || false;
    return { supported: true, granted, ...await navigator.storage.estimate() };
}
