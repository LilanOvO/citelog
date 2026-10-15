import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../extension/lib/controller.js';
import { createState, applyProfileSnapshot } from '../extension/lib/model.js';

const profileURL = 'https://scholar.google.com/citations?user=Review';
const citationURL = 'https://scholar.google.com/scholar?cites=123';
const baseTime = Date.parse('2026-10-15T04:00:00Z');
const profile = {
  profileId: 'Review', name: 'Synthetic review profile', total: 10, complete: true, at: baseTime,
  papers: [{ id: 'Review:a', title: 'A synthetic research paper', count: 10, clusterId: '123', url: `${profileURL}&citation_for_view=Review:a`, citedByUrl: citationURL }],
};

function environment(parseHtml, options = {}) {
  let clock = baseTime;
  let state = applyProfileSnapshot(createState('UTC'), profile).state;
  const noop = async () => {};
  const chromeApi = {
    runtime: { id: 'review-extension' },
    storage: { local: { get: async () => ({ citepulse: structuredClone(state) }), set: async (value) => { state = structuredClone(value.citepulse); } } },
    action: { setBadgeText: noop, setBadgeBackgroundColor: noop, setTitle: noop },
    alarms: { clear: noop, get: async () => null, create: noop },
    notifications: { create: noop }, tabs: { create: noop },
  };
  const controller = createController({ chromeApi, parseHtml, now: () => clock, timeZone: 'UTC', fetchFn: options.fetch || (() => { throw new Error('Source capture must never fetch a page'); }) });
  return { controller, state: () => state, tick: () => { clock += 1000; }, advance: (ms) => { clock += ms; } };
}

function sender(url, id = 1) { return { id: 'review-extension', tab: { id }, url, frameId: 0, documentId: `doc-${id}` }; }
function page(start, ids) {
  return {
    clusterId: '123', start, nextStart: start === 0 ? 10 : null, complete: start === 10, queryKey: 'cites=123',
    results: ids.map(id => ({ id, title: `A distinct synthetic paper ${id}`, authors: `Author ${id}`, year: 2026, url: `https://example.org/${id}` })),
  };
}

test('a rapid new citation traversal may begin with an unchanged first page', async () => {
  const env = environment(async ({ html }) => JSON.parse(html));
  async function capture(data) {
    env.tick();
    const url = citationURL + (data.start ? `&start=${data.start}` : '');
    return env.controller.handleMessage({ type: 'PAGE_CAPTURE', url, html: JSON.stringify(data) }, sender(url));
  }
  await capture(page(0, ['a']));
  await capture(page(10, ['b']));
  assert.equal(env.state().sources['123'].status, 'ready');
  await capture(page(0, ['a']));
  await capture(page(10, ['b', 'c']));
  assert.equal(env.state().sources['123'].status, 'ready');
  assert.deepEqual(env.state().sources['123'].newResults.map(result => result.id), ['c']);
});

test('slower older profile parsing cannot overwrite a later observation', async () => {
  let finishOld;
  let oldStarted;
  const started = new Promise(resolve => { oldStarted = resolve; });
  const delayedOld = new Promise(resolve => { finishOld = resolve; });
  const env = environment(async ({ html }) => {
    if (html === 'old') { oldStarted(); return delayedOld; }
    return { ...profile, total: 11, papers: [{ ...profile.papers[0], count: 11 }] };
  });
  env.tick();
  const older = env.controller.handleMessage({ type: 'PAGE_CAPTURE', url: profileURL, html: 'old', documentLoadedAt: baseTime + 500 }, sender(profileURL, 1));
  await started;
  env.tick();
  const newer = env.controller.handleMessage({ type: 'PAGE_CAPTURE', url: profileURL, html: 'new', documentLoadedAt: baseTime + 1500 }, sender(profileURL, 2));
  // Give any incorrectly parallel second parser enough time to finish first.
  await new Promise(resolve => setImmediate(resolve));
  env.tick();
  finishOld(profile);
  await Promise.all([older, newer]);
  assert.equal(env.state().latest.total, 11);
  assert.equal(env.state().events.some(event => event.delta < 0), false);
});

test('an old profile tab cannot roll back a successful background snapshot', async () => {
  const env = environment(async ({ html }) => html === 'network'
    ? { ...profile, total: 11, papers: [{ ...profile.papers[0], count: 11 }] }
    : JSON.parse(html), { fetch: async () => new Response('network', { headers: { 'content-type': 'text/html' } }) });
  env.tick();
  await env.controller.checkNow();
  for (let i = 0; i < 20 && env.state().status.phase === 'checking'; i++) {
    await new Promise(resolve => setImmediate(resolve));
    await env.controller.drain();
  }
  assert.equal(env.state().latest.total, 11);
  assert.equal(env.state().status.lastNetworkSnapshotAt, baseTime + 1000);
  env.tick();
  const reply = await env.controller.handleMessage({ type: 'PAGE_CAPTURE', url: profileURL, html: 'old DOM after Show more', documentLoadedAt: baseTime }, sender(profileURL));
  assert.equal(reply.ignored, true);
  assert.equal(env.state().latest.total, 11);
  assert.equal(env.state().events.some(event => event.delta < 0), false);
  env.tick();
  const fresh = { ...profile, total: 12, papers: [{ ...profile.papers[0], count: 12 }] };
  const newLoadedAt = baseTime + 2500;
  const accepted = await env.controller.handleMessage({ type: 'PAGE_CAPTURE', url: profileURL, html: JSON.stringify(fresh), documentLoadedAt: newLoadedAt }, sender(profileURL, 2));
  assert.equal(accepted.ok, true);
  assert.equal(accepted.ignored, undefined);
  assert.equal(env.state().latest.total, 12);
});

test('successive Show more captures from one document work, but an older tab cannot replace them', async () => {
  const env = environment(async ({ html }) => JSON.parse(html));
  const loadedAt = baseTime + 500;
  env.tick();
  const first = { ...profile, total: 11, complete: false, papers: [{ ...profile.papers[0], count: 11 }] };
  await env.controller.handleMessage({ type: 'PAGE_CAPTURE', url: profileURL, html: JSON.stringify(first), documentLoadedAt: loadedAt }, sender(profileURL));
  env.tick();
  const expanded = { ...first, complete: true, papers: [...first.papers, { id: 'Review:b', title: 'Newly visible synthetic paper', count: 0 }] };
  await env.controller.handleMessage({ type: 'PAGE_CAPTURE', url: profileURL, html: JSON.stringify(expanded), documentLoadedAt: loadedAt }, sender(profileURL));
  assert.equal(env.state().latest.papers.length, 2);
  assert.equal(env.state().latest.complete, true);
  assert.equal(env.state().status.lastProfileDocumentAt, loadedAt);
  env.tick();
  const older = await env.controller.handleMessage({ type: 'PAGE_CAPTURE', url: profileURL, html: JSON.stringify(profile), documentLoadedAt: baseTime }, sender(profileURL, 2));
  assert.equal(older.ignored, true);
  assert.equal(env.state().latest.total, 11);
  assert.equal(env.state().latest.papers.length, 2);
});

test('profile captures without a valid navigation timestamp are ignored', async () => {
  const env = environment(async () => { throw new Error('Invalid capture must not reach the parser'); });
  for (const loadedAt of [undefined, null, NaN, '2026-10-15', baseTime + 60000]) {
    const reply = await env.controller.handleMessage({ type: 'PAGE_CAPTURE', url: profileURL, html: 'x', documentLoadedAt: loadedAt }, sender(profileURL));
    assert.equal(reply.ignored, true);
  }
  assert.equal(env.state().latest.total, 10);
});
