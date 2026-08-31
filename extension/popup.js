document.getElementById('startBtn').addEventListener('click', async () => {
  const targetLang = document.getElementById('targetLanguage').value;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab) {
    document.getElementById('status').textContent = 'No active tab';
    return;
  }

  // Show overlay
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'showOverlay' });
  } catch (e) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    await chrome.tabs.sendMessage(tab.id, { action: 'showOverlay' });
  }

  // Capture tab audio directly from popup (user gesture context)
  try {
    chrome.tabCapture.capture({ audio: true, video: false }, async (stream) => {
      if (chrome.runtime.lastError || !stream) {
        document.getElementById('status').textContent = 'Error: ' + (chrome.runtime.lastError?.message || 'No stream');
        return;
      }

      // Send stream ID to background for offscreen processing
      chrome.runtime.sendMessage({
        action: 'processStream',
        streamId: stream.id,
        targetLanguage: targetLang
      });

      document.getElementById('startBtn').style.display = 'none';
      document.getElementById('stopBtn').style.display = 'block';
      document.getElementById('status').textContent = '🎤 Translating...';
    });
  } catch (error) {
    document.getElementById('status').textContent = 'Error: ' + error.message;
  }
});

document.getElementById('stopBtn').addEventListener('click', async () => {
  chrome.runtime.sendMessage({ action: 'stopCapture' });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    try { await chrome.tabs.sendMessage(tab.id, { action: 'hideOverlay' }); } catch (e) {}
  }
  document.getElementById('startBtn').style.display = 'block';
  document.getElementById('stopBtn').style.display = 'none';
  document.getElementById('status').textContent = 'Stopped';
});

document.getElementById('targetLanguage').addEventListener('change', (e) => {
  chrome.storage.local.set({ targetLanguage: e.target.value });
});

chrome.storage.local.get('targetLanguage', (data) => {
  if (data.targetLanguage) {
    document.getElementById('targetLanguage').value = data.targetLanguage;
  }
});