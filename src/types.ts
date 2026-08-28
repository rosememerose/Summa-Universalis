export type Rating = 1 | 2 | 3 | 4;
export type Review = { at: string; rating: Rating; stability: number; difficulty: number; scheduledDays: number };
export type FlashVariant = { id:string; prompt:string; solution:string; images?:string[] };
export type Problem = {
  id: string; title?: string; prompt: string; solution: string; due?: string; stability?: number; difficulty?: number;
  reps?: number; lapses?: number; reviews?: Review[]; source?:string; variants?:FlashVariant[]; usedVariantIds?:string[]; currentVariantId?:string;
  tags?:string[]; exhausted?:boolean;
};
export type Card = {
  id: string; notebookId: string; title: string; core: string; notes: string; problems: Problem[];
  tags: string[]; createdAt: string; updatedAt: string; due: string; stability: number; difficulty: number;
  reps: number; lapses: number; reviews: Review[]; flashHidden?:boolean;
};
export type Work = { id:string; title:string; createdAt:string };
export type Notebook = { id: string; workId:string; title: string; emoji: string; color: string; createdAt: string };
export type TrashItem =
  | { id:string; kind:'work'; deletedAt:string; work:Work; workbooks:Array<{notebook:Notebook;pages:Card[]}> }
  | { id:string; kind:'notebook'; deletedAt:string; notebook:Notebook; pages:Card[] }
  | { id:string; kind:'page'; deletedAt:string; page:Card; notebook?:Notebook }
  | { id:string; kind:'flash'; deletedAt:string; flash:Problem; pageId:string; pageTitle:string; notebookId:string; notebook?:Notebook };
export type AppData = { works:Work[]; notebooks: Notebook[]; cards: Card[]; activeWorkId:string; activeNotebookId: string; activeCardId: string; trash?:TrashItem[]; lastSkippedProblemIds?:string[] };
