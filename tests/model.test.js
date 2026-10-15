import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, normalizeProfileUrl, applyProfileSnapshot, applyCitationPage, getTodaySummary, getDailyHistory } from '../extension/lib/model.js';

const p = (id, count, other = {}) => ({ id, title: `Distinctive research paper ${id}`, count, authors: 'A. Researcher', year: 2026, ...other });
const profile = (at, total = 10, papers = [p('a', total)], other = {}) => ({ profileId: 'userABC', name: 'Scholar', total, papers, complete: true, at, ...other });
const result = (id, other = {}) => ({ id: `cid:${id}`, title: `A sufficiently distinctive source ${id}`, authors: `Researcher ${id}`, year: 2026, url: `https://example.org/paper/${id}`, ...other });
const page = (at, results, other = {}) => ({ clusterId: '123', results, start: 0, nextStart: null, complete: true, queryKey: 'cites=123', at, ...other });
const snap = (state, ...args) => applyProfileSnapshot(state, profile(...args)).state;
const source = (state, ...args) => applyCitationPage(state, page(...args)).state;

test('profile URL is canonical and cannot bind arbitrary origins', () => {
  assert.deepEqual(normalizeProfileUrl('https://scholar.google.com/citations?hl=zh&user=ABC_-&view_op=list_works'), { id: 'ABC_-', url: 'https://scholar.google.com/citations?user=ABC_-&hl=en' });
  for (const value of ['https://evil.com/citations?user=ABC', 'https://scholar.google.com.evil.test/citations?user=ABC', 'javascript:alert(1)', 'https://scholar.google.com/citations']) assert.throws(() => normalizeProfileUrl(value));
});

test('first snapshot establishes a zero-count baseline without reporting new citations', () => {
  const original = createState('Asia/Shanghai');
  const { state, event } = applyProfileSnapshot(original, profile('2026-10-15T02:00:00Z', 0, [p('a', 0)]));
  assert.equal(original.latest, null);
  assert.equal(state.latest.total, 0);
  assert.equal(event.kind, 'baseline');
  assert.equal(event.delta, null);
  assert.deepEqual(event.paperChanges, []);
  assert.equal(getTodaySummary(state, '2026-10-15T04:00:00Z').baseline, true);
  assert.equal(getTodaySummary(state, '2026-10-15T04:00:00Z').delta, null);
});

test('daily changes accumulate; a later unchanged check does not erase today’s gain', () => {
  let state = snap(createState('Asia/Shanghai'), '2026-10-14T02:00:00Z', 10);
  state = snap(state, '2026-10-15T02:00:00Z', 13);
  state = snap(state, '2026-10-15T04:00:00Z', 13);
  const today = getTodaySummary(state, '2026-10-15T05:00:00Z');
  assert.equal(today.delta, 3); assert.equal(today.changes[0].delta, 3);
  assert.equal(getDailyHistory(state)[0].delta, 3);
  assert.equal(getTodaySummary(state, '2026-10-16T05:00:00Z').delta, null);
});

test('same total still records offsetting per-paper changes, including declines', () => {
  let state = snap(createState('UTC'), '2026-10-14T02:00:00Z', 10, [p('a', 5), p('b', 5)]);
  const applied = applyProfileSnapshot(state, profile('2026-10-15T02:00:00Z', 10, [p('a', 7), p('b', 3)]));
  assert.equal(applied.event.delta, 0);
  assert.deepEqual(applied.event.paperChanges.map(change => change.delta), [2, -2]);
  assert.equal(getTodaySummary(applied.state, '2026-10-15T04:00:00Z').changes.length, 2);
  assert.equal(state.latest.papers[0].count, 5);
});

test('new publications are tracked without labeling their historical citations new', () => {
  let state = snap(createState('UTC'), '2026-10-14T02:00:00Z', 10);
  state = snap(state, '2026-10-15T02:00:00Z', 31, [p('a', 11), p('b', 20)]);
  state = snap(state, '2026-10-15T03:00:00Z', 32, [p('a', 11), p('b', 21)]);
  const added = getTodaySummary(state, '2026-10-15T04:00:00Z').changes.find(change => change.id === 'b');
  assert.equal(added.kind, 'added'); assert.equal(added.before, null); assert.equal(added.after, 21); assert.equal(added.delta, null);
});

