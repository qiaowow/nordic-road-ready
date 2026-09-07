import type { Question, Asset } from "../src/content/types";
import course from "../data/course.json" with { type: "json" };
export const chapters = course.chapters;
export const contentVersion = course.version;
export const countryName = { NO: "挪威", IS: "冰岛" };
export const categoryName: Record<string, string> = { priority: "让行与通行", signs: "官方标志", speed: "速度", lights: "灯光", safety: "安全", weather: "天气路况", parking: "停车", tolls: "费用", vehicles: "车辆" };
export function chapterOf(id: string) { return chapters.find(c => c.questionIds.includes(id)); }
export function compareCurriculum(a: Question, b: Question) {
    const ids = chapters.flatMap(c => c.questionIds);
    return ids.indexOf(a.id) - ids.indexOf(b.id);
}
export function questionState(q: Question, date = new Date().toISOString().slice(0, 10)) {
    if (q.tags.includes("needs-review"))
        return "待复核：现行条件未确认";
    if (q.appliesFrom && date < q.appliesFrom)
        return "尚未适用";
    if (q.appliesTo && date > q.appliesTo)
        return "已过适用期";
    const age = (Date.parse(date) - Date.parse(q.lastReviewedAt)) / 86400000;
    if ((q.riskType === "cost" || q.tags.includes("dynamic")) && age > 30)
        return "待复核：动态信息超过 30 天";
    return "";
}
export function shuffled<T>(items: readonly T[], random = Math.random) {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
export function stratifiedExam(pool: Question[], limit: number, random = Math.random) {
    const groups = new Map<string, Question[]>();
    for (const q of shuffled(pool, random)) {
        const key = q.country + ":" + q.category;
        groups.set(key, [...(groups.get(key) ?? []), q]);
    }
    const out: Question[] = [];
    const keys = shuffled([...groups.keys()], random);
    while (out.length < Math.min(limit, pool.length))
        for (const k of keys) {
            const q = groups.get(k)?.shift();
            if (q)
                out.push(q);
            if (out.length >= Math.min(limit, pool.length))
                break;
        }
    return out;
}
export function questionAssets(q: Question, assets: Asset[], comparison = false) { return [...q.assetIds, ...(comparison ? q.comparisonAssetIds ?? [] : [])].map(id => assets.find(a => a.id === id)).filter((a): a is Asset => Boolean(a)); }
export function assetSrc(a: Asset) { return a.localPath ? a.localPath.replace(/^public[\\/]/, "").replaceAll("\\", "/") : a.url; }
export function isCorrect(q: Question, answer: string[]) { return [...q.correctOptionIds].sort().join("|") === [...answer].sort().join("|"); }
export type Session = {
    version: string;
    id: string;
    mode: "practice" | "exam";
    ids: string[];
    order: Record<string, string[]>;
    answers: Record<string, string[]>;
    index: number;
    finished: boolean;
    returnTo: string;
};
export function createSession(pool: Question[], mode: Session["mode"], returnTo: string): Session {
    return { version: contentVersion, id: globalThis.crypto.randomUUID(), mode, ids: pool.map(q => q.id), order: Object.fromEntries(pool.map(q => [q.id, shuffled(q.options.map(o => o.id))])), answers: {}, index: 0, finished: false, returnTo };
}
export function restoreSession(raw: string, questions: Question[]): Session {
    const x = JSON.parse(raw) as Session;
    if (x.version !== contentVersion || !["practice", "exam"].includes(x.mode) || !Array.isArray(x.ids) || !x.ids.length || new Set(x.ids).size !== x.ids.length || !Number.isInteger(x.index) || x.index < 0 || x.index >= x.ids.length || typeof x.finished !== "boolean" || typeof x.id !== "string" || typeof x.returnTo !== "string" || !x.order || !x.answers)
        throw new Error("旧练习无法恢复，请开始新一轮");
    for (const id of x.ids) {
        const q = questions.find(q => q.id === id);
        const order = x.order[id];
        if (!q || !Array.isArray(order) || order.length !== q.options.length || new Set(order).size !== order.length || order.some(o => !q.options.some(v => v.id === o)))
            throw new Error("练习题目已更新");
        const answer = x.answers[id];
        if (answer && (!Array.isArray(answer) || !answer.length || new Set(answer).size !== answer.length || answer.some(o => !order.includes(o)) || (q.type !== "multiple_choice" && answer.length !== 1)))
            throw new Error("练习答案记录损坏");
    }
    if (x.returnTo.startsWith("#/") === false)
        x.returnTo = "#/learn";
    return x;
}
