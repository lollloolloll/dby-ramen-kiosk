"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface AuroraBackgroundProps {
  colorCore: string;
  colorFringe: string;
  className?: string;
  paused?: boolean;
  /** 포인터(마우스/터치) 인터랙션. 키오스크 대기화면에선 false 권장 */
  interactive?: boolean;
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float u_time;
  uniform vec2 u_resolution;
  uniform vec2 u_mouse;
  uniform vec3 u_colorCore;
  uniform vec3 u_colorFringe;
  varying vec2 vUv;

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }
  float noise(in vec2 p) {
    const float K1 = 0.366025404;
    const float K2 = 0.211324865;
    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;
    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash(i + 0.0)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
    return dot(n, vec3(70.0));
  }

  float sdArc(vec2 p, vec2 center, float radius, float width, float warp, float seed) {
    p.y += sin(p.x * 3.0 + u_time * 0.5 + seed) * warp;
    p.x += noise(p * 2.0 + u_time * 0.2 + seed) * (warp * 0.5);
    float d = length(p - center) - radius;
    return abs(d) - width;
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / u_resolution.xy;
    float aspect = u_resolution.x / u_resolution.y;
    vec2 st = uv;
    st.x *= aspect;

    // 포인터 영향 (interactive=false면 u_mouse는 0.5 고정 → 영향 없음)
    vec2 mouseOffset = (u_mouse - 0.5) * 0.22;
    st += mouseOffset;

    // 단일 호 — 화면 가운데 근처에서 천천히 드리프트
    vec2 center = vec2(
      aspect * 0.5 + sin(u_time * 0.07) * 0.18,
      0.5 + cos(u_time * 0.11) * 0.08
    );

    float d1 = sdArc(st, center, 0.78, 0.012, 0.12, 0.0);
    float d2 = sdArc(st, center, 0.82, 0.05,  0.16, 1.7);

    float coreGlow = exp(-d1 * 40.0);
    float fringeGlow = exp(-d2 * 14.0);

    vec3 finalColor = vec3(0.0);
    finalColor += u_colorCore   * coreGlow;
    finalColor += u_colorFringe * fringeGlow;

    float alpha = clamp(coreGlow + fringeGlow, 0.0, 1.0);
    finalColor = vec3(1.0) - exp(-finalColor * 2.0);

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

export function AuroraBackground({
  colorCore,
  colorFringe,
  className,
  paused = false,
  interactive = false,
}: AuroraBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const pausedRef = useRef(paused);
  const interactiveRef = useRef(interactive);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    interactiveRef.current = interactive;
  }, [interactive]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        u_time: { value: 0 },
        u_resolution: {
          value: new THREE.Vector2(
            container.clientWidth,
            container.clientHeight
          ),
        },
        u_mouse: { value: new THREE.Vector2(0.5, 0.5) },
        u_colorCore: { value: new THREE.Color(colorCore) },
        u_colorFringe: { value: new THREE.Color(colorFringe) },
      },
      transparent: true,
      blending: THREE.NormalBlending,
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    const targetMouse = new THREE.Vector2(0.5, 0.5);
    const onPointerMove = (e: PointerEvent) => {
      if (!interactiveRef.current) return;
      targetMouse.x = e.clientX / window.innerWidth;
      targetMouse.y = 1.0 - e.clientY / window.innerHeight;
    };
    // pointermove는 마우스/터치/펜 모두 커버. 터치 드래그도 자연스럽게 따라옴
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const clock = new THREE.Clock();
    let frameId = 0;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      // paused여도 최소 한 프레임은 그려야 미리보기에서 빈 화면이 안 됨. 시간 진행만 멈춤.
      if (!pausedRef.current) {
        material.uniforms.u_time.value = clock.getElapsedTime();
        // interactive=false면 targetMouse는 (0.5, 0.5) 고정 → u_mouse도 그쪽으로 수렴 → 영향 없음
        material.uniforms.u_mouse.value.lerp(targetMouse, 0.18);
      }
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      renderer.setSize(w, h);
      material.uniforms.u_resolution.value.set(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      renderer.dispose();
      material.dispose();
      mesh.geometry.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      materialRef.current = null;
    };
  }, []);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.u_colorCore.value = new THREE.Color(colorCore);
    material.uniforms.u_colorFringe.value = new THREE.Color(colorFringe);
  }, [colorCore, colorFringe]);

  return <div ref={containerRef} className={className} aria-hidden />;
}
