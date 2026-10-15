export const ORIGIN = 'https://scholar.google.com';
export const MAX_HTML_BYTES = 2 * 1024 * 1024;
export const PROFILE_PAGE_SIZE = 100;

export function toMillis(value) {
  if (value == null) return 0;
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

export function profileFetchUrl(profileId) {
  if (!/^[\w-]{1,128}$/.test(profileId || '')) throw new Error('Invalid Scholar profile ID');
  // Order is intentional: Scholar robots.txt allows /citations?user=, but not cstart pagination.
  return `${ORIGIN}/citations?user=${encodeURIComponent(profileId)}&hl=en&pagesize=${PROFILE_PAGE_SIZE}`;
}

export function isBackgroundFetchAllowed(input, profileId) {
  try { return new URL(input).href === profileFetchUrl(profileId); } catch { return false; }
}

export function normalizeScholarLocation(input) {
  try {
    const url = new URL(input);
    if (url.origin !== ORIGIN || url.username || url.password) return null;
    url.hash = '';
    return url;
  } catch { return null; }
}

export function captureTarget(input, state) {
  const url = normalizeScholarLocation(input);
  if (!url || !state.settings.profileId) return null;
  if (url.pathname === '/citations' && url.searchParams.get('user') === state.settings.profileId && (!url.searchParams.get('view_op') || url.searchParams.get('view_op') === 'list_works')) {
    return { kind: 'profile', url: url.href };
  }
  if (url.pathname === '/scholar') {
    const clusterId = url.searchParams.get('cites');
    if (!clusterId || !/^\d+$/.test(clusterId)) return null;
    const paper = state.latest?.papers.find(item => String(item.clusterId) === clusterId);
    if (paper) return { kind: 'citations', clusterId, paperId: paper.id, url: url.href };
  }
  return null;
}

export function trustedCapture(message, sender, state) {
  if (!sender?.tab || typeof sender.url !== 'string' || typeof message?.url !== 'string') return null;
  const sent = normalizeScholarLocation(message.url);
  const source = normalizeScholarLocation(sender.url);
  // Sender URLs, not content-supplied IDs, establish which Scholar page was actually visited.
  if (!sent || !source || sent.href !== source.href || (sender.frameId ?? 0) !== 0) return null;
  return captureTarget(source.href, state);
}

export function isPopupSender(sender, runtimeId) {
  return sender?.id === runtimeId && !sender.tab && sender.url === `chrome-extension://${runtimeId}/popup.html`;
}

export function safeSourceUrl(input, clusterId) {
  const url = normalizeScholarLocation(input);
  if (!url || url.pathname !== '/scholar' || !/^\d+$/.test(String(clusterId || '')) || url.searchParams.get('cites') !== String(clusterId)) return null;
  // Start a normal, unfiltered browsing session. No page prefetch or automated next-page clicks.
  return `${ORIGIN}/scholar?cites=${encodeURIComponent(clusterId)}&hl=en`;
}

export function nextCheckTime(state, now = Date.now()) {
  if (!state.settings.profileId || state.status.phase === 'blocked') return null;
  const hours = state.settings.intervalHours;
  const failureBackoff = Math.min(72, 2 ** Math.min(state.status.failures || 0, 6));
  const period = Math.max(hours, state.status.phase === 'error' ? failureBackoff : 0) * 3600000;
  const anchor = Math.max(toMillis(state.status.lastAttemptAt), toMillis(state.status.lastSuccessAt));
  return anchor ? Math.max(now + 1000, anchor + period) : now + 1000;
}

export function asUserError(error) {
  const code = error?.code || (error?.name === 'AbortError' || error?.name === 'TimeoutError' ? 'TIMEOUT' : 'NETWORK');
  const messages = {
    BLOCKED: 'Scholar 需要验证，请打开主页后再试。',
    RATE_LIMIT: 'Scholar 暂时限制访问，自动检查已暂停。',
    REDIRECT: 'Scholar 需要在网页中打开处理，自动检查已暂停。',
    PARSE: '页面格式暂不支持，已保留上次记录。',
    NETWORK: '暂时无法连接 Scholar，已保留上次记录。',
    TIMEOUT: '连接超时，已保留上次记录。',
    TOO_LARGE: '页面过大，已保留上次记录。',
    STORAGE: '本地保存失败，原有记录仍保留。',
    INVALID_SETTINGS: '请检查主页地址与检查间隔。',
    INTERRUPTED: '上次检查被中断，将在下次检查时重试。',
    NO_PROFILE: '请先绑定 Scholar 主页。',
    NO_SOURCES: '这篇论文暂时没有可打开的引用来源。'
  };
  return { code, message: messages[code] || '暂时无法完成操作，请稍后再试。' };
}
