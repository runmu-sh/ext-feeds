/**
 * The pure parts of the Feeds panel: copy, CSS, tab keys, timestamps, search, the latest pill, what the panel
 * tells the host it is reading, and the first-line watcher. No Vue and no DOM here, so tests/*.test.mjs import
 * this file directly.
 */
import type { Dispose, FeedLineView, FeedsView, Mu } from '@muclient/sdk';

/** Visible copy. */
export const COPY = {
  search: 'Search', times: 'Times', rules: 'Rules', popOut: 'Pop out', clear: 'Clear', help: 'Help', addFeed: 'Add a feed',
  empty: 'Empty.', noMatches: 'No matches.',
  title: 'Feeds', feedTitle: 'Feed',
  /** The popped-out feed's tab. */
  popTitle: (label: string) => `Feed: ${label}`,
  confirmClear: (label: string) => `Clear ${label}?`,
  confirmClearBody: (label: string, n: number) => `${n} line${n === 1 ? '' : 's'} in “${label}” ${n === 1 ? 'goes' : 'go'} away on this device. The rule keeps filling it.`,
  searchIn: (label: string) => `Search ${label}`,
  latest: (n: number) => `${n} new line${n === 1 ? '' : 's'} ↓`,
  jumpLatest: 'Jump to the latest line',
  /** The empty panel: what a feed is and how to get one. */
  introHead: 'No feeds yet',
  introText: 'A feed is a side channel of the terminal. A rule in Settings → Feeds watches the game\'s output for a word or a /regex/ and copies or moves each matching line into a feed of your choosing. Every feed gets a tab here.',
  introSteps: ['Open Settings → Feeds (or press Add a feed).', 'Add a rule: what to match, and the feed it goes to.', 'Lines land here as the game sends them.'],
  /** Under “Empty.” in a feed that has no lines yet. */
  emptyHint: (label: string) => `Lines your rules send to “${label}” will show up here.`,
  /** The help strip. */
  helpTitle: 'About feeds',
  helpRows: [
    ['Search', 'filter this feed; Esc closes'],
    ['Times', 'show when each line arrived'],
    ['Pop out', 'this feed in its own panel (or double-click its tab)'],
    ['Rules', 'edit what goes where (Settings → Feeds)'],
    ['Clear', 'empty this feed on this device'],
  ] as Array<[string, string]>,
  helpNote: 'Feeds are kept per session, up to 500 lines each. A badge counts lines you have not seen; keyboard: ← → Home End move between tabs, F6 reaches the lines.',
  tabTip: (label: string, n: number) => `${label} · ${n} line${n === 1 ? '' : 's'} · double-click to pop out`,
  lineCount: (n: number) => `${n} line${n === 1 ? '' : 's'}`,
};

/** Every rule is scoped to this extension's panels (`mu.ui.style` puts them in `@layer ext.feeds`). */
export const SCOPE = '.ext-panel[data-ext="feeds"]';

