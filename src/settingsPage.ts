/**
 * The Feeds settings page component (`SettingsSchema.component`), rebuilt from the core page it replaces
 * (clients/web/src/features/rules/FeedsPage.vue at 74d7bfa): what a feed is, the rules as cards (match → feed,
 * copy | move, enabled, ↑ ↓ ×), Add rule, three one-click examples, how a pattern matches, a "Try it" box and a
 * button that opens the Feeds panel. The rules are this extension's `routes` setting for the page's world
 * (`ctx.worldId`); matching and pattern errors come from the host (`mu.lines.testRoutes`, `mu.lines.patternError`),
 * so the page agrees with the router.
 *
 * Each rule has an explicit match mode, Text or Regex (never guessed from what was typed). The host's SDK 1.14 matcher
 * only knows one string, where `/re/flags` is a regex and anything else text, so the page keeps what the player typed
 * in `match` and their choice in `mode`, and writes `pattern` from them ({@link hostPattern}): Text is escaped into a
 * case-insensitive regex, Regex is wrapped in slashes. A rule stored without `mode` (2.0.0, or copied from the core)
 * is read by the meaning it had there ({@link readRules}).
 */
import { computed, defineComponent, h, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import type { Dispose, Mu, RouteRule } from '@muclient/sdk';
import { ROUTES_KEY } from './store';

/** Visible copy of the page (the core page's `F`, with the panel section rewritten for the extension). */
export const PAGE = {
  intro: 'A feed is a side channel of the terminal. Each rule below watches every line the game sends; a matching line is copied into the named feed, or moved there so the terminal stays quiet. The Feeds panel shows one tab per feed.',
  howTitle: 'How to match',
  howText: 'Each rule matches as Text or as a Regex. Text matches anywhere in the line, ignoring case, exactly as typed: [vox] means the five characters [vox]. Regex reads the match as a regular expression, ignoring case: ^\\w+ tells you, or .+ for every line. Several rules may share one feed, and a line may land in several feeds.',
  examplesTitle: 'Examples',
  examples: [
    { match: '[vox]', mode: 'text', target: 'vox', move: false, why: 'copy the public channel into its own tab' },
    { match: 'tells you,', mode: 'text', target: 'tells', move: true, why: 'keep private messages out of the terminal' },
    { match: '^(You|.+) (hit|miss|parr)', mode: 'regex', target: 'combat', move: true, why: 'put combat lines in their own tab' },
  ] as Array<{ match: string; mode: MatchMode; target: string; move: boolean; why: string }>,
  useExample: 'Use',
  rulesTitle: 'Rules',
  rulesHint: 'checked in order, top to bottom',
  empty: 'No rules yet. Add one, or start from an example.',
  addRule: 'Add rule',
  enabled: 'Enabled',
  pattern: 'Match',
  patternPh: (mode: MatchMode) => (mode === 'regex' ? 'regular expression' : 'text to find'),
  text: 'Text',
  regex: 'Regex',
  matchLabel: 'How the match is read',
  matchHint: (mode: MatchMode) => (mode === 'regex' ? 'a regular expression' : 'plain text, anywhere in the line'),
  target: 'Feed',
  targetPh: 'feed name',
  targetMissing: 'Name the feed, or this rule does nothing.',
  copy: 'Copy',
  move: 'Move',
  modeHint: (move: boolean) => (move ? 'leaves the terminal' : 'stays in the terminal too'),
  modeLabel: 'What happens to a matching line',
  up: 'Move up', down: 'Move down', remove: 'Remove rule',
  tryTitle: 'Try it',
  tryHint: 'paste a line from the game to see where it goes',
  tryPh: 'a line of game output',
  tryNone: 'No rule matches this line. It stays in the terminal.',
  tryHit: (targets: string[], move: boolean) => `Goes to ${targets.map((t) => `“${t}”`).join(' and ')}, and ${move ? 'leaves the terminal' : 'stays in the terminal too'}.`,
  panelTitle: 'The Feeds panel',
  panelText: 'It is listed in Views, and it opens by itself when a feed gets its first line. Lines are kept per session, 500 per feed.',
  openPanel: 'Open panel',
  footer: 'Feeds are per world and sync to your account. Highlights, gags and aliases are under Settings → Triggers.',
  noWorld: 'Pick a world to edit its feeds.',
};

/** Scoped to the page's root class (`mu.ui.style` puts it in `@layer ext.feeds`). Same look as the core page's rules.css. */
export const PAGE_CSS = [
  '.mu-feeds-page .fr-grp { display: flex; align-items: baseline; margin: 12px 0 5px; padding-bottom: 3px; font-size: .66rem; letter-spacing: .16em; text-transform: uppercase; color: var(--accent-bright); border-bottom: 1px solid var(--border); }',
  '.mu-feeds-page .fr-hint { margin-left: .6ch; color: var(--fg-faint); letter-spacing: .04em; text-transform: none; }',
  '.mu-feeds-page .fr-intro, .mu-feeds-page .fr-text { margin: 4px 0 2px; font-size: .78rem; line-height: 1.55; color: var(--fg); }',
  '.mu-feeds-page .fr-intro { color: var(--fg-dim); }',
  '.mu-feeds-page .fr-empty { margin: 2px 0 4px; font-size: .74rem; color: var(--fg-faint); }',
  '.mu-feeds-page .fr-list { display: flex; flex-direction: column; gap: 6px; }',
  '.mu-feeds-page .fr-card { display: flex; flex-direction: column; gap: 3px; padding: 6px 9px 5px; background: var(--bg); border: 1px solid var(--border); border-left: 2px solid var(--accent); transition: border-color .12s ease; }',
  '.mu-feeds-page .fr-card:focus-within { border-color: var(--border-bright); border-left-color: var(--accent-bright); }',
  '.mu-feeds-page .fr-card.off { border-left-color: var(--border-bright); }',
  '.mu-feeds-page .fr-card.off .fr-field input { color: var(--fg-faint); }',
  '.mu-feeds-page .fr-row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }',
  '.mu-feeds-page .fr-field { display: flex; flex-direction: column; gap: 1px; min-width: 0; }',
  '.mu-feeds-page .fr-field > span { font-size: .58rem; }',
  '.mu-feeds-page .fr-field input { width: 100%; font-size: .8rem; padding: 2px 2px 3px; min-height: 24px; }',
  '.mu-feeds-page .fr-field input[aria-invalid="true"] { border-bottom-color: var(--alert); }',
  '.mu-feeds-page .fr-grow { flex: 1 1 14ch; }',
  '.mu-feeds-page .fr-feed { flex: 0 1 11ch; min-width: 9ch; }',
  '.mu-feeds-page .fr-arrow { flex: 0 0 auto; align-self: flex-end; padding-bottom: 4px; color: var(--accent); }',
  '.mu-feeds-page .fr-foot { justify-content: space-between; align-items: center; row-gap: 0; }',
  '.mu-feeds-page .fr-mode { display: flex; align-items: center; gap: 2px; flex-wrap: nowrap; }',
  '.mu-feeds-page .fr-mode button, .mu-feeds-page .fr-on { font-size: .62rem; }',
  '.mu-feeds-page .fr-modehint { margin-left: .6ch; font-size: .64rem; color: var(--fg-faint); white-space: nowrap; }',
  '.mu-feeds-page .fr-tools { display: flex; align-items: center; gap: 2px; margin-left: auto; flex: 0 0 auto; }',
  '.mu-feeds-page .fr-err { margin: 0; padding: 1px 0 0 2px; font-size: .7rem; color: var(--alert); }',
  '.mu-feeds-page .fr-add { margin-top: 8px; }',
  '.mu-feeds-page .fr-examples { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }',
  '.mu-feeds-page .fr-ex { display: flex; align-items: center; gap: .8ch; flex-wrap: wrap; padding: 5px 2px; border-bottom: 1px solid var(--border); font-size: .74rem; }',
  '.mu-feeds-page .fr-ex:last-child { border-bottom: 0; }',
  '.mu-feeds-page .fr-ex-pat { font-family: inherit; color: var(--fg); padding: 0 .4ch; background: var(--bg-deep); }',
  '.mu-feeds-page .fr-ex-how { color: var(--fg-faint); font-size: .62rem; letter-spacing: .14em; text-transform: uppercase; }',
  '.mu-feeds-page .fr-ex-feed { color: var(--accent-bright); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; }',
  '.mu-feeds-page .fr-ex-why { flex: 1 1 12ch; color: var(--fg-faint); font-size: .7rem; }',
  '.mu-feeds-page .fr-ex-use { margin-left: auto; }',
  '.mu-feeds-page .fr-try { width: 100%; font-size: .82rem; margin-top: 2px; }',
  '.mu-feeds-page .fr-trial { margin: 6px 0 0; padding-left: 1ch; border-left: 2px solid var(--border-bright); font-size: .74rem; color: var(--fg-dim); }',
  '.mu-feeds-page .fr-trial.hit { border-left-color: var(--ok); color: var(--fg); }',
  '.mu-feeds-page .fr-foot-note { margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border); font-size: .74rem; color: var(--fg-dim); }',
].join('\n');

/** How a rule's match is read. */
export type MatchMode = 'text' | 'regex';
/** A rule as this page and the store keep it: the host's `RouteRule` plus what the player typed and how it is read. */
export type FeedRule = RouteRule & { match: string; mode: MatchMode; flags?: string };

const REGEX_FORM = /^\/(.+)\/([a-z]*)$/s;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The host pattern for a match in a mode. The SDK 1.14 matcher reads `/re/flags` as a regex (default flag i) and any
 * other string as text, so Text is escaped and wrapped (`/\[vox\]/i`: the same case-insensitive substring, and a
 * text that happens to look like `/x/` stays literal) and Regex is wrapped (`.+` → `/.+/`). Empty stays empty.
 */
export function hostPattern(match: string, mode: MatchMode, flags = ''): string {
  const m = String(match ?? '').trim();
  if (!m) return '';
  return mode === 'regex' ? `/${m}/${flags}` : `/${escapeRe(m)}/i`;
}

/**
 * A pattern stored without a mode, read the 1.14 way: `/re/flags` is a regex (the flags kept), anything else text.
 * `hostPattern` of the result matches exactly what the stored pattern matched, so an old rule routes as before.
 */
export function fromLegacy(pattern: string): { match: string; mode: MatchMode; flags?: string } {
  const p = String(pattern ?? '').trim();
  const m = REGEX_FORM.exec(p);
  return m ? { match: m[1], mode: 'regex', ...(m[2] ? { flags: m[2] } : {}) } : { match: p, mode: 'text' };
}

let seq = 0;
/** A rule id unique enough for one player's list. */
export const newId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Move item i by d (−1 up, +1 down) in place. */
export function move<T>(list: T[], i: number, d: number) {
  const j = i + d;
  if (i < 0 || j < 0 || i >= list.length || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

/**
 * The stored value as rules: a list of objects, `target` a string (an unconverted core `label` is read as the target).
 * A rule with a `mode` keeps its `match`; one without (2.0.0 or the core copy) gets both from its `pattern`. `pattern`
 * is always rewritten from `match` and `mode`, so the router sees what the card shows.
 */
export function readRules(v: unknown): FeedRule[] {
  if (!Array.isArray(v)) return [];
  return v.filter((r) => r && typeof r === 'object').map((r: Record<string, unknown>) => {
    const pattern = typeof r.pattern === 'string' ? r.pattern : '';
    const how = r.mode === 'text' || r.mode === 'regex'
      ? { match: typeof r.match === 'string' ? r.match : fromLegacy(pattern).match, mode: r.mode as MatchMode, ...(typeof r.flags === 'string' && r.flags ? { flags: r.flags } : {}) }
      : fromLegacy(pattern);
    const { flags: _f, ...rest } = r as Record<string, unknown>;
    return {
      ...rest,
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      ...how,
      pattern: hostPattern(how.match, how.mode, how.mode === 'regex' ? how.flags : ''),
      target: typeof r.target === 'string' ? r.target : typeof r.label === 'string' ? r.label : '',
    } as FeedRule;
  });
}

/** Why a match does not work in its mode ('' when it does, or is empty), from the host's checker. */
export function matchError(mu: Pick<Mu, 'lines'>, r: Pick<FeedRule, 'match' | 'mode' | 'flags'>): string {
  return mu.lines.patternError(hostPattern(r.match, r.mode, r.mode === 'regex' ? r.flags : ''));
}

export function createSettingsPage(mu: Mu) {
  const c = mu.ui.css;
  return defineComponent({
    name: 'FeedsSettingsPage',
    props: { sid: { type: String, default: null }, worldId: { type: String, default: null }, params: { type: Object, default: () => ({}) } },
    setup(props) {
      const rules = shallowRef<FeedRule[]>([]);
      let off: Dispose | null = null;
      watch(() => props.worldId, (wid) => {
        off?.(); off = null;
        rules.value = [];
        if (wid) off = mu.settings.watch<unknown>(ROUTES_KEY, (v) => { rules.value = readRules(v); }, { worldId: wid });
      }, { immediate: true });
      onBeforeUnmount(() => { off?.(); off = null; });

      /** Edit a copy of the world's rules and write it back. */
      const edit = (fn: (r: FeedRule[]) => void) => {
        const wid = props.worldId;
        if (!wid) return;
        const next = readRules(mu.settings.get<unknown>(ROUTES_KEY, { worldId: wid })).map((r) => ({ ...r }));
        fn(next);
        for (const r of next) r.pattern = hostPattern(r.match, r.mode, r.mode === 'regex' ? r.flags : '');
        mu.settings.set(ROUTES_KEY, next, wid);
        rules.value = next;
      };
      const set = (i: number, p: Partial<FeedRule>) => edit((l) => { if (l[i]) Object.assign(l[i], p); });
      const val = (e: Event) => (e.target as HTMLInputElement).value;
      const add = (seed?: { match: string; mode: MatchMode; target: string; move: boolean }) =>
        edit((l) => { l.push({ id: newId(), match: seed?.match ?? '', mode: seed?.mode ?? 'text', pattern: '', target: seed?.target ?? '', move: seed?.move ?? false }); });
      const hasExample = (ex: { match: string; mode: MatchMode; target: string }) => rules.value.some((r) => r.match === ex.match && r.mode === ex.mode && r.target === ex.target);
      const targets = computed(() => [...new Set(rules.value.map((r) => r.target.trim()).filter(Boolean))]);

      const root = ref<HTMLElement | null>(null);
      const addAndFocus = () => { add(); nextTick(() => root.value?.querySelector<HTMLInputElement>('.fr-card:last-child input.fr-match')?.focus()); };

      const sample = ref('');
      const trial = computed(() => {
        const text = sample.value.trim();
        if (!text || !props.worldId) return null;
        const r = mu.lines.testRoutes(text, rules.value);
        return r.targets.length ? { text: PAGE.tryHit(r.targets, r.move), hit: true } : { text: PAGE.tryNone, hit: false };
      });
      const openPanel = () => mu.panels.open('feeds', undefined, props.sid ? { sid: props.sid } : undefined);

      const grp = (title: string, hint?: string) => h('div', { class: 'fr-grp' }, [title, hint ? h('span', { class: 'fr-hint' }, hint) : null]);
      const card = (r: FeedRule, i: number, n: number) => {
        const err = matchError(mu, r);
        const noTarget = !r.target.trim() && !!r.match.trim();
        const on = r.enabled !== false;
        return h('div', { key: r.id, class: ['fr-card', { off: !on }], role: 'group', 'aria-label': `Rule ${i + 1}`, 'data-rule': 'route' }, [
          h('div', { class: 'fr-row' }, [
            h('label', { class: 'fr-field fr-grow' }, [
              h('span', { class: c.label }, PAGE.pattern),
              h('input', {
                class: [c.field, 'fr-match'], placeholder: PAGE.patternPh(r.mode), value: r.match, 'aria-label': `Rule ${i + 1} pattern`,
                'aria-invalid': !!err, spellcheck: false, onInput: (e: Event) => set(i, { match: val(e) }),
              }),
            ]),
            h('span', { class: 'fr-arrow', 'aria-hidden': 'true' }, '→'),
            h('label', { class: 'fr-field fr-feed' }, [
              h('span', { class: c.label }, PAGE.target),
              h('input', {
                class: [c.field, 'fr-target'], placeholder: PAGE.targetPh, list: 'mu-feeds-names', value: r.target, 'aria-label': `Rule ${i + 1} feed`,
                'aria-invalid': noTarget, spellcheck: false, onInput: (e: Event) => set(i, { target: val(e) }),
              }),
            ]),
          ]),
          h('div', { class: 'fr-row fr-foot' }, [
            h('div', { class: 'fr-mode fr-how', role: 'radiogroup', 'aria-label': `Rule ${i + 1}: ${PAGE.matchLabel}` }, [
              h('button', { type: 'button', role: 'radio', class: c.toggle, 'aria-checked': r.mode === 'text', 'data-match': 'text', onClick: () => set(i, { mode: 'text' }) }, PAGE.text),
              h('button', { type: 'button', role: 'radio', class: c.toggle, 'aria-checked': r.mode === 'regex', 'data-match': 'regex', onClick: () => set(i, { mode: 'regex' }) }, PAGE.regex),
              h('span', { class: 'fr-modehint' }, PAGE.matchHint(r.mode)),
            ]),
            h('div', { class: 'fr-mode', role: 'radiogroup', 'aria-label': PAGE.modeLabel }, [
              h('button', { type: 'button', role: 'radio', class: c.toggle, 'aria-checked': !r.move, 'data-mode': 'copy', onClick: () => set(i, { move: false }) }, PAGE.copy),
              h('button', { type: 'button', role: 'radio', class: c.toggle, 'aria-checked': !!r.move, 'data-mode': 'move', onClick: () => set(i, { move: true }) }, PAGE.move),
              h('span', { class: 'fr-modehint' }, PAGE.modeHint(!!r.move)),
            ]),
            h('div', { class: 'fr-tools' }, [
              h('button', { type: 'button', class: [c.toggle, 'fr-on'], role: 'switch', 'aria-checked': on, 'aria-label': `Rule ${i + 1} enabled`, onClick: () => set(i, { enabled: !on }) }, PAGE.enabled),
              h('button', { type: 'button', class: [c.cmd, c.sq], disabled: i === 0, 'aria-label': `Move rule ${i + 1} up`, title: PAGE.up, onClick: () => edit((l) => move(l, i, -1)) }, '↑'),
              h('button', { type: 'button', class: [c.cmd, c.sq], disabled: i === n - 1, 'aria-label': `Move rule ${i + 1} down`, title: PAGE.down, onClick: () => edit((l) => move(l, i, 1)) }, '↓'),
              h('button', { type: 'button', class: [c.cmd, c.sq, c.warn], 'aria-label': `Remove rule ${i + 1}`, title: PAGE.remove, onClick: () => edit((l) => { l.splice(i, 1); }) }, '×'),
            ]),
          ]),
          err ? h('p', { class: 'fr-err', 'data-testid': 'feeds-rule-error' }, err)
            : noTarget ? h('p', { class: 'fr-err', 'data-testid': 'feeds-rule-error' }, PAGE.targetMissing) : null,
        ]);
      };

      return () => {
        if (!props.worldId) return h('div', { class: 'mu-feeds-page', 'data-testid': 'feeds-page' }, [h('p', { class: c.empty }, PAGE.noWorld)]);
        const rs = rules.value, t = trial.value;
        return h('div', { ref: root, class: 'mu-feeds-page', 'data-testid': 'feeds-page' }, [
          h('p', { class: 'fr-intro' }, PAGE.intro),
          grp(PAGE.rulesTitle, PAGE.rulesHint),
          rs.length ? null : h('p', { class: 'fr-empty', 'data-testid': 'feeds-empty' }, PAGE.empty),
          h('div', { class: 'fr-list' }, rs.map((r, i) => card(r, i, rs.length))),
          h('datalist', { id: 'mu-feeds-names' }, targets.value.map((l) => h('option', { key: l, value: l }))),
          h('button', { type: 'button', class: [c.cmd, c.primary, 'fr-add'], 'data-testid': 'feeds-add-rule', onClick: addAndFocus }, PAGE.addRule),

          grp(PAGE.examplesTitle),
          h('ul', { class: 'fr-examples' }, PAGE.examples.map((ex) => h('li', { key: ex.match, class: 'fr-ex' }, [
            h('code', { class: 'fr-ex-pat' }, ex.match),
            h('span', { class: 'fr-ex-how' }, (ex.mode === 'regex' ? PAGE.regex : PAGE.text).toLowerCase()),
            h('span', { class: 'fr-arrow', 'aria-hidden': 'true' }, '→'),
            h('span', { class: 'fr-ex-feed' }, ex.target),
            h('span', { class: 'fr-ex-why' }, `${ex.why} (${(ex.move ? PAGE.move : PAGE.copy).toLowerCase()})`),
            h('button', {
              type: 'button', class: [c.cmd, 'fr-ex-use'], disabled: hasExample(ex), 'aria-label': `Use example: ${ex.match} to ${ex.target}`,
              'data-testid': 'feeds-example', onClick: () => add(ex),
            }, PAGE.useExample),
          ]))),

          grp(PAGE.howTitle),
          h('p', { class: 'fr-text' }, PAGE.howText),

          grp(PAGE.tryTitle, PAGE.tryHint),
          h('input', {
            class: [c.field, 'fr-try'], placeholder: PAGE.tryPh, 'aria-label': PAGE.tryTitle, spellcheck: false, value: sample.value,
            'data-testid': 'feeds-try', onInput: (e: Event) => { sample.value = val(e); },
          }),
          t ? h('p', { class: ['fr-trial', { hit: t.hit }], 'aria-live': 'polite', 'data-testid': 'feeds-trial' }, t.text) : null,

          grp(PAGE.panelTitle),
          h('p', { class: 'fr-text' }, [PAGE.panelText, ' ', h('button', { type: 'button', class: c.cmd, 'data-testid': 'feeds-open-panel', onClick: openPanel }, PAGE.openPanel)]),
          h('p', { class: 'fr-foot-note' }, PAGE.footer),
        ]);
      };
    },
  });
}
