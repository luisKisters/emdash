Telemetry

Overview
- Emdash collects anonymous usage telemetry to improve the app.
- Telemetry defaults to enabled and can be disabled via `TELEMETRY_ENABLED=false`.
- Data is sent to PostHog using explicit, allowlisted events only.

Environment variables
- `TELEMETRY_ENABLED` (default: `true`): set to `false` to disable.
- `POSTHOG_PROJECT_API_KEY`: PostHog project API key (required to send events).
- `POSTHOG_HOST`: PostHog host (e.g., https://us.i.posthog.com, https://eu.i.posthog.com, or your self-hosted domain).
- `INSTALL_SOURCE` (optional): override install source label (e.g., `dmg`, `dev`, `self_host`).

Events
- `app_started` (sent automatically on app start)
  - Properties (added automatically): `app_version`, `electron_version`, `platform`, `arch`, `is_dev`, `install_source`
- `app_closed` (sent automatically on quit)
  - Same automatic properties as above
- `feature_used`
  - Allowed properties: `feature` (string)
- `error`
  - Allowed properties: `type` (string)

Data not collected
- No code, file paths, repository names, prompts, environment variables, or PII are sent.
- IP addresses, session replay, and autocapture are not used by default; only explicit events are sent.

Distinct ID
- A random anonymous `instanceId` is generated and stored locally at: `${appData}/telemetry.json`.
- This ID is used as `distinct_id` for telemetry events.

Opt-out
- In-app: Settings → General → Privacy & Telemetry (toggle off), or
- Env var: set `TELEMETRY_ENABLED=false` before launching the app to disable telemetry entirely.

Using from renderer (optional)
- You can capture a minimal set of events from the renderer via:
  - `window.electronAPI.captureTelemetry('feature_used', { feature: 'xyz' })`
  - `window.electronAPI.captureTelemetry('error', { type: 'some_error_type' })`
- Any non-allowlisted properties are dropped server-side in the main-process sanitizer.
