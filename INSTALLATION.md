# CloudSIP Extension Installation Guide

This guide explains how to install, configure, update, and troubleshoot the CloudSIP browser extension from the unpacked `extension/` folder.

## 1. Prerequisites

Before installing, make sure you have:

- Google Chrome, Microsoft Edge, Brave, or another Chromium browser with Manifest V3 support.
- Access to this repository on the machine where the browser is running.
- SIP credentials for a WebRTC-capable extension.
- A SIP WebSocket URL, usually using `wss://` for production.
- Permission to use the microphone on the workstation.

Your SIP server must support WebRTC media and SIP over WebSocket. For production deployments, use TLS/WSS and a valid certificate.

## 2. Install in Google Chrome

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the repository's `extension/` folder.
6. Confirm that **CloudSIP** appears in the extensions list.
7. Pin CloudSIP to the toolbar if you want quick access.
8. Click the CloudSIP icon to open the phone side panel.

## 3. Install in Microsoft Edge

1. Open Edge.
2. Go to `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select the repository's `extension/` folder.
6. Confirm that **CloudSIP** appears in the extensions list.
7. Click the CloudSIP icon to open the phone side panel.

## 4. First-time configuration

1. Open CloudSIP from the extension icon.
2. Click **Settings**.
3. In **Audio Devices**, click **Allow Microphone** if prompted.
4. In **SIP Account**, enter:
   - **Extension**: the user/extension number.
   - **SIP Domain**: the SIP domain or PBX host.
   - **WebSocket URL**: the SIP WebSocket endpoint, for example `wss://pbx.example.com:8089/ws`.
   - **SIP URI**: the SIP address, for example `sip:1001@pbx.example.com`.
   - **Display Name**: the caller display name shown by the phone.
   - **Password**: the SIP extension password.
5. Click **Save Settings**.
6. Use **Reconnect SIP** in **WebRTC Diagnostics** if the phone does not register automatically.
7. Confirm that the header status changes from **Offline** to a registered/online state.

## 5. Enable click-to-call on websites

CloudSIP can add call buttons beside phone numbers on webpages.

1. Open **Settings**.
2. In **Behavior**, enable **Enable number detection on websites**.
3. Optionally enable **Auto dial clicked number** to start calls immediately after clicking a detected number.
4. Open or refresh a webpage that contains phone numbers.
5. Click the CloudSIP call button beside a detected number.
6. If the page loads numbers dynamically, click **Rescan current page** in Settings.

The extension intentionally avoids scanning forms, buttons, links, code blocks, scripts, and some date/price patterns to reduce false positives.

## 6. Updating the unpacked extension

When files in `extension/` change:

1. Open `chrome://extensions` or `edge://extensions`.
2. Find **CloudSIP**.
3. Click the reload icon for the extension.
4. Close and reopen the CloudSIP side panel.
5. Refresh any webpages where click-to-call should be active.

If behavior looks stale, fully remove the extension and load the unpacked folder again.

## 7. Troubleshooting

### Microphone permission is blocked

- Open browser site/extension permission settings and allow microphone access for CloudSIP.
- Reopen the CloudSIP side panel.
- In **WebRTC Diagnostics**, click **Allow Microphone / Retry SIP**.

### SIP does not register

- Verify the SIP domain, SIP URI, extension, password, and WebSocket URL.
- Confirm the WebSocket URL uses `wss://` in production.
- Check that the PBX supports WebRTC, DTLS-SRTP, ICE, and SIP over WebSocket.
- Use **WebRTC Diagnostics** to inspect SIP registration and WebSocket state.

### No audio or wrong audio device

- Check operating-system input/output device permissions.
- Use **Refresh devices** in **Audio Devices**.
- Select the intended microphone and speaker.
- Run **Test microphone** and **Test speaker** in diagnostics.
- Note that speaker selection depends on browser support for audio output device APIs.

### Click-to-call buttons do not appear

- Confirm **Enable number detection on websites** is enabled.
- Refresh the webpage.
- Click **Rescan current page** from Settings.
- Confirm the page is not a restricted browser page such as `chrome://extensions`, where content scripts cannot run.
- Check that the number has at least seven digits and is not inside an ignored element such as an input, button, code block, or existing link.

## 8. Uninstall

1. Open `chrome://extensions` or `edge://extensions`.
2. Find **CloudSIP**.
3. Click **Remove**.
4. Confirm removal.

Removing the extension removes browser-extension storage associated with the installed extension ID. Download any recordings you need before uninstalling.
