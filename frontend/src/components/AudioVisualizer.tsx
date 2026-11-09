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
      // Clean up when recording stops
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

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animationRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray); // Use frequency data for better visual

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;
        
        // We want a nice symmetrical wave in the center
        const numBars = 40;
        const barWidth = 6;
        const gap = 6;
        const totalWidth = numBars * (barWidth + gap);
        const startX = (width - totalWidth) / 2;

        // Gold Glow Effect
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#F59E0B';
        ctx.fillStyle = '#F59E0B';

        for (let i = 0; i < numBars; i++) {
          // Sample the data. Use a curve so the middle bars are taller.
          const index = Math.floor((i / numBars) * bufferLength);
          let value = dataArray[index];
          
          // Boost the middle slightly so it naturally forms an arc
          const centerDist = Math.abs(i - numBars / 2) / (numBars / 2);
          const arcMultiplier = 1 - (centerDist * 0.5); 
          
          // Calculate height (minimum 6px so it looks like a flat line when silent)
          const barHeight = Math.max(6, (value / 255) * height * 0.8 * arcMultiplier);
          
          const x = startX + i * (barWidth + gap);
          const y = centerY - (barHeight / 2);

          // Draw a pill-shaped bar
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
          ctx.fill();
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
    <div className="audio-visualizer-container fade-in">
      <canvas
        ref={canvasRef}
        width={600}
        height={120}
        className="audio-visualizer-canvas"
      />
    </div>
  );
}