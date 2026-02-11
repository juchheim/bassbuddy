# BassBuddy (MVP) Specification

## Product Goal
BassBuddy is a browser-based sub placement coach that uses a phone/laptop microphone to compare bass smoothness at a listening position. In about 5 minutes, a user should be able to:

1. Run a guided measurement from the listening seat.
2. Compare two sub placements (A/B) and pick a winner.
3. Compare phase switch 0° vs 180° and pick a winner.

This MVP reports relative bass response only and focuses on simple, human-readable decisions.

## Scope

### In Scope
- Next.js App Router + TypeScript client application.
- Browser mic capture with processing constraints requested.
- Sync beep detection, known-segment tone analysis, relative normalization.
- Smoothness scoring and highlight callouts.
- Baseline, A/B, phase, multi-seat compromise, and placement-scout workflows.
- Local persistence with schema versioning/migration stub.
- Local session tools (fresh session reset + JSON export/import).
- Test-track page and downloadable test track.
- Unit tests for DSP core modules.

### Out of Scope
- Precise PEQ generation (gains/Q/filter recommendations).
- Fine delay/phase optimization in milliseconds.
- Full-range speaker correction.
- User accounts or cloud sync.

## Audio Test Track
Single test track `bassbuddy_mvp.wav` in `/public/test-tracks/`.

### Layout
- `0.0-0.5s`: silence
- `0.5-1.0s`: 1 kHz sync beep
- `1.0-1.5s`: silence
- Then tone blocks for frequencies:
  - `[25, 31.5, 40, 50, 63, 80, 100, 125]`
- Per frequency block:
  - `0.25s` silence
  - `4.0s` sine tone
  - `0.25s` silence
- Tone sequence is repeated for two passes to improve robustness and make the track ~75s.

## Processing Pipeline
1. Record PCM from microphone.
2. Detect sync beep near 1 kHz using Goertzel over short windows.
3. Compute tone windows from known schedule after beep time.
4. For each tone, ignore first `0.5s`; analyze remaining segment with robust per-window median.
5. Convert to log scale and normalize against run median for relative dB.
6. Compute Smoothness Score and highlight metrics.

## Score Definition
For each relative level `d` in dB:
- Peak penalty: `max(0, d - 6)^2`
- Dip penalty: `max(0, -10 - d)^2 * 1.5`
- Total score = sum of all penalties

Derived highlights:
- Worst peak frequency and dB
- Worst dip frequency and dB
- Deep dip count (`d < -10`)
- Big peak count (`d > +6`)

## Compare Decision Rules
Winner between two runs:
1. Lower Smoothness Score wins.
2. If scores within 5%, fewer deep dips wins.
3. If still tied, lower max peak wins.
4. Else tie.

## UX & Safety Requirements
- Always show disclaimers:
  - Relative measurements only (not calibrated SPL).
  - Keep playback volume and mic placement constant.
  - Device mic processing may affect results.
- Show warning if clipping or too quiet during level check/record.
- Mobile-first layout with large touch targets.

## Supported Browsers (Best Effort)
- Chrome desktop
- Chrome Android
- Safari iOS (with warnings where constraints/settings are unavailable)

## Data Model
Local storage key: `bassbuddy.v1.runs`.

Run fields:
- `id`, `createdAt`, `mode`, optional `label`
- `deviceInfo`
- `micSettings` (requested + actual snapshots)
- `sampleRate`
- `beepDetected`
- `confidence` (`high`|`medium`|`low`)
- `measurements[]` with `freqHz`, `levelRaw`, `levelRelDb`
- `score`
- `highlights`
- optional `notes`

Retention:
- Keep most recent 50 runs with LRU pruning.

## Deliverables
- Next.js MVP app routes and components.
- DSP and audio capture modules.
- Test track generator script (`/scripts/generate-test-track.mjs`) and generated WAV.
- Unit tests for DSP pipeline.
- Documentation and run instructions.
