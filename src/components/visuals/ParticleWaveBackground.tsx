"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export type WaveMode = "wave" | "pulse" | "spiral" | "noise" | "interference";

const MODE_INDEX: Record<WaveMode, number> = {
  wave: 1,
  pulse: 2,
  spiral: 3,
  noise: 4,
  interference: 5,
};

interface ParticleWaveBackgroundProps {
  color: string;
  mode?: WaveMode;
  className?: string;
  paused?: boolean;
  /** 그리드 한 변 크기. 키오스크 성능 보면서 조절. 기본 (180×120) = 21,600 points */
  gridSizeX?: number;
  gridSizeY?: number;
}

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMode;
  attribute vec3 basePosition;
  varying float vZ;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    vec3 pos = basePosition;
    float t = uTime * 1.5;

    if (uMode == 1.0) {
      pos.z = sin(pos.x * 0.1 + t) * 6.0 + cos(pos.y * 0.1 + t) * 4.0;
    } else if (uMode == 2.0) {
      float dist = length(pos.xy);
      pos.z = sin(dist * 0.2 - t * 2.0) * 8.0;
    } else if (uMode == 3.0) {
      float angle = atan(pos.y, pos.x);
      float dist = length(pos.xy);
      pos.z = sin(angle * 4.0 + dist * 0.2 - t * 2.0) * 6.0;
    } else if (uMode == 4.0) {
      float n = random(pos.xy + t * 0.1);
      pos.z = n * 10.0 - 5.0;
    } else if (uMode == 5.0) {
      float w1 = sin(pos.x * 0.15 + t);
      float w2 = sin(pos.y * 0.15 - t * 0.5);
      float w3 = sin((pos.x + pos.y) * 0.1 + t);
      pos.z = (w1 * w2 + w3) * 5.0;
    }

    vZ = pos.z;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 2.5 * (100.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  varying float vZ;

  void main() {
    vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
    if (dot(circCoord, circCoord) > 1.0) discard;

    float depthOpacity = smoothstep(-10.0, 10.0, vZ);
    float finalOpacity = 0.1 + depthOpacity * 0.6;
    gl_FragColor = vec4(uColor, finalOpacity);
  }
`;

export function ParticleWaveBackground({
  color,
  mode = "wave",
  className,
  paused = false,
  gridSizeX = 180,
  gridSizeY = 120,
}: ParticleWaveBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    camera.position.set(20, 0, 80);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const spacing = 1.2;
    const count = gridSizeX * gridSizeY;
    const positions = new Float32Array(count * 3);
    const basePositions = new Float32Array(count * 3);
    let i = 0;
    for (let ix = 0; ix < gridSizeX; ix++) {
      for (let iy = 0; iy < gridSizeY; iy++) {
        const x = (ix - gridSizeX / 2) * spacing;
        const y = (iy - gridSizeY / 2) * spacing;
        positions[i] = x;
        positions[i + 1] = y;
        positions[i + 2] = 0;
        basePositions[i] = x;
        basePositions[i + 1] = y;
        basePositions[i + 2] = 0;
        i += 3;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute(
      "basePosition",
      new THREE.BufferAttribute(basePositions, 3)
    );

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uMode: { value: MODE_INDEX[mode] },
        uColor: { value: new THREE.Color(color) },
      },
      transparent: true,
      depthWrite: false,
    });
    materialRef.current = material;

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    const clock = new THREE.Clock();
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      if (pausedRef.current) return;
      const t = clock.getElapsedTime();
      material.uniforms.uTime.value = t;
      camera.position.x = 20 + Math.sin(t * 0.2) * 5;
      camera.position.y = Math.cos(t * 0.15) * 5;
      camera.lookAt(20, 0, 0);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const ww = container.clientWidth;
      const hh = container.clientHeight;
      camera.aspect = ww / hh;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      materialRef.current = null;
    };
  }, [gridSizeX, gridSizeY]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    m.uniforms.uColor.value = new THREE.Color(color);
  }, [color]);

  useEffect(() => {
    const m = materialRef.current;
    if (!m) return;
    m.uniforms.uMode.value = MODE_INDEX[mode];
  }, [mode]);

  return <div ref={containerRef} className={className} aria-hidden />;
}
