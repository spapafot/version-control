/** WebAudio-synthesized 8-bit bleeps - no audio assets. */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function note(
  ac: AudioContext,
  freq: number,
  start: number,
  duration: number,
  gain = 0.045,
  type: OscillatorType = "square",
): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ac.currentTime + start);
  g.gain.exponentialRampToValueAtTime(
    0.0001,
    ac.currentTime + start + duration,
  );
  osc.connect(g).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.02);
}

export function playSuccess(): void {
  const ac = audio();
  if (!ac) return;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
    note(ac, f, i * 0.09, 0.14),
  );
}

export function playAchievement(): void {
  const ac = audio();
  if (!ac) return;
  [523.25, 523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5].forEach((f, i) =>
    note(ac, f, i * 0.11, 0.16),
  );
}

export function playError(): void {
  const ac = audio();
  if (!ac) return;
  note(ac, 196, 0, 0.12, 0.04, "sawtooth");
  note(ac, 147, 0.1, 0.16, 0.04, "sawtooth");
}
