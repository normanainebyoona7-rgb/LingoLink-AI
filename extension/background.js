let capturedStreamId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'processStream') {
    capturedStreamId = message.streamId;
    
    // Create offscreen document and start recording
    ensureOffscreenDocument().then(() => {
      chrome.runtime.sendMessage({
        action: 'startRecording',
        targetLanguage: message.targetLanguage
      });
    });
    
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'stopCapture') {
    chrome.runtime.sendMessage({ action: 'stopRecording' });
    capturedStreamId = null;
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'getStreamId') {
    sendResponse({ streamId: capturedStreamId });
    return true;
  }
});

async function ensureOffscreenDocument() {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Process tab audio for translation'
    });
  } catch (error) {
    console.error('Offscreen error:', error);
  }
}