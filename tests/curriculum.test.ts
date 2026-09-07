import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Question, Asset } from "../src/content/types.ts";
import { chapters, shuffled, stratifiedExam, createSession, restoreSession, questionAssets, questionState, isCorrect } from "../app/curriculum.ts";
const q = JSON.parse(readFileSync(new URL("../data/questions.json", import.meta.url), "utf8")) as Question[];
const a = JSON.parse(readFileSync(new URL("../data/assets.json", import.meta.url), "utf8")) as Asset[];
const published = q.filter(q => q.status === "published");
test("every published question has exactly one authored chapter", () => { const ids = chapters.flatMap(c => c.questionIds); assert.equal(ids.length, new Set(ids).size); assert.deepEqual([...ids].sort(), published.map(q => q.id).sort()); assert.equal(chapters[0].questionIds.includes("is-roundabout"), false); });
test("parking question main is 372; comparison 370 is study-only", () => { const x = q.find(q => q.id === "no-no-stopping")!; assert.equal(questionAssets(x, a)[0].id, "no-sign-372"); assert.deepEqual(questionAssets(x, a, true).map(a => a.id), ["no-sign-372", "no-sign-370"]); });
test("option order is shuffled without changing correctness and survives restore", () => { assert.deepEqual(shuffled(["a", "b", "c"], () => 0), ["b", "c", "a"]); const s = createSession(published.slice(0, 4), "practice", "#/learn/basics"); s.answers[s.ids[0]] = published[0].correctOptionIds; assert.deepEqual(restoreSession(JSON.stringify(s), published), s); assert.equal(isCorrect(published[0], s.answers[s.ids[0]]), true); s.order[s.ids[0]] = ["a", "a", "a"]; assert.throws(() => restoreSession(JSON.stringify(s), published)); });
test("exam samples all country/category strata before repeating", () => { const sample = stratifiedExam(published, 40, () => 0.2); assert.equal(new Set(sample.map(q => q.id)).size, 40); for (const country of ["NO", "IS"])
    assert.ok(sample.some(q => q.country === country)); assert.ok(sample.some(q => q.category === "safety")); assert.ok(sample.some(q => q.category === "signs")); });
test("temporary and stale dynamic rules are excluded; future seasonal boundaries apply", () => { assert.match(questionState(q.find(q => q.id === "is-hval-temp-speed")!, "2026-09-07"), /待复核/); assert.equal(questionState(q.find(q => q.id === "audit-no-oslo-studs")!, "2026-09-07"), "尚未适用"); assert.match(questionState(q.find(q => q.id === "is-vadla-price")!, "2027-01-01"), /待复核/); });
test("sign choices do not leak official ID or old generic prefixes", () => { for (const x of published.filter(q => q.id.startsWith("p3-sign-"))) {
    assert.doesNotMatch(x.prompt, /\d/);
    for (const o of x.options)
        assert.doesNotMatch(o.text, /另一个|官方交通标志|交通标志 \d/);
} });
