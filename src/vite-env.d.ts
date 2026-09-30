/// <reference types="vite/client" />
interface Window { folio?: { load: () => Promise<unknown>; save: (data: unknown) => Promise<boolean>; exportPdf: (html:string, defaultName:string) => Promise<{canceled:boolean;filePath?:string}> } }
