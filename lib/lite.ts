/**
 * Lite mode (per device): html[data-lite] drops the effects that cost the
 * graphics chip every frame: the drifting aurora, background blur behind
 * glass, the spinning beam, looping decorations (index.css, "Lite mode").
 *
 * Stored as 'on' / 'off'. Unset, the page measures its own frame rate a few
 * seconds after loading and switches it on if the device can't keep up;
 * turning it off by hand stops that for good.
 */

const KEY = 'portail:lite';
export const LITE_EVENT = 'portail:lite';

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export const liteEnabled = () => read() === 'on';

export function applyLite() {
  if (liteEnabled()) document.documentElement.dataset.lite = '';
  else delete document.documentElement.dataset.lite;
}

export function setLite(value: boolean) {
  try {
    window.localStorage.setItem(KEY, value ? 'on' : 'off');
  } catch {
    // This page load only.
  }
  if (value) document.documentElement.dataset.lite = '';
  else delete document.documentElement.dataset.lite;
  window.dispatchEvent(new Event(LITE_EVENT));
}

/**
 * Once per device while unset: 2 s of frames, 3 s after load. Under ~45 fps
 * on average it switches lite mode on and calls `onAuto`.
 */
export function probeLite(onAuto: () => void): () => void {
  if (read() !== null) return () => undefined;
  let frame = 0;
  let start = 0;
  let count = 0;
  const step = (now: number) => {
    if (document.hidden) return; // a background tab runs no frames: try again next load
    if (!start) start = now;
    count += 1;
    if (now - start < 2000) {
      frame = requestAnimationFrame(step);
      return;
    }
    const fps = ((count - 1) * 1000) / (now - start);
    if (fps < 45) {
      setLite(true);
      onAuto();
    }
  };
  const wait = window.setTimeout(() => (frame = requestAnimationFrame(step)), 3000);
  return () => {
    window.clearTimeout(wait);
    cancelAnimationFrame(frame);
  };
}