test('missing papers on a partial profile are never deletions', () => {
  const state = snap(createState('UTC'), '2026-10-14T02:00:00Z', 10, [p('a', 5), p('b', 5)]);
  const partial = applyProfileSnapshot(state, profile('2026-10-15T02:00:00Z', 10, [p('a', 5)], { complete: false }));
  assert.deepEqual(partial.event.paperChanges, []);
  const complete = applyProfileSnapshot(state, profile('2026-10-15T02:00:00Z', 5, [p('a', 5)]));
  assert.equal(complete.event.paperChanges[0].kind, 'removed');
  assert.equal(complete.event.paperChanges[0].delta, null);
});

test('paper identity changes with the same cluster do not create a fake new publication', () => {
  const state = snap(createState('UTC'), '2026-10-14T02:00:00Z', 10, [p('old', 10, { clusterId: '123' })]);
  const applied = applyProfileSnapshot(state, profile('2026-10-15T02:00:00Z', 11, [p('new', 11, { clusterId: '123' })]));
  assert.equal(applied.event.paperChanges.length, 1); assert.equal(applied.event.paperChanges[0].kind, 'changed'); assert.equal(applied.event.paperChanges[0].delta, 1);
});

test('partial snapshots retain unseen papers and their original observation timestamps', () => {
  let state = snap(createState('UTC'), '2026-10-12T02:00:00Z', 10, [p('a', 5), p('b', 5)]);
  state = snap(state, '2026-10-13T02:00:00Z', 10, [p('a', 5)], { complete: false });
  state = snap(state, '2026-10-14T02:00:00Z', 11, [p('a', 5)], { complete: false });
  const stale = state.latest.papers.find(paper => paper.id === 'b');
  assert.equal(stale.stale, true); assert.equal(stale.countObservedAt, '2026-10-12T02:00:00.000Z');
  assert.deepEqual(state.latest.observedIds, ['a']);
  state = snap(state, '2026-10-15T02:00:00Z', 12, [p('a', 5), p('b', 7)]);
  const today = getTodaySummary(state, '2026-10-15T03:00:00Z');
  assert.equal(today.delta, 1); assert.equal(today.gap, false);
  assert.equal(today.changes[0].kind, 'changed'); assert.equal(today.changes[0].delta, null);
  assert.equal(today.changes[0].intervalDelta, 2); assert.equal(today.changes[0].gap, true);
});

test('newly visible papers after a partial snapshot are observed, not proven additions', () => {
  let state = snap(createState('UTC'), '2026-10-14T02:00:00Z', 20, [p('a', 10)], { complete: false });
  state = snap(state, '2026-10-15T02:00:00Z', 21, [p('a', 10), p('b', 11)]);
  assert.equal(state.events.at(-1).paperChanges[0].kind, 'observed');
  assert.equal(state.events.at(-1).paperChanges[0].delta, null);
});

test('local calendar days determine gaps; gaps are not apportioned across days', () => {
  let state = snap(createState('Asia/Shanghai'), '2026-10-12T15:30:00Z', 10);
  state = snap(state, '2026-10-14T16:30:00Z', 17);
  const today = getTodaySummary(state, '2026-10-14T17:00:00Z');
  assert.equal(state.events.at(-1).day, '2026-10-15');
  assert.equal(today.gap, true); assert.equal(today.delta, null); assert.equal(today.intervalDelta, 7);
  const history = getDailyHistory(state);
  assert.equal(history.length, 2); assert.equal(history[0].kind, 'gap'); assert.equal(history[0].delta, 7);
  assert.equal(history.some(row => row.day === '2026-10-13'), false);
});

test('crossing one local midnight is a daily observation, including DST boundaries', () => {
  let state = snap(createState('America/New_York'), '2026-03-08T04:00:00Z', 10);
  state = snap(state, '2026-03-09T03:30:00Z', 12);
  assert.equal(state.events.at(-1).kind, 'change');
  assert.equal(getTodaySummary(state, '2026-03-09T03:45:00Z').delta, 2);
});

