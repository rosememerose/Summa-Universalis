import type { AppData, Card } from './types';
const now = new Date().toISOString();
const card = (id:string, notebookId:string, title:string, core:string, notes:string, tags:string[]): Card => ({
  id, notebookId, title, core, notes, tags, createdAt:now, updatedAt:now, due:now, stability:1, difficulty:5,
  reps:0, lapses:0, reviews:[], problems:[]
});
export const seed: AppData = {
  works: [{id:'work-study',title:'My studies',createdAt:now}],
  notebooks: [
    { id:'nb-calculus', workId:'work-study', title:'Calculus II', emoji:'∫', color:'#ce6a45', createdAt:now },
    { id:'nb-physics', workId:'work-study', title:'Classical Physics', emoji:'◌', color:'#667f6d', createdAt:now },
    { id:'nb-ideas', workId:'work-study', title:'Loose Ideas', emoji:'✦', color:'#7c6f9f', createdAt:now }
  ],
  cards: [
    {...card('c1','nb-calculus','Integration by parts','Move the derivative onto the factor that becomes simpler.','From the product rule: ∫u dv = uv − ∫v du. Choose u using LIATE, but always check whether the remaining integral is actually easier.',['integration','exam-2']), problems:[{id:'p1',prompt:'Evaluate ∫ x·eˣ dx',solution:'Let u=x and dv=eˣdx. Then du=dx, v=eˣ, so the result is xeˣ−eˣ+C.'},{id:'p2',prompt:'Evaluate ∫ ln(x) dx',solution:'Write it as ∫1·ln(x)dx. Let u=ln(x), dv=dx. The result is xln(x)−x+C.'}]},
    card('c2','nb-calculus','Partial fractions','Decompose a rational function into simpler fractions after factoring the denominator.','Start by checking that the numerator degree is smaller than the denominator degree.',['integration']),
    card('c3','nb-calculus','Improper integrals','Treat an infinite bound or discontinuity as a limit.','Convergence is a property of the limit, not the antiderivative alone.',['limits']),
    card('c4','nb-physics','Conservation of energy','In an isolated system, total energy remains constant while changing form.','Choose the system boundary first; external work changes the system energy.',['mechanics'])
  ], activeWorkId:'work-study', activeNotebookId:'nb-calculus', activeCardId:'c1'
};
