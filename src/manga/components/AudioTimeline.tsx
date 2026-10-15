// @ts-nocheck
import React, { useState, useRef, useEffect } from "react";
import { MangaPanel } from "../types";
import {
  Mic,
  Pause,
  Play,
  Upload,
  Zap,
  CheckCircle,
  RefreshCw,
  XCircle,
  Sparkles,
  Undo,
  Maximize,
  Smartphone,
  Monitor,
  Clock,
  ChevronDown,
  Check,
  Volume2,
  X,
  FileText,
} from "lucide-react";
import { autoSyncPanelsToAudio } from "../utils/audioScriptSync";

interface AudioTimelineProps {
  panels: MangaPanel[];
  narrationAudioUrl: string | null;
  onUploadNarration: (file: File) => void;
  onClearNarration: () => void;
  backsoundUrl?: string | null;
  backsoundName?: string;
  backsoundVolume?: number;
  onSetBacksoundVolume?: (v: number) => void;
  onUploadBacksound?: (file: File) => void;
  onClearBacksound?: () => void;
  isPlaying: boolean;
  onTogglePlay: () => void;
  currentTime: number;
  onSeek: (time: number) => void;
  isTappingMode: boolean;
  onSetTappingMode: (active: boolean) => void;
  currentSyncIndex: number | null;
  onSetCurrentSyncIndex: (index: number | null) => void;
  onUpdatePanel: (id: string, updates: Partial<MangaPanel>) => void;

  // Shared active tapping sync states & functions
  activeTab: "auto-sync" | "standard" | "cubit" | "ketukan";
  onSetActiveTab: (tab: "auto-sync" | "standard" | "cubit" | "ketukan") => void;
  isSyncing: boolean;
  tapsCompleted: boolean;
  lastTapTime: number;
  tapHistory: { lastTapTime: number; syncIndex: number }[];
  onStartSyncSession: () => void;
  onCancelSyncSession: () => void;
  onHandleTap: () => void;
  onHandleUndo: () => void;
  onSetTapsCompleted: (val: boolean) => void;

  // Pinch & Pan Configurations
  verticalConfig: any;
  setVerticalConfig: (cfg: any) => void;
  horizontalConfig: any;
  setHorizontalConfig: (cfg: any) => void;
  squareConfig: any;
  setSquareConfig: (cfg: any) => void;
}

