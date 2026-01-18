import { useEffect, useRef, useState } from 'react';
import { createRenderer } from '@echopixel/core';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const renderer = createRenderer(canvas);
      renderer.clear(0.2, 0.4, 0.8); // 파란색으로 클리어

      // cleanup 함수: 컴포넌트 언마운트 또는 재렌더링 시 호출
      return () => {
        renderer.dispose();
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      console.error('Failed to initialize renderer:', err);
    }
  }, []);

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h1>EchoPixel Demo</h1>
        <p>Failed to initialize WebGL2: {error}</p>
        <p>Please use a modern browser (Chrome, Edge, Firefox).</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <h1>EchoPixel Demo</h1>
      <canvas
        ref={canvasRef}
        width={512}
        height={512}
        style={{ border: '1px solid #ccc' }}
      />
    </div>
  );
}
