/**
 * Feeds (@runmu.sh/ext-feeds): the Feeds panel (R-FEEDS, U-FEEDS), moved out of the μClient core onto the SDK.
 * The host still routes lines into feeds (Settings → Feeds, a core rule stage) and keeps the buffers per
 * session; this extension draws them through `mu.feeds` (SDK 1.7).
 *
 *  - `feeds`: a tab per feed with unread badges, Search, Times, Pop out, Rules, Clear and the latest pill;
 *    "Add a feed" (Settings → Feeds) while there is none.
 *  - `feed`: one feed in its own floating panel (Pop out), `params.feed` = the label.
 *  - Auto-add: the `feeds` panel joins a session's workspace the first time one of its feeds gets a line.
 */
import { defineExtension, type Mu } from '@muclient/sdk';
import { createPanel } from './panel';
import { COPY, FEEDS_CSS, watchFirstLines } from './model';

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    mu.ui.style(FEEDS_CSS);
    const mount = mu.panels.vue(createPanel(mu));
    mu.panels.register({ id: 'feeds', title: COPY.title, mount, perSession: true, defaultPosition: 'right-bottom', order: 50 });
    mu.panels.register({ id: 'feed', title: COPY.feedTitle, mount, perSession: true, singleton: false, defaultPosition: 'float', inViewsMenu: false });
    ctx.subscriptions.push(watchFirstLines(mu, (sid) => mu.panels.autoAdd('feeds', sid)));
  },
});
