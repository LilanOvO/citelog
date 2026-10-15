// Pure DOM readers. This module never requests or navigates to a Scholar page.
const SCHOLAR = 'https://scholar.google.com';
const PROFILE_ID = /^[A-Za-z0-9_-]+$/;
const CLUSTER_ID = /^\d+$/;

function parseError(message, code = 'PARSE') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function text(node) {
  return (node?.textContent || '').replace(/\s+/g, ' ').trim();
}

function scholarURL(value, base = SCHOLAR) {
  try {
    const url = new URL(value, base);
    if (url.protocol !== 'https:' || url.hostname !== 'scholar.google.com' || url.port || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function articleURL(value, base) {
  if (!value) return null;
  try {
    const url = new URL(value, base);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function integer(value, allowEmpty = false) {
  const raw = String(value).trim();
  if (!raw && allowEmpty) return 0;
  // Scholar localizes thousands separators; decimals are never citation counts.
  if (!/^\d+(?:[,\.\s\u00a0\u202f]\d{3})*$/.test(raw)) throw parseError('无法识别 Scholar 引用数。');
  const number = Number(raw.replace(/[,\.\s\u00a0\u202f]/g, ''));
  if (!Number.isSafeInteger(number)) throw parseError('Scholar 引用数超出范围。');
  return number;
}

function crossedOut(element, stop) {
  for (let node = element; node && node !== stop; node = node.parentElement) {
    if (/^(S|STRIKE|DEL)$/i.test(node.tagName) || node.getAttribute('data-citepulse-crossed-out') === 'true' || /text-decoration(?:-line)?\s*:[^;]*line-through/i.test(node.getAttribute('style') || '')) return true;
  }
  return Boolean(element?.querySelector('s, strike, del, [style*="line-through"], [data-citepulse-crossed-out="true"]'));
}

function isDisabled(element) {
  return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true' || element.classList.contains('gs_dis');
}

export function detectBlock(doc, sourceURL = '') {
  let path = '';
  try { path = new URL(sourceURL).pathname; } catch { /* Invalid URLs are rejected by each parser. */ }
  if (/^\/sorry(?:\/|$)/.test(path)) return true;
  if (doc.querySelector('#gs_captcha_ccl, #captcha-form, .g-recaptcha, form[action*="/sorry/"]')) return true;
  const title = text(doc.querySelector('title'));
  if (/^(?:sorry|access denied|forbidden|too many requests)\b|captcha/i.test(title)) return true;
  const body = text(doc.body || doc).slice(0, 30000);
  return /our systems have detected unusual traffic|unusual traffic from your computer network|automated queries.*(?:cannot|can't|unable)|系统检测到您的计算机网络中存在异常流量/i.test(body);
}

function assertNotBlocked(doc, url) {
  if (detectBlock(doc, url)) throw parseError('Scholar 暂时限制访问，请稍后重试。', 'BLOCKED');
}

export function parseProfile(doc, sourceURL) {
  assertNotBlocked(doc, sourceURL);
  const url = scholarURL(sourceURL);
  const profileId = url?.searchParams.get('user') || '';
  if (!url || url.pathname !== '/citations' || !PROFILE_ID.test(profileId) || (url.searchParams.has('view_op') && url.searchParams.get('view_op') !== 'list_works')) {
    throw parseError('不是有效的 Scholar 个人主页。');
  }
  const name = text(doc.querySelector('#gsc_prf_in'));
  const statistics = doc.querySelector('#gsc_rsb_st');
  const totalCell = statistics?.querySelector('tbody tr .gsc_rsb_std, tr .gsc_rsb_std');
  const table = doc.querySelector('#gsc_a_t');
  const body = doc.querySelector('#gsc_a_b');
  if (!name || !statistics || !totalCell || !table || !body) throw parseError('Scholar 主页内容不完整，未覆盖已有记录。');
  const total = integer(text(totalCell));
  const rows = Array.from(body.querySelectorAll('tr.gsc_a_tr'));
  const papers = [];
  const seen = new Set();
  for (const row of rows) {
    const titleNode = row.querySelector('.gsc_a_at');
    const countCell = row.querySelector('.gsc_a_c');
    const countNode = countCell?.querySelector('a.gsc_a_ac, .gsc_a_ac') || countCell;
    if (crossedOut(titleNode, row.parentElement) || crossedOut(countNode, row.parentElement)) continue;
    const title = text(titleNode);
    const detailURL = scholarURL(titleNode?.getAttribute('href') || '', url);
    const id = detailURL?.searchParams.get('citation_for_view');
    if (!title || !countCell || !detailURL || detailURL.pathname !== '/citations' || !id?.startsWith(`${profileId}:`) || id.length <= profileId.length + 1) {
      throw parseError('Scholar 论文列表格式已变化，未覆盖已有记录。');
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const count = integer(text(countNode), true);
    const citationLink = scholarURL(countNode?.getAttribute('href') || '', url);
    const rawCluster = citationLink?.searchParams.get('cites') || '';
    const clusterId = citationLink?.pathname === '/scholar' && CLUSTER_ID.test(rawCluster) ? rawCluster : null;
    const metadata = row.querySelector('.gsc_a_t .gs_gray');
    const rawYear = text(row.querySelector('.gsc_a_y'));
    papers.push({
      id,
      title,
      count,
      authors: text(metadata),
      year: /^\d{4}$/.test(rawYear) ? Number(rawYear) : null,
      url: detailURL.href,
      citedByUrl: clusterId ? `${SCHOLAR}/scholar?cites=${clusterId}&hl=en` : null,
      clusterId,
    });
  }
  if (!rows.length && total > 0 && !doc.querySelector('#gsc_a_e')) throw parseError('Scholar 论文列表尚未加载。');
  const more = doc.querySelector('#gsc_bpf_more');
  const pageSize = Number(url.searchParams.get('pagesize')) || 20;
  const startsAtZero = !url.searchParams.has('cstart') || url.searchParams.get('cstart') === '0';
  // A disabled “Show more” button proves that all currently available rows loaded.
  // Without it, a page exactly at its requested limit is conservatively partial.
  const complete = startsAtZero && (more ? isDisabled(more) : rows.length < pageSize);
  return { profileId, name, total, papers, complete };
}

const DISPLAY_PARAMS = new Set(['hl', 'oi', 'start', 'num', 'btnG', 'nav', 'scipsc', 'output', 'sciodt', 'sclient']);

function queryIdentity(url) {
  const params = [...url.searchParams.entries()].filter(([key]) => !DISPLAY_PARAMS.has(key));
  params.sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv));
  return new URLSearchParams(params).toString();
}

function standardCitations(url) {
  // Unknown parameters are conservative: filtered/sorted views can add evidence,
  // but cannot claim that a complete citation baseline has been collected.
  return [...url.searchParams.entries()].every(([key]) => key === 'cites' || DISPLAY_PARAMS.has(key));
}

function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function normalizedTitle(value) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function resultTitle(node) {
  if (!node) return '';
  const copy = node.cloneNode(true);
  copy.querySelectorAll('.gs_ctc, .gs_ctu, .gs_ct1, .gs_ct2').forEach((label) => label.remove());
  return text(copy).replace(/^\[(?:CITATION|BOOK|PDF|HTML|引用|图书)\]\s*/i, '').trim();
}

export function parseCitations(doc, sourceURL) {
  assertNotBlocked(doc, sourceURL);
  const url = scholarURL(sourceURL);
  const clusterId = url?.searchParams.get('cites') || '';
  if (!url || url.pathname !== '/scholar' || !CLUSTER_ID.test(clusterId) || url.searchParams.getAll('cites').length !== 1) {
    throw parseError('不是单篇论文的 Scholar 引用列表。');
  }
  const startValue = url.searchParams.get('start') || '0';
  if (!/^\d+$/.test(startValue) || !Number.isSafeInteger(Number(startValue))) throw parseError('引用列表页码无效。');
  const start = Number(startValue);
  const queryKey = queryIdentity(url);
  const container = doc.querySelector('#gs_res_ccl_mid');
  if (!container) throw parseError('Scholar 引用列表尚未加载。');
  const rows = [...container.querySelectorAll('.gs_r')];
  const results = [];
  const ids = new Set();
  for (const row of rows) {
    const titleNode = row.querySelector('.gs_rt');
    const title = resultTitle(titleNode);
    if (!title) throw parseError('Scholar 引用条目缺少标题。');
    const titleLink = titleNode.querySelector('a[href]');
    const target = articleURL(titleLink?.getAttribute('href'), url);
    const authors = text(row.querySelector('.gs_a'));
    const yearMatch = authors.match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/);
    let resultCluster = null;
    for (const link of row.querySelectorAll('.gs_fl a[href]')) {
      const href = scholarURL(link.getAttribute('href'), url);
      const candidate = href?.searchParams.get('cites');
      if (href?.pathname === '/scholar' && candidate && CLUSTER_ID.test(candidate)) { resultCluster = candidate; break; }
    }
    const cid = row.getAttribute('data-cid')?.trim();
    const id = cid ? `cid:${cid}` : resultCluster ? `cluster:${resultCluster}` : `fallback:${stableHash(target || normalizedTitle(title))}`;
    if (ids.has(id)) continue;
    ids.add(id);
    results.push({ id, title, authors, year: yearMatch ? Number(yearMatch[1]) : null, url: target });
  }
  const emptyText = text(container);
  const explicitEmpty = /did not match any articles|no (?:articles|results) found|未找到|没有找到|找不到与|找不到符合|未能找到/i.test(emptyText);
  if (!results.length && !explicitEmpty) throw parseError('Scholar 引用列表内容不完整。');
  let nextStart = null;
  let uncertainForwardPage = false;
  for (const link of doc.querySelectorAll('#gs_n a[href], a[aria-label="Next"][href]')) {
    const href = scholarURL(link.getAttribute('href'), url);
    if (!href || href.pathname !== '/scholar' || href.searchParams.get('cites') !== clusterId) continue;
    const raw = href.searchParams.get('start');
    if (!raw || !/^\d+$/.test(raw)) continue;
    const next = Number(raw);
    if (next > start && queryIdentity(href) !== queryKey) { uncertainForwardPage = true; continue; }
    if (Number.isSafeInteger(next) && next > start && (nextStart === null || next < nextStart)) nextStart = next;
  }
  const complete = nextStart === null && !uncertainForwardPage && standardCitations(url);
  return { clusterId, results, start, nextStart, complete, queryKey };
}
