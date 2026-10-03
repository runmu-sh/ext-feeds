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
  assert.deepEqual([routes[0].pattern, routes[0].target, routes[0].move], ['', '', false]);

  type(q('.fr-card input.fr-match'), 'pages');
  await nextTick();
  type(q('.fr-card input.fr-target'), 'Pages');
  await nextTick();
  q('.fr-card [data-mode="move"]').click();
  await nextTick();
  routes = host.setting('routes');
  assert.deepEqual(routes.map((r) => [r.pattern, r.target, r.move]), [['pages', 'Pages', true]]);
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

  // A bad regex shows the host's error; an example adds a second rule; reorder, disable and delete.
  type(q('.fr-card input.fr-match'), '/(/');
  await nextTick();
  assert.ok(q('[data-testid="feeds-rule-error"]')?.textContent);
  assert.equal(q('.fr-card input.fr-match').getAttribute('aria-invalid'), 'true');
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
