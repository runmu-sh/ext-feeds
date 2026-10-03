// The Feeds settings page (SettingsSchema.component) in the headless host: Add rule writes `routes` for the page's
// world, the fields edit it, a bad /regex/ shows the host's error, and Try it names the matched feed.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHost } from '@runmu.sh/dev/test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register();
after(() => GlobalRegistrator.unregister());

const type = (input, text) => { input.value = text; input.dispatchEvent(new Event('input')); };

test('the page adds a rule into `routes`, edits it, and Try it shows the matched feed', async () => {
  const { createApp, nextTick } = await import('vue');
  const host = createHost();
  await host.load('src/index.ts');
  const comp = host.settingsSchema.component?.component;
  assert.ok(comp, 'settings.define carries a component');
  const el = document.createElement('div');
  document.body.append(el);
  const app = createApp(comp, { sid: 's1', worldId: 'w1' });
  app.mount(el);
  await nextTick();
  const q = (s) => el.querySelector(s);
  assert.ok(q('[data-testid="feeds-empty"]'));

  q('[data-testid="feeds-add-rule"]').click();
  await nextTick();
  let routes = host.setting('routes');
  assert.equal(routes.length, 1);
  assert.deepEqual([routes[0].match, routes[0].mode, routes[0].pattern, routes[0].target, routes[0].move], ['', 'text', '', '', false]);
  assert.equal(q('.fr-card [data-match="text"]').getAttribute('aria-checked'), 'true', 'a new rule matches as Text');

  type(q('.fr-card input.fr-match'), 'pages');
  await nextTick();
  type(q('.fr-card input.fr-target'), 'Pages');
  await nextTick();
  q('.fr-card [data-mode="move"]').click();
  await nextTick();
  routes = host.setting('routes');
  assert.deepEqual(routes.map((r) => [r.match, r.mode, r.pattern, r.target, r.move]), [['pages', 'text', '/pages/i', 'Pages', true]]);
  assert.match(routes[0].id, /\S/);

  // The router reads the same setting.
  assert.deepEqual(host.route('Bob pages: hi', { sid: 's1' }).delivered.map((d) => [d.target, d.move]), [['Pages', true]]);

  type(q('[data-testid="feeds-try"]'), 'Bob pages: hello');
  await nextTick();
  assert.equal(q('[data-testid="feeds-trial"]').textContent, 'Goes to “Pages”, and leaves the terminal.');
  assert.ok(q('[data-testid="feeds-trial"]').classList.contains('hit'));
  type(q('[data-testid="feeds-try"]'), 'nothing here');
  await nextTick();
  assert.equal(q('[data-testid="feeds-trial"]').textContent, 'No rule matches this line. It stays in the terminal.');

  // A bad regex shows the host's error only in Regex mode; as Text the same characters are literal.
  type(q('.fr-card input.fr-match'), '(');
  await nextTick();
  assert.equal(q('[data-testid="feeds-rule-error"]'), null);
  q('.fr-card [data-match="regex"]').click();
  await nextTick();
  assert.equal(host.setting('routes')[0].mode, 'regex');
  assert.ok(q('[data-testid="feeds-rule-error"]')?.textContent);
  assert.equal(q('.fr-card input.fr-match').getAttribute('aria-invalid'), 'true');
  // An example adds a second rule; reorder, disable and delete.
  q('[data-testid="feeds-example"]').click();
  await nextTick();
  assert.deepEqual(host.setting('routes').map((r) => r.target), ['Pages', 'vox']);
  q('[aria-label="Move rule 2 up"]').click();
  await nextTick();
  assert.deepEqual(host.setting('routes').map((r) => r.target), ['vox', 'Pages']);
  q('[aria-label="Rule 1 enabled"]').click();
  await nextTick();
  assert.equal(host.setting('routes')[0].enabled, false);
  assert.ok(q('.fr-card').classList.contains('off'));
  q('[aria-label="Remove rule 1"]').click();
  await nextTick();
  assert.deepEqual(host.setting('routes').map((r) => r.target), ['Pages']);

  app.unmount();
  await host.unload();
  assert.deepEqual(host.live(), []);
  assert.deepEqual(host.errors, []);
});

