# SubSpot MVP Usability Assessment (Iteration 1)

## Scope
Assessment focused on first-run onboarding friction, repeat-use speed, action clarity, and mode-entry flow.

## Findings
1. **High repeat friction in Setup**
- Checklist and mic level check were mandatory on every run.
- Returning users had to repeat the same preflight despite unchanged environment.

2. **Home actions did not match repeat-user intent**
- Mode cards always entered Setup, even when user intent was immediate re-measurement.

3. **No clear setup state visibility**
- Users could not tell whether they were in first-run setup vs returning quick-start mode.

4. **Re-check path not explicit**
- Even when setup could reasonably be skipped, users still need a clear way to rerun safety checks.

## UI/UX Changes Implemented
1. **First-time-only setup completion state**
- Added UI preference storage (`subspot.v1.uiPrefs`) with versioned schema.
- Setup is now required once per device/browser profile.

2. **Quick Start for returning users**
- After setup is completed, mode entry goes directly to Record.
- Setup page now shows a Quick Start panel with:
  - Last setup completion timestamp
  - "Continue to Record"
  - "Run Full Setup Again"

3. **Record page setup gate**
- Direct `/record` access now verifies setup completion.
- First-time users are redirected to `/setup` for required preflight.

4. **Home page setup status panel**
- Added explicit setup state messaging.
- Added direct actions:
  - Run Setup Checks
  - Open Test Track

## Expected Impact
- Faster repeat measurements with fewer unnecessary steps.
- Reduced drop-off for AB/phase iterative testing.
- Better discoverability for both quick-start and full re-check workflows.

## Follow-Up Opportunities
- Add optional "quick preflight" (10-second meter only) before recording.
- Add a sticky mini player for test-track guidance during recording.
- Add run history tags/filters to improve compare selection speed.
