import type { Card, Problem, Rating } from './types';

const factors: Record<Rating, number> = { 1: 0.22, 2: 0.62, 3: 1, 4: 1.55 };
export function reviewCard(card: Card, rating: Rating, now = new Date()): Card {
  const elapsed = card.reviews.length ? Math.max(0, (now.getTime() - new Date(card.reviews.at(-1)!.at).getTime()) / 86400000) : 0;
  const retrievability = Math.pow(1 + elapsed / (9 * Math.max(card.stability, 0.1)), -1);
  const difficulty = Math.min(10, Math.max(1, card.difficulty + (rating === 1 ? 0.9 : rating === 2 ? 0.3 : rating === 4 ? -0.35 : -0.08)));
  let stability: number;
  if (rating === 1) stability = Math.max(0.25, card.stability * 0.28);
  else {
    const growth = 1 + (11 - difficulty) * 0.16 * (1 - retrievability + 0.12) * factors[rating];
    stability = Math.max(0.5, card.stability * growth + (card.reps === 0 ? factors[rating] * 1.8 : 0));
  }
  const scheduledDays = rating === 1 ? 1 : Math.max(1, Math.round(stability * (rating === 2 ? 0.7 : rating === 4 ? 1.35 : 1)));
  const due = new Date(now.getTime() + scheduledDays * 86400000).toISOString();
  return { ...card, difficulty, stability, due, reps: card.reps + 1, lapses: card.lapses + (rating === 1 ? 1 : 0),
    reviews: [...card.reviews, { at: now.toISOString(), rating, stability, difficulty, scheduledDays }] };
}
export const isDue = (card: Card, now = new Date()) => new Date(card.due) <= now;

export function reviewProblem(problem: Problem, rating: Rating, now = new Date()): Problem {
  const reviews = problem.reviews ?? [];
  const stabilityNow = problem.stability ?? 1;
  const difficultyNow = problem.difficulty ?? 5;
  const reps = problem.reps ?? 0;
  const elapsed = reviews.length ? Math.max(0, (now.getTime() - new Date(reviews.at(-1)!.at).getTime()) / 86400000) : 0;
  const retrievability = Math.pow(1 + elapsed / (9 * Math.max(stabilityNow, 0.1)), -1);
  const difficulty = Math.min(10, Math.max(1, difficultyNow + (rating === 1 ? 0.9 : rating === 2 ? 0.3 : rating === 4 ? -0.35 : -0.08)));
  let stability: number;
  if (rating === 1) stability = Math.max(0.25, stabilityNow * 0.28);
  else {
    const growth = 1 + (11 - difficulty) * 0.16 * (1 - retrievability + 0.12) * factors[rating];
    stability = Math.max(0.5, stabilityNow * growth + (reps === 0 ? factors[rating] * 1.8 : 0));
  }
  const scheduledDays = rating === 1 ? 1 : Math.max(1, Math.round(stability * (rating === 2 ? 0.7 : rating === 4 ? 1.35 : 1)));
  return { ...problem, stability, difficulty, due: new Date(now.getTime() + scheduledDays * 86400000).toISOString(), reps: reps + 1,
    lapses: (problem.lapses ?? 0) + (rating === 1 ? 1 : 0), reviews: [...reviews, { at: now.toISOString(), rating, stability, difficulty, scheduledDays }] };
}

export const isProblemDue = (problem: Problem, now = new Date()) => !problem.due || new Date(problem.due) <= now;
