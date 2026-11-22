# Chrome Web Store listing

Everything for the listing lives here:

- `description.txt`: the Store description.
- `privacy-fields.txt`: the Privacy practices tab (single purpose, a justification for each permission, remote code, data use and the privacy policy's address).
- `test-instructions.txt`: the Test instructions tab, for reviewers (at most 500 characters; no login needed).
- `fields.json`: the other listing fields, the file names in upload order, and the live listing URL. The title and summary are `manifest.json`'s `name` and `description`, which the Store reads from the uploaded package.
- Screenshots, promo tiles and the Store icon, made by [the artwork tools](../tools/store-assets/README.md), with their records in `sources/`. The screenshots are real Google Chrome windows captured on a Mac; the other artwork is made on macOS or Windows, so it shows the system font.
