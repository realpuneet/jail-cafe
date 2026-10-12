let ctx = null;

/** Create/resume the AudioContext. Must be called from a user gesture the first time. */
export function unlockAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx ??= new AC();
  if (ctx.state === 'suspended') ctx.resume();
  return true;
}

/** A short two-tone "ding-dong" generated with Web Audio (no audio file to ship or cache). */
export function playAlert() {
  if (!ctx || ctx.state !== 'running') return false;
  const now = ctx.currentTime;
  [
    [880, 0],
    [660, 0.22],
  ].forEach(([freq, offset]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.35, now + offset + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.45);
  });
  return true;
}
