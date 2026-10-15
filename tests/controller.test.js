import test from 'node:test';
import assert from 'node:assert/strict';
import { createController, ALARM_NAME } from '../extension/lib/controller.js';
import { createState, applyProfileSnapshot } from '../extension/lib/model.js';
import { MIN_FETCH_GAP_MS } from '../extension/lib/policy.js';

const start = Date.parse('2026-10-15T02:00:00Z');
const popup = { id: 'test-extension', url: 'chrome-extension://test-extension/popup.html' };
const profileUrl = id => `https://scholar.google.com/citations?user=${id}&hl=en`;
const snapshot = (id = 'Example123', total = 10) => ({ profileId: id, name: 'Test Researcher', total, complete: true, papers: [{ id: `${id}:paper`, title: 'Example paper', count: total, authors: 'A. Author', year: 2026, clusterId: '10001', citedByUrl: 'https://scholar.google.com/scholar?cites=10001', url: `https://scholar.google.com/citations?user=${id}&citation_for_view=${id}:paper` }] });
function seeded(total = 10) {
  const result = applyProfileSnapshot(createState('Asia/Shanghai'), { ...snapshot('Example123', total), at: start - 86400000 }).state;
  result.status.lastAttemptAt = start - 86400000;
  result.status.nextCheckAt = start;
  return result;
}
function harness(initial = null, options = {}) {
  let db = initial ? { citepulse: structuredClone(initial) } : {};
  let time = start;
  const fetched = [], opened = [], notifications = [], alarms = new Map(), badges = [];
  const api = {
    runtime: { id: popup.id },
    storage: { local: { get: async () => structuredClone(db), set: async values => { if (options.storageError) throw Error('quota'); db = structuredClone(values); } } },
    alarms: { get: async name => alarms.get(name), clear: async name => alarms.delete(name), create: async (name, value) => alarms.set(name, { scheduledTime: value.when }) },
    action: { setBadgeText: async value => badges.push(value.text), setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
    notifications: { create: async (...args) => { notifications.push(args); if (options.notificationError) throw Error('denied'); } },
    tabs: { create: async value => opened.push(value) }
  };
  const controller = createController({ chromeApi: api, now: () => time, timeZone: 'Asia/Shanghai',
    fetchFn: async (url, config) => { fetched.push({ url, config }); return options.fetch ? options.fetch(url, config) : new Response('<html>profile</html>', { status: options.status || 200, headers: { 'content-type': 'text/html' } }); },
    parseHtml: options.parse || (async ({ kind, url }) => kind === 'profile' ? snapshot(new URL(url).searchParams.get('user'), options.total ?? 11) : { clusterId: '10001', results: [{ id: 'a', title: 'A citing source', authors: 'A. Author', year: 2026, url: 'https://example.org/a' }], start: 0, nextStart: null, complete: true, queryKey: 'cites=10001' })
  });
  const send = message => controller.handleMessage(message, popup);
  async function settle() {
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setImmediate(resolve)); await controller.drain();
      if ((await controller.getState()).state.status.phase !== 'checking') return;
    }
    throw Error('Check did not settle');
  }
  return { controller, send, settle, fetched, opened, notifications, alarms, badges, advance: n => { time += n; }, db: () => db.citepulse };
}

test('binding fetches only the profile, establishes a baseline, and schedules the next day', async () => {
  const h = harness();
  const reply = await h.send({ type: 'SAVE_SETTINGS', payload: { profileUrl: profileUrl('Example123'), intervalHours: 24, notifications: true } });
  assert.equal(reply.ok, true); await h.settle();
  const state = h.db();
  assert.equal(state.latest.total, 11); assert.equal(state.events[0].kind, 'baseline');
  assert.equal(h.notifications.length, 0); assert.equal(h.fetched.length, 1);
  assert.equal(h.fetched[0].url, 'https://scholar.google.com/citations?user=Example123&hl=en&pagesize=100');
  assert.equal(h.fetched[0].config.credentials, 'omit'); assert.equal(h.fetched[0].config.redirect, 'manual');
  assert.equal(h.alarms.get(ALARM_NAME).scheduledTime, start + 86400000);
});

test('manual checks are throttled and do not notify again on an unchanged snapshot', async () => {
  const h = harness(seeded(), { notificationError: true });
  await h.send({ type: 'CHECK_NOW' }); await h.settle();
  assert.equal(h.notifications.length, 1); assert.equal(h.db().latest.total, 11);
  const second = await h.send({ type: 'CHECK_NOW' });
  assert.equal(second.error.code, 'COOLDOWN'); assert.equal(h.fetched.length, 1);
  h.advance(MIN_FETCH_GAP_MS + 1); await h.send({ type: 'CHECK_NOW' }); await h.settle();
  assert.equal(h.fetched.length, 2); assert.equal(h.notifications.length, 1);
  assert.equal((await h.controller.getState()).summary.delta, 1);
});

