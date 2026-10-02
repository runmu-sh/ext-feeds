// The pure parts of the Feeds panel, and the auto-add watcher over a fake `mu`.
//   node --experimental-strip-types --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COPY, FEEDS_CSS, SCOPE, filterLines, hasLines, hhmmss, keepSelection, labelsOf, nearEnd, newTail, onFirstLine, pillOf,
  readers, readingOf, soloOf, stepTail, tabLabel, tabTarget, unreadOf,
} from '../src/model.ts';

const line = (id, text) => ({ id, ts: 0, text, spans: [{ text }] });
const view = (lines = {}, unread = {}, labels = Object.keys(lines)) => ({ labels, lines, unread });

test('copy follows the Underspire Feeds view', () => {
  assert.deepEqual(
    [COPY.search, COPY.times, COPY.rules, COPY.popOut, COPY.clear, COPY.addFeed, COPY.empty, COPY.noMatches, COPY.title],
    ['Search', 'Times', 'Rules', 'Pop out', 'Clear', 'Add a feed', 'Empty.', 'No matches.', 'Feeds'],
  );
  assert.equal(COPY.latest(1), '1 new line ↓');
  assert.equal(COPY.latest(3), '3 new lines ↓');
  assert.equal(COPY.confirmClear('OOC'), 'Clear OOC?');
  assert.equal(COPY.popTitle('OOC'), 'Feed: OOC');
  assert.equal(COPY.searchIn('OOC'), 'Search OOC');
  assert.equal(COPY.jumpLatest, 'Jump to the latest line');
});

test('1.2.0 copy: the empty panel explains, the help strip names every tool, Clear says how much goes', () => {
  assert.equal(COPY.introHead, 'No feeds yet');
  assert.match(COPY.introText, /Settings → Feeds/);
  assert.equal(COPY.introSteps.length, 3);
  assert.deepEqual(COPY.helpRows.map(([k]) => k), [COPY.search, COPY.times, COPY.popOut, COPY.rules, COPY.clear]);
  assert.equal(COPY.help, 'Help');
  assert.equal(COPY.confirmClearBody('OOC', 1), '1 line in “OOC” goes away on this device. The rule keeps filling it.');
  assert.equal(COPY.emptyHint('OOC'), 'Lines your rules send to “OOC” will show up here.');
  assert.equal(COPY.tabTip('OOC', 2), 'OOC · 2 lines · double-click to pop out');
});

