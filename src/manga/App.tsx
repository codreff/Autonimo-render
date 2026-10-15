// @ts-nocheck
import { useState, useEffect } from "react";
import { MangaPanel } from "./types";
import { PanelManager } from "./components/PanelManager";
import { CanvasRenderer } from "./components/CanvasRenderer";
import { AudioTimeline } from "./components/AudioTimeline";
import { CloudHub } from "./components/CloudHub";
import { generateProceduralMangaPanel } from "./utils/mangaDraw";
import { EXAMPLE_SCRIPTS } from "./utils/presets";
import {
  Film,
  Sparkles,
  HelpCircle,
  AlertTriangle,
  Cloud,
  Layers,
  Maximize,
  Minimize,
} from "lucide-react";

// Robust sentence splitter for unified narrative scripts (Satu paragraf satu gambar)
export function splitScriptIntoSentences(text: string): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export default function App() {
  const [panels, setPanels] = useState<MangaPanel[]>([]);
  const [selectedPanelId, setSelectedPanelId] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"storyboard" | "cloud">("storyboard");
  const [isAppFullscreen, setIsAppFullscreen] = useState<boolean>(false);

  // Unified global script state
  const [globalScript, setGlobalScript] = useState<string>("");

  // Sync global script from panels subtitles when panels are reordered or initialized
  useEffect(() => {
    const currentSentences = splitScriptIntoSentences(globalScript);
    const panelSubtitles = panels.map((p) => p.subtitle);

    const isDifferent = panelSubtitles.some((sub, i) => sub !== (currentSentences[i] || ""));
    if (isDifferent || (panels.length > 0 && globalScript === "")) {
      // Joins using newlines to format elegantly for the user
      setGlobalScript(panelSubtitles.filter(Boolean).join("\n"));
    }
  }, [panels]);

  // Audio state
  const [narrationAudioUrl, setNarrationAudioUrl] = useState<string | null>(null);
  const [narrationFile, setNarrationFile] = useState<File | null>(null);
  const [backsoundUrl, setBacksoundUrl] = useState<string | null>(null);
  const [backsoundName, setBacksoundName] = useState<string>("");
  const [backsoundVolume, setBacksoundVolume] = useState<number>(0.2);

  // Playback states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);

  // Smart Tapping / Penyelarasan Naskah states
  const [isTappingMode, setIsTappingMode] = useState<boolean>(false);
  const [currentSyncIndex, setCurrentSyncIndex] = useState<number | null>(null);

  // Shared active tapping sync states & functions
  const [activeTab, setActiveTab] = useState<"auto-sync" | "standard" | "cubit" | "ketukan">(
    "auto-sync",
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [tapsCompleted, setTapsCompleted] = useState<boolean>(false);
  const [lastTapTime, setLastTapTime] = useState<number>(0);
  const [tapHistory, setTapHistory] = useState<{ lastTapTime: number; syncIndex: number }[]>([]);

  // Group configurations for category-based image pinch / zoom and offsets
  const [verticalConfig, setVerticalConfig] = useState(() => {
    const saved = localStorage.getItem("manga_recap_vertical_zoom_config");
    return saved
      ? JSON.parse(saved)
      : { initialScale: 1.15, zoomSpeed: 0.05, offsetX: 0, offsetY: 0 };
  });
  const [horizontalConfig, setHorizontalConfig] = useState(() => {
    const saved = localStorage.getItem("manga_recap_horizontal_zoom_config");
    return saved
      ? JSON.parse(saved)
      : { initialScale: 0.78, zoomSpeed: 0.06, offsetX: 0, offsetY: 0 };
  });
  const [squareConfig, setSquareConfig] = useState(() => {
    const saved = localStorage.getItem("manga_recap_square_zoom_config");
    return saved
      ? JSON.parse(saved)
      : { initialScale: 0.78, zoomSpeed: 0.06, offsetX: 0, offsetY: 0 };
  });

  // Watchers to save configs to localStorage
  useEffect(() => {
    localStorage.setItem("manga_recap_vertical_zoom_config", JSON.stringify(verticalConfig));
  }, [verticalConfig]);

  useEffect(() => {
    localStorage.setItem("manga_recap_horizontal_zoom_config", JSON.stringify(horizontalConfig));
  }, [horizontalConfig]);

  useEffect(() => {
    localStorage.setItem("manga_recap_square_zoom_config", JSON.stringify(squareConfig));
  }, [squareConfig]);

  // Play woodblock / high-hat sound using Web Audio API on tap
  const playTapSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.1);

      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn("Gagal memainkan suara ketukan:", e);
    }
  };

  const startSyncSession = () => {
    if (panels.length === 0) return;
    setIsTappingMode(true);
    setCurrentSyncIndex(0);
    setIsSyncing(true);
    setTapsCompleted(false);
    setLastTapTime(0);
    setTapHistory([]);

    // Jump playhead and start playing
    setCurrentTime(0);
    if (!isPlaying) {
      setIsPlaying(true);
    }
  };

  const cancelSyncSession = () => {
    setIsSyncing(false);
    setIsTappingMode(false);
    setCurrentSyncIndex(null);
    setTapHistory([]);
    if (isPlaying) {
      setIsPlaying(false);
    }
    setCurrentTime(0);
  };

  const handleTap = () => {
    if (!isSyncing || currentSyncIndex === null || panels.length === 0) return;

    // Play feedback sound
    playTapSound();

    const clickTime = currentTime;
    const duration = parseFloat((clickTime - lastTapTime).toFixed(1));
    const finalDuration = Math.max(0.4, duration);

    // Save to history list
    setTapHistory((prev) => [...prev, { lastTapTime, syncIndex: currentSyncIndex }]);

    // Update panel duration in parent
    const activePanel = panels[currentSyncIndex];
    handleUpdatePanel(activePanel.id, { duration: finalDuration });

    // Transition to next panel or wrap up
    const nextIndex = currentSyncIndex + 1;
    if (nextIndex < panels.length) {
      setCurrentSyncIndex(nextIndex);
      setLastTapTime(clickTime);
    } else {
      // Completed all panels
      setIsSyncing(false);
      setTapsCompleted(true);
      setIsTappingMode(false);
      setCurrentSyncIndex(null);
      if (isPlaying) {
        setIsPlaying(false);
      }
      setCurrentTime(0);
    }
  };

  const handleUndo = () => {
    if (tapHistory.length === 0 || !isSyncing) return;

    const lastItem = tapHistory[tapHistory.length - 1];
    setTapHistory((prev) => prev.slice(0, -1));

    // Restore states
    setCurrentSyncIndex(lastItem.syncIndex);
    setLastTapTime(lastItem.lastTapTime);

    // Auto seek back to correct timestamp for easy retaking
    setCurrentTime(lastItem.lastTapTime);

    // Pause playback so users can comfortably resume/retry when ready
    if (isPlaying) {
      setIsPlaying(false);
    }
  };

  // Keyboard Spacebar space handler for smart sync tapping
  useEffect(() => {
    if (!isSyncing) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault(); // Stop page scrolling
        handleTap();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSyncing, currentSyncIndex, currentTime, lastTapTime, panels, isPlaying]);

  const totalDuration = panels.reduce((acc, p) => acc + p.duration, 0);

  // Listen to native browser fullscreen changes to keep state in sync
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsAppFullscreen(
        !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        ),
      );
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  // Central progressive time ticker loop
  useEffect(() => {
    if (!isPlaying) return;
    // When audio narration is active, CanvasRenderer's audio hardware clock acts as the master clock
    // to prevent timing competition and eliminate stuttering/choppy voice playback!
    if (narrationAudioUrl) return;

    let lastTime = performance.now();
    let frameId: number;

    const tick = () => {
      const now = performance.now();
      // Calculate exact delta elapsed time in seconds
      const delta = (now - lastTime) / 1000;
      lastTime = now;

      setCurrentTime((prev) => {
        const next = prev + delta;
        if (!isTappingMode && next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        if (isTappingMode && next >= 3605) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isPlaying, totalDuration, isTappingMode, narrationAudioUrl]);

  // Update a single panel field
  const handleUpdatePanel = (id: string, updates: Partial<MangaPanel>) => {
    setPanels((prev) => prev.map((panel) => (panel.id === id ? { ...panel, ...updates } : panel)));
  };

  // Update global unified script text and propagate immediately
  const handleUpdateGlobalScript = (newScript: string) => {
    setGlobalScript(newScript);
    const sentences = splitScriptIntoSentences(newScript);
    setPanels((prev) =>
      prev.map((panel, idx) => ({
        ...panel,
        subtitle: sentences[idx] || "",
      })),
    );
  };

  // Add multi-file uploaded panel list
  const handleAddPanels = (files: File[]) => {
    if (files.length === 0) return;

    // Filter down to image files only and sort by name ascending (natural order)
    const imageFiles = files
      .filter((f) => f.type.startsWith("image/"))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      );

    if (imageFiles.length === 0) return;

    const sentences = splitScriptIntoSentences(globalScript);

    // Read all files as Promises to avoid async race conditions during construction
    const readPromises = imageFiles.map((file, index) => {
      return new Promise<MangaPanel>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const imgUrl = reader.result as string;
          const nextIndex = panels.length + index;
          const mappedSubtitle = sentences[nextIndex] || ``;
          const newPanel: MangaPanel = {
            id: `panel-upload-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 6)}`,
            name: file.name.replace(/\.[^/.]+$/, ""),
            url: imgUrl,
            duration: 4.5,
            motionType: index % 2 === 0 ? "seperempat-text-sync" : "65-random",
            subtitle: mappedSubtitle,
            focusGuide: "seperempat",
          };
          resolve(newPanel);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readPromises)
      .then((newPanelsToAdd) => {
        setPanels((prev) => [...prev, ...newPanelsToAdd]);
        if (newPanelsToAdd.length > 0) {
          setSelectedPanelId(newPanelsToAdd[0].id);
        }
      })
      .catch((err) => {
        console.error("Gagal membaca beberapa berkas gambar:", err);
      });
  };

  // Add procedural preset panel by specific index
  const handleAddProceduralPanelByIndex = (index: number) => {
    const imgUrl = generateProceduralMangaPanel(index);
    const names = [
      "Pertarungan Pedang",
      "Aura Segel Kuno",
      "Benturan Energi",
      "Takdir Akhir Medan",
      "Misteri Musuh Kuno",
      "Serangan Pamungkas",
    ];
    const subtitles = [
      "KAEL MEMBUKA SEGEL KUNO PEDANG KEMATIAN!",
      "AURA MERAH MENYALA MENEMBUS KUIL TIMUR!",
      "DENGAN SATU TEBASAN, SELURUH PASUKAN NYATA LENYAP!",
      "KAEL MELANGKAH TEGAP MENATAP MUSUH TERAKHIRNYA.",
      "KUTUKAN GELAP BERHASIL DIHANCURKAN SELAMANYA!",
      "SERANGAN TERAKHIR DIMULAI SEKARANG!",
    ];
    const motions: string[] = [
      "100-manga-flow",
      "pan-left-to-right",
      "shaky-action",
      "65-random",
      "pan-top-to-bottom",
      "seperempat-text-sync",
    ];
    const focusGuides = ["pedang", "mata", "benturan", "pedang berdiri", "segel", "fokus"];

    const nextIndex = panels.length;
    const sentences = splitScriptIntoSentences(globalScript);
    const mappedSubtitle = sentences[nextIndex] || subtitles[index % subtitles.length];

    const newPanel: MangaPanel = {
      id: `panel-demo-${Date.now()}-${index}-${Math.floor(Math.random() * 1000)}`,
      name: names[index % names.length] + ` #${index + 1}`,
      url: imgUrl,
      duration: 4.5,
      motionType: motions[index % motions.length] as any,
      subtitle: mappedSubtitle,
      focusGuide: focusGuides[index % focusGuides.length],
    };

    setPanels((prev) => [...prev, newPanel]);
    setSelectedPanelId(newPanel.id);
  };

  // Select panel and seek currentTime to start of the selected panel for perfect visual preview!
  const handleSelectPanel = (id: string | null) => {
    setSelectedPanelId(id);
    if (!id) return;
    const pIdx = panels.findIndex((p) => p.id === id);
    if (pIdx !== -1) {
      // Calculate start time of this panel
      let accumulatedTime = 0;
      for (let i = 0; i < pIdx; i++) {
        accumulatedTime += panels[i].duration;
      }
      setCurrentTime(accumulatedTime);
    }
  };

  // Delete panel
  const handleDeletePanel = (id: string) => {
    const remaining = panels.filter((p) => p.id !== id);
    setPanels(remaining);
    if (selectedPanelId === id) {
      setSelectedPanelId(remaining[0]?.id || null);
    }
  };

  // Moving panels up/down
  const handleMovePanel = (index: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= panels.length) return;

    const reordered = [...panels];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIndex, 0, moved);
    setPanels(reordered);
  };

  // Clear all
  const handleClearAll = () => {
    if (confirm("Anda yakin ingin menghapus semua panel storyboard?")) {
      setPanels([]);
      setSelectedPanelId(null);
      setCurrentTime(0);
    }
  };

  // Upload custom background narration voice record
  const handleUploadNarration = (file: File) => {
    const audioUrl = URL.createObjectURL(file);
    setNarrationAudioUrl(audioUrl);
    setNarrationFile(file);
  };

  const handleUploadBacksound = (file: File) => {
    if (backsoundUrl) URL.revokeObjectURL(backsoundUrl);
    setBacksoundUrl(URL.createObjectURL(file));
    setBacksoundName(file.name);
  };
  const handleClearBacksound = () => {
    if (backsoundUrl) URL.revokeObjectURL(backsoundUrl);
    setBacksoundUrl(null);
    setBacksoundName("");
  };

  // Clear narration sound
  const handleClearNarration = () => {
    setNarrationAudioUrl(null);
    setNarrationFile(null);
  };

  // Playback control toggle
  const handleTogglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  // Set precise playback timing
  const handleSeek = (time: number) => {
    setCurrentTime(time);
  };

  return (
    <div
      className="min-h-screen bg-stone-950 font-sans flex flex-col text-stone-100 selection:bg-cyan-500 selection:text-stone-950"
      id="manga-recap-main-canvas"
    >
      {/* Dynamic Navigation branding bar */}
      <header className="px-6 py-4 bg-stone-950 border-b border-cyan-500/15 shadow-[0_4px_20px_rgba(6,182,212,0.04)] flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-cyan-950/40 border border-cyan-500/20 shadow-[0_0_8px_rgba(6,182,212,0.1)]">
            <Sparkles className="w-5 h-5 text-cyan-400 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-widest text-cyan-400 uppercase flex items-center gap-2 leading-none neon-glow-cyan">
              Auto Edit Manga
              <span className="text-[9px] lowercase font-semibold text-stone-500 tracking-normal">
                / v1.0
              </span>
            </h1>
          </div>
        </div>

        {/* User quick metrics banner with Fullscreen under 'create by AniKi' */}
        <div className="flex flex-col items-center sm:items-end gap-2 text-stone-400 select-none">
          <div className="flex items-center gap-2 text-[11px]">
            <Film className="w-3.5 h-3.5 text-fuchsia-400" />
            <span>
              create by{" "}
              <strong className="text-fuchsia-400 font-bold neon-glow-fuchsia">AniKi.</strong>
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              try {
                if (
                  !document.fullscreenElement &&
                  !(document as any).webkitFullscreenElement &&
                  !(document as any).mozFullScreenElement &&
                  !(document as any).msFullscreenElement
                ) {
                  const el = document.documentElement;
                  if (el.requestFullscreen) {
                    el.requestFullscreen();
                  } else if ((el as any).webkitRequestFullscreen) {
                    (el as any).webkitRequestFullscreen();
                  } else if ((el as any).mozRequestFullScreen) {
                    (el as any).mozRequestFullScreen();
                  } else if ((el as any).msRequestFullscreen) {
                    (el as any).msRequestFullscreen();
                  }
                } else {
                  if (document.exitFullscreen) {
                    document.exitFullscreen();
                  } else if ((document as any).webkitExitFullscreen) {
                    (document as any).webkitExitFullscreen();
                  } else if ((document as any).mozCancelFullScreen) {
                    (document as any).mozCancelFullScreen();
                  } else if ((document as any).msExitFullscreen) {
                    (document as any).msExitFullscreen();
                  }
                }
              } catch (err) {
                console.warn("Fullscreen toggle failed:", err);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-stone-950 rounded-md border border-cyan-500/30 hover:border-cyan-400 text-[10px] font-bold tracking-wider uppercase transition-all duration-200 cursor-pointer select-none"
            title={isAppFullscreen ? "Selesai / Keluar Layar Penuh" : "Layar Penuh"}
          >
            {isAppFullscreen ? (
              <>
                <Minimize className="w-3 h-3" />
                <span>Normalkan</span>
              </>
            ) : (
              <>
                <Maximize className="w-3 h-3" />
                <span>Layar Penuh</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main 2-part grid workspace */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0" id="workspace-bento-layout">
        {/* Left pane: Storyboard & Google Cloud switchable workspace */}
        <div
          className="w-full lg:w-[410px] flex flex-col border-r border-cyan-500/10 bg-stone-950 flex-shrink-0"
          id="sidebar-panel-container"
        >
          {/* Tab triggers */}
          <div
            className="flex border-b border-cyan-500/10 p-2 gap-2 bg-stone-900/15"
            id="sidebar-tab-navigation"
          >
            <button
              onClick={() => setSidebarMode("storyboard")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                sidebarMode === "storyboard"
                  ? "bg-cyan-500 text-stone-950 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                  : "text-stone-400 hover:text-stone-200 bg-stone-950 hover:bg-stone-900 border border-stone-900/40"
              }`}
              id="tab-btn-storyboard"
            >
              <Layers className="w-3.5 h-3.5" />
              Storyboard
            </button>
            <button
              onClick={() => setSidebarMode("cloud")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-[10px] font-bold uppercase tracking-wider rounded transition-all cursor-pointer ${
                sidebarMode === "cloud"
                  ? "bg-cyan-500 text-stone-950 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                  : "text-stone-400 hover:text-stone-200 bg-stone-950 hover:bg-stone-900 border border-stone-900/40"
              }`}
              id="tab-btn-cloudhub"
            >
              <Cloud className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              Google Hub
            </button>
          </div>

          {sidebarMode === "storyboard" ? (
            <PanelManager
              panels={panels}
              selectedId={selectedPanelId}
              onSelectPanel={handleSelectPanel}
              onUpdatePanel={handleUpdatePanel}
              onAddPanels={handleAddPanels}
              onAddProceduralPanelByIndex={handleAddProceduralPanelByIndex}
              onDeletePanel={handleDeletePanel}
              onMovePanel={handleMovePanel}
              onClearAll={handleClearAll}
              globalScript={globalScript}
              onUpdateGlobalScript={handleUpdateGlobalScript}
              narrationFile={narrationFile}
            />
          ) : (
            <CloudHub
              panels={panels}
              setPanels={setPanels}
              globalScript={globalScript}
              onUpdateGlobalScript={handleUpdateGlobalScript}
              activeId={selectedPanelId}
              setActiveId={handleSelectPanel}
            />
          )}
        </div>

        {/* Center / Right pane: Canvas monitoring & timelines */}
        <div className="flex-1 flex flex-col min-h-0 justify-between bg-stone-950">
          {/* Top side: Preview Player canvas */}
          <CanvasRenderer
            panels={panels}
            narrationAudioUrl={narrationAudioUrl}
            backsoundUrl={backsoundUrl}
            backsoundVolume={backsoundVolume}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            currentTime={currentTime}
            onUpdateTime={setCurrentTime}
            activePanelIndexOverride={
              isTappingMode && currentSyncIndex !== null ? currentSyncIndex : undefined
            }
            isSyncing={isSyncing}
            tapsCompleted={tapsCompleted}
            lastTapTime={lastTapTime}
            tapHistory={tapHistory}
            isTappingMode={isTappingMode}
            currentSyncIndex={currentSyncIndex}
            onStartSyncSession={startSyncSession}
            onCancelSyncSession={cancelSyncSession}
            onHandleTap={handleTap}
            onHandleUndo={handleUndo}
            onSetTapsCompleted={setTapsCompleted}
            activeTab={activeTab}
            verticalConfig={verticalConfig}
            setVerticalConfig={setVerticalConfig}
            horizontalConfig={horizontalConfig}
            setHorizontalConfig={setHorizontalConfig}
            squareConfig={squareConfig}
            setSquareConfig={setSquareConfig}
          />

          {/* Bottom side: Timelines / Wav / Script analyzer */}
          <AudioTimeline
            panels={panels}
            narrationAudioUrl={narrationAudioUrl}
            onUploadNarration={handleUploadNarration}
            onClearNarration={handleClearNarration}
            backsoundUrl={backsoundUrl}
            backsoundName={backsoundName}
            backsoundVolume={backsoundVolume}
            onSetBacksoundVolume={setBacksoundVolume}
            onUploadBacksound={handleUploadBacksound}
            onClearBacksound={handleClearBacksound}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            currentTime={currentTime}
            onSeek={handleSeek}
            isTappingMode={isTappingMode}
            onSetTappingMode={setIsTappingMode}
            currentSyncIndex={currentSyncIndex}
            onSetCurrentSyncIndex={setCurrentSyncIndex}
            onUpdatePanel={handleUpdatePanel}
            activeTab={activeTab}
            onSetActiveTab={setActiveTab}
            isSyncing={isSyncing}
            tapsCompleted={tapsCompleted}
            lastTapTime={lastTapTime}
            tapHistory={tapHistory}
            onStartSyncSession={startSyncSession}
            onCancelSyncSession={cancelSyncSession}
            onHandleTap={handleTap}
            onHandleUndo={handleUndo}
            onSetTapsCompleted={setTapsCompleted}
            verticalConfig={verticalConfig}
            setVerticalConfig={setVerticalConfig}
            horizontalConfig={horizontalConfig}
            setHorizontalConfig={setHorizontalConfig}
            squareConfig={squareConfig}
            setSquareConfig={setSquareConfig}
          />
        </div>
      </div>
    </div>
  );
}
