'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three'; // pin: npm i three@0.128.0
import { createHealthAvatar } from './health-avatar-core';

export type AvatarState =
  | 'ready' | 'listening' | 'thinking' | 'empathy' | 'caution' | 'emergency'
  | 'greeting' | 'success' | 'confused' | 'reminder' | 'breathing' | 'offline';

type Props = {
  state?: AvatarState;
  speaking?: boolean;
  /** optional 0..1 mouth level (e.g. from an AnalyserNode); random lip-sync when omitted */
  level?: number;
  size?: number | string;
  label?: string;
  className?: string;
};

export default function HealthAvatar({
  state = 'ready', speaking = false, level, size = 160,
  label, className,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const api = useRef<ReturnType<typeof createHealthAvatar> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    api.current = createHealthAvatar(THREE, ref.current);
    return () => { api.current?.dispose(); api.current = null; };
  }, []);
  useEffect(() => { api.current?.setState(state); }, [state]);
  useEffect(() => { api.current?.setSpeaking(speaking); }, [speaking]);
  useEffect(() => { if (level !== undefined) api.current?.setLevel(level); }, [level]);

  const sizeStyle =
    typeof size === 'number' ? `${size}px` : size;

  return (
    <figure className={className} style={{ margin: 0, textAlign: 'center' }}>
      <canvas ref={ref} role="img" aria-label={`آواتار دستیار سلامت، وضعیت: ${state}`}
        style={{ width: sizeStyle, height: sizeStyle, display: 'block', marginInline: 'auto', touchAction: 'none' }} />
      {label ? <figcaption style={{ fontSize: 12, opacity: 0.75 }}>{label}</figcaption> : null}
    </figure>
  );
}
