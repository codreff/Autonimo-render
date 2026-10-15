// @ts-nocheck
/** Backsound (BGM) helpers: looped under the voiceover, max 25% volume, fade-out at the end. */
export const BACKSOUND_MAX_VOLUME = 0.25;
export const BACKSOUND_FADE_SECONDS = 4;

/** Gain multiplier (0..1) for fade-out near the end of the backsound span. */
export function fadeGainAt(t: number, endTime: number, fade = BACKSOUND_FADE_SECONDS): number {
  if (endTime <= 0) return 0;
  const f = Math.min(fade, endTime / 2);
  if (t >= endTime) return 0;
  if (t <= endTime - f) return 1;
  return Math.max(0, (endTime - t) / f);
}

/**
 * Mix narration + looped backsound into one AudioBuffer.
 * Backsound length follows the voiceover (or `fallbackDuration` if no voiceover),
 * loops from the start when shorter, and fades out over the last seconds.
 */
export async function mixWithBacksound(
  narration: AudioBuffer | null,
  backsoundUrl: string,
  volume: number,
  fallbackDuration: number,
  maxDuration: number,
): Promise<AudioBuffer | null> {
  const sampleRate = narration?.sampleRate || 48000;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  let actx: AudioContext;
  try {
    actx = new AudioCtx({ sampleRate });
  } catch {
    actx = new AudioCtx();
  }
  const resp = await fetch(backsoundUrl);
  const bgm = await actx.decodeAudioData(await resp.arrayBuffer());
  try {
    actx.close();
  } catch {}

  const sr = bgm.sampleRate === sampleRate ? sampleRate : bgm.sampleRate;
  const spanSec = Math.min(maxDuration, narration ? narration.duration : fallbackDuration);
  const length = Math.max(1, Math.floor(spanSec * sr));
  const ch = Math.max(narration?.numberOfChannels || 0, bgm.numberOfChannels, 1) > 1 ? 2 : 1;
  const vol = Math.min(BACKSOUND_MAX_VOLUME, Math.max(0, volume));

  const out = new AudioBuffer({ numberOfChannels: ch, length, sampleRate: sr });
  for (let c = 0; c < ch; c++) {
    const dst = out.getChannelData(c);
    const b = bgm.getChannelData(Math.min(c, bgm.numberOfChannels - 1));
    const bl = b.length;
    if (narration && narration.sampleRate === sr) {
      const n = narration.getChannelData(Math.min(c, narration.numberOfChannels - 1));
      dst.set(n.subarray(0, Math.min(n.length, length)));
    }
    for (let i = 0; i < length; i++) {
      const g = vol * fadeGainAt(i / sr, spanSec);
      const v = dst[i] + b[i % bl] * g;
      dst[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
  }
  return out;
}