test('changing profile resets its history and citation sources', () => {
  let state = snap(createState('UTC'), '2026-10-14T02:00:00Z');
  state = source(state, '2026-10-14T03:00:00Z', [result('a')]);
  const applied = applyProfileSnapshot(state, profile('2026-10-15T02:00:00Z', 90, [p('x', 90)], { profileId: 'otherABC' }));
  assert.equal(applied.event.kind, 'baseline'); assert.equal(applied.state.events.length, 1); assert.deepEqual(applied.state.sources, {});
});

test('invalid counts and stale snapshots cannot overwrite a successful record', () => {
  const state = snap(createState('UTC'), '2026-10-14T02:00:00Z');
  assert.throws(() => applyProfileSnapshot(state, profile('2026-10-13T02:00:00Z')));
  assert.throws(() => applyProfileSnapshot(state, profile('2026-10-15T02:00:00Z', -1)));
  assert.throws(() => applyProfileSnapshot(state, profile('2026-10-15T02:00:00Z', 10, [p('a', -1)])));
  assert.equal(applyProfileSnapshot(state, profile('2026-10-14T02:00:00Z')).event, null);
  assert.equal(state.latest.total, 10);
});

test('first complete citation pass establishes a baseline, then complete diffs can discover sources', () => {
  const initial = createState('UTC');
  const first = applyCitationPage(initial, page('2026-10-14T02:00:00Z', [result('a')]));
  assert.equal(first.newCount, 0); assert.deepEqual(first.state.sources['123'].newResults, []);
  const next = applyCitationPage(first.state, page('2026-10-15T02:00:00Z', [result('a'), result('b')]));
  assert.equal(next.newCount, 1); assert.equal(next.state.sources['123'].newResults[0].discoveredAt, '2026-10-15T02:00:00.000Z');
  assert.deepEqual(initial.sources, {}); assert.equal(first.state.sources['123'].baseline.results.length, 1);
});

test('a page opened in the middle never establishes a baseline or labels its sources new', () => {
  const state = source(createState('UTC'), '2026-10-14T02:00:00Z', [result('b')], { start: 10 });
  assert.equal(state.sources['123'].status, 'partial'); assert.equal(state.sources['123'].baseline, null);
  assert.equal(state.sources['123'].known.length, 1); assert.deepEqual(state.sources['123'].newResults, []);
});

test('source baseline requires a contiguous traversal from zero through the last page', () => {
  let state = source(createState('UTC'), '2026-10-14T02:00:00Z', [result('a')], { nextStart: 10, complete: false });
  state = source(state, '2026-10-14T02:05:00Z', [result('c')], { start: 20 });
  assert.equal(state.sources['123'].baseline, null);
  state = source(state, '2026-10-14T02:10:00Z', [result('b')], { start: 10, nextStart: 20, complete: false });
  state = source(state, '2026-10-14T02:15:00Z', [result('c')], { start: 20 });
  assert.equal(state.sources['123'].baseline.results.length, 3);
  assert.equal(state.sources['123'].status, 'ready'); assert.deepEqual(state.sources['123'].newResults, []);
});

test('filtered queries preserve the confirmed baseline and never generate new citations', () => {
  let state = source(createState('UTC'), '2026-10-14T02:00:00Z', [result('a')]);
  const baseline = structuredClone(state.sources['123'].baseline);
  const filtered = applyCitationPage(state, page('2026-10-15T02:00:00Z', [result('b')], { queryKey: 'cites=123&as_ylo=2026', complete: true }));
  assert.equal(filtered.newCount, 0); assert.equal(filtered.state.sources['123'].status, 'partial');
  assert.deepEqual(filtered.state.sources['123'].baseline, baseline);
  assert.equal(filtered.state.sources['123'].known.length, 2);
});

test('interrupted complete passes retain the prior baseline until every page is read', () => {
  let state = source(createState('UTC'), '2026-10-14T02:00:00Z', [result('a')]);
  state = source(state, '2026-10-15T02:00:00Z', [result('b')], { nextStart: 10, complete: false });
  assert.equal(state.sources['123'].baseline.results[0].id, 'cid:a');
  assert.deepEqual(state.sources['123'].newResults, []);
  const completed = applyCitationPage(state, page('2026-10-15T02:10:00Z', [result('a')], { start: 10 }));
  assert.equal(completed.newCount, 1);
});

