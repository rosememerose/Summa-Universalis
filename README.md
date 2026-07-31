# Folio

Folio is a local-first desktop notebook built around durable ideas instead of long documents. Each notebook contains page cards with a core idea, working notes, tags, and multiple worked problems. Due pages enter a four-grade spaced-repetition study queue.

## Run locally

This project uses Electron, React, TypeScript, and Vite.

For normal use, double-click **Launch Folio.cmd**. It opens the existing production build without running the package manager.

```powershell
pnpm install
pnpm dev
```

If `pnpm` is not on your PATH, use the bundled Codex runtime:

```powershell
& 'C:\Users\makad\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd' dev
```

## Build

```powershell
pnpm build
```

Create a Windows installer with `pnpm package`. App data is written atomically to `folio-data.json` inside Electron's per-user application-data folder and never leaves the computer.

## Current MVP

- Notebook and page-card navigation
- Core idea, working notes, tags, and multiple worked examples
- Previous/next page controls and random page navigation
- Local autosave through a constrained Electron IPC bridge
- Due queue with Again, Hard, Good, and Easy grading
- Stability, difficulty, lapses, scheduling, and complete review history per card
- Responsive, paper-inspired desktop interface

The scheduler is an FSRS-style implementation built around stability, difficulty, and retrievability. Before production use, the next scheduler milestone should replace the local formula with the official FSRS package and its complete parameter set.
