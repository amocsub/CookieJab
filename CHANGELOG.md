# Changelog

All notable changes to CookieJab are recorded in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-09-02

### Added

- Header rules that add or replace a request header on requests that match a URL pattern.
- Cookie rules that set a cookie on top level navigation to a page that matches a URL pattern.
- A toggle per rule.
- Validation of the URL pattern and the header or cookie name when a rule is saved.
- An error banner in the popup when a rule cannot be applied.

### Changed

- The URL field is a Chrome match pattern with scheme, host, and path. Before this change the field was matched as a substring, so a pattern could match a URL on another origin that contained the pattern in its query string.
- Cookies are set with path `/` so they apply to the whole site.

[Unreleased]: https://github.com/amocsub/CookieJab/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/amocsub/CookieJab/releases/tag/v1.0.0
