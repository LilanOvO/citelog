const $ = (id) => document.getElementById(id);
const ui = { view: 'main', tab: 'papers', paperId: null, busy: false, ready: false };
let data = { state: {}, summary: {}, history: [] };
let refreshNumber = 0;

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value);
  return node;
}

function number(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('zh-CN') : '—';
}

function signed(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value > 0 ? `+${number(value)}` : value < 0 ? `−${number(Math.abs(value))}` : '0';
}

function safeUrl(raw) {
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

function formatDate(value, options = {}) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const timeZone = data.state.settings?.timeZone;
  try { return date.toLocaleString('zh-CN', { timeZone, ...options }); }
  catch { return date.toLocaleString('zh-CN', options); }
}

function shortDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`;
  }
  return formatDate(value, { month: 'numeric', day: 'numeric' });
}

function dateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const timeZone = data.state.settings?.timeZone;
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
  catch { return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
}

function dateRange(fromAt, toAt) {
  const from = shortDate(fromAt);
  const to = shortDate(toAt);
  return from && to && from !== to ? `${from}–${to}` : to || from;
}

function report(message) {
  $('feedback').textContent = message || '';
  $('feedback').hidden = !message;
}

function errorText(error) {
  const messages = {
    INVALID_PROFILE: '请输入有效的 Scholar 个人主页链接。',
    INVALID_INTERVAL: '请输入 1–720 小时。',
    BLOCKED: '请先打开 Scholar 完成验证。',
    RATE_LIMIT: 'Scholar 暂时限制访问，请稍后再试。',
    RATE_LIMITED: 'Scholar 暂时限制访问，请稍后再试。',
    NETWORK: '网络连接失败，已有记录已保留。',
    NO_PROFILE: '请先绑定 Scholar 主页。',
    SOURCE_UNAVAILABLE: '暂时没有可打开的引用来源页。'
  };
  return messages[error?.code] || error?.message || '操作未完成，请稍后再试。';
}

async function command(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw response?.error || { message: '扩展暂时未响应，请重新打开。' };
  return response;
}

function accept(response) {
  if (response.state) data = { state: response.state, summary: response.summary || {}, history: response.history || [] };
  ui.ready = true;
  render();
}

async function refresh() {
  const current = ++refreshNumber;
  try {
    const response = await command({ type: 'GET_STATE' });
    if (current === refreshNumber) accept(response);
  } catch (error) {
    if (current !== refreshNumber) return;
    $('loading').hidden = true;
    report(errorText(error));
  }
}

function currentPaper() {
  const paper = data.state.latest?.papers?.find((item) => item.id === ui.paperId);
  const change = data.summary.changes?.find((item) => item.id === ui.paperId);
  return paper || change ? { ...change, ...paper } : null;
}

function sourceState(paper) {
  return paper?.clusterId ? data.state.sources?.[paper.clusterId] || {} : {};
}

function renderMain() {
  const { state, summary } = data;
  const latest = state.latest;
  const phase = state.status?.phase || 'idle';
  const rateLimited = state.status?.error?.code === 'RATE_LIMIT';
  const at = state.status?.lastSuccessAt || latest?.at;
  $('open-profile').textContent = state.profile?.name ? `${state.profile.name} ↗` : '我的 Scholar ↗';
  $('open-profile').title = state.profile?.name || '打开我的 Scholar 主页';
  $('status').textContent = phase === 'checking' ? '正在检查…' : at ? `${formatDate(at, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 更新` : '等待首次检查';
  $('total').textContent = number(latest?.total);
  $('total').classList.toggle('large-number', typeof latest?.total === 'number' && latest.total >= 1000000);
  $('delta').textContent = signed(summary.gap ? summary.intervalDelta : summary.delta);
  $('delta-label').textContent = summary.gap ? '区间净增' : '今日净增';
  $('delta-label').title = summary.gap ? '跨日未检查，显示两次检查之间的变化' : '今天检查到的净变化';
  $('today-date').textContent = summary.gap ? dateRange(summary.fromAt, summary.toAt) : formatDate(new Date().toISOString(), { month: 'numeric', day: 'numeric' });

  $('notice').hidden = !['blocked', 'error'].includes(phase);
  $('notice-text').textContent = phase === 'blocked' ? rateLimited ? 'Scholar 暂时限制访问，记录已保留。' : state.status?.error?.code === 'REDIRECT' ? '请打开 Scholar 处理网页提示。' : 'Scholar 需要验证，记录已保留。' : errorText(state.status?.error);
  $('verify').hidden = phase !== 'blocked';
  $('verify').textContent = rateLimited ? '查看主页 ↗' : '打开 Scholar 验证 ↗';

  const changes = Array.isArray(summary.changes) ? summary.changes : [];
  const list = $('paper-list');
  list.replaceChildren();
  for (const change of changes) {
    const paper = latest?.papers?.find((item) => item.id === change.id) || change;
    const row = element('button', 'paper-row');
    row.type = 'button';
    row.dataset.paperId = change.id;
    const main = element('span', 'paper-main');
    main.append(element('span', 'paper-title', change.title || paper.title || '未命名论文'));
    let detail = `${number(change.before)} → ${number(change.after)}`;
    if (['added', 'observed'].includes(change.kind)) detail = `首次记录 · ${number(change.after)} 次引用`;
    if (change.kind === 'removed') detail = '已从主页移除';
    main.append(element('span', 'meta', detail));
    row.append(main);
    const paperDelta = change.gap ? change.intervalDelta : change.delta;
    if (Number.isFinite(paperDelta)) {
      row.append(element('span', `gain${paperDelta < 0 ? ' negative' : ''}`, `${change.gap ? '区间 ' : ''}${signed(paperDelta)}`));
    }
    row.append(element('span', 'chevron', '›'));
    row.addEventListener('click', () => {
      ui.paperId = change.id;
      navigate('detail');
      $('detail-title').focus({ preventScroll: true });
    });
    list.append(row);
  }
  $('change-count').textContent = String(changes.length);
  $('change-count').hidden = changes.length === 0;
  $('paper-empty').hidden = changes.length > 0;
  $('empty-title').textContent = !latest ? '还没有记录' : summary.baseline ? '从今天开始记录' : '暂无引用变化';
  $('empty-text').textContent = !latest ? phase === 'checking' ? '正在读取 Scholar 主页…' : '检查后显示总引用和论文变化。' : summary.baseline ? '下一次检查后显示变化。' : '';
  $('empty-text').hidden = !$('empty-text').textContent;
  $('coverage-note').hidden = !latest || latest.complete !== false;
  $('papers-panel').hidden = ui.tab !== 'papers';
  $('history-panel').hidden = ui.tab !== 'history';
  for (const tab of document.querySelectorAll('[data-tab]')) tab.setAttribute('aria-pressed', String(tab.dataset.tab === ui.tab));
  renderHistory();
}

function historyRows() {
  if (Array.isArray(data.history)) return data.history;
  return Array.isArray(data.history.rows) ? data.history.rows : [];
}

function renderHistory() {
  const rows = historyRows();
  const body = $('history-body');
  body.replaceChildren();
  for (const row of rows) {
    const tr = element('tr');
    const date = row.date || row.day || row.at;
    const day = element('td', '', shortDate(date));
    const gap = row.kind === 'gap' || row.gap;
    if (gap) {
      day.textContent = dateRange(row.fromAt, row.toAt) || shortDate(date);
      day.append(element('span', 'history-date-note', '区间记录'));
    }
    tr.append(day, element('td', '', number(row.total)));
    const delta = gap ? row.intervalDelta ?? row.delta : row.delta;
    tr.append(element('td', delta > 0 ? 'positive' : '', row.kind === 'baseline' || row.baseline ? '基线' : signed(delta)));
    body.append(tr);
  }
  $('history-table').hidden = !rows.length;
  $('history-empty').hidden = rows.length > 0;
}

function renderSourceList(host, sources) {
  host.replaceChildren();
  for (const source of sources) {
    const item = element('article', 'source');
    const url = safeUrl(source.url);
    const title = element(url ? 'a' : 'span', 'source-title', source.title || '未命名文章');
    if (url) { title.href = url; title.target = '_blank'; title.rel = 'noopener noreferrer'; }
    const authors = Array.isArray(source.authors) ? source.authors.join(', ') : source.authors;
    const meta = [authors, source.year].filter(Boolean).join(' · ');
    item.append(title);
    if (meta) item.append(element('div', 'source-meta', meta));
    host.append(item);
  }
}

function renderDetail() {
  const paper = currentPaper();
  if (!paper) { ui.view = 'main'; return; }
  const change = data.summary.changes?.find((item) => item.id === ui.paperId);
  $('detail-title').textContent = paper.title || '未命名论文';
  $('detail-count').textContent = change?.kind === 'removed' ? '已从主页移除' : `${number(paper.count ?? paper.after)} 次引用`;
  if (change?.gap) $('detail-count').textContent += ` · ${dateRange(change.fromAt, change.toAt)}`;
  const paperDelta = change?.gap ? change.intervalDelta : change?.delta;
  $('detail-gain').hidden = !Number.isFinite(paperDelta);
  $('detail-gain').textContent = `${change?.gap ? '区间 ' : ''}${signed(paperDelta)}`;
  $('detail-gain').classList.toggle('negative', paperDelta < 0);
  const sources = sourceState(paper);
  const known = Array.isArray(sources.known) ? sources.known : [];
  const today = dateKey(Date.now());
  const recent = Array.isArray(sources.newResults) ? sources.newResults.filter((source) => dateKey(source.discoveredAt) === today) : [];
  const recentIds = new Set(recent.map((source) => source.id));
  const previous = known.filter((source) => !recentIds.has(source.id));
  renderSourceList($('new-source-list'), recent);
  renderSourceList($('known-source-list'), previous);
  $('new-source-section').hidden = !recent.length;
  $('known-source-section').hidden = !previous.length;
  const hasSources = known.length > 0 || recent.length > 0;
  $('source-status').hidden = hasSources && sources.status === 'ready' && Boolean(sources.baseline) && !sources.traversal;
  $('source-status').textContent = !paper.clusterId && !paper.citedByUrl ? '暂时没有引用来源页。' : !hasSources ? '打开来源页后记录引用文章。' : !sources.baseline ? '尚未记录完整来源，暂不判断新增。' : '当前来源尚未核对完整。';
  $('source-updated').hidden = !sources.lastCheckedAt;
  $('source-updated').textContent = sources.lastCheckedAt ? `${formatDate(sources.lastCheckedAt, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })} 记录` : '';
  $('open-sources').disabled = ui.busy || (!paper.clusterId && !paper.citedByUrl);
}

function renderFooter() {
  const phase = data.state.status?.phase;
  const hours = Number(data.state.settings?.intervalHours) || 24;
  $('schedule').textContent = phase === 'blocked' ? '检查已暂停' : hours === 24 ? '每天检查一次' : `每 ${hours} 小时检查`;
  $('schedule').hidden = ui.view !== 'main';
  $('check-now').hidden = ui.view !== 'main';
  $('check-now').disabled = ui.busy || phase === 'checking';
  $('check-now').textContent = phase === 'checking' ? '检查中…' : phase === 'blocked' ? data.state.status?.error?.code === 'RATE_LIMIT' ? '稍后重试' : '打开 Scholar' : '立即检查';
  $('open-sources').hidden = ui.view !== 'detail';
  $('save-settings').hidden = ui.view !== 'settings';
  $('save-settings').disabled = ui.busy;
  $('save-settings').textContent = ui.busy ? '保存中…' : '保存';
}

function render() {
  $('loading').hidden = ui.ready;
  if (!ui.ready) return;
  const bound = Boolean(data.state.settings?.profileId || data.state.profile?.id);
  $('welcome').hidden = bound;
  $('open-settings').hidden = !bound;
  $('footer').hidden = !bound;
  $('bind-button').disabled = ui.busy;
  $('bind-button').textContent = ui.busy ? '正在绑定…' : '绑定主页';
  if (bound) {
    renderMain();
    if (ui.view === 'detail') renderDetail();
    renderFooter();
  }
  for (const view of ['main', 'settings', 'detail']) $(view).hidden = !bound || ui.view !== view;
}

function populateSettings() {
  const settings = data.state.settings || {};
  $('profile-url').value = settings.profileUrl || data.state.profile?.url || '';
  const hours = Number(settings.intervalHours) || 24;
  $('interval').value = [6, 12, 24].includes(hours) ? String(hours) : 'custom';
  $('hours').value = String(hours);
  $('notifications').checked = Boolean(settings.notifications);
  $('custom-interval').hidden = $('interval').value !== 'custom';
  $('settings-error').hidden = true;
}

function navigate(view) {
  if (view === 'settings' && ui.view !== 'settings') populateSettings();
  ui.view = view;
  report('');
  render();
  $('content').scrollTop = 0;
}

async function runAction(message) {
  if (ui.busy) return;
  ui.busy = true;
  report('');
  render();
  try { accept(await command(message)); }
  catch (error) { report(errorText(error)); }
  finally { ui.busy = false; render(); }
}

async function saveSettings(initial) {
  if (ui.busy) return;
  const error = $(initial ? 'bind-error' : 'settings-error');
  error.hidden = true;
  const profileUrl = $(initial ? 'bind-url' : 'profile-url').value.trim();
  const intervalHours = initial ? 24 : Number($('interval').value === 'custom' ? $('hours').value : $('interval').value);
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 720) {
    error.textContent = '请输入 1–720 小时。';
    error.hidden = false;
    return;
  }
  ui.busy = true;
  report('');
  render();
  try {
    const response = await command({ type: 'SAVE_SETTINGS', payload: { profileUrl, intervalHours, notifications: initial ? data.state.settings?.notifications !== false : $('notifications').checked } });
    ui.view = 'main';
    accept(response);
    $('content').scrollTop = 0;
  } catch (failure) {
    error.textContent = errorText(failure);
    error.hidden = false;
  } finally { ui.busy = false; render(); }
}

$('bind-form').addEventListener('submit', (event) => { event.preventDefault(); saveSettings(true); });
$('settings-form').addEventListener('submit', (event) => { event.preventDefault(); saveSettings(false); });
$('open-settings').addEventListener('click', () => navigate(ui.view === 'settings' ? 'main' : 'settings'));
$('settings-back').addEventListener('click', () => navigate('main'));
$('detail-back').addEventListener('click', () => navigate('main'));
$('interval').addEventListener('change', () => { $('custom-interval').hidden = $('interval').value !== 'custom'; });
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => { ui.tab = button.dataset.tab; report(''); render(); });
for (const id of ['open-profile', 'verify']) $(id).addEventListener('click', () => runAction({ type: 'OPEN_PROFILE' }));
$('check-now').addEventListener('click', () => runAction({ type: data.state.status?.phase === 'blocked' && data.state.status?.error?.code !== 'RATE_LIMIT' ? 'OPEN_PROFILE' : 'CHECK_NOW' }));
$('open-sources').addEventListener('click', () => runAction({ type: 'OPEN_SOURCES', paperId: ui.paperId }));
chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') refresh(); });
refresh();