test('every CSS rule is scoped to .ext-panel[data-ext="feeds"] .mu-feeds, tokens only, no radius', () => {
  assert.equal(SCOPE, '.ext-panel[data-ext="feeds"]');
  for (const r of FEEDS_CSS.split('\n')) {
    const body = r.startsWith('@') ? r.slice(r.indexOf('{') + 1, r.lastIndexOf('}')).trim() : r;
    for (const rule of body.split('}')) { if (!rule.trim()) continue; for (const part of rule.slice(0, rule.indexOf('{')).split(',')) assert.ok(part.trim().startsWith(`${SCOPE} .mu-feeds`), part); }
  }
  assert.doesNotMatch(FEEDS_CSS, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  assert.doesNotMatch(FEEDS_CSS, /border-radius:\s*[1-9]/);
  // only colour transitions
  for (const m of FEEDS_CSS.matchAll(/transition:([^;]+);/g)) for (const t of m[1].split(',')) assert.match(t.trim(), /^(color|background-color) \.12s/);
});

test('tabTarget: arrows wrap, Home and End, other keys ignored', () => {
  assert.equal(tabTarget('ArrowRight', 0, 3), 1);
  assert.equal(tabTarget('ArrowRight', 2, 3), 0);
  assert.equal(tabTarget('ArrowLeft', 0, 3), 2);
  assert.equal(tabTarget('Home', 2, 3), 0);
  assert.equal(tabTarget('End', 0, 3), 2);
  assert.equal(tabTarget('Enter', 0, 3), -1);
  assert.equal(tabTarget('ArrowRight', 0, 0), -1);
});

test('solo mode, labels and selection', () => {
  assert.equal(soloOf({ feed: 'OOC' }), 'OOC');
  assert.equal(soloOf({ feed: 3 }), '');
  assert.equal(soloOf(undefined), '');
  const v = view({ OOC: [], Tells: [line(1, 'x')] });
  assert.deepEqual(labelsOf(v, ''), ['OOC', 'Tells']);
  assert.deepEqual(labelsOf(v, 'Tells'), ['Tells']);
  assert.deepEqual(labelsOf(null, ''), []);
  assert.equal(keepSelection(['a', 'b'], 'b'), 'b');
  assert.equal(keepSelection(['a', 'b'], 'gone'), 'a');
  assert.equal(keepSelection([], 'a'), '');
});

test('unread badges skip the selected tab; the tab name carries the count', () => {
  const v = view({ a: [], b: [] }, { a: 2, b: 5 });
  assert.equal(unreadOf(v, 'a', 'b'), 2);
  assert.equal(unreadOf(v, 'b', 'b'), 0);
  assert.equal(unreadOf(null, 'a', ''), 0);
  assert.equal(tabLabel('a', 2), 'a, 2 unread');
  assert.equal(tabLabel('a', 0), 'a');
});

test('search filters case-insensitively on the plain text', () => {
  const ls = [line(1, 'Bob says hi'), line(2, 'Ann waves')];
  assert.deepEqual(filterLines(ls, '  BOB ').map((l) => l.id), [1]);
  assert.equal(filterLines(ls, '').length, 2);
  assert.equal(filterLines(ls, 'zzz').length, 0);
});

test('hhmmss pads local time', () => {
  const d = new Date(2026, 0, 1, 3, 4, 5);
  assert.equal(hhmmss(d.getTime()), '03:04:05');
});

test('nearEnd within 24px', () => {
  assert.equal(nearEnd({ scrollHeight: 1000, scrollTop: 790, clientHeight: 200 }), true);
  assert.equal(nearEnd({ scrollHeight: 1000, scrollTop: 700, clientHeight: 200 }), false);
});

test('latest pill: counts new lines while scrolled up, resets on switch and at the end', () => {
  let t = stepTail(newTail(), 'a', [line(1, 'x'), line(2, 'y')]);
  assert.deepEqual([t.atEnd, t.fresh, t.lastId], [true, 0, 2]);
  t = { ...t, atEnd: false };
  t = stepTail(t, 'a', [line(1, 'x'), line(2, 'y'), line(3, 'z')]);
  assert.equal(t.fresh, 1);
  // at the 500 cap the oldest drops while a new one arrives: still one new line
  t = stepTail(t, 'a', [line(2, 'y'), line(3, 'z'), line(4, 'w')]);
  assert.equal(t.fresh, 2);
  t = stepTail(t, 'b', [line(9, 'q')]);
  assert.deepEqual([t.atEnd, t.fresh, t.sel], [true, 0, 'b']);
  t = stepTail(t, 'b', [line(9, 'q'), line(10, 'r')]);
  assert.equal(t.fresh, 0);
});

test('hasLines', () => {
  assert.equal(hasLines(null), false);
  assert.equal(hasLines(view({ a: [] })), false);
  assert.equal(hasLines(view({ a: [], b: [line(1, 'x')] })), true);
});

test('pill: none at the end, the count with news, a quiet arrow without', () => {
  assert.equal(pillOf({ ...newTail(), atEnd: true, fresh: 3 }), null);
  assert.deepEqual(pillOf({ ...newTail(), atEnd: false, fresh: 2 }), { quiet: false, text: '2 new lines ↓' });
  assert.deepEqual(pillOf({ ...newTail(), atEnd: false, fresh: 0 }), { quiet: true, text: '↓' });
});

test('readingOf: the selected feed only while at its end', () => {
  assert.equal(readingOf('OOC', true), 'OOC');
  assert.equal(readingOf('OOC', false), null);
  assert.equal(readingOf('', true), null);
});

test('readers: the host is told the latest feed still read, per session; re-sent to mark new lines read', () => {
  const told = [];
  const r = readers((label, sid) => told.push([sid, label]));
  r.set('s1', 'main', 'OOC');
  assert.deepEqual(told, [['s1', 'OOC']]);
  r.set('s1', 'main', 'OOC'); // a new line arrived while at the end: marks it read again
  assert.deepEqual(told.at(-1), ['s1', 'OOC']);
  assert.equal(told.length, 2);
  r.set('s1', 'pop:Tells', 'Tells'); // a pop-out at the end of another feed
  assert.equal(r.current('s1'), 'Tells');
  r.set('s1', 'pop:Tells', null); // the pop-out scrolls up: back to what the main panel reads
  assert.equal(r.current('s1'), 'OOC');
  assert.deepEqual(told.at(-1), ['s1', 'OOC']);
  r.set('s1', 'main', null); // the main panel scrolls up too: nothing
  assert.deepEqual(told.at(-1), ['s1', null]);
  const n = told.length;
  r.set('s1', 'main', null); // still nothing: not repeated
  assert.equal(told.length, n);
  r.set('s1', 'main', 'OOC');
  r.drop('s1', 'main'); // panel closed
  assert.deepEqual(told.at(-1), ['s1', null]);
  r.set('s2', 'main', 'X');
  assert.deepEqual(told.at(-1), ['s2', 'X']);
  assert.equal(r.current('s1'), '');
  r.forget('s2');
  assert.equal(r.current('s2'), '');
  r.drop('s2', 'main'); // forgotten: nothing told
  assert.deepEqual(told.at(-1), ['s2', 'X']);
});

/** A fake mu with sessions.each and feeds.watch; `push(sid, label, line)` notifies that session's watchers. */
function fakeMu(sids) {
  const sessions = sids.map((id) => ({ id, worldId: 'w', worldName: 'W', state: 'connected' }));
  const data = new Map(), watchers = new Map(), each = new Set();
  const get = (sid) => data.get(sid) ?? view({});
  const mu = {
    sessions: {
      each(setup) {
        const rec = { setup, cleanups: new Map() };
        each.add(rec);
        for (const s of sessions) { const d = setup(s); if (d) rec.cleanups.set(s.id, d); }
        return () => { each.delete(rec); for (const d of rec.cleanups.values()) d(); };
      },
    },
    feeds: {
      watch(fn, sid) {
        const set = watchers.get(sid) ?? new Set(); watchers.set(sid, set); set.add(fn);
        fn(get(sid));
        return () => set.delete(fn);
      },
    },
  };
  return {
    mu,
    live: () => [...watchers.values()].reduce((n, s) => n + s.size, 0),
    each: () => each.size,
    push(sid, label, l) {
      const v = get(sid); data.set(sid, view({ ...v.lines, [label]: [...(v.lines[label] ?? []), l] }));
      for (const fn of [...(watchers.get(sid) ?? [])]) fn(get(sid));
    },
    preload(sid, label, l) { data.set(sid, view({ [label]: [l] })); },
    open(id) {
      const s = { id, worldId: 'w', worldName: 'W', state: 'connected' }; sessions.push(s);
      for (const rec of each) { const d = rec.setup(s); if (d) rec.cleanups.set(id, d); }
    },
    close(id) {
      sessions.splice(sessions.findIndex((s) => s.id === id), 1);
      for (const rec of each) { rec.cleanups.get(id)?.(); rec.cleanups.delete(id); }
    },
  };
}

test('onFirstLine fires once per session on its first feed line', () => {
  const f = fakeMu(['s1', 's2']);
  const hits = [];
  const off = onFirstLine(f.mu, (sid) => hits.push(sid));
  assert.equal(f.live(), 2);
  f.push('s2', 'OOC', line(1, 'a'));
  f.push('s2', 'OOC', line(2, 'b'));
  assert.deepEqual(hits, ['s2']);
  assert.equal(f.live(), 1, 's2 stops watching once fired');
  f.push('s1', 'Tells', line(1, 'c'));
  assert.deepEqual(hits, ['s2', 's1']);
  assert.equal(f.live(), 0);
  off();
  assert.equal(f.each(), 0);
});

test('onFirstLine: a session that already has lines fires at once, without leaking the watch', () => {
  const f = fakeMu(['s1']);
  f.preload('s1', 'OOC', line(1, 'a'));
  const hits = [];
  const off = onFirstLine(f.mu, (sid) => hits.push(sid));
  assert.deepEqual(hits, ['s1']);
  assert.equal(f.live(), 0);
  off();
});

test('onFirstLine: sessions opening later are watched, closed ones released, a returning one fires again', () => {
  const f = fakeMu(['s1']);
  const hits = [];
  const off = onFirstLine(f.mu, (sid) => hits.push(sid));
  f.open('s2');
  assert.equal(f.live(), 2);
  f.close('s1');
  assert.equal(f.live(), 1, 'closed session released');
  f.push('s2', 'X', line(1, 'a'));
  assert.deepEqual(hits, ['s2']);
  f.close('s2'); f.open('s2');
  f.push('s2', 'X', line(2, 'b'));
  assert.deepEqual(hits, ['s2', 's2']);
  off();
  assert.equal(f.live(), 0);
});
