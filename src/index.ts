/**
 * Feeds (@runmu.sh/ext-feeds): the Feeds panel. The host routes lines into feeds (Settings → Feeds, a core rule
 * stage) and keeps the buffers per session; this extension draws them through `mu.feeds`.
 *
 *  - `feeds`: a tab per feed with unread badges, Search, Times, Pop out, Rules, Clear and the latest pill;
 *    "Add a feed" (Settings → Feeds) while there is none. Listed in Views; a per-world "Show panel" row (SDK 1.12
 *    `show`) lets the player hide it or have it appear only once a feed has lines.
 *  - `feed`: one feed in its own floating panel (Pop out), `params.feed` = the label, titled "Feed: <label>".
 *  - Auto-add: the first line a session's feeds hold adds `feeds` to that session's workspace (`mu.panels.touch`).
 */
import { defineExtension, type Mu } from '@muclient/sdk';
import { createPanel } from './panel';
import { COPY, FEEDS_CSS, onFirstLine, readers } from './model';

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    const subs = ctx.subscriptions;
    subs.push(mu.ui.style(FEEDS_CSS));
    // Which feed each open panel is reading, per session; the host is told one at a time (mu.feeds.viewing).
    const reading = readers((label, sid) => mu.feeds.viewing(label, sid));
    subs.push(mu.sessions.each((s) => () => reading.forget(s.id)));
    const mount = mu.panels.vue(createPanel(mu, reading));
    subs.push(mu.panels.register({ id: 'feeds', title: COPY.title, mount, perSession: true, defaultPosition: 'right-bottom', order: 50, show: 'always' }));
    subs.push(mu.panels.register({ id: 'feed', title: COPY.feedTitle, mount, perSession: true, singleton: false, defaultPosition: 'float', inViewsMenu: false }));
    subs.push(onFirstLine(mu, (sid) => mu.panels.touch('feeds', sid)));
  },
});
