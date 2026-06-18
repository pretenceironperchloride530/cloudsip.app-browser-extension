import './assets/js/app.js';

const CONNXTA_URL = 'https://www.connxta.com';

function openExternalTab(url){
  if (globalThis.chrome?.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }

  window.open(url, '_blank');
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('#companyWebsiteLink');
  if (!link) return;

  event.preventDefault();
  openExternalTab(CONNXTA_URL);
});
