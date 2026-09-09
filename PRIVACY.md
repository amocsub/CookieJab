# CookieJab Privacy Policy

CookieJab is a Chrome extension. It injects request headers and cookies into the sites that you choose.

## Data That CookieJab Stores

CookieJab stores the rules that you create. A rule contains a name, a match pattern, a header or cookie name, and a value. The value can be an authentication token or another secret that you type.

CookieJab also records the host and the name of each cookie that it set, so that it can remove the cookie later. It does not record the value. It also records, on your device only, how many times each rule has matched a request.

CookieJab stores your rules with `chrome.storage.sync`, so they follow you to another device signed into the same Chrome profile. This means Google's sync infrastructure carries your rule values, including any secret you typed into one, between your devices. When a rule set does not fit in synced storage, or sync is unavailable, CookieJab falls back to storing rules with `chrome.storage.local` on that device only, and shows a banner explaining that they did not sync. Every other record CookieJab keeps, including applied-cookie bookkeeping and match counters, stays in `chrome.storage.local` and is never synchronized. CookieJab does not send any of this data to the developer or to a third party.

## Data That CookieJab Sends

CookieJab sends the header values and cookie values that you configured to the sites that match your rules. It sends them only to those sites, and it sends your rules to Google's sync infrastructure as described above. It sends no data to another destination.

CookieJab has no analytics, no telemetry, no crash reporting, and no remote code. It reads the URL and resource type of outgoing requests, read only, to count rule matches; it does not read or forward header content through that permission.

## Smart Import And On-Device AI

When you use Smart Import, CookieJab sends the text that you pasted to a language model running locally through Chrome's built-in Prompt API. This runs entirely on your device; CookieJab does not send that text to the developer, to a third party, or to any network destination. The first time you use Smart Import, Chrome may download a one-time model component from Google, independently of CookieJab's own code, before the model can run. Smart Import never runs unless you click its button, and it only appears where Chrome's on-device model is available.

## Data That The Developer Receives

The developer receives no data from CookieJab.

## Changes

The git history of this file at https://github.com/amocsub/CookieJab/blob/main/PRIVACY.md records the changes to this policy.

## Contact

Open an issue at https://github.com/amocsub/CookieJab/issues.
