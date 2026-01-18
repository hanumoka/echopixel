import { useEffect, useRef } from 'react';
import { createRenderer } from '@echopixel/core';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createRenderer(canvas);
    renderer.clear(0.2, 0.4, 0.8); // 파란색으로 클리어
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h1>EchoPixel Demo</h1>
      <canvas ref={canvasRef} width={512} height={512} style={{ border: '1px solid #ccc' }} />
    </div>
  );
}