test('HTTP rate limiting pauses alarms and keeps the last successful snapshot', async () => {
  const h = harness(seeded(), { status: 429 });
  await h.send({ type: 'CHECK_NOW' }); await h.settle();
  assert.equal(h.db().status.phase, 'blocked'); assert.equal(h.db().status.error.code, 'RATE_LIMIT');
  assert.equal(h.db().latest.total, 10); assert.equal(h.db().events.length, 1); assert.equal(h.alarms.has(ALARM_NAME), false);
  h.advance(86400000); await h.controller.onAlarm({ name: ALARM_NAME });
  assert.equal(h.fetched.length, 1);
});

test('a parser failure never turns stored data into an empty profile', async () => {
  const h = harness(seeded(), { parse: async () => { throw Object.assign(Error('changed HTML'), { code: 'PARSE' }); } });
  await h.send({ type: 'CHECK_NOW' }); await h.settle();
  assert.equal(h.db().status.error.code, 'PARSE'); assert.equal(h.db().latest.total, 10); assert.equal(h.notifications.length, 0);
  assert(h.alarms.has(ALARM_NAME));
});

test('redirects to verification or consent stop automatic traffic without following them', async () => {
  const h = harness(seeded(), { fetch: async () => ({ type: 'opaqueredirect', status: 0 }) });
  await h.send({ type: 'CHECK_NOW' }); await h.settle();
  assert.equal(h.db().status.phase, 'blocked'); assert.equal(h.db().status.error.code, 'REDIRECT');
  assert.equal(h.fetched.length, 1); assert.equal(h.alarms.has(ALARM_NAME), false);
});

test('opening and capturing a citing list never invokes fetch or automatic navigation', async () => {
  const h = harness(seeded());
  await h.send({ type: 'OPEN_SOURCES', paperId: 'Example123:paper' });
  assert.deepEqual(h.opened, [{ url: 'https://scholar.google.com/scholar?cites=10001&hl=en' }]);
  const url = h.opened[0].url;
  const sender = { id: popup.id, url, tab: { id: 3 }, frameId: 0 };
  const permission = await h.controller.handleMessage({ type: 'CAN_CAPTURE', url }, sender);
  assert.equal(permission.allowed, true);
  await h.controller.handleMessage({ type: 'PAGE_CAPTURE', url, html: '<html>user visited source</html>' }, sender);
  assert.equal(h.db().sources['10001'].status, 'ready'); assert.equal(h.db().sources['10001'].newResults.length, 0);
  assert.equal(h.fetched.length, 0); assert.equal(h.opened.length, 1);
});

test('content pages cannot trigger privileged commands or capture untracked people', async () => {
  const h = harness(seeded());
  const url = profileUrl('Other123'); const sender = { id: popup.id, url, tab: { id: 4 }, frameId: 0 };
  assert.equal((await h.controller.handleMessage({ type: 'CHECK_NOW' }, sender)).error.code, 'FORBIDDEN');
  assert.equal((await h.controller.handleMessage({ type: 'CAN_CAPTURE', url }, sender)).allowed, false);
  assert.equal((await h.controller.handleMessage({ type: 'PAGE_CAPTURE', url, html: 'x' }, sender)).ignored, true);
  assert.equal(h.fetched.length, 0);
});

test('missing alarms are restored, and a killed service worker does not stay checking forever', async () => {
  const state = seeded(); state.status.phase = 'checking'; state.status.runId = 'old'; state.status.nextCheckAt = null;
  const h = harness(state); await h.controller.startup();
  assert.equal(h.db().status.phase, 'error'); assert.equal(h.db().status.error.code, 'INTERRUPTED'); assert(h.alarms.has(ALARM_NAME));
  assert.equal(h.fetched.length, 0);
});

test('switching profiles discards a still-running result for the previous person', async () => {
  const pending = [];
  const h = harness(seeded(), { fetch: (url, config) => new Promise((resolve, reject) => {
    pending.push({ url, resolve }); config.signal.addEventListener('abort', () => reject(Object.assign(Error('aborted'), { name: 'AbortError' })));
  }) });
  await h.send({ type: 'CHECK_NOW' });
  await h.send({ type: 'SAVE_SETTINGS', payload: { profileUrl: profileUrl('Other123'), intervalHours: 24, notifications: false } });
  assert.equal(pending.length, 2);
  pending[1].resolve(new Response('<html>new profile</html>', { headers: { 'content-type': 'text/html' } }));
  await h.settle();
  assert.equal(h.db().latest.profileId, 'Other123'); assert.equal(h.db().events.length, 1); assert.equal(h.notifications.length, 0);
});
