import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { Archive, BookOpen, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock3, Command, Download, Eye, EyeOff, FilePlus2, ImagePlus, Layers3, MoreHorizontal, Plus, Redo2, Search, Shuffle, SkipForward, Star, Tag, Trash2, Undo2, X } from 'lucide-react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { AppData, Card, FlashVariant, Notebook, Problem, Rating, TrashItem, Work } from './types';
import { isProblemDue, reviewProblem } from './fsrs';
import { seed } from './seed';

const uid = () => crypto.randomUUID();
const cloneSeed = () => JSON.parse(JSON.stringify(seed)) as AppData;
const TRASH_LIFETIME=7*24*60*60*1000;
const normalizeVariant=(variant:FlashVariant):FlashVariant=>({...variant,frontImages:variant.frontImages??variant.images??[],backImages:variant.backImages??[]});
const problemVariants=(problem:Problem):FlashVariant[]=>(problem.variants?.length?problem.variants:[{id:`${problem.id}-original`,prompt:problem.prompt,solution:problem.solution}]).map(normalizeVariant);
const imageToken=(id:string)=>`[[image:${id}]]`;
const imageIds=(text:string)=>Array.from(text.matchAll(/\[\[image:([^\]]+)\]\]/g),match=>match[1]);
const textWithoutImages=(text:string)=>text.replace(/\s*\[\[image:[^\]]+\]\]\s*/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
const normalizeBracketMath=(text:string)=>text.replace(/\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g,block=>block.replace(/(^|[^\\])((?:\\\\)*)\$/g,'$1$2'));
const serializeSide=(text:string,images:string[],library:Record<string,string>)=>{const ids=images.map(src=>Object.keys(library).find(id=>library[id]===src)).filter((id):id is string=>Boolean(id));return [text,...ids.map(imageToken)].filter(Boolean).join('\n\n')};
const serializeVariants=(variants:FlashVariant[],library:Record<string,string>={})=>variants.flatMap(v=>[serializeSide(v.prompt,v.frontImages??v.images??[],library),serializeSide(v.solution,v.backImages??[],library)]).join('\n\n@\n\n');
const parseVariants=(source:string,previous:FlashVariant[]=[],library:Record<string,string>={}):FlashVariant[]=>{
  const parts=source.split(/\s*@\s*/).map(part=>part.trim());
  const variants:FlashVariant[]=[];
  for(let i=0;i<parts.length;i+=2)if(parts[i]||parts[i+1]){const old=previous[i/2]&&normalizeVariant(previous[i/2]);const front=parts[i]??'',back=parts[i+1]??'';variants.push({id:old?.id??uid(),prompt:textWithoutImages(front),solution:textWithoutImages(back),frontImages:imageIds(front).map(id=>library[id]).filter(Boolean),backImages:imageIds(back).map(id=>library[id]).filter(Boolean)})}
  return variants;
};
const migrateProblemImages=(problem:Problem)=>{const variants=problemVariants(problem);const library={...(problem.imageLibrary??{})};let next=1;const add=(src:string)=>{const existing=Object.keys(library).find(id=>library[id]===src);if(existing)return;while(library[String(next)])next++;library[String(next++)]=src};variants.forEach(v=>{(v.frontImages??v.images??[]).forEach(add);(v.backImages??[]).forEach(add)});const rawSource=problem.source?.includes('[[image:')?problem.source:serializeVariants(variants,library);const source=normalizeBracketMath(rawSource);return{library,source,variants:parseVariants(source,variants,library)}};
const buildDeckSource=(problems:Problem[])=>{const library:Record<string,string>={};let next=1;const side=(text:string,images:string[])=>[text,...images.map(src=>{const id=String(next++);library[id]=src;return imageToken(id)})].filter(Boolean).join('\n\n');const source=problems.flatMap(problem=>problemVariants(problem).flatMap(variant=>[side(variant.prompt,variant.frontImages??variant.images??[]),side(variant.solution,variant.backImages??[])])).join('\n\n@\n\n');return{source,library}};
const readImage=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)});
const migrateData = (value:AppData):AppData => {
  const legacy=value as AppData&{works?:Work[];activeWorkId?:string};
  const fallbackWork:Work={id:'work-imported',title:'My work',createdAt:new Date().toISOString()};
  const works=legacy.works?.length?legacy.works:[fallbackWork];
  const fallbackWorkId=works[0].id;
  const notebooks=legacy.notebooks.map(notebook=>({...notebook,workId:notebook.workId??fallbackWorkId}));
  const activeNotebook=notebooks.find(n=>n.id===legacy.activeNotebookId);
  const trash=(legacy.trash??[]).filter(item=>Date.now()-new Date(item.deletedAt).getTime()<TRASH_LIFETIME).map(item=>{
    if(item.kind==='work')return{...item,workbooks:item.workbooks.map(entry=>({...entry,notebook:{...entry.notebook,workId:entry.notebook.workId??item.work.id}}))};
    if(item.kind==='notebook')return{...item,notebook:{...item.notebook,workId:item.notebook.workId??fallbackWorkId},pages:item.pages.map(page=>({...page}))};
    if(item.kind==='page'||item.kind==='flash')return item.notebook?{...item,notebook:{...item.notebook,workId:item.notebook.workId??fallbackWorkId}}:item;
    return item;
  }) as TrashItem[];
  return {...legacy,works,notebooks,lastSkippedProblemIds:legacy.lastSkippedProblemIds??[],activeWorkId:legacy.activeWorkId&&works.some(w=>w.id===legacy.activeWorkId)?legacy.activeWorkId:(activeNotebook?.workId??fallbackWorkId),trash,cards:legacy.cards.map(card=>({...card,flashHidden:card.flashHidden??false,problems:card.problems.map((problem,index)=>{const media=migrateProblemImages(problem);const variants=media.variants;return{...problem,tags:problem.tags??[],exhausted:problem.exhausted??false,title:problem.title??`Card ${index+1}`,source:media.source,imageLibrary:media.library,variants,usedVariantIds:(problem.usedVariantIds??[]).filter(id=>variants.some(v=>v.id===id)),due:problem.due??card.due??new Date().toISOString(),stability:problem.stability??card.stability??1,difficulty:problem.difficulty??card.difficulty??5,reps:problem.reps??0,lapses:problem.lapses??0,reviews:problem.reviews??[]}})}))};
};

function newCard(notebookId:string): Card {
  const now = new Date().toISOString();
  return { id:uid(), notebookId, title:'Untitled page', core:'', notes:'', problems:[], tags:[], createdAt:now, updatedAt:now, due:now, stability:1, difficulty:5, reps:0, lapses:0, reviews:[] };
}

