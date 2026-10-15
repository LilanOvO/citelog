import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { parseHTML } from 'linkedom';
import { parseProfile, parseCitations, detectBlock } from '../extension/lib/parser.js';

const profileURL = 'https://scholar.google.com/citations?user=Example123&hl=en&pagesize=100';
const citationsURL = 'https://scholar.google.com/scholar?cites=10001&hl=en';
const fixture = async (name) => parseHTML(await readFile(new URL(`fixtures/${name}.html`, import.meta.url), 'utf8')).document;
const fails = (code) => (error) => error.code === code;

test('profile reads total, comma-separated counts, zero and blank counts; skips crossed-out duplicate', async () => {
  const result = parseProfile(await fixture('profile'), profileURL);
  assert.equal(result.profileId, 'Example123');
  assert.equal(result.name, 'Example Researcher');
  assert.equal(result.total, 1234);
  assert.equal(result.complete, true);
  assert.deepEqual(result.papers.map(({ count }) => count), [1200, 0, 0]);
  assert.equal(result.papers[0].id, 'Example123:one');
  assert.equal(result.papers[0].clusterId, '10001');
  assert.equal(result.papers[0].citedByUrl, citationsURL);
  assert.equal(result.papers[2].year, null);
});

test('profile active Show more and nonzero cstart identify partial snapshots', async () => {
  const doc = await fixture('profile');
  doc.querySelector('#gsc_bpf_more').removeAttribute('disabled');
  assert.equal(parseProfile(doc, profileURL).complete, false);
  doc.querySelector('#gsc_bpf_more').setAttribute('disabled', '');
  assert.equal(parseProfile(doc, `${profileURL}&cstart=100`).complete, false);
});

test('profile preserves locale grouping without accepting malformed decimal counts', async () => {
  const doc = await fixture('profile');
  const total = doc.querySelector('.gsc_rsb_std');
  total.textContent = '1\u202f234';
  assert.equal(parseProfile(doc, profileURL).total, 1234);
  total.textContent = '12.5';
  assert.throws(() => parseProfile(doc, profileURL), fails('PARSE'));
});

test('missing statistics or broken paper identity never produce a successful empty snapshot', async () => {
  const doc = await fixture('profile');
  doc.querySelector('#gsc_rsb_st').remove();
  assert.throws(() => parseProfile(doc, profileURL), fails('PARSE'));
  const doc2 = await fixture('profile');
  doc2.querySelector('.gsc_a_at').setAttribute('href', 'javascript:alert(1)');
  assert.throws(() => parseProfile(doc2, profileURL), fails('PARSE'));
});

test('profile safe citation links only use the exact secure Scholar origin', async () => {
  for (const href of ['javascript:alert(1)', 'https://scholar.google.com.evil.test/scholar?cites=1', 'http://scholar.google.com/scholar?cites=1', 'https://evil@scholar.google.com/scholar?cites=1']) {
    const doc = await fixture('profile');
    doc.querySelector('.gsc_a_ac').setAttribute('href', href);
    const result = parseProfile(doc, profileURL);
    assert.equal(result.papers[0].citedByUrl, null);
    assert.equal(result.papers[0].clusterId, null);
  }
});

test('CAPTCHA and rate-limit documents are distinguishable from parsing failures', async () => {
  const doc = await fixture('captcha');
  assert.equal(detectBlock(doc, profileURL), true);
  assert.throws(() => parseProfile(doc, profileURL), fails('BLOCKED'));
  assert.throws(() => parseCitations(doc, citationsURL), fails('BLOCKED'));
});

test('citation list uses stable ids, removes citation labels and follows its own pagination', async () => {
  const result = parseCitations(await fixture('citations'), citationsURL);
  assert.equal(result.clusterId, '10001');
  assert.equal(result.start, 0);
  assert.equal(result.nextStart, 10);
  assert.equal(result.complete, false);
  assert.equal(result.queryKey, 'cites=10001');
  assert.deepEqual(result.results.map(({ id }) => id), ['cid:result-a', 'cluster:20002']);
  assert.equal(result.results[0].url, 'https://example.org/paper-a');
  assert.equal(result.results[0].year, 2026);
  assert.equal(result.results[1].title, 'Another citing paper');
  assert.equal(result.results[1].url, null);
});

