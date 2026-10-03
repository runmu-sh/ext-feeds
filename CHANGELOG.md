# Changelog

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
