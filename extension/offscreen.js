let mediaRecorder = null;
let audioChunks = [];
let stream = null;
let isRecording = false;

const API_URL = 'http://127.0.0.1:8000';
const AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTc4ODI1NTM5NX0';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    startAudioCapture(message.targetLanguage);
    sendResponse({ success: true });
  } else if (message.action === 'stopRecording') {
    stopAudioCapture();
    sendResponse({ success: true });
  }
  return true;
});

async function startAudioCapture(targetLanguage) {
  try {
    // Get the stream ID from background
    const streamId = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'getStreamId' }, (response) => {
        resolve(response.streamId);
      });
    });

    if (!streamId) {
      console.error('No stream ID');
      return;
    }

    // Get the actual stream using getUserMedia with the stream ID
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await sendAudioForTranslation(audioBlob, targetLanguage);
    };

    mediaRecorder.start();
    isRecording = true;
    console.log('Recording started in offscreen document');

    // Record in 5-second chunks
    setInterval(() => {
      if (isRecording && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        setTimeout(() => {
          if (isRecording) {
            audioChunks = [];
            mediaRecorder.start();
          }
        }, 200);
      }
    }, 5000);
  } catch (error) {
    console.error('Error in offscreen:', error);
    chrome.runtime.sendMessage({ action: 'offscreenError', error: error.message });
  }
}

function stopAudioCapture() {
  isRecording = false;
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}

async function sendAudioForTranslation(audioBlob, targetLanguage) {
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');

    // Send to backend for transcription
    const transcribeResponse = await fetch(`${API_URL}/speech/transcribe`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: formData
    });

    if (transcribeResponse.ok) {
      const data = await transcribeResponse.json();
      const text = data.text || '';
      
      if (!text.trim()) return;

      // Translate
      const translateResponse = await fetch(`${API_URL}/translate/text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AUTH_TOKEN}`
        },
        body: JSON.stringify({
          text: text,
          source_language: 'auto',
          target_language: targetLanguage,
          user_id: 1
        })
      });

      if (translateResponse.ok) {
        const translateData = await translateResponse.json();
        
        // Send translated text to content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateSubtitle',
              text: translateData.translated_text
            });
          }
        });
      }
    }
  } catch (error) {
    console.error('Translation error in offscreen:', error);
  }
}