// @ts-nocheck
import { SubtitlePreset, BGMTrack } from "../types";

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: "anime-yellow",
    name: "Anime Yellow",
    fontSize: 28,
    textColor: "#ffdf00",
    outlineColor: "#000000",
    glow: true,
    glowColor: "rgba(0,0,0,0.85)",
    fontFamily: "'Impact', 'Arial Black', sans-serif",
    uppercase: true,
  },
  {
    id: "epic-modern",
    name: "Epic Bold White",
    fontSize: 30,
    textColor: "#ffffff",
    outlineColor: "#ff0000",
    glow: true,
    glowColor: "rgba(255,0,0,0.4)",
    fontFamily: "'Impact', 'Arial Black', sans-serif",
    uppercase: true,
  },
  {
    id: "horror-gloom",
    name: "Dark Mystique (Red Glow)",
    fontSize: 26,
    textColor: "#ff003c",
    outlineColor: "#000000",
    glow: true,
    glowColor: "rgba(255, 0, 0, 0.9)",
    fontFamily: "'Courier New', Courier, monospace",
    uppercase: false,
  },
  {
    id: "manga-sketch",
    name: "Minimalist Manga Code",
    fontSize: 24,
    textColor: "#ffffff",
    outlineColor: "#000000",
    glow: false,
    glowColor: "rgba(0,0,0,0)",
    fontFamily: "'Courier New', 'Georgia', serif",
    uppercase: false,
  },
];

export const PRESET_BGM_TRACKS: BGMTrack[] = [
  {
    id: "none",
    name: "🔇 Tanpa Background Music (BGM)",
    vibe: "Suara asli saja",
    frequency: 0,
    type: "sine",
    volume: 0,
    tempo: 0,
  },
  {
    id: "midnight-suspect",
    name: "🕵️‍♂️ Midnight Suspect (Mystery Pads)",
    vibe: "Suasana tenang, teka-teki, misteri manga seinen",
    frequency: 220,
    type: "sine",
    volume: 0.15,
    tempo: 120,
  },
  {
    id: "epic-hype",
    name: "🔥 Epic Hype (War Chants Chord Sim)",
    vibe: "Cocok untuk momen pertarungan manga shonen",
    frequency: 440,
    type: "sawtooth",
    volume: 0.1,
    tempo: 100,
  },
  {
    id: "shonen-beat",
    name: "⛩️ Retro Shonen Beat (Arpeggio Rhythm)",
    vibe: "Tempo cepat, petualangan berlatar ninja/samurai",
    frequency: 330,
    type: "square",
    volume: 0.08,
    tempo: 140,
  },
];

export const EXAMPLE_SCRIPTS = [
  {
    title: "⚔️ Kebangkitan Sang Pendekar Legendaris (Full Shonen)",
    text: "Manga Chapter 102!\n\nRahasia pedang hitam akhirnya terkuak saat Kael membuka segel segel kuno penahan dewa kematian.\n\nCahaya merah menyala menembus langit malam!\n\nDengan satu ayunan cepat, seluruh pasukan kegelapan langsung hancur menjadi debu!\n\nKael melangkah tegap, menatap musuh terakhirnya di medan pertempuran.",
  },
  {
    title: "📜 Kutukan Buku Segel Hitam (Seinen Horror/Suspense)",
    text: "Semua orang mengira ritual itu telah gagal, sampai lambang kuno di kuil timur menyala keemasan.\n\nDetak jantung Ren semakin pelan, namun kekuatan yang ia pinjam dari monster jurang justru meluap tiada henti!\n\nSuara bisikan gaib terdengar di kepalanya: 'Berikan jiwamu, atau hancurkan dunia ini!'",
  },
];
