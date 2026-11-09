let overlayContainer = null;
let subtitleDiv = null;
let fadeTimeout = null;

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
  overlayContainer.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;display:flex;justify-content:center;';

  subtitleDiv = document.createElement('div');
  // Savanna Gold theme
  subtitleDiv.style.cssText = 'background:rgba(26, 18, 8, 0.92);color:#FDE68A;padding:14px 24px;border-radius:12px;font-size:18px;font-weight:600;max-width:800px;text-align:center;font-family:"Segoe UI",sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.4);transition:opacity 0.4s ease;border:1px solid rgba(217, 119, 6, 0.5);backdrop-filter:blur(8px);text-shadow: 0 1px 2px rgba(0,0,0,0.8);';
  subtitleDiv.innerHTML = '🎤 Listening...';

  overlayContainer.appendChild(subtitleDiv);
  document.body.appendChild(overlayContainer);
}

function showSubtitle(text) {
  if (!subtitleDiv) createOverlay();
  
  subtitleDiv.textContent = text;
  subtitleDiv.style.opacity = '1';
  
  // Reset fade timer
  if (fadeTimeout) clearTimeout(fadeTimeout);
  fadeTimeout = setTimeout(() => {
    if (subtitleDiv) subtitleDiv.style.opacity = '0';
  }, 5000);
}

function removeOverlay() {
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
    subtitleDiv = null;
  }
  if (fadeTimeout) {
    clearTimeout(fadeTimeout);
    fadeTimeout = null;
  }
}