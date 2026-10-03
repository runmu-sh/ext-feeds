# Changelog

## 2.2.0

- Changing your rules now applies them to earlier lines too, not only to new ones. A new `(.+)` Regex rule → `all` fills the `all` feed at once with the session's earlier chat and terminal lines, ANSI colours included. Changing a rule's feed moves its lines to the new tab; disabling or deleting a rule takes its lines out of the feed.
- This happens for every open session of the world, with or without a Feeds panel open, about 150 ms after the last edit. It uses the lines the client holds (SDK 1.15 `mu.lines.query`, up to 5000), plus the lines the feeds already have that the terminal no longer holds (such as moved lines), matched again. Each feed keeps its newest 500.
- Lines that triggers or other extensions copied or moved into a feed are kept through a rebuild, in order.
- Rebuilt history is not unread. Lines that were unread before the change stay unread if they're still in the feed.
- A cleared feed stays cleared: a rebuild doesn't bring back lines from before the Clear.
- The terminal itself is not rewritten. A new Move rule copies earlier lines into its feed but doesn't remove them from the terminal; removing one doesn't put lines back.
- It still loads on a μClient without SDK 1.15 (`api ^1.14`, `mu.lines.query` is feature-detected). There, rules apply to new lines only, as in 2.1.
- Built against `@runmu.sh/sdk` 1.15 and `@runmu.sh/dev` 0.4.

## 2.1.0

- Each rule has a **Text | Regex** toggle for how its Match is read, and nothing is guessed from what you type. Text matches the characters exactly, anywhere in the line, ignoring case (`[vox]`, `(.+)` and `/x/` are literal). Regex reads the Match as a regular expression, ignoring case: `.+` or `(.+)` takes every line. Before this, a rule like `(.+)` without slashes was read as text and matched nothing.
- Rules saved before 2.1 open as they matched: a `/re/flags` pattern as Regex (flags kept), anything else as Text. The first edit writes them in the new shape (`match`, `mode`, and the `pattern` the host routes on).
- Feed lines keep the game's ANSI colours. They now sit inside the host's terminal palette scope (`.mu-ansi`), so `.c-NNN`, `.bg-NNN`, bold and dim apply as in the terminal. Highlights and custom colours already came through.
- The examples show their mode; the How to match note and the empty-panel text explain Text and Regex.

## 2.0.0

Breaking: needs μClient SDK 1.14 (`api ^1.14`). The client core no longer routes lines into feeds, keeps feed buffers or has its own Feeds page; this extension now does all three.

- Routing rules live in the extension: a per-world `routes` setting (`RouteRule[]`: pattern, target feed, copy or move, enabled), read by a line router (`mu.lines.route`, `edits: true`, so triggers and other extensions can copy or move lines into a feed too).
- **Settings → Feeds** (the ⇶ tile on the Settings hub) is the extension's page: the rule editor the core used to have, with Match → Feed cards, Copy or Move, Enabled, ↑ ↓ ×, **Add rule**, three one-click examples, a pattern error under a bad `/regex/`, **Try it** and **Open panel**.
- Existing rules are copied once from the client's `rules.feeds` into `routes` the first time the extension loads (the host does the copy; a rule's `label` becomes its `target`).
- The lines are kept by the extension, per session, up to 500 per feed. It no longer reads `mu.feeds`.
- The panel's Rules tooltip, help strip and empty-panel steps point at Settings → Feeds by its tile.

## 1.2.0

- The empty panel explains what a feed is and the three steps to one, above **Add a feed**, instead of a lone button.
- A feed with no lines yet says what will land there and links to the rules.
- A **Help** tool toggles a strip that explains Search, Times, Pop out, Rules and Clear, the 500-line cap, badges and the keyboard.
- Tabs: the unread badge sits apart from the name, hovering shows the line count, and a double-click pops the feed out. Long feed names are cut with an ellipsis.
- Clear says how many lines go and that the rule keeps filling the feed.
- The tabs and tools stack into two tidy rows in a narrow dock (a container query), with no half-wrapped buttons.
- README: a Getting started section with the rule syntax and worked examples.

## 1.1.0

- Clearing a feed asks in μClient's own dialog, with a red Clear button, instead of the browser's.
- Settings → Extensions → Feeds has a **Show panel** row: always, only once a feed has lines, or never.
- A popped-out feed is titled "Feed: <name>", as on Underspire.
- Search reads "Search <feed>", and the tool buttons use the standard command style, as on Underspire.
- The scroll-to-latest arrow (↓) shows while you are scrolled up, before any new line arrives.
- A Feeds panel hidden behind another tab goes back to the latest line when you show it again.
- A feed you have scrolled up in no longer counts as read: its new lines show as unread until you get back to the end. Each pop-out counts for its own feed.
- The tabs and tools wrap onto two rows in a narrow dock instead of overlapping.
- F6 reaches the feed's lines.
- Needs μClient with SDK 1.12.

## 1.0.0

- The Feeds panel as an extension. It was part of the μClient core; it now draws the feeds through `mu.feeds` (SDK 1.7). The panel ids (`feeds`, `feed`), test ids and copy are unchanged, so saved layouts keep working. Install it from Extensions → Discover.
