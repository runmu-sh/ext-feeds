# Changelog

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
