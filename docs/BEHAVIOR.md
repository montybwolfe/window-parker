# How Window Parker works

This page covers what the extension does and deliberately doesn't do, and where Chrome's APIs limit it. The [README](../README.md) has a quick overview.

## Parking

A window parks when it hasn't been used for the parking delay (15 minutes by default). "Used" means you stayed focused on it for the restore delay, selected a tab in it, or navigated its selected tab. Mouse movement, typing and page contents are never watched. A focused window never parks.

To park a window, the extension adds a small parking page at the end of that window (unpinned and ungrouped) and selects it. Your previous tab becomes an ordinary background tab, and the parking page shows its title, icon and website (see [The parking page](#the-parking-page)). The icon is Chrome's own saved copy of the site's icon, so nothing is downloaded; the parking tab itself keeps the Window Parker icon. Nothing else changes: windows aren't moved, focused, resized or recreated, and real tabs are never moved or closed.

A window is skipped if its selected tab is pinned, playing audio, excluded, loading, already asleep, marked not discardable by Chrome, in a split view, or isn't a normal web page. Skipped windows are checked again after at least a minute. Incognito isn't supported, and popup, app and developer-tools windows are ignored.

One alarm points at the next window that's due. Chrome can run it late. There's no polling or keep-alive loop.

## Coming back

When you focus a parked window and stay for the restore delay (2 seconds by default), your previous tab is selected again and the parking page closes. Chrome reloads the tab if it had unloaded it; other sleeping tabs stay asleep. Passing through a window more quickly, for example while swiping between macOS desktops, doesn't count, and it doesn't restart that window's parking delay either.

The restore delay uses a short timer plus a backup alarm. If the extension's background worker is stopped part-way, the next worker starts a full new delay, and a timer that fires more than 1.5 seconds late (after the computer slept, say) also starts again. So restoring can take a little longer than the setting, but never less.

If your previous tab was closed, the nearest real tab in the same window is used. You can also press **Restore tab**, or just click any tab.

## The parking page

The parking page leads with your previous tab: its icon, its title (up to two lines) and, for a web page, its website. In the tab strip it's titled "Parked:" followed by that title. Below that, "This window is parked." comes with a line saying that your tabs are all still in the window, how many of them are asleep, and either how long to stay for your tab to come back ("Stay 2 seconds and your tab comes back.") or that automatic return is paused. **Restore tab** brings your tab back straight away, even while parking is paused. The details stay up to date while the page is open.

## Tab sleeping

**Let Chrome decide** is the default. After parking, the extension leaves unloading to Chrome's Memory Saver and never calls Chrome's discard API. It doesn't read or change your Memory Saver settings.

**Discard immediately** also asks Chrome to unload every loaded, eligible real tab in the newly parked window. Each tab is checked just before its request, and protected or already-sleeping tabs are skipped. The rest of the batch stops if you return to the window, select a tab, change settings, protect a tab, clear parked or protected tabs, use the right-click menu, start a download, or if the computer sleeps (more than five seconds between checks). A stopped batch isn't resumed after a restart. Chrome can refuse individual requests, and that only affects that tab. Unloading keeps the tab and its history but can lose unsaved work in the page.

Changing the mode takes effect on the next parking cycle. It doesn't unload or wake tabs in windows that are already parked.

## What keeps tabs and windows awake

### Site exclusions

A website such as `meet.google.com` covers that site and addresses that end in it, such as `team.meet.google.com`, but not lookalikes such as `meet.google.com.evil.example`. Websites match the standard web ports; add the port for an address such as `localhost:3000`. Website names with accented or non-Latin letters aren't supported yet. For part of a site, use a full address with `*` meaning "any text", for example `https://example.com/work/*` (full addresses are case-sensitive).

Pasting a site's home address on a line of its own, such as `https://www.example.com/` or `http://localhost:3000/`, adds just the website (`www.example.com`, `localhost:3000`); an address with a path, query, `#` or `*` is kept exactly as pasted. **Clean up** orders the list by website, ignoring `http://` and `https://`, then by the rest of the address, and removes duplicates: an entry listed twice, a website written with different capitals or a leading `*.`, and a home address such as `https://example.com/` when `example.com` is also listed. Everything else stays exactly as written, including other subdomains such as `www.`, ports, paths and `*`, so the same pages are excluded. It also removes blank lines and spaces around entries. It never removes an entry Settings can't use, or merges one into another, so a mistake stays in the list for you to fix, and the list isn't saved until you do. The cleaned list is saved like any other change, and Undo in the box brings back the old one. The built-in list is already clean.

You can also exclude the site you're on, or stop excluding it, from the [right-click menu](#the-right-click-menu).

If an excluded site is the selected tab, that window doesn't park. An excluded background tab doesn't stop its window parking, but Discard immediately skips it. Chrome's own Memory Saver can still unload it.

### Protected tabs

You can protect the tab you're on from the popup or the right-click menu, or any open tab from Settings under Protect individual tabs. All three offer web pages only, because only they park or unload. A protected tab keeps its window awake while it's the selected tab, and Discard immediately skips it otherwise. Protection follows the tab while you browse, even when Chrome unloads it, and lasts until Chrome restarts, the extension is updated, or you use [Clear protected tabs](#clear-parked-tabs-and-clear-protected-tabs). Settings' list of open tabs keeps up with protection changed in the popup or the menu.

### Downloads

Chrome doesn't reliably say which tab a download came from, so any download in progress, including a paused one, pauses parking and discarding in every window. If the check fails, parking pauses too.

### What Chrome can't report

Extensions can't reliably see microphone, camera or screen sharing, silent video, Picture-in-Picture, open developer tools, unsaved form edits or uploads. Exclude or pin tabs where that matters, and add sites to Chrome's always-active list if they must never unload.

## The popup

Click Window Parker's toolbar icon to open the popup. It describes the window you opened it in.

- **This tab** shows that window's selected tab, with its icon and title, and **Protect this tab**, or **Unprotect this tab** if it's protected. Only web pages can be protected, so on a parking page, a new tab, a `chrome://` or extension page, or a file, the button is unavailable and the popup says "Only web pages can be protected."
- **Parked windows** and **Sleeping tabs** count across all your windows. Sleeping tabs include the ones Chrome's Memory Saver put to sleep, in any window. The numbers update while the popup is open.
- **Pause automatic parking** stops windows parking, and parked windows wait for you to select a tab or press Restore tab instead of coming back by themselves. **Resume automatic parking** turns parking back on. It's the same setting as Enable automatic parking in Settings, and it never syncs.
- **Clear and reset tab actions** opens to show Clear parked tabs and Clear protected tabs (see [below](#clear-parked-tabs-and-clear-protected-tabs)). The popup remembers, on this computer, whether you left it open.
- The footer starts with a **Changelog** link to the release notes on GitHub, followed by Report a bug, Buy me a coffee and Settings. After an update from the Chrome Web Store, the link reads "What's new in" and the new version, such as "What's new in 2.0", until you follow it here or in Settings. A new installation or a hand-installed copy never shows it, and nothing else announces an update.

## The right-click menu

Right-click a web page to find Window Parker's items in Chrome's menu. Only the items that fit the page are shown:

- **Protect this tab** or **Unprotect this tab**, as in the popup.
- **Exclude this site** adds the page's website, such as `www.example.com` or `localhost:3000`, to Sites to exclude. **Stop excluding this site** removes the entries that name exactly that website, in any capitals or with a leading `*.`. If a broader entry covers the page, such as `example.com` on `docs.example.com`, or a full address that matches it, the menu shows an unavailable item instead, "A rule in Settings covers this site"; change that rule in Settings.
- **Pause automatic parking** or **Resume automatic parking**. These two are also on the menu you get by right-clicking Window Parker's toolbar icon.

A change made from the menu is saved the same way as in Settings or the popup: an excluded site counts as a change made on this computer and syncs if you sync Sites to exclude, and pausing never syncs.

Each item does only one thing, so a menu opened just before a change can't do the opposite of what it says. A click is checked against the tab when it's handled. Nothing happens if the tab has closed or no longer shows a web page, if it has moved on to a different site (for the site items), or if the change has already been made. No menu item parks, restores or unloads a tab, or clears parked or protected tabs.

If an item fails (Sites to exclude already has 200 entries, say), nothing changes. If Chrome sync refuses the longer site list, the site is excluded on this computer only and Sites to exclude stops syncing, as after the same edit in Settings. Either way, the popup tells you the next time you open it.

## Clear parked tabs and Clear protected tabs

Both are in the popup under Clear and reset tab actions, and each is unavailable while there's nothing for it to clear. Each asks first, in place of the two buttons: a question that names what will be cleared ("Clear parked tabs in 2 windows?"), then what will and won't happen. Cancel is the default button, and Cancel or Escape changes nothing. If you tick **Don't show this warning again** and confirm, that action runs without asking from then on, on this computer. **Restore confirmation warnings** in Settings brings both questions back; Restore defaults leaves them as they are.

**Clear parked tabs** finds every parking page, including leftovers, and returns each window to a real tab. It works while parking is paused and doesn't change that setting. It selects at most one real tab per window and never asks Chrome to unload anything, so loaded tabs stay loaded and sleeping tabs stay asleep. A tab you've selected yourself wins over the remembered one. If a window only has parking pages, Clear adds a blank tab first so the window stays open.

**Clear protected tabs** removes protection from every protected tab and says how many open tabs lost it. It doesn't close, move, reload, select or unload any tab, and it doesn't start a parking check, so those tabs are treated like any others from the next usual check. It also works while parking is paused and doesn't change that setting.

## Closing the last tab

If you close the last real tab in a parked window, or move it to another window, the extension removes its own parking pages and Chrome closes the now-empty window, just as it would without the extension. This works the same when it's your only Chrome window: no blank tab is added and Chrome isn't asked to quit.

The extension only removes pages it can match to its own recovery records. It re-checks the window twice before each removal, waits until a dragged tab has landed, and stops if a tab is created, moved, selected or navigated in the meantime. Pages it can't verify are left for Clear parked tabs. Chrome has no "remove only if nothing changed" call, so a change in the last instant can still race a removal.

## Moving a parking page

A parking page belongs to the window it was made for. If you drag it out into a window of its own, or move it into another window, it's removed there (with the same checks), and a window left holding only that page closes. The window it came from keeps all its tabs and simply isn't parked any more; it parks again after the usual delay. Dragged back into its own window, the page stays.

Chrome doesn't allow tab changes while you're still holding a dragged tab, so this cleanup, and closing an emptied parked window, happens as soon as you let go. After a browser restart or an update, a parking page belongs to whichever window it's in.

## Settings

Settings saves each change as you make it; there's no Save button. A checkbox or menu saves straight away, a number when you press Enter or leave its box, and the site list when you leave it, so a half-typed value never takes effect. Closing Settings saves what you were typing. A number that can't be used goes back to the value in use, with a note. A site list that can't be used stays as you typed it, marked, and the previous list stays in use until you fix it. Each change is saved on its own, so a setting changed meanwhile on another computer or Settings page is kept.

**Restore confirmation warnings**, next to Restore defaults, brings back the popup's questions before Clear parked tabs and Clear protected tabs after you've turned them off. It's unavailable while both are on. Settings shows the installed version in its top-left corner, and its Support section links to Report a bug, Buy me a coffee and the Changelog.

## Sync

Sync is off by default and chosen separately on each computer: for all settings at once, for the Parking or Tab protection group, or one setting at a time. A group's box shows a dash when only some of its settings sync. The syncable settings are the parking delay, restore delay, tab sleeping mode, theme, the pinned and audio tab options, and site exclusions.

Each computer keeps its own local copy of all settings, and that local copy is what the extension always uses, so it works offline, signed out, or with Chrome sync turned off. For each setting you choose, the value is also stored in Chrome's sync storage under its own key, so computers that share different settings don't overwrite each other. Chrome syncs that storage through your Google account when you're signed in with sync on.

The extension remembers, on this computer only, which of these settings you've changed here. A value that arrives through sync doesn't count as changed here, even if it replaces one that did. When you turn sync on for a setting:

- With no shared value yet, this computer's value is shared.
- With the same shared value, sync simply turns on.
- With a different shared value, and a setting you haven't changed here, the shared value is used. On a new computer, that picks up your other computers' settings without any questions.
- With a different shared value, and a setting you have changed here (even back to its default), Settings asks which to keep. Turning on several settings at once asks about all of them together, with a choice for each, and nothing changes until you apply your choices; Cancel changes nothing. If a value changes while you're choosing, Settings asks again.
- A shared value this version can't use (from a newer version, say) is never replaced without asking.

Turning a setting off keeps the current value here and leaves the shared value alone for your other computers.

A value changed on another computer goes through normal validation and then behaves exactly like the same change made here (a new sleeping mode applies to the next parking cycle, for example). Values that don't validate, perhaps from a newer version, are ignored. If Chrome refuses to store a value (a site list over Chrome's 8 KB limit per setting, for example), it stays local, that setting doesn't sync (or stops syncing), and Settings says why. Restore defaults restores the defaults, turns sync off on that computer only, and forgets which settings were changed here, so turning sync on again uses the shared values. It never changes what's shared.

Pausing, protected tabs, debug logging, your sync choices, the record of which settings you've changed here, the popup's preferences, and everything about windows, tabs and parking never sync.

## Restarts and recovery

Chrome can stop the extension's background worker at any time. Temporary state (window and tab IDs, last activity, parked windows, protected tabs) is kept in session storage, which survives a worker restart but not a Chrome restart or extension update. If the event that wakes the worker is you leaving a window you were using, that window still gets a fresh parking delay.

Each parking page has a random token in its address, and a small recovery record for it (previous tab's address, title and position) is saved before the page is selected. After a Chrome restart, parked windows are found again from their parking pages. If the same address was open twice and the tabs were reordered, the exact tab can't always be told apart.

Chrome controls session restore. It may reload selected tabs before the extension starts, or not restore windows at all, depending on your startup settings. The extension never creates replacement windows.

Reloading a hand-installed copy from `chrome://extensions` closes its parking pages, so each parked window shows its last tab again. Chrome Web Store updates wait until the extension isn't in use, or until Chrome restarts.

Recovery records are deleted when their window closes or returns to normal. Records of windows still parked when Chrome closes stay, so restored windows can use them; at most 100 leftovers are kept, and Clear parked tabs removes them. Removing the extension deletes all of its local storage.

## Permissions

| Permission | Used for |
| --- | --- |
| `tabs` | Tab addresses and titles for exclusions, recovery, the popup and the right-click menu; selecting tabs; optional discard requests. It doesn't give access to page contents. Chrome describes it as "Read your browsing history". |
| `storage` | Settings, recovery records, session state, the popup's preferences and notes (below) and, if you turn it on, synced settings. |
| `alarms` | Parking checks and restore-delay recovery while the worker is stopped. |
| `favicon` | Showing a tab's icon on the parking page and in the popup, from Chrome's own saved copy of site icons. Nothing is downloaded. With `tabs` already granted, Chrome shows no extra install warning for it. |
| `downloads` | Checking whether a download is in progress. Chrome describes it as "Manage your downloads"; downloads are never started, opened, changed or deleted. |
| `contextMenus` | The [right-click menu](#the-right-click-menu)'s items on web pages and the toolbar icon. It gives no access to page contents, and Chrome shows no install warning for it. |

For the popup, Window Parker also keeps a few things in local storage on this computer, and never syncs them: whether Clear and reset tab actions is open, which clearing questions you've turned off, the new version's number for "What's new" until you follow the link, and, until the popup has shown it, a note, which can name the site, from a right-click menu item that couldn't do what you asked. Restore defaults doesn't change them.

There are no host permissions, content scripts or remote code, and extension pages can't make network connections. Report a bug, Buy me a coffee and Changelog (or What's new) open a fixed web page in a new tab only when you click them.

## Checking memory savings

1. Use a few windows of comparable, disposable pages, and keep your usual Memory Saver setting for every run.
2. Note memory in Chrome's Task Manager and your system's activity monitor. Use `chrome://discards` to see which tabs are loaded, without pressing its discard buttons.
3. Set a custom parking delay of 1 minute, switch to another window or app, and wait about 90 seconds.
4. Check the parked window and note memory again once it settles. In Let Chrome decide mode the previous tab may stay loaded until Chrome needs the memory.
5. Compare Memory Saver alone with Memory Saver plus Window Parker over several runs. Savings depend on your pages and on Chrome; no fixed amount is promised. Set the delay back afterwards.

## Debug logs

In Settings, tick **Enable debug logging** under Diagnostics, then open `chrome://extensions`, find Window Parker and click **service worker**. Set the console to Verbose to see parking, restoring, skips and Chrome refusals. Logs use IDs and reasons, not page titles or addresses. Close that console before testing sleep or restarts, because it keeps the worker running.
