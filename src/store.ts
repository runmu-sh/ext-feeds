/**
 * The extension's own per-session feed buffers (replaces the host's `mu.feeds`, removed in SDK 2.0). The line router
 * (`mu.lines.route`, wired in src/index.ts) calls `deliver`; the panels `watch`, report `viewing`, and `clear`.
 * Semantics follow the old host buffers (clients/web/src/features/rules/feeds.ts at 74d7bfa): the last 500 lines per
 * feed, a line counts as unread unless that feed is the one being viewed, viewing a feed marks it read, clearing
 * empties it. `labels` follows the old `feedsView`: the enabled rules' targets for the session's world, in rule
 * order, then any other feed holding lines.
 */
import type { Dispose, FeedLineView, Mu, RouteCtx, RouteRule } from '@muclient/sdk';
import type { FeedsState } from './model.ts';

/** Lines kept per feed. */
export const FEED_CAP = 500;
/** The setting holding this extension's `RouteRule[]` (scope world). */
export const ROUTES_KEY = 'routes';

export interface FeedStore {
  /** A routed line for `target` (the router's `deliver`). */
  deliver(target: string, line: FeedLineView, ctx: Pick<RouteCtx, 'sid'> & Partial<Pick<RouteCtx, 'worldId'>>): void;
  /** Called at once with the session's feeds, then on every change (and when its world's rules change). */
  watch(sid: string, fn: (state: FeedsState) => void): Dispose;
  /** The feed being read at its end (its unread clears and new lines there stop counting), `null` for none. */
  viewing(label: string | null, sid: string): void;
  /** Empty a feed. */
  clear(label: string, sid: string): void;
  /** Drop everything kept for a session. */
  forget(sid: string): void;
  /** The feeds to show for a session, in order. */
  labelsFor(sid: string): string[];
  /** The session's feeds now. */
  get(sid: string): FeedsState;
}

interface Session {
  lines: Record<string, FeedLineView[]>;
  unread: Record<string, number>;
  viewing: string;
  worldId?: string;
  fns: Set<(state: FeedsState) => void>;
  offRules: Dispose | null;
}

/** The enabled rules' targets, trimmed, in rule order. */
export function ruleTargets(rules: unknown): string[] {
  if (!Array.isArray(rules)) return [];
  return (rules as Partial<RouteRule>[])
    .filter((r) => r && typeof r === 'object' && r.enabled !== false)
    .map((r) => (typeof r.target === 'string' ? r.target.trim() : ''))
    .filter(Boolean);
}

export function createStore(mu: Pick<Mu, 'settings'>): FeedStore {
  const sessions = new Map<string, Session>();
  const session = (sid: string): Session => {
    let s = sessions.get(sid);
    if (!s) sessions.set(sid, (s = { lines: {}, unread: {}, viewing: '', fns: new Set(), offRules: null }));
    return s;
  };
  // The session's world: the one the router last named, else the host resolves it from the sid.
  const scope = (sid: string) => {
    const w = sessions.get(sid)?.worldId;
    return w ? { worldId: w } : { sid };
  };

  const labelsFor = (sid: string): string[] => {
    let rules: unknown = [];
    try { rules = mu.settings.get<RouteRule[]>(ROUTES_KEY, scope(sid)); } catch { rules = []; }
    const lines = sessions.get(sid)?.lines ?? {};
    const withLines = Object.keys(lines).filter((l) => lines[l].length);
    return [...new Set([...ruleTargets(rules), ...withLines])];
  };

  const get = (sid: string): FeedsState => {
    const s = sessions.get(sid);
    return {
      labels: labelsFor(sid),
      lines: Object.fromEntries(Object.entries(s?.lines ?? {}).map(([l, buf]) => [l, [...buf]])),
      unread: { ...(s?.unread ?? {}) },
    };
  };

  const emit = (sid: string) => {
    const s = sessions.get(sid);
    if (!s?.fns.size) return;
    const state = get(sid);
    for (const fn of [...s.fns]) fn(state);
  };

  // Follow the world's rules while anyone watches, so a new or disabled rule changes the tabs.
  const followRules = (sid: string) => {
    const s = session(sid);
    s.offRules?.();
    s.offRules = mu.settings.watch(ROUTES_KEY, (_v, meta) => { if (!meta?.replay) emit(sid); }, scope(sid));
  };

  return {
    deliver(target, line, ctx) {
      const label = typeof target === 'string' ? target.trim() : '';
      if (!label || !ctx?.sid) return;
      const s = session(ctx.sid);
      if (ctx.worldId && ctx.worldId !== s.worldId) { s.worldId = ctx.worldId; if (s.fns.size) followRules(ctx.sid); }
      const buf = (s.lines[label] ??= []);
      buf.push(line);
      if (buf.length > FEED_CAP) buf.splice(0, buf.length - FEED_CAP);
      if (s.viewing !== label) s.unread[label] = (s.unread[label] ?? 0) + 1;
      emit(ctx.sid);
    },
    watch(sid, fn) {
      const s = session(sid);
      s.fns.add(fn);
      if (!s.offRules) followRules(sid);
      fn(get(sid));
      return () => {
        if (!s.fns.delete(fn) || s.fns.size) return;
        s.offRules?.(); s.offRules = null;
      };
    },
    viewing(label, sid) {
      const s = session(sid);
      const l = typeof label === 'string' ? label : '';
      s.viewing = l;
      if (l && s.unread[l]) { s.unread[l] = 0; emit(sid); }
    },
    clear(label, sid) {
      const s = session(sid);
      s.lines[label] = [];
      s.unread[label] = 0;
      emit(sid);
    },
    forget(sid) {
      const s = sessions.get(sid);
      if (!s) return;
      s.offRules?.();
      sessions.delete(sid);
    },
    labelsFor,
    get,
  };
}
