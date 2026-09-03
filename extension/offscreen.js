let mediaRecorder = null;
let audioChunks = [];
let stream = null;
let isRecording = false;
let currentTargetLanguage = 'en';
let recordInterval = null;
let audioContext = null;
let audioSource = null;

const API_URL = 'http://127.0.0.1:8000';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    startAudioCapture(message.streamId, message.targetLanguage)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (message.action === 'stopRecording') {
    stopAudioCapture();
    sendResponse({ success: true });
    return true;
  }
  return true;
});

async function startAudioCapture(streamId, targetLanguage) {
  try {
    if (isRecording) {
      stopAudioCapture();
    }

    currentTargetLanguage = targetLanguage;

    // Get the media stream from the stream ID
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    // Create AudioContext to route audio back to output (so user hears it)
    audioContext = new AudioContext();
    audioSource = audioContext.createMediaStreamSource(stream);
    
    // Connect to destination so audio still plays
    audioSource.connect(audioContext.destination);

    // Set up MediaRecorder
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
      ? 'audio/webm;codecs=opus' 
      : 'audio/webm';
    
    mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      if (audioChunks.length > 0) {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        await sendAudioForTranslation(audioBlob, currentTargetLanguage);
      }
    };

    mediaRecorder.start(1000);
    isRecording = true;
    console.log('Recording started - audio is playing AND being captured');

    // Record in 8-second chunks
    recordInterval = setInterval(() => {
      if (isRecording && mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        setTimeout(() => {
          if (isRecording) {
            audioChunks = [];
            try {
              mediaRecorder.start(1000);
            } catch (e) {
              console.error('Restart error:', e);
            }
          }
        }, 300);
      }
    }, 8000);

  } catch (error) {
    console.error('Offscreen error:', error);
    chrome.runtime.sendMessage({ action: 'captureError', error: error.message });
  }
}

function stopAudioCapture() {
  isRecording = false;
  
  if (recordInterval) {
    clearInterval(recordInterval);
    recordInterval = null;
  }
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try {
      mediaRecorder.stop();
    } catch (e) {}
  }
  
  if (audioContext) {
    try {
      audioContext.close();
    } catch (e) {}
    audioContext = null;
  }
  
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  
  mediaRecorder = null;
  audioChunks = [];
  console.log('Recording stopped');
}

async function sendAudioForTranslation(audioBlob, targetLanguage) {
  try {
    console.log('Sending audio chunk, size:', audioBlob.size);
    
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');

    // Transcribe
    const transcribeResponse = await fetch(`${API_URL}/speech/transcribe`, {
      method: 'POST',
      body: formData
    });

    if (!transcribeResponse.ok) {
      console.error('Transcription failed:', transcribeResponse.status);
      return;
    }

    const data = await transcribeResponse.json();
    const text = data.text || data.transcribed_text || '';

    if (!text.trim()) {
      console.log('No speech detected');
      return;
    }

    console.log('Transcribed:', text);

    // Translate
    const translateResponse = await fetch(`${API_URL}/translate/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        source_language: 'auto',
        target_language: targetLanguage
      })
    });

    if (!translateResponse.ok) {
      console.error('Translation failed:', translateResponse.status);
      return;
    }

    const translateData = await translateResponse.json();
    const translatedText = translateData.translated_text || '';

    if (!translatedText.trim()) return;

    console.log('Translated:', translatedText);

    // Send to content script for display
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      try {
        await chrome.tabs.sendMessage(tabs[0].id, {
          action: 'updateSubtitle',
          text: translatedText
        });
      } catch (e) {
        console.error('Send subtitle error:', e);
      }
    }
  } catch (error) {
    console.error('Translation error:', error);
  }
}