export default function App() {
  const [data,setData] = useState<AppData|null>(null);
  const [mode,setMode] = useState<'write'|'queue'|'study'|'history'|'trash'>('write');
  const [query,setQuery] = useState('');
  const [tagFilter,setTagFilter] = useState('');
  const [tagMenuOpen,setTagMenuOpen] = useState(false);
  const [dragCardId,setDragCardId] = useState<string|null>(null);
  const [globalQuery,setGlobalQuery] = useState('');
  const [notebookMenu,setNotebookMenu] = useState<{id:string;x:number;y:number}|null>(null);
  const [workMenu,setWorkMenu] = useState<{id:string;x:number;y:number}|null>(null);
  const [renameDialog,setRenameDialog] = useState<{kind:'work'|'workbook';id:string;title:string}|null>(null);
  const [saved,setSaved] = useState(true);
  const [sidebarOpen,setSidebarOpen] = useState(true);
  const [worksOpen,setWorksOpen] = useState(true);
  const [workbooksOpen,setWorkbooksOpen] = useState(true);
  const [undoStack,setUndoStack] = useState<Card[]>([]);
  const [redoStack,setRedoStack] = useState<Card[]>([]);
  const [revealed,setRevealed] = useState(false);
  const [studyIds,setStudyIds] = useState<string[]>([]);
  const [studyIndex,setStudyIndex] = useState(0);
  const [openProblemId,setOpenProblemId] = useState<string|null>(null);
  const [skippedIds,setSkippedIds] = useState<string[]>([]);
  const [skipUndo,setSkipUndo] = useState<string[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(()=>{ (async()=>{ const stored = await window.folio?.load(); const browserStored = !window.folio ? localStorage.getItem('folio-data') : null; const loaded=stored ? stored as AppData : browserStored ? JSON.parse(browserStored) : cloneSeed(); setData(migrateData(loaded)); })(); },[]);
  useEffect(()=>{ if(!data) return; setSaved(false); window.clearTimeout(saveTimer.current); saveTimer.current=window.setTimeout(async()=>{ if(window.folio) await window.folio.save(data); else localStorage.setItem('folio-data',JSON.stringify(data)); setSaved(true); },450); return()=>window.clearTimeout(saveTimer.current); },[data]);
  useEffect(()=>{const timer=window.setInterval(()=>setData(d=>!d?d:{...d,trash:(d.trash??[]).filter(item=>Date.now()-new Date(item.deletedAt).getTime()<TRASH_LIFETIME)}),60000);return()=>window.clearInterval(timer)},[]);
  useEffect(()=>{setUndoStack([]);setRedoStack([])},[data?.activeCardId]);
  useEffect(()=>{const onKey=(e:globalThis.KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redoPage():undoPage()}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)});
  const notebook = data?.notebooks.find(n=>n.id===data.activeNotebookId);
  const visibleNotebooks = useMemo(()=>data?.notebooks.filter(n=>n.workId===data.activeWorkId)??[],[data]);
  const notebookCards = useMemo(()=>data?.cards.filter(c=>c.notebookId===data.activeNotebookId) ?? [],[data]);
  const filtered = useMemo(()=>notebookCards.filter(c=>(c.title+' '+c.notes+' '+c.tags.join(' ')).toLowerCase().includes(query.toLowerCase())&&(!tagFilter||c.tags.includes(tagFilter))),[notebookCards,query,tagFilter]);
  const notebookTags=useMemo(()=>Array.from(new Set(notebookCards.flatMap(c=>c.tags))).sort(),[notebookCards]);
  const active = data?.cards.find(c=>c.id===data.activeCardId);
  const allProblems = useMemo(()=>data?.cards.flatMap(card=>card.flashHidden?[]:card.problems.map(problem=>({card,problem})))??[],[data]);
  const dueCount = allProblems.filter(x=>isProblemDue(x.problem)).length;
  const currentStudy = allProblems.find(x=>x.problem.id===studyIds[studyIndex]);
  const globalResults=useMemo(()=>{const q=globalQuery.trim().toLowerCase();if(!q)return[];return data?.cards.flatMap(card=>{const notebook=data.notebooks.find(n=>n.id===card.notebookId);const pageMatch=(card.title+' '+card.notes+' '+card.tags.join(' ')).toLowerCase().includes(q);const problemMatches=card.problems.filter(p=>((p.title??'')+' '+problemVariants(p).flatMap(v=>[v.prompt,v.solution]).join(' ')).toLowerCase().includes(q));return [...(pageMatch?[{kind:'page' as const,card,notebook}]:[]),...problemMatches.map(problem=>({kind:'flash' as const,card,problem,notebook}))]})??[]},[data,globalQuery]);

  if(!data) return <div className="loading">Opening your folio…</div>;

  const patchCard=(patch:Partial<Card>)=>{if(!active)return;setUndoStack(stack=>[...stack.slice(-99),structuredClone(active)]);setRedoStack([]);setData(d=>!d?d:{...d,cards:d.cards.map(c=>c.id===d.activeCardId?{...c,...patch,updatedAt:new Date().toISOString()}:c)})};
  const undoPage=()=>{const previous=undoStack.at(-1);if(!previous||!active)return;setUndoStack(stack=>stack.slice(0,-1));setRedoStack(stack=>[...stack,structuredClone(active)]);setData(d=>!d?d:{...d,cards:d.cards.map(c=>c.id===previous.id?previous:c)})};
  const redoPage=()=>{const next=redoStack.at(-1);if(!next||!active)return;setRedoStack(stack=>stack.slice(0,-1));setUndoStack(stack=>[...stack,structuredClone(active)]);setData(d=>!d?d:{...d,cards:d.cards.map(c=>c.id===next.id?next:c)})};
  const selectNotebook=(id:string)=>setData(d=>{ if(!d)return d; const selected=d.notebooks.find(n=>n.id===id);const first=d.cards.find(c=>c.notebookId===id); return {...d,activeWorkId:selected?.workId??d.activeWorkId,activeNotebookId:id,activeCardId:first?.id??''}; });
  const addCard=()=>{ const card=newCard(data.activeNotebookId); setData({...data,cards:[...data.cards,card],activeCardId:card.id}); };
  const addNotebook=()=>{ const n:Notebook={id:uid(),workId:data.activeWorkId,title:'New workbook',emoji:'◇',color:'#9a7653',createdAt:new Date().toISOString()}; setData({...data,notebooks:[...data.notebooks,n],activeNotebookId:n.id,activeCardId:''});setRenameDialog({kind:'workbook',id:n.id,title:n.title}) };
  const addWork=()=>{const work:Work={id:uid(),title:'New work',createdAt:new Date().toISOString()};setData({...data,works:[...data.works,work],activeWorkId:work.id,activeNotebookId:'',activeCardId:''});setRenameDialog({kind:'work',id:work.id,title:work.title})};
  const selectWork=(id:string)=>{const first=data.notebooks.find(n=>n.workId===id);const firstCard=data.cards.find(c=>c.notebookId===first?.id);setData({...data,activeWorkId:id,activeNotebookId:first?.id??'',activeCardId:firstCard?.id??''});setTagFilter('')};
  const beginRenameNotebook=(id:string)=>{const current=data.notebooks.find(n=>n.id===id);if(!current)return;setRenameDialog({kind:'workbook',id,title:current.title});setNotebookMenu(null)};
  const beginRenameWork=(work:Work)=>setRenameDialog({kind:'work',id:work.id,title:work.title});
  const saveEntityName=async()=>{
    if(!renameDialog)return;
    const title=renameDialog.title.trim();
    if(!title)return;
    const next:AppData=renameDialog.kind==='work'
      ?{...data,works:data.works.map(w=>w.id===renameDialog.id?{...w,title}:w)}
      :{...data,notebooks:data.notebooks.map(n=>n.id===renameDialog.id?{...n,title}:n)};
    setData(next);
    setRenameDialog(null);
    window.clearTimeout(saveTimer.current);
    setSaved(false);
    if(window.folio)await window.folio.save(next);else localStorage.setItem('folio-data',JSON.stringify(next));
    setSaved(true);
  };
  const moveWorkbook=(notebookId:string,workId:string)=>{setData(d=>!d?d:{...d,notebooks:d.notebooks.map(n=>n.id===notebookId?{...n,workId}:n),activeWorkId:workId});setNotebookMenu(null)};
  const deleteWork=(id:string)=>{const work=data.works.find(w=>w.id===id);if(!work)return;const workbooks=data.notebooks.filter(n=>n.workId===id);if(!window.confirm(`Move work “${work.title}” and its ${workbooks.length} ${workbooks.length===1?'workbook':'workbooks'} to Deleted?`))return;const item:TrashItem={id:uid(),kind:'work',deletedAt:new Date().toISOString(),work,workbooks:workbooks.map(notebook=>({notebook,pages:data.cards.filter(c=>c.notebookId===notebook.id)}))};const workbookIds=new Set(workbooks.map(n=>n.id));const works=data.works.filter(w=>w.id!==id);const notebooks=data.notebooks.filter(n=>!workbookIds.has(n.id));const cards=data.cards.filter(c=>!workbookIds.has(c.notebookId));const nextWork=works[0];const nextWorkbook=notebooks.find(n=>n.workId===nextWork?.id);setData({...data,works,notebooks,cards,trash:[...(data.trash??[]),item],activeWorkId:data.activeWorkId===id?(nextWork?.id??''):data.activeWorkId,activeNotebookId:data.activeWorkId===id?(nextWorkbook?.id??''):data.activeNotebookId,activeCardId:data.activeWorkId===id?(cards.find(c=>c.notebookId===nextWorkbook?.id)?.id??''):data.activeCardId});setWorkMenu(null)};
  const deleteNotebook=(id:string)=>{const target=data.notebooks.find(n=>n.id===id);if(!target)return;const removed=data.cards.filter(c=>c.notebookId===id);const pageCount=removed.length;if(!window.confirm(`Move workbook “${target.title}” and its ${pageCount} ${pageCount===1?'page':'pages'} to Deleted?`))return;const trashItem:TrashItem={id:uid(),kind:'notebook',deletedAt:new Date().toISOString(),notebook:target,pages:removed};const notebooks=data.notebooks.filter(n=>n.id!==id);const cards=data.cards.filter(c=>c.notebookId!==id);const next=notebooks.find(n=>n.workId===target.workId);setData({...data,notebooks,cards,trash:[...(data.trash??[]),trashItem],activeNotebookId:data.activeNotebookId===id?(next?.id??''):data.activeNotebookId,activeCardId:data.activeNotebookId===id?(cards.find(c=>c.notebookId===next?.id)?.id??''):data.activeCardId});setNotebookMenu(null)};
  const deletePage=(card:Card)=>{if(!window.confirm(`Move “${card.title}” and its ${card.problems.length} flash ${card.problems.length===1?'card':'cards'} to Recently Deleted?`))return;const remaining=data.cards.filter(c=>c.id!==card.id);const next=remaining.find(c=>c.notebookId===card.notebookId);const notebook=data.notebooks.find(n=>n.id===card.notebookId);const item:TrashItem={id:uid(),kind:'page',deletedAt:new Date().toISOString(),page:card,notebook};setData({...data,cards:remaining,trash:[...(data.trash??[]),item],activeCardId:data.activeCardId===card.id?(next?.id??''):data.activeCardId})};
  const deleteFlash=(card:Card,problem:Problem)=>{const notebook=data.notebooks.find(n=>n.id===card.notebookId);const item:TrashItem={id:uid(),kind:'flash',deletedAt:new Date().toISOString(),flash:problem,pageId:card.id,pageTitle:card.title,notebookId:card.notebookId,notebook};setData(d=>!d?d:{...d,trash:[...(d.trash??[]),item],cards:d.cards.map(c=>c.id===card.id?{...c,problems:c.problems.filter(p=>p.id!==problem.id)}:c)})};
  const move=(delta:number)=>{ const i=notebookCards.findIndex(c=>c.id===data.activeCardId); if(i<0)return; const next=notebookCards[(i+delta+notebookCards.length)%notebookCards.length]; setData({...data,activeCardId:next.id}); };
  const reorderPage=(dragId:string,targetId:string)=>setData(d=>{if(!d||dragId===targetId)return d;const drag=d.cards.find(c=>c.id===dragId);const target=d.cards.find(c=>c.id===targetId);if(!drag||!target||drag.notebookId!==target.notebookId)return d;const ordered=d.cards.filter(c=>c.notebookId===drag.notebookId);const from=ordered.findIndex(c=>c.id===dragId);const to=ordered.findIndex(c=>c.id===targetId);const [moved]=ordered.splice(from,1);ordered.splice(to,0,moved);let index=0;return{...d,cards:d.cards.map(c=>c.notebookId===drag.notebookId?ordered[index++]:c)}});
  const reorder=(kind:'work'|'workbook',dragId:string,targetId:string)=>setData(d=>{if(!d||dragId===targetId)return d;const list=kind==='work'?[...d.works]:[...d.notebooks];const from=list.findIndex(x=>x.id===dragId),to=list.findIndex(x=>x.id===targetId);if(from<0||to<0)return d;const [moved]=list.splice(from,1);list.splice(to,0,moved);return kind==='work'?{...d,works:list as Work[]}:{...d,notebooks:list as Notebook[]}});
  const beginStudy=(targetId?:string)=>{const due=allProblems.filter(x=>isProblemDue(x.problem)).sort((a,b)=>Number(skippedIds.includes(a.problem.id))-Number(skippedIds.includes(b.problem.id))||new Date(a.problem.due??0).getTime()-new Date(b.problem.due??0).getTime());let ids=due.map(x=>x.problem.id);if(targetId&&!ids.includes(targetId))ids=[targetId];const startIndex=targetId?Math.max(0,ids.indexOf(targetId)):0;const studySet=new Set(ids);setData(d=>!d?d:{...d,cards:d.cards.map(card=>({...card,problems:card.problems.map(problem=>{if(!studySet.has(problem.id))return problem;const variants=problemVariants(problem);const used=new Set(problem.usedVariantIds??[]);let available=variants.filter(v=>!used.has(v.id));if(!available.length)available=variants;const selected=available[Math.floor(Math.random()*available.length)];return{...problem,currentVariantId:selected?.id}})}))});setStudyIds(ids);setStudyIndex(startIndex);setRevealed(false);setMode('study'); };
  const rate=(rating:Rating)=>{if(!currentStudy)return;const variants=problemVariants(currentStudy.problem);const reviewedId=currentStudy.problem.currentVariantId??variants[0]?.id;const used=Array.from(new Set([...(currentStudy.problem.usedVariantIds??[]),...(reviewedId?[reviewedId]:[])]));const completedCycle=variants.length>0&&variants.every(v=>used.includes(v.id));const updated={...reviewProblem(currentStudy.problem,rating),usedVariantIds:used,exhausted:currentStudy.problem.exhausted||completedCycle,currentVariantId:undefined};setData(d=>!d?d:{...d,cards:d.cards.map(c=>c.id===currentStudy.card.id?{...c,problems:c.problems.map(p=>p.id===updated.id?updated:p)}:c)});setRevealed(false);setStudyIndex(i=>i+1); };
  const requeueCurrent=()=>{if(!currentStudy)return;const currentVariantId=currentStudy.problem.currentVariantId;const reviewed=reviewProblem(currentStudy.problem,1);const updated={...reviewed,due:new Date().toISOString(),currentVariantId};setData(d=>!d?d:{...d,cards:d.cards.map(c=>c.id===currentStudy.card.id?{...c,problems:c.problems.map(p=>p.id===updated.id?updated:p)}:c)});setStudyIds(ids=>[...ids,currentStudy.problem.id]);setRevealed(false);setStudyIndex(i=>i+1)};
  const skipStudyVariant=()=>{
    if(!currentStudy)return;
    const variants=problemVariants(currentStudy.problem),current=currentStudy.problem.currentVariantId;
    const alternatives=variants.filter(v=>v.id!==current&&!currentStudy.problem.usedVariantIds?.includes(v.id));
    const selected=alternatives[Math.floor(Math.random()*alternatives.length)]??variants.find(v=>v.id!==current);
    if(selected)setData(d=>{
      if(!d)return d;
      return {...d,cards:d.cards.map(c=>({...c,problems:c.problems.map(p=>p.id===currentStudy.problem.id?{...p,currentVariantId:selected.id}:p)}))};
    });
    setRevealed(false);
  };
  const activateFlashCard=(card:Card,problem:Problem)=>setData(d=>!d?d:{...d,cards:d.cards.map(c=>c.id===card.id?{...c,problems:c.problems.map(p=>p.id===problem.id?{...p,due:new Date().toISOString(),stability:1,difficulty:5,reps:0,lapses:0,reviews:[],usedVariantIds:[],currentVariantId:undefined}:p)}:c)});
  const skipQueueCard=(id:string)=>{const next=[...new Set([...skippedIds,id])];setSkippedIds(next);setSkipUndo(s=>[...s,id]);setData(d=>!d?d:{...d,lastSkippedProblemIds:next})};
  const toggleProblemStar=(cardId:string,problemId:string)=>setData(d=>!d?d:{...d,cards:d.cards.map(card=>card.id===cardId?{...card,problems:card.problems.map(problem=>problem.id===problemId?{...problem,starred:!problem.starred}:problem)}:card)});

  return <div className={'shell '+(!sidebarOpen?'sidebarCollapsed':'')}>
    {sidebarOpen&&<aside className="sidebar">
      <div className="brand"><span>Summa Universalis</span><button><MoreHorizontal size={18}/></button></div>
      <div className="search globalSearch"><Search size={16}/><input aria-label="Search everything" placeholder="" value={globalQuery} onChange={e=>setGlobalQuery(e.target.value)}/>{globalQuery&&<button onClick={()=>setGlobalQuery('')}><X size={13}/></button>}</div>
      <nav className="mainnav">
        <button className={mode==='write'?'active':''} onClick={()=>setMode('write')}><BookOpen size={17}/> Library</button>
        <button className={mode==='queue'||mode==='study'?'active':''} onClick={()=>setMode('queue')}><Layers3 size={17}/> Queue <b>{dueCount}</b></button>
        <button className={mode==='history'?'active':''} onClick={()=>setMode('history')}><CalendarDays size={17}/> History</button>
        <button className={mode==='trash'?'active':''} onClick={()=>setMode('trash')}><Trash2 size={17}/> Deleted {(data.trash?.length??0)>0&&<b>{data.trash?.length}</b>}</button>
      </nav>
      <div className="sectionlabel worksLabel"><button className="sectionToggle" onClick={()=>setWorksOpen(x=>!x)} title={worksOpen?'Hide works':'Show works'}>{worksOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<span>Works</span></button><button onClick={addWork}><Plus size={15}/></button></div>
      <div className="libraryTree">{worksOpen&&<div className="works">{data.works.map(work=><button key={work.id} draggable onDragStart={e=>e.dataTransfer.setData('work',work.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>reorder('work',e.dataTransfer.getData('work'),work.id)} className={work.id===data.activeWorkId?'active':''} onClick={()=>{selectWork(work.id);setMode('write');setWorkMenu(null)}} onContextMenu={e=>{e.preventDefault();setWorkMenu({id:work.id,x:e.clientX,y:e.clientY})}} title="Drag to reorder · Right-click for options"><span>{work.title}</span><small>{data.notebooks.filter(n=>n.workId===work.id).length}</small></button>)}</div>}
      <div className="sectionlabel workbooksLabel"><button className="sectionToggle" onClick={()=>setWorkbooksOpen(x=>!x)} title={workbooksOpen?'Hide workbooks':'Show workbooks'}>{workbooksOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}<span>Workbooks</span></button><button onClick={addNotebook}><Plus size={15}/></button></div>
      {workbooksOpen&&<div className="notebooks workbooks">{visibleNotebooks.map(n=><button key={n.id} draggable onDragStart={e=>e.dataTransfer.setData('workbook',n.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>reorder('workbook',e.dataTransfer.getData('workbook'),n.id)} className={n.id===data.activeNotebookId?'active':''} onClick={()=>{selectNotebook(n.id);setMode('write');setNotebookMenu(null);setTagFilter('')}} onContextMenu={e=>{e.preventDefault();setNotebookMenu({id:n.id,x:e.clientX,y:e.clientY})}}><span>{n.title}</span><small>{data.cards.filter(c=>c.notebookId===n.id).length}</small></button>)}</div>}</div>
      <div className="sidebarFoot"><div className="profile"><div>MK</div><span><strong>My workspace</strong><small>Local & private</small></span><MoreHorizontal size={17}/></div></div>
    </aside>}

    {notebookMenu&&<><div className="contextDismiss" onMouseDown={()=>setNotebookMenu(null)}/><div className="notebookContext" style={{left:notebookMenu.x,top:notebookMenu.y}}><button onClick={()=>beginRenameNotebook(notebookMenu.id)}>Rename workbook</button><div className="contextLabel">Move to work</div>{data.works.map(work=><button key={work.id} onClick={()=>moveWorkbook(notebookMenu.id,work.id)}>{work.title}</button>)}<button className="danger" onClick={()=>deleteNotebook(notebookMenu.id)}>Delete workbook</button></div></>}
    {workMenu&&<><div className="contextDismiss" onMouseDown={()=>setWorkMenu(null)}/><div className="notebookContext" style={{left:workMenu.x,top:workMenu.y}}><button onClick={()=>{const work=data.works.find(w=>w.id===workMenu.id);if(work)beginRenameWork(work);setWorkMenu(null)}}>Rename work</button><button className="danger" onClick={()=>deleteWork(workMenu.id)}>Delete work</button></div></>}
    {renameDialog&&<div className="renameShade" onMouseDown={e=>{if(e.target===e.currentTarget)setRenameDialog(null)}}><form className="renameDialog" onSubmit={e=>{e.preventDefault();saveEntityName()}}><span>{renameDialog.kind==='work'?'NAME WORK':'NAME WORKBOOK'}</span><h2>{renameDialog.kind==='work'?'Give this work a title':'Give this workbook a title'}</h2><input autoFocus value={renameDialog.title} onChange={e=>setRenameDialog({...renameDialog,title:e.target.value})} onFocus={e=>e.currentTarget.select()}/><div><button type="button" onClick={()=>setRenameDialog(null)}>Cancel</button><button type="submit" disabled={!renameDialog.title.trim()}>Save name</button></div></form></div>}
    {globalQuery&&<div className="globalResults"><div className="globalResultsHead"><span>Search results</span><b>{globalResults.length}</b></div>{globalResults.length?globalResults.slice(0,30).map((result,i)=><button key={(result.kind==='flash'?result.problem.id:result.card.id)+i} onClick={()=>{setData({...data,activeWorkId:result.notebook?.workId??data.activeWorkId,activeNotebookId:result.card.notebookId,activeCardId:result.card.id});if(result.kind==='flash')setOpenProblemId(result.problem.id);setGlobalQuery('');setMode('write')}}><i>{result.kind==='flash'?'◇':'▤'}</i><span><strong>{result.kind==='flash'?(result.problem.title||'Untitled flash card'):result.card.title}</strong><small>{result.notebook?.title} · {result.kind==='flash'?result.card.title:'Page'}</small></span></button>):<p>No notes or flash cards match that search.</p>}</div>}
    {mode==='write' ? <>
      <section className="cardrail">
        <header><div><h2>{notebook?.title}</h2></div><button onClick={addCard}><FilePlus2 size={17}/></button></header>
        <div className="filterWrap"><div className="filter"><Search size={15}/><input aria-label="Filter pages" placeholder="" value={query} onChange={e=>setQuery(e.target.value)}/><span>{filtered.length}</span></div><button className={'tagFilterButton '+(tagFilter?'selected':'')} onClick={()=>setTagMenuOpen(x=>!x)} title="Filter pages by tag"><Tag size={15}/></button>{tagMenuOpen&&<div className="tagFilterMenu"><div className="contextLabel">Filter pages by tag</div><button className={!tagFilter?'active':''} onClick={()=>{setTagFilter('');setTagMenuOpen(false)}}>All tags</button>{notebookTags.map(tag=><button key={tag} className={tagFilter===tag?'active':''} onClick={()=>{setTagFilter(tag);setTagMenuOpen(false)}}>#{tag}</button>)}</div>}</div>
        <div className="railList">{filtered.map((c,i)=><button key={c.id} draggable className={(c.id===data.activeCardId?'active ':'')+(c.id===dragCardId?'dragging':'')} onDragStart={e=>{setDragCardId(c.id);e.dataTransfer.effectAllowed='move'}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move'}} onDrop={e=>{e.preventDefault();if(dragCardId)reorderPage(dragCardId,c.id);setDragCardId(null)}} onDragEnd={()=>setDragCardId(null)} onClick={()=>setData({...data,activeCardId:c.id})} onContextMenu={e=>{e.preventDefault();deletePage(c)}} title="Drag to reorder · Right-click to delete"><small>{String(i+1).padStart(2,'0')}</small><h3>{c.title}</h3><span className="railFlashCount"><Layers3 size={13}/>{c.problems.length}</span>{c.problems.some(p=>isProblemDue(p))&&<footer><b>Due</b></footer>}</button>)}</div>
        <button className="newpage" onClick={addCard}><Plus size={17}/> New</button>
      </section>
      <main className="workspace">
        <div className="topbar"><div className="crumb">{notebook?.title}<button className="sidebarToggle" onClick={()=>setSidebarOpen(x=>!x)} title={sidebarOpen?'Hide navigation':'Show navigation'} aria-label={sidebarOpen?'Hide navigation':'Show navigation'}>{sidebarOpen?<ChevronLeft size={15}/>:<ChevronRight size={15}/>}</button><b>{active?.title||'New page'}</b></div><div className="topactions"><button onClick={undoPage} disabled={!undoStack.length} title="Undo page edit"><Undo2 size={17}/></button><button onClick={redoPage} disabled={!redoStack.length} title="Redo page edit"><Redo2 size={17}/></button><span className={'saveState '+(saved?'saved':'saving')} title={saved?'Saved':'Not yet saved'}>{saved?<Check size={18}/>:<X size={18}/>}</span><button onClick={()=>move(-1)}><ChevronLeft size={18}/></button><span>{Math.max(1,notebookCards.findIndex(c=>c.id===active?.id)+1)} / {notebookCards.length}</span><button onClick={()=>move(1)}><ChevronRight size={18}/></button><button title="Shuffle" onClick={()=>{const c=notebookCards[Math.floor(Math.random()*notebookCards.length)];if(c)setData({...data,activeCardId:c.id})}}><Shuffle size={17}/></button></div></div>
        {active ? <CardEditor card={active} patch={patchCard} deleteFlash={deleteFlash} requestedProblemId={openProblemId} clearRequestedProblem={()=>setOpenProblemId(null)}/> : <Empty onAdd={addCard}/>} 
      </main>
    </> : mode==='queue' ? <StudyQueue cards={data.cards.filter(c=>!c.flashHidden)} notebooks={data.notebooks} beginStudy={beginStudy} activateFlashCard={activateFlashCard} skippedIds={skippedIds} lastSkippedIds={data.lastSkippedProblemIds??[]} skip={skipQueueCard} undoSkip={()=>{const id=skipUndo.at(-1);if(id){setSkippedIds(s=>s.filter(x=>x!==id));setSkipUndo(s=>s.slice(0,-1))}}} repeatSkips={()=>setSkippedIds(data.lastSkippedProblemIds??[])} toggleStar={toggleProblemStar}/> : mode==='history' ? <ReviewHistory cards={data.cards} notebooks={data.notebooks}/> : mode==='trash' ? <RecentlyDeleted items={data.trash??[]} restore={item=>restoreTrashItem(item,data,setData)} remove={id=>setData({...data,trash:(data.trash??[]).filter(item=>item.id!==id)})}/> : <StudyView item={currentStudy} index={studyIndex} total={studyIds.length} revealed={revealed} setRevealed={setRevealed} rate={rate} requeue={requeueCurrent} toggleStar={toggleProblemStar} skipVariant={skipStudyVariant} exit={()=>setMode('queue')} goToDeck={()=>{if(!currentStudy)return;const owner=data.notebooks.find(n=>n.id===currentStudy.card.notebookId);setData({...data,activeWorkId:owner?.workId??data.activeWorkId,activeNotebookId:currentStudy.card.notebookId,activeCardId:currentStudy.card.id});setOpenProblemId(currentStudy.problem.id);setMode('write')}}/>}
  </div>;
}

function CardEditor({card,patch,deleteFlash,requestedProblemId,clearRequestedProblem}:{card:Card;patch:(p:Partial<Card>)=>void;deleteFlash:(card:Card,problem:Problem)=>void;requestedProblemId:string|null;clearRequestedProblem:()=>void}){
  const [notesEditorOpen,setNotesEditorOpen]=useState(false);
  const [problemsOpen,setProblemsOpen]=useState(false);
  const [problemQuery,setProblemQuery]=useState('');
  const [problemIndex,setProblemIndex]=useState(0);
  const [problemEditorOpen,setProblemEditorOpen]=useState(true);
  const [flipped,setFlipped]=useState(false);
  const [variantIndex,setVariantIndex]=useState(0);
  const [shuffleIds,setShuffleIds]=useState<string[]|null>(null);
  const [flashTagFilter,setFlashTagFilter]=useState('');
  const [editorScope,setEditorScope]=useState<'card'|'deck'>('card');
  const [deckDraft,setDeckDraft]=useState('');
  const [deckLibrary,setDeckLibrary]=useState<Record<string,string>>({});
  const [exportingPdf,setExportingPdf]=useState(false);
  const deckEditorRef=useRef<HTMLTextAreaElement>(null);
  const addProblem=()=>{const id=uid();patch({problems:[...card.problems,{id,title:`Card ${card.problems.length+1}`,prompt:'',solution:'',source:'',variants:[],usedVariantIds:[],due:new Date().toISOString(),stability:1,difficulty:5,reps:0,lapses:0,reviews:[]}]})};
  const patchProblem=(id:string,p:Partial<Problem>)=>patch({problems:card.problems.map(x=>x.id===id?{...x,...p}:x)});
  const updateProblemSource=(problem:Problem,source:string,library=problem.imageLibrary??{})=>{const variants=parseVariants(source,problemVariants(problem),library);patchProblem(problem.id,{source,imageLibrary:library,variants,prompt:variants[0]?.prompt??'',solution:variants[0]?.solution??'',usedVariantIds:(problem.usedVariantIds??[]).filter(id=>variants.some(v=>v.id===id))})};
  const flashTags=Array.from(new Set(card.problems.flatMap(p=>p.tags??[]))).sort();
  const baseMatching=card.problems.filter(p=>((p.title??'')+' '+problemVariants(p).flatMap(v=>[v.prompt,v.solution]).join(' ')).toLowerCase().includes(problemQuery.toLowerCase())&&(!flashTagFilter||(p.tags??[]).includes(flashTagFilter)));
  const matching=shuffleIds?[...baseMatching].sort((a,b)=>shuffleIds.indexOf(a.id)-shuffleIds.indexOf(b.id)):baseMatching;
  const problem=matching[Math.min(problemIndex,Math.max(0,matching.length-1))];
  const openProblems=()=>{setProblemQuery('');setFlashTagFilter('');setShuffleIds(null);setProblemIndex(0);setVariantIndex(0);setEditorScope('card');setProblemEditorOpen(card.problems.length===0);setFlipped(false);setProblemsOpen(true)};
  const insertImages=async(problem:Problem,files:FileList|File[]|null,start?:number,end?:number)=>{const images=Array.from(files??[]).filter(file=>file.type.startsWith('image/'));if(!images.length)return;const sources=await Promise.all(images.map(readImage));const library={...(problem.imageLibrary??{})};let next=Math.max(0,...Object.keys(library).map(Number).filter(Number.isFinite))+1;const tokens=sources.map(src=>{const id=String(next++);library[id]=src;return imageToken(id)}).join('\n');const source=problem.source??serializeVariants(problemVariants(problem),library);const from=start??deckEditorRef.current?.selectionStart??source.length;const to=end??deckEditorRef.current?.selectionEnd??from;const prefix=from>0&&!source.slice(0,from).endsWith('\n')?'\n':'';const suffix=to<source.length&&!source.slice(to).startsWith('\n')?'\n':'';const insertion=prefix+tokens+suffix;updateProblemSource(problem,source.slice(0,from)+insertion+source.slice(to),library);requestAnimationFrame(()=>{const position=from+insertion.length;deckEditorRef.current?.focus();deckEditorRef.current?.setSelectionRange(position,position)})};
  const pasteDeck=(event:ClipboardEvent<HTMLTextAreaElement>,problem:Problem)=>{const files=Array.from(event.clipboardData.items).filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>Boolean(file));if(files.length){event.preventDefault();void insertImages(problem,files,event.currentTarget.selectionStart,event.currentTarget.selectionEnd)}};
  const openDeckEditor=()=>{const snapshot=buildDeckSource(card.problems);setDeckDraft(snapshot.source);setDeckLibrary(snapshot.library);setEditorScope('deck');setProblemEditorOpen(true)};
  const insertDeckImages=async(files:FileList|File[]|null,start?:number,end?:number)=>{const images=Array.from(files??[]).filter(file=>file.type.startsWith('image/'));if(!images.length)return;const sources=await Promise.all(images.map(readImage));const library={...deckLibrary};let next=Math.max(0,...Object.keys(library).map(Number).filter(Number.isFinite))+1;const insertion=sources.map(src=>{const id=String(next++);library[id]=src;return imageToken(id)}).join('\n');const from=start??deckEditorRef.current?.selectionStart??deckDraft.length;const to=end??deckEditorRef.current?.selectionEnd??from;const prefix=from>0&&!deckDraft.slice(0,from).endsWith('\n')?'\n':'';const suffix=to<deckDraft.length&&!deckDraft.slice(to).startsWith('\n')?'\n':'';const value=deckDraft.slice(0,from)+prefix+insertion+suffix+deckDraft.slice(to);setDeckLibrary(library);setDeckDraft(value);requestAnimationFrame(()=>{const position=from+prefix.length+insertion.length+suffix.length;deckEditorRef.current?.focus();deckEditorRef.current?.setSelectionRange(position,position)})};
  const pasteEntireDeck=(event:ClipboardEvent<HTMLTextAreaElement>)=>{const files=Array.from(event.clipboardData.items).filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter((file):file is File=>Boolean(file));if(files.length){event.preventDefault();void insertDeckImages(files,event.currentTarget.selectionStart,event.currentTarget.selectionEnd)}};
  const finishEditor=()=>{if(editorScope==='deck'){const variants=parseVariants(deckDraft,[],deckLibrary);const problems=variants.map((variant,index)=>{const previous=card.problems[index];const ids=[...imageIds(deckDraft.split(/\s*@\s*/)[index*2]??''),...imageIds(deckDraft.split(/\s*@\s*/)[index*2+1]??'')];const imageLibrary=Object.fromEntries(ids.filter(id=>deckLibrary[id]).map(id=>[id,deckLibrary[id]]));const source=serializeVariants([variant],imageLibrary);const now=new Date().toISOString();return{id:previous?.id??uid(),title:previous?.title??`Card ${index+1}`,prompt:variant.prompt,solution:variant.solution,source,imageLibrary,variants:[variant],tags:previous?.tags??[],exhausted:previous?.exhausted??false,usedVariantIds:[],due:previous?.due??now,stability:previous?.stability??1,difficulty:previous?.difficulty??5,reps:previous?.reps??0,lapses:previous?.lapses??0,reviews:previous?.reviews??[]}});patch({problems})}setProblemEditorOpen(false);setEditorScope('card')};
  const exportDeckPdf=async()=>{if(!window.folio?.exportPdf){window.alert('PDF export is available in the desktop app.');return}setExportingPdf(true);try{const safeName=(card.title.trim()||'Flashcard deck').replace(/[<>:"/\\|?*]+/g,'-');await window.folio.exportPdf(buildDeckPdfHtml(card),`${safeName} - flashcards.pdf`)}catch(error){console.error(error);window.alert('The PDF could not be exported. Please try again.')}finally{setExportingPdf(false)}};
  useEffect(()=>{if(!requestedProblemId)return;const index=card.problems.findIndex(p=>p.id===requestedProblemId);if(index>=0){setProblemQuery('');setProblemIndex(index);setEditorScope('card');setProblemEditorOpen(false);setFlipped(false);setProblemsOpen(true)}clearRequestedProblem()},[requestedProblemId,card.problems,clearRequestedProblem]);
  return <div className="paperWrap"><article className="paper">
    <div className="pageTitleRow"><input className="titleInput" value={card.title} onClick={()=>setNotesEditorOpen(true)} onFocus={()=>setNotesEditorOpen(true)} onChange={e=>patch({title:e.target.value})}/><div className="pageFlashActions"><button className="exportPdfButton" onClick={()=>void exportDeckPdf()} disabled={exportingPdf} title="Export this page’s complete flashcard deck as PDF"><Download size={17}/></button><button className="visibilityButton" onClick={()=>patch({flashHidden:!card.flashHidden})} title={card.flashHidden?'Unhide this page’s flash cards from Queue':'Hide this page’s flash cards from Queue'}>{card.flashHidden?<Eye size={17}/>:<EyeOff size={17}/>}</button><button className="flashSquare" onClick={openProblems} title="Open flash cards" aria-label={`Open ${card.problems.length} flash cards`}><div className="problemStack"><i/><i/><b>{card.problems.length}</b></div></button></div></div>
    <section className="notes">{notesEditorOpen&&<div className="noteEditorDrop"><div className="editorTags">{card.tags.map((t,i)=><button key={i}>#{t}<X size={12} onClick={()=>patch({tags:card.tags.filter((_,x)=>x!==i)})}/></button>)}<button className="addtag" onClick={()=>{const t=prompt('Tag name');if(t)patch({tags:[...card.tags,t.replace(/^#/,'')]})}}>+ tag</button></div><textarea spellCheck autoFocus placeholder={'Start writing…\n\nUse $x^2$ for inline math or $$\\int_0^1 x^2 dx$$ for display math.'} value={card.notes} onKeyDown={e=>continueList(e,card.notes,value=>patch({notes:value}))} onChange={e=>patch({notes:e.target.value})}/><button onClick={()=>setNotesEditorOpen(false)}><ChevronUp size={15}/> Collapse editor</button></div>}<div className={'latexPreview '+(!notesEditorOpen?'previewOnly':'')}><RichText text={card.notes}/></div></section>
    <footer className="paperFoot"><div className="footerStats"><span>Updated {new Date(card.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><span><Clock3 size={14}/> Next review {new Date(card.due).toLocaleDateString()}</span><span>Stability {card.stability.toFixed(1)}d</span><span>Difficulty {card.difficulty.toFixed(1)}</span></div></footer>
  </article>{problemsOpen&&<div className="modalShade" onMouseDown={e=>{if(e.target===e.currentTarget)setProblemsOpen(false)}}><section className="problemModal">
    <header><div><span>FLASH CARDS</span><h2>{card.title}</h2></div><button onClick={()=>setProblemsOpen(false)}><X size={20}/></button></header>
    <div className="problemSearch"><Search size={17}/><input autoFocus placeholder="Search titles, questions, and answers…" value={problemQuery} onChange={e=>{setProblemQuery(e.target.value);setProblemIndex(0);setFlipped(false)}}/><select aria-label="Filter flash cards by tag" value={flashTagFilter} onChange={e=>{setFlashTagFilter(e.target.value);setProblemIndex(0)}}><option value="">Filter flash cards by tag</option>{flashTags.map(t=><option key={t} value={t}>#{t}</option>)}</select><button title="Shuffle for this viewing" onClick={()=>{setShuffleIds([...card.problems].sort(()=>Math.random()-.5).map(p=>p.id));setProblemIndex(0)}}><Shuffle size={16}/></button><span>{matching.length} found</span></div>
    <div className="problemCanvas">{problem ? (()=>{const variants=problemVariants(problem);const preview=variants[Math.min(variantIndex,variants.length-1)]??{prompt:'',solution:'',frontImages:[],backImages:[]};const shownImages=flipped?(preview.backImages??[]):(preview.frontImages??[]);return <><div className="flashTitleRow"><button className="exhaustToggle" onClick={()=>patchProblem(problem.id,{exhausted:!problem.exhausted,usedVariantIds:problem.exhausted?[]:variants.map(v=>v.id)})} title="Toggle whether all variants have been seen">{problem.exhausted?<Check size={18}/>:<X size={18}/>}</button><button className="flashTitle" onClick={()=>{setEditorScope('card');setProblemEditorOpen(true)}}>{problem.title||'Untitled flash card'}<span className="variantCount">{variants.length} {variants.length===1?'card':'cards'}</span><ChevronDown size={16}/></button></div>{problemEditorOpen&&<div className="flashEditor"><div className="editorScopeToggle"><button className={editorScope==='card'?'active':''} onClick={()=>setEditorScope('card')}>One flashcard</button><button className={editorScope==='deck'?'active':''} onClick={openDeckEditor}>Entire deck</button></div>{editorScope==='card'?<><input className="flashTitleInput" placeholder="Flash card title" value={problem.title??''} onChange={e=>patchProblem(problem.id,{title:e.target.value})}/><div className="editorTags">{(problem.tags??[]).map((t,i)=><button key={t}>#{t}<X size={12} onClick={()=>patchProblem(problem.id,{tags:(problem.tags??[]).filter((_,x)=>x!==i)})}/></button>)}<button className="addtag" onClick={()=>{const t=prompt('Flash-card tag');if(t)patchProblem(problem.id,{tags:[...(problem.tags??[]),t.replace(/^#/,'').trim()]})}}>+ tag</button></div><label>VARIANTS — FRONT @ BACK</label><div className="deckEditorToolbar"><small>Each front/back pair becomes a variant of this flashcard</small><label><ImagePlus size={14}/> Insert images<input type="file" accept="image/*" multiple onChange={e=>{void insertImages(problem,e.target.files);e.currentTarget.value=''}}/></label></div><textarea ref={deckEditorRef} className="deckSourceEditor" placeholder={'Front @ back @ next variant front @ next variant back'} value={problem.source??serializeVariants(variants,problem.imageLibrary)} onPaste={e=>pasteDeck(e,problem)} onChange={e=>updateProblemSource(problem,e.target.value)}/><small className="deckHint">Paste images with Ctrl+V. Images appear as movable [[image:n]] markers and follow the surrounding @ separators.</small></>:<><div className="deckEditorTitle">{card.title}</div><label>ENTIRE DECK — FRONT @ BACK</label><div className="deckEditorToolbar"><small>Each front/back pair becomes a separate flashcard</small><label><ImagePlus size={14}/> Insert images<input type="file" accept="image/*" multiple onChange={e=>{void insertDeckImages(e.target.files);e.currentTarget.value=''}}/></label></div><textarea ref={deckEditorRef} className="deckSourceEditor" placeholder={'Card 1 front @ Card 1 back @ Card 2 front @ Card 2 back'} value={deckDraft} onPaste={pasteEntireDeck} onChange={e=>setDeckDraft(e.target.value)}/><small className="deckHint">Press Done to replace the deck with one flashcard for every front/back pair. Existing variants are shown as separate pairs here.</small></>}<button className="doneFlashEditor" onClick={finishEditor}><Check size={15}/> Done</button></div>}<button className={'renderedFlash '+(flipped?'isFlipped':'')} onClick={()=>setFlipped(x=>!x)}><RichText text={(flipped?preview.solution:preview.prompt)||(flipped?'Add an answer.':'')}/>{shownImages.length>0&&<div className="flashImages">{shownImages.map((src,i)=><img key={i} src={src}/>)}</div>}</button><div className="variantNav"><button disabled={variantIndex===0} onClick={()=>{setVariantIndex(i=>i-1);setFlipped(false)}}><ChevronLeft size={18}/></button><span>{variantIndex+1} / {variants.length}</span><button disabled={variantIndex>=variants.length-1} onClick={()=>{setVariantIndex(i=>i+1);setFlipped(false)}}><ChevronRight size={18}/></button></div></>})() : <div className="noProblems"><h3>{problemQuery?'No matching flash cards':'No flash cards yet'}</h3><p>{problemQuery?'Try a different search.':'Create a card with a question and answer.'}</p>{!problemQuery&&<button onClick={()=>{addProblem();setProblemIndex(card.problems.length);setProblemEditorOpen(true)}}><Plus size={16}/> Add a flash card</button>}</div>}</div>
    <footer><button className="deleteProblem" disabled={!problem} onClick={()=>{if(problem)deleteFlash(card,problem);setProblemIndex(i=>Math.max(0,i-1));setFlipped(false)}}><Trash2 size={16}/> Delete</button><div className="problemNav"><button disabled={problemIndex===0||!problem} onClick={()=>{setProblemIndex(i=>i-1);setProblemEditorOpen(false);setFlipped(false)}}><ChevronLeft size={18}/></button><span>{problem?problemIndex+1:0} / {matching.length}</span><button disabled={problemIndex>=matching.length-1||!problem} onClick={()=>{setProblemIndex(i=>i+1);setProblemEditorOpen(false);setFlipped(false)}}><ChevronRight size={18}/></button></div><button className="addProblem" onClick={()=>{setProblemQuery('');addProblem();setProblemIndex(card.problems.length);setProblemEditorOpen(true);setFlipped(false)}}><Plus size={16}/> New flash card</button></footer>
  </section></div>}</div>;
}

function continueList(event:KeyboardEvent<HTMLTextAreaElement>,value:string,setValue:(value:string)=>void){
  if(event.key!=='Enter'||event.shiftKey)return;
  const target=event.currentTarget;
  const start=target.selectionStart;
  const end=target.selectionEnd;
  const lineStart=value.lastIndexOf('\n',start-1)+1;
  const line=value.slice(lineStart,start);
  const match=line.match(/^(\s*)([-*]|(\d+)\.)\s(.*)$/);
  if(!match)return;
  event.preventDefault();
  if(!match[4]){
    const next=value.slice(0,lineStart)+value.slice(end);
    setValue(next);
    requestAnimationFrame(()=>target.setSelectionRange(lineStart,lineStart));
    return;
  }
  const marker=match[3]?`${Number(match[3])+1}.`:'-';
  const insertion=`\n${match[1]}${marker} `;
  const next=value.slice(0,start)+insertion+value.slice(end);
  setValue(next);
  const cursor=start+insertion.length;
  requestAnimationFrame(()=>target.setSelectionRange(cursor,cursor));
}

function RichText({text}:{text:string}){
  const html=useMemo(()=>renderMath(text),[text]);
  return <div className="richText" dangerouslySetInnerHTML={{__html:html}}/>;
}

function renderMath(text:string,mathOutput:'htmlAndMathml'|'mathml'='htmlAndMathml'){
  const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!));
  const displayBlocks:string[]=[];
  const prepared=text.replace(/(\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$)/g,block=>{const token=`\u0001MATH${displayBlocks.length}\u0001`;displayBlocks.push(block);return token});
  const pattern=/(\u0001MATH\d+\u0001|\\\([^\n]+?\\\)|\$[^\n$]+?\$)/g;
  const markdownInline=(value:string)=>{
    const code:string[]=[];
    let result=escape(value).replace(/`([^`]+)`/g,(_,content)=>{const token=`\u0000CODE${code.length}\u0000`;code.push(`<code>${content}</code>`);return token});
    result=result.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    result=result.replace(/\*\*([^*\n]+)\*\*|__([^_\n]+)__/g,'<strong>$1$2</strong>');
    result=result.replace(/~~([^~\n]+)~~/g,'<del>$1</del>');
    result=result.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g,'$1<em>$2</em>');
    result=result.replace(/(^|[^_])_([^_\n]+)_(?!_)/g,'$1<em>$2</em>');
    return result.replace(/\u0000CODE(\d+)\u0000/g,(_,index)=>code[Number(index)]);
  };
  const inline=(value:string)=>value.split(pattern).map(part=>{
    const blockMatch=part.match(/^\u0001MATH(\d+)\u0001$/);
    const mathPart=blockMatch?displayBlocks[Number(blockMatch[1])]:part;
    const bracketDisplay=mathPart.startsWith('\\[')&&mathPart.endsWith('\\]');
    const bracketInline=mathPart.startsWith('\\(')&&mathPart.endsWith('\\)');
    const display=Boolean(blockMatch);
    const math=display||bracketInline||(mathPart.startsWith('$')&&mathPart.endsWith('$'));
    if(!math)return markdownInline(part).replace(/\n/g,'<br>');
    let content=mathPart.slice(display||bracketInline?2:1,display||bracketInline?-2:-1);
    if(bracketDisplay||bracketInline)content=normalizeBracketMath(mathPart).slice(2,-2);
    try{return katex.renderToString(content,{displayMode:display,throwOnError:false,strict:false,trust:false,output:mathOutput});}
    catch{return escape(part)}
  }).join('');
  const lines=prepared.split('\n');
  let html='';let listType:''|'ul'|'ol'='';let inCode=false;let codeLines:string[]=[];
  const closeList=()=>{if(listType){html+=`</${listType}>`;listType=''}};
  for(const line of lines){
    if(/^\s*```/.test(line)){closeList();if(inCode){html+=`<pre><code>${escape(codeLines.join('\n'))}</code></pre>`;codeLines=[]}inCode=!inCode;continue}
    if(inCode){codeLines.push(line);continue}
    const task=line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    const bullet=!task&&line.match(/^\s*[-*]\s+(.*)$/);
    const numbered=line.match(/^\s*\d+\.\s+(.*)$/);
    const type=task||bullet?'ul':numbered?'ol':'';
    if(type){if(listType!==type){closeList();html+=`<${type}>`;listType=type}html+=task?`<li class="taskItem"><input type="checkbox" disabled ${task[1].toLowerCase()==='x'?'checked':''}/><span>${inline(task[2])}</span></li>`:`<li>${inline((bullet||numbered)![1])}</li>`;continue}
    closeList();
    const heading=line.match(/^(#{1,6})\s+(.*)$/);
    const quote=line.match(/^>\s?(.*)$/);
    if(heading)html+=`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
    else if(quote)html+=`<blockquote>${inline(quote[1])}</blockquote>`;
    else if(/^\s*((-{3,})|(\*{3,})|(_{3,}))\s*$/.test(line))html+='<hr>';
    else html+=line?`<div>${inline(line)}</div>`:'<br>';
  }
  closeList();if(inCode)html+=`<pre><code>${escape(codeLines.join('\n'))}</code></pre>`;
  return html;
}

function buildDeckPdfHtml(card:Card){
  const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]!));
  const images=(sources:string[])=>sources.length?`<div class="images">${sources.map((src,index)=>`<img src="${src}" alt="Flashcard image ${index+1}">`).join('')}</div>`:'';
  const cards=card.problems.map((problem,problemIndex)=>{
    const variants=problemVariants(problem);
    return `<section class="flashcard"><h2>${problemIndex+1}. ${escape(problem.title||`Card ${problemIndex+1}`)}</h2>${variants.map((variant,variantIndex)=>`<article class="variant"><h3>Variant ${variantIndex+1} of ${variants.length}</h3><div class="side"><b>Front</b><div class="content">${renderMath(variant.prompt||'', 'mathml')}</div>${images(variant.frontImages??variant.images??[])}</div><div class="side answer"><b>Back</b><div class="content">${renderMath(variant.solution||'', 'mathml')}</div>${images(variant.backImages??[])}</div></article>`).join('')}</section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(card.title)} - Flashcards</title><style>
    @page{size:A4;margin:10mm 11mm 12mm}*{box-sizing:border-box}body{margin:0;color:#172033;background:#fff;font:10pt/1.38 Arial,Helvetica,sans-serif}header{border-bottom:1px solid #9ba8b8;padding-bottom:7mm;margin-bottom:6mm}header h1{font:700 19pt/1.15 Georgia,serif;margin:0 0 2mm}header p{margin:0;color:#536174;font-size:9pt}.flashcard{margin:0 0 7mm}.flashcard h2{font:700 13pt/1.2 Georgia,serif;color:#123d68;margin:0 0 3mm;padding-bottom:1.5mm;border-bottom:1px solid #d3dbe4}.variant{border:1px solid #ccd5df;border-radius:2mm;margin:0 0 4mm;overflow:hidden;break-inside:avoid-page}.variant h3{margin:0;padding:1.8mm 2.5mm;background:#edf3f8;color:#4e6073;font-size:8.5pt;text-transform:uppercase;letter-spacing:.04em}.side{padding:2.5mm 3mm}.side+.side{border-top:1px solid #d8e0e8}.side>b{display:block;color:#246398;font-size:8pt;text-transform:uppercase;letter-spacing:.07em;margin-bottom:1mm}.content>div{margin:.8mm 0}.content ul,.content ol{margin:1mm 0;padding-left:5mm}.content blockquote{margin:2mm 0;padding-left:3mm;border-left:2px solid #8aa9c5}.answer{background:#fafbfd}.images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:2mm;margin-top:2mm}.images img{display:block;max-width:100%;max-height:70mm;object-fit:contain;border:1px solid #d8e0e8;border-radius:1mm}math[display="block"]{display:block;text-align:center;margin:2mm 0;overflow-wrap:anywhere}code{font-family:Consolas,monospace;background:#eef1f4;padding:.2mm .7mm;border-radius:.5mm}footer{position:fixed;bottom:-8mm;left:0;right:0;text-align:center;color:#7b8795;font-size:8pt}
  </style></head><body><header><h1>${escape(card.title)}</h1><p>${card.problems.length} flashcards - ${card.problems.reduce((count,problem)=>count+problemVariants(problem).length,0)} total variants</p></header>${cards||'<p>This deck has no flashcards.</p>'}<footer>Exported from Summa Universalis</footer></body></html>`;
}

function Empty({onAdd}:{onAdd:()=>void}){return <div className="empty"><Archive size={34}/><h2>This notebook is ready</h2><p>Add its first page and capture one durable idea.</p><button onClick={onAdd}><Plus size={17}/> Create a page</button></div>}

function StudyQueue({cards,notebooks,beginStudy,activateFlashCard,skippedIds,lastSkippedIds,skip,undoSkip,repeatSkips,toggleStar}:{cards:Card[];notebooks:Notebook[];beginStudy:(targetId?:string)=>void;activateFlashCard:(card:Card,problem:Problem)=>void;skippedIds:string[];lastSkippedIds:string[];skip:(id:string)=>void;undoSkip:()=>void;repeatSkips:()=>void;toggleStar:(cardId:string,problemId:string)=>void}){
  const items=cards.flatMap(card=>card.problems.map(problem=>({card,problem})));
  const active=items.filter(x=>isProblemDue(x.problem)).sort((a,b)=>Number(skippedIds.includes(a.problem.id))-Number(skippedIds.includes(b.problem.id))||new Date(a.problem.due??0).getTime()-new Date(b.problem.due??0).getTime());
  const complete=items.filter(x=>!isProblemDue(x.problem)).sort((a,b)=>new Date(a.problem.due!).getTime()-new Date(b.problem.due!).getTime());
  const notebookName=(id:string)=>notebooks.find(n=>n.id===id)?.title||'Notebook';
  const dateLabel=(iso:string)=>new Date(iso).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:new Date(iso).getFullYear()!==new Date().getFullYear()?'numeric':undefined});
  return <main className="queuePage"><header className="queueHeader"><div><h1>Queue</h1></div><div className="queueHeaderActions">{lastSkippedIds.length>0&&<button className="repeatSkips" title="Skip the same cards as last session" onClick={repeatSkips}>!</button>}<button disabled={!active.length} onClick={()=>beginStudy()}><Layers3 size={17}/>{active.length?`Study ${active.length} active ${active.length===1?'card':'cards'}`:'Nothing due yet'}</button></div></header>
    <div className="queueContent"><section className="queueSection"><div className="queueTitle"><div><i className="activeDot"/><h2>Active</h2><b>{active.length}</b></div></div>{active.length?<div className="queueGrid">{active.map(({card,problem})=><div className="queueCard activeQueueCard" key={problem.id} role="button" tabIndex={0} onClick={()=>beginStudy(problem.id)} onKeyDown={e=>{if(e.key==='Enter')beginStudy(problem.id)}}>{lastSkippedIds.includes(problem.id)&&<i className="skipMark">!</i>}<button className={'starCardButton '+(problem.starred?'starred':'')} title={problem.starred?'Unstar flashcard':'Star flashcard'} onClick={e=>{e.stopPropagation();toggleStar(card.id,problem.id)}}><Star size={16} fill={problem.starred?'currentColor':'none'}/></button><div><span>{notebookName(card.notebookId)} · {card.title}</span><b>DUE NOW</b></div><h3>{problem.title||'Untitled flash card'}</h3><p>{problemVariants(problem).length} possible {problemVariants(problem).length===1?'card':'cards'}</p><footer><span>{problem.reps??0} reviews</span><span>Difficulty {(problem.difficulty??5).toFixed(1)}</span><button onClick={e=>{e.stopPropagation();skip(problem.id)}}><SkipForward size={13}/> Skip</button></footer></div>)}</div>:<div className="queueEmpty compact"><span>✓</span><div><h3>You are caught up</h3></div></div>}{skippedIds.length>0&&<button className="undoQueueSkip" onClick={undoSkip}><Undo2 size={14}/> Undo last skip</button>}</section>
    <section className="queueSection completeSection"><div className="queueTitle"><div><i className="completeDot"/><h2>Complete</h2><b>{complete.length}</b></div></div>{complete.length?<div className="queueList">{complete.map(({card,problem})=><div className="completeCardRow" key={problem.id} role="button" tabIndex={0} onClick={()=>beginStudy(problem.id)} onKeyDown={e=>{if(e.key==='Enter')beginStudy(problem.id)}}><button className={'starCardButton '+(problem.starred?'starred':'')} title={problem.starred?'Unstar flashcard':'Star flashcard'} onClick={e=>{e.stopPropagation();toggleStar(card.id,problem.id)}}><Star size={16} fill={problem.starred?'currentColor':'none'}/></button><div className="completeCheck">✓</div><div className="completeInfo"><span>{notebookName(card.notebookId)} · {card.title}</span><h3>{problem.title||'Untitled flash card'}</h3></div><div className="memoryStats"><small>STABILITY</small><b>{(problem.stability??1).toFixed(1)} days</b></div><div className="nextReview"><small>ESTIMATED NEXT REVIEW</small><b><CalendarDays size={15}/>{dateLabel(problem.due!)}</b></div><button className="activateCard" onClick={e=>{e.stopPropagation();activateFlashCard(card,problem)}}>Activate</button></div>)}</div>:<div className="queueEmpty subtle"><Clock3 size={22}/><div><h3>No completed flash cards yet</h3></div></div>}</section></div>
  </main>;
}

function ReviewHistory({cards,notebooks}:{cards:Card[];notebooks:Notebook[]}){
  const entries=cards.flatMap(card=>card.problems.flatMap(problem=>(problem.reviews??[]).map(review=>({card,problem,review})))).sort((a,b)=>new Date(b.review.at).getTime()-new Date(a.review.at).getTime());
  const names=['','Again','Hard','Good','Easy'];
  const notebookName=(id:string)=>notebooks.find(n=>n.id===id)?.title||'Notebook';
  return <main className="historyPage"><header><h1>History</h1></header><div className="historyContent">{entries.length?<><div className="historySummary"><div><b>{entries.length}</b><span>Total reviews</span></div><div><b>{new Set(entries.map(e=>e.problem.id)).size}</b><span>Cards studied</span></div><div><b>{entries.filter(e=>e.review.rating>=3).length}</b><span>Successful recalls</span></div></div><div className="historyList">{entries.map((entry,i)=><div className="historyRow" key={entry.problem.id+entry.review.at+i}><i className={'rating'+entry.review.rating}>{entry.review.rating}</i><div><h3>{entry.problem.title||'Untitled flash card'}</h3><span>{notebookName(entry.card.notebookId)} · {entry.card.title}</span></div><div><small>RESULT</small><b>{names[entry.review.rating]}</b></div><div><small>NEXT INTERVAL</small><b>{entry.review.scheduledDays} {entry.review.scheduledDays===1?'day':'days'}</b></div><time>{new Date(entry.review.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</time></div>)}</div></>:<div className="historyEmpty"><CalendarDays size={34}/><h2>No reviews yet</h2></div>}</div></main>;
}

function restoreTrashItem(item:TrashItem,data:AppData,setData:(data:AppData)=>void){
  let works=[...data.works];
  let notebooks=[...data.notebooks];
  let cards=[...data.cards];
  if(item.kind==='work'){
    if(!works.some(w=>w.id===item.work.id))works.push(item.work);
    for(const entry of item.workbooks){if(!notebooks.some(n=>n.id===entry.notebook.id))notebooks.push(entry.notebook);for(const page of entry.pages)if(!cards.some(c=>c.id===page.id))cards.push(page)}
  }else if(item.kind==='notebook'){
    if(!notebooks.some(n=>n.id===item.notebook.id))notebooks.push(item.notebook);
    for(const page of item.pages)if(!cards.some(c=>c.id===page.id))cards.push(page);
  }else if(item.kind==='page'){
    const sourceNotebook=item.notebook;
    if(sourceNotebook&&!notebooks.some(n=>n.id===sourceNotebook.id))notebooks.push(sourceNotebook);
    if(!cards.some(c=>c.id===item.page.id))cards.push(item.page);
  }else{
    const sourceNotebook=item.notebook;
    if(sourceNotebook&&!notebooks.some(n=>n.id===sourceNotebook.id))notebooks.push(sourceNotebook);
    let page=cards.find(c=>c.id===item.pageId);
    if(!page){
      const now=new Date().toISOString();
      page={id:item.pageId,notebookId:item.notebookId,title:item.pageTitle,core:'',notes:'',problems:[],tags:[],createdAt:now,updatedAt:now,due:now,stability:1,difficulty:5,reps:0,lapses:0,reviews:[]};
      cards.push(page);
    }
    cards=cards.map(c=>c.id===page!.id&&!c.problems.some(p=>p.id===item.flash.id)?{...c,problems:[...c.problems,item.flash]}:c);
  }
  setData({...data,works,notebooks,cards,trash:(data.trash??[]).filter(x=>x.id!==item.id)});
}

function RecentlyDeleted({items,restore,remove}:{items:TrashItem[];restore:(item:TrashItem)=>void;remove:(id:string)=>void}){
  const sorted=[...items].sort((a,b)=>new Date(b.deletedAt).getTime()-new Date(a.deletedAt).getTime());
  const daysLeft=(item:TrashItem)=>Math.max(1,Math.ceil((TRASH_LIFETIME-(Date.now()-new Date(item.deletedAt).getTime()))/86400000));
  return <main className="trashPage"><header><h1>Deleted</h1></header><div className="trashContent">{sorted.length?<div className="trashList">{sorted.map(item=><div className="trashRow" key={item.id}><div className="trashIcon">{item.kind==='work'?'▦':item.kind==='notebook'?'▣':item.kind==='page'?'▤':'◇'}</div><div><small>{item.kind==='work'?'WORK':item.kind==='notebook'?'WORKBOOK':item.kind==='page'?'PAGE':'FLASH CARD'}</small><h3>{item.kind==='work'?item.work.title:item.kind==='notebook'?item.notebook.title:item.kind==='page'?item.page.title:(item.flash.title||'Untitled flash card')}</h3><span>{item.kind==='work'?`${item.workbooks.length} ${item.workbooks.length===1?'workbook':'workbooks'}`:item.kind==='notebook'?`${item.pages.length} ${item.pages.length===1?'page':'pages'}`:item.kind==='page'?(item.notebook?.title||'Workbook'):`${item.notebook?.title||'Workbook'} · ${item.pageTitle}`}</span></div><time>Deletes in {daysLeft(item)} {daysLeft(item)===1?'day':'days'}</time><button onClick={()=>restore(item)}>Restore</button><button className="deleteForever" onClick={()=>{if(window.confirm('Delete this item permanently?'))remove(item.id)}}><Trash2 size={15}/></button></div>)}</div>:<div className="trashEmpty"><Trash2 size={34}/><h2>Deleted is empty</h2></div>}</div></main>;
}

function StudyView({item,index,total,revealed,setRevealed,rate,requeue,toggleStar,skipVariant,exit,goToDeck}:{item?:{card:Card;problem:Problem};index:number;total:number;revealed:boolean;setRevealed:(x:boolean)=>void;rate:(r:Rating)=>void;requeue:()=>void;toggleStar:(cardId:string,problemId:string)=>void;skipVariant:()=>void;exit:()=>void;goToDeck:()=>void}){
  const ratingsRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(revealed)window.setTimeout(()=>ratingsRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'}),50)},[revealed,index]);
  useEffect(()=>{if(!item)return;const onKey=(event:globalThis.KeyboardEvent)=>{const target=event.target as HTMLElement|null;if(target?.matches('input, textarea, [contenteditable="true"]'))return;if(event.code==='Space'&&!revealed){event.preventDefault();setRevealed(true);return}if(revealed&&event.key.toLowerCase()==='r'){event.preventDefault();requeue();return}if(revealed&&['1','2','3','4'].includes(event.key)){event.preventDefault();rate(Number(event.key) as Rating)}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[item,revealed,rate,requeue,setRevealed]);
  if(!item)return <main className="study complete"><div className="studyTop"><button onClick={exit}><ChevronLeft size={18}/> Back to queue</button></div><div className="completeCard"><div>✓</div><h1>Queue complete</h1><p>You reviewed {total} {total===1?'flash card':'flash cards'}. Their next reviews have been scheduled.</p><button onClick={exit}>View study queue</button></div></main>;
  const {card,problem}=item;
  const variants=problemVariants(problem);const variant=variants.find(v=>v.id===problem.currentVariantId)??variants[0];
  return <main className="study"><div className="studyTop"><button onClick={exit} title="Close and return to Queue"><X size={18}/> Close</button><div><span>{index+1} of {total}</span><i><b style={{width:`${((index+1)/Math.max(total,1))*100}%`}}/></i></div><div className="studyTopActions"><button className="studyGoToDeck" onClick={goToDeck}><BookOpen size={16}/> Go to deck</button><div className="studyShortcuts"><Command size={16}/> Space · 1–4 · R</div></div></div><div className="studyStage"><div className={'studyCard '+(revealed?'revealed':'')}><div className="studyLabel"><span>{problem.title||'FLASH CARD'}</span><small>{card.title}</small><button className={'studyStarButton '+(problem.starred?'starred':'')} title={problem.starred?'Unstar flashcard':'Star flashcard'} onClick={()=>toggleStar(card.id,problem.id)}><Star size={18} fill={problem.starred?'currentColor':'none'}/></button></div><div className="studyQuestion"><RichText text={variant?.prompt||'Untitled flash card'}/></div>{(variant?.frontImages??variant?.images??[]).length>0&&<div className="flashImages studyImages">{(variant?.frontImages??variant?.images??[]).map((src,i)=><img key={i} src={src}/>)}</div>}{revealed&&<div className="answer"><label>ANSWER</label><RichText text={variant?.solution||'No answer has been added yet.'}/>{(variant?.backImages??[]).length>0&&<div className="flashImages studyImages">{variant!.backImages!.map((src,i)=><img key={i} src={src}/>)}</div>}</div>}</div><button className="skipVariant" onClick={skipVariant}><SkipForward size={14}/> Skip variant</button>{!revealed?<button className="reveal" onClick={()=>setRevealed(true)}>Reveal answer <small>Space</small></button>:<div className="ratings" ref={ratingsRef}><button className="requeueRating" onClick={requeue}><b>Requeue</b><small>End of session</small><kbd>R</kbd></button>{([1,2,3,4] as Rating[]).map((r,i)=><button key={r} onClick={()=>rate(r)}><b>{['Again','Hard','Good','Easy'][i]}</b><small>{['1 day','Soon','On time','Later'][i]}</small><kbd>{r}</kbd></button>)}</div>}</div></main>;
}
