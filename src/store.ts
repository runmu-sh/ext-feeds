/**
 * The extension's own per-session feed buffers (replaces the host's `mu.feeds`, removed in SDK 2.0). The line router
 * (`mu.lines.route`, wired in src/index.ts) calls `deliver`; the panels `watch`, report `viewing`, and `clear`.
 * Semantics follow the old host buffers (clients/web/src/features/rules/feeds.ts at 74d7bfa): the last 500 lines per
 * feed, a line counts as unread unless that feed is the one being viewed, viewing a feed marks it read, clearing
 * empties it. `labels` follows the old `feedsView`: the enabled rules' targets for the session's world, in rule
 * order, then any other feed holding lines.
 *
 * Retroactive rules (2.2.0, SDK 1.15 `mu.lines.query`): when a session's world changes its `routes`, the feeds are
 * rebuilt from the lines the client holds, as if the new rules had always applied (debounced, {@link REBUILD_MS}).
 *  - Each kept line remembers how it came: from a rule (`RouteCtx.rule` set) or from an edit (another extension's or
 *    a trigger's `copyTo/moveTo`, no `rule`). Edit lines are not the rules' doing, so a rebuild keeps them where they
 *    are and merges the rebuilt lines around them by time and id.
 *  - The candidates are the held terminal lines (`mu.lines.query(sid, { rules, limit: 5000 })`) plus the rule lines the
 *    store already has (rematched with `mu.lines.testRoutes`): a line a Move rule took out of the terminal is not held,
 *    and a feed may reach further back than the held lines, so those are rematched rather than lost. A line no rule
 *    matches any more leaves its feed (a removed Move rule's earlier lines included; the world's log still has them).
 *  - Unread: re-derived history is never unread. A line that was unread before the rebuild and is still in its feed
 *    stays unread; a feed whose lines did not change is left alone.
 *  - Moves are not replayed on the terminal: a new Move rule copies earlier lines into its feed but cannot take them
 *    out of the terminal, and a removed one cannot put them back.
 *  - Clear is kept: a rebuild brings back no line older than the newest one held when the feed was cleared.
 *  - On a host without `mu.lines.query` (SDK < 1.15) nothing is rebuilt: rules apply to new lines only, as before.
 */
import type { Dispose, FeedLineView, HeldLine, Mu, RouteCtx, RouteRule } from '@muclient/sdk';
import type { FeedsState } from './model.ts';

/** Lines kept per feed. */
export const FEED_CAP = 500;
/** The setting holding this extension's `RouteRule[]` (scope world). */
export const ROUTES_KEY = 'routes';
/** Rule edits within this many ms (the settings page writes on every keystroke) make one rebuild. */
export const REBUILD_MS = 150;
/** Held lines a rebuild asks the host for (the `mu.lines.query` maximum). */
export const QUERY_LIMIT = 5000;

export interface FeedStore {
  /** A routed line for `target` (the router's `deliver`). `ctx.rule` set: a rule's line; absent: an edit's. */
  deliver(target: string, line: FeedLineView, ctx: Pick<RouteCtx, 'sid'> & Partial<Pick<RouteCtx, 'worldId' | 'rule' | 'move'>>): void;
  /** Called at once with the session's feeds, then on every change (and when its world's rules change). */
  watch(sid: string, fn: (state: FeedsState) => void): Dispose;
  /** Follow a session's world rules while it is open (from `mu.sessions.each`), panel or not, to rebuild on change. */
  attach(sid: string, worldId?: string): Dispose;
  /** Rebuild a session's feeds from its held lines and the world's rules now. False when the host cannot (no `query`). */
  rebuild(sid: string): boolean;
  /** Run any rebuild waiting for its debounce now. */
  flush(): void;
  /** The feed being read at its end (its unread clears and new lines there stop counting), `null` for none. */
  viewing(label: string | null, sid: string): void;
  /** Empty a feed. */
  clear(label: string, sid: string): void;
  /** Drop everything kept for a session. */
  forget(sid: string): void;
  /** Stop every watcher and timer (deactivate). */
  dispose(): void;
  /** The feeds to show for a session, in order. */
  labelsFor(sid: string): string[];
  /** The session's feeds now. */
  get(sid: string): FeedsState;
}

/** A kept line: `edit` when it came by `copyTo/moveTo` (kept across rebuilds), else a rule put it there. */
interface Entry { line: FeedLineView; edit: boolean }

interface Session {
  lines: Record<string, Entry[]>;
  unread: Record<string, number>;
  viewing: string;
  /** Per feed, the newest line when it was cleared: a rebuild does not bring back what Clear took away. */
  cleared: Record<string, FeedLineView>;
  worldId?: string;
  fns: Set<(state: FeedsState) => void>;
  attached: number;
  offRules: Dispose | null;
  timer: ReturnType<typeof setTimeout> | null;
}

