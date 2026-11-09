let activeTabId = null;
let mediaStreamId = null;
let isCapturing = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    startCapture(
      message.streamId, 
      message.targetTabId, 
      message.sourceLanguage, 
      message.targetLanguage
    )
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'stopCapture') {
    stopCapture()
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'captureError') {
    console.error('Capture error:', message.error);
    isCapturing = false;
    mediaStreamId = null;
    activeTabId = null;
    sendResponse({ success: true });
    return true;
  }
});

async function startCapture(streamId, tabId, sourceLang, targetLang) {
  try {
    if (isCapturing) await stopCapture();

    mediaStreamId = streamId;
    activeTabId = tabId;
    isCapturing = true;

    await ensureOffscreenDocument();

    // Pass the languages down to the offscreen processor
    await chrome.runtime.sendMessage({
      action: 'startRecording',
      streamId: streamId,
      sourceLanguage: sourceLang,
      targetLanguage: targetLang
    });

    return { success: true };
  } catch (error) {
    console.error('Start capture error:', error);
    isCapturing = false;
    mediaStreamId = null;
    activeTabId = null;
    throw error;
  }
}

async function stopCapture() {
  try {
    await chrome.runtime.sendMessage({ action: 'stopRecording' }).catch(() => {});
    isCapturing = false;
    mediaStreamId = null;
    activeTabId = null;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Process tab audio for live translation'
  });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId && isCapturing) stopCapture();
});