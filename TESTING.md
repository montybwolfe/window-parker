# Testing

## Automated tests

Needs Node 20+ (Python 3 for packaging). There are no dependencies to install.

```sh
npm test
```

The tests cover parking and restoring, both sleeping modes, settings and sync, exclusions, keeping windows and tabs in place, Clear parked tabs and Clear protected tabs, the right-click menu, the What's new link after an update, closing the last tab, moving a parking page to another window, and recovery after worker or browser restarts. Race tests cover focus changes, moved or closed tabs, new downloads, slow API calls, Chrome refusals and interrupted discard batches. UI tests cover the Settings layout and controls, saving each change as it's made, the theme switch, sync choices and questions, pasting and cleaning up excluded sites, the popup (Protect for its own window's tab, the questions before clearing, keyboard focus), the parked page, and the Changelog, Buy me a coffee and Report a bug links. The Store artwork is checked for sizes, transparency and matching sources, and no image may carry Content Credentials metadata.

Things that must always hold:

- Let Chrome decide mode never calls Chrome's discard API.
- Discard immediately mode checks every candidate tab just before asking, and stopped work is never replayed after a restart.
- Leaving a window you used gives it a full parking delay, even if that focus change is what wakes a stopped worker. Brief visits don't count as use.
- Closing or moving the last real tab removes only verified parking pages, so the window can close, including when it's the last Chrome window. Clear parked tabs keeps windows open.
- A parking page moved to another window is removed there and never adopted; the window it came from stays unparked for a full delay. Cleanup that Chrome refuses during a held drag finishes after the drop.
- Clear parked tabs never unloads tabs and restores at most one tab per window.
- Clear protected tabs only removes protection: no tab is closed, moved, reloaded, selected or unloaded, and no parking check starts.
- The right-click menu has one item for each action, checks the tab again when a click is handled, and never parks, restores, unloads or clears anything.
- Protection follows a tab even when Chrome unloads it and gives it a new ID.
- Closing a parked window deletes its recovery record, even while the worker is stopped.
- Settings saves each change on its own, and never a half-typed or invalid value, so what it shows is what's in use.
- Sync is off by default and chosen on each computer. Turning it on uses a different shared value only for a setting not changed on that computer; the others are asked about together before anything changes. A shared value this version can't use is never replaced without asking. Restore defaults never changes shared values. Pausing, protected tabs and window state never sync.

## Preview and packaging

```sh
npm run preview              # UI preview with simulated tabs at http://127.0.0.1:8765
python3 scripts/package.py   # runtime-only ZIP and checksum in dist/
```

Add `?system=light` or `?system=dark` to preview pages to try Auto appearance. The preview is for layout work; real tab behavior needs the installed extension. To check a package, unzip it into a separate folder and load that folder in Chrome.

For scripted checks of the installed extension, `tools/store-assets/cdp.mjs` starts headless Chrome with a throwaway profile over the DevTools pipe, and `Extensions.loadUnpacked` installs the extension there. Set `CHROME` to the browser binary. Headless Chrome reports every window that isn't minimized as focused, so model focus by minimizing and restoring windows. The real popup, opened with `chrome.action.openPopup()`, is the exception: while it's open, its window reports that it isn't focused, as in desktop Chrome. Focus timing, Spaces, tab drags, sleep and sync still need the manual checks below.

After changing the popup, Settings or the parking page, run `CHROME=<browser binary> node tools/ui-audit.mjs`. It checks contrast, reflow, focus rings, target sizes and the popup's height in headless Chrome, which `npm test` can't.

The Store artwork has its own tools; see [tools/store-assets](tools/store-assets/README.md). Run `node tools/store-assets/verify.mjs` before a release to confirm the screenshots still match the current UI.

## Manual checks in Chrome

Use a separate Chrome profile with nothing important in it, and note the extension, Chrome and OS versions. Start with a 1-minute parking delay and 2-second restore delay, then try the defaults. Close the service worker's DevTools before testing sleep or restarts, because it keeps the worker running.

1. **Install:** Load the unzipped package from `chrome://extensions` and check for errors. Change a few settings, close Settings, reopen it and check they stuck: there's no Save button. A number saves when you press Enter or leave its box, and the site list when you leave it. A number that can't be used goes back to the value in use, with a note. Restore defaults asks first, then should bring back Let Chrome decide, Auto, 15 minutes, 2 seconds and the four built-in sites in alphabetical order, and turn sync off.
2. **Let Chrome decide:** Leave a window unfocused until it parks. Its previous tab stays in the window; Chrome decides when to unload it.
3. **Discard immediately:** Park a window with several loaded tabs, including pinned, audio, excluded, protected and already-sleeping ones. Only eligible tabs should be unloaded. Coming back or changing settings mid-way should stop the rest.
4. **Coming back:** A visit shorter than the restore delay leaves the window parked. Staying longer brings back only your previous tab and closes the parking page. Also try Restore tab (with parking on and paused), clicking a tab yourself, and closing the previous tab first.
5. **Closing the last tab:** Close, or drag to another window, the last real tab of a parked window: the parking page should go and the window close, including when it's your only Chrome window. With another real tab left, nothing should close.
6. **Moving a parking page:** Drag a parking page out into its own window, and into another window, holding it for a few seconds before letting go: it should disappear right after you let go, the new window should close, and the original window should keep its tabs without parking again straight away. Drag one out and back into its own window: it stays.
7. **Clear:** Clear several parked windows, with parking on and paused. Clear parked tabs asks first and names how many windows; Cancel and Escape change nothing. Nothing should unload, each window gets at most one tab back, and parking-only windows stay open with a blank tab.
8. **Windows and Spaces:** Check tab order, pins, groups and window positions with one window and with ten. Swipe quickly through several macOS desktops and stop on one: only that window should restore. Parking while another app is in front must not bring Chrome forward.
9. **Protections and downloads:** An excluded selected tab keeps only its own window awake; an excluded background tab doesn't. Pasting `https://www.example.com/` into its own line of Sites to exclude adds `www.example.com`; `https://example.com/work/*` stays as pasted. Clean up doesn't change the built-in list; add `Zoom.us` and it removes that duplicate, but keeps `www.zoom.us` and `https://zoom.us/j/*`; Undo brings the old list back. Any download in progress pauses parking everywhere until it finishes. Calls, screen sharing and editing need exclusions, because Chrome doesn't report them.
10. **Protect and Clear protected tabs:** In the popup, Protect this tab acts on the selected tab of the popup's own window, and is still offered after Pause, Resume or Clear parked tabs. On a parking page, a new tab and `chrome://extensions` it's unavailable, with "Only web pages can be protected." Protect a few tabs from the popup, the right-click menu and Settings, then use Clear protected tabs: it asks first and names the count, and afterwards no tab has closed, reloaded or unloaded, and Settings' open tab list shows the change without Refresh. Confirm with "Don't show this warning again" ticked: the next clear runs straight away and still reports. Restore confirmation warnings in Settings brings the question back, and is unavailable while both warnings are on.
11. **Right-click menu:** On a web page, the menu offers Protect this tab or Unprotect this tab, Exclude this site or Stop excluding this site, and Pause or Resume automatic parking, each matching the tab and the current state; the toolbar icon's own menu offers Pause or Resume. Exclude this site on `https://www.example.com/page` adds `www.example.com` to Sites to exclude, and Stop excluding this site removes it. On a page that a broader entry covers, such as `docs.example.com` with `example.com` listed, the menu shows "A rule in Settings covers this site", unavailable. The parking page has no tab or site items. With 200 sites listed, Exclude this site changes nothing and the popup says why the next time it opens, once.
12. **Sync:** On two computers signed in to the same Chrome profile with sync on: turn on Sync all settings on the first, then change a few values there. On the second, freshly installed or after Restore defaults, turn on Sync all settings: it should pick up those values without asking. Change a setting on the second, turn its sync off and on again: now it asks which to keep. Check a changed value arrives and applies, a group's box shows a dash when only some of its settings sync, turning sync off keeps the value, and pausing never syncs.
13. **Restarts:** Try the worker stopping by itself, an extension reload, a browser restart, disabling and re-enabling, and computer sleep. Interrupted restore delays start again; interrupted batches don't resume. Reloading the extension closes its parking pages, and each window shows its last tab. Leave a window you've used for longer than the parking delay while the worker is stopped: it must still wait a full delay after you leave.
14. **Look and feel:** Check Light, Dark and Auto (the Theme choice in Settings' header applies immediately) across Settings, the popup and the parked page, including the popup's footer icons. On the parked page, check the site icon, title and website with a few real sites, a site without an icon, a very long title and a dark icon in Dark. Settings shows the version, small, in its top-left corner. Check the moon toolbar icon on a standard and a Retina screen, with a light and a dark toolbar. Open Protect individual tabs with many tabs: the list scrolls inside its box, with a round arrow button in its corner while there's more below, which goes away at the end of the list. A count that changes while the popup is open drops into place, and nothing moves with your system's reduced motion setting on.
15. **Links and network:** Report a bug, Buy me a coffee and Changelog open one tab each, only when clicked, by mouse or keyboard, and the popup's gear opens Settings. Hovering each popup icon shows its name. After the Chrome Web Store updates the extension from an earlier version, the popup's link reads "What's new in 2.0" until you click it there or in Settings; a new installation or a hand-installed copy shows Changelog. Extension pages load only their own files.

For memory comparisons, see [Checking memory savings](docs/BEHAVIOR.md#checking-memory-savings).

## Platforms

Tested on macOS. Windows, Linux and ChromeOS haven't been tested properly yet.
