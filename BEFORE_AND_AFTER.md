# Unloader before and after

The redesign gives pinned tabs the same unload behavior as other tabs, removes the manual unload prompt, and simplifies the extension and its website.

| Area | Before | After |
| --- | --- | --- |
| Pinned tabs | The idle timer skipped pinned tabs. Manually unloading one could open a confirmation. | The same timer and site rules apply to pinned and unpinned tabs. An unloaded pinned tab stays pinned and reloads when you select it. |
| Manual unload | The extension could ask “Unload this tab?” for pinned tabs, editing, playing media, or unknown page state. The shortcut could open the dashboard to show that prompt. | The dashboard, toolbar popup, and keyboard shortcut unload directly. The automatic timer still skips active tabs and pages with detected editing or playing media. |
| Memory | The dashboard showed a current estimate, a lifetime total, and a seven-day chart. One example showed 1.6 GiB for 7 unloaded tabs alongside a 61 GiB lifetime total. | The dashboard and popup show one estimate for the tabs currently unloaded. For that example, the readout is 1.6 GiB and 7 unloaded tabs. |
| Tabs and popup | The dashboard put the memory panels above the tab list. The popup showed stats and sent you to the dashboard to act. | The tab list has a compact memory summary, clearer Loaded and Unloaded states, and labeled Unload and Restore buttons on narrow screens. You can unload the current page or open Website rules from the popup. |
| Website rules | Saved rules had live controls. Changing a rule to Custom timer immediately saved a 15-minute timer. | The default timer has its own switch and Save timer button. Add or edit one site rule at a time. Save rule applies the mode and minutes together, and Cancel discards the draft. |
| Browser icon | The toolbar used the stacked-layers icon, and the dashboard tab had no explicit favicon. | The toolbar, dashboard tab, popup and website use the new pine-and-mint tab icon. The toolbar has a version drawn for 16 pixels. |
| Public website | The landing page showed a static dashboard mockup with a memory chart. | The React demo lets you unload and restore an example page while its tab remains visible. The site also has redesigned download, docs, and privacy pages. |

The dashboard and popup already used React. The redesign updates those React screens and keeps their existing browser entrypoints.

## Screenshots

The before images show the previous layout. The after images show the rebuilt screens with sample data.

| Screen | Before | After |
| --- | --- | --- |
| Tabs dashboard | [Before](https://github.com/wrestle-R/Unloader/blob/096cddeffd166a9e4ce3c681342c68917db8e3ba/extension/previews/light.png) | [After](extension/previews/light.png) |
| Website rules | [Before](https://github.com/wrestle-R/Unloader/blob/096cddeffd166a9e4ce3c681342c68917db8e3ba/extension/previews/rules.png) | [After](extension/previews/rules.png) |
| Toolbar popup | [Before](extension/previews/comparison/popup-before.png) | [After](extension/previews/comparison/popup-after.png) |
| Website home | [Before](extension/previews/comparison/website-before.png) | [After](extension/previews/comparison/website-after.png) |

## Verification

- Firefox, Zen, and Chromium passed manual and timed unloading of pinned tabs. The timer kept an unsaved draft loaded.
- In all three browsers, one click unloaded an editing tab without a prompt, the keyboard shortcut worked, and the Rules editor saved changes, canceled drafts, and removed rules. [Browser tests](extension/scripts/browser-smoke.mjs)
- All 23 unit tests and production builds passed. The extension and website passed layout checks at 320, 390, and 1280 pixels in both themes. [Layout tests](extension/scripts/visual-check.mjs)

[Website](https://unloader-rdp.vercel.app/) · [Chromium ZIP](https://github.com/wrestle-R/Unloader/releases/latest/download/unloader-chromium.zip)
