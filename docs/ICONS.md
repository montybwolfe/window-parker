# Icons

There's one design: a white crescent moon on an azure (`#0F7BEF`) squircle. [`icons/window-parker.svg`](../icons/window-parker.svg) is the master, and its tile fills its 128-unit view box. [`icons/window-parker-32.svg`](../icons/window-parker-32.svg) and [`icons/window-parker-16.svg`](../icons/window-parker-16.svg) are drawn for the toolbar: the tile fills the whole icon, the same size as other extensions' square toolbar icons, and the moon is a little larger so it stays clear at that size. All three are editable vectors with no fonts, filters or embedded images. It's an original design, not a Chrome or Google mark.

| Where | File |
| --- | --- |
| Extension icons (`manifest.json`) | `icons/window-parker-16.png`, `-32`, `-48`, `-128` |
| Toolbar button | `icons/window-parker-16.png` and `-32`, for 1× and 2× (Retina) screens. Chrome draws one of the two at every screen scale and resizes it as needed (at 1.5× it shrinks the 32 px icon), so there's no 24 px icon. |
| Popup header and the parking page's corner | `icons/window-parker.svg`, shown at 16px |
| Settings header | `icons/window-parker.svg`, shown at 24px |
| Page favicons | `icons/window-parker-32.png` |
| Chrome Web Store | `store-listing/store-icon-128.png`: the moon at 96×96 inside 16px of transparent padding |
| Larger artwork | `docs/assets/window-parker-256.png`, `-512`, `-1024` |

Each PNG is a render of the SVG drawn for its size, at its real size, never a resized PNG: 16 and 32 px from their own SVGs, and 48 px, 128 px and the larger artwork from the master. `node tools/store-assets/icons.mjs 16 32 48 128` renders the runtime icons and `node tools/store-assets/icons.mjs 256 512 1024` the larger artwork. The four PNGs and the master SVG ship in the extension; the pages show the SVG, so their brand mark stays sharp at any zoom. The Store artwork is made by [the artwork tools](../tools/store-assets/README.md). After changing icons, reload the unpacked extension; Chrome can keep old icons cached until then.