/** Tokens only (style bible). Controls are the host's `sh-*` primitives; this is the layout around them. */
export const FEEDS_CSS = [
  '.mu-feeds { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-elev); container-type: inline-size; }',
  // The bar: tabs left, tools right, wrapping onto two rows in a narrow dock.
  '.mu-feeds .fbar { display: flex; flex-wrap: wrap; align-items: center; column-gap: 6px; row-gap: 2px; padding: 4px 8px; border-bottom: 1px solid var(--accent); flex: 0 0 auto; }',
  '.mu-feeds .ftabs { display: flex; gap: 2px; flex-wrap: wrap; flex: 1 1 auto; min-width: 0; }',
  '.mu-feeds .solo { flex: 1; min-width: 0; color: var(--accent-bright); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.mu-feeds .ftab { display: inline-flex; align-items: center; gap: .6ch; background: none; border: 0; border-radius: 0; color: var(--fg-dim); font-family: inherit; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 2px .8ch; min-height: 24px; max-width: 18ch; cursor: pointer; transition: color .12s ease, background-color .12s ease; }',
  '.mu-feeds .ftab .fname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
  '.mu-feeds .ftab:hover { color: var(--fg); background: var(--tint-toggle); }',
  '.mu-feeds .ftab.on { color: var(--bg-deep); background: var(--accent); }',
  '.mu-feeds .ftab.unread:not(.on) { color: var(--fg); }',
  '.mu-feeds .tools { display: flex; flex-wrap: wrap; gap: 2px; flex: 0 1 auto; margin-left: auto; }',
  // Search strip and the help strip sit under the bar.
  '.mu-feeds .fsearch { display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-bottom: 1px solid var(--border); flex: 0 0 auto; }',
  '.mu-feeds .fsearch input { flex: 1; min-width: 0; }',
  '.mu-feeds .cnt { color: var(--fg-dim); font-size: .72rem; white-space: nowrap; }',
  '.mu-feeds .fhelp { padding: 6px 10px 8px; border-bottom: 1px solid var(--border); background: var(--bg); color: var(--fg-dim); font-size: .74rem; line-height: 1.5; flex: 0 0 auto; }',
  '.mu-feeds .fhelp dl { display: grid; grid-template-columns: max-content 1fr; gap: 1px 1.2ch; margin: 0 0 4px; }',
  '.mu-feeds .fhelp dt { color: var(--accent-bright); font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; align-self: baseline; padding-top: .15em; }',
  '.mu-feeds .fhelp dd { margin: 0; }',
  '.mu-feeds .fhelp p { margin: 0; color: var(--fg-faint); font-size: .7rem; }',
  // The lines.
  '.mu-feeds .lines-wrap { position: relative; flex: 1; min-height: 0; display: flex; }',
  '.mu-feeds .flines { flex: 1; overflow-y: auto; padding: 6px 10px; line-height: var(--shell-line-height, 1.5); outline-offset: -2px; }',
  '.mu-feeds .fline { white-space: pre-wrap; word-break: break-word; padding: 0 4px; margin: 0 -4px; transition: background-color .12s ease; }',
  '.mu-feeds .fline:hover { background: var(--tint-row); }',
  '.mu-feeds .ts { color: var(--fg-faint); margin-right: .8ch; font-size: .82em; user-select: none; }',
  '.mu-feeds .fempty { padding: 10px 0 2px; margin: 0; color: var(--fg-faint); font-style: normal; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }',
  '.mu-feeds .fempty-hint { margin: 0; color: var(--fg-faint); font-size: .74rem; line-height: 1.5; }',
  '.mu-feeds .latest { position: absolute; right: 14px; bottom: 10px; z-index: 5; background: var(--accent); border: 0; border-radius: 0; color: var(--bg-deep); font-family: inherit; font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 3px 10px; min-height: 24px; cursor: pointer; transition: background-color .12s ease; }',
  '.mu-feeds .latest.quiet { padding: 3px 7px; }',
  '.mu-feeds .latest:hover { background: var(--accent-bright); }',
  // The empty panel: an explanation and the way in, not a lone button.
  '.mu-feeds .intro { padding: 12px 14px; color: var(--fg-dim); font-size: .8rem; line-height: 1.5; max-width: 60ch; }',
  '.mu-feeds .intro .ihead { margin: 0 0 6px; color: var(--fg-faint); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }',
  '.mu-feeds .intro p { margin: 0 0 8px; }',
  '.mu-feeds .intro ol { margin: 0 0 10px; padding-left: 2.4ch; color: var(--fg-dim); }',
  '.mu-feeds .intro li { margin: 0 0 2px; }',
  '.mu-feeds .intro li::marker { color: var(--accent); }',
  '.mu-feeds .intro .make { margin-left: -.5ch; }',
  // A narrow dock: the tabs take the first row, the tools the second.
  '@container (max-width: 560px) { .mu-feeds .ftabs { flex-basis: 100%; } .mu-feeds .tools { margin-left: 0; } }',
  '@media (max-width: 420px) { .mu-feeds .ftab, .mu-feeds .latest { min-height: 32px; } }',
].map((r) => (r.startsWith('@') ? r.replace(/\.mu-feeds/g, `${SCOPE} .mu-feeds`) : `${SCOPE} ${r}`)).join('\n');

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
 * What the panel tells the host it is reading (`mu.feeds.viewing`): the selected feed while you are at its end,
 * nothing while you are scrolled up. Lines arriving in a feed you have scrolled away from then count as unread, and
 * reaching the end again marks them read.
 */
