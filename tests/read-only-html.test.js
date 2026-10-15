import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { parseReadOnlyHtml } from '../extension/lib/read-only-html.js';
import { parseProfile, parseCitations, detectBlock } from '../extension/lib/parser.js';

const activeTags = new Set(['script', 'style', 'link', 'base', 'meta', 'iframe', 'frame', 'object', 'embed', 'img', 'picture', 'source', 'video', 'audio', 'svg', 'math', 'template', 'noscript', 'input']);
const safeAttributes = new Set(['id', 'class', 'href', 'action', 'disabled', 'aria-disabled', 'aria-label', 'data-cid', 'data-citepulse-crossed-out']);

function guardedDocument() {
  const doc = parseHTML('<html><body></body></html>').document;
  const calls = { tags: [], attributes: [] };
  const noHtmlSink = (node) => {
    Object.defineProperty(node, 'innerHTML', { set() { throw new Error('HTML must not enter a browser parsing sink.'); } });
    node.insertAdjacentHTML = () => { throw new Error('HTML must not enter a browser parsing sink.'); };
    return node;
  };
  const owner = {
    createDocumentFragment: () => noHtmlSink(doc.createDocumentFragment()),
    createTextNode: value => doc.createTextNode(value),
    createElement: (tag) => {
      assert.equal(activeTags.has(tag), false, `Must never create ${tag}, even if detached`);
      assert.equal(tag.includes('-'), false, 'Custom elements must not be constructed');
      calls.tags.push(tag);
      const node = noHtmlSink(doc.createElement(tag));
      const setAttribute = node.setAttribute.bind(node);
      node.setAttribute = (name, value) => {
        assert.equal(safeAttributes.has(name), true, `Must never assign ${name}`);
        calls.attributes.push([name, value]);
        setAttribute(name, value);
      };
      return node;
    },
  };
  return { owner, calls };
}

test('untrusted style, script and resource markup is discarded before any browser DOM construction', () => {
  const { owner, calls } = guardedDocument();
  const doc = parseReadOnlyHtml(`
    <style>@import 'https://example.org/track.css';</style>
    <link rel="stylesheet" href="https://example.org/track.css">
    <meta http-equiv="refresh" content="0;url=https://example.org">
    <script>window.executed = true; document.write('<img src=x>');</script>
    <svg><g><a href="https://example.org"><text>Hidden SVG</text></a></g></svg>
    <math><annotation-xml encoding="text/html"><div id="foreign">Hidden</div></annotation-xml></math>
    <template><div id="templated">Hidden template</div></template>
    <noscript><img src="https://example.org/noscript"></noscript>
    <iframe src="https://example.org"><p>Hidden frame</p></iframe>
    <img src="https://example.org/image" onerror="alert(1)">
    <input type="image" src="https://example.org/input">
    <div id="kept" style="color: red; background: url(https://example.org/pixel)" onmouseover="alert(1)">Visible text</div>
  `, owner);
  assert.equal(doc.querySelector('#kept').textContent, 'Visible text');
  assert.equal(doc.querySelector('#foreign, #templated'), null);
  assert.doesNotMatch([...doc.childNodes].map(node => node.textContent || '').join(''), /Hidden|window.executed|track\.css/);
  assert.equal(calls.attributes.some(([name]) => name === 'style' || name.startsWith('on')), false);
});

test('decoded markup remains literal text and encoded unsafe URLs never become attributes', () => {
  const { owner } = guardedDocument();
  const doc = parseReadOnlyHtml('<div id="text">&lt;img src=x onerror=alert(1)&gt; &amp; &#x1F4D8;</div><a id="unsafe" href="jav&#x61;script:alert(1)">Bad</a><a id="safe" href="/scholar?cites=123&amp;hl=en">Good</a>', owner);
  assert.equal(doc.querySelector('#text').textContent, '<img src=x onerror=alert(1)> & 📘');
  assert.equal(doc.querySelector('#text').children.length, 0);
  assert.equal(doc.querySelector('#unsafe').hasAttribute('href'), false);
  assert.equal(doc.querySelector('#safe').getAttribute('href'), '/scholar?cites=123&hl=en');
});

test('malformed nesting, quoted angle brackets and unknown elements stay inert', () => {
  const { owner, calls } = guardedDocument();
  const doc = parseReadOnlyHtml('<MY-WIDGET id="custom" style="color:red"><P id="quoted>value">First<p>Second</MY-WIDGET><DIV CLASS="retained" DATA-CID="x" STYLE="text-decoration/**/-line: line-through" onclick="bad()">Kept</DIV><div title="unfinished', owner);
  assert.equal(doc.querySelector('#custom').tagName, 'SPAN');
  assert.equal(doc.querySelector('p').getAttribute('id'), 'quoted>value');
  assert.equal(doc.querySelector('.retained').getAttribute('data-cid'), 'x');
  assert.equal(doc.querySelector('.retained').getAttribute('data-citepulse-crossed-out'), 'true');
  assert.equal(calls.tags.includes('my-widget'), false);
});

test('the inert tree preserves Scholar parser results and CAPTCHA detection', async () => {
  const { owner } = guardedDocument();
  const profileHTML = await readFile(new URL('fixtures/profile.html', import.meta.url), 'utf8');
  const profile = parseProfile(parseReadOnlyHtml(profileHTML, owner), 'https://scholar.google.com/citations?user=Example123&pagesize=100');
  assert.equal(profile.total, 1234);
  assert.deepEqual(profile.papers.map(paper => paper.count), [1200, 0, 0]);
  assert.equal(profile.complete, true);
  const citationsHTML = await readFile(new URL('fixtures/citations.html', import.meta.url), 'utf8');
  const citations = parseCitations(parseReadOnlyHtml(citationsHTML, owner), 'https://scholar.google.com/scholar?cites=10001');
  assert.deepEqual(citations.results.map(result => result.id), ['cid:result-a', 'cluster:20002']);
  assert.equal(citations.nextStart, 10);
  const captcha = parseReadOnlyHtml('<form action="/sorry/index" id="captcha-form">Verify</form>', owner);
  assert.equal(detectBlock(captcha), true);
});
