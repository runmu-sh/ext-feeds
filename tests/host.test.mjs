// The extension against the headless μClient host (@runmu.sh/dev/test): what it registers, the auto-add through
// mu.panels.touch, viewing per session, and a clean unload.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '@runmu.sh/dev/test';

const line = (id, text) => ({ id, ts: 0, text, spans: [{ text }] });

/** The test host has no feeds model: give it one (per session, watchers called at once and on every push). */
function withFeeds(host) {
  const data = new Map(), watchers = new Map();
  const get = (sid) => data.get(sid) ?? { labels: [], lines: {}, unread: {} };
  Object.assign(host.mu.feeds, {
    get: (sid) => get(sid),
    watch(fn, sid) { const set = watchers.get(sid) ?? watchers.set(sid, new Set()).get(sid); set.add(fn); fn(get(sid)); return () => set.delete(fn); },
    viewing(label, sid) { host.calls.push({ path: 'feeds.viewing', args: [label, sid] }); },
    clear(label, sid) { host.calls.push({ path: 'feeds.clear', args: [label, sid] }); },
  });
  return {
    push(sid, label, l) {
      const v = get(sid);
      data.set(sid, { labels: [...new Set([...v.labels, label])], lines: { ...v.lines, [label]: [...(v.lines[label] ?? []), l] }, unread: v.unread });
      for (const fn of [...(watchers.get(sid) ?? [])]) fn(get(sid));
    },
    watching: () => [...watchers.values()].reduce((n, s) => n + s.size, 0),
  };
}

test('registers feeds (Views, order 50, show always) and feed (floating pop-out, not in Views)', async () => {
  const host = createHost();
  withFeeds(host);
  await host.load('src/index.ts');
  const feeds = host.panels.get('feeds'), feed = host.panels.get('feed');
  assert.equal(feeds.title, 'Feeds');
  assert.equal(feeds.order, 50);
  assert.equal(feeds.defaultPosition, 'right-bottom');
  assert.equal(feeds.show, 'always');
  assert.equal(feeds.perSession, true);
  assert.equal(feed.title, 'Feed');
  assert.equal(feed.singleton, false);
  assert.equal(feed.inViewsMenu, false);
  assert.equal(feed.defaultPosition, 'float');
  assert.equal(typeof feeds.mount, 'function');
  await host.unload();
  assert.deepEqual(host.live(), []);
});

test('the first feed line of each session touches the feeds panel once; unload releases every watch', async () => {
  const host = createHost({ sessions: [{ id: 's1', worldId: 'w1' }, { id: 's2', worldId: 'w1' }] });
  const f = withFeeds(host);
  await host.load('src/index.ts');
  const touches = () => host.calls.filter((c) => c.path === 'panels.touch').map((c) => c.args);
  assert.deepEqual(touches(), []);
  assert.equal(f.watching(), 2);
  f.push('s2', 'OOC', line(1, 'hi'));
  f.push('s2', 'OOC', line(2, 'again'));
  assert.deepEqual(touches(), [['feeds', 's2']]);
  host.open({ id: 's3', worldId: 'w2' });
  f.push('s3', 'Tells', line(1, 'psst'));
  assert.deepEqual(touches(), [['feeds', 's2'], ['feeds', 's3']]);
  assert.equal(host.calls.some((c) => c.path === 'panels.autoAdd'), false, 'no hand-rolled autoAdd');
  assert.equal(f.watching(), 1, 'only s1 still waits');
  await host.unload();
  assert.equal(f.watching(), 0);
  assert.deepEqual(host.live(), []);
  assert.deepEqual(host.errors, []);
});

test('a session that already holds lines when the extension activates is touched at once', async () => {
  const host = createHost();
  const f = withFeeds(host);
  f.push('s1', 'OOC', line(1, 'before'));
  await host.load('src/index.ts');
  assert.deepEqual(host.calls.filter((c) => c.path === 'panels.touch').map((c) => c.args), [['feeds', 's1']]);
  await host.unload();
});

test('manifest: SDK 1.12, the panels it registers, and only what it uses', async () => {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.muclient.api, '^1.12');
  assert.equal(pkg.devDependencies['@muclient/sdk'], 'npm:@runmu.sh/sdk@^1.12.0');
  assert.deepEqual(pkg.muclient.contributes.panels.map((p) => p.id), ['feeds', 'feed']);
  assert.equal(pkg.muclient.contributes.panels[0].show, 'always');
  // No GMCP, no line hooks, no sends: the core routes the lines; this only draws them.
  assert.equal(pkg.muclient.contributes.gmcp, undefined);
  assert.deepEqual(pkg.muclient.capabilities, ['read-output']);
});
