document.getElementById('startBtn').addEventListener('click', async () => {
  const targetLang = document.getElementById('targetLanguage').value;
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      document.getElementById('status').textContent = 'No active tab';
      return;
    }

    // Show overlay on the page
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'showOverlay' });
    } catch (e) {
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

    // Get stream ID with consumerTabId to keep audio playing
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tab.id,
      consumerTabId: tab.id  // This keeps audio playing in the tab
    });

    if (!streamId) {
      document.getElementById('status').textContent = 'Error: No stream ID';
      return;
    }

    // Send to background
    chrome.runtime.sendMessage({
      action: 'startCapture',
      streamId: streamId,
      targetTabId: tab.id,
      targetLanguage: targetLang
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Background error:', chrome.runtime.lastError.message);
        document.getElementById('status').textContent = 'Error: background not ready';
        return;
      }
      
      if (response && response.success) {
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('stopBtn').style.display = 'block';
        document.getElementById('status').textContent = '🎤 Translating... Audio still playing!';
        // Close popup automatically so user can interact with page
        setTimeout(() => window.close(), 1000);
      } else {
        document.getElementById('status').textContent = 'Error: ' + (response?.error || 'Failed');
      }
    });
  } catch (error) {
    document.getElementById('status').textContent = 'Error: ' + error.message;
  }
});

document.getElementById('stopBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopCapture' }, () => {
    if (chrome.runtime.lastError) {
      console.error('Stop error:', chrome.runtime.lastError.message);
    }
  });
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      try {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'hideOverlay' });
      } catch (e) {}
    }
  });
  
  document.getElementById('startBtn').style.display = 'block';
  document.getElementById('stopBtn').style.display = 'none';
  document.getElementById('status').textContent = 'Stopped';
});

// Save language preference
document.getElementById('targetLanguage').addEventListener('change', (e) => {
  chrome.storage.local.set({ targetLanguage: e.target.value });
});

// Load saved language
chrome.storage.local.get('targetLanguage', (data) => {
  if (data.targetLanguage) {
    document.getElementById('targetLanguage').value = data.targetLanguage;
  }
});