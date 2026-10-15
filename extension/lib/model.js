/** Pure, local snapshot and citation-source accounting. No network or Chrome APIs. */
const MAX_EVENTS = 400;
const MAX_SOURCE_CLUSTERS = 12;
const MAX_SOURCE_RESULTS = 500;
const MAX_NEW_RESULTS = 200;
// A manually browsed list is only comparable while its pages are reasonably fresh.
// This limits the whole pass, rather than extending its lifetime on every page.
const MAX_TRAVERSAL_AGE_MS = 30 * 60 * 1000;

const clone = value => structuredClone(value);
const text = value => typeof value === 'string' ? value.trim() : '';

function timestamp(value) {
  const date = new Date(value);
  if (value == null || Number.isNaN(date.getTime())) throw new TypeError('A valid snapshot timestamp is required.');
  return date.toISOString();
}

function localDay(value, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const part = name => parts.find(p => p.type === name).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function dayNumber(day) { return Date.parse(`${day}T00:00:00Z`) / 86400000; }
function count(value, nullable = false) {
  if (nullable && value == null) return null;
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Citation counts must be non-negative integers.');
  return value;
}

function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}

function canonicalUrl(value) {
  const valid = safeUrl(value);
  if (!valid) return '';
  const url = new URL(valid);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}${url.search}`;
}

function normalizedTitle(value) {
  return text(value).normalize('NFKC').toLowerCase().replace(/^\[(?:pdf|html|citation|book)\]\s*/i, '').replace(/[^\p{L}\p{N}]/gu, '');
}

function normalizedAuthors(value) {
  return text(Array.isArray(value) ? value.join(', ') : value).normalize('NFKC').toLowerCase().split(/[,;，]|\bet al\b/)[0].replace(/[^\p{L}\p{N}]/gu, '');
}

function sameTitle(a, b) {
  const titleA = normalizedTitle(a.title), titleB = normalizedTitle(b.title);
  if (titleA.length < 12 || titleA !== titleB) return false;
  if (a.year && b.year && String(a.year) !== String(b.year)) return false;
  const authorA = normalizedAuthors(a.authors), authorB = normalizedAuthors(b.authors);
  return !authorA || !authorB || authorA === authorB;
}

/** Canonical public profile URL; never preserve unrelated query parameters. */
export function normalizeProfileUrl(input) {
  let url;
  try { url = new URL(text(input)); } catch { throw new TypeError('Enter a Google Scholar profile URL.'); }
  const id = url.searchParams.get('user');
  if (url.protocol !== 'https:' || url.hostname !== 'scholar.google.com' || url.pathname !== '/citations' || !/^[\w-]+$/.test(id || '')) {
    throw new TypeError('Enter an HTTPS Google Scholar profile URL containing user=.');
  }
  return { id, url: `https://scholar.google.com/citations?user=${encodeURIComponent(id)}&hl=en` };
}

export function createState(timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') {
  // Validate once, rather than silently changing how a user's days are counted.
  localDay('2020-01-01T00:00:00Z', timeZone);
  return {
    schemaVersion: 1,
    settings: { profileId: null, profileUrl: '', intervalHours: 24, notifications: true, timeZone },
    profile: null, latest: null, events: [], sources: {},
    status: { phase: 'idle', lastAttemptAt: null, lastSuccessAt: null, error: null, nextCheckAt: null }
  };
}

function normalizePaper(paper) {
  const id = text(paper.id);
  if (!id || !text(paper.title)) throw new TypeError('A paper id and title are required.');
  return {
    id, title: text(paper.title), count: count(paper.count, true),
    authors: Array.isArray(paper.authors) ? paper.authors.join(', ') : text(paper.authors),
    year: paper.year == null ? null : String(paper.year), url: safeUrl(paper.url),
    citedByUrl: safeUrl(paper.citedByUrl), clusterId: paper.clusterId == null ? null : String(paper.clusterId)
  };
}

function samePaper(a, b) {
  return a.id === b.id || (a.clusterId && a.clusterId === b.clusterId) || sameTitle(a, b);
}

