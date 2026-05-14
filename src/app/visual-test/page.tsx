"use client";

import { useEffect, useState } from "react";
import { AuroraBackground } from "@/components/visuals/AuroraBackground";
import {
  ParticleWaveBackground,
  type WaveMode,
} from "@/components/visuals/ParticleWaveBackground";

type View = "aurora" | "wave" | "split";

export default function VisualTestPage() {
  const [view, setView] = useState<View>("split");
  const [colorCore, setColorCore] = useState("#5FD4A5");
  const [colorFringe, setColorFringe] = useState("#E896C0");
  const [bg, setBg] = useState("#0a0a0f");
  const [waveMode, setWaveMode] = useState<WaveMode>("wave");
  const [grid, setGrid] = useState(180);
  const [interactive, setInteractive] = useState(false);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden font-sans"
      style={{ backgroundColor: bg, color: "#eaeaea" }}
    >
      {(view === "aurora" || view === "split") && (
        <div
          className="absolute inset-0"
          style={{
            clipPath: view === "split" ? "inset(0 50% 0 0)" : undefined,
          }}
        >
          <AuroraBackground
            colorCore={colorCore}
            colorFringe={colorFringe}
            className="h-full w-full"
            interactive={interactive}
          />
        </div>
      )}

      {(view === "wave" || view === "split") && (
        <div
          className="absolute inset-0"
          style={{
            clipPath: view === "split" ? "inset(0 0 0 50%)" : undefined,
          }}
        >
          <ParticleWaveBackground
            color={colorCore}
            mode={waveMode}
            className="h-full w-full"
            gridSizeX={grid}
            gridSizeY={Math.round(grid * (2 / 3))}
          />
        </div>
      )}

      {view === "split" && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 z-10 p-4 font-mono text-xs uppercase tracking-wider text-white/70">
            ◀ Aurora (fragment)
          </div>
          <div className="pointer-events-none absolute right-0 top-0 z-10 p-4 font-mono text-xs uppercase tracking-wider text-white/70">
            Wave (vertex) ▶
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px bg-white/10" />
        </>
      )}

      {/* Control panel */}
      <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col gap-3 rounded-2xl border border-white/10 bg-black/60 p-4 text-xs backdrop-blur-md">
        <div className="flex gap-1">
          {(["split", "aurora", "wave"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 ${
                view === v
                  ? "bg-white text-black"
                  : "border border-white/20 text-white/80"
              }`}
            >
              {v}
            </button>
          ))}
          <button
            onClick={() => setInteractive((v) => !v)}
            className={`ml-3 rounded-full px-3 py-1 ${
              interactive
                ? "bg-white text-black"
                : "border border-white/20 text-white/80"
            }`}
          >
            interactive: {interactive ? "on" : "off"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label className="w-16 opacity-60">core</label>
          <input
            type="color"
            value={colorCore}
            onChange={(e) => setColorCore(e.target.value)}
            className="h-7 w-7 rounded"
          />
          <input
            value={colorCore}
            onChange={(e) => setColorCore(e.target.value)}
            className="w-20 rounded bg-white/5 px-2 py-1 font-mono"
          />
          <label className="ml-3 w-16 opacity-60">fringe</label>
          <input
            type="color"
            value={colorFringe}
            onChange={(e) => setColorFringe(e.target.value)}
            className="h-7 w-7 rounded"
          />
          <input
            value={colorFringe}
            onChange={(e) => setColorFringe(e.target.value)}
            className="w-20 rounded bg-white/5 px-2 py-1 font-mono"
          />
          <label className="ml-3 w-16 opacity-60">bg</label>
          <input
            type="color"
            value={bg}
            onChange={(e) => setBg(e.target.value)}
            className="h-7 w-7 rounded"
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="w-16 opacity-60">wave</label>
          {(
            [
              "wave",
              "pulse",
              "spiral",
              "noise",
              "interference",
            ] as WaveMode[]
          ).map((m) => (
            <button
              key={m}
              onClick={() => setWaveMode(m)}
              className={`rounded-full px-2 py-0.5 text-[10px] ${
                waveMode === m
                  ? "bg-white text-black"
                  : "border border-white/20 text-white/80"
              }`}
            >
              {m}
            </button>
          ))}
          <label className="ml-3 w-12 opacity-60">grid</label>
          <input
            type="range"
            min={60}
            max={240}
            step={10}
            value={grid}
            onChange={(e) => setGrid(Number(e.target.value))}
            className="w-32"
          />
          <span className="w-10 font-mono opacity-60">{grid}×{Math.round(grid * (2 / 3))}</span>
        </div>

        <FpsMeter />
      </div>
    </div>
  );
}

function FpsMeter() {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let mounted = true;
    let frames = 0;
    let prev = performance.now();
    let frameId = 0;
    const tick = () => {
      if (!mounted) return;
      frames++;
      const now = performance.now();
      if (now - prev >= 500) {
        setFps(Math.round((frames * 1000) / (now - prev)));
        frames = 0;
        prev = now;
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(frameId);
    };
  }, []);

  return (
    <div className="font-mono text-[10px] opacity-70">
      FPS: <span className={fps < 45 ? "text-red-400" : "text-green-400"}>{fps}</span>{" "}
      {fps < 45 ? "← 키오스크 부적합" : "OK"}
    </div>
  );
}