export const AudioTimeline: React.FC<AudioTimelineProps> = ({
  panels,
  narrationAudioUrl,
  onUploadNarration,
  onClearNarration,
  backsoundUrl = null,
  backsoundName = "",
  backsoundVolume = 0.2,
  onSetBacksoundVolume,
  onUploadBacksound,
  onClearBacksound,
  isPlaying,
  onTogglePlay,
  currentTime,
  onSeek,
  isTappingMode,
  onSetTappingMode,
  currentSyncIndex,
  onSetCurrentSyncIndex,
  onUpdatePanel,
  activeTab,
  onSetActiveTab,
  isSyncing,
  tapsCompleted,
  lastTapTime,
  tapHistory,
  onStartSyncSession,
  onCancelSyncSession,
  onHandleTap,
  onHandleUndo,
  onSetTapsCompleted,
  verticalConfig,
  setVerticalConfig,
  horizontalConfig,
  setHorizontalConfig,
  squareConfig,
  setSquareConfig,
}) => {
  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordedDuration, setRecordedDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<any>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalDuration = panels.reduce((acc, p) => acc + p.duration, 0);

  // Audio duration detection
  const [audioDuration, setAudioDuration] = useState<number>(0);

  useEffect(() => {
    if (narrationAudioUrl) {
      const a = new Audio(narrationAudioUrl);
      a.onloadedmetadata = () => {
        if (a.duration && !isNaN(a.duration)) {
          setAudioDuration(a.duration);
        }
      };
    } else {
      setAudioDuration(0);
    }
  }, [narrationAudioUrl]);

  // Audio Snippet (Slice) Player State
  const sliceAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playingPanelId, setPlayingPanelId] = useState<string | null>(null);
  const sliceTimeoutRef = useRef<any>(null);

  // Auto Sync (AI Audio Alignment) States
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [rawScriptText, setRawScriptText] = useState("");
  const [modelMode, setModelMode] = useState<"small" | "gemini" | "base">("small");
  const [narrationLang, setNarrationLang] = useState<string>("id");
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);

  // Link hoisted states to local bindings within AudioTimeline
  const setActiveTab = onSetActiveTab;
  const startSyncSession = onStartSyncSession;
  const cancelSyncSession = onCancelSyncSession;
  const handleTap = onHandleTap;
  const handleUndo = onHandleUndo;
  const setTapsCompleted = onSetTapsCompleted;

  // Cleanup snippet audio on unmount
  useEffect(() => {
    return () => {
      if (sliceAudioRef.current) {
        sliceAudioRef.current.pause();
      }
      if (sliceTimeoutRef.current) {
        clearTimeout(sliceTimeoutRef.current);
      }
    };
  }, []);

  // Format MM:SS.s helper
  const formatDuration = (sec: number): string => {
    if (!sec || isNaN(sec) || sec <= 0) return "0:00.0";
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${m}:${s.padStart(4, "0")}`;
  };

  // Play a specific panel's audio slice based on its cumulative timestamp
  const playPanelSlice = (panelIndex: number) => {
    if (!narrationAudioUrl) {
      alert("Unggah audio narasi terlebih dahulu untuk mendengarkan potongan suara.");
      return;
    }
    const panel = panels[panelIndex];
    if (!panel) return;

    if (playingPanelId === panel.id) {
      // Toggle pause if already playing this slice
      if (sliceAudioRef.current) {
        sliceAudioRef.current.pause();
      }
      clearTimeout(sliceTimeoutRef.current);
      setPlayingPanelId(null);
      return;
    }

    // Calculate start time based on accumulated duration of preceding panels
    let startTime = 0;
    for (let i = 0; i < panelIndex; i++) {
      startTime += panels[i].duration;
    }
    const sliceDur = panel.duration;

    if (!sliceAudioRef.current) {
      sliceAudioRef.current = new Audio(narrationAudioUrl);
    } else {
      sliceAudioRef.current.src = narrationAudioUrl;
    }

    const audio = sliceAudioRef.current;
    audio.currentTime = startTime;
    audio
      .play()
      .then(() => {
        setPlayingPanelId(panel.id);
        clearTimeout(sliceTimeoutRef.current);
        sliceTimeoutRef.current = setTimeout(() => {
          audio.pause();
          setPlayingPanelId(null);
        }, sliceDur * 1000);
      })
      .catch((err) => {
        console.warn("Playback error:", err);
        setPlayingPanelId(null);
      });
  };

  // Fast Client-Side Audio Alignment (Tanpa Konsumsi API Key, Cepat & Akurat)
  const runAutoSync = async () => {
    if (!narrationAudioUrl) {
      alert(
        "Unggah atau rekam file audio narasi terlebih dahulu agar sistem dapat mencocokkan durasi dengan naskah.",
      );
      return;
    }
    if (panels.length === 0) {
      alert("Tambahkan gambar panel manga terlebih dahulu di storyboard.");
      return;
    }

    setIsAnalyzingAudio(true);
    setSyncProgress(15);

    try {
      setSyncProgress(40);
      const res = await autoSyncPanelsToAudio(narrationAudioUrl, panels, rawScriptText);
      setSyncProgress(85);

      res.updatedPanels.forEach((up) => {
        onUpdatePanel(up.id, { duration: up.duration });
      });

      setAudioDuration(res.totalAudioDuration);
      setSyncProgress(100);
      setTimeout(() => {
        setIsAnalyzingAudio(false);
        setSyncProgress(0);
      }, 350);
      return;
    } catch (err: any) {
      console.error("Auto Sync error:", err);
      distributeEqually();
      setIsAnalyzingAudio(false);
      setSyncProgress(0);
      return;
    }
  };

  // Divide total audio length evenly across all panels
  const distributeEqually = () => {
    if (panels.length === 0) return;
    const targetTotal = audioDuration > 0 ? audioDuration : totalDuration;
    const perPanel = parseFloat((targetTotal / panels.length).toFixed(1));
    let accumulated = 0;

    panels.forEach((p, idx) => {
      if (idx === panels.length - 1) {
        const lastDur = parseFloat(Math.max(1.0, targetTotal - accumulated).toFixed(1));
        onUpdatePanel(p.id, { duration: lastDur });
      } else {
        onUpdatePanel(p.id, { duration: perPanel });
        accumulated += perPanel;
      }
    });
  };

  // Microphone recording
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert("Perekam mikrofon tidak didukung di browser ini.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        const file = new File([audioBlob], "voiceover-native.wav", { type: "audio/wav" });
        onUploadNarration(file);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordedDuration(0);
      recordIntervalRef.current = setInterval(() => {
        setRecordedDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      alert("Gagal mengakses mikrofon: " + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      try {
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      } catch (e) {}
      clearInterval(recordIntervalRef.current);
      setIsRecording(false);
    }
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadNarration(e.target.files[0]);
    }
  };

  const triggerAudioFileInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    } else {
      const el = document.getElementById("global-audio-narration-input") as HTMLInputElement;
      if (el) {
        el.value = "";
        el.click();
      }
    }
  };

  return (
    <div
      className="bg-stone-950 border-t border-cyan-500/10 p-3 md:p-5 space-y-4 text-stone-100"
      id="audio-timeline-root"
    >
      {/* Unconditional Always-Mounted File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAudioUpload}
        accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.webm"
        className="hidden"
        id="global-audio-narration-input"
      />

      {/* Dynamic Tab Switcher */}
      <div
        className="flex flex-wrap items-center border-b border-cyan-500/10 pb-1.5 gap-2"
        id="timeline-tabs-header"
      >
        <button
          type="button"
          onClick={() => setActiveTab("auto-sync")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === "auto-sync"
              ? "border-cyan-400 text-cyan-400 font-semibold neon-glow-cyan"
              : "border-transparent text-stone-500 hover:text-stone-300"
          }`}
          id="tab-auto-sync"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          Sync Otomatis (AI)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("standard")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === "standard"
              ? "border-cyan-400 text-cyan-400 font-semibold neon-glow-cyan"
              : "border-transparent text-stone-500 hover:text-stone-300"
          }`}
          id="tab-edit-manual"
        >
          🎚️ Narasi & Rekam
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("cubit")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeTab === "cubit"
              ? "border-cyan-400 text-cyan-400 font-semibold neon-glow-cyan"
              : "border-transparent text-stone-500 hover:text-stone-300"
          }`}
          id="tab-edit-cubit"
        >
          🔍 Cubit & Geser
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ketukan")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer relative ${
            activeTab === "ketukan"
              ? "border-cyan-400 text-cyan-400 font-semibold neon-glow-cyan"
              : "border-transparent text-stone-500 hover:text-stone-300"
          }`}
          id="tab-ketukan-pintar"
        >
          ⚡ Ketukan Pintar
        </button>
      </div>

      {/* 1. SYNC OTOMATIS (AI AUDIO ALIGNMENT) VIEW - EXACTLY MATCHING USER SCREENSHOTS */}
      {activeTab === "auto-sync" && (
        <div className="space-y-4 max-w-4xl animate-fade-in" id="auto-sync-container">
          {/* Card 1: AI Audio Alignment Header Card */}
          <div className="bg-stone-900/60 p-4 md:p-5 rounded-2xl border border-stone-800 shadow-xl space-y-4">
            {/* Header: Title and Mode Badge */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800/80 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-blue-400 fill-blue-400/20" />
                <h3 className="text-sm md:text-base font-bold text-white tracking-wide">
                  Sync Otomatis (AI Audio Alignment)
                </h3>
              </div>
              <span className="text-[10px] md:text-xs font-medium text-stone-300 bg-stone-950/80 px-3 py-1 rounded-full border border-stone-800">
                Mode Mandiri (Client-Side Rendering)
              </span>
            </div>

            {/* Description */}
            <p className="text-xs text-stone-400 leading-relaxed">
              Audio akan dicocokkan dengan tiap paragraf naskah secara presisi sehingga durasi tiap
              gambar panel terisi otomatis tanpa perlu edit manual.
            </p>

            {/* Form Fields: Bahasa Narasi & Mode Model */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-1">
              {/* Bahasa Narasi */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-stone-400 block">
                  Bahasa Narasi
                </label>
                <div className="relative">
                  <select
                    value={narrationLang}
                    onChange={(e) => setNarrationLang(e.target.value)}
                    className="w-full bg-stone-950 border border-stone-800 hover:border-stone-700 text-stone-200 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:border-blue-500 transition-all cursor-pointer font-medium appearance-none"
                  >
                    <option value="id">Bahasa Indonesia</option>
                    <option value="en">English (US/UK)</option>
                    <option value="ja">日本語 (Japanese)</option>
                  </select>
                  <ChevronDown className="w-4 h-4 text-stone-500 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Mode Model */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-stone-400 block">Mode Model</label>
                <button
                  type="button"
                  onClick={() => setIsModelModalOpen(true)}
                  className="w-full flex items-center justify-between bg-stone-950 border border-stone-800 hover:border-stone-700 text-stone-200 text-xs rounded-xl px-3.5 py-2.5 outline-none focus:border-blue-500 transition-all cursor-pointer font-medium text-left"
                >
                  <span>
                    {modelMode === "small"
                      ? "Small (Cepat & Akurat)"
                      : modelMode === "gemini"
                        ? "Gemini AI Engine (Direkomendasikan)"
                        : "Base (Ekstra Cepat)"}
                  </span>
                  <ChevronDown className="w-4 h-4 text-stone-500" />
                </button>
              </div>
            </div>

            {/* Audio Narasi Upload & Management Section */}
            {!narrationAudioUrl ? (
              <div
                onClick={triggerAudioFileInput}
                className="p-4 bg-stone-950/80 border-2 border-dashed border-stone-800 hover:border-blue-500 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs transition-all cursor-pointer group shadow-inner"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-950/60 text-blue-400 rounded-xl border border-blue-900/50 group-hover:scale-105 transition-transform">
                    <Upload className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="text-left">
                    <h4 className="font-bold text-white text-xs">Unggah File Audio Narasi</h4>
                    <p className="text-[11px] text-stone-400">
                      Pilih file suara / naskah (.mp3, .wav, .m4a, .aac) dari perangkat
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerAudioFileInput();
                  }}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Pilih Audio
                </button>
              </div>
            ) : (
              <div className="p-3 bg-emerald-950/20 border border-emerald-800/60 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 bg-emerald-950/60 text-emerald-400 rounded-lg border border-emerald-800/40">
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-emerald-300 text-xs">
                        Audio Narasi Terpasang
                      </span>
                      <span className="text-[10px] px-2 py-0.5 bg-emerald-900/60 text-emerald-300 rounded font-mono font-bold border border-emerald-700/50">
                        {formatDuration(audioDuration)}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-400 truncate">
                      Siap disinkronkan otomatis dengan storyboard manga
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={triggerAudioFileInput}
                    className="px-3 py-1.5 bg-stone-900 hover:bg-stone-850 text-stone-200 hover:text-white border border-stone-800 rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1 active:scale-95"
                  >
                    <Upload className="w-3 h-3 text-blue-400" />
                    Ganti Audio
                  </button>
                  <button
                    type="button"
                    onClick={onClearNarration}
                    className="px-2.5 py-1.5 bg-stone-900 hover:bg-red-950/40 text-stone-400 hover:text-red-400 border border-stone-800 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                    title="Hapus Audio Narasi"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            )}

            {/* Optional raw script text input */}
            <div className="space-y-1.5 text-left">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-stone-400 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  Teks Naskah Cerita (Opsional untuk mencocokkan tiap kalimat):
                </label>
                {rawScriptText && (
                  <button
                    type="button"
                    onClick={() => setRawScriptText("")}
                    className="text-[10px] text-stone-500 hover:text-stone-300 cursor-pointer"
                  >
                    Bersihkan
                  </button>
                )}
              </div>
              <textarea
                value={rawScriptText}
                onChange={(e) => setRawScriptText(e.target.value)}
                placeholder="Tempel naskah cerita lengkap di sini jika ada (sistem akan otomatis mencocokkan jeda kalimat dengan narasi audio)..."
                rows={2}
                className="w-full bg-stone-950 border border-stone-800 hover:border-stone-700 focus:border-blue-500 rounded-xl p-3 text-xs text-stone-200 placeholder-stone-600 outline-none resize-none transition-all font-sans"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={runAutoSync}
                disabled={isAnalyzingAudio || panels.length === 0}
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-blue-900/60 disabled:text-stone-400 text-white font-bold text-xs md:text-sm rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-blue-950/30 transition-all cursor-pointer"
                id="btn-run-auto-sync"
              >
                {isAnalyzingAudio ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Sedang Menganalisis Audio...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 fill-white/20" />
                    Jalankan Sync Otomatis
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={distributeEqually}
                disabled={isAnalyzingAudio || panels.length === 0}
                className="w-full py-2.5 bg-stone-950 hover:bg-stone-900 text-stone-300 hover:text-white border border-stone-800 hover:border-stone-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer"
                id="btn-distribute-equally"
              >
                Bagi Rata Sesuai Panjang Audio
              </button>
            </div>

            {/* Progress Bar Indicator during Analysis */}
            {isAnalyzingAudio && (
              <div className="w-full bg-stone-950 h-2 rounded-full overflow-hidden border border-stone-800">
                <div
                  className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            )}
          </div>

          {/* Quick link to Manual Tap-Sync */}
          <div className="text-left px-1">
            <button
              type="button"
              onClick={() => setActiveTab("ketukan")}
              className="inline-flex items-center gap-2 text-xs font-bold text-cyan-400 hover:text-cyan-300 cursor-pointer transition-colors"
            >
              <span>🎛️</span>
              Buka Tap-Sync Manual (Dengarkan Sambil Tap)
            </button>
          </div>

          {/* Card 2: Durasi Tiap Panel Manga (Exact Matching Panel List with Audio Preview) */}
          <div className="bg-stone-900/50 p-4 md:p-5 rounded-2xl border border-stone-800 space-y-4">
            {/* Header: Title and Total vs Audio duration */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800/80 pb-3">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Clock className="w-4 h-4 text-cyan-400" />
                Durasi Tiap Panel Manga
              </div>
              <div className="text-xs font-mono font-bold text-stone-300 bg-stone-950 px-3 py-1 rounded-lg border border-stone-800">
                Total: <span className="text-cyan-400">{formatDuration(totalDuration)}</span> ·
                Audio: <span className="text-emerald-400">{formatDuration(audioDuration)}</span>
              </div>
            </div>

            <p className="text-[11px] text-stone-400">
              Tekan ▶ untuk mendengarkan potongan suara panel ini. Anda bisa mengubah detik secara
              manual.
            </p>

            {/* Panel Items List */}
            <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
              {panels.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-500 italic bg-stone-950/60 rounded-xl border border-stone-850">
                  Belum ada panel manga di storyboard. Tambahkan panel gambar terlebih dahulu!
                </div>
              ) : (
                panels.map((panel, idx) => {
                  const isPlayingThis = playingPanelId === panel.id;
                  return (
                    <div
                      key={panel.id}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                        isPlayingThis
                          ? "bg-stone-900 border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                          : "bg-stone-950/80 border-stone-850 hover:border-stone-800"
                      }`}
                    >
                      {/* Left: Thumbnail & Subtitle snippet */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={panel.url}
                          alt={panel.name}
                          className="w-12 h-12 object-cover rounded-lg border border-stone-800 bg-stone-900 flex-shrink-0"
                        />
                        <div className="min-w-0 text-left">
                          <h4 className="text-xs font-bold text-white truncate">Panel {idx + 1}</h4>
                          <p className="text-[11px] text-stone-400 truncate max-w-sm">
                            {panel.subtitle || "(Di tengah malam yang mencekam...)"}
                          </p>
                        </div>
                      </div>

                      {/* Right: Snippet Play button & Duration Input */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Play snippet button */}
                        <button
                          type="button"
                          onClick={() => playPanelSlice(idx)}
                          className={`p-2 rounded-lg border cursor-pointer transition-all ${
                            isPlayingThis
                              ? "bg-cyan-500 text-stone-950 border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.4)]"
                              : "bg-stone-900 hover:bg-stone-850 border-stone-800 text-stone-300 hover:text-white"
                          }`}
                          title="Putar potongan suara kalimat panel ini"
                        >
                          {isPlayingThis ? (
                            <Pause className="w-3.5 h-3.5 fill-current" />
                          ) : (
                            <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                          )}
                        </button>

                        {/* Editable seconds input */}
                        <div className="flex items-center bg-stone-900 border border-stone-800 rounded-lg px-2 py-1">
                          <input
                            type="number"
                            step="0.1"
                            min="0.5"
                            value={panel.duration}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              if (!isNaN(val)) {
                                onUpdatePanel(panel.id, { duration: Math.max(0.4, val) });
                              }
                            }}
                            className="w-14 bg-transparent text-right font-mono font-bold text-xs text-white outline-none"
                          />
                          <span className="text-[10px] text-stone-400 font-semibold ml-1.5 select-none">
                            dtk
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Model Mode Modal (Matching Screenshot 2) */}
      {isModelModalOpen && (
        <div className="fixed inset-0 bg-stone-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-md rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h4 className="text-sm font-bold text-white">Pilih Mode Model Audio</h4>
              <button
                type="button"
                onClick={() => setIsModelModalOpen(false)}
                className="text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              {/* Option 1: Gemini AI Engine */}
              <label
                onClick={() => {
                  setModelMode("gemini");
                  setIsModelModalOpen(false);
                }}
                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  modelMode === "gemini"
                    ? "bg-blue-600/10 border-blue-500 text-blue-400"
                    : "bg-stone-950/60 border-stone-800 text-stone-300 hover:bg-stone-850"
                }`}
              >
                <div className="text-left">
                  <span className="text-xs font-bold block">
                    Gemini AI Engine (Direkomendasikan)
                  </span>
                  <span className="text-[10px] text-stone-500">
                    Analisis semantik naskah & intonasi suara
                  </span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    modelMode === "gemini" ? "border-blue-500 bg-blue-500" : "border-stone-600"
                  }`}
                >
                  {modelMode === "gemini" && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
              </label>

              {/* Option 2: Small (Cepat & Akurat) */}
              <label
                onClick={() => {
                  setModelMode("small");
                  setIsModelModalOpen(false);
                }}
                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  modelMode === "small"
                    ? "bg-blue-600/10 border-blue-500 text-blue-400"
                    : "bg-stone-950/60 border-stone-800 text-stone-300 hover:bg-stone-850"
                }`}
              >
                <div className="text-left">
                  <span className="text-xs font-bold block">Small (Cepat & Akurat)</span>
                  <span className="text-[10px] text-stone-500">
                    Deteksi jeda nafas & silabel suara (Mode Mandiri Client)
                  </span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    modelMode === "small" ? "border-blue-500 bg-blue-500" : "border-stone-600"
                  }`}
                >
                  {modelMode === "small" && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
              </label>

              {/* Option 3: Base (Ekstra Cepat) */}
              <label
                onClick={() => {
                  setModelMode("base");
                  setIsModelModalOpen(false);
                }}
                className={`flex items-center justify-between p-3.5 rounded-xl border cursor-pointer transition-all ${
                  modelMode === "base"
                    ? "bg-blue-600/10 border-blue-500 text-blue-400"
                    : "bg-stone-950/60 border-stone-800 text-stone-300 hover:bg-stone-850"
                }`}
              >
                <div className="text-left">
                  <span className="text-xs font-bold block">Base (Ekstra Cepat)</span>
                  <span className="text-[10px] text-stone-500">
                    Penyesuaian instan proporsional rasio kata naskah
                  </span>
                </div>
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    modelMode === "base" ? "border-blue-500 bg-blue-500" : "border-stone-600"
                  }`}
                >
                  {modelMode === "base" && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* 2. STANDARD VOICE RECORDING & UPLOAD VIEW */}
      {activeTab === "standard" && (
        <div
          className="p-4 bg-stone-950 rounded-xl border border-cyan-500/10 w-full shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)] animate-fade-in"
          id="audio-narration-bgm-panel"
        >
          <div className="max-w-2xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5 neon-glow-cyan">
              <Mic className="w-3.5 h-3.5 text-cyan-400" />
              Sumbu Suara Narasi & Rekaman
            </h3>

            <div className="space-y-2">
              <span className="block text-[11px] text-stone-400 font-semibold">
                Pengisian Suara / Voiceover
              </span>
              <div className="flex gap-2">
                {isRecording ? (
                  <button
                    onClick={stopRecording}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg animate-pulse cursor-pointer shadow-lg"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Selesai Rekam ({recordedDuration}s)
                  </button>
                ) : (
                  <button
                    onClick={startRecording}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-stone-900 hover:bg-stone-850 text-stone-300 border border-stone-800 text-xs rounded-lg transition-all cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5 text-red-500 animate-pulse" />
                    Rekam Suara
                  </button>
                )}

                <button
                  type="button"
                  onClick={triggerAudioFileInput}
                  className="flex items-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-850 text-stone-300 text-xs rounded-lg border border-stone-800 hover:border-cyan-500/30 transition-all cursor-pointer active:scale-95"
                  title="Upload rekaman audio (.wav/.mp3)"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  Pilih Audio
                </button>
              </div>

              {narrationAudioUrl && (
                <div className="flex items-center justify-between p-2.5 bg-stone-900 border border-stone-800 rounded-xl">
                  <span className="text-xs text-emerald-400 font-mono truncate max-w-xs">
                    🔊 voiceover ({formatDuration(audioDuration)})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab("auto-sync")}
                      className="text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white py-1 px-2.5 rounded-lg transition-all cursor-pointer flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      Sync Sekarang
                    </button>
                    <button
                      onClick={onClearNarration}
                      className="text-xs font-bold text-stone-500 hover:text-red-400 cursor-pointer px-1.5"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-2 border-t border-stone-800">
              <span className="block text-[11px] text-stone-400 font-semibold">
                🎵 Backsound / Musik Latar
              </span>
              <label className="flex items-center justify-center gap-1.5 px-4 py-2 bg-stone-900 hover:bg-stone-850 text-stone-300 text-xs rounded-lg border border-stone-800 hover:border-pink-500/30 transition-all cursor-pointer active:scale-95">
                <Upload className="w-3.5 h-3.5 text-pink-400" />
                {backsoundUrl ? "Ganti Backsound" : "Upload Backsound (.mp3/.wav)"}
                <input
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadBacksound?.(f);
                    e.target.value = "";
                  }}
                />
              </label>
              {backsoundUrl && (
                <div className="p-2.5 bg-stone-900 border border-stone-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-pink-400 font-mono truncate max-w-xs">
                      🎵 {backsoundName}
                    </span>
                    <button
                      onClick={onClearBacksound}
                      className="text-xs font-bold text-stone-500 hover:text-red-400 cursor-pointer px-1.5"
                    >
                      Hapus
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-3.5 h-3.5 text-stone-400" />
                    <input
                      type="range"
                      min={0}
                      max={25}
                      step={1}
                      value={Math.round(backsoundVolume * 100)}
                      onChange={(e) => onSetBacksoundVolume?.(Number(e.target.value) / 100)}
                      className="flex-1 accent-pink-500"
                    />
                    <span className="text-xs text-stone-300 font-mono w-10 text-right">
                      {Math.round(backsoundVolume * 100)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-stone-500">
                    Diputar ulang otomatis sepanjang durasi voiceover
                    {narrationAudioUrl ? ` (${formatDuration(audioDuration)})` : ""}, lalu memudar
                    perlahan di akhir.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Aesthetic Playback & Interactive Timeline Ruler - ALWAYS VISIBLE */}
      <div
        className="p-3 bg-stone-950 rounded-xl border border-cyan-500/10 space-y-2 shadow-[0_4px_20px_rgba(6,182,212,0.02)]"
        id="timeline-scrubber-component"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onTogglePlay}
              disabled={panels.length === 0}
              className={`p-2 rounded-full cursor-pointer transition-colors ${
                isPlaying
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-cyan-500 text-stone-950 hover:bg-cyan-600 shadow-[0_0_10px_rgba(6,182,212,0.35)]"
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <div>
              <div className="text-xs font-bold text-stone-200">Pencari Durasi Render</div>
              <div className="text-[10px] text-stone-500 font-mono">
                Bidikan Frame: {currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s
              </div>
            </div>
          </div>

          <div className="text-right text-[10px] text-stone-500 font-mono">
            Skala Baris Waktu (0s - {totalDuration.toFixed(1)}s)
          </div>
        </div>

        {/* Real Interactive Segmented Timeline Bar */}
        <div
          className="relative h-14 bg-stone-900 rounded-lg border border-cyan-500/10 overflow-hidden select-none"
          id="manga-timeline-slider"
        >
          <div className="absolute inset-0 flex h-full">
            {panels.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-[10px] text-stone-600 italic">
                Sumbu runtutan frame masih kosong
              </div>
            ) : (
              (() => {
                let currentAccum = 0;
                return panels.map((panel, idx) => {
                  const widthPct = (panel.duration / totalDuration) * 100;
                  const startPct = (currentAccum / totalDuration) * 100;
                  currentAccum += panel.duration;

                  return (
                    <div
                      key={panel.id}
                      onClick={() => onSeek((startPct * totalDuration) / 100)}
                      className="h-full border-r border-cyan-500/10 flex flex-col justify-between hover:bg-cyan-500/5 cursor-pointer p-1.5 transition-colors group"
                      style={{ width: `${widthPct}%` }}
                    >
                      <div className="flex items-center justify-between min-w-0">
                        <span className="text-[9px] font-bold text-cyan-400 truncate bg-stone-950/80 px-1 rounded border border-cyan-500/20">
                          #{idx + 1}
                        </span>
                        <span className="text-[8px] text-stone-500 font-mono hidden sm:inline">
                          {panel.duration}s
                        </span>
                      </div>
                      <span className="text-[9px] text-stone-400 truncate opacity-80 leading-none pb-0.5">
                        {panel.subtitle || "(Hening)"}
                      </span>
                    </div>
                  );
                });
              })()
            )}
          </div>

          {totalDuration > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 shadow-[0_0_10px_#ff0000] z-10 transition-all duration-75 pointer-events-none"
              style={{ left: `${(currentTime / totalDuration) * 100}%` }}
            >
              <div className="absolute -top-1 -left-1.5 w-3.5 h-3.5 bg-red-500 border border-stone-100/10 rotate-45 rounded"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
