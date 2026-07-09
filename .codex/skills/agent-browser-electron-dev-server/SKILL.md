---
name: agent-browser-electron-dev-server
description: Test Electron desktop apps and dev servers with Agent Browser through Chrome DevTools remote debugging. Use when Codex needs to verify an Electron app end-to-end, connect Agent Browser to a remote-debugging port, debug blank renderer/dev-server issues, capture screenshots or videos, or prove UI behavior in apps such as Emdash.
---

# Agent Browser Electron Dev Server

## Core Workflow

Use Agent Browser, not Chrome DevTools MCP, to drive the Electron app through the
remote-debugging port. Keep the user informed about what is actually tested and what
failed. Do not claim e2e coverage until Agent Browser has interacted with the running
Electron window and assertions or screenshots prove the behavior.

1. Check or install Agent Browser:

```bash
agent-browser --version || npm install -g agent-browser
agent-browser skills get core
agent-browser skills get electron
```

2. Pick a remote-debugging port and clear stale app processes if they belong to the
   same repo/test run:

```bash
pgrep -af 'electron|electron-vite|remote-debugging-port'
pkill -f 'remote-debugging-port=9555' || true
```

Avoid killing unrelated user apps. If several app instances exist, inspect the command
line and choose a new port instead.

3. Launch Electron with remote debugging.

For an Emdash dev server from the repo root, prefer Node 24 if available:

```bash
PATH=/home/devuser/.local/node24/bin:$PATH xvfb-run -a pnpm --filter @emdash/emdash-desktop run dev -- --remote-debugging-port=9555 --no-sandbox --disable-gpu
```

If dev mode connects but the renderer is blank, build and launch the packaged app entry
instead:

```bash
PATH=/home/devuser/.local/node24/bin:$PATH pnpm --filter @emdash/emdash-desktop run build
PATH=/home/devuser/.local/node24/bin:$PATH xvfb-run -a pnpm --filter @emdash/emdash-desktop exec electron . --remote-debugging-port=9555 --no-sandbox --disable-gpu
```

4. Verify the CDP endpoint before using Agent Browser:

```bash
curl -sf http://127.0.0.1:9555/json/version
```

Expect Electron/Chrome metadata and a `webSocketDebuggerUrl`.

5. Connect Agent Browser and inspect the UI:

```bash
agent-browser --session emdash-e2e connect 9555
agent-browser --session emdash-e2e tab list
agent-browser --session emdash-e2e snapshot -i -d 6
agent-browser --session emdash-e2e screenshot /tmp/emdash-e2e/initial.png
```

If `snapshot` returns no interactive elements, check the app console and page root:

```bash
agent-browser --session emdash-e2e console
agent-browser --session emdash-e2e errors
agent-browser --session emdash-e2e eval "({url: location.href, root: document.querySelector('#root')?.innerHTML?.slice(0, 200)})"
```

## Interaction Pattern

Use semantic locators first:

```bash
agent-browser --session emdash-e2e find role button click --name Settings
agent-browser --session emdash-e2e find label "Search settings" fill font
agent-browser --session emdash-e2e press Enter
```

When testing highlights, toasts, transitions, or other short-lived states, assert quickly
with `eval` before taking screenshots:

```bash
agent-browser --session emdash-e2e eval "Boolean(document.querySelector('[data-setting-id=\"terminal-font-size\"][data-highlighted=\"true\"]'))"
agent-browser --session emdash-e2e screenshot /tmp/emdash-e2e/highlight.png
```

Use screenshots as evidence, but pair them with DOM assertions for behavior that can be
hard to see visually.

## Evidence Requirements

For UI changes, collect evidence for all relevant use cases:

- Initial reachable app state.
- Main happy path interaction.
- Navigation to the target screen or element.
- Highlight/focus/selection state when that is part of the feature.
- Empty, error, or no-results states.
- Keyboard shortcuts if the feature supports them.
- Console output and page errors after the flow.

Place screenshots in a stable temp folder:

```bash
mkdir -p /tmp/emdash-e2e
agent-browser --session emdash-e2e screenshot /tmp/emdash-e2e/01-state.png
```

If the user asks for video, try Agent Browser recording:

```bash
agent-browser --session emdash-e2e record start /tmp/emdash-e2e/demo.webm
agent-browser --session emdash-e2e record stop
```

Recording can fail for attached Electron CDP targets because Agent Browser may not be
able to create a fresh browser context. If it fails, state that clearly and provide
screenshots instead.

## Debugging Notes

- `git pull --all` does not create local branches for remote branches; use
  `git fetch <remote>` and `git switch --track <remote>/<branch>`.
- `scp host:/tmp/...` only works if the SSH endpoint sees the same filesystem as Codex.
  If it does not, publish artifacts through a reachable channel such as a GitHub
  prerelease asset on the user’s fork.
- On Linux, Electron may emit DBus warnings under Xvfb. Treat them as noise unless the
  renderer fails.
- On Linux, macOS DMG creation may fail because Electron Builder calls Apple utilities
  such as `sips`; a mac zip can still be produced while DMG generation fails.
- If `npx agent-browser` repeatedly restarts the daemon or races short-lived UI states,
  install `agent-browser` globally and use the direct binary.

## Handoff

In the final response, include:

- Whether Agent Browser connected to Electron through remote debugging.
- Exact command shape used to launch the app.
- Which flows were tested and which assertions passed.
- Screenshot/video paths or artifact URLs.
- Console/page errors, including when there were none.
- Any limitations, especially dev-server blank renderer, recording failure, or platform
  packaging constraints.
