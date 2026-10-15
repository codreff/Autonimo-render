// @ts-nocheck
import React, { useRef, useEffect, useState, useMemo } from "react";
import { MangaPanel } from "../types";
import {
  Film,
  Save,
  Download,
  Play,
  Pause,
  RefreshCw,
  Volume2,
  Sparkles,
  Smartphone,
  Monitor,
  Maximize,
  Minimize,
  Zap,
  Undo,
  CheckCircle,
  Video,
} from "lucide-react";
import { fadeGainAt, BACKSOUND_MAX_VOLUME } from "../utils/backsound";
import { exportVideoOffline, CompressionPreset, normalizePreset } from "../utils/videoExportEngine";
import paperBackgroundUrl from "@/assets/crumpled-paper.jpg";
import { Button } from "@/components/ui/button";
import {
  BACKGROUND_CHOICES,
  BackgroundStyle,
  normalizeBackground,
  createImageLoader,
  drawCover,
  drawAnimatedPaperBackdrop,
  normalizePaperMotion,
  PaperMotionConfig,
  PAPER_MOTION_STYLES,
  PAPER_LOOP_FRAME_URLS,
} from "../utils/backgrounds";
import { createPanelShadowCache } from "../utils/panelShadow";

interface CanvasRendererProps {
  panels: MangaPanel[];
  narrationAudioUrl: string | null;
  backsoundUrl?: string | null;
  backsoundVolume?: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTime: number;
  onUpdateTime: (time: number) => void;
  activePanelIndexOverride?: number;

  // Smart Tapping Lifted properties
  isSyncing?: boolean;
  tapsCompleted?: boolean;
  lastTapTime?: number;
  tapHistory?: { lastTapTime: number; syncIndex: number }[];
  isTappingMode?: boolean;
  currentSyncIndex?: number | null;
  onStartSyncSession?: () => void;
  onCancelSyncSession?: () => void;
  onHandleTap?: () => void;
  onHandleUndo?: () => void;
  onSetTapsCompleted?: (val: boolean) => void;

  activeTab?: "auto-sync" | "standard" | "cubit" | "ketukan";

  verticalConfig: any;
  setVerticalConfig: (cfg: any) => void;
  horizontalConfig: any;
  setHorizontalConfig: (cfg: any) => void;
  squareConfig: any;
  setSquareConfig: (cfg: any) => void;
}

// Helper function to dynamically detect focal areas (speech bubbles or action hotspots) in manga panels using pixel contrast analysis
function analyzeMangaPanel(img: HTMLImageElement): { x: number; y: number }[] {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 60;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return [
        { x: 0.15, y: -0.15 },
        { x: 0.0, y: 0.0 },
        { x: -0.15, y: 0.15 },
      ];
    }
    ctx.drawImage(img, 0, 0, 60, 60);
    const imgData = ctx.getImageData(0, 0, 60, 60);
    const data = imgData.data;

    const gridSize = 6;
    const blockSize = 10;
    const blocks: { x: number; y: number; brightness: number; contrast: number; score: number }[] =
      [];

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let totalBrightness = 0;
        let minPixel = 255;
        let maxPixel = 0;
        let count = 0;

        for (let py = 0; py < blockSize; py++) {
          for (let px = 0; px < blockSize; px++) {
            const ix = gx * blockSize + px;
            const iy = gy * blockSize + py;
            const idx = (iy * 60 + ix) * 4;
            if (idx >= data.length) continue;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const brightness = (r + g + b) / 3;

            totalBrightness += brightness;
            if (brightness < minPixel) minPixel = brightness;
            if (brightness > maxPixel) maxPixel = brightness;
            count++;
          }
        }

        const avgBrightness = totalBrightness / (count || 1);
        const contrast = maxPixel - minPixel;
        const relX = (gx + 0.5) / gridSize - 0.5; // -0.5 to 0.5 coordinate
        const relY = (gy + 0.5) / gridSize - 0.5; // -0.5 to 0.5 coordinate

        // High contrast blocks represent key details, bright blocks represent text bubbles
        const score = contrast * 1.5 + (255 - avgBrightness) * 0.3;

        blocks.push({
          x: relX,
          y: relY,
          brightness: avgBrightness,
          contrast: contrast,
          score: score,
        });
      }
    }

    // Manga panels are scanned from Top-Right (Panel 1) -> Center -> Bottom-Left (Panel 2)
    const topRightBlocks = blocks
      .filter((b) => b.x >= -0.15 && b.y <= 0.15)
      .sort((a, b) => b.score - a.score);
    const middleBlocks = blocks
      .filter((b) => Math.abs(b.x) <= 0.25 && Math.abs(b.y) <= 0.25)
      .sort((a, b) => b.score - a.score);
    const bottomLeftBlocks = blocks
      .filter((b) => b.x <= 0.15 && b.y >= -0.15)
      .sort((a, b) => b.score - a.score);

    const h1 = topRightBlocks[0] || { x: 0.15, y: -0.15 };
    const h2 = middleBlocks[0] || { x: 0.0, y: 0.0 };
    const h3 = bottomLeftBlocks[0] || { x: -0.15, y: 0.15 };

    return [
      { x: h1.x, y: h1.y },
      { x: h2.x, y: h2.y },
      { x: h3.x, y: h3.y },
    ];
  } catch (err) {
    console.warn("Manga analysis failed, utilizing robust default path:", err);
    return [
      { x: 0.18, y: -0.18 },
      { x: 0.0, y: 0.0 },
      { x: -0.18, y: 0.18 },
    ];
  }
}

function analyzeMangaFlow95(img: HTMLImageElement): { x: number; y: number }[] {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 60;
    canvas.height = 60;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return [
        { x: 0.2, y: -0.2 },
        { x: -0.2, y: -0.2 },
        { x: 0.2, y: 0.2 },
        { x: -0.2, y: 0.2 },
      ];
    }
    ctx.drawImage(img, 0, 0, 60, 60);
    const imgData = ctx.getImageData(0, 0, 60, 60);
    const data = imgData.data;

    const gridSize = 6;
    const blockSize = 10;
    const blocks: { x: number; y: number; brightness: number; contrast: number; score: number }[] =
      [];

    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        let totalBrightness = 0;
        let minPixel = 255;
        let maxPixel = 0;
        let count = 0;

        for (let py = 0; py < blockSize; py++) {
          for (let px = 0; px < blockSize; px++) {
            const ix = gx * blockSize + px;
            const iy = gy * blockSize + py;
            const idx = (iy * 60 + ix) * 4;
            if (idx >= data.length) continue;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const brightness = (r + g + b) / 3;

            totalBrightness += brightness;
            if (brightness < minPixel) minPixel = brightness;
            if (brightness > maxPixel) maxPixel = brightness;
            count++;
          }
        }

        const avgBrightness = totalBrightness / (count || 1);
        const contrast = maxPixel - minPixel;
        const relX = (gx + 0.5) / gridSize - 0.5;
        const relY = (gy + 0.5) / gridSize - 0.5;

        const score = contrast * 1.5 + (255 - avgBrightness) * 0.4;

        blocks.push({
          x: relX,
          y: relY,
          brightness: avgBrightness,
          contrast: contrast,
          score: score,
        });
      }
    }

    const tr = blocks
      .filter((b) => b.x >= -0.1 && b.y <= 0.1)
      .sort((a, b) => b.score - a.score)[0] || { x: 0.2, y: -0.2 };
    const tl = blocks
      .filter((b) => b.x <= 0.1 && b.y <= 0.1)
      .sort((a, b) => b.score - a.score)[0] || { x: -0.2, y: -0.2 };
    const br = blocks
      .filter((b) => b.x >= -0.1 && b.y >= -0.1)
      .sort((a, b) => b.score - a.score)[0] || { x: 0.2, y: 0.2 };
    const bl = blocks
      .filter((b) => b.x <= 0.1 && b.y >= -0.1)
      .sort((a, b) => b.score - a.score)[0] || { x: -0.2, y: 0.2 };

    return [
      { x: tr.x, y: tr.y },
      { x: tl.x, y: tl.y },
      { x: br.x, y: br.y },
      { x: bl.x, y: bl.y },
    ];
  } catch (err) {
    return [
      { x: 0.2, y: -0.2 },
      { x: -0.2, y: -0.2 },
      { x: 0.2, y: 0.2 },
      { x: -0.2, y: 0.2 },
    ];
  }
}

