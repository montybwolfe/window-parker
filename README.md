<h1 align="center"><picture><img src="icons/window-parker-128.png" width="36" height="36" alt="" align="top"></picture> Window Parker</h1>

<p align="center"><a href="https://chromewebstore.google.com/detail/chrome-window-parker/agdejolopcplaedpollnlgpboldnfbfi"><picture><source media="(prefers-color-scheme: light)" srcset="docs/assets/chrome-web-store-badge-no-border.png"><img src="docs/assets/chrome-web-store-badge.png" alt="Available in the Chrome Web Store" width="206"></picture></a></p>

<p align="center"><a href="https://github.com/montybwolfe/window-parker/issues">Report a bug</a></p>

Chrome's Memory Saver puts background tabs to sleep, but not the tab that's selected in each window. If you keep a lot of windows open (one per project, spread across desktops), that tab stays loaded in every one of them, even in windows you haven't looked at for hours.

Window Parker parks the windows you aren't using. When a window has been idle for 15 minutes (you can change this), it selects a small parking page at the end of that window, so your tab becomes a background tab that Chrome can put to sleep. The parking page shows the icon, title and website of the tab you left, so you can tell parked windows apart. When you go back to the window and stay for a couple of seconds, your tab is selected again.

It never moves windows or changes tab order, pins or groups. Swiping quickly through desktops doesn't wake the windows you pass.

## Install

Install it from the **[Chrome Web Store](https://chromewebstore.google.com/detail/chrome-window-parker/agdejolopcplaedpollnlgpboldnfbfi)**. To install by hand instead, unzip a release from [Releases](https://github.com/montybwolfe/window-parker/releases), turn on Developer mode in `chrome://extensions` and choose **Load unpacked**.

Needs Chrome 120 or newer. Tested on macOS; Windows, Linux and ChromeOS should work but haven't been tested properly yet.

## Using it

Click the toolbar icon to open the popup. It shows the tab you're on, with a button to protect it, and how many windows are parked and tabs are asleep. You can pause parking there too. Under "Clear and reset tab actions", Clear parked tabs brings every parked window back and Clear protected tabs removes all protection. Both ask first.

Right-click a web page to protect that tab, exclude its site or pause parking. The toolbar icon's own right-click menu can pause and resume parking too.

Settings has the delays, how tabs sleep, the sites to exclude, protection for individual tabs, the theme, and sync for chosen settings between your computers.

By default Chrome decides when a parked window's tabs sleep. If you'd rather free memory straight away, choose **Discard immediately** in Settings (unloading can lose unsaved work in a page, so exclude sites where that matters).

A window stays awake if its selected tab is pinned, playing audio, protected or on a site you've excluded, and parking pauses while a download is in progress. The details are in [how it works](docs/BEHAVIOR.md).

## Privacy

No account, analytics, ads or server: everything runs in your browser and nothing is sent to me. Sync is off unless you turn it on for a setting, and synced settings travel through your own Chrome sync. See the [privacy policy](PRIVACY.md).

Chrome's install warning "Read your browsing history" is its standard wording for seeing your open tabs' addresses and titles, which Window Parker needs for excluded sites and to bring back the right tab. It can't read your history. "Manage your downloads" is only used to check whether a download is in progress.

## Help and development

Found a bug? [Open an issue](https://github.com/montybwolfe/window-parker/issues) (there's a bug button in the popup and Settings too). Common questions, including Chrome's "not trusted by Enhanced Safe Browsing" notice, are in [Help](SUPPORT.md).

There's no build step: load this folder as an unpacked extension. `npm test` runs the tests and `python3 scripts/package.py` builds the release ZIP. See [Testing](TESTING.md) and the [changelog](CHANGELOG.md).

Window Parker is free and open source ([MIT](LICENSE)). If it's useful to you, you can buy me a coffee:

<p align="center"><a href="https://buymeacoffee.com/montybwolfe"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="Buy Me a Coffee" width="206"></a></p>

This is an independent project, not affiliated with or endorsed by Google.
