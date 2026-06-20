import { showView } from './ui.js';
import { answerIncomingCall, applyCallBehaviorSettings, handleCallAccepted, handleCallEnded, handleCallFailed, handleCallHold, handleCallMuted, handleCallUnhold, handleCallUnmuted, handleIncomingCall, hangupActiveCall, rejectIncomingCall, startCall, startTimers, toggleHoldCall, toggleMuteCall } from './call-manager.js';
import { initDialpad, updateDialModeUI } from './dialpad.js';
import * as contactsModule from './contacts.js?v=20260617';
import { renderLogs } from './call-logs.js';
import { initLineManager } from './line-manager.js';
import { initSipClient, isSipRegistered, registerSip, unregisterSip } from './sip-client.js';
import { hasCheckedMicrophonePermission, initAudioDevices, refreshAudioDevices, requestMicrophonePermission } from './audio-devices.js';
import { initSoundManager } from './sound-manager.js';
import { getSettings } from './settings-store.js';
import { showWarning } from './toast.js';
import { state } from './state.js';
import { initSettings } from './settings-ui.js';
import { initWebRtcDiagnostics } from './webrtc-diagnostics.js';
import { initPresence } from './presence.js';
import { initKeyboardShortcuts } from './keyboard-shortcuts.js';
import { initTheme } from './theme-manager.js';
import { blockSipForInvalidCompanyWebsite, normalizeCompanyWebsiteUrl } from './branding-check.js';
import { IS_EXTENSION } from './extension-env.js';


const PENDING_DIAL_STORAGE_KEYS = [
  'cloudsipPendingDialNumber',
  'cloudsipPendingDialAt',
  'cloudsipPendingDialAutoStart'
];

let lastPendingDial = {
  number: null,
  at: 0
};

let lastPendingDialToast = {
  number: null,
  at: 0
};

function shouldIgnoreDuplicatePendingDial(number) {
  const now = Date.now();
  if (lastPendingDial.number === number && now - lastPendingDial.at < 2000) {
    return true;
  }
  lastPendingDial = { number, at: now };
  return false;
}

function showPendingDialRegistrationToast(number) {
  const now = Date.now();
  if (lastPendingDialToast.number === number && now - lastPendingDialToast.at < 2000) return;
  lastPendingDialToast = { number, at: now };
  showWarning('Number ready. Register SIP to call.');
}

function clearPendingDialStorage(){
  chrome.storage?.local?.remove?.(PENDING_DIAL_STORAGE_KEYS);
}

function handleClickToCallNumber(number, options = {}){
  const cleanNumber = String(number || '').trim();
  if (!cleanNumber || shouldIgnoreDuplicatePendingDial(cleanNumber)) return;

  clearPendingDialStorage();

  state.typed = cleanNumber;
  updateDialModeUI();
  showView('dial');

  if (options.autoStart === true && isSipRegistered()) {
    startCall(cleanNumber);
    return;
  }

  if (!isSipRegistered()) {
    showPendingDialRegistrationToast(cleanNumber);
  }
}

function initClickToCallListener(){
  if (!globalThis.chrome?.runtime) return;

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'CLOUDSIP_PENDING_DIAL') {
      handleClickToCallNumber(message.number, { autoStart: message.autoStart === true });
    }
  });

  chrome.storage?.local?.get(PENDING_DIAL_STORAGE_KEYS, (result) => {
    if (!result.cloudsipPendingDialNumber) return;
    handleClickToCallNumber(result.cloudsipPendingDialNumber, {
      autoStart: result.cloudsipPendingDialAutoStart === true
    });
  });

  const params = new URLSearchParams(window.location.search);
  const dialNumber = params.get('dial');
  if (dialNumber) handleClickToCallNumber(dialNumber, { autoStart: params.get('autoStart') === '1' });
}

function buildSipConfig(settings){
  return {
    websocketUrl: settings.websocketUrl,
    sipUri: settings.sipUri || `sip:${settings.extension}@${settings.sipDomain}`,
    password: settings.password,
    displayName: settings.displayName || settings.extension,
    extension: settings.extension,
    autoAnswer: settings.autoAnswer,
    autoHoldOnSwitch: settings.autoHoldOnSwitch
  };
}


function sipConfigsMatch(firstConfig, secondConfig){
  if (!firstConfig || !secondConfig) return false;

  return firstConfig.websocketUrl === secondConfig.websocketUrl
    && firstConfig.sipUri === secondConfig.sipUri
    && firstConfig.password === secondConfig.password
    && firstConfig.displayName === secondConfig.displayName
    && firstConfig.extension === secondConfig.extension;
}

