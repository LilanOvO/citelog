import test from 'node:test';
import assert from 'node:assert/strict';
import { profileFetchUrl, isBackgroundFetchAllowed, captureTarget, trustedCapture, isPopupSender, safeSourceUrl, nextCheckTime } from '../extension/lib/policy.js';

const state = {
  settings: { profileId: 'Test_id', intervalHours: 24 },
  latest: { papers: [{ id: 'a', clusterId: '123' }] },
  status: { phase: 'idle', lastSuccessAt: '2026-10-15T10:00:00Z' }
};
test('the only automated URL is the bound profile first page', () => {
  const allowed = profileFetchUrl('Test_id');
  assert(allowed.startsWith('https://scholar.google.com/citations?user='));
  assert(isBackgroundFetchAllowed(allowed, 'Test_id'));
  for (const url of ['https://scholar.google.com/scholar?cites=123', allowed + '&cstart=100', 'https://evil.example/citations?user=Test_id', 'https://scholar.google.com/citations?user=OTHER']) {
    assert.equal(isBackgroundFetchAllowed(url, 'Test_id'), false);
  }
});
test('user-visited pages must belong to the bound profile or one of its known citing lists', () => {
  assert.equal(captureTarget('https://scholar.google.com/scholar?cites=123&start=10', state).kind, 'citations');
  assert.equal(captureTarget('https://scholar.google.com/scholar?cites=456', state), null);
  assert.equal(captureTarget('https://scholar.google.com/citations?user=other', state), null);
});
test('forged URLs, subframes, and website-to-popup requests are rejected', () => {
  const url = 'https://scholar.google.com/scholar?cites=123';
  const sender = { tab: { id: 1 }, url, frameId: 0 };
  assert(trustedCapture({ url }, sender, state));
  assert.equal(trustedCapture({ url }, { ...sender, url: 'https://evil.example/' }, state), null);
  assert.equal(trustedCapture({ url }, { ...sender, frameId: 1 }, state), null);
  assert.equal(isPopupSender({ id: 'abc', url, tab: { id: 1 } }, 'abc'), false);
  assert.equal(isPopupSender({ id: 'abc', url: 'chrome-extension://abc/popup.html' }, 'abc'), true);
});
test('source navigation strips filters and does not accept arbitrary destinations', () => {
  assert.equal(safeSourceUrl('https://scholar.google.com/scholar?cites=123&as_ylo=2026&start=20', '123'), 'https://scholar.google.com/scholar?cites=123&hl=en');
  assert.equal(safeSourceUrl('javascript:alert(1)', '123'), null);
});
test('scheduling handles ISO timestamps and stops completely on a verification block', () => {
  assert.equal(nextCheckTime(state, Date.parse('2026-10-15T11:00:00Z')), Date.parse('2026-10-16T10:00:00Z'));
  assert.equal(nextCheckTime({ ...state, status: { ...state.status, phase: 'blocked' } }), null);
});
