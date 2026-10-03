// 2.2.0: a rule change re-runs the rules over the lines the client holds (SDK 1.15 `mu.lines.query`), in the
// headless host from @runmu.sh/dev/test. The store tests drive src/store.ts over the dev host's `mu` (its settings,
// its held lines and its matcher); the host tests load the whole extension.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '@runmu.sh/dev/test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { FEED_CAP, REBUILD_MS, createStore } from '../src/store.ts';

GlobalRegistrator.register();
after(() => GlobalRegistrator.unregister());

const rx = (id, re, target, more = {}) => ({ id, pattern: `/${re}/`, target, ...more });
const txt = (id, text, target, more = {}) => ({ id, pattern: text, target, ...more });
const wait = (ms = REBUILD_MS + 60) => new Promise((r) => setTimeout(r, ms));
const ids = (ls) => (ls ?? []).map((l) => l.text);

/** The store over the dev host's `mu`, attached to s1 as src/index.ts does, with some held chat. */
function setup(rules = [], lines = ['[vox] Ann: hi', 'Bob says, "hello"', '[vox] Cy: yo', 'You hit the rat.']) {
  const host = createHost({ settings: { routes: rules } });
  const store = createStore(host.mu);
  const off = store.attach('s1', 'w1');
  for (const l of lines) host.line('s1', l);
  const setRules = (r) => host.mu.settings.set('routes', r);
  return { host, store, off, setRules };
}

test('a new (.+) regex rule fills its feed with the earlier lines, in order, and keeps their spans', () => {
  const { host, store, setRules } = setup();
  assert.deepEqual(store.get('s1').lines, {});
  setRules([rx('a', '(.+)', 'all')]);
  assert.deepEqual(store.get('s1').labels, ['all'], 'the tab shows at once');
  store.flush();
  assert.deepEqual(ids(store.get('s1').lines.all), ['[vox] Ann: hi', 'Bob says, "hello"', '[vox] Cy: yo', 'You hit the rat.']);
  assert.deepEqual(store.get('s1').lines.all[0].spans, [{ text: '[vox] Ann: hi' }]);
  // Later lines follow on as before.
  store.deliver('all', { id: 99, ts: Date.now() + 5, text: 'later', spans: [{ text: 'later', cls: 'c-003' }] }, { sid: 's1', worldId: 'w1', rule: 'a' });
  assert.deepEqual(ids(store.get('s1').lines.all).slice(-2), ['You hit the rat.', 'later']);
  assert.equal(host.errors.length, 0);
});

test('the rebuild waits for the edits to settle (debounced), then runs once', async () => {
  const { host, store, setRules } = setup();
  const q0 = host.mu.lines.query;
  let queries = 0;
  host.mu.lines.query = (...a) => { queries++; return q0(...a); };
  for (const p of ['v', 'vo', 'vox']) setRules([txt('a', p, 'vox')]);
  assert.equal(queries, 0);
  await wait();
  assert.equal(queries, 1);
  assert.deepEqual(ids(store.get('s1').lines.vox), ['[vox] Ann: hi', '[vox] Cy: yo']);
});

test('changing a rule\'s target moves its lines from the old feed to the new one', () => {
  const { store, setRules } = setup([txt('a', '[vox]', 'vox')]);
  setRules([txt('a', '[vox]', 'vox')]);
  store.flush();
  assert.deepEqual(ids(store.get('s1').lines.vox), ['[vox] Ann: hi', '[vox] Cy: yo']);
  setRules([txt('a', '[vox]', 'chat')]);
  store.flush();
  const st = store.get('s1');
  assert.deepEqual(ids(st.lines.chat), ['[vox] Ann: hi', '[vox] Cy: yo']);
  assert.deepEqual(st.lines.vox, []);
  assert.deepEqual(st.labels, ['chat'], 'the old feed, now empty and ruleless, has no tab');
});

