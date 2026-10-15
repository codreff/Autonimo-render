// @ts-nocheck
import { MangaPanel } from "../types";

export interface SyncResult {
  updatedPanels: { id: string; duration: number }[];
  totalAudioDuration: number;
  detectedPausesCount: number;
}

/**
 * Fast & Accurate Audio-Script Auto-Sync Engine
 * Runs 100% in browser with Web Audio API. Zero API Key required.
 */
export async function autoSyncPanelsToAudio(
  audioUrl: string,
  panels: MangaPanel[],
  rawScriptText?: string,
): Promise<SyncResult> {
  if (panels.length === 0) {
    throw new Error("Tidak ada panel manga untuk disinkronkan.");
  }
  if (!audioUrl) {
    throw new Error("File audio narasi belum diunggah.");
  }

  // 1. Fetch & decode audio file
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const actx = new AudioCtx();
  const resp = await fetch(audioUrl);
  const arrayBuf = await resp.arrayBuffer();
  const audioBuf = await actx.decodeAudioData(arrayBuf);
  const totalAudioSeconds = audioBuf.duration;
  try {
    actx.close();
  } catch (e) {}

  if (totalAudioSeconds <= 0) {
    throw new Error("Gagal membaca durasi file audio.");
  }

  // 2. Extract speech energy profile (RMS per 40ms)
  const pcm = audioBuf.getChannelData(0);
  const sampleRate = audioBuf.sampleRate;
  const windowSize = Math.floor(sampleRate * 0.04); // 40ms window
  const numWindows = Math.floor(pcm.length / windowSize);
  const energies = new Float32Array(numWindows);

  for (let i = 0; i < numWindows; i++) {
    let sum = 0;
    const start = i * windowSize;
    for (let j = 0; j < windowSize; j++) {
      const s = pcm[start + j] || 0;
      sum += s * s;
    }
    energies[i] = Math.sqrt(sum / windowSize);
  }

  // Find dynamic silence threshold
  let maxEnergy = 0.001;
  for (let i = 0; i < energies.length; i++) {
    if (energies[i] > maxEnergy) maxEnergy = energies[i];
  }
  const silenceThreshold = maxEnergy * 0.1;

  // Detect silence pause timestamps (valley > 80ms)
  const silenceTimestamps: number[] = [];
  let inSilence = false;
  let silenceStartTime = 0;

  for (let i = 0; i < energies.length; i++) {
    const t = i * 0.04;
    if (energies[i] < silenceThreshold) {
      if (!inSilence) {
        inSilence = true;
        silenceStartTime = t;
      }
    } else {
      if (inSilence) {
        const dur = t - silenceStartTime;
        if (dur >= 0.08) {
          // Midpoint of silence
          silenceTimestamps.push(silenceStartTime + dur * 0.5);
        }
        inSilence = false;
      }
    }
  }

  // 3. Calculate text-based syllable/word weight per panel
  // If user provided a raw script or panels have subtitles
  let scriptSnippets: string[] = [];
  if (rawScriptText && rawScriptText.trim()) {
    // Split full script by newlines or sentence endings
    const lines = rawScriptText
      .split(/\n+|(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length >= panels.length) {
      scriptSnippets = lines.slice(0, panels.length);
    }
  }

  const weights: number[] = panels.map((p, idx) => {
    const text = (scriptSnippets[idx] || p.subtitle || "").trim();
    if (!text) return 1.0;
    const words = text.split(/\s+/).filter(Boolean).length;
    const vowels = (text.match(/[aiueoAIUEO]/g) || []).length;
    return Math.max(0.8, words * 0.4 + vowels * 0.6);
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0) || panels.length;

  // 4. Calculate split timestamps & snap to silence boundaries
  const panelDurations: number[] = [];
  let prevTimestamp = 0;

  if (panels.length === 1) {
    panelDurations.push(parseFloat(totalAudioSeconds.toFixed(2)));
  } else {
    let accumulatedIdeal = 0;

    for (let i = 0; i < panels.length - 1; i++) {
      const idealDuration = (weights[i] / totalWeight) * totalAudioSeconds;
      accumulatedIdeal += idealDuration;

      // Find nearest silence timestamp within reasonable radius (+- 1.2s)
      let bestSilence = accumulatedIdeal;
      let minDiff = Infinity;

      for (const sTime of silenceTimestamps) {
        if (sTime > prevTimestamp + 0.5 && sTime < totalAudioSeconds - 0.5) {
          const diff = Math.abs(sTime - accumulatedIdeal);
          if (diff < minDiff && diff < 1.2) {
            minDiff = diff;
            bestSilence = sTime;
          }
        }
      }

      const assignedDuration = Math.max(0.5, parseFloat((bestSilence - prevTimestamp).toFixed(2)));
      panelDurations.push(assignedDuration);
      prevTimestamp += assignedDuration;
    }

    // Last panel takes remaining audio duration to guarantee exact 100% sync!
    const remainingTime = Math.max(0.5, parseFloat((totalAudioSeconds - prevTimestamp).toFixed(2)));
    panelDurations.push(remainingTime);
  }

  const updatedPanels = panels.map((p, idx) => ({
    id: p.id,
    duration: panelDurations[idx] || 4,
  }));

  return {
    updatedPanels,
    totalAudioDuration: totalAudioSeconds,
    detectedPausesCount: silenceTimestamps.length,
  };
}