function paperChanges(previous, current, timeZone) {
  const changes = [], matched = new Set();
  for (const paper of current.papers) {
    const before = previous.papers.find(p => !matched.has(p.id) && samePaper(p, paper));
    if (!before) {
      changes.push({ ...paper, before: null, after: paper.count, delta: null, kind: previous.complete ? 'added' : 'observed' });
      continue;
    }
    matched.add(before.id);
    if (before.count != null && paper.count != null && before.count !== paper.count) {
      const fromAt = before.countObservedAt || previous.at;
      const gap = dayNumber(localDay(current.at, timeZone)) - dayNumber(localDay(fromAt, timeZone)) > 1;
      changes.push({ ...paper, before: before.count, after: paper.count, delta: gap ? null : paper.count - before.count, intervalDelta: gap ? paper.count - before.count : null, gap, fromAt, toAt: current.at, kind: 'changed' });
    }
  }
  // An incomplete page never proves an old publication has disappeared.
  if (current.complete) for (const paper of previous.papers) if (!matched.has(paper.id)) {
    changes.push({ ...paper, before: paper.count, after: null, delta: null, kind: 'removed' });
  }
  return changes;
}

export function applyProfileSnapshot(state, snapshot) {
  const profileId = text(snapshot.profileId);
  if (!/^[\w-]+$/.test(profileId)) throw new TypeError('A valid profile id is required.');
  const at = timestamp(snapshot.at);
  const papers = (snapshot.papers || []).map(normalizePaper);
  if (new Set(papers.map(p => p.id)).size !== papers.length) throw new TypeError('A snapshot must not contain duplicate paper ids.');
  const current = { profileId, name: text(snapshot.name), total: count(snapshot.total), papers, observedIds: papers.map(p => p.id), complete: snapshot.complete === true, at };
  const next = clone(state);
  const changedProfile = state.latest && state.latest.profileId !== profileId;
  if (changedProfile) { next.latest = null; next.events = []; next.sources = {}; }
  const previous = next.latest;
  if (previous && Date.parse(at) < Date.parse(previous.at)) throw new RangeError('An older snapshot cannot replace the latest snapshot.');
  if (previous && at === previous.at) return { state: clone(state), event: null };
  current.papers = current.papers.map(paper => ({ ...paper, countObservedAt: paper.count == null ? null : at, stale: false }));
  const day = localDay(at, next.settings.timeZone);
  const gap = previous && dayNumber(day) - dayNumber(localDay(previous.at, next.settings.timeZone)) > 1;
  const event = {
    id: `${profileId}:${previous?.at || 'baseline'}:${at}`,
    fromAt: previous?.at || null, toAt: at, day,
    fromTotal: previous?.total ?? null, toTotal: current.total,
    delta: previous ? current.total - previous.total : null,
    kind: previous ? (gap ? 'gap' : 'change') : 'baseline',
    paperChanges: previous ? paperChanges(previous, current, next.settings.timeZone) : [], complete: current.complete
  };
  if (previous && !current.complete) {
    const unobserved = previous.papers.filter(old => !current.papers.some(paper => samePaper(old, paper)));
    current.papers.push(...unobserved.map(paper => ({ ...paper, stale: true })));
  }
  const url = normalizeProfileUrl(`https://scholar.google.com/citations?user=${profileId}`).url;
  next.settings.profileId = profileId; next.settings.profileUrl = url;
  next.profile = { id: profileId, name: current.name, url };
  next.latest = current;
  next.events = [...next.events, event].slice(-MAX_EVENTS);
  next.status = { ...next.status, phase: 'idle', lastAttemptAt: at, lastSuccessAt: at, error: null };
  return { state: next, event: clone(event) };
}

function aggregateChanges(events) {
  const items = new Map();
  for (const event of events) for (const change of event.paperChanges) {
    const previous = items.get(change.id);
    if (!previous) { items.set(change.id, clone(change)); continue; }
    const updated = { ...previous, ...change, before: previous.before };
    // Do not turn an added publication's historical citations into new citations.
    updated.kind = ['added', 'observed'].includes(previous.kind) ? previous.kind : change.kind;
    updated.gap = Boolean(previous.gap || change.gap);
    updated.fromAt = previous.fromAt || change.fromAt;
    updated.delta = !updated.gap && updated.before != null && updated.after != null && updated.kind === 'changed' ? updated.after - updated.before : null;
    updated.intervalDelta = updated.gap && updated.before != null && updated.after != null ? updated.after - updated.before : null;
    items.set(change.id, updated);
  }
  return [...items.values()].filter(item => item.delta !== 0);
}

