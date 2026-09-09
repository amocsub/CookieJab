# Changelog

This file records the notable changes to CookieJab. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-09-09

### Added

- Rules sync across devices through `chrome.storage.sync`, with an automatic fallback to `chrome.storage.local` when a rule set does not fit or sync is unavailable.
- IPv6 host literals, for example `*://[::1]/*`.
- A per-rule match counter, shown next to the key and value once a rule has matched a request.
- Import and export of the whole rule list as JSON, from a new menu next to Add rule that also holds curl import.
- Response header injection, alongside the existing request header injection.
- Append mode for header rules, alongside the existing set/replace behavior.
- "Only if absent" mode for cookie rules, so a rule does not overwrite a cookie the site already set.
- Resource type targeting for header rules, so a rule can apply only to specific request types instead of every type.
- Cookie attribute control: `SameSite`, `Secure`, and an expiry, in place of the previous fixed session cookie.
- Value templating with `{{random}}`, `{{timestamp}}`, and `{{uuid}}` placeholders. A header rule's placeholders re-roll on a fixed interval; a cookie rule's re-roll on every navigation.
- A bundle variable: one named variable per bundle with a list of named choices, substituted for `{{name}}` in that bundle's rules. Click the bundle's pill to switch choices.
- A kill switch that pauses every rule, and clears already-applied cookies, without touching the stored rules.
- A red badge on the toolbar icon while the kill switch is on, and a matching greyed-out look for every rule in the popup while paused.
- Smart Import, next to curl import: extracts headers and cookies from pasted text that is not a curl command using Chrome's on-device Prompt API. Runs locally, only where that API is available, and only on the same review screen every import already uses.
- The import preview screen suggests an existing bundle whose own match pattern already covers the imported URL, instead of always defaulting to a new bundle.

### Fixed

- Toggling the value-visibility switch or the kill switch collapsed every expanded bundle back to closed. An expanded bundle now stays expanded across any change to the rule list.

## [1.0.0] - 2026-09-02

### Added

- Header rules that add or replace a request header on requests that match a match pattern.
- Cookie rules that set a cookie on top level navigation to a page that matches a match pattern.
- A switch per rule.
- Validation of the match pattern and the header or cookie name at save time.
- An error banner in the popup for rules that CookieJab cannot apply.
- A hint under the match pattern field that explains the scope of each rule type.
- Removal of the cookies that a cookie rule set when you disable, delete, or change the rule.
- A switch to hide header and cookie values in the popup, on by default.
- Bundles. Rules that share a bundle name group into one card with a switch for the whole group. A bundle collapses to its name and switch by default, and expands on click.
- A bundle-level match pattern that overrides the pattern of every rule in the bundle.
- Edit, copy, and delete buttons on a bundle, and a copy button on a rule.
- Import from a curl command, with a preview screen to choose which headers and cookies to bring in, edit a name or a value before import, filter a long list by name, and choose which bundle to add them to. Nothing is switched on by default, and Import stays disabled until something is.
- A consistent color system: a header rule is amber and a cookie rule is teal everywhere, including every field in the add and edit form while that type is selected. Anything not tied to one type, such as the value visibility switch or a bundle's own controls, uses a violet accent instead of always defaulting to amber.

### Changed

- The URL field is a Chrome match pattern with scheme, host, and path. Before this change, CookieJab matched the field as a substring. When the query string of a URL on another origin contained the pattern, the pattern also matched that URL.
- Cookies get path `/` so that they apply to the whole site.

[Unreleased]: https://github.com/amocsub/CookieJab/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/amocsub/CookieJab/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/amocsub/CookieJab/releases/tag/v1.0.0