export const CanvasRenderer: React.FC<CanvasRendererProps> = ({
  panels,
  narrationAudioUrl,
  backsoundUrl = null,
  backsoundVolume = 0.2,
  isPlaying,
  onTogglePlay,
  currentTime,
  onUpdateTime,
  activePanelIndexOverride,
  isSyncing = false,
  tapsCompleted = false,
  lastTapTime = 0,
  tapHistory = [],
  isTappingMode = false,
  currentSyncIndex = null,
  onStartSyncSession,
  onCancelSyncSession,
  onHandleTap,
  onHandleUndo,
  onSetTapsCompleted,
  activeTab = "standard",
  verticalConfig,
  setVerticalConfig,
  horizontalConfig,
  setHorizontalConfig,
  squareConfig,
  setSquareConfig,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const exportAnimFrameRef = useRef<number | null>(null);
  const isExportCancelledRef = useRef<boolean>(false);

  // Locked full screen state to blow up canvas player width (Theatre Mode style)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Persisted video backdrop; legacy navy/gray selections migrate to paper/cream.
  const [bgStyle, setBgStyle] = useState<BackgroundStyle>(() => {
    const saved = localStorage.getItem("manga_recap_bg_style");
    return normalizeBackground(saved);
  });

  const [customBgUrl, setCustomBgUrl] = useState<string | null>(() => {
    return localStorage.getItem("manga_recap_custom_bg_url");
  });

  // Watchers to save bgStyle to localStorage
  useEffect(() => {
    localStorage.setItem("manga_recap_bg_style", bgStyle);
  }, [bgStyle]);

  // Animated Paper background motion & moving filter configuration
  const [paperMotion, setPaperMotion] = useState<PaperMotionConfig>(() => {
    const saved = localStorage.getItem("manga_recap_paper_motion");
    return normalizePaperMotion(saved);
  });

  useEffect(() => {
    localStorage.setItem("manga_recap_paper_motion", JSON.stringify(paperMotion));
  }, [paperMotion]);

  // Video format (codec) and quality (bitrate) states
  const [videoCodec, setVideoCodec] = useState<string>(() => {
    return localStorage.getItem("manga_recap_video_codec") || "mp4-high";
  });

  const [videoBitrate, setVideoBitrate] = useState<string>(() => {
    return localStorage.getItem("manga_recap_video_bitrate") || "2mbps";
  });

  // Fitur Kompres MP4 Otomatis saat Render
  const [autoCompressMP4, setAutoCompressMP4] = useState<boolean>(() => {
    const saved = localStorage.getItem("manga_recap_auto_compress_mp4");
    return saved !== null ? saved === "true" : true; // Default aktif untuk hemat kuota & render mulus
  });

  const [compressLevel, setCompressLevel] = useState<string>(() => {
    return localStorage.getItem("manga_recap_compress_level") || "optimal";
  });

  const [crfPreset, setCrfPreset] = useState<CompressionPreset>(() => {
    return normalizePreset(localStorage.getItem("manga_recap_crf_preset"));
  });

  const [exportResolution, setExportResolution] = useState<string>(() => {
    return localStorage.getItem("manga_recap_export_resolution") || "720p";
  });

  useEffect(() => {
    localStorage.setItem("manga_recap_video_codec", videoCodec);
  }, [videoCodec]);

  useEffect(() => {
    localStorage.setItem("manga_recap_video_bitrate", videoBitrate);
  }, [videoBitrate]);

  useEffect(() => {
    localStorage.setItem("manga_recap_auto_compress_mp4", String(autoCompressMP4));
  }, [autoCompressMP4]);

  useEffect(() => {
    localStorage.setItem("manga_recap_compress_level", compressLevel);
  }, [compressLevel]);

  useEffect(() => {
    localStorage.setItem("manga_recap_crf_preset", crfPreset);
  }, [crfPreset]);

  useEffect(() => {
    localStorage.setItem("manga_recap_export_resolution", exportResolution);
  }, [exportResolution]);

  // Audio Context & Buffer Source references for high-fidelity glitch-free export
  const exportAudioCtxRef = useRef<AudioContext | null>(null);
  const exportSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  // High performance offscreen cache for blurred background canvas frames (1000x faster than real-time ctx.filter)
  const blurredCacheRef = useRef<Record<string, HTMLCanvasElement>>({});
  const panelShadowRef = useRef<ReturnType<typeof createPanelShadowCache> | null>(null);
  if (!panelShadowRef.current) panelShadowRef.current = createPanelShadowCache();

  // Export recording states
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStageText, setExportStageText] = useState("");
  const [localExportTime, setLocalExportTime] = useState(0);

  // Render Result State (for preview & download card)
  const [renderResult, setRenderResult] = useState<{
    url: string;
    sizeMB: string;
    preset: CompressionPreset;
  } | null>(null);

  // Dynamic Aspect Ratio: 16:9 Landscape (YouTube) or 9:16 Portrait (Shorts/TikTok)
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">(() => {
    return (localStorage.getItem("manga_recap_aspect_ratio") as "16:9" | "9:16") || "16:9";
  });

  useEffect(() => {
    localStorage.setItem("manga_recap_aspect_ratio", aspectRatio);
  }, [aspectRatio]);

  // Voice Over / Speech synthesis toggle state for Method 1
  const [useAutoTTS, setUseAutoTTS] = useState<boolean>(true);

  // Selected category for Cubit & Geser settings ("vertical" | "horizontal" | "square")
  const [selectedCubitCategory, setSelectedCubitCategory] = useState<
    "vertical" | "horizontal" | "square"
  >("vertical");

  // Track loaded URLs for React layout reactiveness
  const [loadedUrls, setLoadedUrls] = useState<Record<string, boolean>>({});

  const totalDuration = panels.reduce((acc, p) => acc + Number(p.duration || 4), 0);

  const formatDuration = (sec: number): string => {
    if (!sec || isNaN(sec) || sec <= 0) return "0:00.0";
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${m}:${s.padStart(4, "0")}`;
  };

  // Estimasi ukuran file MP4 terkompresi secara real-time
  const calcEstimatedSizeMB = (): string => {
    let vBps = 1800000;
    let aBps = 128000;
    if (autoCompressMP4) {
      if (compressLevel === "super-hemat") {
        vBps = 1000000;
        aBps = 96000;
      } else if (compressLevel === "optimal") {
        vBps = 1800000;
        aBps = 128000;
      } else if (compressLevel === "balanced") {
        vBps = 3000000;
        aBps = 128000;
      } else {
        vBps = 5500000;
        aBps = 192000;
      }
    } else {
      if (videoBitrate === "6mbps") vBps = 6000000;
      else if (videoBitrate === "4mbps") vBps = 4000000;
      else vBps = 2000000;
    }
    const dur = Math.max(1, totalDuration);
    const totalBytes = (dur * (vBps + aBps)) / 8;
    return (totalBytes / (1024 * 1024)).toFixed(1);
  };

  // Determine drawing time based on export state
  const drawTime = isExporting ? localExportTime : currentTime;

  // Active panel details derived directly from standard linear timeline coordinates
  let activePanelIndex = 0;
  let activePanelTime = 0;

  if (activePanelIndexOverride !== undefined && activePanelIndexOverride !== null && !isExporting) {
    activePanelIndex = activePanelIndexOverride;
    // Calculate simulated active panel time
    let accumulatedBefore = 0;
    for (let i = 0; i < activePanelIndex; i++) {
      accumulatedBefore += Number(panels[i]?.duration || 4);
    }
    activePanelTime = Math.max(0, drawTime - accumulatedBefore);
  } else if (panels.length > 0) {
    let accumulated = 0;
    let found = false;

    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      const pDuration = Number(panel.duration || 4);
      if (drawTime >= accumulated && drawTime < accumulated + pDuration) {
        activePanelIndex = i;
        activePanelTime = drawTime - accumulated;
        found = true;
        break;
      }
      accumulated += pDuration;
    }

    if (!found) {
      // Default to the final storyboard panel if out of range
      activePanelIndex = panels.length - 1;
      activePanelTime = Number(panels[panels.length - 1]?.duration || 4);
    }
  }

  // Method 1: Automatic Speech Synthesis narration synced dynamically to panel index changes
  useEffect(() => {
    if (!useAutoTTS || !isPlaying) {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    // Skip TTS reading if a customized voice recording is uploaded and active
    if (narrationAudioUrl) return;

    if (panels.length > 0) {
      const activePanel = panels[activePanelIndex];
      if (activePanel && activePanel.subtitle) {
        if (typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();

          // Build energetic voiceover parameters for standard Indonesian speak patterns
          const utterance = new SpeechSynthesisUtterance(activePanel.subtitle);

          const voices = window.speechSynthesis.getVoices();
          const indVoice = voices.find(
            (v) =>
              v.lang.startsWith("id") ||
              v.lang.startsWith("id-ID") ||
              v.name.toLowerCase().includes("indonesian"),
          );
          if (indVoice) {
            utterance.voice = indVoice;
          }
          utterance.lang = "id-ID";
          utterance.rate = 1.1; // Balanced dynamic speech rate of manga recap channel
          utterance.pitch = 1.0;

          window.speechSynthesis.speak(utterance);
        }
      }
    }

    return () => {
      // Ensure clean cancellation on active index hop
    };
  }, [activePanelIndex, isPlaying, useAutoTTS, panels, narrationAudioUrl]);

  // Load narration audio element helper
  useEffect(() => {
    if (narrationAudioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = narrationAudioUrl;
        audioRef.current.load();
      } else {
        const audio = new Audio(narrationAudioUrl);
        audio.preload = "auto";
        audioRef.current = audio;
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    }
  }, [narrationAudioUrl]);

  // Backsound preview: loops under the VO, length follows VO, fades out at the end
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const [voDuration, setVoDuration] = useState(0);
  useEffect(() => {
    if (!narrationAudioUrl) {
      setVoDuration(0);
      return;
    }
    const a = new Audio(narrationAudioUrl);
    a.preload = "metadata";
    a.onloadedmetadata = () => setVoDuration(isFinite(a.duration) ? a.duration : 0);
  }, [narrationAudioUrl]);
  useEffect(() => {
    if (!backsoundUrl) {
      bgmRef.current?.pause();
      bgmRef.current = null;
      return;
    }
    const b = new Audio(backsoundUrl);
    b.loop = true;
    b.preload = "auto";
    bgmRef.current = b;
    return () => {
      b.pause();
    };
  }, [backsoundUrl]);
  const bgmEnd = Math.min(totalDurationForBgm(), voDuration > 0 ? voDuration : Infinity);
  function totalDurationForBgm() {
    return panels.reduce((a, p) => a + (p.duration || 0), 0);
  }
  useEffect(() => {
    const b = bgmRef.current;
    if (!b) return;
    const vol = Math.min(BACKSOUND_MAX_VOLUME, backsoundVolume) * fadeGainAt(currentTime, bgmEnd);
    b.volume = Math.max(0, Math.min(1, vol));
    const shouldPlay = isPlaying && !isExporting && currentTime < bgmEnd;
    if (shouldPlay) {
      const d = b.duration;
      if (isFinite(d) && d > 0) {
        const target = currentTime % d;
        if (Math.abs(b.currentTime - target) > 1.2) b.currentTime = target;
      }
      if (b.paused) b.play().catch(() => {});
    } else if (!b.paused) {
      b.pause();
    }
  }, [currentTime, isPlaying, isExporting, backsoundVolume, bgmEnd, backsoundUrl]);

  // Sync Audio Playback speed or start/stop states
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      // Seek only on initial play if playhead is misaligned by more than 0.2s
      if (Math.abs(audio.currentTime - currentTime) > 0.2) {
        audio.currentTime = currentTime;
      }
      audio.play().catch((err) => console.warn("Audio play prevented:", err));
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  // Sync vocal audio playhead on timeline seek or scrubbing (when NOT playing, or deliberate jump > 1.2s)
  useEffect(() => {
    if (isExporting) return; // Never seek during export
    const audio = audioRef.current;
    if (!audio) return;

    if (!isPlaying) {
      // While paused, scrubbing the timeline immediately seeks audio for responsive cueing
      if (Math.abs(audio.currentTime - currentTime) > 0.05) {
        audio.currentTime = currentTime;
      }
    } else {
      // While playing, ONLY seek if user performed a major manual scrub (> 1.2s jump).
      // Never seek on small clock drifts (which previously caused persistent audio stuttering/patah-patah!)
      const diff = Math.abs(audio.currentTime - currentTime);
      if (diff > 1.2) {
        audio.currentTime = currentTime;
      }
    }
  }, [currentTime, isPlaying, isExporting]);

  // Master Clock: When narration audio is active, drive timeline directly from audio hardware clock!
  // This completely eliminates clock drift and guarantees 100% smooth, stutter-free playback & tapping sync!
  useEffect(() => {
    if (!isPlaying || isExporting || !narrationAudioUrl) return;
    const audio = audioRef.current;
    if (!audio) return;

    let rAF: number;
    const audioSyncLoop = () => {
      if (isPlaying && !audio.paused && !isExporting) {
        onUpdateTime(audio.currentTime);
        if (audio.currentTime >= totalDuration) {
          onTogglePlay();
          return;
        }
        rAF = requestAnimationFrame(audioSyncLoop);
      }
    };
    rAF = requestAnimationFrame(audioSyncLoop);

    const handleEnded = () => {
      if (isPlaying) {
        onTogglePlay();
      }
    };
    audio.addEventListener("ended", handleEnded);

    return () => {
      cancelAnimationFrame(rAF);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [isPlaying, isExporting, narrationAudioUrl, onUpdateTime, onTogglePlay, totalDuration]);

  // Image caching to avoid flickering during direct canvas draws
  const imageCacheRef = useRef<Record<string, HTMLImageElement>>({});
  const hotspotsCacheRef = useRef<Record<string, { x: number; y: number }[]>>({});
  const hotspotsCache95Ref = useRef<Record<string, { x: number; y: number }[]>>({});

  const loadImageRef = useRef(createImageLoader(imageCacheRef.current));
  const backgroundImageUrls = useMemo(() => {
    return bgStyle === "kertas" || bgStyle === "putih" || bgStyle === "cream"
      ? [paperBackgroundUrl, ...PAPER_LOOP_FRAME_URLS]
      : bgStyle === "custom" && customBgUrl
        ? [customBgUrl]
        : [];
  }, [bgStyle, customBgUrl]);

  // Preview and export share decoded assets, including backgrounds uploaded while paused.
  useEffect(() => {
    let active = true;
    const urls = [...new Set([...panels.map((p) => p.url), ...backgroundImageUrls])];
    urls.forEach((url) => {
      void loadImageRef
        .current(url)
        .then(() => {
          if (active) setLoadedUrls((prev) => ({ ...prev, [url]: true }));
        })
        .catch((error) => console.warn("Gambar belum siap:", error));
    });
    return () => {
      active = false;
    };
  }, [panels, backgroundImageUrls]);

  // Safely dispose of any active rendering animation frames on component unmount
  useEffect(() => {
    return () => {
      if (exportAnimFrameRef.current !== null) {
        cancelAnimationFrame(exportAnimFrameRef.current);
      }
    };
  }, []);

  // High-performance offscreen blurred background generator (caches 320x180 buffer, renders in 0.02ms)
  const getBlurredCanvas = (img: HTMLImageElement, cacheKey: string): HTMLCanvasElement => {
    if (blurredCacheRef.current[cacheKey]) {
      return blurredCacheRef.current[cacheKey];
    }
    const offscreen = document.createElement("canvas");
    offscreen.width = 320;
    offscreen.height = 180;
    const offCtx = offscreen.getContext("2d");
    if (offCtx) {
      offCtx.filter = "blur(3px) brightness(0.48) saturate(0.85)";
      const imgRatio = img.width / img.height;
      const canvasRatio = 320 / 180;
      let drawW, drawH;
      if (imgRatio > canvasRatio) {
        drawH = 180;
        drawW = 180 * imgRatio;
      } else {
        drawW = 320;
        drawH = 320 / imgRatio;
      }
      offCtx.drawImage(img, (320 - drawW) / 2, (180 - drawH) / 2, drawW, drawH);
    }
    blurredCacheRef.current[cacheKey] = offscreen;
    return offscreen;
  };

  // Core Drawing Engine - draws any timeline position on any arbitrary canvas at peak performance
  const drawFrameDirectly = (
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    timeValue: number,
    isAnimated: boolean,
    forExport = false,
  ) => {
    if (panels.length === 0) return;

    // Determine drawing time based on export state
    const drawTime = timeValue;

    // Active panel details derived directly from standard linear timeline coordinates
    let activeIndex = 0;
    let activeTime = 0;

    if (activePanelIndexOverride !== undefined && activePanelIndexOverride !== null && !forExport) {
      activeIndex = activePanelIndexOverride;
      // Calculate simulated active panel time
      let accumulatedBefore = 0;
      for (let i = 0; i < activeIndex; i++) {
        accumulatedBefore += Number(panels[i]?.duration || 4);
      }
      activeTime = Math.max(0, drawTime - accumulatedBefore);
    } else {
      let accumulated = 0;
      let found = false;

      for (let i = 0; i < panels.length; i++) {
        const panel = panels[i];
        const pDuration = Number(panel.duration || 4);
        if (drawTime >= accumulated && drawTime < accumulated + pDuration) {
          activeIndex = i;
          activeTime = drawTime - accumulated;
          found = true;
          break;
        }
        accumulated += pDuration;
      }

      if (!found) {
        // Default to the final storyboard panel if out of range
        activeIndex = panels.length - 1;
        activeTime = Number(panels[panels.length - 1]?.duration || 4);
      }
    }

    const panel = panels[activeIndex];
    if (!panel) return;

    const drawPanelFrame = (
      idx: number,
      progressVal: number,
      alpha: number,
      xShift: number = 0,
      yShift: number = 0,
      extraScale: number = 1.0,
    ) => {
      const p = panels[idx];
      if (!p) return;
      const pImg = imageCacheRef.current[p.url];
      if (!pImg) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (extraScale !== 1.0 || xShift !== 0 || yShift !== 0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.translate(xShift, yShift);
        ctx.scale(extraScale, extraScale);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // We want the viewport to always be 100% of the canvas to avoid artificial column boundaries ("bingkai")
      const sizePercent = 100;
      const viewportW = canvas.width;
      const viewportH = canvas.height;
      const viewportRatio = viewportW / viewportH;

      const imgRatio = pImg.width / pImg.height;
      let drawW, drawH;
      if (imgRatio > viewportRatio) {
        // Landscape wider than 16:9 -> fit width to viewport, calculate height
        drawW = viewportW;
        drawH = viewportW / imgRatio;
      } else {
        // Vertical or square -> fit height to viewport, calculate width
        drawH = viewportH;
        drawW = viewportH * imgRatio;
      }

      // Easing calculation
      const easingType = p.easing || "smooth";
      let easedP = progressVal;
      if (easingType === "linear") {
        easedP = progressVal;
      } else if (easingType === "ease-in-out") {
        easedP =
          progressVal < 0.5
            ? 4 * progressVal * progressVal * progressVal
            : 1 - Math.pow(-2 * progressVal + 2, 3) / 2;
      } else {
        easedP = Math.sin((progressVal * Math.PI) / 2);
      }

      let scaleVal = 1.0;
      let finalOffsetX = 0;
      let finalOffsetY = 0;

      if (imgRatio < 0.9) {
        // Vertikal: Pan Vertikal (dari atas ke bawah), gambarnya sedikit diperbesar
        // Khusus vertikal aja.
        scaleVal = verticalConfig.initialScale + easedP * verticalConfig.zoomSpeed;
        finalOffsetX = (verticalConfig.offsetX / 100) * viewportW;
        finalOffsetY =
          (0.5 - easedP) * (drawH * scaleVal - viewportH) +
          (verticalConfig.offsetY / 100) * viewportH;
      } else if (imgRatio > 1.1) {
        // Horizontal: slow zoom, gak full layar, sedikit diperbesar
        scaleVal = horizontalConfig.initialScale + easedP * horizontalConfig.zoomSpeed;
        finalOffsetX = (horizontalConfig.offsetX / 100) * viewportW;
        finalOffsetY = (horizontalConfig.offsetY / 100) * viewportH;
      } else {
        // Square: slow zoom, gak full layar
        scaleVal = squareConfig.initialScale + easedP * squareConfig.zoomSpeed;
        finalOffsetX = (squareConfig.offsetX / 100) * viewportW;
        finalOffsetY = (squareConfig.offsetY / 100) * viewportH;
      }

      // Draw standard shadow ONLY if we have an artificial border (which is not used here)
      if (sizePercent < 100) {
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.98)";
        ctx.shadowBlur = 45;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = "#000000";
        ctx.fillRect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
        ctx.restore();
      }

      // Fill flat background within viewport ONLY if style is black or white.
      // For "kabur", we do not fill any flat background so the blurred backdrop remains fully visible.
      if (bgStyle === "hitam") {
        ctx.save();
        ctx.fillStyle = "#000000";
        ctx.fillRect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
        ctx.restore();
      } else if (bgStyle === "putih") {
        if (!paperMotion.enabled || paperMotion.style === "statis") {
          ctx.save();
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
          ctx.restore();
        }
      }

      // Clip canvas drawing inside viewport
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
      ctx.clip();

      ctx.translate(cx + finalOffsetX, cy + finalOffsetY);
      panelShadowRef.current?.(
        ctx,
        pImg,
        -(drawW * scaleVal) / 2,
        -(drawH * scaleVal) / 2,
        drawW * scaleVal,
        drawH * scaleVal,
        canvas.width,
        getComputedStyle(document.documentElement).getPropertyValue("--video-panel-shadow").trim(),
      );
      ctx.drawImage(
        pImg,
        -(drawW * scaleVal) / 2,
        -(drawH * scaleVal) / 2,
        drawW * scaleVal,
        drawH * scaleVal,
      );

      ctx.restore(); // undo clip
      ctx.restore(); // undo translate & alpha
    };

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const activeImg = imageCacheRef.current[panel.url];
    if (!activeImg) {
      // Drawing beautiful placeholders
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f59e0b";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Sedang memuat frame sketsa...", canvas.width / 2, canvas.height / 2);
      return;
    }

    const duration = panel.duration || 4;
    const progress = Math.min(activeTime / duration, 1.0); // 0 to 1

    // --- DRAW 1. DYNAMIC BACKGROUND (HITAM, PUTIH, ABU, NAVY, KABUR, CUSTOM) ---
    if (bgStyle === "hitam") {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (bgStyle === "putih") {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (paperMotion.enabled && paperMotion.style !== "statis") {
        const paperImages = PAPER_LOOP_FRAME_URLS.map((url) => imageCacheRef.current[url]).filter(
          Boolean,
        );
        drawAnimatedPaperBackdrop(
          ctx,
          paperImages.length > 0 ? paperImages : null,
          canvas.width,
          canvas.height,
          drawTime,
          paperMotion,
          "#FFFFFF",
        );
      }
    } else if (bgStyle === "cream") {
      const creamColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--video-background-cream")
          .trim() || "#f5f0e8";
      ctx.fillStyle = creamColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (paperMotion.enabled && paperMotion.style !== "statis") {
        drawAnimatedPaperBackdrop(
          ctx,
          null,
          canvas.width,
          canvas.height,
          drawTime,
          paperMotion,
          creamColor,
        );
      }
    } else if (bgStyle === "kertas") {
      const paperBaseColor =
        getComputedStyle(document.documentElement)
          .getPropertyValue("--video-background-paper")
          .trim() || "#faf8f5";
      ctx.fillStyle = paperBaseColor;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const paperImages = PAPER_LOOP_FRAME_URLS.map((url) => imageCacheRef.current[url]).filter(
        Boolean,
      );
      const fallbackImage = imageCacheRef.current[paperBackgroundUrl];
      drawAnimatedPaperBackdrop(
        ctx,
        paperImages.length > 0 ? paperImages : fallbackImage || null,
        canvas.width,
        canvas.height,
        drawTime,
        paperMotion,
        paperBaseColor,
      );
    } else if (bgStyle === "custom") {
      const customImage = customBgUrl ? imageCacheRef.current[customBgUrl] : null;
      const bgImage = customImage || activeImg;
      const key = customImage ? `custom_${customBgUrl}` : `panel_${panel.url}`;
      ctx.drawImage(getBlurredCanvas(bgImage, key), 0, 0, canvas.width, canvas.height);
    } else {
      // "kabur"
      ctx.save();
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (activeImg) {
        const blurredCanvas = getBlurredCanvas(activeImg, `kabur_${panel.url}`);
        ctx.drawImage(blurredCanvas, 0, 0, canvas.width, canvas.height);
      }

      const transitionDuration = 0.6;
      if (activeIndex > 0 && activeTime < transitionDuration) {
        const prevPanel = panels[activeIndex - 1];
        const prevImg = imageCacheRef.current[prevPanel.url];
        if (prevImg) {
          const tProgress = activeTime / transitionDuration;
          ctx.save();
          ctx.globalAlpha = 1.0 - tProgress;
          const prevBlurred = getBlurredCanvas(prevImg, `kabur_${prevPanel.url}`);
          ctx.drawImage(prevBlurred, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        }
      }

      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      ctx.restore();
    }

    // --- DRAW 2. CUSTOMIZABLE CELL PANEL TRANSITIONS ---
    const transitionDuration = 0.6;
    const curTransition = panel.transitionType || "crossfade";

    if (activeIndex > 0 && activeTime < transitionDuration) {
      const prevPanel = panels[activeIndex - 1];
      const prevImg = imageCacheRef.current[prevPanel.url];

      if (prevImg) {
        const tProgress = activeTime / transitionDuration;

        if (curTransition === "crossfade") {
          drawPanelFrame(activeIndex - 1, 1.0, 1.0 - tProgress, 0, 0, 1.0);
          drawPanelFrame(activeIndex, progress, tProgress, 0, 0, 1.0);
        } else if (curTransition === "slide-left") {
          drawPanelFrame(activeIndex - 1, 1.0, 1.0, -tProgress * canvas.width, 0, 1.0);
          drawPanelFrame(activeIndex, progress, 1.0, (1.0 - tProgress) * canvas.width, 0, 1.0);
        } else if (curTransition === "slide-right") {
          drawPanelFrame(activeIndex - 1, 1.0, 1.0, tProgress * canvas.width, 0, 1.0);
          drawPanelFrame(activeIndex, progress, 1.0, -(1.0 - tProgress) * canvas.width, 0, 1.0);
        } else if (curTransition === "zoom-fade") {
          drawPanelFrame(activeIndex - 1, 1.0, 1.0 - tProgress, 0, 0, 1.0 - tProgress * 0.15);
          drawPanelFrame(activeIndex, progress, tProgress, 0, 0, 0.85 + tProgress * 0.15);
        } else {
          drawPanelFrame(activeIndex, progress, 1.0, 0, 0, 1.0);
        }
      } else {
        drawPanelFrame(activeIndex, progress, 1.0, 0, 0, 1.0);
      }
    } else {
      drawPanelFrame(activeIndex, progress, 1.0, 0, 0, 1.0);
    }

    // --- DRAW 3. CINEMATIC PAGE-TURN FLASH EFFECT ---
    if (activeTime < 0.25) {
      const flashAlpha = ((0.25 - activeTime) / 0.25) * 0.45;
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Shaky speed lines for action sections
    if (panel.motionType === "shaky-action") {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 1.5;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      for (let i = 0; i < 40; i++) {
        const edgeX = Math.random() < 0.5 ? 0 : canvas.width;
        const edgeY = Math.random() * canvas.height;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(edgeX, edgeY);
        ctx.stroke();
      }
      ctx.restore();
    }

    // --- DRAW 5. CHROMA SHIFT PIXEL SHIELD ---
    ctx.save();
    ctx.globalAlpha = 0.007;
    for (let i = 0; i < 8; i++) {
      const r = Math.floor(Math.random() * 256);
      const g = Math.floor(Math.random() * 256);
      const b = Math.floor(Math.random() * 256);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      const w = (0.2 + Math.random() * 0.8) * canvas.width;
      const h = (0.2 + Math.random() * 0.8) * canvas.height;
      const x = Math.random() * (canvas.width - w);
      const y = Math.random() * (canvas.height - h);
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  };

  // Standard preview/timeline drawing subscription
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || panels.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isSubscribed = true;
    drawFrameDirectly(canvas, ctx, drawTime, isPlaying || isExporting);
    return () => {
      isSubscribed = false;
    };
  }, [
    activePanelIndex,
    activePanelTime,
    drawTime,
    panels,
    aspectRatio,
    bgStyle,
    paperMotion,
    customBgUrl,
    loadedUrls,
    verticalConfig,
    horizontalConfig,
    squareConfig,
    isPlaying,
    isExporting,
  ]);

  const _oldRenderLoop = () => {
    const canvas = canvasRef.current;
    if (!canvas || panels.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isSubscribed = true;
    const panel = panels[activePanelIndex];
    if (!panel) return;

    const drawPanelFrame = (
      idx: number,
      progressVal: number,
      alpha: number,
      xShift: number = 0,
      yShift: number = 0,
      extraScale: number = 1.0,
    ) => {
      const p = panels[idx];
      if (!p) return;
      const pImg = imageCacheRef.current[p.url];
      if (!pImg) return;

      ctx.save();
      ctx.globalAlpha = alpha;

      if (extraScale !== 1.0 || xShift !== 0 || yShift !== 0) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.translate(xShift, yShift);
        ctx.scale(extraScale, extraScale);
        ctx.translate(-canvas.width / 2, -canvas.height / 2);
      }

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // Deterministic viewport sizing based on chosen animation style
      const mType = p.motionType;
      let sizePercent = 65;
      if (mType === "random-50-100") {
        const str = p.id || "";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const min = 50;
        const max = 100;
        const range = max - min;
        const val = Math.abs(hash) % (range + 1);
        sizePercent = min + val;
      } else if (mType === "random-45-75") {
        const str = p.id || "";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const min = 45;
        const max = 75;
        const range = max - min;
        const val = Math.abs(hash) % (range + 1);
        sizePercent = min + val;
      } else if (mType === "100-manga-flow" || mType === "manga-multi-focus") {
        sizePercent = 100;
      } else if (mType && mType.startsWith("100-")) {
        sizePercent = 100;
      } else if (mType && (mType.startsWith("65-") || mType.startsWith("80-"))) {
        sizePercent = 65;
      } else {
        sizePercent = 65; // Default sizing for legacy or other options
      }

      const viewportW = canvas.width * (sizePercent / 100);
      const viewportH = canvas.height;
      const viewportRatio = viewportW / viewportH;

      const imgRatio = pImg.width / pImg.height;
      let drawW, drawH;
      if (imgRatio > viewportRatio) {
        // Image is wider than viewport -> fit height to viewport
        drawH = viewportH;
        drawW = viewportH * imgRatio;
      } else {
        // Image is taller than viewport -> fit width to viewport
        drawW = viewportW;
        drawH = viewportW / imgRatio;
      }

      // Easing calculation
      const easingType = p.easing || "smooth";
      let easedP = progressVal;
      if (easingType === "linear") {
        easedP = progressVal;
      } else if (easingType === "ease-in-out") {
        easedP =
          progressVal < 0.5
            ? 4 * progressVal * progressVal * progressVal
            : 1 - Math.pow(-2 * progressVal + 2, 3) / 2;
      } else {
        easedP = Math.sin((progressVal * Math.PI) / 2);
      }

      let scaleVal = 1.0;
      let finalOffsetX = 0;
      let finalOffsetY = 0;

      // Determine active motion action
      let activeMotion: string = mType;
      if (mType === "random-45-75") {
        const str = p.id || "";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const options = ["pan-top-to-bottom", "pan-bottom-to-top"];
        const idx = Math.abs(hash) % options.length;
        activeMotion = options[idx];
      } else if (mType === "80-random" || mType === "65-random" || mType === "random-50-100") {
        const possibleMotions = [
          "pan-top-to-bottom",
          "pan-bottom-to-top",
          "diagonal-right-to-left",
        ];
        const str = p.id || "";
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        const idx = Math.abs(hash) % possibleMotions.length;
        activeMotion = possibleMotions[idx];
      } else {
        if (
          mType === "80-pan-top-to-bottom" ||
          mType === "65-pan-top-to-bottom" ||
          mType === "100-pan-top-to-bottom"
        ) {
          activeMotion = "pan-top-to-bottom";
        } else if (
          mType === "80-pan-bottom-to-top" ||
          mType === "65-pan-bottom-to-top" ||
          mType === "100-pan-bottom-to-top"
        ) {
          activeMotion = "pan-bottom-to-top";
        } else if (mType === "100-diagonal-right-to-left") {
          activeMotion = "diagonal-right-to-left";
        }
      }

      if (activeMotion === "zoom-in") {
        scaleVal = 1.05 + easedP * 0.35; // 105% to 140%
      } else if (activeMotion === "zoom-out") {
        scaleVal = 1.4 - easedP * 0.35; // 140% to 105%
      } else if (activeMotion === "pan-top-to-bottom") {
        scaleVal = 1.3;
        const extraH = drawH * scaleVal - viewportH;
        finalOffsetY = extraH / 2 - easedP * extraH;
      } else if (activeMotion === "pan-bottom-to-top") {
        scaleVal = 1.3;
        const extraH = drawH * scaleVal - viewportH;
        finalOffsetY = -extraH / 2 + easedP * extraH;
      } else if (activeMotion === "pan-left-to-right") {
        scaleVal = 1.3;
        const extraW = drawW * scaleVal - viewportW;
        finalOffsetX = extraW / 2 - easedP * extraW;
      } else if (activeMotion === "pan-right-to-left") {
        scaleVal = 1.3;
        const extraW = drawW * scaleVal - viewportW;
        finalOffsetX = -extraW / 2 + easedP * extraW;
      } else if (activeMotion === "diagonal-right-to-left") {
        scaleVal = 1.3;
        const extraW = drawW * scaleVal - viewportW;
        const extraH = drawH * scaleVal - viewportH;
        finalOffsetX = -extraW / 2 + easedP * extraW;
        finalOffsetY = extraH / 2 - easedP * extraH;
      } else if (activeMotion === "shaky-action") {
        scaleVal = 1.15;
        if (isPlaying) {
          finalOffsetX = Math.sin(activePanelTime * 65) * 6;
          finalOffsetY = Math.cos(activePanelTime * 55) * 6;
        }
      } else if (activeMotion === "100-manga-flow") {
        let spots = hotspotsCache95Ref.current[p.url];
        if (!spots) {
          spots = analyzeMangaFlow95(pImg);
          hotspotsCache95Ref.current[p.url] = spots;
        }
        const h1 = spots[0] || { x: 0.2, y: -0.2 };
        const h2 = spots[1] || { x: -0.2, y: -0.2 };
        const h3 = spots[2] || { x: 0.2, y: 0.2 };
        const h4 = spots[3] || { x: -0.2, y: 0.2 };

        let tgtX = 0;
        let tgtY = 0;
        let baseScale = 1.6;

        if (progressVal < 0.18) {
          tgtX = h1.x;
          tgtY = h1.y;
          baseScale = 1.6;
        } else if (progressVal < 0.3) {
          const t = (progressVal - 0.18) / 0.12;
          const easedT = Math.sin((t * Math.PI) / 2);
          tgtX = h1.x + (h2.x - h1.x) * easedT;
          tgtY = h1.y + (h2.y - h1.y) * easedT;
          baseScale = 1.6;
        } else if (progressVal < 0.48) {
          tgtX = h2.x;
          tgtY = h2.y;
          baseScale = 1.6;
        } else if (progressVal < 0.6) {
          const t = (progressVal - 0.48) / 0.12;
          const easedT = Math.sin((t * Math.PI) / 2);
          tgtX = h2.x + (h3.x - h2.x) * easedT;
          tgtY = h2.y + (h3.y - h2.y) * easedT;
          baseScale = 1.6;
        } else if (progressVal < 0.78) {
          tgtX = h3.x;
          tgtY = h3.y;
          baseScale = 1.6;
        } else if (progressVal < 0.9) {
          const t = (progressVal - 0.78) / 0.12;
          const easedT = Math.sin((t * Math.PI) / 2);
          tgtX = h3.x + (h4.x - h3.x) * easedT;
          tgtY = h3.y + (h4.y - h3.y) * easedT;
          baseScale = 1.6;
        } else {
          tgtX = h4.x;
          tgtY = h4.y;
          baseScale = 1.6;
        }

        scaleVal = baseScale;
        finalOffsetX = -tgtX * drawW * scaleVal;
        finalOffsetY = -tgtY * drawH * scaleVal;
      } else if (activeMotion === "manga-multi-focus") {
        let spots = hotspotsCacheRef.current[p.url];
        if (!spots) {
          spots = analyzeMangaPanel(pImg);
          hotspotsCacheRef.current[p.url] = spots;
        }
        const h1 = spots[0] || { x: 0.15, y: -0.15 };
        const h2 = spots[1] || { x: 0.0, y: 0.0 };
        const h3 = spots[2] || { x: -0.15, y: 0.15 };

        let tgtX = 0;
        let tgtY = 0;
        let baseScale = 1.6;

        if (progressVal < 0.25) {
          tgtX = h1.x;
          tgtY = h1.y;
          baseScale = 1.6;
        } else if (progressVal < 0.45) {
          const t = (progressVal - 0.25) / 0.2;
          const easedT = Math.sin((t * Math.PI) / 2);
          tgtX = h1.x + (h2.x - h1.x) * easedT;
          tgtY = h1.y + (h2.y - h1.y) * easedT;
          baseScale = 1.6;
        } else if (progressVal < 0.7) {
          tgtX = h2.x;
          tgtY = h2.y;
          baseScale = 1.6;
        } else if (progressVal < 0.85) {
          const t = (progressVal - 0.7) / 0.15;
          const easedT = Math.sin((t * Math.PI) / 2);
          tgtX = h2.x + (h3.x - h2.x) * easedT;
          tgtY = h2.y + (h3.y - h2.y) * easedT;
          baseScale = 1.6;
        } else {
          tgtX = h3.x;
          tgtY = h3.y;
          baseScale = 1.6;
        }

        scaleVal = baseScale;
        finalOffsetX = -tgtX * drawW * scaleVal;
        finalOffsetY = -tgtY * drawH * scaleVal;
      } else {
        // Fallback or anything else (no more dynamic zoom fallback animations)
        scaleVal = 1.0;
      }

      // Draw standard elegant drop shadow rectangle behind viewport if it has a background visible
      if (sizePercent < 100) {
        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.98)";
        ctx.shadowBlur = 45;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = "#000000";
        ctx.fillRect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
        ctx.restore();
      }

      // Fill flat background within the viewport bounds seamlessly
      ctx.save();
      if (bgStyle === "hitam") {
        ctx.fillStyle = "#000000";
      } else if (bgStyle === "putih") {
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle = "#1c1917";
      }
      ctx.fillRect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
      ctx.restore();

      // Clip canvas drawing specifically inside the widescreen viewport
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - viewportW / 2, cy - viewportH / 2, viewportW, viewportH);
      ctx.clip();

      ctx.translate(cx + finalOffsetX, cy + finalOffsetY);
      ctx.drawImage(
        pImg,
        -(drawW * scaleVal) / 2,
        -(drawH * scaleVal) / 2,
        drawW * scaleVal,
        drawH * scaleVal,
      );

      ctx.restore(); // undo clip

      ctx.restore(); // Undo alpha and root state save
    };

    const draw = () => {
      if (!isSubscribed) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const activeImg = imageCacheRef.current[panel.url];
      if (!activeImg) {
        // Drawing beautiful dark-tech placeholder loading indicator
        ctx.fillStyle = "#1c1917";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f59e0b";
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Sedang memuat frame sketsa...", canvas.width / 2, canvas.height / 2);
        return;
      }

      // Calculation of Motion (Ken Burns Effect) based on activePanelTime
      const duration = panel.duration || 4;
      const progress = Math.min(activePanelTime / duration, 1.0); // 0 to 1

      // --- DRAW 1. DYNAMIC BACKGROUND (HITAM, PUTIH, ATAU KABUR) ---
      if (bgStyle === "hitam") {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (bgStyle === "putih") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (bgStyle === "kabur") {
        ctx.save();
        ctx.fillStyle = "#1c1917"; // Dark brown/stone base fallback
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.filter = "blur(3px) brightness(0.40)";
        if (activeImg) {
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.scale(1.5, 1.5);

          const canvasRatio = canvas.width / canvas.height;
          const imgRatio = activeImg.width / activeImg.height;
          let drawW, drawH;
          if (imgRatio > canvasRatio) {
            drawH = canvas.height;
            drawW = canvas.height * imgRatio;
          } else {
            drawW = canvas.width;
            drawH = canvas.width / imgRatio;
          }
          ctx.drawImage(activeImg, -drawW / 2, -drawH / 2, drawW, drawH);
          ctx.restore();
        }

        const transitionDuration = 0.6;
        if (activePanelIndex > 0 && activePanelTime < transitionDuration) {
          const prevPanel = panels[activePanelIndex - 1];
          const prevImg = imageCacheRef.current[prevPanel.url];
          if (prevImg) {
            const tProgress = activePanelTime / transitionDuration;
            ctx.save();
            ctx.globalAlpha = 1.0 - tProgress;
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.scale(1.5, 1.5);

            const canvasRatio = canvas.width / canvas.height;
            const imgRatio = prevImg.width / prevImg.height;
            let drawW, drawH;
            if (imgRatio > canvasRatio) {
              drawH = canvas.height;
              drawW = canvas.height * imgRatio;
            } else {
              drawW = canvas.width;
              drawH = canvas.width / imgRatio;
            }
            ctx.drawImage(prevImg, -drawW / 2, -drawH / 2, drawW, drawH);
            ctx.restore();
          }
        }
        ctx.restore();
      }

      // --- DRAW 2. CUSTOMIZABLE CELL PANEL TRANSITIONS ---
      const transitionDuration = 0.6; // 0.6s transition when panel changes
      const curTransition = panel.transitionType || "crossfade";

      if (activePanelIndex > 0 && activePanelTime < transitionDuration) {
        const prevPanel = panels[activePanelIndex - 1];
        const prevImg = imageCacheRef.current[prevPanel.url];

        if (prevImg) {
          const tProgress = activePanelTime / transitionDuration;

          if (curTransition === "crossfade") {
            // Draw previous panel fading out (with progress fixed at 1.0)
            drawPanelFrame(activePanelIndex - 1, 1.0, 1.0 - tProgress, 0, 0, 1.0);
            // Draw current panel fading in
            drawPanelFrame(activePanelIndex, progress, tProgress, 0, 0, 1.0);
          } else if (curTransition === "slide-left") {
            // Slide left: previous exits to the left, current enters from the right
            drawPanelFrame(activePanelIndex - 1, 1.0, 1.0, -tProgress * canvas.width, 0, 1.0);
            drawPanelFrame(
              activePanelIndex,
              progress,
              1.0,
              (1.0 - tProgress) * canvas.width,
              0,
              1.0,
            );
          } else if (curTransition === "slide-right") {
            // Slide right: previous exits to the right, current enters from the left
            drawPanelFrame(activePanelIndex - 1, 1.0, 1.0, tProgress * canvas.width, 0, 1.0);
            drawPanelFrame(
              activePanelIndex,
              progress,
              1.0,
              -(1.0 - tProgress) * canvas.width,
              0,
              1.0,
            );
          } else if (curTransition === "zoom-fade") {
            // Zoom-fade: previous zooms out and fades, current zooms in and fades in
            drawPanelFrame(
              activePanelIndex - 1,
              1.0,
              1.0 - tProgress,
              0,
              0,
              1.0 - tProgress * 0.15,
            );
            drawPanelFrame(activePanelIndex, progress, tProgress, 0, 0, 0.85 + tProgress * 0.15);
          } else {
            // "none": instant snap cut
            drawPanelFrame(activePanelIndex, progress, 1.0, 0, 0, 1.0);
          }
        } else {
          // Fallback if previous image is not cached
          drawPanelFrame(activePanelIndex, progress, 1.0, 0, 0, 1.0);
        }
      } else {
        // Standard single slide drawing (fully opaque)
        drawPanelFrame(activePanelIndex, progress, 1.0, 0, 0, 1.0);
      }

      // --- DRAW 3. CINEMATIC PAGE-TURN FLASH EFFECT ---
      if (activePanelTime < 0.25) {
        const flashAlpha = ((0.25 - activePanelTime) / 0.25) * 0.45;
        ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Shaky speed lines for action sections
      if (panel.motionType === "shaky-action") {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = 1.5;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        for (let i = 0; i < 40; i++) {
          const edgeX = Math.random() < 0.5 ? 0 : canvas.width;
          const edgeY = Math.random() * canvas.height;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(edgeX, edgeY);
          ctx.stroke();
        }
        ctx.restore();
      }

      // --- DRAW 5. CHROMA SHIFT PIXEL SHIELD (CONTENT ID BYPASS & UNIQUE HASH ENFORCEMENT) ---
      ctx.save();
      ctx.globalAlpha = 0.007;
      for (let i = 0; i < 8; i++) {
        const r = Math.floor(Math.random() * 256);
        const g = Math.floor(Math.random() * 256);
        const b = Math.floor(Math.random() * 256);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        const w = (0.2 + Math.random() * 0.8) * canvas.width;
        const h = (0.2 + Math.random() * 0.8) * canvas.height;
        const x = Math.random() * (canvas.width - w);
        const y = Math.random() * (canvas.height - h);
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();

      // Optional focus metadata corner removed for a clean presentation

      // --- DRAW 4. MODERN REEL CAPTIONS / SUBTITLE OVERLAY REMOVED FOR CLEAN VIDEO ---
    };

    // Trigger drawing once checked
    const activeImg = imageCacheRef.current[panel.url];
    if (!activeImg) {
      const loadImg = new Image();
      loadImg.crossOrigin = "anonymous";
      loadImg.src = panel.url;
      loadImg.onload = () => {
        imageCacheRef.current[panel.url] = loadImg;
        draw();
      };
    } else {
      draw();
    }

    return () => {
      isSubscribed = false;
    };
  };

  // FULL IN-BROWSER EXPORT RECORDER WITH AUDIO MIXING!
  // HIGH-PERFORMANCE OFFLINE MP4 EXPORT (NO SCREEN-RECORD, NO WALL-CLOCK LAG, NO LOUD SPEAKER PLAYBACK)
  const handleStartOfflineRender = async (overridePreset?: CompressionPreset) => {
    if (panels.length === 0) {
      alert("Buat storyboard/panel dan suara Anda sebelum melakukan render.");
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isPlaying) {
      onTogglePlay();
    }

    const targetPreset = overridePreset || crfPreset;
    setIsExporting(true);
    setExportProgress(0);
    setExportStageText("Tahap 1: Merekam Frame Canvas (0%)...");
    isExportCancelledRef.current = false;

    // Export dimensions: 720p or 1080p (from export resolution setting), matching aspect ratio
    const is1080 = exportResolution === "1080p";
    const longSide = is1080 ? 1920 : 1280;
    const shortSide = is1080 ? 1080 : 720;
    const exportW = aspectRatio === "16:9" ? longSide : shortSide;
    const exportH = aspectRatio === "16:9" ? shortSide : longSide;

    // Draw into a detached GPU-accelerated canvas so the on-screen preview is never resized/re-laid out
    const renderCanvas = document.createElement("canvas");
    renderCanvas.width = exportW;
    renderCanvas.height = exportH;
    const ctx = renderCanvas.getContext("2d", {
      alpha: false,
      desynchronized: true,
      willReadFrequently: false,
    }) as CanvasRenderingContext2D | null;

    try {
      if (!ctx) throw new Error("Canvas render tidak tersedia.");
      setExportStageText("Menyiapkan gambar dan latar belakang...");
      await Promise.all(
        [...new Set([...panels.map((p) => p.url), ...backgroundImageUrls])].map((url) =>
          loadImageRef.current(url),
        ),
      );
      if (isExportCancelledRef.current) return;
      const result = await exportVideoOffline({
        canvas: renderCanvas,
        width: exportW,
        height: exportH,
        fps: 30,
        preset: targetPreset,
        totalDuration,
        narrationAudioUrl,
        backsoundUrl,
        backsoundVolume,
        renderFrame: (t) => {
          if (ctx) {
            drawFrameDirectly(renderCanvas, ctx, t, true, true);
          }
        },
        onProgress: (stage, stageName, percent) => {
          setExportProgress(percent);
          setExportStageText(stageName);
          setLocalExportTime((percent / 100) * totalDuration);
        },
        isCancelled: () => isExportCancelledRef.current,
      });

      setRenderResult({
        url: result.url,
        sizeMB: result.sizeMB,
        preset: targetPreset,
      });
      setExportProgress(100);
    } catch (err: any) {
      console.error("Export error:", err);
      if (!isExportCancelledRef.current) {
        alert("Gagal melakukan ekspor: " + (err?.message || "Terjadi kesalahan"));
      }
    } finally {
      renderCanvas.width = 0;
      renderCanvas.height = 0;
      setIsExporting(false);
    }
  };

  const startRecordingHDExport = async () => {
    return handleStartOfflineRender();
  };

  const cancelHDExport = () => {
    isExportCancelledRef.current = true;
    setIsExporting(false);
    setExportProgress(0);
    setLocalExportTime(0);
  };

  return (
    <div
      className="bg-stone-950 flex flex-col items-center justify-center p-3 lg:p-6 transition-all duration-300 flex-1"
      id="canvas-renderer-root"
    >
      {/* CARD 1: LIVE CANVAS PLAYER */}
      <div
        className="w-full max-w-[760px] bg-stone-900/90 border border-stone-800 rounded-2xl p-4 shadow-xl"
        id="live-canvas-player-card"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-stone-200 uppercase tracking-wider">
            <Film className="w-4 h-4 text-cyan-400" />
            <span>Live Canvas Player</span>
          </div>
          <span className="text-xs font-mono font-bold text-cyan-400">
            {formatDuration(currentTime)} / {formatDuration(totalDuration)}
          </span>
        </div>

        {/* Video Viewport Wrapper */}
        <div
          className={`relative bg-black rounded-xl overflow-hidden shadow-2xl mx-auto group ${
            aspectRatio === "16:9"
              ? "w-full aspect-[16/9]"
              : "w-full aspect-[9/16] max-h-[560px] max-w-[340px]"
          }`}
          id="canvas-viewport-container"
        >
          <div
            onClick={() => {
              if (isPlaying) onTogglePlay();
            }}
            className="w-full h-full cursor-pointer flex items-center justify-center"
          >
            <canvas
              ref={canvasRef}
              width={aspectRatio === "16:9" ? 1280 : 720}
              height={aspectRatio === "16:9" ? 720 : 1280}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Centered Play Button Overlay when paused */}
          {!isPlaying && !isExporting && (
            <button
              type="button"
              onClick={onTogglePlay}
              className="absolute inset-0 m-auto w-16 h-16 bg-blue-600/90 hover:bg-blue-600 active:scale-95 text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-all cursor-pointer z-30"
              title="Putar Preview"
            >
              <Play className="w-8 h-8 fill-white translate-x-0.5" />
            </button>
          )}

          {/* Foreground, motion and cached shadows share the preview/export canvas. */}

          {/* Floating overlays: Export progress overlay */}
          {isExporting && (
            <div className="absolute inset-0 bg-stone-950/95 flex flex-col items-center justify-center space-y-3 z-50 p-6 text-center animate-fade-in">
              <div className="relative">
                <RefreshCw className="w-12 h-12 text-cyan-400 animate-spin" />
                {autoCompressMP4 && (
                  <Zap className="w-5 h-5 text-amber-400 absolute inset-0 m-auto" />
                )}
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white tracking-wide">
                  {autoCompressMP4
                    ? "⚡ Merender & Mengompres MP4 Otomatis..."
                    : "🎬 Sedang Mengompilasi Video..."}
                </h4>
                <p className="text-[11px] text-stone-400">
                  {autoCompressMP4
                    ? `Format: MP4 (H.264) · Resolusi ${exportResolution} · ${compressLevel === "super-hemat" ? "Super Hemat" : compressLevel === "optimal" ? "Optimal Rekap" : compressLevel === "balanced" ? "Seimbang" : "Tinggi"}`
                    : `Format: ${videoCodec.toUpperCase()} · Bitrate: ${videoBitrate}`}
                </p>
              </div>

              <div className="w-72 bg-stone-850 h-2.5 rounded-full overflow-hidden border border-stone-750/50">
                <div
                  className="bg-gradient-to-r from-cyan-400 to-cyan-500 h-full rounded-full transition-all duration-100 shadow-[0_0_12px_rgba(6,182,212,0.6)]"
                  style={{ width: `${exportProgress}%` }}
                ></div>
              </div>

              <div className="flex items-center gap-3 text-xs font-mono">
                <span className="text-cyan-400 font-bold">{exportProgress.toFixed(0)}%</span>
                <span className="text-stone-600">|</span>
                <span className="text-stone-300">Estimasi File: ~{calcEstimatedSizeMB()} MB</span>
                <span className="text-stone-600">|</span>
                <span className="text-emerald-400 font-semibold">
                  {localExportTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
                </span>
              </div>

              <p className="text-[10px] text-stone-500 italic max-w-xs">
                Audio WebAudio & Canvas frame sinkron 1:1 tanpa patah-patah.
              </p>

              <button
                type="button"
                onClick={cancelHDExport}
                className="mt-2 px-4 py-1.5 bg-red-600/20 hover:bg-red-600 border border-red-500/40 hover:border-red-500 text-red-300 hover:text-white rounded text-xs font-bold cursor-pointer transition-all duration-200 shadow-md flex items-center gap-1.5 select-none"
              >
                <Minimize className="w-3.5 h-3.5" />
                Batalkan Render
              </button>
            </div>
          )}
        </div>

        {/* Timeline Scrubber */}
        <div className="w-full mt-3">
          <input
            type="range"
            min="0"
            max={Math.max(0.1, totalDuration)}
            step="0.05"
            value={currentTime}
            onChange={(e) => onUpdateTime(parseFloat(e.target.value))}
            className="w-full h-2 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
        </div>

        {/* Live Canvas Player Controls */}
        <div className="w-full flex items-center justify-between mt-2 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onTogglePlay}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-md active:scale-95"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-white" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-white" />
                  Putar Preview
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (isPlaying) onTogglePlay();
                onUpdateTime(0);
              }}
              className="p-2 bg-stone-850 border border-stone-800 hover:bg-stone-800 text-stone-300 rounded-lg transition-all cursor-pointer shadow-sm active:scale-95"
              title="Putar Ulang dari Awal"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-xs text-stone-400 font-medium">
            Format: <strong className="text-stone-200">{aspectRatio}</strong>
          </span>
        </div>
      </div>

      {/* CARD 2: FORMAT & UKURAN VIDEO */}
      <div
        className="w-full max-w-[760px] bg-stone-900/90 border border-stone-800 rounded-2xl p-4 shadow-xl mt-4"
        id="format-ukuran-video-card"
      >
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300 mb-3">
          Format & Ukuran Video
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {/* 16:9 Landscape */}
          <button
            type="button"
            onClick={() => setAspectRatio("16:9")}
            className={`p-3.5 rounded-xl text-left border-2 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
              aspectRatio === "16:9"
                ? "border-blue-500 bg-blue-950/40 text-blue-300 shadow-md shadow-blue-950/30"
                : "border-stone-800 bg-stone-950/80 text-stone-400 hover:border-stone-700"
            }`}
          >
            <Monitor className="w-5 h-5 text-blue-400" />
            <span className="text-xs font-bold">16:9 Landscape</span>
            <span className="text-[11px] text-stone-400">YouTube (1280x720)</span>
          </button>

          {/* 9:16 Portrait */}
          <button
            type="button"
            onClick={() => setAspectRatio("9:16")}
            className={`p-3.5 rounded-xl text-left border-2 transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
              aspectRatio === "9:16"
                ? "border-blue-500 bg-blue-950/40 text-blue-300 shadow-md shadow-blue-950/30"
                : "border-stone-800 bg-stone-950/80 text-stone-400 hover:border-stone-700"
            }`}
          >
            <Smartphone className="w-5 h-5 text-blue-400" />
            <span className="text-xs font-bold">9:16 Portrait</span>
            <span className="text-[11px] text-stone-400">Shorts/TikTok/Reels</span>
          </button>
        </div>
      </div>

      {/* CARD 3: RENDER & EKSPOR VIDEO */}
      <div
        className="w-full max-w-[760px] bg-stone-900/90 border border-stone-800 rounded-2xl p-4 shadow-xl mt-4"
        id="render-ekspor-video-card"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-300">
            Render & Ekspor Video
          </h3>
          <span
            className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
              autoCompressMP4
                ? "bg-emerald-950/40 text-emerald-400 border-emerald-800/80"
                : "bg-stone-950 text-stone-400 border-stone-800"
            }`}
          >
            {autoCompressMP4 ? "Auto-Kompres MP4 Aktif" : "Kompres Nonaktif"}
          </span>
        </div>

        {/* Auto-kompres toggle row */}
        <div className="p-3 bg-stone-950/80 rounded-xl border border-stone-800 flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-950/50 text-blue-400 rounded-lg">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-stone-200">Auto Kompres ke MP4 (H.264)</h4>
              <p className="text-[11px] text-stone-400">
                Konversi otomatis ke format MP4 mulus & hemat setelah render
              </p>
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            type="button"
            onClick={() => setAutoCompressMP4(!autoCompressMP4)}
            className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ${
              autoCompressMP4 ? "bg-blue-600" : "bg-stone-800"
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                autoCompressMP4 ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Profile compression select */}
        <div className="flex items-center justify-between gap-2 mb-4">
          <label className="text-xs text-stone-400 font-medium">Profil Kompresi:</label>
          <select
            value={crfPreset}
            onChange={(e) => setCrfPreset(e.target.value as any)}
            className="bg-stone-950 border border-stone-800 text-stone-200 text-xs rounded-lg px-3 py-1.5 focus:border-blue-500 outline-none cursor-pointer font-medium"
          >
            <option value="crf23">Tajam (H.264 CRF 23)</option>
            <option value="crf24">Seimbang (H.264 CRF 24 - Rekomendasi)</option>
            <option value="crf26">Super Hemat (H.264 CRF 26)</option>
          </select>
        </div>

        {/* Render Button / Progress Area */}
        {!isExporting ? (
          <button
            type="button"
            onClick={() => handleStartOfflineRender()}
            disabled={panels.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-950/40 transition-all cursor-pointer active:scale-[0.99]"
          >
            <Film className="w-4 h-4" />
            Render & Auto Kompres MP4 (30 FPS)
          </button>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              disabled
              className="w-full bg-blue-950/50 text-blue-300 font-bold py-3.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-wait border border-blue-800/40"
            >
              <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
              {exportStageText ||
                `Tahap 1: Merekam Frame Canvas (${exportProgress.toFixed(0)}%)...`}
            </button>

            {/* Progress Bar */}
            <div className="w-full bg-stone-950 h-2 rounded-full overflow-hidden border border-stone-800">
              <div
                className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-150"
                style={{ width: `${exportProgress}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-stone-400">
              <span>Merekam animasi gerak panel & sinkronisasi audio...</span>
              <span className="font-mono font-bold text-blue-400">
                {exportProgress.toFixed(0)}%
              </span>
            </div>

            <div className="text-right pt-1">
              <button
                type="button"
                onClick={cancelHDExport}
                className="text-xs text-red-400 hover:text-red-300 font-medium cursor-pointer"
              >
                Batalkan Render
              </button>
            </div>
          </div>
        )}

        {/* Render Result Card (Screenshot 2) */}
        {renderResult && !isExporting && (
          <div className="mt-4 p-4 bg-emerald-950/20 border border-emerald-800/60 rounded-2xl space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                <CheckCircle className="w-4 h-4" />
                <span>Video MP4 Siap Diunduh!</span>
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/50 text-emerald-300 font-mono">
                  H.264 • MP4
                </span>
              </div>
              <span className="text-xs font-mono text-emerald-300 font-bold">
                Ukuran: {renderResult.sizeMB} MB
              </span>
            </div>

            {/* Download Button */}
            <a
              href={renderResult.url}
              download={`MangaRecap_${aspectRatio === "16:9" ? "16x9" : "9x16"}_${Date.now()}.mp4`}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Unduh MP4 (.mp4)
            </a>

            {/* Video Preview Player */}
            <div className="relative rounded-xl overflow-hidden bg-black shadow-lg border border-emerald-800/50">
              <video
                src={renderResult.url}
                controls
                playsInline
                className="w-full max-h-[360px] mx-auto object-contain"
              />
            </div>

            {/* Re-compress options */}
            <div className="pt-1">
              <span className="text-[11px] text-stone-400 font-medium block mb-1.5">
                ⚡ Kompres Ulang Preset:
              </span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleStartOfflineRender("crf23")}
                  className="px-2.5 py-1 bg-stone-900 border border-stone-800 hover:border-blue-500 text-stone-300 text-[11px] rounded-lg cursor-pointer transition-all"
                >
                  Tajam (CRF 23)
                </button>
                <button
                  type="button"
                  onClick={() => handleStartOfflineRender("crf24")}
                  className="px-2.5 py-1 bg-stone-900 border border-stone-800 hover:border-blue-500 text-stone-300 text-[11px] rounded-lg cursor-pointer transition-all"
                >
                  Seimbang (CRF 24)
                </button>
                <button
                  type="button"
                  onClick={() => handleStartOfflineRender("crf26")}
                  className="px-2.5 py-1 bg-stone-900 border border-stone-800 hover:border-blue-500 text-stone-300 text-[11px] rounded-lg cursor-pointer transition-all"
                >
                  Super Hemat (CRF 26)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Ketukan Pintar (Interactive Tap-Sync) HUD - Rendered Directly Below the Video Canvas */}
      {activeTab === "ketukan" && (
        <div
          className={`w-full bg-stone-950/95 border border-cyan-500/15 p-4 rounded-xl shadow-[0_4px_35px_rgba(6,182,212,0.06)] mt-6 transition-all duration-300 ${
            isFullscreen ? "max-w-[950px]" : "max-w-[760px]"
          }`}
          id="ketukan-pintar-studio"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-cyan-500/10 pb-3 mb-4">
            <h4 className="text-xs font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-1.5 neon-glow-cyan select-none">
              <Zap className="w-4 h-4 text-cyan-400 animate-pulse" />
              Ketukan Pintar (Interactive Tap-Sync)
            </h4>
            {isSyncing && currentSyncIndex !== null && (
              <span className="text-[10px] text-fuchsia-400 font-mono select-none px-2 py-0.5 bg-fuchsia-500/10 rounded border border-fuchsia-500/20 animate-pulse">
                🔴 Frame {currentSyncIndex + 1} / {panels.length}
              </span>
            )}
          </div>

          {/* 1. Preparation state (Not currently syncing or finished) */}
          {!isSyncing && !tapsCompleted && (
            <div
              className="flex flex-col md:flex-row items-center justify-between gap-6 py-4 px-2"
              id="sync-prep-deck"
            >
              <div className="space-y-2 max-w-xl text-left">
                <p className="text-xs text-stone-350 leading-relaxed font-sans">
                  Selesaikan sinkronisasi naskah dan pergerakan gambar manga secara manual dalam
                  sekejap! Cukup bacakan cerita atau putar rekaman suara di latar, lalu ketuk tombol{" "}
                  <strong className="text-cyan-400">KETUK SEKARANG</strong> atau tekan tombol{" "}
                  <strong className="text-cyan-400">SPASI</strong> di keyboard setiap kali pembicara
                  berpindah kalimat. Durasi perpindahan frame akan disesuaikan dengan ritme aslimu!
                </p>
                <div className="grid grid-cols-2 gap-3 pt-2 text-[11px] font-mono">
                  <div className="p-2 bg-stone-900/40 rounded border border-cyan-500/10">
                    <span className="text-stone-500 block">Frame Target</span>
                    <strong className="text-stone-300">{panels.length} Slide Manga</strong>
                  </div>
                  <div className="p-2 bg-stone-900/40 rounded border border-cyan-500/10">
                    <span className="text-stone-500 block">Sumbu Narasi</span>
                    <span
                      className={
                        narrationAudioUrl ? "text-emerald-400 font-bold" : "text-cyan-400 font-bold"
                      }
                    >
                      {narrationAudioUrl ? "🔊 Audio Aktif" : "🎙️ Pembacaan Langsung (Mute)"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 w-full md:w-auto" id="sync-prep-action">
                {panels.length === 0 ? (
                  <div className="p-3 bg-red-950/20 border border-red-900/30 rounded text-red-400 text-xs text-center max-w-[280px]">
                    ⚠️ Peringatan: Tambahkan setidaknya satu panel manga terlebih dahulu di editor
                    storyboard agar bisa menyelaraskan naskah!
                  </div>
                ) : (
                  <button
                    onClick={onStartSyncSession}
                    className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-400 to-cyan-600 text-stone-950 font-extrabold text-xs uppercase tracking-wider rounded-lg shadow-lg hover:from-cyan-300 hover:to-cyan-500 shadow-cyan-950/20 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Zap className="w-4 h-4 text-stone-950 animate-bounce" />
                    Mulai Penyelarasan
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 2. Active Sync Tapping State */}
          {isSyncing && currentSyncIndex !== null && (
            <div className="flex flex-col gap-5 text-left" id="active-sync-deck">
              {/* Top Row: Giant Tap Area & Main Action Controls */}
              <div className="w-full flex flex-col gap-3">
                <button
                  type="button"
                  onClick={onHandleTap}
                  className="w-full h-36 bg-gradient-to-br from-cyan-500/10 to-indigo-950/25 hover:from-cyan-500/15 border-2 border-cyan-500/30 hover:border-cyan-400 rounded-xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-[0.98] group relative overflow-hidden shadow-lg shadow-cyan-950/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                  id="smart-tapping-trigger-pad"
                >
                  <div className="absolute inset-0 bg-cyan-500/5 duration-1000 animate-ping rounded-full pointer-events-none scale-75"></div>

                  <div className="p-2 bg-stone-900 rounded-full border border-cyan-500/20 group-hover:border-cyan-400/40 transition-colors flex items-center justify-center">
                    <Zap className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform animate-pulse" />
                  </div>

                  <span className="text-xs font-black uppercase tracking-widest text-cyan-400 neon-glow-cyan">
                    KETUK SEKARANG
                  </span>

                  <span className="text-[10px] text-stone-500 bg-stone-950 px-2.5 py-0.5 rounded-full border border-stone-900/60">
                    atau tekan tombol <strong className="text-cyan-400 font-bold">SPASI</strong> di
                    keyboard
                  </span>
                </button>

                {/* Play/Pause & Undo Button row + Cancel Option */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
                  <button
                    type="button"
                    onClick={onTogglePlay}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all border shadow-md cursor-pointer ${
                      isPlaying
                        ? "bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/20 text-amber-400"
                        : "bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                        Jeda Suara
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-emerald-400" />
                        Putar / Retake
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onHandleUndo}
                    disabled={tapHistory.length === 0}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg font-bold text-[11px] uppercase tracking-wider transition-all border shadow-md ${
                      tapHistory.length === 0
                        ? "bg-stone-900/40 text-stone-600 border-stone-950/60 cursor-not-allowed opacity-40"
                        : "bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20 hover:border-orange-400/30 cursor-pointer shadow-orange-950/10"
                    }`}
                    id="undo-tap-btn"
                  >
                    <Undo className="w-3.5 h-3.5" />
                    Batal Ketuk
                  </button>

                  <button
                    type="button"
                    onClick={onCancelSyncSession}
                    className="py-2.5 px-3 bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-stone-200 border border-stone-800 text-[11px] font-bold uppercase rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    Gagalkan Sesi
                  </button>
                </div>
              </div>

              {/* Bottom Row: Info / Status & Scripts in a 2-Column Responsive Grid */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-5 w-full pt-4 border-t border-stone-900">
                {/* Left Column (Span 6): Active Segment Bubble & Counters */}
                <div className="md:col-span-6 flex flex-col gap-3 min-w-0">
                  <div className="p-3.5 bg-stone-900/80 border border-cyan-500/20 rounded-lg text-left relative space-y-2.5 shadow-inner">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="uppercase font-bold tracking-widest text-cyan-400 flex items-center gap-1 neon-glow-cyan">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping"></span>
                        Sedang Ditandai (Frame #{currentSyncIndex + 1} / {panels.length})
                      </span>
                      <span className="text-stone-500 font-mono">
                        Cap Awal: {lastTapTime.toFixed(1)}s
                      </span>
                    </div>

                    {/* Large subtitle display */}
                    <div className="text-xs font-semibold text-stone-250 leading-relaxed font-sans border-l-2 border-cyan-400 pl-3 py-1 bg-stone-950/40 rounded">
                      "{panels[currentSyncIndex]?.subtitle || "Tidak ada subtitle/dialog..."}"
                    </div>

                    <span className="text-[10px] text-stone-500 block italic">
                      Objek Bidik:{" "}
                      <strong className="text-stone-400 font-normal">
                        {panels[currentSyncIndex]?.focusGuide || "Umum"}
                      </strong>
                    </span>
                  </div>

                  {/* Timer counters */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-stone-500 px-1 pt-1 border-t border-stone-900/40">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                      <span>
                        Waktu Tempuh:{" "}
                        <strong className="text-stone-300">{currentTime.toFixed(1)}s</strong>
                      </span>
                    </div>
                    <div>
                      <span>
                        Selisih Rekor:{" "}
                        <strong className="text-cyan-400 font-medium">
                          {(currentTime - lastTapTime).toFixed(1)}s
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Column (Span 6): Upcoming Queue List */}
                <div className="md:col-span-6 space-y-2 text-left flex flex-col justify-start min-w-0">
                  <span className="block text-[10px] uppercase font-bold tracking-wider text-stone-500">
                    Naskah Antrean Berikutnya:
                  </span>
                  {currentSyncIndex === panels.length - 1 ? (
                    <div className="p-3 border border-dashed border-cyan-500/20 bg-stone-900/10 text-[11px] text-stone-600 rounded flex-1 flex items-center justify-center">
                      🔚 Ini adalah baris naskah terakhir! Ketukan berikutnya akan menyelesaikan
                      penyelarasan.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-[110px] overflow-y-auto flex-1">
                      {panels
                        .slice(currentSyncIndex + 1, currentSyncIndex + 3)
                        .map((pNext, idxNext) => (
                          <div
                            key={pNext.id}
                            className="p-2 bg-stone-900/30 border border-stone-900 rounded opacity-50 hover:opacity-75 transition-opacity text-xs flex gap-2.5 items-center justify-between"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[9px] font-mono bg-stone-950 font-bold px-1.5 py-0.5 rounded text-stone-500 border border-cyan-500/10 flex-shrink-0">
                                #{currentSyncIndex + idxNext + 2}
                              </span>
                              <span className="truncate text-stone-400 font-mono italic">
                                "{pNext.subtitle || "Tidak ada teks"}"
                              </span>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. Taps Completed Successful Review state */}
          {tapsCompleted && (
            <div className="text-center py-4 space-y-4 max-w-lg mx-auto" id="sync-success-board">
              <div className="flex flex-col items-center gap-1.5">
                <div className="p-2.5 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-emerald-400 animate-bounce">
                  <CheckCircle className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-emerald-400 uppercase tracking-wider">
                  Sumbu Waktu Berhasil Disinkronkan!
                </h4>
                <p className="text-xs text-stone-400 font-sans leading-normal">
                  Penyadapan selesai! Seluruh {panels.length} panel storyboard Anda sekarang telah
                  dikalibrasi durasinya dengan sangat mulus berdasarkan rekam manual Anda.
                </p>
              </div>

              {/* Grid timings overview */}
              <div className="bg-stone-900/40 p-2 text-stone-400 rounded border border-cyan-500/10">
                <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 text-left">
                  {panels.map((p, idx) => (
                    <div
                      key={p.id}
                      className="p-1.5 bg-stone-950 rounded text-[10px] font-mono border border-cyan-500/10 flex flex-col justify-between"
                    >
                      <span className="text-cyan-400 font-bold">Slide #{idx + 1}</span>
                      <strong className="text-stone-300 text-[11px] mt-0.5">
                        {p.duration.toFixed(1)} detik
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
                {/* 1. Playaligned button */}
                <button
                  onClick={() => {
                    if (onSetTapsCompleted) onSetTapsCompleted(false);
                    onUpdateTime(0);
                    if (!isPlaying) {
                      onTogglePlay();
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-stone-950 font-bold text-xs rounded transition-all cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                >
                  <Play className="w-3.5 h-3.5 fill-stone-950" />
                  Putar Hasil Sinkronisasi
                </button>

                {/* 2. Redo Sync */}
                <button
                  onClick={() => {
                    if (onSetTapsCompleted) onSetTapsCompleted(false);
                    if (onStartSyncSession) onStartSyncSession();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-stone-900 hover:bg-stone-850 text-stone-300 border border-stone-850 text-xs rounded transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-stone-400" />
                  Ulangi Sesi
                </button>

                {/* 3. Close */}
                <button
                  onClick={() => {
                    if (onSetTapsCompleted) onSetTapsCompleted(false);
                  }}
                  className="flex items-center gap-1 px-3.5 py-2 bg-stone-950 hover:bg-stone-900 text-stone-500 hover:text-stone-350 text-xs rounded border border-stone-900 transition-all cursor-pointer"
                >
                  Selesai
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cubit & Geser Workspace HUD - Rendered Directly Below the Video Canvas for perfect mobile real-time viewing */}
      {activeTab === "cubit" && (
        <div
          className={`w-full bg-stone-950/95 border border-cyan-500/15 p-3 rounded-xl shadow-[0_4px_35px_rgba(6,182,212,0.06)] mt-4 transition-all duration-300 ${
            isFullscreen ? "max-w-[950px]" : "max-w-[760px]"
          }`}
          id="cubit-geser-studio"
        >
          {/* Compact Category Selector Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 pb-2.5 mb-3">
            <div className="flex gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedCubitCategory("vertical")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  selectedCubitCategory === "vertical"
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 neon-glow-cyan"
                    : "bg-stone-900/60 text-stone-400 border border-transparent hover:text-stone-200 hover:bg-stone-850"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                📱 Vertikal
              </button>

              <button
                type="button"
                onClick={() => setSelectedCubitCategory("horizontal")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  selectedCubitCategory === "horizontal"
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 neon-glow-cyan"
                    : "bg-stone-900/60 text-stone-400 border border-transparent hover:text-stone-200 hover:bg-stone-850"
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                🖥️ Horizontal
              </button>

              <button
                type="button"
                onClick={() => setSelectedCubitCategory("square")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  selectedCubitCategory === "square"
                    ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 neon-glow-cyan"
                    : "bg-stone-900/60 text-stone-400 border border-transparent hover:text-stone-200 hover:bg-stone-850"
                }`}
              >
                <Maximize className="w-3.5 h-3.5" />
                ⏹️ Square
              </button>

              <button
                type="button"
                onClick={onTogglePlay}
                disabled={panels.length === 0}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                  isPlaying
                    ? "bg-red-600/25 hover:bg-red-600/35 text-red-400 border border-red-500/30 animate-pulse"
                    : "bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/30"
                }`}
                title={isPlaying ? "Jeda Pratinjau Video" : "Putar Pratinjau Video"}
              >
                {isPlaying ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-red-400" />
                    Jeda Video
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-400" />
                    Putar Video
                  </>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (selectedCubitCategory === "vertical") {
                  setVerticalConfig({
                    initialScale: 1.15,
                    zoomSpeed: 0.05,
                    offsetX: 0,
                    offsetY: 0,
                  });
                } else if (selectedCubitCategory === "horizontal") {
                  setHorizontalConfig({
                    initialScale: 0.78,
                    zoomSpeed: 0.06,
                    offsetX: 0,
                    offsetY: 0,
                  });
                } else {
                  setSquareConfig({ initialScale: 0.78, zoomSpeed: 0.06, offsetX: 0, offsetY: 0 });
                }
              }}
              className="px-2.5 py-1 bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-cyan-400 border border-stone-800 text-[10px] font-bold uppercase rounded transition-all cursor-pointer shadow-sm active:scale-95"
            >
              Reset Aktif
            </button>
          </div>

          <div className="w-full">
            {/* Kategori 1: Vertikal */}
            {selectedCubitCategory === "vertical" && (
              <div className="p-3 bg-stone-900/30 rounded-lg border border-cyan-500/5 hover:border-cyan-500/10 transition-all flex flex-col justify-between animate-fade-in">
                <div>
                  <div className="flex items-center justify-between border-b border-stone-800 pb-1.5 mb-2 select-none">
                    <span className="text-xs font-bold text-stone-250 flex items-center gap-1.5 uppercase">
                      <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
                      📱 Gambar Vertikal
                    </span>
                    <span className="text-[9px] text-cyan-500 font-mono font-semibold">
                      Rasio &lt; 0.9
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Skala Awal */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Skala Awal (Zoom)</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {verticalConfig.initialScale.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3.0"
                        step="0.01"
                        value={verticalConfig.initialScale}
                        onChange={(e) =>
                          setVerticalConfig({
                            ...verticalConfig,
                            initialScale: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Pergerakan Zoom */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Gerak Zoom Animasi</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {verticalConfig.zoomSpeed >= 0 ? "+" : ""}
                          {verticalConfig.zoomSpeed.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.5"
                        step="0.01"
                        value={verticalConfig.zoomSpeed}
                        onChange={(e) =>
                          setVerticalConfig({
                            ...verticalConfig,
                            zoomSpeed: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser X */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Horizontal (X)</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {verticalConfig.offsetX}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={verticalConfig.offsetX}
                        onChange={(e) =>
                          setVerticalConfig({
                            ...verticalConfig,
                            offsetX: parseInt(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser Y */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Vertikal (Y)</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {verticalConfig.offsetY}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={verticalConfig.offsetY}
                        onChange={(e) =>
                          setVerticalConfig({
                            ...verticalConfig,
                            offsetY: parseInt(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Kategori 2: Horizontal */}
            {selectedCubitCategory === "horizontal" && (
              <div className="p-3 bg-stone-900/30 rounded-lg border border-cyan-500/5 hover:border-cyan-500/10 transition-all flex flex-col justify-between animate-fade-in">
                <div>
                  <div className="flex items-center justify-between border-b border-stone-800 pb-1.5 mb-2 select-none">
                    <span className="text-xs font-bold text-stone-250 flex items-center gap-1.5 uppercase">
                      <Monitor className="w-3.5 h-3.5 text-cyan-400" />
                      🖥️ Gambar Horizontal
                    </span>
                    <span className="text-[9px] text-cyan-500 font-mono font-semibold">
                      Rasio &gt; 1.1
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Skala Awal */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Skala Awal (Zoom)</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {horizontalConfig.initialScale.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3.0"
                        step="0.01"
                        value={horizontalConfig.initialScale}
                        onChange={(e) =>
                          setHorizontalConfig({
                            ...horizontalConfig,
                            initialScale: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Pergerakan Zoom */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Gerak Zoom Animasi</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {horizontalConfig.zoomSpeed >= 0 ? "+" : ""}
                          {horizontalConfig.zoomSpeed.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.5"
                        step="0.01"
                        value={horizontalConfig.zoomSpeed}
                        onChange={(e) =>
                          setHorizontalConfig({
                            ...horizontalConfig,
                            zoomSpeed: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser X */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Horizontal (X)</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {horizontalConfig.offsetX}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={horizontalConfig.offsetX}
                        onChange={(e) =>
                          setHorizontalConfig({
                            ...horizontalConfig,
                            offsetX: parseInt(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser Y */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Vertikal (Y)</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {horizontalConfig.offsetY}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={horizontalConfig.offsetY}
                        onChange={(e) =>
                          setHorizontalConfig({
                            ...horizontalConfig,
                            offsetY: parseInt(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Kategori 3: Square */}
            {selectedCubitCategory === "square" && (
              <div className="p-3 bg-stone-900/30 rounded-lg border border-cyan-500/5 hover:border-cyan-500/10 transition-all flex flex-col justify-between animate-fade-in">
                <div>
                  <div className="flex items-center justify-between border-b border-stone-800 pb-1.5 mb-2 select-none">
                    <span className="text-xs font-bold text-stone-250 flex items-center gap-1.5 uppercase">
                      <Maximize className="w-3.5 h-3.5 text-cyan-400" />
                      ⏹️ Gambar Square
                    </span>
                    <span className="text-[9px] text-cyan-500 font-mono font-semibold">
                      Rasio 0.9 s/d 1.1
                    </span>
                  </div>

                  <div className="space-y-3">
                    {/* Skala Awal */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Skala Awal (Zoom)</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {squareConfig.initialScale.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="3.0"
                        step="0.01"
                        value={squareConfig.initialScale}
                        onChange={(e) =>
                          setSquareConfig({
                            ...squareConfig,
                            initialScale: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Pergerakan Zoom */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Gerak Zoom Animasi</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {squareConfig.zoomSpeed >= 0 ? "+" : ""}
                          {squareConfig.zoomSpeed.toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.5"
                        step="0.01"
                        value={squareConfig.zoomSpeed}
                        onChange={(e) =>
                          setSquareConfig({
                            ...squareConfig,
                            zoomSpeed: parseFloat(e.target.value),
                          })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser X */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Horizontal (X)</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {squareConfig.offsetX}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={squareConfig.offsetX}
                        onChange={(e) =>
                          setSquareConfig({ ...squareConfig, offsetX: parseInt(e.target.value) })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>

                    {/* Geser Y */}
                    <div>
                      <div className="flex justify-between text-[10px] mb-1 select-none">
                        <span className="text-stone-400">Geser Vertikal (Y)</span>
                        <span className="text-cyan-400 font-bold font-mono">
                          {squareConfig.offsetY}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        value={squareConfig.offsetY}
                        onChange={(e) =>
                          setSquareConfig({ ...squareConfig, offsetY: parseInt(e.target.value) })
                        }
                        className="w-full h-1.5 bg-stone-900 rounded-lg appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Background Controller */}
      <div className="w-full max-w-[760px] flex flex-col gap-3 p-3 bg-stone-900/60 border border-stone-800 rounded-xl text-xs mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-stone-400 font-semibold uppercase tracking-wider text-[11px]">
            Gaya Latar Belakang:
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {BACKGROUND_CHOICES.map(({ value: bg, label }) => (
              <Button
                key={bg}
                type="button"
                onClick={() => setBgStyle(bg)}
                aria-pressed={bgStyle === bg}
                size="sm"
                variant={bgStyle === bg ? "default" : "secondary"}
                className={`px-2.5 py-1 rounded text-xs capitalize transition-all cursor-pointer ${
                  bgStyle === bg
                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                    : "bg-secondary text-secondary-foreground border border-border hover:bg-accent"
                }`}
              >
                {label}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              aria-pressed={bgStyle === "custom"}
              onClick={() => {
                setBgStyle("custom");
                document.getElementById("custom-bg-uploader")?.click();
              }}
              className={`px-2.5 py-1 rounded text-xs transition-all cursor-pointer ${
                bgStyle === "custom"
                  ? "bg-primary text-primary-foreground font-bold shadow-sm"
                  : "bg-secondary text-secondary-foreground border border-border hover:bg-accent"
              }`}
            >
              Kustom {customBgUrl && "✓"}
            </Button>
            <input
              type="file"
              id="custom-bg-uploader"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    if (event.target?.result) {
                      const urlStr = event.target.result as string;
                      setCustomBgUrl(urlStr);
                      try {
                        localStorage.setItem("manga_recap_custom_bg_url", urlStr);
                      } catch {
                        console.warn(
                          "Latar terlalu besar untuk disimpan; tetap tersedia untuk render sesi ini.",
                        );
                      }
                      setBgStyle("custom");
                    }
                  };
                  reader.readAsDataURL(file);
                }
              }}
            />
          </div>
        </div>

        {/* Filter Bergerak Kertas Options (visible when kertas, putih, or cream is chosen) */}
        {(bgStyle === "kertas" || bgStyle === "putih" || bgStyle === "cream") && (
          <div className="pt-2.5 border-t border-stone-800/80 flex flex-col gap-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-stone-200">
                  Filter Bergerak{" "}
                  {bgStyle === "kertas"
                    ? "Kertas Kusut"
                    : bgStyle === "putih"
                      ? "Kertas Putih"
                      : "Kertas Cream"}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${
                    paperMotion.enabled && paperMotion.style !== "statis"
                      ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                      : "bg-stone-800 text-stone-400 border-stone-700"
                  }`}
                >
                  {paperMotion.enabled && paperMotion.style !== "statis"
                    ? "● Aktif Bergerak"
                    : "○ Statis (Diam)"}
                </span>
              </div>

              {/* Toggle Switch */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-stone-400">Gerakan:</span>
                <button
                  type="button"
                  onClick={() =>
                    setPaperMotion((prev) => ({
                      ...prev,
                      enabled: !prev.enabled,
                      style: !prev.enabled && prev.style === "statis" ? "halus-lambat" : prev.style,
                    }))
                  }
                  className={`w-10 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-colors ${
                    paperMotion.enabled && paperMotion.style !== "statis"
                      ? "bg-amber-500"
                      : "bg-stone-800"
                  }`}
                  title={paperMotion.enabled ? "Matikan gerak kertas" : "Aktifkan gerak kertas"}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                      paperMotion.enabled && paperMotion.style !== "statis"
                        ? "translate-x-5"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </div>

            {paperMotion.enabled && (
              <div className="space-y-2.5 pt-1">
                {/* Gaya Gerak Pill Selection */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-stone-400 font-medium mr-1">Gaya Gerak:</span>
                  {PAPER_MOTION_STYLES.map((st) => (
                    <button
                      key={st.value}
                      type="button"
                      onClick={() =>
                        setPaperMotion((prev) => ({
                          ...prev,
                          style: st.value,
                          enabled: st.value !== "statis",
                        }))
                      }
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all cursor-pointer flex items-center gap-1 ${
                        paperMotion.style === st.value
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm font-bold"
                          : "bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800"
                      }`}
                      title={st.desc}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>

                {/* Baris Kontrol: Kecepatan Gerak & Ketebalan Tekstur */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-[11px] border-t border-stone-850/80">
                  {/* Kecepatan Gerak */}
                  <div className="flex items-center justify-between gap-1 bg-stone-900/40 p-1.5 rounded-lg border border-stone-800">
                    <span className="text-stone-400 font-medium">Kecepatan:</span>
                    <div className="flex items-center gap-1">
                      {[
                        { label: "Sangat Lambat (0.4x)", val: 0.4 },
                        { label: "Lambat (0.6x)", val: 0.6 },
                        { label: "Sedang (1.0x)", val: 1.0 },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() =>
                            setPaperMotion((prev) => ({
                              ...prev,
                              speed: item.val,
                            }))
                          }
                          className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                            Math.abs(paperMotion.speed - item.val) < 0.1
                              ? "bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold"
                              : "bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ketebalan Tekstur */}
                  <div className="flex items-center justify-between gap-1 bg-stone-900/40 p-1.5 rounded-lg border border-stone-800">
                    <span className="text-stone-400 font-medium">Ketebalan:</span>
                    <div className="flex items-center gap-1">
                      {[
                        { label: "Tipis (25%)", val: 0.25 },
                        { label: "Halus (38%)", val: 0.38 },
                        { label: "Sedang (55%)", val: 0.55 },
                      ].map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() =>
                            setPaperMotion((prev) => ({
                              ...prev,
                              intensity: item.val,
                            }))
                          }
                          className={`px-2 py-0.5 rounded text-[10px] font-mono transition-all cursor-pointer ${
                            Math.abs(paperMotion.intensity - item.val) < 0.05
                              ? "bg-blue-600/30 text-blue-300 border border-blue-500/40 font-bold"
                              : "bg-stone-900 text-stone-400 hover:text-stone-200 border border-stone-800"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[10px] text-stone-400 pt-0.5">
                  <span className="italic flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    Tekstur kertas putih halus &amp; gerakan lambat menenangkan
                  </span>
                  <span className="italic flex items-center gap-1">
                    <Film className="w-3 h-3 text-cyan-400" />
                    Sinkron Live Player &amp; Ekspor GPU MP4
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
