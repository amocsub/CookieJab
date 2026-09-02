# Changelog

This file records the notable changes to CookieJab. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Bundles. Rules that share a bundle name group into one card with a switch for the whole group.
- A bundle-level match pattern that overrides the pattern of every rule in the bundle.
- Edit, copy, and delete buttons on a bundle, and a copy button on a rule.
- Import from a curl command, with a preview screen to choose which headers and cookies to bring in, edit a name or a value before import, filter a long list by name, and choose which bundle to add them to. Nothing is switched on by default, and Import stays disabled until something is.
- A bundle collapses to its name and switch by default, and expands on click, so a long list of bundles stays scannable.
- A consistent color system: a header rule is amber and a cookie rule is teal everywhere, including every field in the add and edit form while that type is selected. Anything not tied to one type, such as the value visibility switch or a bundle's own controls, uses a new violet accent instead of always defaulting to amber.
- A switch to hide header and cookie values in the popup, on by default.

## [1.0.0] - 2026-09-02

### Added

- Header rules that add or replace a request header on requests that match a match pattern.
- Cookie rules that set a cookie on top level navigation to a page that matches a match pattern.
- A switch per rule.
- Validation of the match pattern and the header or cookie name at save time.
- An error banner in the popup for rules that CookieJab cannot apply.
- A hint under the match pattern field that explains the scope of each rule type.
- Removal of the cookies that a cookie rule set when you disable, delete, or change the rule.

### Changed

- The URL field is a Chrome match pattern with scheme, host, and path. Before this change, CookieJab matched the field as a substring. When the query string of a URL on another origin contained the pattern, the pattern also matched that URL.
- Cookies get path `/` so that they apply to the whole site.

[Unreleased]: https://github.com/amocsub/CookieJab/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/amocsub/CookieJab/releases/tag/v1.0.0