test('last citation page is complete independently of its start offset', async () => {
  const doc = await fixture('citations');
  doc.querySelector('#gs_n').innerHTML = '<a href="/scholar?start=0&cites=10001&hl=en">Previous</a>';
  const result = parseCitations(doc, `${citationsURL}&start=10`);
  assert.equal(result.start, 10);
  assert.equal(result.nextStart, null);
  assert.equal(result.complete, true);
});

test('filtered, sorted and unknown views cannot claim a complete baseline', async () => {
  const doc = await fixture('citations');
  doc.querySelector('#gs_n').remove();
  for (const suffix of ['&q=cat', '&as_ylo=2026', '&as_yhi=2026', '&scisbd=1', '&as_sdt=2005']) {
    const result = parseCitations(doc, citationsURL + suffix);
    assert.equal(result.complete, false, suffix);
    assert.notEqual(result.queryKey, 'cites=10001');
  }
});

test('unrelated next-page links do not alter the current query pagination', async () => {
  const doc = await fixture('citations');
  doc.querySelector('#gs_n').innerHTML = '<a href="https://evil.test/scholar?start=10&cites=10001">Next</a><a href="/scholar?start=10&cites=99999">Next</a>';
  assert.equal(parseCitations(doc, citationsURL).nextStart, null);
});

test('a next page with an unexpectedly changed query cannot mark this page complete', async () => {
  const doc = await fixture('citations');
  doc.querySelector('#gs_n').innerHTML = '<a href="/scholar?start=10&cites=10001&as_sdt=2005">Next</a>';
  const result = parseCitations(doc, citationsURL);
  assert.equal(result.nextStart, null);
  assert.equal(result.complete, false);
});

test('dangerous article links are omitted; stable title fallback tolerates whitespace', async () => {
  const doc = await fixture('citations');
  const row = doc.querySelector('.gs_r');
  row.removeAttribute('data-cid');
  row.querySelector('.gs_fl').remove();
  row.querySelector('.gs_rt a').setAttribute('href', 'javascript:alert(1)');
  const result = parseCitations(doc, citationsURL);
  assert.equal(result.results[0].url, null);
  assert.match(result.results[0].id, /^fallback:/);
  row.querySelector('.gs_rt a').textContent = '  A paper   citing the original ';
  assert.equal(parseCitations(doc, citationsURL).results[0].id, result.results[0].id);
});

test('empty citations require an explicit no-results message; blank/malformed pages fail', () => {
  const empty = parseHTML('<html><body><div id="gs_res_ccl_mid"><div class="gs_med">Your search did not match any articles.</div></div></body></html>').document;
  assert.deepEqual(parseCitations(empty, citationsURL).results, []);
  assert.equal(parseCitations(empty, citationsURL).complete, true);
  empty.querySelector('#gs_res_ccl_mid').textContent = '';
  assert.throws(() => parseCitations(empty, citationsURL), fails('PARSE'));
  empty.querySelector('#gs_res_ccl_mid').innerHTML = '<div class="gs_r"><div>Broken result</div></div>';
  assert.throws(() => parseCitations(empty, citationsURL), fails('PARSE'));
});

test('invalid origins and multiple clusters cannot be parsed as tracked citation pages', async () => {
  const doc = await fixture('citations');
  for (const url of ['https://scholar.google.com.evil.test/scholar?cites=10001', 'http://scholar.google.com/scholar?cites=10001', `${citationsURL}&cites=20002`, 'https://scholar.google.com/scholar?cites=10001,20002', `${citationsURL}&start=-1`]) {
    assert.throws(() => parseCitations(doc, url), fails('PARSE'));
  }
});