/** The enabled rules' targets, trimmed, in rule order. */
export function ruleTargets(rules: unknown): string[] {
  if (!Array.isArray(rules)) return [];
  return (rules as Partial<RouteRule>[])
    .filter((r) => r && typeof r === 'object' && r.enabled !== false)
    .map((r) => (typeof r.target === 'string' ? r.target.trim() : ''))
    .filter(Boolean);
}

/** Line order across lists: by time, then by id for game lines (local lines have negative ids). */
const before = (a: FeedLineView, b: FeedLineView): number => (a.ts - b.ts) || (a.id > 0 && b.id > 0 ? a.id - b.id : 0);
/** Merge two lists each already in line order, keeping each one's own order (ties: `a` first). */
function merge<T>(a: T[], b: T[], key: (x: T) => FeedLineView): T[] {
  const out: T[] = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) out.push(before(key(b[j]), key(a[i])) < 0 ? b[j++] : a[i++]);
  return out.concat(a.slice(i), b.slice(j));
}
const sameBuf = (x: Entry[], y: Entry[]) => x.length === y.length && x.every((e, i) => e.line.id === y[i].line.id && e.edit === y[i].edit);

export function createStore(mu: Pick<Mu, 'settings'> & { lines?: Partial<Pick<Mu['lines'], 'query' | 'testRoutes'>> }): FeedStore {
  const sessions = new Map<string, Session>();
  const session = (sid: string): Session => {
    let s = sessions.get(sid);
    if (!s) sessions.set(sid, (s = { lines: {}, unread: {}, viewing: '', cleared: {}, fns: new Set(), attached: 0, offRules: null, timer: null }));
    return s;
  };
  // The session's world: the one the router last named, else the host resolves it from the sid.
  const scope = (sid: string) => {
    const w = sessions.get(sid)?.worldId;
    return w ? { worldId: w } : { sid };
  };
  const rulesOf = (sid: string): unknown => {
    try { return mu.settings.get<RouteRule[]>(ROUTES_KEY, scope(sid)); } catch { return []; }
  };

  const labelsFor = (sid: string): string[] => {
    const lines = sessions.get(sid)?.lines ?? {};
    const withLines = Object.keys(lines).filter((l) => lines[l].length);
    return [...new Set([...ruleTargets(rulesOf(sid)), ...withLines])];
  };

  const get = (sid: string): FeedsState => {
    const s = sessions.get(sid);
    return {
      labels: labelsFor(sid),
      lines: Object.fromEntries(Object.entries(s?.lines ?? {}).map(([l, buf]) => [l, buf.map((e) => e.line)])),
      unread: { ...(s?.unread ?? {}) },
    };
  };

  const emit = (sid: string) => {
    const s = sessions.get(sid);
    if (!s?.fns.size) return;
    const state = get(sid);
    for (const fn of [...s.fns]) fn(state);
  };

  const rebuild = (sid: string): boolean => {
    const s = sessions.get(sid);
    const query = mu.lines?.query, testRoutes = mu.lines?.testRoutes;
    if (!s || typeof query !== 'function') return false;
    const raw = rulesOf(sid);
    const rules = (Array.isArray(raw) ? raw : []) as RouteRule[];
    let held: HeldLine[];
    try { held = query(sid, { rules, limit: QUERY_LIMIT }) as HeldLine[]; } catch { return false; }
    // A host without the member (a proxy that records the call) answers with something else: keep the old behaviour.
    if (!Array.isArray(held)) return false;
    // The rule lines the store has that the host no longer holds (moved out of the terminal, or older than its buffer).
    const seen = new Set(held.map((h) => h.line.id));
    const extra = new Map<number, FeedLineView>();
    for (const buf of Object.values(s.lines)) for (const e of buf) if (!e.edit && !seen.has(e.line.id)) extra.set(e.line.id, e.line);
    const rematched: HeldLine[] = [];
    if (typeof testRoutes === 'function') {
      for (const line of [...extra.values()].sort(before)) {
        let r: { targets: string[]; move: boolean };
        try { r = testRoutes(line.text, rules); } catch { continue; }
        if (r?.targets?.length) rematched.push({ line, targets: r.targets, move: r.move });
      }
    }
    const all = merge(held, rematched, (h) => h.line);
    const derived: Record<string, Entry[]> = {};
    for (const h of all) for (const t of h.targets) {
      const label = typeof t === 'string' ? t.trim() : '';
      const cut = label ? s.cleared[label] : undefined;
      if (label && !(cut && before(h.line, cut) <= 0)) (derived[label] ??= []).push({ line: h.line, edit: false });
    }
    let changed = false;
    for (const label of new Set([...Object.keys(s.lines), ...Object.keys(derived)])) {
      const old = s.lines[label] ?? [];
      const edits = old.filter((e) => e.edit);
      const editIds = new Set(edits.map((e) => e.line.id));
      let next = merge((derived[label] ?? []).filter((e) => !editIds.has(e.line.id)), edits, (e) => e.line);
      if (next.length > FEED_CAP) next = next.slice(next.length - FEED_CAP);
      if (sameBuf(old, next)) continue;
      changed = true;
      // Unread: only lines that were unread before and are still here (the newest `unread` of the old buffer).
      const n = s.unread[label] ?? 0;
      const was = new Set(old.slice(Math.max(0, old.length - n)).map((e) => `${e.edit ? 'e' : 'r'}${e.line.id}`));
      s.lines[label] = next;
      s.unread[label] = s.viewing === label ? 0 : next.filter((e) => was.has(`${e.edit ? 'e' : 'r'}${e.line.id}`)).length;
    }
    if (changed) emit(sid);
    return true;
  };

  const schedule = (sid: string) => {
    const s = sessions.get(sid);
    if (!s || typeof mu.lines?.query !== 'function') return;
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(() => { s.timer = null; if (sessions.get(sid) === s) rebuild(sid); }, REBUILD_MS);
  };

  // Follow the world's rules while the session is open or watched: a new or disabled rule changes the tabs at once,
  // and the feeds are rebuilt from the held lines once the edits settle. One watcher per session.
  const followRules = (sid: string) => {
    const s = session(sid);
    s.offRules?.();
    s.offRules = mu.settings.watch(ROUTES_KEY, (_v, meta) => { if (!meta?.replay) { emit(sid); schedule(sid); } }, scope(sid));
  };
  const unfollow = (s: Session) => {
    if (s.fns.size || s.attached) return;
    s.offRules?.(); s.offRules = null;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  };
  const drop = (s: Session) => {
    s.offRules?.(); s.offRules = null;
    if (s.timer) { clearTimeout(s.timer); s.timer = null; }
  };

  return {
    deliver(target, line, ctx) {
      const label = typeof target === 'string' ? target.trim() : '';
      if (!label || !ctx?.sid) return;
      const s = session(ctx.sid);
      if (ctx.worldId && ctx.worldId !== s.worldId) { s.worldId = ctx.worldId; if (s.offRules) followRules(ctx.sid); }
      const buf = (s.lines[label] ??= []);
      buf.push({ line, edit: !ctx.rule });
      if (buf.length > FEED_CAP) buf.splice(0, buf.length - FEED_CAP);
      if (s.viewing !== label) s.unread[label] = (s.unread[label] ?? 0) + 1;
      emit(ctx.sid);
    },
    watch(sid, fn) {
      const s = session(sid);
      s.fns.add(fn);
      if (!s.offRules) followRules(sid);
      fn(get(sid));
      return () => { if (s.fns.delete(fn)) unfollow(s); };
    },
    attach(sid, worldId) {
      const s = session(sid);
      s.attached++;
      if (worldId && worldId !== s.worldId) { s.worldId = worldId; if (s.offRules) followRules(sid); }
      if (!s.offRules) followRules(sid);
      let on = true;
      return () => { if (!on) return; on = false; s.attached--; unfollow(s); };
    },
    rebuild,
    flush() {
      for (const [sid, s] of sessions) if (s.timer) { clearTimeout(s.timer); s.timer = null; rebuild(sid); }
    },
    viewing(label, sid) {
      const s = session(sid);
      const l = typeof label === 'string' ? label : '';
      s.viewing = l;
      if (l && s.unread[l]) { s.unread[l] = 0; emit(sid); }
    },
    clear(label, sid) {
      const s = session(sid);
      // The newest line the feed or the client holds now marks what Clear took away.
      let cut: FeedLineView | undefined = s.lines[label]?.at(-1)?.line;
      try {
        const last = typeof mu.lines?.query === 'function' ? mu.lines.query(sid, { limit: 1 }) : null;
        const l = Array.isArray(last) ? last[0]?.line : undefined;
        if (l && (!cut || before(cut, l) < 0)) cut = l;
      } catch { /* no held lines */ }
      if (cut) s.cleared[label] = cut;
      s.lines[label] = [];
      s.unread[label] = 0;
      emit(sid);
    },
    forget(sid) {
      const s = sessions.get(sid);
      if (!s) return;
      drop(s);
      sessions.delete(sid);
    },
    dispose() {
      for (const s of sessions.values()) drop(s);
      sessions.clear();
    },
    labelsFor,
    get,
  };
}
