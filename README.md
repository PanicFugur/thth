# Thth

receive thy name

Open `index.html` in a modern browser. Click **Generate**, then **Copy**. No build, installation, or server required; HTML, CSS, JavaScript, and word pools live in that file.

Names contain two or three distinct words, joined with hyphens. Half receive a numeric suffix of 2–5 digits, without leading zeros. Words come from mythology, space, planets and moons, science-fiction author surnames, scientist surnames, and astronaut surnames. Shared words across categories are deduplicated before selection.

Copy displays “Copied!” for two seconds. If clipboard access is unavailable or denied, an inline message offers manual copying. Clipboard support depends on browser permissions and context; HTTPS or localhost is recommended when hosting. Direct file copying was also tested successfully in Chromium.

Names are random suggestions, not guaranteed unique, available domains, or passwords. People’s names use lowercase ASCII spellings, omitting accents, spaces, and punctuation; some author surnames are pen names.

## Tests

Dependency-free tests require Node.js (tested with v26.13.0):

```sh
node --test tests/*.test.cjs
```

Tests cover word pools, name formats, random branches and numeric boundaries, 10,000 seeded generations, clipboard success/failure, feedback timers, and pending-copy races.

Optional Chromium integration check uses Playwright. Install only into a temporary directory; no app dependency is needed:

```sh
npm install --prefix /tmp/thth-browser --no-audit --no-fund playwright
/tmp/thth-browser/node_modules/.bin/playwright install chromium
PLAYWRIGHT_MODULE=/tmp/thth-browser/node_modules/playwright node tests/browser-check.cjs
```

Browser checks exercise local-file and localhost clipboard access, keyboard controls, error UI, and layout at 320, 375, 768, and 1280 pixels. A mobile screenshot is saved to `/tmp/thth-mobile.png`. The script starts and closes its own loopback HTTP server.
