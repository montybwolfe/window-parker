# Changelog

## 2.0

Chrome Window Parker is now called Window Parker.

### Added

- A right-click menu on web pages: Protect this tab or Unprotect this tab, Exclude this site or Stop excluding this site, and Pause or Resume automatic parking. Pause and Resume are also on the toolbar icon's right-click menu. If a broader rule in Settings already covers the site, the menu says so instead of offering a change. If an item can't make its change, such as excluding a site when the list already has 200 sites, nothing changes and the popup tells you why the next time you open it. The menu needs Chrome's `contextMenus` permission, which shows no install warning.
- Clear protected tabs in the popup removes protection from every protected tab. It doesn't close, reload or unload anything.
- The popup asks before Clear parked tabs and Clear protected tabs, and says what will happen. Tick "Don't show this warning again" to skip that question from then on; Restore confirmation warnings in Settings brings the questions back.
- Changelog links in the popup and Settings. After an update from the Chrome Web Store, the popup's link reads "What's new in 2.0" until you open it.

### Changed

- A new icon: a white crescent moon on a blue tile.
- The popup, Settings and the parking page are redesigned. They use your system's font and Chrome's own controls, with amber for anything parked or asleep.
- The popup starts with the tab you're on: its icon and title, then Protect this tab. On a page that can't be protected, the button is unavailable and the popup says "Only web pages can be protected." Clear parked tabs and Clear protected tabs are under "Clear and reset tab actions", which stays open or closed as you left it. Counts drop into place when they change.
- The parking page shows your previous tab's website under its title, and the Window Parker name sits in its bottom-left corner. Its tab is now titled "Parked:" followed by your tab's title.
- In Settings, the theme choice is labeled Light, Dark and Auto, the version is in the top-left corner, and the longer help about excluded sites is under "More about excluded sites". The list under Protect individual tabs updates by itself when protection changes in the popup or the right-click menu.
- Clean up in Sites to exclude also removes blank lines and spaces around entries. It never removes or merges an entry Settings can't use, so a mistake stays in the list until you fix it.

### Fixed

- Fixed Protect this tab in the popup becoming unavailable after you used another popup button. Chrome reports no window as focused while the popup is open, so Protect now acts on the selected tab of the popup's own window.
- Fixed home addresses pasted into Sites to exclude not being shortened to their websites when the lines ended in a carriage return alone, as in some older Mac files.

## 1.5.6.1

### ✨ Added

#### Sync and autosave

- Added optional settings sync through Chrome, with controls for all settings, groups or individual settings. Sync is off by default. New computers adopt shared values for untouched settings and ask before replacing settings changed locally.
- Added autosave to Settings and removed the Save settings button. Numbers save on Enter or when leaving the box; excluded sites save when leaving the list. Closing Settings keeps valid edits.

#### Parked-window identity

- Added the original tab's title and favicon to the parking page.
- The new favicon permission uses Chrome's saved icon without contacting the site or adding an install warning.

### Fixed

#### Parking reliability

- Fixed empty parked windows remaining open after their last real tab was closed or moved away. Clear parked tabs still keeps windows open and never starts discards.
- Fixed parking pages remaining behind after being dragged to another window. The original window gets a full parking delay, and tab changes blocked during a drag finish after it ends.
- Fixed windows occasionally parking too soon after use when Chrome had stopped the extension's background worker.
- Fixed Discard immediately sometimes leaving eligible tabs loaded while the parking page was still opening. Let Chrome decide continues to make no discard requests.

#### Tab protection and recovery

- Fixed tab protection being lost when Chrome unloads a tab and gives it a new ID.
- Fixed recovery records remaining in storage after parked windows closed while the extension was idle.

### Improved

#### Settings and excluded sites

- Added home-address paste handling, Clean up and Undo for excluded sites. Clean up sorts and removes duplicate rules without changing which pages are excluded; Undo restores the previous text.
- Improved validation and error messages for invalid numbers, excluded sites, storage failures and sync conflicts. Invalid edits leave the previous settings in use.
- Changed Restore defaults to ask for confirmation and reset settings and sync choices on this computer only. Shared settings on other computers are preserved.

#### UI and accessibility

- Improved Settings, popup and parking-page readability, keyboard focus, screen-reader labels, field contrast and High Contrast theme indicators.
- Added an immediate Light/Dark/Auto switch, clearer protection lists with window numbering, the installed version in Settings, and sharper toolbar icons.
- Added Report a bug buttons and clearer Buy me a coffee links in the popup and Settings.

## 1.5.1.3

First Chrome Web Store release.

- Parks idle windows on a lightweight page and brings back your previous tab when you return.
- Works with Chrome Memory Saver, or unloads a parked window's tabs straight away.
- Site exclusions, per-tab protection, pause, and Clear parked tabs.
- Light, dark and automatic appearance.
