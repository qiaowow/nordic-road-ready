import type { ProgressState } from "./storage";
const intervals = [1, 3, 7, 15];
const day = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
function after(now: Date, days: number) { const d = new Date(now); d.setDate(d.getDate() + days); return d.toISOString(); }
/** Due reviews on separate days advance mastery; immediate repetitions do not. */
export function recordAnswer(progress: ProgressState, id: string, correct: boolean, now = new Date(), eventId?: string): ProgressState {
    if (eventId && progress.events.includes(eventId))
        return progress;
    const old = progress.items[id];
    const qualifies = !old || Boolean(old.dueAt && Date.parse(old.dueAt) <= +now && day(new Date(old.lastAnsweredAt)) !== day(now));
    const step = !correct ? 0 : qualifies ? Math.min((old?.step ?? -1) + 1, 4) : old.step;
    const mastered = correct && step >= 4;
    return { ...progress, answered: progress.answered + 1, correct: progress.correct + Number(correct),
        completedIds: [...new Set([...progress.completedIds, id])],
        items: { ...progress.items, [id]: { attempts: (old?.attempts ?? 0) + 1, correct: (old?.correct ?? 0) + Number(correct),
                lastCorrect: correct, step, mastered, lastAnsweredAt: now.toISOString(),
                dueAt: mastered ? null : qualifies || !correct ? after(now, intervals[Math.min(step, 3)]) : old.dueAt } },
        events: eventId ? [...progress.events, eventId].slice(-2000) : progress.events, updatedAt: now.toISOString() };
}
export function dueQuestions(progress: ProgressState, now = new Date()): string[] {
    return Object.entries(progress.items).filter(([, x]) => x.dueAt && Date.parse(x.dueAt) <= +now)
        .sort((a, b) => Date.parse(a[1].dueAt!) - Date.parse(b[1].dueAt!)).map(([id]) => id);
}
