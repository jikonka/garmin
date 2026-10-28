# TriPlan

TriPlan is a private macOS desktop application that turns Garmin activity files into an adaptive Olympic-triathlon training plan. It keeps data locally, monitors a selected folder for new `.fit` activities, and proposes schedule changes for review.

## First release

- Guided athlete, race, availability, and health-constraint setup
- Plan through race day with a firm two-week window
- Swimming, cycling, running, brick, bodyweight strength, and rest sessions
- Calendar drag-and-drop and workout locking
- Daily energy, soreness, sleep, and available-time check-in
- Travel and busy-period scheduling
- Garmin FIT activity decoding, duplicate detection, and import reporting
- Reviewable recovery and workload adjustments
- Progress summaries
- Portable `.triplan` backup and restore

Original FIT files are never changed. TriPlan stores extracted activity summaries in the macOS application-data directory. A backup can be saved to any local or synchronized folder, including iCloud Drive.

## Run locally

Requirements: Node.js 22 or later.

```bash
npm install
npm start
```

## Test

```bash
npm run check
npm test
```

## Build for macOS

On a Mac:

```bash
npm run dist:mac
```

The Apple Silicon installer is written to `dist/`. The GitHub Actions workflow publishes the M-series Mac DMG as a single uncompressed artifact for faster downloading.

The development build is unsigned. On first launch, macOS may require Control-clicking TriPlan, choosing **Open**, and confirming. Apple signing and notarization can be added before wider distribution.

## Garmin files

Choose a folder containing completed activity FIT files downloaded from Garmin Connect or copied from a Garmin device. FIT workout-definition files do not contain completed session data, so TriPlan reports them as unsupported rather than treating them as activities.

## Privacy and safety

TriPlan does not create an online account or send health information to a server. Its guidance is not medical advice. Users should stop training and seek qualified medical care for concerning symptoms or injury.

The repository's earlier generated Garmin workout files remain in `workouts/`, and previous plan documents remain in `plan/`.
