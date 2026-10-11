import { useEffect, useRef } from 'react';
import { getMicAnalyser } from './scoring/dtw';

const BAR_COUNT = 48;
const BIN_COUNT = 128; // fftSize 256 / 2

/**
 * Live spectrum-bars visualizer. Taps the SAME mic stream the
 * pronunciation scorer records from (dtw.js shared stream) —
 * no second getUserMedia. Bars sit near the bottom when the room
 * is quiet and rise with real audio energy.
 */
export default function SpectrumBars({ height = 44 }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cssW = 0;
    let cssH = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, rect.width);
      cssH = Math.max(1, rect.height);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const freq = new Uint8Array(BIN_COUNT);
    // Pre-map each bar to its source bin (spread across the spectrum).
    const barBins = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      const start = Math.floor((i / BAR_COUNT) * (BIN_COUNT - 1));
      const end = Math.floor(((i + 1) / BAR_COUNT) * (BIN_COUNT - 1));
      barBins.push([start, Math.max(start + 1, end)]);
    }

    // Per-bar smoothed value so motion looks fluid, not jumpy.
    const smooth = new Float32Array(BAR_COUNT);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = getMicAnalyser();
      if (!analyser) {
        // Mic not live yet — idle state: bars rest near the bottom.
        ctx.clearRect(0, 0, cssW, cssH);
        for (let i = 0; i < BAR_COUNT; i++) smooth[i] = 0;
        drawBars(0);
        return;
      }
      analyser.getByteFrequencyData(freq);
      let energy = 0;
      const values = [];
      for (let i = 0; i < BAR_COUNT; i++) {
        const [s, e] = barBins[i];
        let sum = 0;
        for (let b = s; b < e; b++) sum += freq[b];
        const v = sum / ((e - s) * 255);
        values.push(v);
        energy += v;
      }
      energy /= BAR_COUNT;
      // Track a slow floor so a quiet room settles to the baseline.
      smoothFloor = Math.max(0.02, smoothFloor * 0.95 + energy * 0.05);
      for (let i = 0; i < BAR_COUNT; i++) {
        const target = Math.min(1, Math.max(0, (values[i] - smoothFloor * 0.6) / Math.max(0.05, 1 - smoothFloor * 0.6)));
        smooth[i] = smooth[i] * 0.6 + target * 0.4;
      }
      ctx.clearRect(0, 0, cssW, cssH);
      drawBars(1);
    };

    let smoothFloor = 0.05;

    const drawBars = () => {
      const gap = Math.max(1, cssW * 0.006);
      const barW = (cssW - gap * (BAR_COUNT - 1)) / BAR_COUNT;
      for (let i = 0; i < BAR_COUNT; i++) {
        const v = smooth[i];
        const h = Math.max(2, v * (cssH - 4));
        const x = i * (barW + gap);
        const y = cssH - h;
        // HSL gradient: teal → violet as height rises.
        const hue = 170 + v * 110;
        ctx.fillStyle = `hsl(${hue} 80% ${55 + v * 12}%)`;
        const r = Math.min(barW / 2, 2);
        roundTopRect(ctx, x, y, barW, h, r);
      }
    };

    const roundTopRect = (c, x, y, w, h, r) => {
      c.beginPath();
      c.moveTo(x, y + h);
      c.lineTo(x, y + r);
      c.arcTo(x, y, x + r, y, r);
      c.lineTo(x + w - r, y);
      c.arcTo(x + w, y, x + w, y + r, r);
      c.lineTo(x + w, y + h);
      c.closePath();
      c.fill();
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="spectrum-bars"
      style={{ width: '100%', height: `${height}px`, display: 'block' }}
      aria-hidden="true"
    />
  );
}
