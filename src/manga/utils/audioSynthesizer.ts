// @ts-nocheck
/**
 * Procedural Synthesizer for high-quality ambient BGM loops mimicking Anime themes.
 * Runs 100% on standard Web Audio API without requiring heavy MP3 assets.
 */

let audioCtx: AudioCtxType | null = null;
let bgmOscillators: OscillatorNode[] = [];
let bgmAmpGains: GainNode[] = [];
let synthIntervalId: any = null;

type AudioCtxType = AudioContext;

export function stopProcBGM() {
  if (synthIntervalId) {
    clearInterval(synthIntervalId);
    synthIntervalId = null;
  }
  bgmOscillators.forEach((osc) => {
    try {
      osc.stop();
    } catch (e) {}
  });
  bgmOscillators = [];
  bgmAmpGains.forEach((gain) => {
    try {
      gain.disconnect();
    } catch (e) {}
  });
  bgmAmpGains = [];
}

export function playProcBGM(vibeId: string) {
  stopProcBGM();

  // Lazy initialize AudioContext on user interaction
  const AudioCtxCtor = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtxCtor) return;
  if (!audioCtx) {
    audioCtx = new AudioCtxCtor();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  if (vibeId === "none") return;

  const dest = audioCtx.destination;

  // Primary Master gain limit
  const masterGain = audioCtx.createGain();
  masterGain.gain.setValueAtTime(0.08, audioCtx.currentTime); // low background vol
  masterGain.connect(dest);

  if (vibeId === "midnight-suspect") {
    // 1. Midnight Suspect - dark creepy ambient pads + periodic high spooky bells
    const noteScale = [110, 130.81, 146.83, 164.81, 196.0]; // Am/C/D/Em pentatonic minor

    // Base drone
    const drone1 = audioCtx.createOscillator();
    const droneGain = audioCtx.createGain();
    drone1.type = "sawtooth";
    drone1.frequency.setValueAtTime(55, audioCtx.currentTime); // low A1
    droneGain.gain.setValueAtTime(0.15, audioCtx.currentTime);

    // Simple filter to make drone warm
    const filter = audioCtx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(140, audioCtx.currentTime);

    drone1.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(masterGain);

    drone1.start();
    bgmOscillators.push(drone1);

    // Periodic spooky bell tones
    let step = 0;
    synthIntervalId = setInterval(() => {
      if (!audioCtx || audioCtx.state === "suspended") return;

      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      const baseNote = noteScale[step % noteScale.length] * 2;
      osc.frequency.setValueAtTime(baseNote, audioCtx.currentTime);

      gain.gain.setValueAtTime(0.0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 2.8);

      // Add a little detune ring modulator vibe
      osc.detune.setValueAtTime((Math.random() - 0.5) * 15, audioCtx.currentTime);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start();

      bgmOscillators.push(osc);

      // Cleanup finished temporary oscs to avoid memory leaks
      setTimeout(() => {
        try {
          osc.stop();
          osc.disconnect();
        } catch (e) {}
      }, 3000);

      step++;
    }, 1800);
  } else if (vibeId === "epic-hype") {
    // 2. Epic Hype - majestic war chanting chord pad + marching step beat
    const chords = [
      [146.83, 220.0, 293.66], // D minor epic power notes
      [164.81, 246.94, 329.63], // E minor power notes
      [130.81, 196.0, 261.63], // C major
      [110.0, 164.81, 220.0], // A minor
    ];

    let chordIdx = 0;
    const playChord = () => {
      if (!audioCtx) return;
      const t = audioCtx.currentTime;
      const notes = chords[chordIdx % chords.length];

      notes.forEach((freq) => {
        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, t);

        // Gentle swells
        oscGain.gain.setValueAtTime(0, t);
        oscGain.gain.linearRampToValueAtTime(0.25, t + 0.8);
        oscGain.gain.exponentialRampToValueAtTime(0.0001, t + 4.5);

        osc.connect(oscGain);
        oscGain.connect(masterGain);
        osc.start();

        bgmOscillators.push(osc);
        setTimeout(() => {
          try {
            osc.stop();
            osc.disconnect();
          } catch (e) {}
        }, 5000);
      });
      chordIdx++;
    };

    // Trigger chords
    playChord();
    synthIntervalId = setInterval(playChord, 4500);
  } else if (vibeId === "shonen-beat") {
    // 3. Shonen Beat - 120BPM retro arcade chiptune rhythm
    // Bass line arpeggiator
    const bassSeq = [110, 110, 130.81, 130.81, 146.83, 146.83, 98, 98]; // A, C, D, G
    let step = 0;

    synthIntervalId = setInterval(() => {
      if (!audioCtx || audioCtx.state === "suspended") return;
      const now = audioCtx.currentTime;

      // Bass sound
      const bassOsc = audioCtx.createOscillator();
      const bassGain = audioCtx.createGain();
      bassOsc.type = "sawtooth";
      bassOsc.frequency.setValueAtTime(bassSeq[step % bassSeq.length], now);

      // Filter bass
      const filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(250, now);

      bassGain.gain.setValueAtTime(0.9, now);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      bassOsc.connect(filter);
      filter.connect(bassGain);
      bassGain.connect(masterGain);
      bassOsc.start();

      bgmOscillators.push(bassOsc);
      setTimeout(() => {
        try {
          bassOsc.stop();
          bassOsc.disconnect();
        } catch (e) {}
      }, 500);

      // Add a clean high chiptune lead accent on step 0, 3, 5, 6
      if ([0, 3, 5, 6].includes(step % 8)) {
        const leadOsc = audioCtx.createOscillator();
        const leadGain = audioCtx.createGain();
        leadOsc.type = "square";

        // standard octave up pentatonic scale
        const leadFreqs = [440, 523.25, 587.33, 659.25, 783.99];
        const note = leadFreqs[(step * 2) % leadFreqs.length];
        leadOsc.frequency.setValueAtTime(note, now);

        leadGain.gain.setValueAtTime(0.05, now);
        leadGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        leadOsc.connect(leadGain);
        leadGain.connect(masterGain);
        leadOsc.start();

        bgmOscillators.push(leadOsc);
        setTimeout(() => {
          try {
            leadOsc.stop();
            leadOsc.disconnect();
          } catch (e) {}
        }, 300);
      }

      step++;
    }, 400); // 150 BPM approx
  }
}
