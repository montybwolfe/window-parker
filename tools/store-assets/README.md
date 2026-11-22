# Store artwork

The Chrome Web Store screenshots, promo tiles, Store icon and the support-page cover are generated here. It's development-only, has no npm dependencies, and never ships in the extension.

## Regenerate

The screenshots need Node 20+ and Google Chrome on a Mac; the other artwork needs Chrome on macOS or Windows (Chrome's usual Mac location by default; set `CHROME` to another Chrome binary if needed). The artwork shows the system font, San Francisco or Segoe UI, so the records note the platform and `verify.mjs` refuses artwork made anywhere else. Run from the repository root:

```sh
node tools/store-assets/capture.mjs   # about 4 minutes, on a Mac
node tools/store-assets/compose.mjs
node tools/store-assets/verify.mjs
```

**capture.mjs** takes the five screenshots. Each is a real Google Chrome window on your screen, exactly 1280×800 points, captured at 2× with macOS's `screencapture` and halved, with the window's rounded corners filled with white. It installs a temporary copy of this folder as an extension (so the extension ID in the address bar doesn't come from where your copy of the repository lives) in a throwaway, visible Chrome profile with Window Parker's toolbar button pinned, opens windows of real public web pages (Wikipedia, the Python docs, GitHub and OpenStreetMap, listed at the top of capture.mjs), waits for each page and its icon to load, and lets the windows park for real (with a 1-minute delay). So it needs an internet connection, and the pages look however those sites look on the day. The popup is the real one, opened from the toolbar button over a window showing a Wikipedia article; it's a window of its own, so that screenshot is taken from the screen over the browser window and checks first that nothing else covers it. The dark screenshot uses Chrome's own dark mode (`--force-dark-mode`), which the extension's Auto theme follows; your Mac's appearance isn't changed. Nothing from your own Chrome profile is used.

The app that runs Node (your terminal) needs Screen Recording permission in System Settings, or the captures can't see the window. The test Chrome comes to the front while it works, for about four minutes in all. Leave the Mac alone until it finishes: if another app takes focus, or a window or notification covers the popup, capture.mjs stops and asks you to run it again.

**compose.mjs** renders the promo tiles, the Store icon and the support-page cover from the designs in `compositions/` at 2× and halves them, writing opaque PNGs (the Store icon keeps its transparency). The marquee shows the right end of screenshot 2, pixel for pixel. It records the SHA-256 of every output and input in `store-listing/sources/assets.json`; capture.mjs does the same for the screenshots in `store-listing/sources/capture.json`, with the Chrome and macOS versions.

**icons.mjs** renders the extension's own icons (`icons/window-parker-<size>.png`) at the sizes you give it, each from the SVG drawn for that size, for example `node tools/store-assets/icons.mjs 16 32`; 256, 512 and 1024 write the larger copies in `docs/assets/`. See [Icons](../../docs/ICONS.md).

**verify.mjs** checks sizes and transparency, that each image matches its record, and that nothing it was made from has changed since. It also checks that the extension's pages and toolbar icon haven't changed since the screenshots were captured, so stale screenshots can't slip into a release. `npm test` runs the same checks except that last one.

## Assets

| File | Size | Notes |
| --- | --- | --- |
| `store-listing/screenshot-1-parked-1280x800.png` … `-5-dark` | 1280×800 | Five screenshots, in Store order |
| `store-listing/small-promo-440x280.png` | 440×280 | Small promo tile |
| `store-listing/marquee-promo-1400x560.png` | 1400×560 | Marquee promo tile |
| `store-listing/store-icon-128.png` | 128×128 | The moon at 96×96 with 16px of transparent padding, as the Store asks |
| `docs/assets/buy-me-a-coffee-cover-1600x400.png` | 1600×400 | Support-page banner |

The screenshots show Chrome as it is, with real sites' own titles and icons. The profile is signed in to nothing. Check each image by eye before committing: a site can add a banner (Wikipedia's fundraising banner, for one), and then the page needs swapping for another in capture.mjs.

Settings shows its version, small, in the page's top-left corner, so screenshot 3 shows the version it was captured with. `verify.mjs` doesn't count a version bump as a change, so a release that changes nothing else needn't capture the screenshots again.
