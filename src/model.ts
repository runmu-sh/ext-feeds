/**
 * The pure parts of the Feeds panel: copy, CSS, tab keys, timestamps, search, the latest pill and the
 * auto-add watcher. No Vue and no DOM here, so tests/*.test.mjs import this file directly.
 */
import type { Dispose, FeedLineView, FeedsView, Mu } from '@muclient/sdk';

/** Visible copy (μClient rules/copy.ts, the Feeds panel part). */
export const COPY = {
  search: 'Search', times: 'Times', rules: 'Rules', popOut: 'Pop out', clear: 'Clear', addFeed: 'Add a feed',
  empty: 'Empty.', noMatches: 'No matches.',
  title: 'Feeds', feedTitle: 'Feed',
  popTitle: (label: string) => `Feed · ${label}`,
  confirmClear: (label: string) => `Clear ${label}?`,
  latest: (n: number) => `${n} new line${n === 1 ? '' : 's'} ↓`,
};

/** Tokens only (style bible). Every rule is under `.mu-feeds`. Ported from FeedsPanel.vue's scoped CSS. */
export const FEEDS_CSS = `
.mu-feeds { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-elev); }
.mu-feeds .fbar { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--accent); flex: 0 0 auto; }
.mu-feeds .ftabs { display: flex; gap: 2px; flex-wrap: wrap; flex: 1; min-width: 0; }
.mu-feeds .solo { flex: 1; color: var(--accent-bright); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; }
.mu-feeds .ftab { display: inline-flex; align-items: center; background: none; border: 0; border-radius: 0; color: var(--fg-dim); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 2px .8ch; min-height: 24px; transition: color .12s ease, background-color .12s ease; }
.mu-feeds .ftab:hover { color: var(--fg); background: var(--tint-toggle); }
.mu-feeds .ftab.on { color: var(--bg-deep); background: var(--accent); }
.mu-feeds .fbadge { margin-left: .6ch; }
.mu-feeds .tools { display: flex; gap: 3px; flex: 0 0 auto; }
.mu-feeds .fsearch { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--border); flex: 0 0 auto; }
.mu-feeds .fsearch input { flex: 1; min-width: 0; }
.mu-feeds .cnt { color: var(--fg-dim); font-size: .72rem; }
.mu-feeds .lines-wrap { position: relative; flex: 1; min-height: 0; display: flex; }
.mu-feeds .flines { flex: 1; overflow-y: auto; padding: 6px 10px; line-height: var(--shell-line-height); }
.mu-feeds .fline { white-space: pre-wrap; word-break: break-word; }
.mu-feeds .ts { color: var(--fg-faint); margin-right: .8ch; font-size: .82em; user-select: none; }
.mu-feeds .fempty { padding: 10px 0; margin: 0; color: var(--fg-faint); font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }
.mu-feeds .latest { position: absolute; right: 14px; bottom: 10px; z-index: 5; background: var(--accent); border: 0; border-radius: 0; color: var(--bg-deep); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 3px 10px; min-height: 24px; transition: background-color .12s ease; }
.mu-feeds .latest:hover { background: var(--accent-bright); }
.mu-feeds .intro { padding: 12px; color: var(--fg-dim); font-size: .8rem; }
`;

/** `params.feed` of the popped-out `feed` panel, '' for the tabbed `feeds` panel. */
export const soloOf = (params: Record<string, unknown> | undefined): string => (typeof params?.feed === 'string' ? params.feed : '');

/** The tabs to show: the solo feed alone, else the host's ordered labels. */
export const labelsOf = (view: FeedsView | null, solo: string): string[] => (solo ? [solo] : view ? [...view.labels] : []);

/** Keep the selection while its feed exists, else the first one ('' when none). */
export const keepSelection = (labels: string[], sel: string): string => (labels.includes(sel) ? sel : labels[0] ?? '');

/** The tab index a key moves to (roving tabindex: arrows wrap, Home, End), or -1 for any other key. */
export function tabTarget(key: string, i: number, n: number): number {
  if (n <= 0) return -1;
  switch (key) {
    case 'ArrowRight': return (i + 1) % n;
    case 'ArrowLeft': return (i - 1 + n) % n;
    case 'Home': return 0;
    case 'End': return n - 1;
    default: return -1;
  }
}

