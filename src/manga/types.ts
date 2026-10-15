// @ts-nocheck
export type MotionType =
  | "pan-left-to-right"
  | "pan-right-to-left"
  | "pan-top-to-bottom"
  | "pan-bottom-to-top"
  | "shaky-action"
  | "seperempat-text-sync"
  | "manga-multi-focus"
  | "65-pan-top-to-bottom"
  | "65-pan-bottom-to-top"
  | "65-random"
  | "100-pan-top-to-bottom"
  | "100-diagonal-right-to-left"
  | "100-pan-bottom-to-top"
  | "random-50-100"
  | "random-45-75"
  | "100-manga-flow";

export type EasingType = "linear" | "ease-in-out" | "smooth";

export type TransitionType = "crossfade" | "slide-left" | "slide-right" | "zoom-fade" | "none";

export interface MangaPanel {
  id: string;
  name: string;
  url: string; // Object URL or Data URL
  duration: number; // in seconds
  motionType: MotionType;
  subtitle: string;
  focusGuide?: string;
  motionSpeed?: number; // 0.1 to 3.0 scale multiplier
  easing?: EasingType;
  transitionType?: TransitionType;
}

export interface BGMTrack {
  id: string;
  name: string;
  vibe: string;
  frequency: number;
  type: OscillatorType;
  volume: number;
  tempo: number;
}

export interface SubtitlePreset {
  id: string;
  name: string;
  fontSize: number;
  textColor: string;
  outlineColor: string;
  fontFamily: string;
  uppercase: boolean;
  glow: boolean;
  glowColor: string;
}

export interface GeneratedSceneSuggestion {
  panelIndex: number;
  subtitle: string;
  motionStyle: MotionType;
  duration: number;
  focusGuide: string;
}