test('disabling or removing a rule empties its feed, but lines other extensions copied there stay', () => {
  const { host, store, setRules } = setup([txt('a', '[vox]', 'vox')]);
  setRules([txt('a', '[vox]', 'vox')]);
  store.flush();
  // A trigger copies a line into vox (an edit: no `rule`).
  host.line('s1', 'Dee shouts!');
  const held = host.mu.lines.query('s1').at(-1).line;
  store.deliver('vox', held, { sid: 's1', worldId: 'w1', move: false });
  host.line('s1', '[vox] Eve: late');
  store.deliver('vox', host.mu.lines.query('s1').at(-1).line, { sid: 's1', worldId: 'w1', rule: 'a', move: false });
  assert.deepEqual(ids(store.get('s1').lines.vox), ['[vox] Ann: hi', '[vox] Cy: yo', 'Dee shouts!', '[vox] Eve: late']);

  setRules([txt('a', '[vox]', 'vox', { enabled: false })]);
  store.flush();
  assert.deepEqual(ids(store.get('s1').lines.vox), ['Dee shouts!']);
  setRules([txt('a', '[vox]', 'vox')]);
  store.flush();
  assert.deepEqual(ids(store.get('s1').lines.vox), ['[vox] Ann: hi', '[vox] Cy: yo', 'Dee shouts!', '[vox] Eve: late'], 'edit line merged back in order');
  setRules([]);
  store.flush();
  assert.deepEqual(ids(store.get('s1').lines.vox), ['Dee shouts!']);
  assert.deepEqual(store.get('s1').labels, ['vox']);

  // A feed only rules filled empties completely.
  setRules([txt('b', 'says', 'say')]);
  store.flush();
  assert.deepEqual(ids(store.get('s1').lines.say), ['Bob says, "hello"']);
  setRules([]);
  store.flush();
  assert.deepEqual(store.get('s1').lines.say, []);
});

test(`a rebuilt feed keeps its newest ${FEED_CAP} lines`, () => {
  const lines = Array.from({ length: 700 }, (_, i) => `line ${i + 1}`);
  const { store, setRules } = setup([], lines);
  setRules([rx('a', '.+', 'all')]);
  store.flush();
  const all = store.get('s1').lines.all;
  assert.equal(all.length, FEED_CAP);
  assert.equal(all[0].text, 'line 201');
  assert.equal(all.at(-1).text, 'line 700');
});

test('a rebuild counts no history as unread; lines unread before stay unread', () => {
  const { host, store, setRules } = setup([txt('a', '[vox]', 'vox')]);
  // Two vox lines arrive live (routed): 2 unread.
  for (const t of ['[vox] Fay: one', '[vox] Gus: two']) {
    host.line('s1', t);
    store.deliver('vox', host.mu.lines.query('s1').at(-1).line, { sid: 's1', worldId: 'w1', rule: 'a', move: false });
  }
  assert.equal(store.get('s1').unread.vox, 2);
  setRules([txt('a', '[vox]', 'vox'), rx('b', '(.+)', 'all')]);
  store.flush();
  const st = store.get('s1');
  assert.equal(st.lines.all.length, 6);
  assert.equal(st.unread.all ?? 0, 0, 'history is not unread');
  assert.deepEqual(ids(st.lines.vox), ['[vox] Ann: hi', '[vox] Cy: yo', '[vox] Fay: one', '[vox] Gus: two']);
  assert.equal(st.unread.vox, 2, 'the two live lines are still unread; the re-derived ones are not');
  // A line arriving now counts as usual.
  host.line('s1', 'new one');
  store.deliver('all', host.mu.lines.query('s1').at(-1).line, { sid: 's1', worldId: 'w1', rule: 'b', move: false });
  assert.equal(store.get('s1').unread.all, 1);
});

test('lines a Move rule took out of the terminal are rematched, not lost; Clear is not undone', () => {
  const { host, store, setRules } = setup([txt('m', 'tells you', 'tells', { move: true })], []);
  // A moved line is not held by the client: only the store has it.
  store.deliver('tells', { id: 500, ts: 1, text: 'Hal tells you: psst', spans: [{ text: 'Hal tells you: psst' }] }, { sid: 's1', worldId: 'w1', rule: 'm', move: true });
  host.line('s1', 'The room is quiet.');
  setRules([txt('m', 'tells you', 'private', { move: true })]);
  store.flush();
  assert.deepEqual(ids(store.get('s1').lines.private), ['Hal tells you: psst']);
  // Clear, then a rule change: the cleared lines do not come back.
  setRules([txt('m', 'tells you', 'private', { move: true }), rx('a', '.+', 'all')]);
  store.flush();
  assert.deepEqual(ids(store.get('s1').lines.all), ['Hal tells you: psst', 'The room is quiet.'], 'the moved line is rematched by the new rule too');
  store.clear('all', 's1');
  setRules([rx('a', '.+', 'all'), txt('m', 'tells you', 'private', { move: true })]);
  store.flush();
  assert.deepEqual(store.get('s1').lines.all, []);
});

