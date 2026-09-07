import assert from "node:assert/strict";
import test from "node:test";
import { recordAnswer, dueQuestions } from "../app/learning.ts";
import { emptyProgress, normalizeProgress, mergeProgress } from "../app/storage.ts";
const start = new Date("2026-08-18T00:00:00Z");
test("first correct answer is due in one day; same-day repetition cannot master", () => {
    let p = recordAnswer(emptyProgress, "q", true, start);
    assert.equal(p.items.q.dueAt, "2026-08-19T00:00:00.000Z");
    for (let i = 0; i < 10; i++)
        p = recordAnswer(p, "q", true, start);
    assert.equal(p.items.q.step, 0);
    assert.equal(p.items.q.mastered, false);
});
test("only scheduled cross-day recalls progress through 1/3/7/15 days", () => {
    let p = recordAnswer(emptyProgress, "q", true, start);
    for (const days of [3, 7, 15]) {
        const now = new Date(p.items.q.dueAt!);
        p = recordAnswer(p, "q", true, now);
        assert.equal(Date.parse(p.items.q.dueAt!) - now.getTime(), days * 86400000);
    }
    assert.equal(p.items.q.mastered, false);
    p = recordAnswer(p, "q", true, new Date(p.items.q.dueAt!));
    assert.equal(p.items.q.mastered, true);
    assert.equal(p.items.q.dueAt, null);
    p = recordAnswer(p, "q", false, new Date("2026-10-01"));
    assert.equal(p.items.q.step, 0);
    assert.equal(p.items.q.mastered, false);
});
test("session event IDs make restoring submissions idempotent", () => {
    const p = recordAnswer(emptyProgress, "q", false, start, "s:q");
    assert.deepEqual(recordAnswer(p, "q", false, start, "s:q"), p);
});
test("legacy completed means attempted, never mastered", () => {
    const p = normalizeProgress({ answered: 3, correct: 2, completedIds: ["q"], favorites: [], wrong: {}, refresh: {} });
    assert.equal(p.items.q.mastered, false);
    assert.deepEqual(dueQuestions(p, start), ["q"]);
});
test("reject invalid backups; merge preserves latest per-question history", () => {
    assert.throws(() => normalizeProgress({ answered: 1, correct: 3, completedIds: [], favorites: [] }));
    const a = recordAnswer(emptyProgress, "q", false, start);
    const b = recordAnswer(a, "q", true, new Date("2026-08-19"));
    assert.equal(mergeProgress(a, b).items.q.lastCorrect, true);
    assert.equal(mergeProgress(b, a).items.q.lastCorrect, true);
});