function updateHeaderFromSettings(settings){
  const displayNameText = document.getElementById('displayNameText');
  if (displayNameText) {
    displayNameText.textContent = settings.displayName || settings.extension || 'cloudSIP.app';
  }

  const companyWebsite = document.getElementById('companyWebsiteLink');
  if (companyWebsite) {
    const website = settings.companyWebsite || 'www.connxta.com';
    companyWebsite.textContent = website;
    companyWebsite.href = normalizeCompanyWebsiteUrl(website);
  }
}

function updateTodayDate(){
  const el = document.getElementById('todayDate');
  if (!el) return;

  const now = new Date();
  el.textContent = now.toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function initNavigation(){
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (!nav) return;
    showView(nav.dataset.nav);
  });
}

function initCallControls(){
  document.getElementById('hangup').addEventListener('click', hangupActiveCall);
  document.getElementById('holdBtn').addEventListener('click', toggleHoldCall);
  document.getElementById('muteBtn').addEventListener('click', toggleMuteCall);
  document.getElementById('acceptIncoming').addEventListener('click', answerIncomingCall);
  document.getElementById('rejectIncoming').addEventListener('click', rejectIncomingCall);
  document.getElementById('backToLogs').addEventListener('click', () => showView('logs'));
}

function showMicrophonePermissionButton(show = true){
  const banner = document.getElementById('microphonePermissionBanner');
  if (banner) banner.hidden = !show;
}

function bindMicrophonePermissionButton(onAllowed){
  const button = document.getElementById('allowMicrophoneButton');
  if (!button || button.cloudsipMicBound) return;

  button.cloudsipMicBound = true;
  button.addEventListener('click', async () => {
    button.disabled = true;
    const result = await requestMicrophonePermission({ force: true });
    await refreshAudioDevices();
    button.disabled = false;

    if (result.granted) {
      showMicrophonePermissionButton(false);
      await onAllowed?.();
      return;
    }

    showMicrophonePermissionButton(true);
  });
}

async function requestInitialExtensionMicrophonePermission(){
  if (!IS_EXTENSION) return true;

  if (hasCheckedMicrophonePermission()) {
    showMicrophonePermissionButton(false);
    return true;
  }

  const result = await requestMicrophonePermission();
  await refreshAudioDevices();
  showMicrophonePermissionButton(!result.granted);
  return result.granted;
}

function initPresenceSipControls(){
  window.addEventListener('presence:changed', (event) => {
    const presence = event.detail?.userPresence;

    if (presence === 'Offline') {
      unregisterSip();
      return;
    }

    if (['Available', 'Away', 'Busy', 'DND'].includes(presence) && !isSipRegistered()) {
      registerSip();
    }
  });
}

function getSipHandlers(){
  return {
    onIncomingCall: handleIncomingCall,
    onCallAccepted: handleCallAccepted,
    onCallEnded: handleCallEnded,
    onCallFailed: handleCallFailed,
    muted: handleCallMuted,
    unmuted: handleCallUnmuted,
    hold: handleCallHold,
    unhold: handleCallUnhold
  };
}

async function boot(){
  initTheme();
  initNavigation();
  initDialpad();
  initClickToCallListener();
  initCallControls();
  initLineManager();
  initSettings();
  initWebRtcDiagnostics();
  initPresence();
  initPresenceSipControls();
  initKeyboardShortcuts();
  const settings = getSettings();
  updateTodayDate();
  updateHeaderFromSettings(settings);
  let activeSipConfig = buildSipConfig(settings);
  let sipStarted = false;
  window.addEventListener('settings:changed', async (event) => {
    const nextSettings = event.detail?.settings || getSettings();
    updateHeaderFromSettings(nextSettings);
    applyCallBehaviorSettings(nextSettings);

    const nextSipConfig = buildSipConfig(nextSettings);
    if (sipConfigsMatch(activeSipConfig, nextSipConfig)) return;

    activeSipConfig = nextSipConfig;
    if (sipStarted) {
      await initSipClient(activeSipConfig, getSipHandlers());
    }
  });
  await initAudioDevices();
  initSoundManager();

  const startSipWhenAllowed = async () => {
    if (sipStarted) {
      await registerSip();
      return;
    }

    sipStarted = true;
    await initSipClient(activeSipConfig, getSipHandlers());
  };

  bindMicrophonePermissionButton(startSipWhenAllowed);
  const microphoneAllowed = await requestInitialExtensionMicrophonePermission();

  if (!IS_EXTENSION && blockSipForInvalidCompanyWebsite(settings.companyWebsite, { message: 'SIP Failed. Browser not supported.' })) {
    contactsModule.initContacts();
    renderLogs();
    showView('dial');
    startTimers();
    return;
  }

  if (microphoneAllowed) {
    await startSipWhenAllowed();
  }

  contactsModule.initContacts();
  renderLogs();

  showView('dial');
  startTimers();
}

boot();
