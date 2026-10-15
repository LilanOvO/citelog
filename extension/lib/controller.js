import { createState, normalizeProfileUrl, applyProfileSnapshot, applyCitationPage, getTodaySummary, getDailyHistory } from './model.js';
import { MIN_FETCH_GAP_MS, MAX_HTML_BYTES, profileFetchUrl, trustedCapture, isPopupSender, safeSourceUrl, nextCheckTime, asUserError, toMillis } from './policy.js';

// Keep existing identifiers so upgrades retain local history and scheduled checks.
export const STORAGE_KEY = 'citepulse';
export const ALARM_NAME = 'citepulse-profile-check';
const CHECK_TIMEOUT_MS = 20000;

function codedError(code) { const error = new Error(code); error.code = code; return error; }

// Dependencies are injected so the extension's scheduling and persistence can be tested without Scholar traffic.
export function createController({ chromeApi, fetchFn = globalThis.fetch, now = Date.now, parseHtml, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone }) {
  let serial = Promise.resolve();
  let activeFetch = null;
  const queue = fn => {
    const result = serial.then(fn, fn);
    serial = result.catch(() => {});
    return result;
  };
  async function read() {
    const data = await chromeApi.storage.local.get(STORAGE_KEY);
    return data[STORAGE_KEY] || createState(timeZone);
  }
  async function write(state) {
    try { await chromeApi.storage.local.set({ [STORAGE_KEY]: state }); }
    catch { throw codedError('STORAGE'); }
  }
  function view(state) {
    return { ok: true, state, summary: getTodaySummary(state, now()), history: getDailyHistory(state) };
  }
  async function badge(state) {
    // No unread counter: the small badge mirrors the observed daily net change.
    const summary = getTodaySummary(state, now());
    const value = summary.delta;
    const text = state.status.phase === 'blocked' ? '!' : value ? `${value > 0 ? '+' : ''}${value}` : '';
    await Promise.allSettled([
      chromeApi.action.setBadgeText({ text: text.length > 4 ? (value > 0 ? '+99' : '−99') : text }),
      chromeApi.action.setBadgeBackgroundColor({ color: '#D9ECFF' }),
      chromeApi.action.setTitle({ title: state.status.phase === 'blocked' ? 'CiteLog · 检查已暂停' : 'CiteLog' })
    ]);
  }
  async function schedule(state) {
    const desired = state.status.nextCheckAt;
    if (!desired || !state.settings.profileId || state.status.phase === 'blocked') {
      await chromeApi.alarms.clear(ALARM_NAME);
      return;
    }
    const existing = await chromeApi.alarms.get(ALARM_NAME);
    // Never postpone an existing overdue alarm repeatedly as the service worker wakes up.
    if (!existing || Math.abs(existing.scheduledTime - desired) > 30000) {
      await chromeApi.alarms.create(ALARM_NAME, { when: Math.max(now() + 1000, desired) });
    }
  }
  async function publishState(state) {
    await write(state);
    await Promise.allSettled([badge(state), schedule(state)]);
  }
  async function notifyChange(state, event) {
    if (!state.settings.notifications || !event || event.kind === 'baseline') return;
    const positive = event.paperChanges?.filter(p => p.kind === 'changed' && p.delta > 0) || [];
    if (!(event.delta > 0) && !positive.length) return;
    const total = event.delta > 0 ? `总引用 +${event.delta}` : '论文引用有更新';
    const detail = positive.length ? `，${positive.length} 篇论文增加引用。` : '，打开查看变化。';
    try {
      await chromeApi.notifications.create(`citepulse-${event.id}`, {
        type: 'basic', iconUrl: 'icons/icon128.png', title: 'CiteLog', message: total + detail
      });
    } catch { /* OS notification denial must not roll back a successful snapshot. */ }
  }
  async function fetchProfile(profileId, signal) {
    const url = profileFetchUrl(profileId);
    const response = await fetchFn(url, { credentials: 'omit', cache: 'no-store', redirect: 'manual', signal });
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) throw codedError('REDIRECT');
    if (response.status === 429 || response.status === 403) throw codedError('RATE_LIMIT');
    if (!response.ok) throw codedError('NETWORK');
    if (Number(response.headers?.get('content-length')) > MAX_HTML_BYTES) throw codedError('TOO_LARGE');
    const type = response.headers?.get('content-type') || '';
    if (type && !type.includes('text/html')) throw codedError('PARSE');
    // Bound the stream before buffering, not only after response.text() allocates it.
    let html;
    if (response.body?.getReader) {
      const reader = response.body.getReader(); const chunks = []; let bytes = 0;
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > MAX_HTML_BYTES) { await reader.cancel(); throw codedError('TOO_LARGE'); }
        chunks.push(part.value);
      }
      const all = new Uint8Array(bytes); let offset = 0;
      for (const part of chunks) { all.set(part, offset); offset += part.byteLength; }
      html = new TextDecoder().decode(all);
    } else {
      html = await response.text();
      if (new TextEncoder().encode(html).byteLength > MAX_HTML_BYTES) throw codedError('TOO_LARGE');
    }
    return parseHtml({ kind: 'profile', url, html });
  }
  async function executeCheck(job) {
    const abort = new AbortController();
    const active = { ...job, abort }; activeFetch = active;
    const timer = setTimeout(() => abort.abort(), CHECK_TIMEOUT_MS);
    try {
      const snapshot = await fetchProfile(job.profileId, abort.signal);
      await queue(async () => {
        const state = await read();
        if (state.settings.profileId !== job.profileId || state.status.runId !== job.id) return;
        const at = now();
        const { state: next, event } = applyProfileSnapshot(state, { ...snapshot, at });
        next.status = { ...next.status, phase: 'idle', lastSuccessAt: at, lastNetworkSnapshotAt: at, error: null, failures: 0, runId: null };
        next.status.nextCheckAt = nextCheckTime(next, at);
        await publishState(next);
        await notifyChange(next, event);
      });
    } catch (error) {
      await queue(async () => {
        const state = await read();
        if (state.settings.profileId !== job.profileId || state.status.runId !== job.id) return;
        const safe = asUserError(error);
        state.status = { ...state.status, phase: ['BLOCKED', 'RATE_LIMIT', 'REDIRECT'].includes(safe.code) ? 'blocked' : 'error', error: safe, runId: null, failures: (state.status.failures || 0) + 1 };
        state.status.nextCheckAt = nextCheckTime(state, now());
        await publishState(state);
      }).catch(() => {});
    } finally {
      clearTimeout(timer);
      if (activeFetch === active) activeFetch = null;
    }
  }
  async function checkNow({ automatic = false } = {}) {
    const result = await queue(async () => {
      const state = await read();
      if (!state.settings.profileId) return { reply: { ok: false, error: asUserError(codedError('NO_PROFILE')) } };
      if (state.status.phase === 'checking' && activeFetch) return { reply: view(state) };
      if (automatic && state.status.phase === 'blocked') return { reply: view(state) };
      if (state.status.lastAttemptAt && now() - toMillis(state.status.lastAttemptAt) < MIN_FETCH_GAP_MS) {
        if (automatic) {
          state.status.nextCheckAt = toMillis(state.status.lastAttemptAt) + MIN_FETCH_GAP_MS;
          await publishState(state);
          return { reply: view(state) };
        }
        return { reply: { ok: false, error: asUserError(codedError('COOLDOWN')) } };
      }
      const at = now();
      const id = `${at}-${Math.random().toString(36).slice(2, 9)}`;
      state.status = { ...state.status, phase: 'checking', lastAttemptAt: at, error: null, runId: id, nextCheckAt: null };
      await publishState(state);
      return { reply: view(state), job: { id, profileId: state.settings.profileId } };
    });
    if (result.job) {
      const pending = executeCheck(result.job);
      // Keep errors contained even if the popup closes immediately after triggering the check.
      pending.catch(() => {});
    }
    return result.reply;
  }
  async function saveSettings(payload) {
    let profile;
    try { profile = normalizeProfileUrl(payload?.profileUrl); } catch { return { ok: false, error: asUserError(codedError('INVALID_SETTINGS')) }; }
    const interval = Number(payload?.intervalHours);
    if (!profile?.id || !Number.isInteger(interval) || interval < 1 || interval > 720 || typeof payload.notifications !== 'boolean') {
      return { ok: false, error: asUserError(codedError('INVALID_SETTINGS')) };
    }
    const result = await queue(async () => {
      const previous = await read();
      const changed = previous.settings.profileId !== profile.id;
      const state = changed ? createState(previous.settings.timeZone || timeZone) : previous;
      state.settings = { ...state.settings, profileId: profile.id, profileUrl: profile.url, intervalHours: interval, notifications: payload.notifications };
      if (changed) {
        activeFetch?.abort.abort(); activeFetch = null;
      }
      state.status.nextCheckAt = nextCheckTime(state, now());
      await publishState(state);
      return { changed, reply: view(state) };
    });
    if (result.changed) return checkNow();
    return result.reply;
  }
  async function capture(message, sender) {
    if (typeof message.html !== 'string' || !message.html || new TextEncoder().encode(message.html).byteLength > MAX_HTML_BYTES) return { ok: false, error: asUserError(codedError('TOO_LARGE')) };
    const observedAt = now();
    // Serialize local parsing as well as writes: two tab snapshots must never be
    // committed in reverse observation order simply because one HTML page is larger.
    return queue(async () => {
      const state = await read(); const target = trustedCapture(message, sender, state);
      if (!target) return { ok: true, ignored: true };
      if (target.kind === 'profile') {
        const loadedAt = message.documentLoadedAt;
        const newestObservation = Math.max(toMillis(state.status.lastNetworkSnapshotAt), toMillis(state.status.lastProfileDocumentAt));
        // Show more may update rows in an old tab while its total remains stale.
        // Equal navigation times allow successive captures from the same page.
        if (typeof loadedAt !== 'number' || !Number.isFinite(loadedAt) || loadedAt <= 0 || loadedAt > observedAt + 1000 || loadedAt < newestObservation) {
          return { ok: true, ignored: true };
        }
      }
      let parsed;
      try { parsed = await parseHtml({ kind: target.kind, url: target.url, html: message.html }); }
      catch (error) {
        if (error?.code === 'BLOCKED') {
          state.status = { ...state.status, phase: 'blocked', runId: null, error: asUserError(error), nextCheckAt: null };
          activeFetch?.abort.abort(); activeFetch = null;
          await publishState(state);
        }
        return { ok: false, error: asUserError(error) };
      }
      const at = observedAt; let next, event;
      if (target.kind === 'profile') {
        if (toMillis(state.latest?.at) > at) return { ok: true, ignored: true };
        ({ state: next, event } = applyProfileSnapshot(state, { ...parsed, at }));
        next.status = { ...next.status, phase: 'idle', lastSuccessAt: at, lastProfileDocumentAt: message.documentLoadedAt, error: null, failures: 0, runId: null };
        next.status.nextCheckAt = nextCheckTime(next, at);
      } else {
        ({ state: next } = applyCitationPage(state, { ...parsed, at }));
      }
      await publishState(next);
      await notifyChange(next, event);
      return { ok: true };
    });
  }
  async function openSources(paperId) {
    const state = await read();
    const paper = state.latest?.papers.find(p => p.id === paperId);
    const url = paper && safeSourceUrl(paper.citedByUrl, paper.clusterId);
    if (!url) return { ok: false, error: asUserError(codedError('NO_SOURCES')) };
    await chromeApi.tabs.create({ url });
    return { ok: true };
  }
  async function startup() {
    return queue(async () => {
      const state = await read();
      if (state.status.phase === 'checking' && !activeFetch) {
        state.status = { ...state.status, phase: 'error', runId: null, error: asUserError(codedError('INTERRUPTED')) };
      }
      if (!state.status.nextCheckAt && state.status.phase !== 'blocked') state.status.nextCheckAt = nextCheckTime(state, now());
      await publishState(state);
      return view(state);
    });
  }
  async function handleMessage(message, sender) {
    if (!message || typeof message.type !== 'string') return { ok: false, error: { code: 'INVALID_MESSAGE', message: '无法识别的请求。' } };
    if (message.type === 'CAN_CAPTURE') return { ok: true, allowed: Boolean(trustedCapture(message, sender, await read())) };
    if (message.type === 'PAGE_CAPTURE') return capture(message, sender);
    if (!isPopupSender(sender, chromeApi.runtime.id)) return { ok: false, error: { code: 'FORBIDDEN', message: '请求来源无效。' } };
    if (message.type === 'GET_STATE') return view(await read());
    if (message.type === 'CHECK_NOW') return checkNow();
    if (message.type === 'SAVE_SETTINGS') return saveSettings(message.payload);
    if (message.type === 'OPEN_SOURCES') return openSources(message.paperId);
    if (message.type === 'OPEN_PROFILE') {
      const state = await read();
      if (!state.settings.profileUrl) return { ok: false, error: asUserError(codedError('NO_PROFILE')) };
      await chromeApi.tabs.create({ url: normalizeProfileUrl(state.settings.profileUrl).url });
      return { ok: true };
    }
    return { ok: false, error: { code: 'INVALID_MESSAGE', message: '无法识别的请求。' } };
  }
  return { handleMessage, startup, checkNow, onAlarm: alarm => alarm.name === ALARM_NAME ? checkNow({ automatic: true }) : Promise.resolve(), getState: async () => view(await read()), drain: () => serial };
}
