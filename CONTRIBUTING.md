# Contributing

## Setup

1. Clone the repository.
2. Open `chrome://extensions`, enable Developer mode, and load the repository folder with Load unpacked.
3. Run `npm test` before you open a pull request. Node.js 20 or later is required. There are no dependencies to install.

## Rules

- Keep the extension free of runtime dependencies and build steps. The files in the repository are the files that ship.
- Make one change per pull request.
- Add a test in `test/` for every change to `match-pattern.js`.
- Add an entry to `CHANGELOG.md` under `Unreleased`.
- Do not add permissions to `manifest.json` without a discussion in an issue first. Every permission needs a justification in the Chrome Web Store listing.
