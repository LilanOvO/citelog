import { createController } from './lib/controller.js';
import { asUserError } from './lib/policy.js';

let creating;
async function parseHtml(payload) {
  const documentUrl = chrome.runtime.getURL('offscreen.html');
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [documentUrl] });
  if (!contexts.length) {
    creating ||= chrome.offscreen.createDocument({
      url: 'offscreen.html', reasons: ['DOM_PARSER'], justification: 'Parse Scholar HTML locally without opening a page or loading its scripts.'
    }).finally(() => { creating = null; });
    await creating;
  }
  if (creating) await creating;
  const reply = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'PARSE_HTML', ...payload });
  if (!reply?.ok) {
    const error = new Error(reply?.error?.message || 'Unable to parse Scholar page'); error.code = reply?.error?.code || 'PARSE'; throw error;
  }
  return reply.data;
}

const controller = createController({ chromeApi: chrome, parseHtml });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.target === 'offscreen') return false;
  controller.handleMessage(message, sender).then(respond).catch(error => respond({ ok: false, error: asUserError(error) }));
  return true;
});
chrome.alarms.onAlarm.addListener(alarm => { controller.onAlarm(alarm).catch(() => {}); });
chrome.runtime.onInstalled.addListener(() => { controller.startup().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { controller.startup().catch(() => {}); });
// Reconcile missing alarms whenever an MV3 service worker is restarted.
controller.startup().catch(() => {});
