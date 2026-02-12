# SubSpot (MVP)

SubSpot is a browser-based **Sub Placement Coach** that uses a phone/laptop microphone to compare bass smoothness at a listening position.

This MVP is intentionally relative and decision-focused:
- Measure one run quickly.
- Compare A vs B placements.
- Compare phase 0 vs 180.
- Get a clear winner with plain-English guidance.
- Keep day-to-day flow simple; advanced workflows live under `/advanced`.

## What This MVP Does
- Requests microphone input with processing disabled when possible (`echoCancellation`, `noiseSuppression`, `autoGainControl` set false).
- Detects a 1 kHz sync beep from the test track.
- Measures known bass tone segments with Goertzel analysis.
- Normalizes to per-run relative dB (median-centered).
- Computes smoothness score, worst peak/dip, deep-dip and big-peak counts.
- Scores each run for measurement quality and flags poor captures.
- Supports repeatability compare mode (2-3 runs per side, median-profile compare with noise-floor gating).
- Supports multi-seat compromise mode (Center/Left/Right seat weighting for A vs B).
- Supports placement scout mode (auto-rank candidate locations and promote top two into guided A/B).
- Enforces run-to-run volume consistency gates to catch level drift between captures.
- Includes local session tools: fresh-session reset plus full JSON bundle export/import (sessions, runs, snapshots, guided state, setup prefs).
- Includes Final Decision Assistant page that fuses all evidence, assigns confidence, and exports/prints a report.
- Supports Decision Snapshots so you can track recommendation changes before/after placement moves.
- Supports named experiment sessions; new runs and decision snapshots attach to the active session.
- Supports session-scoped winner lock-in (placement + phase + notes) so you can persist a chosen baseline.
- Stores up to 50 runs in `localStorage` (`subspot.v1.runs`) with migration stub.
- Home focuses on three primary flows: Baseline, A/B, and Phase.

## What It Does Not Do
- No precise PEQ filter generation.
- No millisecond delay/phase alignment.
- No full-range speaker correction.
- No backend or account system.

## Tech Stack
- Next.js (App Router) + TypeScript
- Recharts for response overlays
- CSS modules + global CSS variables
- Vitest for DSP unit tests

## Project Structure
- `app/` routes and page flow
- `components/` shared UI
- `lib/audio/` recorder + DSP analysis
- `lib/storage/` local storage model and migration stub
- `public/test-tracks/` generated WAV test track
- `scripts/generate-test-track.mjs` reproducible track generation
- `tests/` DSP and synthetic signal tests
- `docs/` MVP spec and measurement guide

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Generate test track (already committed, rerun if needed):
   ```bash
   npm run generate:test-track
   ```
3. Start dev server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000)

## Build and Test
- Run tests:
  ```bash
  npm test
  ```
- Production build check:
  ```bash
  npm run build
  ```
- End-to-end tests (Playwright):
  ```bash
  npx playwright install chromium
  npm run test:e2e
  ```
  Optional headed mode:
  ```bash
  npm run test:e2e:headed
  ```

## Test Track Details
File: `public/test-tracks/subspot_mvp.wav`

- Sample rate: 48 kHz
- Duration: ~75 seconds
- Sequence:
  - 0.0-0.5s silence
  - 0.5-1.0s 1 kHz sync beep
  - 1.0-1.5s silence
  - Two passes of tone steps: `25, 31.5, 40, 50, 63, 80, 100, 125 Hz`
  - Each step: `0.25s silence + 4.0s tone + 0.25s silence`

## Measurement Workflow (MVP)
1. Open SubSpot on phone/laptop at listening seat.
2. Pick mode:
   - Baseline
   - A/B placement compare
   - Phase compare
   - Open Advanced Tools for multi-seat/scout workflows
3. In Setup:
   - Complete checklist + mic level check on first-time setup
   - Use \"Run Full Setup Again\" only when needed on returning sessions
   - Optional for A/B or phase: start a guided repeatability session (2x or 3x per side)
   - For placement scout: start guided scout session and choose 4-8 candidate slots
   - Open/download test track
4. In Record:
   - Optional: run 10-second Quick Preflight for level sanity
   - Tap **Start Listening**
   - Play test track on main system
   - Wait for completion (or manual sync if beep not detected)
5. In Results:
   - Read curve + smoothness summary
   - Label run (`Placement A/B` or `Phase 0/180`)
   - In scout mode, labels are `Scout Location N` and fill guided scout progress
   - If guided session is active, continue to next guided step from Results
6. In Compare:
   - Use simple compare for baseline/A-B/phase runs
   - Pick two runs and read the winner recommendation
7. In Advanced Tools:
   - Use advanced compare, guided workflows, session management, and backup controls
8. In Final Decision Assistant:
   - Select/create/rename experiment sessions (for longitudinal tracking)
   - Review unified placement + phase recommendation with confidence tier
   - Lock current winners as the active baseline for this session
   - Save decision snapshots and compare against current recommendations over time
   - Export one-click decision report JSON
   - Print a concise decision summary

## Practical Use Notes
- These are **relative** results, not calibrated SPL.
- Keep volume and mic position fixed between runs.
- Consumer mic processing may still be active despite constraint requests.
- If clipping appears, lower playback volume slightly and re-run.
