# orcbench

**Provider-agnostic Conductor.build for Codex Agents**

Run multiple Codex Agents in parallel with isolated Git worktrees.

![App Screenshot](images/screenshot.png)

## Requirements

### GitHub CLI
orcbench requires GitHub CLI to be installed and authenticated:

**Install GitHub CLI:**
- **macOS:** `brew install gh`
- **Linux:** `sudo apt install gh` (Ubuntu/Debian) or `sudo dnf install gh` (Fedora)
- **Windows:** `winget install GitHub.cli`

**Authenticate:**
```bash
gh auth login
```

Follow the prompts to authenticate with your GitHub account.

## Getting Started

1. Install GitHub CLI (see Requirements above)
2. Authenticate with GitHub: `gh auth login`
3. Clone this repository
4. Install dependencies: `npm install`
5. Run the app: `npm run dev`

