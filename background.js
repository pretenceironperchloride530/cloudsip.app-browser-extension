chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

let lastClickToCall = {
  number: null,
  at: 0
};

function shouldIgnoreDuplicateClickToCall(number) {
  const now = Date.now();
  if (lastClickToCall.number === number && now - lastClickToCall.at < 2000) {
    return true;
  }
  lastClickToCall = { number, at: now };
  return false;
}

async function openCloudSIPWindow(number = '') {
  const query = number ? `?dial=${encodeURIComponent(number)}&autoStart=1` : '';
  await chrome.windows.create({
    url: chrome.runtime.getURL(`index.html${query}`),
    type: 'popup',
    width: 430,
    height: 760,
    focused: true
  });
}

async function openSidePanelAndDial(number, senderTab) {
  const windowId = senderTab?.windowId;

  await chrome.storage.local.set({
    cloudsipPendingDialNumber: number,
    cloudsipPendingDialAt: Date.now(),
    cloudsipPendingDialAutoStart: true
  });

  if (chrome.sidePanel?.open) {
    try {
      if (windowId) {
        await chrome.sidePanel.open({ windowId });
      } else {
        await chrome.sidePanel.open({});
      }
    } catch (error) {
      console.warn('Unable to open CloudSIP side panel', error);
    }
  } else {
    await openCloudSIPWindow(number);
  }

  chrome.runtime.sendMessage({
    type: 'CLOUDSIP_PENDING_DIAL',
    number,
    autoStart: true
  }).catch(() => {
    // The pending number is stored for the CloudSIP UI to consume when it opens.
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'CLOUDSIP_CLICK_TO_CALL') return false;

  const number = String(message.number || '').trim();
  if (!number) {
    sendResponse({ ok: false, error: 'Missing click-to-call number' });
    return false;
  }

  if (shouldIgnoreDuplicateClickToCall(number)) {
    sendResponse({ ok: true, ignored: true });
    return false;
  }

  openSidePanelAndDial(number, sender.tab)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => {
      console.error('Unable to open CloudSIP for click-to-call', error);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});

chrome.action.onClicked.addListener(async (tab) => {
  const url = chrome.runtime.getURL('index.html');

  if (chrome.sidePanel?.open && tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }

  await chrome.windows.create({
    url,
    type: 'popup',
    width: 430,
    height: 760,
    focused: true
  });
});
