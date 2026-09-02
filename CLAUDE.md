# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There are no dependencies and no build step. The files in the repository are the files that ship.

```sh
npm run check                                   # Syntax check of the scripts and the manifest
npm test                                        # All unit tests (node --test)
node --test --test-name-pattern="ports"         # One unit test by name
npm run build                                   # dist/cookiejab-<version>.zip
store/render.sh                                 # Store images and icons/icon128.png, with headless Chrome
```

The browser test needs Chrome for Testing. Google Chrome ignores `--load-extension` since version 137.

```sh
npx @puppeteer/browsers install chrome@stable   # Prints the binary path
CHROME="<binary path>" node scripts/e2e.mjs
```

## Architecture

Three runtime files share one ES module:

- `match-pattern.js` parses Chrome match patterns and gives two views of the same pattern. `matchesUrl` compares a URL in JavaScript. `toDnrCondition` builds a `declarativeNetRequest` condition with an anchored `regexFilter` and `requestDomains`. The two views must agree. The `both()` helper in `test/match-pattern.test.js` asserts that agreement, so a change to one view needs the same change in the other.
- `background.js` is the service worker. It reacts to `chrome.storage.onChanged` on the `rules` key. Header rules become dynamic `declarativeNetRequest` rules, rebuilt from scratch on each change. Cookie rules run on `webNavigation.onBeforeNavigate` for top level frames and call `chrome.cookies.set` on the page origin with path `/`.
- `popup.js` is the only writer of `rules`. It validates a rule before it saves it and stores the canonical pattern from `parseMatchPattern`. Rules that share a `bundle` text group into one card with a shared switch; `bundleUrl`, when set on a bundle, overrides the `url` of every rule in it for matching, though each rule keeps its own `url` saved.
- `curl-import.js` parses a pasted curl command into a url, headers, and cookies for the import screen in `popup.js`. It has no DOM dependency, so it is tested directly with `node --test`.

State lives in `chrome.storage.local` under three keys. `rules` is the rule list. `lastError` is written by the service worker and shown as a banner in the popup. `appliedCookies` maps a rule id to the cookies that the rule set. When a cookie rule is deleted, disabled, or its target changes, the service worker removes those cookies. `rulesLosingCookies` in `background.js` computes that from the old and new rule lists in the storage change event.

Match patterns must never fall back to substring matching. The first version matched the URL field as a substring, and a pattern for `*.example.com` also fired on `https://attacker.com/?x=://a.example.com/`. The test "the pattern in the query string of another origin does not match" guards this.

## Constraints

- Keep the project small. No dependencies, no build tooling, no new files without a reason.
- A file that must ship needs an entry in the allowlist in `scripts/build.sh`.
- A new permission in `manifest.json` needs a justification in `store/listing.md`. Keep `store/listing.md` and `PRIVACY.md` in sync with what the code stores and sends.
- `minimum_chrome_version` is 101 because of `requestDomains`. Raise it when you use a newer API.
- Do not edit `icons/icon128.png` by hand. `store/render.sh` renders it from `store/icon-source-128.png` with the 16 px padding that the store requires.
- The release workflow fails when the tag does not equal `v` + the manifest version.
- Commit locally. Push, tag, or create a release only when the user asks.

## Writing

Documents, UI strings, and comments follow ASD-STE100 Simplified Technical English. One term per concept: match pattern, popup, switch, rule, make sure that. Comments explain only what the code does not show, start with a capital letter, and end with a period.
