// The extension's own feed buffers (src/store.ts) over a fake `mu.settings`.
//   node --experimental-strip-types --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEED_CAP, createStore, ruleTargets } from '../src/store.ts';

const line = (id, text = `l${id}`) => ({ id, ts: 0, text, spans: [{ text }] });

/** `mu.settings` with per-world `routes`; sids map to worlds through `worldOf`. */
function fakeMu(routes = {}, worldOf = { s1: 'w1', s2: 'w2' }) {
  const watchers = new Set();
  const worldAt = (at) => (typeof at === 'object' && at ? at.worldId ?? worldOf[at.sid] : at);
  return {
    calls: [],
    watchers,
    settings: {
      get(key, at) { this._mu.calls.push([key, at]); return key === 'routes' ? routes[worldAt(at)] ?? [] : undefined; },
      watch(key, fn, opts) { const w = { key, fn, world: worldAt(opts) }; watchers.add(w); fn(routes[w.world] ?? [], { replay: true }); return () => watchers.delete(w); },
    },
    setRoutes(world, rules) { routes[world] = rules; for (const w of [...watchers]) if (w.world === world) w.fn(rules, { replay: false }); },
  };
}
const mk = (...a) => { const mu = fakeMu(...a); mu.settings._mu = mu; return { mu, store: createStore(mu) }; };

test('deliver appends per session and target, oldest first', () => {
  const { store } = mk();
  store.deliver('OOC', line(1), { sid: 's1' });
  store.deliver('OOC', line(2), { sid: 's1' });
  store.deliver('Tells', line(3), { sid: 's1' });
  store.deliver('OOC', line(4), { sid: 's2' });
  assert.deepEqual(store.get('s1').lines.OOC.map((l) => l.id), [1, 2]);
  assert.deepEqual(store.get('s1').lines.Tells.map((l) => l.id), [3]);
  assert.deepEqual(store.get('s2').lines.OOC.map((l) => l.id), [4]);
});

test(`a feed keeps its last ${FEED_CAP} lines`, () => {
  const { store } = mk();
  assert.equal(FEED_CAP, 500);
  for (let i = 1; i <= 503; i++) store.deliver('OOC', line(i), { sid: 's1' });
  const ls = store.get('s1').lines.OOC;
  assert.equal(ls.length, 500);
  assert.equal(ls[0].id, 4);
  assert.equal(ls.at(-1).id, 503);
  assert.equal(store.get('s1').unread.OOC, 503);
});

test('unread counts lines unless that feed is being viewed; viewing marks read; null stops viewing', () => {
  const { store } = mk();
  store.deliver('OOC', line(1), { sid: 's1' });
  store.deliver('OOC', line(2), { sid: 's1' });
  assert.equal(store.get('s1').unread.OOC, 2);
  store.viewing('OOC', 's1');
  assert.equal(store.get('s1').unread.OOC, 0);
  store.deliver('OOC', line(3), { sid: 's1' });
  store.deliver('Tells', line(4), { sid: 's1' });
  assert.deepEqual(store.get('s1').unread, { OOC: 0, Tells: 1 });
  store.viewing(null, 's1');
  store.deliver('OOC', line(5), { sid: 's1' });
  assert.equal(store.get('s1').unread.OOC, 1);
  // Viewing is per session.
  store.viewing('OOC', 's2');
  store.deliver('OOC', line(6), { sid: 's1' });
  assert.equal(store.get('s1').unread.OOC, 2);
});

test('clear empties a feed and its unread; forget drops the session', () => {
  const { store } = mk();
  store.deliver('OOC', line(1), { sid: 's1' });
  store.deliver('Tells', line(2), { sid: 's1' });
  store.clear('OOC', 's1');
  assert.deepEqual(store.get('s1').lines.OOC, []);
  assert.equal(store.get('s1').unread.OOC, 0);
  assert.deepEqual(store.get('s1').labels, ['Tells']);
  store.forget('s1');
  assert.deepEqual(store.get('s1'), { labels: [], lines: {}, unread: {} });
});

test('labels: enabled rule targets for the session\'s world in rule order, then other feeds holding lines', () => {
  const { mu, store } = mk({
    w1: [
      { id: 'a', pattern: 'x', target: 'Tells' },
      { id: 'b', pattern: 'y', target: 'Off', enabled: false },
      { id: 'c', pattern: 'z', target: ' OOC ' },
      { id: 'd', pattern: 'q', target: 'Tells' },
      { id: 'e', pattern: 'r', target: '' },
    ],
    w2: [{ id: 'f', pattern: 'x', target: 'Combat' }],
  });
  assert.deepEqual(store.labelsFor('s1'), ['Tells', 'OOC']);
  assert.deepEqual(store.labelsFor('s2'), ['Combat']);
  store.deliver('Spam', line(1), { sid: 's1', worldId: 'w1' });
  store.deliver('OOC', line(2), { sid: 's1', worldId: 'w1' });
  store.deliver('Off', line(3), { sid: 's1', worldId: 'w1' });
  assert.deepEqual(store.labelsFor('s1'), ['Tells', 'OOC', 'Spam', 'Off']);
  assert.deepEqual(store.get('s1').labels, ['Tells', 'OOC', 'Spam', 'Off']);
  // Read with the world the router named.
  assert.deepEqual(mu.calls.at(-1), ['routes', { worldId: 'w1' }]);
});

test('ruleTargets tolerates junk', () => {
  assert.deepEqual(ruleTargets(null), []);
  assert.deepEqual(ruleTargets([null, 3, { target: 7 }, { target: 'A' }]), ['A']);
});

test('watch fires at once, on every change and on a rule change; dispose stops it', () => {
  const { mu, store } = mk({ w1: [{ id: 'a', pattern: 'x', target: 'Tells' }] });
  const seen = [];
  const off = store.watch('s1', (v) => seen.push(v));
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], { labels: ['Tells'], lines: {}, unread: {} });
  store.deliver('Tells', line(1), { sid: 's1', worldId: 'w1' });
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1].lines.Tells.map((l) => l.id), [1]);
  assert.equal(seen[1].unread.Tells, 1);
  store.viewing('Tells', 's1');
  assert.equal(seen.at(-1).unread.Tells, 0);
  const n = seen.length;
  mu.setRoutes('w1', [{ id: 'b', pattern: 'y', target: 'OOC' }]);
  assert.equal(seen.length, n + 1);
  assert.deepEqual(seen.at(-1).labels, ['OOC', 'Tells']);
  // Another session's lines do not fire it.
  store.deliver('Tells', line(2), { sid: 's2' });
  assert.equal(seen.length, n + 1);
  off();
  assert.equal(mu.watchers.size, 0);
  store.deliver('Tells', line(3), { sid: 's1' });
  assert.equal(seen.length, n + 1);
});

test('a snapshot handed to a watcher is not mutated by later lines', () => {
  const { store } = mk();
  let last;
  store.watch('s1', (v) => { last = v; });
  store.deliver('OOC', line(1), { sid: 's1' });
  const snap = last;
  store.deliver('OOC', line(2), { sid: 's1' });
  assert.equal(snap.lines.OOC.length, 1);
  assert.equal(last.lines.OOC.length, 2);
});
