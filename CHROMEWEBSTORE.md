# Chrome Web Store Listing — RYMseek

> Last Updated: 2026-09-16

## Store Listing

**Extension Name**
RYMseek - RateYourMusic to slskd / Navidrome

**Short Description**
Send albums from RateYourMusic directly to your slskd daemon and Navidrome library with intelligent matching and quality filters.

**Detailed Description**
RYMseek seamlessly connects RateYourMusic (RYM) release pages to your self-hosted slskd daemon and Navidrome music server.

RYMseek injects a native download button directly into the streaming services row on any RateYourMusic album or mixtape page. With a single click, it extracts clean release metadata, searches the Soulseek network via slskd, filters peer directories based on format and completeness, and queues the album for download.

Key Features:
- Native UI Injection: Blends into RateYourMusic's streaming button row.
- Resilient Metadata Extraction: Parses Artist, Album, Year, and Track Count while stripping remaster tags, bonus labels, and extraneous notes.
- Format Preferences: Select between FLAC Lossless, MP3 320k, or Any.
- Smart Heuristic Ranking: Automatically avoids partial shares, locked peers, and overloaded queues (>50) to select the optimal folder.
- Real-Time Feedback: View live search status, queued confirmation, or detailed error tooltips.
- Self-Hosted First: Preconfigured for local or remote instances (e.g. Tailscale / reverse proxies).

How to Use:
1. Open the RYMseek Options page and configure your slskd URL and optional API key.
2. Browse to any RateYourMusic album or mixtape release page.
3. Click the RYMseek button next to the Spotify and Bandcamp links.
4. RYMseek searches Soulseek and queues the release to your slskd instance.

Privacy & Security:
All requests are routed exclusively to your self-hosted slskd instance. No user data is gathered, tracked, or transmitted to any third-party servers.

Support:
Submit issues or feature requests on GitHub: https://github.com/Roger079/RYMseek

**Category**
Search Tools

**Single Purpose**
Enables users to send music releases from RateYourMusic directly to their self-hosted slskd instance for download.

**Primary Language**
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ⬜ Not created | `screenshots/rym-injection.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ⬜ Not created | `screenshots/options-page.png` |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ⬜ Not created | `screenshots/popup-status.png` |

### Screenshot Notes
- Screenshot 1: Demonstrates the RYMseek button injected into a RateYourMusic album page header alongside streaming icons.
- Screenshot 2: Displays the Options configuration dashboard with connection testing.
- Screenshot 3: Shows the toolbar popup verifying connection to slskd.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Used to persist user configuration such as slskd URL, API key, and audio format preferences locally in the browser. |
| `declarativeNetRequest` | permissions | Used to ensure network headers (such as `X-API-Key`) can be sent cleanly to user-configured self-hosted slskd endpoints without CORS interference. |
| `*://rateyourmusic.com/*` | host_permissions | Required to inject the download action button into RateYourMusic release pages and read album metadata. |
| `<all_urls>` | host_permissions | Required so the extension background service worker can communicate with arbitrary user-specified self-hosted slskd instances (e.g., local IPs, domain names, Tailscale hosts). |

## Privacy & Data Use

### Data Collection
**Does the extension collect user data?** No

The extension does not collect or transmit user data to external servers. All communication occurs strictly between the user's browser, RateYourMusic, and the user's configured self-hosted slskd server.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy
**Privacy Policy URL**: https://github.com/Roger079/RYMseek/blob/main/PRIVACY.md

## Distribution
**Visibility**: Public
**Pricing**: Free

## Developer Info
**Publisher Name**: Roger
**Support URL**: https://github.com/Roger079/RYMseek/issues

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-09-16 | Initial release with RYM injection, slskd API routing, heuristics, and options UI. | Draft |