/** Local HH:MM:SS for the Times column. */
export function hhmmss(ts: number): string {
  const d = new Date(ts), p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** The lines matching a search (case-insensitive substring of the plain text); all of them for an empty query. */
export function filterLines(lines: FeedLineView[], q: string): FeedLineView[] {
  const needle = q.trim().toLowerCase();
  return needle ? lines.filter((l) => l.text.toLowerCase().includes(needle)) : lines;
}

/** A tab's unread badge: none on the selected tab. */
export const unreadOf = (view: FeedsView | null, label: string, sel: string): number => (label !== sel ? view?.unread[label] ?? 0 : 0);

/** The tab's accessible name, with its unread count. */
export const tabLabel = (label: string, unread: number): string => (unread ? `${label}, ${unread} unread` : label);

/** True when a scroll box is within 24px of its end. */
export const nearEnd = (b: { scrollHeight: number; scrollTop: number; clientHeight: number }): boolean => b.scrollHeight - b.scrollTop - b.clientHeight < 24;

/**
 * The latest pill's counter. Each update gives the selection and the shown lines; a switch of feed resets it
 * (and puts you at the end), otherwise lines newer than the last one seen count while you are scrolled up.
 * Counting by id rather than by length keeps it right once a buffer is at its 500-line cap.
 */
export interface Tail { sel: string; lastId: number; atEnd: boolean; fresh: number }
export const newTail = (): Tail => ({ sel: '', lastId: -Infinity, atEnd: true, fresh: 0 });
export function stepTail(t: Tail, sel: string, shown: FeedLineView[]): Tail {
  const lastId = shown.length ? shown[shown.length - 1].id : t.lastId;
  if (sel !== t.sel) return { sel, lastId, atEnd: true, fresh: 0 };
  if (t.atEnd) return { ...t, lastId, fresh: 0 };
  const added = shown.reduce((n, l) => n + (l.id > t.lastId ? 1 : 0), 0);
  return { ...t, lastId: Math.max(lastId, t.lastId), fresh: t.fresh + added };
}

/** True when any feed holds a line. */
export const hasLines = (view: FeedsView | null): boolean => !!view && Object.values(view.lines).some((ls) => ls.length > 0);

/**
 * Auto-add (R-AUTO-PANELS): call `onFirst(sid)` the first time a feed of a session gets a line. It watches the
 * feeds of every session in `mu.sessions.list()`, re-syncs on a session switch and on any line from a session
 * it has not seen; a session's watch ends once it fired or when the session is gone (checked on every callback too), and a
 * closed session leaves `done` at the next sync. Dispose stops it all.
 */
export function watchFirstLines(mu: Pick<Mu, 'feeds' | 'sessions'>, onFirst: (sid: string) => void): Dispose {
  const watches = new Map<string, Dispose>();
  const done = new Set<string>();
  let alive = true;
  const stop = (sid: string) => { const d = watches.get(sid); watches.delete(sid); d?.(); };
  const isLive = (sid: string) => mu.sessions.list().some((s) => s.id === sid);
  const ensure = (sid: string) => {
    if (!alive || !sid || done.has(sid) || watches.has(sid)) return;
    let ended = false;
    const end = () => { ended = true; stop(sid); };
    // watch() calls back at once with the feeds now, before it has returned its dispose.
    const d = mu.feeds.watch((view) => {
      if (ended) return;
      // A session that closed between syncs: stop here rather than add a panel for it.
      if (!isLive(sid)) { end(); return; }
      if (!hasLines(view)) return;
      done.add(sid);
      onFirst(sid);
      end();
    }, sid);
    if (ended) d(); else watches.set(sid, d);
  };
  const sync = () => {
    const live = new Set(mu.sessions.list().map((s) => s.id));
    for (const sid of [...watches.keys()]) if (!live.has(sid)) stop(sid);
    for (const sid of [...done]) if (!live.has(sid)) done.delete(sid);
    for (const sid of live) ensure(sid);
  };
  sync();
  const offSwitch = mu.sessions.on('switch', (s) => { sync(); if (s) ensure(s.id); });
  const offLine = mu.sessions.on('line', (_l, { sid }) => { if (!done.has(sid) && !watches.has(sid)) ensure(sid); });
  return () => {
    alive = false;
    offSwitch(); offLine();
    for (const sid of [...watches.keys()]) stop(sid);
  };
}