export const readingOf = (sel: string, atEnd: boolean): string | null => (sel && atEnd ? sel : null);

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

/** The pill: none at the end, "N new lines ↓" with news, a quiet ↓ while scrolled up without news. */
export const pillOf = (t: Tail): null | { quiet: boolean; text: string } =>
  (t.atEnd ? null : t.fresh > 0 ? { quiet: false, text: COPY.latest(t.fresh) } : { quiet: true, text: '↓' });

/**
 * The feeds a session's panels are reading. The host keeps one `viewing` label per session, but the tabbed panel and
 * any number of pop-outs can each be at the end of a different feed. Each panel reports its own reading
 * ({@link readingOf}) under its own key; the host is told the latest one that is still being read (which also marks
 * it read), and nothing once no panel reads any. `drop` forgets a panel; `forget` a whole session.
 */
export interface Readers {
  set(sid: string, key: string, label: string | null): void;
  drop(sid: string, key: string): void;
  forget(sid: string): void;
  /** What the host was last told for `sid` ('' for nothing). */
  current(sid: string): string;
}
export function readers(viewing: (label: string | null, sid: string) => void): Readers {
  const per = new Map<string, { by: Map<string, string | null>; cur: string }>();
  const settle = (sid: string, want: string | null) => {
    const s = per.get(sid);
    if (!s) return;
    let next = want ?? '';
    if (!next) {
      // The one told before, if a panel still reads it; else the last panel still reading anything.
      const held = [...s.by.values()].filter((l): l is string => !!l);
      next = held.includes(s.cur) ? s.cur : held[held.length - 1] ?? '';
    }
    // A label is re-sent even when unchanged: that marks lines that just arrived there read.
    if (next !== s.cur || (want && next)) { s.cur = next; viewing(next || null, sid); }
  };
  return {
    set(sid, key, label) {
      const s = per.get(sid) ?? per.set(sid, { by: new Map(), cur: '' }).get(sid)!;
      s.by.delete(key); s.by.set(key, label || null); // re-insert: latest last
      settle(sid, label || null);
    },
    drop(sid, key) { const s = per.get(sid); if (s?.by.delete(key)) settle(sid, null); },
    forget(sid) { per.delete(sid); },
    current: (sid) => per.get(sid)?.cur ?? '',
  };
}

/** True when any feed holds a line. */
export const hasLines = (view: FeedsView | null): boolean => !!view && Object.values(view.lines).some((ls) => ls.length > 0);

/**
 * Call `onFirst(sid)` once per in-scope session, the first time one of its feeds holds a line (at once for a session
 * that already has lines). Built on `mu.sessions.each`: the host runs it for every session in scope and disposes a
 * session's watch when it leaves scope; a session that comes back is a new session and fires again.
 */
export function onFirstLine(mu: Pick<Mu, 'feeds' | 'sessions'>, onFirst: (sid: string) => void): Dispose {
  return mu.sessions.each((s) => {
    let done = false, off: Dispose | null = null;
    const stop = () => { const d = off; off = null; d?.(); };
    // watch() calls back at once with the feeds now, before it has returned its dispose.
    const d = mu.feeds.watch((view) => {
      if (done || !hasLines(view)) return;
      done = true;
      onFirst(s.id);
      stop();
    }, s.id);
    if (done) d(); else off = d;
    return stop;
  });
}
