# Changelog

This file records the notable changes to CookieJab. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-09-02

### Added

- Header rules that add or replace a request header on requests that match a match pattern.
- Cookie rules that set a cookie on top level navigation to a page that matches a match pattern.
- A switch per rule.
- Validation of the match pattern and the header or cookie name at save time.
- An error banner in the popup for rules that CookieJab cannot apply.

### Changed

- The URL field is a Chrome match pattern with scheme, host, and path. Before this change, CookieJab matched the field as a substring. When the query string of a URL on another origin contained the pattern, the pattern also matched that URL.
- Cookies get path `/` so that they apply to the whole site.

[Unreleased]: https://github.com/amocsub/CookieJab/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/amocsub/CookieJab/releases/tag/v1.0.0
