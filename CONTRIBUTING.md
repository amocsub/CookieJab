# Contributing

## Setup

1. Clone the repository.
2. Open `chrome://extensions` and enable Developer mode.
3. Click Load unpacked and select the repository folder.
4. Before you open a pull request, run `npm test`.
5. If you changed `background.js` or `popup.js`, run `scripts/e2e.mjs`. See the Development section of the README.

Node.js 20 or later is required. There are no dependencies to install.

## Rules

- Keep the extension free of runtime dependencies and build steps. The files in the repository are the files that ship.
- Make one change per pull request.
- Add a test in `test/` for each change to `match-pattern.js`.
- Add an entry to `CHANGELOG.md` under `Unreleased`.
- Before you add a permission to `manifest.json`, open an issue. Each permission needs a justification in the Chrome Web Store listing.
