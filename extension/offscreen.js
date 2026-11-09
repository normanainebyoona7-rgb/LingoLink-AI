let mediaRecorder = null;
let audioChunks = [];
let stream = null;
let isRecording = false;
let sourceLang = 'english';
let targetLang = 'luganda';

// Web Audio API for silence detection
let audioContext = null;
let audioSource = null;
let analyser = null;
let vadInterval = null;
let silenceStartTime = 0;

// LOWERED THRESHOLD: 0.005 makes it more sensitive to quiet voices in meetings/videos
const SILENCE_THRESHOLD = 0.005; 
const SILENCE_DURATION_MS = 800; // How long silence lasts before we cut
const MAX_CHUNK_MS = 6000;       // Max time before forcing a cut
let chunkStartTime = 0;

// NOTE: Change this to your Render URL when testing production
// Local: http://127.0.0.1:8000
// Prod: https://lingolink-ai.onrender.com
const API_URL = 'http://127.0.0.1:8000';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    startAudioCapture(message.streamId, message.sourceLanguage, message.targetLanguage)
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

async function startAudioCapture(streamId, sourceLanguage, targetLanguage) {
  try {
    if (isRecording) stopAudioCapture();

    sourceLang = sourceLanguage;
    targetLang = targetLanguage;

    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });

    // Route audio to speakers so user can still hear it
    audioContext = new AudioContext();
    audioSource = audioContext.createMediaStreamSource(stream);
    audioSource.connect(audioContext.destination);

    // Setup Analyser for VAD
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioSource.connect(analyser);

    setupMediaRecorder();
    isRecording = true;
    chunkStartTime = Date.now();

    // Start VAD loop
    startVAD();

  } catch (error) {
    console.error('Offscreen error:', error);
    chrome.runtime.sendMessage({ action: 'captureError', error: error.message });
  }
}

function setupMediaRecorder() {
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : 'audio/webm';

  mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
  audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) audioChunks.push(event.data);
  };

  mediaRecorder.onstop = async () => {
    if (audioChunks.length > 0) {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      // Don't process if it's too short (like a tiny click)
      if (audioBlob.size > 2000) {
        await processAudioChunk(audioBlob);
      }
    }
    // If still recording, restart the recorder for the next chunk
    if (isRecording) {
      audioChunks = [];
      mediaRecorder.start();
      chunkStartTime = Date.now();
    }
  };

  mediaRecorder.start();
}

// The VAD (Voice Activity Detection) Loop
function startVAD() {
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  if (vadInterval) clearInterval(vadInterval);
  silenceStartTime = 0;

  vadInterval = setInterval(() => {
    if (!isRecording || !analyser) return;

    analyser.getByteTimeDomainData(dataArray);

    // Calculate RMS (Root Mean Square) to measure volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const x = (dataArray[i] - 128) / 128;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / bufferLength);

    const now = Date.now();
    const timeSinceChunkStart = now - chunkStartTime;

    if (rms < SILENCE_THRESHOLD) {
      // It's quiet
      if (silenceStartTime === 0) silenceStartTime = now;
      
      // If it's been quiet long enough AND we've recorded at least 1.5 seconds
      if ((now - silenceStartTime) > SILENCE_DURATION_MS && timeSinceChunkStart > 1500) {
        console.log('Silence detected, cutting chunk.');
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
        silenceStartTime = 0; // reset
      }
    } else {
      // Sound detected
      silenceStartTime = 0;
      
      // If we hit max length (6s), force cut even if they are still speaking
      if (timeSinceChunkStart > MAX_CHUNK_MS) {
        console.log('Max chunk length reached, forcing cut.');
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }
    }
  }, 100); // Check every 100ms
}

function stopAudioCapture() {
  isRecording = false;

  if (vadInterval) {
    clearInterval(vadInterval);
    vadInterval = null;
  }

  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    try { mediaRecorder.stop(); } catch (e) {}
  }

  if (audioContext) {
    try { audioContext.close(); } catch (e) {}
    audioContext = null;
  }

  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }

  mediaRecorder = null;
  audioChunks = [];
  analyser = null;
}

async function processAudioChunk(audioBlob) {
  try {
    console.log(`Processing chunk: ${(audioBlob.size / 1024).toFixed(1)} KB`);

    // 1. Transcribe
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('language', sourceLang); 

    const transcribeResponse = await fetch(`${API_URL}/speech/transcribe`, {
      method: 'POST',
      body: formData
    });

    if (!transcribeResponse.ok) {
      const errText = await transcribeResponse.text();
      console.error(`Transcription failed (${transcribeResponse.status}):`, errText);
      return;
    }

    const data = await transcribeResponse.json();
    const text = data.text || data.transcribed_text || '';

    if (!text.trim()) {
      console.log("Heard silence or hallucination, skipping.");
      return;
    }

    console.log(`Heard: "${text}"`);

    // 2. Translate
    const translateResponse = await fetch(`${API_URL}/translate/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text,
        source_language: sourceLang,
        target_language: targetLang
      })
    });

    if (!translateResponse.ok) {
      const errText = await translateResponse.text();
      console.error(`Translation failed (${translateResponse.status}):`, errText);
      return;
    }

    const translateData = await translateResponse.json();
    const translatedText = translateData.translated_text || '';

    if (!translatedText.trim()) return;
    console.log(`Translated: "${translatedText}"`);

    // 3. Send to content script for display
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
    console.error('Processing error:', error);
  }
}