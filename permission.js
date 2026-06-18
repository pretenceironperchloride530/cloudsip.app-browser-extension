const grantMicBtn = document.getElementById('grantMicBtn');
const permissionError = document.getElementById('permissionError');

function setError(message){
  if (permissionError) permissionError.textContent = message;
}

grantMicBtn?.addEventListener('click', async () => {
  grantMicBtn.disabled = true;
  setError('');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    chrome.storage.local.set({ cloudsipMicAllowed: true }, () => window.close());
  } catch (error) {
    console.warn('CloudSIP microphone permission failed:', error);
    setError(error?.message || 'Microphone permission was not granted.');
    grantMicBtn.disabled = false;
  }
});
