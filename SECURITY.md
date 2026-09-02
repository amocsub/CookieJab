# Security Policy

## Supported Versions

Only the latest version published on the Chrome Web Store and the `main` branch receive fixes.

## Reporting A Vulnerability

Do not open a public issue for a vulnerability.

Report it through GitHub private vulnerability reporting at https://github.com/amocsub/CookieJab/security/advisories/new.

Include the following in the report:

- The version of CookieJab.
- The steps to trigger the issue.
- The impact that you observed.

## Scope

CookieJab injects secrets that the user typed into requests that match the rules of the user. A report is a vulnerability when an attacker can make CookieJab send those secrets to a destination that the rules do not cover, or can change the rules without user action.
