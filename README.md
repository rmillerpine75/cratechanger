# CrateChanger

A single-file web app for managing a 200-disc CD changer: covers, tracklists, flags, loans, play history, stats.

**To use it:** open `dist/cratechanger.html` in Chrome or Edge. No server, no install.
Your collection lives in that browser's local storage. Use **💾 BACKUP** (export or auto-backup) to keep a copy.

## Layout

```
src/index.template.html   page markup (@@STYLES@@ / @@SCRIPT@@ markers)
src/styles/*.css          styles, concatenated in filename order
src/js/*.js               one classic script, split by feature, concatenated in filename order
                          (000-initial-data.js is the built-in disc list; 990-boot.js must stay last)
build.mjs                 sources -> dist/cratechanger.html (byte-exact concatenation)
tests/                    headless-Chrome test suites + runner
```

## Build and test (Node 22+, Chrome or Edge installed)

```
node build.mjs               # writes dist/cratechanger.html
node tests/run.mjs           # all offline suites (throwaway browser profile, network stubbed)
node tests/run.mjs --live    # real MusicBrainz / iTunes / Discogs smoke test
```

`npm run build` / `npm test` / `npm run test:live` do the same.
CI (`.github/workflows/test.yml`) rebuilds, checks the committed `dist/` is up to date, and runs all suites on every push.

## Notes

- The tests never touch your real browser data: each suite runs a copy of the page in a temporary Chrome profile.
- `000-initial-data.js` contains your disc list. Keep the GitHub repository **private** if you'd rather not publish it.