test('an expired source traversal keeps the confirmed baseline and requires a fresh first page', () => {
  let state = source(createState('UTC'), '2026-10-14T02:00:00Z', [result('a')]);
  const baseline = structuredClone(state.sources['123'].baseline);
  state = source(state, '2026-10-15T02:00:00Z', [result('b')], { nextStart: 10, complete: false });
  const expired = applyCitationPage(state, page('2026-10-15T02:30:01Z', [result('a')], { start: 10 }));
  assert.equal(expired.newCount, 0);
  assert.equal(expired.state.sources['123'].status, 'partial');
  assert.equal(expired.state.sources['123'].reason, 'traversal-expired');
  assert.equal(expired.state.sources['123'].traversal, null);
  assert.deepEqual(expired.state.sources['123'].baseline, baseline);
  assert.deepEqual(expired.state.sources['123'].newResults, []);
  assert.equal(expired.state.sources['123'].known.length, 2);
  // Reopening only the last page cannot revive an expired pass.
  state = source(expired.state, '2026-10-15T02:35:00Z', [result('a')], { start: 10 });
  assert.deepEqual(state.sources['123'].baseline, baseline);
  state = source(state, '2026-10-15T02:40:00Z', [result('b')], { nextStart: 10, complete: false });
  const refreshed = applyCitationPage(state, page('2026-10-15T02:45:00Z', [result('a')], { start: 10 }));
  assert.equal(refreshed.newCount, 1);
  assert.equal(refreshed.state.sources['123'].status, 'ready');
});

test('intermediate source pages do not extend the thirty-minute traversal lifetime', () => {
  let state = source(createState('UTC'), '2026-10-14T02:00:00Z', [result('a')], { nextStart: 10, complete: false });
  state = source(state, '2026-10-14T02:25:00Z', [result('b')], { start: 10, nextStart: 20, complete: false });
  state = source(state, '2026-10-14T02:35:00Z', [result('c')], { start: 20 });
  assert.equal(state.sources['123'].baseline, null);
  assert.equal(state.sources['123'].reason, 'traversal-expired');
  assert.deepEqual(state.sources['123'].newResults, []);
});

test('citation ids or URLs changing do not create a false new relation when identity still matches', () => {
  let state = source(createState('UTC'), '2026-10-14T02:00:00Z', [result('a')]);
  const next = applyCitationPage(state, page('2026-10-15T02:00:00Z', [result('a', { id: 'cid:moved', url: 'https://another.example/paper', title: 'A Sufficiently Distinctive Source: a' })]));
  assert.equal(next.newCount, 0); assert.equal(next.state.sources['123'].known.length, 1);
});

test('duplicate page results are deduplicated and repeated complete passes are quiet', () => {
  let state = source(createState('UTC'), '2026-10-14T02:00:00Z', [result('a'), result('a')]);
  state = source(state, '2026-10-15T02:00:00Z', [result('a'), result('b')]);
  const next = applyCitationPage(state, page('2026-10-15T03:00:00Z', [result('a'), result('b'), result('b')]));
  assert.equal(next.newCount, 0); assert.equal(next.state.sources['123'].baseline.results.length, 2);
  assert.equal(next.state.sources['123'].newResults.length, 1);
});

test('invalid source records cannot silently become a confirmed complete baseline', () => {
  const state = source(createState('UTC'), '2026-10-14T02:00:00Z', [result('a'), { id: 'broken' }]);
  assert.equal(state.sources['123'].baseline, null); assert.equal(state.sources['123'].status, 'partial');
});

test('source storage limits leave large scans partial rather than pretending the baseline is complete', () => {
  const state = source(createState('UTC'), '2026-10-14T02:00:00Z', Array.from({ length: 501 }, (_, index) => result(index)));
  assert.equal(state.sources['123'].status, 'partial'); assert.equal(state.sources['123'].reason, 'storage-limit');
  assert.equal(state.sources['123'].known.length, 500); assert.equal(state.sources['123'].baseline, null);
});

test('snapshot history is bounded while preserving the most recent observations', () => {
  let state = createState('UTC');
  for (let index = 0; index < 405; index++) state = snap(state, new Date(Date.UTC(2026, 0, 1, index)).toISOString(), index);
  assert.equal(state.events.length, 400); assert.equal(state.latest.total, 404);
  assert.equal(getDailyHistory(state)[0].total, 404);
});
