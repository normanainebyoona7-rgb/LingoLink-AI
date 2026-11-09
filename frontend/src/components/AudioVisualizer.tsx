import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isRecording: boolean;
}

export default function AudioVisualizer({ isRecording }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRecording) {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Force fixed width/height for Android stability
    canvas.width = 300;
    canvas.height = 100;

    let time = 0;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      time += 0.05;

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
        // Create a natural, flowing wave using sine functions
        const centerDist = Math.abs(i - numBars / 2) / (numBars / 2);
        const arcMultiplier = 1 - (centerDist * 0.5); 
        
        // Math to make the bars bounce like someone is speaking
        const sine1 = Math.sin(time + i * 0.3);
        const sine2 = Math.cos(time * 1.5 - i * 0.2);
        const wave = (sine1 + sine2) / 2; // range -1 to 1
        
        // Convert wave to positive height
        let value = (wave + 1) / 2; // range 0 to 1
        
        // Add slight randomness to make it look organic
        value = Math.max(0.1, value * (0.8 + Math.random() * 0.4));

        const barHeight = Math.max(4, value * height * 0.8 * arcMultiplier);
        
        const x = startX + i * (barWidth + gap);
        const y = centerY - (barHeight / 2);

        ctx.beginPath();
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isRecording]);

  if (!isRecording) return null;

  return (
    <div style={{
      width: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '20px 0',
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      pointerEvents: 'none' // Let clicks pass through to the button
    }}>
      <canvas
        ref={canvasRef}
        style={{ width: '300px', height: '100px' }}
      />
    </div>
  );
}