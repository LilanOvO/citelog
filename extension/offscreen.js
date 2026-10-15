import { parseProfile, parseCitations } from './lib/parser.js';
import { parseReadOnlyHtml } from './lib/read-only-html.js';

const MAX_HTML_BYTES = 2 * 1024 * 1024;

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target !== 'offscreen' || message?.type !== 'PARSE_HTML') return false;
  if (sender.id !== chrome.runtime.id || sender.tab) {
    respond({ ok: false, error: { code: 'PARSE', message: '无效的解析请求。' } });
    return false;
  }
  try {
    if (typeof message.html !== 'string' || new TextEncoder().encode(message.html).length > MAX_HTML_BYTES || !['profile', 'citations'].includes(message.kind)) {
      throw Object.assign(new Error('页面过大或解析类型无效。'), { code: 'PARSE' });
    }
    const doc = parseReadOnlyHtml(message.html);
    const parser = message.kind === 'profile' ? parseProfile : parseCitations;
    respond({ ok: true, data: parser(doc, message.url) });
  } catch (error) {
    respond({ ok: false, error: { code: error.code || 'PARSE', message: error.message || '页面解析失败。' } });
  }
  return false;
});
