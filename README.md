# CookieJab

CookieJab is a Chrome extension. It injects request headers and cookies into the sites that you choose. Each rule has a match pattern and a switch.

Developers and security testers use it to send an authentication token, a feature flag header, or a session cookie to a test environment.

## Install From The Chrome Web Store

The listing is not published yet. This section will link to it after the first review.

## Install From Source

1. Clone this repository.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked and select the repository folder.
5. Click the CookieJab icon in the toolbar to open the popup.

## Usage

1. Click Add rule.
2. Enter a bundle name, to group this rule with related rules. Leave it empty for a standalone rule.
3. Select the type: Header or Cookie.
4. Enter the match pattern. See Match Pattern Syntax.
5. Enter the header or cookie name and the value.
6. Click Save.

The switch on a rule enables or disables the rule. Header rules apply to new requests at once. Cookie rules apply on the next navigation to a page that matches. The match pattern of a cookie rule decides when CookieJab sets the cookie. The browser then sends the cookie to all paths on that host.

Click copy on a rule to open the form prefilled with its values and a blank id, so a new rule for the same host takes only a few changed fields.

## Bundles

Rules that share a bundle name group into one card with a switch that enables or disables every rule in it at once. Each rule keeps its own switch too, so one rule inside an enabled bundle can still be turned off. A bundle starts collapsed. Click its name, or the arrow next to it, to expand or collapse it.

Click edit on a bundle to rename it or to set a match pattern for the whole bundle. When a bundle has its own match pattern, it replaces the pattern of every rule inside for matching purposes. Each rule keeps its own pattern saved, and that pattern applies again if the bundle pattern is removed. Copy on a bundle duplicates every rule in it under a new name. Delete on a bundle removes every rule in it.

## Import From A curl Command

Click the arrow next to Add rule, paste a curl command, and click Continue. CookieJab reads the command for its web address, its headers, and its cookies, including a Cookie header, and shows every one of them with a switch, a name, and a value that you can edit before you import. Every entry starts unswitched, so nothing imports unless you choose it. A switched entry moves to the top of the list, and an unswitched one dims, so what you are about to import stays easy to see in a long list. The filter field narrows the list to names that contain the text you type, without dropping anything you already switched. Import stays disabled until at least one entry is switched on. Switch on the entries that you want, edit a name or a value if you need to, adjust the match pattern if needed, choose an existing bundle or type a name for a new one, then click Import.

## Match Pattern Syntax

A match pattern has the form `<scheme>://<host>[:port]/<path>`.

| Part | Permitted values |
| --- | --- |
| Scheme | `*` for http or https, `http`, or `https` |
| Host | A host name, `*.host` for the host and all its subdomains, or `*` for all hosts |
| Port | Optional. Without a port, the pattern matches all ports |
| Path | Starts with `/`. `*` matches any run of characters. The path is compared with the URL path and query string |

If you omit the scheme, CookieJab uses `*`. If you omit the path, CookieJab uses `/*`.

| Pattern | Matches | Does not match |
| --- | --- | --- |
| `*://*.example.com/*` | `https://example.com/`, `https://api.example.com/v1` | `https://example.com.evil.net/`, `https://evil.net/?u=://a.example.com/` |
| `https://api.example.com/v1/*` | `https://api.example.com/v1/users` | `http://api.example.com/v1/users` |
| `*://localhost:3000/*` | `http://localhost:3000/` | `http://localhost:8080/` |
| `*://example.com/report.json` | `https://example.com/report.json` | `https://example.com/report.json?x=1` |

Invalid patterns: `ftp://example.com/*`, `*://foo.*.bar/*`, `*://*foo.com/*`.

## How It Works

Header rules become `declarativeNetRequest` dynamic rules with a `modifyHeaders` action. The action sets the header on the request. The rules apply to all resource types. The extension rebuilds the dynamic rules after each change to the rule list.

Cookie rules listen to `webNavigation.onBeforeNavigate` for top level frames. If the URL matches, the extension calls `chrome.cookies.set` on the origin of the page with path `/`.

Both rule types use the same parser in `match-pattern.js`.

## Limitations

- Header rules set the header. They do not append to an existing header.
- Cookie rules run on navigation. The cookie can be absent from the first request of that navigation, because the cookie write and the request start at the same time. A reload sends it.
- Cookie rules set a session cookie without the `Secure`, `HttpOnly`, or `SameSite` attributes.
- A cookie applies to the whole host, not only to the path of the match pattern. When you disable, delete, or change a cookie rule, CookieJab removes the cookies that the rule set.
- IPv6 hosts are not supported.
- The extension asks for access to all sites, because you choose the target sites at run time.

## Privacy

Rules stay in `chrome.storage.local` on your device. The extension sends the configured values only to the sites that match your rules. It has no analytics and no remote code. See [PRIVACY.md](PRIVACY.md).

## Security

Report vulnerabilities through GitHub private vulnerability reporting. See [SECURITY.md](SECURITY.md).

## Development

Node.js 20 or later is required. There are no dependencies.

```sh
npm run check   # Syntax check of the scripts and the manifest
npm test        # Match pattern tests
npm run build   # Build dist/cookiejab-<version>.zip
```

`scripts/e2e.mjs` loads the extension in a headless browser. It makes sure that header and cookie injection work against a local echo server. Google Chrome ignores `--load-extension` since version 137. Use Chrome for Testing:

```sh
npx @puppeteer/browsers install chrome@stable
CHROME="<path from the install command>" node scripts/e2e.mjs
```

`store/` holds the Chrome Web Store listing text and the sources of the store images. `store/render.sh` renders the promo tile and the 128 px icon with headless Chrome. `scripts/capture-screenshots.mjs` builds the screenshots from the real popup with a caption, using the same Chrome for Testing setup as the browser test.

## Release

When you push a version tag, the release workflow builds the zip and attaches it to a GitHub release.

1. Update `version` in `manifest.json`.
2. Add an entry to `CHANGELOG.md`.
3. Commit the changes.
4. Tag the commit with `git tag vX.Y.Z`.
5. Push the tag with `git push origin vX.Y.Z`.
6. Download the zip from the GitHub release.
7. Upload the zip in the Chrome Web Store developer dashboard.

## License

[MIT](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution rules.