export function getTodaySummary(state, now = new Date().toISOString()) {
  const day = localDay(timestamp(now), state.settings.timeZone);
  const events = state.events.filter(event => event.day === day);
  const comparisons = events.filter(event => event.kind !== 'baseline');
  const gap = comparisons.some(event => event.kind === 'gap');
  const baseline = !state.latest || (!comparisons.length && (events.some(event => event.kind === 'baseline') || state.events.every(event => event.kind === 'baseline')));
  return {
    delta: comparisons.length && !gap ? comparisons.reduce((sum, event) => sum + event.delta, 0) : null,
    changes: aggregateChanges(comparisons), baseline, gap,
    intervalDelta: gap ? comparisons.reduce((sum, event) => sum + event.delta, 0) : null,
    fromAt: comparisons[0]?.fromAt || events[0]?.toAt || null,
    toAt: events.at(-1)?.toAt || null
  };
}

/** Newest first. Gap rows retain their interval delta and are never split into days. */
export function getDailyHistory(state) {
  const rows = [], days = new Map();
  for (const event of state.events) {
    if (event.kind === 'gap') {
      rows.push({ id: event.id, day: event.day, date: event.day, total: event.toTotal, delta: event.delta, kind: 'gap', fromAt: event.fromAt, toAt: event.toAt, complete: event.complete });
      continue;
    }
    let row = days.get(event.day);
    if (!row) {
      row = { id: `day:${event.day}`, day: event.day, date: event.day, total: event.toTotal, delta: null, kind: 'baseline', fromAt: event.fromAt, toAt: event.toAt, complete: event.complete };
      days.set(event.day, row); rows.push(row);
    }
    row.total = event.toTotal; row.toAt = event.toAt; row.complete = row.complete && event.complete;
    if (event.kind === 'change') {
      row.kind = 'change'; row.delta = (row.delta ?? 0) + event.delta;
      if (row.fromAt == null) row.fromAt = event.fromAt;
    }
  }
  return rows.sort((a, b) => b.toAt.localeCompare(a.toAt));
}

function normalizeResult(result, at) {
  if (!text(result?.title)) return null;
  const id = text(result.id), url = safeUrl(result.url);
  return {
    id: id || `title:${normalizedTitle(result.title)}:${normalizedAuthors(result.authors)}:${result.year || ''}`,
    title: text(result.title), authors: Array.isArray(result.authors) ? result.authors.join(', ') : text(result.authors),
    year: result.year == null ? null : String(result.year), url,
    firstSeenAt: result.firstSeenAt || at,
    aliases: { ids: id ? [id] : [], urls: url ? [canonicalUrl(url)] : [] }
  };
}

function sameResult(a, b) {
  const idsA = new Set([a.id, ...(a.aliases?.ids || [])]);
  if ([b.id, ...(b.aliases?.ids || [])].some(id => idsA.has(id))) return true;
  const urlsA = new Set([canonicalUrl(a.url), ...(a.aliases?.urls || [])].filter(Boolean));
  if ([canonicalUrl(b.url), ...(b.aliases?.urls || [])].filter(Boolean).some(url => urlsA.has(url))) return true;
  return sameTitle(a, b);
}

function mergeResult(before, after) {
  return {
    ...before, ...after, id: before.id, firstSeenAt: before.firstSeenAt || after.firstSeenAt,
    aliases: {
      ids: [...new Set([before.id, after.id, ...(before.aliases?.ids || []), ...(after.aliases?.ids || [])])].slice(-12),
      urls: [...new Set([canonicalUrl(before.url), canonicalUrl(after.url), ...(before.aliases?.urls || []), ...(after.aliases?.urls || [])].filter(Boolean))].slice(-12)
    }
  };
}

