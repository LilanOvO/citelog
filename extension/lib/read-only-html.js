import { Parser } from '../vendor/htmlparser2/Parser.js';

// These nodes only provide structure/text to the Scholar readers. They are never
// attached to a live document. Unknown harmless tags become plain spans.
const TAGS = new Set([
  'html', 'head', 'body', 'title', 'div', 'span', 'a', 'table', 'thead', 'tbody',
  'tfoot', 'tr', 'td', 'th', 'button', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  's', 'strike', 'del', 'br', 'hr', 'b', 'strong', 'i', 'em', 'small', 'sup',
  'sub', 'label', 'form', 'ul', 'ol', 'li', 'section', 'article', 'header',
  'footer', 'main', 'nav', 'aside', 'pre', 'code', 'dl', 'dt', 'dd', 'details',
  'summary',
]);
const BLOCKED = new Set([
  'script', 'style', 'link', 'base', 'meta', 'iframe', 'frame', 'frameset',
  'object', 'embed', 'applet', 'img', 'picture', 'source', 'video', 'audio',
  'track', 'svg', 'math', 'template', 'noscript', 'input', 'canvas',
]);
const ATTRIBUTES = new Set(['id', 'class', 'href', 'action', 'disabled', 'aria-disabled', 'aria-label', 'data-cid']);

function isSafeLink(value) {
  try {
    const url = new URL(value, 'https://scholar.google.com');
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

/**
 * Tokenize untrusted HTML in JavaScript, then construct only inert DOM nodes.
 * Raw markup never enters innerHTML, DOMParser or another browser HTML sink:
 * even rejected inline styles therefore cannot generate CSP violations.
 */
export function parseReadOnlyHtml(html, ownerDocument = document) {
  if (typeof html !== 'string') throw new TypeError('HTML must be a string.');
  const fragment = ownerDocument.createDocumentFragment();
  const stack = [];
  let nodeCount = 0;
  const append = (node) => {
    if (++nodeCount > 100000) throw new Error('Page structure is too large.');
    const parent = stack.at(-1)?.node || fragment;
    parent.appendChild(node);
  };
  const parser = new Parser({
    onopentag(name, attributes) {
      if (stack.length >= 1000) throw new Error('Page structure is too deeply nested.');
      const blocked = Boolean(stack.at(-1)?.blocked) || BLOCKED.has(name);
      if (blocked) { stack.push({ name, blocked: true, node: null }); return; }
      const element = ownerDocument.createElement(TAGS.has(name) ? name : 'span');
      for (const [key, value] of Object.entries(attributes)) {
        if (!ATTRIBUTES.has(key)) continue;
        if ((key === 'href' || key === 'action') && !isSafeLink(value)) continue;
        element.setAttribute(key, value);
      }
      // Retain the meaning of crossed-out citation counts without assigning CSS.
      const inlineStyle = (attributes.style || '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/(?:^|;)\s*text-decoration(?:-line)?\s*:[^;]*\bline-through\b/i.test(inlineStyle)) {
        element.setAttribute('data-citepulse-crossed-out', 'true');
      }
      append(element);
      stack.push({ name, blocked: false, node: element });
    },
    ontext(value) {
      if (!stack.at(-1)?.blocked && value) append(ownerDocument.createTextNode(value));
    },
    onclosetag(name) {
      // htmlparser2 emits matching closes for void tags and implied HTML closes.
      // A defensive lookup also tolerates malformed source nesting.
      for (let index = stack.length - 1; index >= 0; index--) {
        if (stack[index].name === name) { stack.length = index; break; }
      }
    },
  }, { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true });
  parser.end(html);
  return fragment;
}
