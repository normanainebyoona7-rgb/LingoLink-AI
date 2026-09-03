let activeTabId = null;
let mediaStreamId = null;
let isCapturing = false;
let currentTargetLanguage = 'en';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startCapture') {
    startCapture(message.streamId, message.targetTabId, message.targetLanguage)
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

  if (message.action === 'getStreamId') {
    sendResponse({ streamId: mediaStreamId, targetLanguage: currentTargetLanguage });
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

async function startCapture(streamId, tabId, targetLanguage) {
  try {
    if (isCapturing) {
      await stopCapture();
    }

    mediaStreamId = streamId;
    activeTabId = tabId;
    currentTargetLanguage = targetLanguage;
    isCapturing = true;

    console.log('Capture started with stream ID:', streamId);

    // Create offscreen document
    await ensureOffscreenDocument();

    // Send to offscreen
    await chrome.runtime.sendMessage({
      action: 'startRecording',
      streamId: streamId,
      targetLanguage: targetLanguage
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
    try {
      await chrome.runtime.sendMessage({ action: 'stopRecording' });
    } catch (e) {}
    
    isCapturing = false;
    mediaStreamId = null;
    activeTabId = null;
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function ensureOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
      return;
    }

    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Process tab audio for live translation'
    });
    
    console.log('Offscreen document created');
  } catch (error) {
    console.error('Offscreen error:', error);
    throw error;
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId && isCapturing) {
    stopCapture();
  }
});