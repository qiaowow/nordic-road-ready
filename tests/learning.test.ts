import assert from "node:assert/strict";
import test from "node:test";
import { recordAnswer } from "../app/learning.ts";
import { emptyProgress } from "../app/storage.ts";

const start = new Date("2026-08-18T00:00:00.000Z");

test("uses 1/3/7 days, removes after three correct reviews, then schedules day 15", () => {
  const wrong = recordAnswer(emptyProgress, "q1", false, start);
  assert.equal(wrong.wrong.q1.dueAt, "2026-08-19T00:00:00.000Z");

  const first = recordAnswer(wrong, "q1", true, start);
  assert.equal(first.wrong.q1.correctStreak, 1);
  assert.equal(first.wrong.q1.dueAt, "2026-08-21T00:00:00.000Z");

  const second = recordAnswer(first, "q1", true, start);
  assert.equal(second.wrong.q1.correctStreak, 2);
  assert.equal(second.wrong.q1.dueAt, "2026-08-25T00:00:00.000Z");

  const third = recordAnswer(second, "q1", true, start);
  assert.equal(third.wrong.q1, undefined);
  assert.equal(third.refresh.q1, "2026-09-02T00:00:00.000Z");

  const confirmed = recordAnswer(third, "q1", true, start);
  assert.equal(confirmed.refresh.q1, undefined);
});

test("a wrong day-15 confirmation returns the question to the one-day queue", () => {
  const progress = {
    ...emptyProgress,
    refresh: { q2: "2026-08-18T00:00:00.000Z" },
  };
  const next = recordAnswer(progress, "q2", false, start);
  assert.equal(next.refresh.q2, undefined);
  assert.equal(next.wrong.q2.dueAt, "2026-08-19T00:00:00.000Z");
});
