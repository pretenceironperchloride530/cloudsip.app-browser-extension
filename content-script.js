(() => {
  const DEBUG = false;
  const PHONE_REGEX = /(?:\+?\d[\d\s().-]{6,}\d)/g;
  const MAX_REPLACEMENTS = 100;
  const BLOCKED_SELECTOR = 'script, style, input, textarea, select, button, a, code, pre, [contenteditable="true"], .cloudsip-phone, .cloudsip-call-btn';

  let clickToCallEnabled = true;
  let replacementCount = 0;
  let observer = null;
  let scanTimer = null;
  let isScanning = false;

  function debugLog(...args) {
    if (DEBUG) console.log('[CloudSIP C2C]', ...args);
  }

  function normalizePhone(raw) {
    let value = String(raw || '').trim();
    value = value.replace(/^tel:/i, '');
    value = value.split(/[?#;]/)[0];
    value = value.replace(/[^\d+]/g, '');
    value = value.replace(/(?!^)\+/g, '');
    return value;
  }

  function isValidPhone(value) {
    const normalized = normalizePhone(value);
    const digits = normalized.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 18) return false;
    return true;
  }

  function isLikelyDate(rawText) {
    const value = String(rawText || '').trim();
    return /^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}$/.test(value)
      || /^\d{1,2}\s*[.-]\s*\d{1,2}\s*[.-]\s*\d{2,4}$/.test(value);
  }

  function isInsidePrice(text, startIndex, endIndex) {
    const before = text.slice(Math.max(0, startIndex - 3), startIndex);
    const after = text.slice(endIndex, Math.min(text.length, endIndex + 3));
    return /[$£€]\s*$/.test(before) || /^\s*(?:[$£€]|USD|EUR|GBP)\b/i.test(after);
  }

  function shouldSkipNode(node) {
    const parent = node.parentElement;
    if (!parent) return true;
    return Boolean(parent.closest(BLOCKED_SELECTOR));
  }

  function sendClickToCall(number, rawText) {
    chrome.runtime.sendMessage({
      type: 'CLOUDSIP_CLICK_TO_CALL',
      number,
      rawText
    });
  }

  function createCallButton(number, rawText) {
    const button = document.createElement('button');
    button.className = 'cloudsip-call-btn';
    button.type = 'button';
    button.title = 'Call with CloudSIP';
    button.textContent = '☎';
    button.dataset.cloudsipNumber = number;
    button.dataset.cloudsipProcessed = '1';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      sendClickToCall(number, rawText);
    });
    return button;
  }

  function createPhoneWrapper(rawText) {
    const number = normalizePhone(rawText);
    const wrapper = document.createElement('span');
    wrapper.className = 'cloudsip-phone';
    wrapper.dataset.cloudsipNumber = number;
    wrapper.dataset.cloudsipProcessed = '1';
    wrapper.appendChild(document.createTextNode(rawText));
    wrapper.appendChild(createCallButton(number, rawText));
    return wrapper;
  }

  function scanTelLinks() {
    if (replacementCount >= MAX_REPLACEMENTS) return 0;

    const links = Array.from(document.querySelectorAll('a[href^="tel:"]'));
    let foundCount = 0;

    links.forEach((link) => {
      if (replacementCount >= MAX_REPLACEMENTS) return;
      if (link.dataset.cloudsipProcessed === '1') return;
      if (link.nextElementSibling?.classList?.contains('cloudsip-call-btn')) {
        link.dataset.cloudsipProcessed = '1';
        return;
      }

      const href = link.getAttribute('href') || '';
      const rawNumber = href.replace(/^tel:/i, '');
      const number = normalizePhone(rawNumber);
      if (!isValidPhone(number)) return;

      link.insertAdjacentElement('afterend', createCallButton(number, link.textContent || rawNumber));
      link.dataset.cloudsipProcessed = '1';
      replacementCount += 1;
      foundCount += 1;
    });

    debugLog('tel links found', foundCount);
    return foundCount;
  }

  function wrapTextNode(node) {
    if (replacementCount >= MAX_REPLACEMENTS || shouldSkipNode(node)) return 0;

    const text = node.nodeValue || '';
    PHONE_REGEX.lastIndex = 0;
    if (!PHONE_REGEX.test(text)) {
      PHONE_REGEX.lastIndex = 0;
      return 0;
    }

    PHONE_REGEX.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;
    let hasReplacement = false;
    let foundCount = 0;
    let match;

    while ((match = PHONE_REGEX.exec(text)) && replacementCount < MAX_REPLACEMENTS) {
      const rawText = match[0];
      const startIndex = match.index;
      const endIndex = startIndex + rawText.length;
      const number = normalizePhone(rawText);

      if (!isValidPhone(number) || isLikelyDate(rawText) || isInsidePrice(text, startIndex, endIndex)) continue;

      if (startIndex > lastIndex) fragment.appendChild(document.createTextNode(text.slice(lastIndex, startIndex)));
      fragment.appendChild(createPhoneWrapper(rawText));
      lastIndex = endIndex;
      replacementCount += 1;
      foundCount += 1;
      hasReplacement = true;
    }

    PHONE_REGEX.lastIndex = 0;
    if (!hasReplacement) return 0;
    if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
    node.replaceWith(fragment);
    return foundCount;
  }

  function scanTextNodes(root = document.body) {
    if (!root || replacementCount >= MAX_REPLACEMENTS) return 0;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;

        const blocked = parent.closest(BLOCKED_SELECTOR);
        if (blocked) return NodeFilter.FILTER_REJECT;

        PHONE_REGEX.lastIndex = 0;
        const hasPhone = PHONE_REGEX.test(node.nodeValue || '');
        PHONE_REGEX.lastIndex = 0;
        if (!hasPhone) return NodeFilter.FILTER_REJECT;

        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    let node;
    while ((node = walker.nextNode()) && replacementCount + nodes.length < MAX_REPLACEMENTS) nodes.push(node);

    const foundCount = nodes.reduce((count, textNode) => count + wrapTextNode(textNode), 0);
    debugLog('text numbers found', foundCount);
    return foundCount;
  }

  function scanPage() {
    if (isScanning || !clickToCallEnabled || !document.body || window.top !== window) return;
    isScanning = true;
    try {
      scanTelLinks();
      scanTextNodes(document.body);
    } finally {
      isScanning = false;
    }
  }

  function startObserver() {
    if (!document.body || observer || window.top !== window) return;
    observer = new MutationObserver(() => {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scanPage, 700);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CLOUDSIP_RESCAN_NUMBERS') scanPage();
  });

  if (window.top !== window) return;

  chrome.storage.local.get({ clickToCallEnabled: true }, (result) => {
    clickToCallEnabled = result.clickToCallEnabled !== false;
    if (!clickToCallEnabled || !document.body) return;
    scanPage();
    startObserver();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.clickToCallEnabled) return;
    clickToCallEnabled = changes.clickToCallEnabled.newValue !== false;
    if (clickToCallEnabled) {
      scanPage();
      startObserver();
    } else {
      observer?.disconnect();
      observer = null;
      clearTimeout(scanTimer);
    }
  });
})();
