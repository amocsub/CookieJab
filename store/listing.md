# Chrome Web Store Listing

This file holds the text for the Chrome Web Store developer dashboard. Keep it in sync with the manifest and the privacy policy.

## Store Listing Tab

### Title

CookieJab

### Summary

The `description` field of `manifest.json`.

### Detailed Description

CookieJab injects request headers and cookies into the sites that you choose.

Create a rule with a match pattern, a name, and a value. Header rules add or replace the header on each request that matches the pattern. When you open a page that matches, cookie rules set the cookie. Switch a rule on and off without deleting it.

For developers and security testers who send an authentication token, a feature flag header, or a session cookie to a test environment.

Features:
- Match patterns with scheme, host, and path, for example *://*.example.com/*.
- Header rules use declarativeNetRequest and run on all request types.
- Cookie rules set a cookie for the whole site on navigation.
- Rules sync across your devices through your Chrome sign-in, with an on-device fallback when a rule set does not fit. CookieJab sends rule values only to the sites that match your rules, and to Google's sync infrastructure for the sync itself.
- Smart Import, on a Chrome build with the on-device Prompt API: extracts headers and cookies from pasted text that is not a curl command, using a language model that runs locally on your device. No new permission, and nothing is sent off-device.
- Open source under the MIT license: https://github.com/amocsub/CookieJab.

### Category

Developer Tools

### Language

English

### Images

- Store icon: `icons/icon128.png`
- Screenshots, up to five, 1280x800: `store/assets/1-bundles-1280x800.png`, `2-add-rule-1280x800.png`, `3-curl-import-1280x800.png`, `4-bundle-override-1280x800.png`
- Small promo tile: `store/assets/promo-tile-440x280.png`

### Additional Fields

- Homepage URL: https://github.com/amocsub/CookieJab
- Support URL: https://github.com/amocsub/CookieJab/issues

## Privacy Practices Tab

### Single Purpose Description

CookieJab injects user defined request headers and cookies into requests that match user defined match patterns, for development and testing.

### Permission Justifications

- `declarativeNetRequestWithHostAccess`: Adds, replaces, or appends request and response headers on requests that match the match patterns of the user. This is the core function of the extension.
- `cookies`: Sets cookies on sites that match the match patterns of the user. This is the core function of the extension.
- `storage`: Stores the rules of the user, synced through `chrome.storage.sync` where possible, and device-local operational data such as match counters.
- `webNavigation`: Finds top level navigations. When the user opens a site that matches, cookie rules apply.
- `webRequest`: Reads the URL and resource type of outgoing requests, read only, to count how many times each header rule matches. The extension does not read or forward header content through this permission.
- `alarms`: Wakes the extension on a fixed interval so a header rule value that uses a `{{random}}`, `{{timestamp}}`, or `{{uuid}}` placeholder gets a fresh value periodically, since a `declarativeNetRequest` rule value is otherwise fixed until the rule is rebuilt.
- Host permissions `<all_urls>`: The user chooses the target sites at run time with match patterns. Header modification and cookie writes require host permission for those sites. The extension cannot know the sites in advance.

### Remote Code

No, I am not using remote code.

### Data Usage

Data type: Authentication information. Users type authentication tokens into rules. The extension stores the tokens in `chrome.storage.local` on the device. It sends them only to the sites that match the rules of the user. It sends nothing to the developer.

Certifications, select all three:
- The extension does not sell user data.
- The extension does not use user data for purposes unrelated to its single purpose.
- The extension does not use user data to determine creditworthiness or for lending purposes.

### Privacy Policy URL

https://github.com/amocsub/CookieJab/blob/main/PRIVACY.md

## Distribution Tab

- Payment: Free
- Visibility: Public
- Regions: All regions

## Account Settings

- 2-step verification: Enabled on the Google account
- Publisher display name: Set
- Contact email: Verified
- Trader status: Non-trader. The extension is free and an individual publishes it
