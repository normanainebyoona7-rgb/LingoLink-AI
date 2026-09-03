let overlayContainer = null;
let subtitleDiv = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showOverlay') {
    createOverlay();
    sendResponse({ success: true });
  } else if (message.action === 'updateSubtitle') {
    showSubtitle(message.text);
    sendResponse({ success: true });
  } else if (message.action === 'hideOverlay') {
    removeOverlay();
    sendResponse({ success: true });
  }
  return true;
});

function createOverlay() {
  if (overlayContainer) return;

  overlayContainer = document.createElement('div');
  overlayContainer.id = 'lingolink-overlay';
  overlayContainer.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:999999;pointer-events:none;';

  subtitleDiv = document.createElement('div');
  subtitleDiv.style.cssText = 'background:rgba(0,0,0,0.85);color:white;padding:12px 20px;border-radius:10px;font-size:16px;font-weight:600;max-width:600px;text-align:center;font-family:sans-serif;transition:opacity 0.3s;';
  subtitleDiv.textContent = '🎤 Listening...';

  overlayContainer.appendChild(subtitleDiv);
  document.body.appendChild(overlayContainer);
}

function showSubtitle(text) {
  if (subtitleDiv) {
    subtitleDiv.textContent = text;
    subtitleDiv.style.opacity = '1';
  }
}

function removeOverlay() {
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
    subtitleDiv = null;
  }
}