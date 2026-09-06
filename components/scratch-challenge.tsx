'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';

type MazeSnapshot = {
  row: number;
  col: number;
  direction: 0 | 1 | 2 | 3;
  hasKey: boolean;
  completed: boolean;
  error: string;
};

type ElevatorSnapshot = {
  floor: number;
  doorsOpen: boolean;
  target: number | null;
  calls: number[];
  destinations: number[];
  served: number[];
  motion: 'idle' | 'up' | 'down';
  error: string;
};

type PanelSnapshot =
  | { mode: 'maze'; state: MazeSnapshot }
  | { mode: 'elevator'; state: ElevatorSnapshot };

type PanelControls = {
  ready: boolean;
  call: (floor: number) => void;
  destination: (floor: number) => void;
};

export type ScratchPanelProps = {
  snapshot: PanelSnapshot | null;
  controls: PanelControls;
};

export function ScratchChallenge({
  mode,
  onComplete,
  panel: Panel,
}: {
  mode: 'maze' | 'elevator';
  onComplete?: () => void;
  panel: ComponentType<ScratchPanelProps>;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [snapshot, setSnapshot] = useState<PanelSnapshot | null>(null);
  const [ready, setReady] = useState(false);

  const send = (type: 'sync' | 'call' | 'destination', floor?: number) => {
    frame.current?.contentWindow?.postMessage(
      { source: 'stalk-site', type, mode, floor },
      location.origin,
    );
  };

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const message = event.data;
      if (message?.source !== 'stalk-scratch' || message.mode !== mode) return;
      if (message.type === 'state' && message.state) {
        setSnapshot({ mode, state: message.state } as PanelSnapshot);
        setReady(Boolean(message.ready));
      }
      if (message.type === 'ready') setReady(true);
      if (message.type === 'error') setReady(false);
      if (message.type === 'complete') onComplete?.();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [mode, onComplete]);

  return (
    <div className="scratch-layout">
      {/* oxlint-disable-next-line next/no-css-tags -- shared with the standalone Scratch host */}
      <link rel="stylesheet" href="./scratch/embed.css" precedence="default" />
      <section className="terminal-panel scratch-panel">
        <div className="scratch-heading">
          <h2>
            {mode === 'maze'
              ? 'Construisez le trajet'
              : 'Programmez l’ascenseur'}
          </h2>
          {mode === 'maze' && (
            <p>
              Construisez le programme de haut en bas. Utilisez une boucle pour
              compresser les répétitions et un bloc SI pour réagir à la carte.
            </p>
          )}
        </div>
        <iframe
          ref={frame}
          className="scratch-challenge-frame"
          src={`./scratch/runtime.html?mode=${mode}&embedded=1`}
          title={
            mode === 'maze' ? 'Scratch — Labyrinthe' : 'Scratch — Ascenseur'
          }
          onLoad={() => send('sync')}
          allow="autoplay; fullscreen"
          allowFullScreen
        />
        {snapshot?.state.error && (
          <output className="run-feedback feedback-error scratch-feedback">
            {snapshot.state.error}
          </output>
        )}
      </section>
      <div className="scratch-side-panel">
        <Panel
          snapshot={snapshot}
          controls={{
            ready,
            call: (floor) => send('call', floor),
            destination: (floor) => send('destination', floor),
          }}
        />
      </div>
    </div>
  );
}
