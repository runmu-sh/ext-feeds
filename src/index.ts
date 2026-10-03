/**
 * Feeds (@runmu.sh/ext-feeds): the Feeds panel and its routing. The host no longer routes lines into feeds or keeps
 * feed buffers: this extension declares its own rules (setting `routes`, per world, a `RouteRule[]`), registers a
 * line router (`mu.lines.route`, `edits: true` so other extensions' and triggers' `copyTo/moveTo` land here too) and
 * keeps the lines per session itself (src/store.ts). On the first `edits` router the host copies the old core
 * `rules.feeds` into `routes` once. Settings → Feeds (a hub tile) is this extension's page: the rule editor in
 * src/settingsPage.ts.
 *
 *  - `feeds`: a tab per feed with unread badges, Search, Times, Pop out, Rules, Clear and the latest pill;
 *    "Add a feed" (Settings → Feeds, this extension's page) while there is none. Listed in Views; a per-world "Show panel"
 *    row (SDK 1.12 `show`) lets the player hide it or have it appear only once a feed has lines.
 *  - `feed`: one feed in its own floating panel (Pop out), `params.feed` = the label, titled "Feed: <label>".
 *  - Retroactive rules: when a world's rules change, each of its open sessions' feeds is rebuilt from the lines the
 *    client holds (`mu.lines.query`, SDK 1.15, feature-detected; src/store.ts says how edits and unread are kept).
 *  - Auto-add: the first line a session's feeds hold adds `feeds` to that session's workspace (`mu.panels.touch`).
 */
import { defineExtension, type Mu } from '@muclient/sdk';
import { createPanel } from './panel';
import { COPY, FEEDS_CSS, onFirstLine, readers } from './model';
import { createStore, ROUTES_KEY } from './store';
import { createSettingsPage, PAGE_CSS } from './settingsPage';

/** The settings page: the routing rules, edited by the page component (src/settingsPage.ts, added in `activate`). */
export const SETTINGS = {
  title: 'Feeds',
  tile: { glyph: '⇶', order: 950, width: 'min(34rem, 94vw)' },
  items: [{ key: ROUTES_KEY, kind: 'json' as const, scope: 'world' as const, default: [] as unknown[], label: 'Feed routing' }],
};

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    const subs = ctx.subscriptions;
    const store = createStore(mu);
    subs.push(mu.ui.style(FEEDS_CSS));
    subs.push(mu.ui.style(PAGE_CSS));
    subs.push(mu.settings.define({ ...SETTINGS, component: mu.panels.vue(createSettingsPage(mu)) }));
    subs.push(mu.lines.route({ id: 'feeds', rules: ROUTES_KEY, edits: true, deliver: (t, line, c) => store.deliver(t, line, c) }));
    // Which feed each open panel is reading, per session; the store is told one at a time.
    const reading = readers((label, sid) => store.viewing(label, sid));
    // Each open session follows its world's rules, panel or not: a rule change rebuilds its feeds from the held lines
    // (SDK 1.15 `mu.lines.query`; on an older host rules apply to new lines only).
    subs.push(mu.sessions.each((s) => {
      const off = store.attach(s.id, s.worldId);
      return () => { off(); reading.forget(s.id); store.forget(s.id); };
    }));
    subs.push(() => store.dispose());
    const mount = mu.panels.vue(createPanel(mu, store, reading));
    subs.push(mu.panels.register({ id: 'feeds', title: COPY.title, mount, perSession: true, defaultPosition: 'right-bottom', order: 50, show: 'always' }));
    subs.push(mu.panels.register({ id: 'feed', title: COPY.feedTitle, mount, perSession: true, singleton: false, defaultPosition: 'float', inViewsMenu: false }));
    subs.push(onFirstLine(mu, store, (sid) => mu.panels.touch('feeds', sid)));
  },
});
