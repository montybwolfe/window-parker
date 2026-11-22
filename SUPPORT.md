# Help

**Found a bug?** Please [open an issue on GitHub](https://github.com/montybwolfe/window-parker/issues). Include the Window Parker version (Settings shows it in its top-left corner), your Chrome version, operating system and sleeping mode, what you expected and what happened. Leave out private addresses, titles and personal details.

## Common questions

**Chrome Window Parker has a new name.** Version 2.0 renamed it Window Parker and gave it a moon icon. It's the same extension, and it keeps your settings.

**A window doesn't park.** It has to stay unfocused for the whole parking delay, and its selected tab can't be pinned, playing audio, protected, on an excluded site, still loading, or a Chrome page. Any download in progress pauses parking in every window, and nothing parks while the popup says "Parking paused". Chrome can also run the check a little late.

**The parked tab is still loaded.** In Let Chrome decide mode, Chrome's Memory Saver decides when to unload background tabs; parking only makes that possible. Discard immediately unloads them straight away.

**A window didn't come back.** Stay in it for the restore delay (2 seconds by default), or click Restore tab. If automatic parking is paused, windows don't restore by themselves, but you can always click a tab.

**What does Clear parked tabs do?** It returns every parked window to a normal tab and removes the parking pages. It doesn't unload or reload anything else.

**What does Clear protected tabs do?** It removes protection from every protected tab, so those tabs can park and unload like any others. No tab is closed, reloaded or unloaded.

**The popup no longer asks before clearing.** You ticked "Don't show this warning again". Restore confirmation warnings, next to Restore defaults in Settings, brings the questions back.

**Protect this tab is unavailable.** Only web pages can be protected, so the button is unavailable on a parking page, a new tab, Chrome's own pages, extension pages and files.

**The right-click menu says "A rule in Settings covers this site".** A broader entry in Sites to exclude already covers the page, such as `example.com` for `docs.example.com`, or a full address that matches it. Change that entry in Settings.

**Chrome warns about browsing history and downloads.** Those are Chrome's standard descriptions of the permissions. See [the README](README.md#privacy) for what they're used for.

**Chrome says it's "not trusted by Enhanced Safe Browsing".** Chrome shows this for extensions from newer developers when Enhanced protection is on. Google says new developers usually take a few months to become trusted.

## Debug logs

Turn on debug logging in Settings, then open `chrome://extensions`, find Window Parker and click **service worker** to see its console. Close that console before testing sleep or restarts, because keeping it open changes how Chrome runs the extension.

## Compatibility

Chrome 120 or newer. Tested on macOS; Windows, Linux and ChromeOS should work but haven't been tested properly yet.

Support for development is optional and separate from help: everything is free, and bug reports are always welcome.
