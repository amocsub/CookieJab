# Chrome Web Store Listing

Text for the developer dashboard. Keep this file in sync with the manifest and the privacy policy.

## Store Listing Tab

### Title

CookieJab

### Summary

Taken from the `description` field of `manifest.json`.

### Detailed Description

CookieJab injects request headers and cookies into the sites that you choose.

Create a rule with a URL match pattern, a name, and a value. Header rules add or replace the header on every request that matches the pattern. Cookie rules set the cookie when you open a matching page. Switch a rule on and off without deleting it.

Made for developers and security testers who need to send an authentication token, a feature flag header, or a session cookie to a staging or test environment.

Features:
- URL match patterns with scheme, host, and path, for example *://*.example.com/*
- Header rules use declarativeNetRequest and run on all request types
- Cookie rules set a cookie for the whole site on navigation
- All rules stay on your device. Nothing is sent anywhere else.
- Open source under the MIT license: https://github.com/amocsub/CookieJab

### Category

Developer Tools

### Language

English

### Images

- Store icon: `icons/icon128.png`
- Screenshot: `store/assets/screenshot-1-1280x800.png`
- Small promo tile: `store/assets/promo-tile-440x280.png`

### Additional Fields

- Homepage URL: https://github.com/amocsub/CookieJab
- Support URL: https://github.com/amocsub/CookieJab/issues

## Privacy Practices Tab

### Single Purpose Description

CookieJab injects user defined request headers and cookies into requests that match user defined URL patterns, for development and testing.

### Permission Justifications

- `declarativeNetRequestWithHostAccess`: Adds or replaces request headers on requests that match the URL patterns that the user configured. This is the core function of the extension.
- `cookies`: Sets cookies on sites that match the URL patterns that the user configured. This is the core function of the extension.
- `storage`: Stores the rules of the user on the device.
- `webNavigation`: Detects top level navigations so that cookie rules apply when the user opens a matching site.
- Host permissions `<all_urls>`: The user chooses the target sites at runtime by writing URL patterns. Header modification and cookie writes require host permission for those sites, so the extension cannot know them in advance.

### Remote Code

No, I am not using remote code.

### Data Usage

Data types: Authentication information. Users type authentication tokens into rules. The extension stores them in `chrome.storage.local` on the device and sends them only to the sites that match the rules of the user. Nothing is sent to the developer.

Certifications: Tick all three. The extension does not sell user data, does not use it for purposes unrelated to its single purpose, and does not use it to determine creditworthiness or for lending purposes.

### Privacy Policy URL

https://github.com/amocsub/CookieJab/blob/main/PRIVACY.md

## Distribution Tab

- Payment: Free
- Visibility: Public
- Regions: All regions

## Account Settings

- 2-step verification enabled on the Google account.
- Publisher display name set.
- Contact email verified.
- Trader status: Non-trader. The extension is free and published by an individual.
