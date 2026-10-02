# Feeds (`@runmu.sh/ext-feeds`, id `feeds`)

The Feeds panel of [μClient](https://runmu.sh) (R-FEEDS): the lines your routing rules copy or move out of the terminal, one tab per feed.

First-party, on the [marketplace](https://runmu.sh/marketplace/x/feeds). Install it from **☰ → Extensions → Discover** and enable it per world in **Extensions → Installed**.

Until 1.0.0 the panel was part of the client core. The core still routes the lines (Settings → Feeds, a rule stage) and keeps up to 500 lines per feed per session; this extension only draws them.

## Where the lines come from
No GMCP. Feeds are filled by the player's rules in **Settings → Feeds** (a pattern, a feed label, and whether the line stays in the terminal). The panel reads them through `mu.feeds` (SDK 1.7+): the labels in order (the enabled rules' labels, then any other feed holding lines), the lines with their spans, and unread counts.

## What it shows
- **`feeds`** (Views → Feeds, right bottom, order 50): a tab per feed with an unread badge (lines that arrived while you looked elsewhere). Arrow keys move between tabs (they wrap), Home and End go to the first and last.
- Tools: **Search** (filters the feed, with a count), **Times** (HH:MM:SS before each line), **Pop out** (the feed in its own floating `feed` panel, titled "Feed: <label>"), **Rules** (opens Settings → Feeds) and **Clear** (empties the feed after μClient's confirm dialog).
- Lines keep the terminal's colours and highlights (each span's classes and style); spans with a link render as links that open in a new tab.
- Scrolled up, a ↓ pill jumps back to the end and counts what arrived ("3 new lines ↓"). A feed is marked read only while some Feeds panel is at its end; lines that arrive while you are scrolled up stay unread.
- With no feed yet the panel says **Add a feed**, which opens Settings → Feeds.
- **`feed`** (not in Views, floating, one per feed, `params.feed` = the label): the popped-out single feed with the same tools, less Pop out.

The first line a session's feeds receive adds the `feeds` panel to that session's workspace if it is not open (`mu.panels.touch`; once per world on this device, so a panel you closed stays closed).

## Settings
**Show panel** (Settings → Extensions → Feeds, added by the host for `show`): always listed, only once a feed has lines, or never. The feeds themselves are configured in **Settings → Feeds** (core).

## SDK
SDK 1.12. Uses `mu.feeds.watch/viewing/clear`, `mu.panels.register` (`show: 'always'`) `/open/touch/vue`, `mu.sessions.each`, `mu.ui.confirm`, `mu.commands.run('settings.open', 'feeds')`, `mu.ui.style` (rules scoped under `.ext-panel[data-ext="feeds"]`) and the `mu.ui.css` primitives. Capability `read-output` (it shows game text). It exports no API. `tests/model.test.mjs` covers the pure helpers in `src/model.ts`; `tests/host.test.mjs` runs the extension in the headless host from `@runmu.sh/dev/test`.

## Develop
Made with `npm create @runmu.sh/extension` ([the quickstart](https://runmu.sh/docs/extensions/quickstart)).

```sh
npm install
npm run build        # src/index.ts → dist/index.js, then the manifest check
npm run typecheck    # tsc --noEmit against the SDK types
npm test             # node --test tests/*.test.mjs (pure helpers + @runmu.sh/dev/test host)
npm run dev          # dev server on http://localhost:5199/ with hot reload
```

## License
MIT