test('a host without mu.lines.query (SDK 1.14): no rebuild, no crash, rules apply to new lines only', () => {
  const settings = new Map([['routes', []]]);
  const watchers = new Set();
  const mu = {
    settings: {
      get: (k) => settings.get(k),
      watch: (k, fn) => { const w = { k, fn }; watchers.add(w); fn(settings.get(k), { replay: true }); return () => watchers.delete(w); },
    },
    lines: { testRoutes: () => ({ targets: ['all'], move: false }) },
  };
  const store = createStore(mu);
  const off = store.attach('s1', 'w1');
  store.deliver('vox', { id: 1, ts: 1, text: '[vox] a', spans: [{ text: '[vox] a' }] }, { sid: 's1', worldId: 'w1', rule: 'x' });
  settings.set('routes', [rx('a', '.+', 'all')]);
  for (const w of [...watchers]) w.fn(settings.get('routes'), { replay: false });
  assert.equal(store.rebuild('s1'), false);
  store.flush();
  const st = store.get('s1');
  assert.deepEqual(st.labels, ['all', 'vox']);
  assert.deepEqual(ids(st.lines.vox), ['[vox] a'], 'nothing is rebuilt or dropped');
  assert.equal(st.lines.all, undefined);
  off();
  assert.equal(watchers.size, 0);
});

test('attach and watch share one rules watcher per session; it goes when both are done', () => {
  const host = createHost({ settings: { routes: [] } });
  const store = createStore(host.mu);
  const n = () => host.live().filter((k) => k === 'settings.watch').length;
  const a = store.attach('s1', 'w1');
  const w = store.watch('s1', () => {});
  assert.equal(n(), 1);
  a();
  a();
  assert.equal(n(), 1, 'still watched by the panel');
  w();
  store.attach('s1', 'w1');
  store.forget('s1');
});

// ─── the whole extension ──────────────────────────────────────────────────────

test('loaded: adding a (.+) rule fills the panel\'s all feed with earlier lines, no panel needed beforehand', async () => {
  const { createApp, nextTick } = await import('vue');
  const host = createHost({ settings: { routes: [] } });
  await host.load('src/index.ts');
  for (const t of ['[vox] Ann: hi', 'You hit the rat.']) host.route(t, { sid: 's1' });
  host.mu.settings.set('routes', [rx('a', '(.+)', 'all')]);
  await wait();
  const el = document.createElement('div');
  document.body.append(el);
  const app = createApp(host.panels.get('feeds').mount.component, { sid: 's1', worldId: 'w1' });
  app.mount(el);
  await nextTick();
  assert.deepEqual([...el.querySelectorAll('[data-testid="feed-tab"] .fname')].map((t) => t.textContent), ['all']);
  assert.deepEqual([...el.querySelectorAll('[data-testid="feed-line"]')].map((l) => l.textContent), ['[vox] Ann: hi', 'You hit the rat.']);
  const tab = el.querySelector('[data-testid="feed-tab"]');
  assert.doesNotMatch(tab.getAttribute('aria-label'), /unread/);
  // The rebuild touched the panel like a first line does.
  assert.deepEqual(host.calls.filter((c) => c.path === 'panels.touch').map((c) => c.args), [['feeds', 's1']]);
  app.unmount();
  await host.unload();
  assert.deepEqual(host.live(), []);
  assert.deepEqual(host.errors, []);
});

test('loaded on an older host (no mu.lines.query): routes as 2.1 did, and unloads clean', async () => {
  const host = createHost({ settings: { routes: [txt('a', '[vox]', 'vox')] } });
  delete host.mu.lines.query;
  await host.load('src/index.ts');
  host.route('before', { sid: 's1' });
  host.mu.settings.set('routes', [rx('a', '.+', 'all')]);
  await wait();
  const r = host.route('after', { sid: 's1' });
  assert.deepEqual(r.delivered.map((d) => d.target), ['all']);
  assert.deepEqual(host.errors, []);
  await host.unload();
  assert.deepEqual(host.live(), []);
});

test('unload disposes the per-session watchers and any pending rebuild; closing a session drops its watcher', async () => {
  const host = createHost({ sessions: [{ id: 's1', worldId: 'w1' }, { id: 's2', worldId: 'w2' }], settings: { routes: [] } });
  const base = host.live().length;
  await host.load('src/index.ts');
  const watches = () => host.live().filter((k) => k === 'settings.watch').length;
  assert.equal(watches(), 2, 'one rules watcher per open session');
  host.open({ id: 's3', worldId: 'w1' });
  assert.equal(watches(), 3);
  host.close('s3');
  assert.equal(watches(), 2);
  host.line('s1', 'pending');
  host.mu.settings.set('routes', [rx('a', '.+', 'all')]);
  await host.unload();
  await wait();
  assert.equal(host.live().length, base);
  assert.deepEqual(host.live(), []);
  assert.deepEqual(host.errors, []);
});