function mergeResults(existing, incoming) {
  const results = existing.map(clone);
  for (const result of incoming) {
    const index = results.findIndex(candidate => sameResult(candidate, result));
    if (index === -1) results.push(clone(result)); else results[index] = mergeResult(results[index], result);
  }
  return results;
}

export function applyCitationPage(state, page) {
  const clusterId = String(page.clusterId || '');
  if (!/^\d+$/.test(clusterId)) throw new TypeError('A numeric citing-list cluster id is required.');
  const at = timestamp(page.at), start = Number(page.start ?? 0);
  const nextStart = page.nextStart == null ? null : Number(page.nextStart);
  if (!Number.isSafeInteger(start) || start < 0 || (nextStart != null && (!Number.isSafeInteger(nextStart) || nextStart <= start))) throw new TypeError('Invalid citation pagination.');
  const queryKey = text(page.queryKey);
  const unfiltered = queryKey === `cites=${clusterId}`;
  const rawResults = Array.isArray(page.results) ? page.results : [];
  const incoming = rawResults.map(result => normalizeResult(result, at)).filter(Boolean);
  const next = clone(state);
  const source = next.sources[clusterId] || { status: 'pending', known: [], baseline: null, traversal: null, newResults: [], lastCheckedAt: null, reason: null };
  // Ignore delayed callbacks, which otherwise could roll back an established source baseline.
  if (source.lastCheckedAt && Date.parse(at) < Date.parse(source.lastCheckedAt)) return { state: next, newCount: 0 };
  source.known = mergeResults(source.known, incoming).slice(-MAX_SOURCE_RESULTS);
  source.lastCheckedAt = at;
  let newCount = 0;
  if (!unfiltered) {
    source.status = 'partial'; source.reason = 'filtered';
  } else {
    if (start === 0) source.traversal = { queryKey, pages: [], results: [], nextStart: 0, startedAt: at, overflow: false, invalid: false };
    const traversal = source.traversal;
    const traversalStartedAt = traversal ? Date.parse(traversal.startedAt) : NaN;
    if (traversal && (!Number.isFinite(traversalStartedAt) || Date.parse(at) - traversalStartedAt > MAX_TRAVERSAL_AGE_MS)) {
      source.traversal = null;
      source.status = 'partial'; source.reason = 'traversal-expired';
    } else if (!traversal || traversal.queryKey !== queryKey || traversal.nextStart !== start) {
      source.status = 'partial'; source.reason = 'missing-pages';
    } else {
      const allResults = mergeResults(traversal.results, incoming);
      traversal.overflow ||= allResults.length > MAX_SOURCE_RESULTS || traversal.pages.length >= 100;
      traversal.invalid ||= incoming.length !== rawResults.length;
      // Bound traversal data even for very large citing lists.
      traversal.results = allResults.slice(0, MAX_SOURCE_RESULTS);
      if (traversal.pages.length < 100) traversal.pages.push({ start, nextStart });
      traversal.nextStart = nextStart;
      source.status = 'partial'; source.reason = traversal.overflow ? 'storage-limit' : 'in-progress';
      if (page.complete === true && nextStart == null && !traversal.overflow && !traversal.invalid) {
        const completeResults = traversal.results.map(result => {
          const known = source.known.find(previous => sameResult(previous, result));
          return known ? mergeResult(known, result) : result;
        });
        if (source.baseline) {
          const newlySeen = completeResults.filter(result => !source.baseline.results.some(previous => sameResult(previous, result)));
          const additions = newlySeen.filter(result => !source.newResults.some(previous => sameResult(previous, result))).map(result => ({ ...result, discoveredAt: at }));
          source.newResults = [...source.newResults, ...additions].slice(-MAX_NEW_RESULTS);
          newCount = additions.length;
        }
        source.baseline = { results: completeResults, at };
        source.traversal = null; source.status = 'ready'; source.reason = null;
      }
    }
  }
  next.sources[clusterId] = source;
  const keys = Object.keys(next.sources).sort((a, b) => (next.sources[b].lastCheckedAt || '').localeCompare(next.sources[a].lastCheckedAt || ''));
  for (const key of keys.slice(MAX_SOURCE_CLUSTERS)) delete next.sources[key];
  return { state: next, newCount };
}
