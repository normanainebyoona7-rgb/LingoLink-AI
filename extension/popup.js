// Load saved preferences
chrome.storage.local.get(['sourceLang', 'targetLang'], (data) => {
  if (data.sourceLang) document.getElementById('sourceLanguage').value = data.sourceLang;
  if (data.targetLang) document.getElementById('targetLanguage').value = data.targetLang;
});

// Save preferences on change
document.getElementById('sourceLanguage').addEventListener('change', (e) => {
  chrome.storage.local.set({ sourceLang: e.target.value });
});

document.getElementById('targetLanguage').addEventListener('change', (e) => {
  chrome.storage.local.set({ targetLang: e.target.value });
});

document.getElementById('startBtn').addEventListener('click', async () => {
  const sourceLang = document.getElementById('sourceLanguage').value;
  const targetLang = document.getElementById('targetLanguage').value;
  const statusDiv = document.getElementById('status');

  if (sourceLang === targetLang) {
    statusDiv.textContent = 'Error: Languages must be different.';
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab) {
      statusDiv.textContent = 'No active tab found.';
      return;
    }

    // 1. Show overlay on the page
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'showOverlay' });
    } catch (e) {
      // If content script isn't injected yet, inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await chrome.tabs.sendMessage(tab.id, { action: 'showOverlay' });
      } catch (injectError) {
        console.error('Inject error:', injectError);
      }
    }

    // 2. Get stream ID
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id,
      consumerTabId: tab.id
    });

    if (!streamId) {
      statusDiv.textContent = 'Error: No stream ID.';
      return;
    }

    // 3. Send to background
    chrome.runtime.sendMessage({
      action: 'startCapture',
      streamId: streamId,
      targetTabId: tab.id,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang
    }, (response) => {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Error: background not ready.';
        return;
      }

      if (response && response.success) {
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'block';
        statusDiv.textContent = 'Listening to tab audio...';
        setTimeout(() => window.close(), 1200);
      } else {
        statusDiv.textContent = 'Error: ' + (response?.error || 'Failed');
      }
    });
  } catch (error) {
    statusDiv.textContent = 'Error: ' + error.message;
  }
});

document.getElementById('stopBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopCapture' }, () => {
    if (chrome.runtime.lastError) console.error(chrome.runtime.lastError);
  });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'hideOverlay' }).catch(() => {});
    }
  });

  document.getElementById('startBtn').style.display = 'block';
  document.getElementById('stopBtn').style.display = 'none';
  document.getElementById('status').textContent = 'Stopped';
});