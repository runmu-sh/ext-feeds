// The pure parts of the Feeds panel, and the auto-add watcher over a fake `mu`.
//   node --experimental-strip-types --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COPY, FEEDS_CSS, filterLines, hasLines, hhmmss, keepSelection, labelsOf, nearEnd, newTail, soloOf, stepTail,
  tabLabel, tabTarget, unreadOf, watchFirstLines,
} from '../src/model.ts';

const line = (id, text) => ({ id, ts: 0, text, spans: [{ text }] });
const view = (lines = {}, unread = {}, labels = Object.keys(lines)) => ({ labels, lines, unread });

test('copy is the Feeds panel part of rules/copy.ts', () => {
  assert.deepEqual(
    [COPY.search, COPY.times, COPY.rules, COPY.popOut, COPY.clear, COPY.addFeed, COPY.empty, COPY.noMatches],
    ['Search', 'Times', 'Rules', 'Pop out', 'Clear', 'Add a feed', 'Empty.', 'No matches.'],
  );
  assert.equal(COPY.latest(1), '1 new line ↓');
  assert.equal(COPY.latest(3), '3 new lines ↓');
  assert.equal(COPY.confirmClear('OOC'), 'Clear OOC?');
});

test('every CSS rule sits under .mu-feeds and uses tokens only', () => {
  const rules = FEEDS_CSS.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const r of rules) assert.match(r, /^\.mu-feeds[ .{:]/, r);
  assert.doesNotMatch(FEEDS_CSS, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
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

/** A fake mu with sessions and feeds; `push(sid, label, line)` notifies that session's watchers. */
function fakeMu(sids) {
  const sessions = sids.map((id) => ({ id, worldId: 'w', worldName: 'W', state: 'connected' }));
  const data = new Map(), watchers = new Map(), on = { switch: new Set(), line: new Set() };
  const get = (sid) => data.get(sid) ?? view({});
  const mu = {
    sessions: {
      list: () => [...sessions],
      on: (ev, fn) => { on[ev].add(fn); return () => on[ev].delete(fn); },
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
    mu, sessions, on,
    live: () => [...watchers.values()].reduce((n, s) => n + s.size, 0),
    push(sid, label, l) {
      const v = get(sid); data.set(sid, view({ ...v.lines, [label]: [...(v.lines[label] ?? []), l] }));
      for (const fn of watchers.get(sid) ?? []) fn(get(sid));
    },
    preload(sid, label, l) { data.set(sid, view({ [label]: [l] })); },
  };
}

test('auto-add fires once per session on its first feed line', () => {
  const f = fakeMu(['s1', 's2']);
  const hits = [];
  const off = watchFirstLines(f.mu, (sid) => hits.push(sid));
  assert.equal(f.live(), 2);
  f.push('s2', 'OOC', line(1, 'a'));
  f.push('s2', 'OOC', line(2, 'b'));
  assert.deepEqual(hits, ['s2']);
  assert.equal(f.live(), 1, 's2 stops watching once fired');
  f.push('s1', 'Tells', line(1, 'c'));
  assert.deepEqual(hits, ['s2', 's1']);
  assert.equal(f.live(), 0);
  off();
  assert.equal(f.on.switch.size + f.on.line.size, 0);
});

test('auto-add: a session that already has lines fires at once, without leaking the watch', () => {
  const f = fakeMu(['s1']);
  f.preload('s1', 'OOC', line(1, 'a'));
  const hits = [];
  const off = watchFirstLines(f.mu, (sid) => hits.push(sid));
  assert.deepEqual(hits, ['s1']);
  assert.equal(f.live(), 0);
  off();
});

test('auto-add picks up new sessions on switch and on their first line, and drops closed ones', () => {
  const f = fakeMu(['s1']);
  const hits = [];
  const off = watchFirstLines(f.mu, (sid) => hits.push(sid));
  f.sessions.push({ id: 's2', worldId: 'w', worldName: 'W', state: 'connected' });
  for (const fn of f.on.switch) fn(f.sessions[1]);
  assert.equal(f.live(), 2);
  f.sessions.push({ id: 's3', worldId: 'w', worldName: 'W', state: 'connected' });
  for (const fn of f.on.line) fn({}, { sid: 's3' });
  assert.equal(f.live(), 3);
  f.sessions.splice(0, 1); // s1 closed
  for (const fn of f.on.switch) fn(f.sessions[0]);
  assert.equal(f.live(), 2);
  f.push('s3', 'X', line(1, 'a'));
  assert.deepEqual(hits, ['s3']);
  off();
  assert.equal(f.live(), 0);
  assert.equal(f.on.switch.size + f.on.line.size, 0);
});

test('auto-add: a session gone before its first line stops in the callback and never fires', () => {
  const f = fakeMu(['s1', 's2']);
  const hits = [];
  const off = watchFirstLines(f.mu, (sid) => hits.push(sid));
  assert.equal(f.live(), 2);
  f.sessions.splice(0, 1); // s1 closed, no switch or sync yet
  f.push('s1', 'OOC', line(1, 'late'));
  assert.deepEqual(hits, [], 'no panel for a dead session');
  assert.equal(f.live(), 1, 's1 stopped from its own callback');
  f.push('s2', 'OOC', line(1, 'a'));
  assert.deepEqual(hits, ['s2']);
  off();
});

test('auto-add: a dead session at watch time is not kept, and sync forgets closed sessions', () => {
  const f = fakeMu(['s1']);
  const hits = [];
  const off = watchFirstLines(f.mu, (sid) => hits.push(sid));
  // A line from a session that is not (or no longer) in the list: the immediate callback ends the watch.
  for (const fn of f.on.line) fn({}, { sid: 'ghost' });
  assert.equal(f.live(), 1);
  f.push('s1', 'OOC', line(1, 'a'));
  assert.deepEqual(hits, ['s1']);
  // s1 closes and the same id comes back (a reconnect reusing it): it is a new session and fires again.
  f.sessions.splice(0, 1);
  for (const fn of f.on.switch) fn(null);
  f.sessions.push({ id: 's1', worldId: 'w', worldName: 'W', state: 'connected' });
  for (const fn of f.on.switch) fn(f.sessions[0]);
  assert.deepEqual(hits, ['s1', 's1'], 'done was cleared for the closed session');
  off();
  assert.equal(f.live(), 0);
});