test('(.+) captures nothing as Text and every line as Regex: the toggle decides, the pattern is never guessed', async () => {
  const { createApp, nextTick } = await import('vue');
  const host = createHost();
  await host.load('src/index.ts');
  const el = document.createElement('div');
  document.body.append(el);
  const app = createApp(host.settingsSchema.component.component, { sid: 's1', worldId: 'w1' });
  app.mount(el);
  await nextTick();
  const q = (s) => el.querySelector(s);
  q('[data-testid="feeds-add-rule"]').click();
  await nextTick();
  type(q('.fr-card input.fr-match'), '(.+)');
  type(q('.fr-card input.fr-target'), 'all');
  await nextTick();
  assert.equal(host.setting('routes')[0].mode, 'text');
  assert.equal(host.route('You see a hall.', { sid: 's1' }).delivered.length, 0, 'Text: only the literal "(.+)"');
  assert.deepEqual(host.route('he said (.+) twice', { sid: 's1' }).delivered.map((d) => d.target), ['all']);

  q('.fr-card [data-match="regex"]').click();
  await nextTick();
  const r = host.setting('routes')[0];
  assert.deepEqual([r.match, r.mode, r.pattern], ['(.+)', 'regex', '/(.+)/']);
  assert.equal(q('.fr-card input.fr-match').value, '(.+)', 'the field keeps what was typed');
  assert.equal(q('[data-testid="feeds-rule-error"]'), null);
  for (const line of ['You see a hall.', 'Obvious exits: north']) assert.deepEqual(host.route(line, { sid: 's1' }).delivered.map((d) => d.target), ['all']);
  type(q('[data-testid="feeds-try"]'), 'anything at all');
  await nextTick();
  assert.equal(q('[data-testid="feeds-trial"]').textContent, 'Goes to “all”, and stays in the terminal too.');

  // Text that looks like a regex literal stays text.
  q('.fr-card [data-match="text"]').click();
  type(q('.fr-card input.fr-match'), '/tells/');
  await nextTick();
  assert.equal(host.route('Ann tells you hi', { sid: 's1' }).delivered.length, 0);
  assert.deepEqual(host.route('see /tells/ for help', { sid: 's1' }).delivered.map((d) => d.target), ['all']);

  app.unmount();
  await host.unload();
  assert.deepEqual(host.errors, []);
});

test('rules stored before 2.1 (no mode) show as they matched: /re/flags as Regex, anything else as Text', async () => {
  const { createApp, nextTick } = await import('vue');
  const host = createHost({ settings: { routes: [{ id: 'a', pattern: '[vox]', target: 'vox' }, { id: 'b', pattern: '/^Ann/s', target: 'ann' }] } });
  await host.load('src/index.ts');
  const el = document.createElement('div');
  document.body.append(el);
  const app = createApp(host.settingsSchema.component.component, { sid: 's1', worldId: 'w1' });
  app.mount(el);
  await nextTick();
  const cards = [...el.querySelectorAll('.fr-card')];
  assert.deepEqual(cards.map((c) => c.querySelector('input.fr-match').value), ['[vox]', '^Ann']);
  assert.deepEqual(cards.map((c) => c.querySelector('[aria-checked="true"][data-match]').dataset.match), ['text', 'regex']);
  // The first edit writes the 2.1 shape; the routing is unchanged (flags kept).
  cards[0].querySelector('[data-mode="move"]').click();
  await nextTick();
  assert.deepEqual(host.setting('routes').map((r) => [r.match, r.mode, r.flags, r.pattern]), [['[vox]', 'text', undefined, '/\\[vox\\]/i'], ['^Ann', 'regex', 's', '/^Ann/s']]);
  assert.deepEqual(host.route('[VOX] Ann: hi', { sid: 's1' }).delivered.map((d) => d.target), ['vox']);
  assert.deepEqual(host.route('Ann waves', { sid: 's1' }).delivered.map((d) => d.target), ['ann']);
  assert.equal(host.route('ann waves', { sid: 's1' }).delivered.length, 0, 'the s flag (no i) stays case-sensitive');
  app.unmount();
  await host.unload();
  assert.deepEqual(host.errors, []);
});

test('the page reads a core rule still shaped { label } as its target, and says so with no world', async () => {
  const { createApp, nextTick } = await import('vue');
  const host = createHost({ settings: { routes: [{ id: 'old', pattern: 'ooc', label: 'OOC' }] } });
  await host.load('src/index.ts');
  const comp = host.settingsSchema.component.component;
  const el = document.createElement('div');
  document.body.append(el);
  const app = createApp(comp, { sid: 's1', worldId: 'w1' });
  app.mount(el);
  await nextTick();
  assert.equal(el.querySelector('.fr-card input.fr-target').value, 'OOC');
  app.unmount();
  const none = createApp(comp, { sid: null, worldId: null });
  none.mount(el);
  await nextTick();
  assert.equal(el.textContent, 'Pick a world to edit its feeds.');
  none.unmount();
  await host.unload();
  assert.deepEqual(host.live(), []);
});
