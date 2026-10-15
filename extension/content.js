// Observe pages the user chose to open. Never request or navigate citation lists.
(() => {
  const MAX_HTML_BYTES = 2 * 1024 * 1024;
  const DEBOUNCE_MS = 1500;
  // Navigation time survives BFCache and stays fixed when Show more mutates an
  // older page. The background can then distinguish old DOM from a fresh visit.
  const documentLoadedAt = performance.timeOrigin;
  let timer;
  let lastFingerprint = '';
  let sending = false;
  let queued = false;

  function pageKind() {
    const url = new URL(location.href);
    if (url.origin !== 'https://scholar.google.com') return null;
    if (url.pathname === '/citations' && /^[A-Za-z0-9_-]+$/.test(url.searchParams.get('user') || '') && (!url.searchParams.has('view_op') || url.searchParams.get('view_op') === 'list_works')) return 'profile';
    if (url.pathname === '/scholar' && /^\d+$/.test(url.searchParams.get('cites') || '') && url.searchParams.getAll('cites').length === 1) return 'citations';
    return null;
  }

  function fingerprint(kind) {
    const selectors = kind === 'profile' ? '#gsc_prf_in, #gsc_rsb_st, #gsc_a_t, #gsc_bpf' : '#gs_res_ccl_mid, #gs_n';
    const relevant = location.href + [...document.querySelectorAll(selectors)].map((node) => node.outerHTML).join('');
    let hash = 2166136261;
    for (let i = 0; i < relevant.length; i++) hash = Math.imul(hash ^ relevant.charCodeAt(i), 16777619);
    return `${kind}:${relevant.length}:${hash >>> 0}`;
  }

  async function capture() {
    if (sending) { queued = true; return; }
    const kind = pageKind();
    if (!kind) return;
    const key = fingerprint(kind);
    if (key === lastFingerprint) return;
    sending = true;
    try {
      const url = location.href;
      const permission = await chrome.runtime.sendMessage({ type: 'CAN_CAPTURE', url });
      if (!permission?.ok || !permission.allowed || location.href !== url) return;
      const html = document.documentElement.outerHTML;
      if (new TextEncoder().encode(html).length > MAX_HTML_BYTES) return;
      const response = await chrome.runtime.sendMessage({ type: 'PAGE_CAPTURE', url, html, ...(kind === 'profile' ? { documentLoadedAt } : {}) });
      if (response?.ok) lastFingerprint = key;
    } catch {
      // An extension update may disconnect existing tabs. No page UI is changed.
    } finally {
      sending = false;
      if (queued) { queued = false; schedule(); }
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(capture, DEBOUNCE_MS);
  }

  if (!pageKind()) return;
  const observer = new MutationObserver((records) => {
    if (records.some(({ target, addedNodes }) => {
      const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
      return element?.closest('#gsc_prf_in, #gsc_rsb_st, #gsc_a_t, #gsc_bpf, #gs_res_ccl_mid, #gs_n') || [...addedNodes].some((node) => node.nodeType === Node.ELEMENT_NODE && (node.matches?.('#gsc_a_t, #gs_res_ccl_mid') || node.querySelector?.('#gsc_a_t, #gs_res_ccl_mid')));
    })) schedule();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'class', 'disabled', 'aria-disabled'] });
  window.addEventListener('pageshow', () => {
    // BFCache preserves this script. Returning to a previously visited page is a
    // new citation traversal. An unchanged cached profile must not overwrite a
    // fresher background snapshot simply because the user pressed Back.
    if (pageKind() === 'citations') lastFingerprint = '';
    schedule();
  });
  window.addEventListener('popstate', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  // Binding a profile while its tab is already open should allow one capture.
  chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') schedule(); });
  schedule();
})();
