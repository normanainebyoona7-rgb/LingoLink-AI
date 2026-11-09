import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isRecording: boolean;
}

export default function AudioVisualizer({ isRecording }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      return;
    }

    const startAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
        }
        
        audioContextRef.current = audioCtx;

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyserRef.current = analyser;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        drawWave(analyser);
      } catch (err) {
        console.error('Mic access failed:', err);
      }
    };

    const drawWave = (analyser: AnalyserNode) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Force fixed width/height for Android stability
      canvas.width = 300;
      canvas.height = 100;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animationRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;
        
        const numBars = 24; 
        const barWidth = 6;
        const gap = 6;
        const totalWidth = numBars * (barWidth + gap);
        const startX = (width - totalWidth) / 2;

        ctx.fillStyle = '#F59E0B'; // Savanna Gold

        for (let i = 0; i < numBars; i++) {
          const index = Math.floor((i / numBars) * bufferLength);
          let value = dataArray[index];
          
          const centerDist = Math.abs(i - numBars / 2) / (numBars / 2);
          const arcMultiplier = 1 - (centerDist * 0.5); 
          
          const barHeight = Math.max(4, (value / 255) * height * 0.8 * arcMultiplier);
          
          const x = startX + i * (barWidth + gap);
          const y = centerY - (barHeight / 2);

          // Standard rectangle draw (no roundRect to avoid WebView bugs)
          ctx.beginPath();
          ctx.fillRect(x, y, barWidth, barHeight);
        }
      };

      draw();
    };

    startAudio();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [isRecording]);

  if (!isRecording) return null;

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px 0'
    }}>
      <canvas
        ref={canvasRef}
        style={{ width: '300px', height: '100px' }}
      />
    </div>
  );
}