test('offscreen parsing removes active resources and preserves inline crossed-out markers', async () => {
  const prior = { chrome: globalThis.chrome, document: globalThis.document, DOMParser: globalThis.DOMParser };
  let listener;
  const createdTags = [];
  const assignedAttributes = [];
  globalThis.chrome = { runtime: { id: 'extension-under-test', onMessage: { addListener: (callback) => { listener = callback; } } } };
  globalThis.document = parseHTML('<html><body></body></html>').document;
  const createElement = globalThis.document.createElement.bind(globalThis.document);
  globalThis.document.createElement = (tag) => {
    createdTags.push(tag);
    const node = createElement(tag);
    const setAttribute = node.setAttribute.bind(node);
    node.setAttribute = (name, value) => { assignedAttributes.push(name); setAttribute(name, value); };
    return node;
  };
  globalThis.DOMParser = class {
    parseFromString() { throw new Error('Untrusted markup must not reach DOMParser.'); }
  };
  try {
    await import('../extension/offscreen.js');
    const doc = await fixture('profile');
    doc.querySelector('.gsc_a_ac').setAttribute('style', 'text-decoration: line-through; background: url(https://example.org/tracker)');
    doc.body.insertAdjacentHTML('beforeend', '<img src="https://example.org/tracker"><iframe src="https://example.org/frame"></iframe><script>alert(1)</script><div onclick="alert(1)">Extra</div>');
    let response;
    listener({ target: 'offscreen', type: 'PARSE_HTML', kind: 'profile', html: doc.documentElement.outerHTML, url: profileURL }, { id: 'extension-under-test' }, (value) => { response = value; });
    assert.equal(response.ok, true);
    assert.equal(response.data.papers.length, 2);
    assert.equal(createdTags.some(tag => ['img', 'iframe', 'script', 'style'].includes(tag)), false);
    assert.equal(assignedAttributes.some(name => /^(?:style|src|onclick)$/i.test(name)), false);
    let rejected;
    listener({ target: 'offscreen', type: 'PARSE_HTML', kind: 'profile', html: '', url: profileURL }, { id: 'extension-under-test', tab: { id: 1 } }, (value) => { rejected = value; });
    assert.equal(rejected.ok, false);
  } finally {
    for (const [key, value] of Object.entries(prior)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('content captures once per observation, ignores storage feedback and recaptures citation BFCache visits', async () => {
  const doc = await fixture('citations');
  const events = new Map();
  const messages = [];
  let storageChanged;
  let pending;
  runInNewContext(await readFile(new URL('../extension/content.js', import.meta.url), 'utf8'), {
    document: doc,
    location: { href: citationsURL },
    performance: { timeOrigin: 1792036800000 },
    URL,
    TextEncoder,
    Node: { ELEMENT_NODE: 1 },
    MutationObserver: class { observe() {} },
    setTimeout: (callback) => { pending = callback; return 1; },
    clearTimeout: () => { pending = null; },
    window: { addEventListener: (name, callback) => { events.set(name, callback); } },
    chrome: {
      runtime: { sendMessage: async (message) => { messages.push(message); return { ok: true, allowed: true }; } },
      storage: { onChanged: { addListener: (callback) => { storageChanged = callback; } } },
    },
  });
  await pending();
  assert.deepEqual(messages.map(({ type }) => type), ['CAN_CAPTURE', 'PAGE_CAPTURE']);
  storageChanged({}, 'local');
  await pending();
  assert.equal(messages.length, 2);
  events.get('pageshow')({ persisted: true });
  await pending();
  assert.deepEqual(messages.map(({ type }) => type), ['CAN_CAPTURE', 'PAGE_CAPTURE', 'CAN_CAPTURE', 'PAGE_CAPTURE']);
});

test('unchanged profile restored from BFCache does not overwrite a newer background observation', async () => {
  const doc = await fixture('profile');
  const events = new Map();
  const messages = [];
  let pending;
  runInNewContext(await readFile(new URL('../extension/content.js', import.meta.url), 'utf8'), {
    document: doc,
    location: { href: profileURL },
    performance: { timeOrigin: 1792036800000 },
    URL,
    TextEncoder,
    Node: { ELEMENT_NODE: 1 },
    MutationObserver: class { observe() {} },
    setTimeout: (callback) => { pending = callback; return 1; },
    clearTimeout: () => { pending = null; },
    window: { addEventListener: (name, callback) => { events.set(name, callback); } },
    chrome: {
      runtime: { sendMessage: async (message) => { messages.push(message); return { ok: true, allowed: true }; } },
      storage: { onChanged: { addListener() {} } },
    },
  });
  await pending();
  assert.equal(messages[1].documentLoadedAt, 1792036800000);
  events.get('pageshow')({ persisted: true });
  await pending();
  assert.deepEqual(messages.map(({ type }) => type), ['CAN_CAPTURE', 'PAGE_CAPTURE']);
});
