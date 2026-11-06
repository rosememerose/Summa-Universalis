import { Rating as FsrsRating, State, createEmptyCard, fsrs, type Card as FsrsCard, type CardInput } from 'ts-fsrs';
import type { Problem, Rating, Review } from './types';

export const FSRS_VERSION = 6 as const;
// ts-fsrs 5.4.2 implements FSRS-6. Empty options use its official defaults.
const scheduler = fsrs();
const toFsrsRating = (rating: Rating): Exclude<FsrsRating, FsrsRating.Manual> => rating as Exclude<FsrsRating, FsrsRating.Manual>;
const validDate = (value: string | undefined, fallback = new Date()): Date => {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
};

function storedCard(problem: Problem, now: Date): CardInput {
  const latestReview = problem.reviews?.at(-1);
  const reviewed = (problem.reps ?? 0) > 0 || Boolean(latestReview);
  return {
    due: validDate(problem.due, now),
    stability: reviewed ? Math.max(0, problem.stability ?? 0) : 0,
    difficulty: reviewed ? Math.max(0, problem.difficulty ?? 0) : 0,
    elapsed_days: problem.elapsedDays ?? 0,
    scheduled_days: problem.scheduledDays ?? latestReview?.scheduledDays ?? 0,
    learning_steps: problem.learningSteps ?? 0,
    reps: problem.reps ?? 0,
    lapses: problem.lapses ?? 0,
    state: problem.fsrsState ?? (reviewed ? State.Review : State.New),
    last_review: problem.lastReview ? validDate(problem.lastReview) : latestReview ? validDate(latestReview.at) : undefined,
  };
}

function applyCard(problem: Problem, card: FsrsCard): Problem {
  return { ...problem, due: card.due.toISOString(), stability: card.stability, difficulty: card.difficulty,
    elapsedDays: card.elapsed_days, scheduledDays: card.scheduled_days, learningSteps: card.learning_steps,
    reps: card.reps, lapses: card.lapses, fsrsState: card.state, lastReview: card.last_review?.toISOString(), fsrsVersion: FSRS_VERSION };
}

export function reviewProblem(problem: Problem, rating: Rating, now = new Date()): Problem {
  const result = scheduler.next(storedCard(problem, now), now, toFsrsRating(rating));
  const review: Review = { at: result.log.review.toISOString(), rating, stability: result.card.stability,
    difficulty: result.card.difficulty, scheduledDays: result.log.scheduled_days, elapsedDays: result.log.elapsed_days,
    lastElapsedDays: result.log.last_elapsed_days, learningSteps: result.log.learning_steps, state: result.log.state,
    due: result.card.due.toISOString(), fsrsVersion: FSRS_VERSION };
  return { ...applyCard(problem, result.card), reviews: [...(problem.reviews ?? []), review] };
}

/** Replay legacy ratings so existing progress becomes a genuine FSRS-6 state. */
export function migrateProblemToFsrs6(problem: Problem, now = new Date()): Problem {
  if (problem.fsrsVersion === FSRS_VERSION) return problem;
  const history = [...(problem.reviews ?? [])]
    .filter(review => review.rating >= 1 && review.rating <= 4 && !Number.isNaN(new Date(review.at).getTime()))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  if (!history.length) return applyCard(problem, createEmptyCard(validDate(problem.due, now)));
  let card: FsrsCard = createEmptyCard(validDate(history[0].at, now));
  for (const review of history) card = scheduler.next(card, validDate(review.at, now), toFsrsRating(review.rating)).card;
  return applyCard(problem, card);
}

export function resetProblemFsrs6(problem: Problem, now = new Date()): Problem {
  return { ...applyCard(problem, createEmptyCard(now)), reviews: [], usedVariantIds: [], currentVariantId: undefined };
}

export const isProblemDue = (problem: Problem, now = new Date()) => !problem.due || validDate(problem.due, now) <= now;
