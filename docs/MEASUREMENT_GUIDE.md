# BassBuddy Measurement Guide (MVP)

## Before You Start
- Place your phone/laptop at the main listening position.
- Keep the mic unobstructed and pointed consistently between runs.
- Keep playback volume fixed for all comparisons.
- Disable voice isolation/noise suppression modes if your device allows.

## Recommended Setup
1. Open BassBuddy on the device used as measurement microphone.
2. Open the ~75s test track on your playback system (TV/streamer/other laptop).
3. In BassBuddy, complete mic level check and confirm no clipping.
4. Start listening in BassBuddy, then play the test track.

## Measurement Modes
- **Quick Baseline**: capture one reference run.
- **Compare Placements (A/B)**: measure placement A and placement B.
- **Phase Test (0 vs 180)**: measure phase switch positions.
- **Multi-Seat Compromise (A/B)**: measure center/left/right seats for each placement and choose the best compromise.
- **Placement Scout (4-8 candidates)**: measure several candidate locations, auto-rank them, then promote top two into guided A/B.

## During Recording
- Keep room conditions steady.
- Avoid moving the mic/device.
- Avoid speaking or extra noise.
- Wait for “Measurement captured” before touching controls.

## Reading Results
- **Response Curve**: frequency vs relative dB around run median.
- **Smoothness Score**: lower is better.
- **Worst Peak**: likely “boom” area.
- **Worst Dip**: likely cancellation area (often position-related).

## Practical Interpretation
- If one run has lower score and fewer deep dips, use that configuration.
- In scout mode, use ranked top-two candidates only as finalists; always confirm with guided A/B at the listening seat.
- Big peaks can improve by reducing boundary loading (move sub away from corners/walls).
- Deep dips often need location changes (move sub ~1-2 ft and re-test).
- If the app flags volume drift, re-run captures at matched playback level before deciding.

## Important Limitations
- Results are relative, not calibrated SPL.
- Consumer mic processing can bias measurements.
- Use this tool for quick placement/phase decisions, not precision EQ design.

## Finalizing
- Open **Final Decision Assistant** to combine scout, A/B, multi-seat, and phase evidence.
- Create a named experiment session for each physical experiment cycle (e.g., corner test vs front-wall test).
- Compare views are session-scoped, so switch to the matching experiment session before evaluating winners.
- Save a **Decision Snapshot** before and after each physical change to track recommendation drift.
- Follow the action plan if confidence is medium/low.
- Export JSON and print the summary for your setup notes.
