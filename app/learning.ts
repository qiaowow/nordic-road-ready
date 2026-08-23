import type { ProgressState } from "./storage";

const reviewIntervals = [1, 3, 7];

function addDays(now: Date, days: number) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function recordAnswer(
  progress: ProgressState,
  questionId: string,
  isCorrect: boolean,
  now = new Date(),
): ProgressState {
  const previousWrong = progress.wrong[questionId];
  const wrong = { ...progress.wrong };
  const refresh = { ...progress.refresh };

  if (isCorrect && previousWrong) {
    const correctStreak = previousWrong.correctStreak + 1;
    if (correctStreak >= 3) {
      delete wrong[questionId];
      refresh[questionId] = addDays(now, 15);
    } else {
      const nextIndex = Math.min(previousWrong.intervalIndex + 1, reviewIntervals.length - 1);
      wrong[questionId] = {
        dueAt: addDays(now, reviewIntervals[nextIndex]),
        intervalIndex: nextIndex,
        correctStreak,
      };
    }
  } else if (!isCorrect) {
    delete refresh[questionId];
    wrong[questionId] = { dueAt: addDays(now, 1), intervalIndex: 0, correctStreak: 0 };
  } else if (refresh[questionId]) {
    delete refresh[questionId];
  }

  return {
    ...progress,
    answered: progress.answered + 1,
    correct: progress.correct + (isCorrect ? 1 : 0),
    completedIds: Array.from(new Set([...progress.completedIds, questionId])),
    wrong,
    refresh,
    updatedAt: now.toISOString(),
  };
}
