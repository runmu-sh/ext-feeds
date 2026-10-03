# Feeds (`@runmu.sh/ext-feeds`, id `feeds`)

The Feeds panel of [μClient](https://runmu.sh) (R-FEEDS) and its routing rules: the lines your rules copy or move out of the terminal, one tab per feed, and the Settings → Feeds page where you write the rules.

First-party, on the [marketplace](https://runmu.sh/marketplace/x/feeds). Install it from **☰ → Extensions → Discover** and enable it per world in **Extensions → Installed**.

Until 1.0.0 the panel was part of the client core. Since 2.0.0 (μClient SDK 1.14) the extension also owns the routing rules, the Settings → Feeds page and the line buffers (up to 500 lines per feed per session). Rules you made in the client's old Settings → Feeds are copied into the extension once, the first time it loads.

## Getting started
1. Open **Settings → Feeds** (☰ → Settings, the ⇶ Feeds tile, or the **Rules** button in the panel). The page explains feeds and offers three one-click examples.
2. Add a rule: **Match** is what to look for and the **Text | Regex** toggle says how it is read: Text matches exactly what you typed, anywhere in the line, any case; Regex reads it as a regular expression (any case), so `.+` takes every line; **Feed** is the tab the line goes to. Choose **Copy** (the line stays in the terminal too) or **Move** (the line leaves the terminal).
3. Paste a line of game output into **Try it** to see which feed it would land in.
4. Lines now land in the Feeds panel as the game sends them. The panel opens itself the first time a session gets one.

Examples:

| Match | Feed | Mode | Why |
| --- | --- | --- | --- |
| `[vox]` (Text) | vox | copy | the public channel in its own tab |
| `tells you,` (Text) | tells | move | private messages out of the terminal |
| `^(You\|.+) (hit\|miss\|parr)` (Regex) | combat | move | combat spam tidied away |

Rules are per world and sync to your account. Feeds hold up to 500 lines each, per session, on this device.

## Where the lines come from
No GMCP. Feeds are filled by the player's rules in **Settings → Feeds**, stored per world in the extension's `routes` setting (`RouteRule[]`: `pattern`, `target` feed, `move`, `enabled`, plus `match` and `mode` — `text` or `regex` — from which the page writes `pattern`: Text as an escaped `/…/i`, Regex as `/…/`). A line router (`mu.lines.route`, `edits: true`) delivers each matching line to the extension's own per-session store (`src/store.ts`); `edits: true` also lets triggers and other extensions copy or move a line into a feed (`LineEdit.copyTo/moveTo`). The tabs are the enabled rules' feeds in rule order, then any other feed holding lines.

## What it shows
- **`feeds`** (Views → Feeds, right bottom, order 50): a tab per feed with an unread badge (lines that arrived while you looked elsewhere). Arrow keys move between tabs (they wrap), Home and End go to the first and last. Hovering a tab shows its line count; double-clicking it pops the feed out.
- Tools: **Search** (filters the feed, with a count; Esc closes), **Times** (HH:MM:SS before each line), **Pop out** (the feed in its own floating `feed` panel, titled "Feed: <label>"), **Rules** (opens Settings → Feeds), **Clear** (empties the feed on this device, after μClient's confirm dialog says how many lines go) and **Help** (a strip that explains each tool and the keyboard).
- Lines keep the terminal's colours and highlights (each span's classes and style, inside the host's `.mu-ansi` palette scope); spans with a link render as links that open in a new tab.
- Scrolled up, a ↓ pill jumps back to the end and counts what arrived ("3 new lines ↓"). A feed is marked read only while some Feeds panel is at its end; lines that arrive while you are scrolled up stay unread.
- With no feed yet the panel explains what a feed is, the three steps to one, and offers **Add a feed**, which opens Settings → Feeds. A feed with no lines yet says so and links to the rules.
- **`feed`** (not in Views, floating, one per feed, `params.feed` = the label): the popped-out single feed with the same tools, less Pop out.

The first line a session's feeds receive adds the `feeds` panel to that session's workspace if it is not open (`mu.panels.touch`; once per world on this device, so a panel you closed stays closed).

## Settings
**Settings → Feeds** (the ⇶ tile on the Settings hub) is the extension's page (`src/settingsPage.ts`), for the active world:
- the rules as cards: **Match** with a **Text | Regex** toggle (a bad regex shows the error under it), **Feed**, **Copy** or **Move**, **Enabled**, ↑ ↓ to reorder (rules are checked top to bottom) and × to delete; **Add rule** adds an empty one;
- three examples with **Use**, a note on how matching works, **Try it** (paste a line, see which feeds it goes to and whether it leaves the terminal) and **Open panel**.

**Show panel** (added by the host for `show`): always listed, only once a feed has lines, or never.

## SDK
SDK 1.14. Uses `mu.settings.define` (a `routes` json item per world, a hub `tile` and the page `component`) `/get/set/watch/open`, `mu.lines.route/testRoutes/patternError`, `mu.panels.register` (`show: 'always'`) `/open/touch/vue`, `mu.sessions.each`, `mu.ui.confirm`, `mu.ui.style` (rules scoped under `.ext-panel[data-ext="feeds"]`) and the `mu.ui.css` primitives. Capability `read-output` (it shows game text). It exports no API. `tests/model.test.mjs` covers the pure helpers in `src/model.ts`; `tests/store.test.mjs` the line store; `tests/host.test.mjs` runs the extension in the headless host from `@runmu.sh/dev/test`, and `tests/page.test.mjs` drives the settings page there (happy-dom).

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
