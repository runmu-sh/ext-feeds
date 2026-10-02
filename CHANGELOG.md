# Changelog

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
