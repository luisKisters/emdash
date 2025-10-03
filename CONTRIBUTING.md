# Contributing to emdash

Thanks for your interest in contributing! We favor small, focused PRs and clear intent over big bangs. This guide explains how to get set up, the workflow we use, and a few project‑specific conventions.

## Quick Start

Prerequisites

- Node.js 18+ and Git
- Optional (recommended for end‑to‑end):
  - Codex CLI (`npm install -g @openai/codex` or `brew install codex`; then run `codex` to authenticate)
  - GitHub CLI (`brew install gh`; then `gh auth login`)

Setup

```
# Fork this repo, then clone your fork
 git clone https://github.com/<you>/emdash.git
 cd emdash
 npm install

# Start development (Electron main + Vite renderer)
 npm run dev

# Type checking, lint, build
 npm run type-check
 npm run lint
 npm run build
```

Tip: During development, the renderer hot‑reloads. Changes to the Electron main process (files in `src/main`) require a restart of the dev app.

## Project Overview

- `src/main/` – Electron main process, IPC handlers, services (Git, worktrees, Codex process manager, DB, etc.)
- `src/renderer/` – React UI (Vite), hooks, components
- Local database – SQLite file created under the OS userData folder (see “Local DB” below)
- Worktrees – Git worktrees are created outside your repo root in a sibling `worktrees/` folder
- Logs – Agent stream logs are written to the OS userData folder (not inside repos)

## Development Workflow

1. Create a feature branch

```
 git checkout -b feat/<short-slug>
```

2. Make changes and keep PRs small and focused

- Prefer a series of small PRs over one large one.
- Include UI screenshots/GIFs when modifying the interface.
- Update docs (README or inline help) when behavior changes.

3. Run checks locally

```
 npm run type-check
 npm run lint
 npm run build
```

4. Commit using Conventional Commits

- `feat:` – new user‑facing capability
- `fix:` – bug fix
- `chore:`, `refactor:`, `docs:`, `perf:`, `test:` etc.

Examples

```
fix(chat): preserve stream state across workspace switches

feat(ci): add type-check + build workflow for PRs
```

5. Open a Pull Request

- Describe the change, rationale, and testing steps.
- Link related Issues.
- Keep the PR title in Conventional Commit format if possible.

## Code Style and Patterns

TypeScript + ESLint

- Keep code type‑safe. Run `npm run type-check` before pushing.
- Run `npm run lint` and address warnings where reasonable.

Electron main (Node side)

- Prefer `execFile` over `exec` to avoid shell quoting issues.
- Never write logs into Git worktrees. Stream logs belong in the Electron `userData` folder.
- Be conservative with console logging; noisy logs reduce signal. Use clear prefixes.

Git and worktrees

- The app creates worktrees in a sibling `../worktrees/` folder.
- Do not delete worktree folders from Finder/Explorer; if you need cleanup, use:
  - `git worktree prune` (from the main repo)
  - or the in‑app workspace removal
- The file `codex-stream.log` is intentionally excluded from Git status and auto‑ignored in new worktrees.

Renderer (React)

- Components live under `src/renderer/components`; hooks under `src/renderer/hooks`.
- Streaming UI conventions:
  - “Reasoning” content renders inside a collapsible.
  - Response content is shown only after a `codex` marker.
  - While waiting for the first marker, show the minimal “loading/working” indicator.
- Use existing UI primitives and Tailwind utility classes for consistency.
- Aim for accessible elements (labels, `aria-*` where appropriate).

Local DB (SQLite)

- Location (Electron `app.getPath('userData')`):
  - macOS: `~/Library/Application Support/emdash/emdash.db`
  - Linux: `~/.config/emdash/emdash.db`
  - Windows: `%APPDATA%\emdash\emdash.db`
- Reset: quit the app, delete the file, relaunch (the schema is recreated).

## Issue Reports and Feature Requests

- Use GitHub Issues. Include:
  - OS, Node version
  - Steps to reproduce
  - Relevant logs (renderer console, terminal output)
  - Screenshots/GIFs for UI issues

## Release Process (maintainers)

- Bump version in `package.json`.
- Tag and publish a GitHub Release.
- Keep the CHANGELOG concise and user‑facing.
