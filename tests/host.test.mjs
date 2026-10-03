// The extension against the headless μClient host (@runmu.sh/dev/test): what it registers (panels, its Settings
// page, the line router), routing into its own store, the auto-add through mu.panels.touch, and a clean unload.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '@runmu.sh/dev/test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

// A DOM for the panel test, before anything loads vue (runtime-dom reads `document` once, at import).
GlobalRegistrator.register();
after(() => GlobalRegistrator.unregister());

const rule = (id, pattern, target, more = {}) => ({ id, pattern, target, ...more });
const touches = (host) => host.calls.filter((c) => c.path === 'panels.touch').map((c) => c.args);

test('registers feeds (Views, order 50, show always) and feed (floating pop-out, not in Views)', async () => {
  const host = createHost();
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

test('defines its Settings page (tile, routes per world) and one edits router on it; never touches mu.feeds', async () => {
  const host = createHost();
  await host.load('src/index.ts');
  assert.equal(host.settingsSchema.title, 'Feeds');
  assert.deepEqual(host.settingsSchema.tile, { glyph: '⇶', order: 950, width: 'min(34rem, 94vw)' });
  assert.deepEqual(host.settingsSchema.items, [{ key: 'routes', kind: 'json', scope: 'world', default: [], label: 'Feed routing' }]);
  assert.equal(host.settingsSchema.items[0].migrateFrom, undefined, 'the edits router copies rules.feeds itself');
  assert.deepEqual(host.routers.map((r) => [r.id, r.rules, r.edits]), [['feeds', 'routes', true]]);
  assert.equal(host.calls.some((c) => c.path.startsWith('feeds.')), false);
  await host.unload();
  assert.deepEqual(host.routers, []);
  assert.deepEqual(host.live(), []);
});

test('a rule in `routes` sends a line into the feed and the panel shows it; a move rule reports moved', async () => {
  const { createApp, nextTick } = await import('vue');
  const host = createHost({ settings: { routes: [rule('r1', 'pages', 'Pages'), rule('r2', '/^\\[OOC\\]/', 'OOC', { move: true })] } });
  await host.load('src/index.ts');
  const el = document.createElement('div');
  document.body.append(el);
  const app = createApp(host.panels.get('feeds').mount.component, { sid: 's1', worldId: 'w1' });
  app.mount(el);
  await nextTick();
  const tabs = () => [...el.querySelectorAll('[data-testid="feed-tab"] .fname')].map((t) => t.textContent);
  assert.deepEqual(tabs(), ['Pages', 'OOC'], 'a tab per enabled rule');

  const copy = host.route('Bob pages: hi there', { sid: 's1' });
  assert.deepEqual(copy.delivered.map((d) => [d.router, d.target, d.move]), [['feeds', 'Pages', false]]);
  assert.equal(copy.moved, false);
  await nextTick();
  assert.deepEqual([...el.querySelectorAll('[data-testid="feed-line"]')].map((l) => l.textContent), ['Bob pages: hi there']);
  assert.ok(el.querySelector('[data-testid="feed-line"]').classList.contains('mu-ansi'), 'lines sit in the terminal palette scope');
  assert.deepEqual(touches(host), [['feeds', 's1']], 'first line auto-adds the panel');

  const move = host.route('[OOC] Ann: hello', { sid: 's1' });
  assert.deepEqual(move.delivered.map((d) => [d.target, d.move]), [['OOC', true]]);
  assert.equal(move.moved, true);
  await nextTick();
  const ooc = [...el.querySelectorAll('[data-testid="feed-tab"]')].find((t) => t.textContent.startsWith('OOC'));
  assert.match(ooc.getAttribute('aria-label'), /OOC, 1 unread/);
  assert.equal(host.route('nothing here', { sid: 's1' }).delivered.length, 0);

  app.unmount();
  await host.unload();
  assert.deepEqual(host.live(), []);
  assert.deepEqual(host.errors, []);
});

test('a routed line keeps its colours: span classes and styles render inside the palette scope (.mu-ansi)', async () => {
  const { createApp, nextTick } = await import('vue');
  const host = createHost({ settings: { routes: [rule('r1', 'hall', 'look')] } });
  await host.load('src/index.ts');
  const el = document.createElement('div');
  document.body.append(el);
  const app = createApp(host.panels.get('feeds').mount.component, { sid: 's1', worldId: 'w1' });
  app.mount(el);
  await nextTick();
  const spans = [{ text: 'The ', cls: 'c-003 b' }, { text: 'Great Hall', cls: 'hl hl-gold' }, { text: ' glows', style: 'color:#a0b0c0;' }];
  // The dev host's route() makes plain lines; hand the router a coloured one as μClient does.
  host.routers[0].deliver('look', { id: 1, ts: 0, text: 'The Great Hall glows', spans }, { sid: 's1', worldId: 'w1', move: false });
  await nextTick();
  const line = el.querySelector('[data-testid="feed-line"]');
  assert.ok(line.classList.contains('mu-ansi'));
  const got = [...line.querySelectorAll('span')].map((s) => [s.textContent, s.getAttribute('class'), s.getAttribute('style')]);
  assert.deepEqual(got, [['The ', 'c-003 b', null], ['Great Hall', 'hl hl-gold', null], [' glows', null, 'color: #a0b0c0;']]);
  app.unmount();
  await host.unload();
  assert.deepEqual(host.errors, []);
});

test('the first routed line of each session touches the feeds panel once', async () => {
  const host = createHost({ sessions: [{ id: 's1', worldId: 'w1' }, { id: 's2', worldId: 'w1' }], settings: { routes: [rule('r', 'ooc', 'OOC')] } });
  await host.load('src/index.ts');
  assert.deepEqual(touches(host), []);
  host.route('ooc hi', { sid: 's2' });
  host.route('ooc again', { sid: 's2' });
  assert.deepEqual(touches(host), [['feeds', 's2']]);
  host.open({ id: 's3', worldId: 'w2' });
  host.route('ooc psst', { sid: 's3' });
  assert.deepEqual(touches(host), [['feeds', 's2'], ['feeds', 's3']]);
  assert.equal(host.calls.some((c) => c.path === 'panels.autoAdd'), false, 'no hand-rolled autoAdd');
  await host.unload();
  assert.deepEqual(host.live(), []);
  assert.deepEqual(host.errors, []);
});

test('manifest: SDK 1.14, the panels and settings page it registers, and only what it uses', async () => {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.muclient.api, '^1.14');
  assert.equal(pkg.devDependencies['@muclient/sdk'], 'npm:@runmu.sh/sdk@^1.14.0');
  assert.deepEqual(pkg.muclient.contributes.panels.map((p) => p.id), ['feeds', 'feed']);
  assert.equal(pkg.muclient.contributes.panels[0].show, 'always');
  // The tile shows before activation: the same page `mu.settings.define` registers.
  const host = createHost();
  await host.load('src/index.ts');
  assert.deepEqual(pkg.muclient.contributes.settings, JSON.parse(JSON.stringify(host.settingsSchema)));
  await host.unload();
  assert.doesNotMatch(pkg.muclient.description, /Settings → Feeds/);
  assert.equal(pkg.muclient.contributes.gmcp, undefined);
  assert.deepEqual(pkg.muclient.capabilities, ['read-output']);
});
