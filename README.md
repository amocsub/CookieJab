# CookieJab

CookieJab is a Chrome extension that injects request headers and cookies into the sites that you choose. Each rule has a URL match pattern and a toggle.

It is made for developers and security testers. Typical uses: send an authentication token to a staging environment, set a feature flag header, or set a session cookie on a test site.

## Install From The Chrome Web Store

The listing is not published yet. This section will link to it after the first review.

## Install From Source

1. Clone this repository.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked and select the repository folder.
5. Click the CookieJab icon in the toolbar to open the panel.

## Usage

1. Click Add rule.
2. Enter a name for the rule.
3. Select the type: Header or Cookie.
4. Enter the URL match pattern. See Match Pattern Syntax.
5. Enter the header or cookie name and the value.
6. Click Save.

Use the switch on a rule to enable or disable it without deleting it. Header rules apply to new requests at once. Cookie rules apply on the next navigation to a matching page.

## Match Pattern Syntax

The URL field is a Chrome match pattern: `<scheme>://<host>[:port]/<path>`.

| Part | Allowed values |
| --- | --- |
| Scheme | `*` for http or https, `http`, or `https` |
| Host | A host name, `*.host` for the host and all its subdomains, or `*` for any host |
| Port | Optional. Without a port the pattern matches every port |
| Path | Starts with `/`. `*` matches any run of characters. The path is matched against the URL path and query string |

If you omit the scheme, CookieJab uses `*`. If you omit the path, CookieJab uses `/*`.

| Pattern | Matches | Does not match |
| --- | --- | --- |
| `*://*.example.com/*` | `https://example.com/`, `https://api.example.com/v1` | `https://example.com.evil.net/`, `https://evil.net/?u=://a.example.com/` |
| `https://api.example.com/v1/*` | `https://api.example.com/v1/users` | `http://api.example.com/v1/users` |
| `*://localhost:3000/*` | `http://localhost:3000/` | `http://localhost:8080/` |
| `*://example.com/report.json` | `https://example.com/report.json` | `https://example.com/report.json?x=1` |

Invalid patterns: `ftp://example.com/*`, `*://foo.*.bar/*`, `*://*foo.com/*`.

## How It Works

Header rules become `declarativeNetRequest` dynamic rules with a `modifyHeaders` action. The action sets the header on the outgoing request. The rules apply to all resource types. The extension rebuilds the dynamic rules after every change to the rule list.

Cookie rules listen to `webNavigation.onBeforeNavigate` for top level frames. When the URL matches, the extension calls `chrome.cookies.set` on the origin of the page with path `/`.

Both rule types use the same match pattern parser in `match-pattern.js`.

## Limitations

- Header rules set the header. They do not append to an existing header.
- Cookie rules run on navigation. The cookie can be absent from the first request of that navigation, because the cookie write and the request start at the same time. A reload sends it.
- Cookie rules do not set the `Secure`, `HttpOnly`, or `SameSite` attributes and do not set an expiration. The cookie is a session cookie.
- IPv6 hosts are not supported in patterns.
- The extension requires host permission for all sites, because you choose the target sites at runtime.

## Privacy

Rules stay in `chrome.storage.local` on your device. The extension sends the configured values only to the sites that match your rules. It has no analytics and no remote code. See [PRIVACY.md](PRIVACY.md).

## Security

Report vulnerabilities through GitHub private vulnerability reporting. See [SECURITY.md](SECURITY.md).

## Development

Node.js 20 or later is required. There are no dependencies.

```sh
npm run check   # Syntax check the scripts and the manifest
npm test        # Run the match pattern tests
npm run build   # Build dist/cookiejab-<version>.zip
```

`store/` holds the Chrome Web Store listing text and the sources of the store images. Run `store/render.sh` to render the images and the 128 px icon with headless Chrome.

## Release

1. Update `version` in `manifest.json` and add an entry to `CHANGELOG.md`.
2. Commit, then tag with `git tag vX.Y.Z` and push with `git push --tags`.
3. The release workflow builds the zip and attaches it to a GitHub release.
4. Upload the zip from the release in the Chrome Web Store developer dashboard.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
