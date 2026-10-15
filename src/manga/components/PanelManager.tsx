// @ts-nocheck
import React, { useRef, useState, useEffect } from "react";
import { MangaPanel, MotionType, EasingType, TransitionType } from "../types";
import {
  Trash2,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  UploadCloud,
  FileText,
  Sparkles,
} from "lucide-react";
import { splitScriptIntoSentences } from "../App";

interface PanelManagerProps {
  panels: MangaPanel[];
  selectedId: string | null;
  onSelectPanel: (id: string) => void;
  onUpdatePanel: (id: string, updates: Partial<MangaPanel>) => void;
  onAddPanels: (files: File[]) => void;
  onAddProceduralPanelByIndex: (index: number) => void;
  onDeletePanel: (id: string) => void;
  onMovePanel: (index: number, direction: "up" | "down") => void;
  onClearAll: () => void;
  globalScript: string;
  onUpdateGlobalScript: (text: string) => void;
  narrationFile?: File | null;
}

export const PanelManager: React.FC<PanelManagerProps> = ({
  panels,
  selectedId,
  onSelectPanel,
  onUpdatePanel,
  onAddPanels,
  onAddProceduralPanelByIndex,
  onDeletePanel,
  onMovePanel,
  onClearAll,
  globalScript,
  onUpdateGlobalScript,
  narrationFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // States for AI script analyzer
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiProvider, setAiProvider] = useState<"gemini" | "openai">("gemini");
  const [aiError, setAiError] = useState<string | null>(null);

  // States for advanced AI Auto-Editor & Audio Sync
  const [isAutoEditing, setIsAutoEditing] = useState(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [autoEditPacing, setAutoEditPacing] = useState<string | null>(null);
  const [autoEditInsight, setAutoEditInsight] = useState<string | null>(null);

  const handleAIGenerateScript = async () => {
    if (panels.length === 0) {
      alert(
        "Harap unggah gambar-gambar untuk storyboard terlebih dahulu (minimal 1) agar AI dapat menganalisis gambar Anda!",
      );
      return;
    }

    setIsGeneratingScript(true);
    setAiError(null);

    try {
      const response = await fetch("/api/gemini/generate-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          panels: panels.map((p) => ({ id: p.id, url: p.url })),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Error: ${response.statusText}`);
      }

      const data = await response.json();
      if (data && data.scenes && Array.isArray(data.scenes)) {
        const newGlobalLines: string[] = [];
        data.scenes.forEach((scene: any) => {
          const idx = scene.panelIndex;
          if (panels[idx]) {
            const narration = scene.narration || "";
            newGlobalLines.push(narration);
            onUpdatePanel(panels[idx].id, {
              subtitle: narration,
            });
          }
        });

        const newGlobalScript = newGlobalLines.join("\n");
        onUpdateGlobalScript(newGlobalScript);

        alert(
          "Sukses! Gemini berhasil menganalisis panel manga secara visual (dari kanan ke kiri) dan merumuskan naskah narasi (orang ketiga) yang to-the-point!",
        );
      } else {
        throw new Error("Struktur jawaban AI tidak sesuai format.");
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Gagal menghubungi modul AI Generate Script.");
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const commaIdx = result.indexOf(",");
        if (commaIdx !== -1) {
          resolve(result.slice(commaIdx + 1));
        } else {
          resolve(result);
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleAIAutoEdit = async () => {
    if (panels.length === 0) {
      alert(
        "Harap unggah gambar-gambar untuk storyboard terlebih dahulu (minimal 1) agar AI dapat mencocokkan naskah dengan gambar Anda!",
      );
      return;
    }

    setIsAutoEditing(true);
    setAiError(null);
    setAutoEditPacing(null);
    setAutoEditInsight(null);

    try {
      let audioBase64: string | undefined = undefined;
      let audioMimeType: string | undefined = undefined;

      if (narrationFile) {
        audioBase64 = await fileToBase64(narrationFile);
        audioMimeType = narrationFile.type || "audio/wav";
      }

      const response = await fetch("/api/gemini/auto-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scriptText: globalScript || "(Naskah belum diinput)",
          panelCount: panels.length,
          audioBase64,
          audioMimeType,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Error: ${response.statusText}`);
      }

      const data = await response.json();
      if (data && data.scenes && Array.isArray(data.scenes)) {
        data.scenes.forEach((scene: any) => {
          const idx = scene.panelIndex;
          if (panels[idx]) {
            onUpdatePanel(panels[idx].id, {
              duration: scene.duration || 4.5,
              motionType: scene.motionStyle || "65-random",
              subtitle: scene.subtitle || "",
              focusGuide: scene.focusGuide || "center focus",
            });
          }
        });

        if (data.overallPacing) {
          setAutoEditPacing(data.overallPacing);
        }
        if (data.aiNarratorInsight) {
          setAutoEditInsight(data.aiNarratorInsight);
        }

        alert(
          `Edit Otomatis AI Sukses! ${narrationFile ? "Suara narasi berhasil disinkronkan langsung dengan storyboard!" : "Storyboard berhasil dipercantik berdasarkan naskah global!"}`,
        );
      } else {
        throw new Error("Struktur jawaban AI tidak sesuai format.");
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Gagal menghubungi modul Auto-Editor AI.");
    } finally {
      setIsAutoEditing(false);
    }
  };

  const handleAIAnalyzeScript = async () => {
    if (!globalScript.trim()) {
      alert("Harap masukkan naskah cerita (global) terlebih dahulu.");
      return;
    }
    if (panels.length === 0) {
      alert(
        "Harap unggah gambar-gambar untuk storyboard terlebih dahulu (minimal 1) agar AI dapat mencocokkan naskah dengan gambar Anda!",
      );
      return;
    }

    setIsAnalyzing(true);
    setAiError(null);

    try {
      const response = await fetch("/api/gemini/analyze-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scriptText: globalScript,
          panelCount: panels.length,
          provider: aiProvider,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Error: ${response.statusText}`);
      }

      const data = await response.json();
      if (data && data.scenes && Array.isArray(data.scenes)) {
        data.scenes.forEach((scene: any) => {
          const idx = scene.panelIndex;
          if (panels[idx]) {
            onUpdatePanel(panels[idx].id, {
              duration: scene.duration || 4.5,
              motionType: scene.motionStyle || "65-random",
              subtitle: scene.subtitle || "",
              focusGuide: scene.focusGuide || "seperempat",
            });
          }
        });
        alert(
          `Sukses! AI (${aiProvider === "gemini" ? "Google Gemini" : "OpenAI GPT"}) berhasil mengurai naskah dan memasang durasi, gerakan Ken Burns, serta subtitle untuk ke-${panels.length} panel secara otomatis!`,
        );
      } else {
        throw new Error("Struktur jawaban AI tidak sesuai format.");
      }
    } catch (err: any) {
      console.error(err);
      setAiError(err.message || "Gagal menghubungi modul AI.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files) as File[];
      const sorted = filesArray.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
      );
      onAddPanels(sorted);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    // Support dropping files from hard drive
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files).filter(
        (file: any) => file.type && file.type.startsWith("image/"),
      ) as File[];
      if (droppedFiles.length > 0) {
        const sorted = droppedFiles.sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
        );
        onAddPanels(sorted);
        return;
      }
    }
  };

  const [durationInput, setDurationInput] = useState<string>("");

  const selectedPanel = panels.find((p) => p.id === selectedId);

  // Sync duration local input string to selectedPanel changes
  useEffect(() => {
    if (selectedPanel) {
      setDurationInput(selectedPanel.duration.toString());
    } else {
      setDurationInput("");
    }
  }, [selectedId, selectedPanel?.id]);

  const handleDurationChange = (val: string) => {
    setDurationInput(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed > 0 && selectedPanel) {
      onUpdatePanel(selectedPanel.id, { duration: parsed });
    }
  };

  const handleDurationBlur = () => {
    if (!selectedPanel) return;
    const parsed = parseFloat(durationInput);
    if (isNaN(parsed) || parsed <= 0) {
      const fallback = 4.0;
      setDurationInput(fallback.toString());
      onUpdatePanel(selectedPanel.id, { duration: fallback });
    }
  };

  const handleApplyDurationToAll = () => {
    if (!selectedPanel) return;
    const currentDur = parseFloat(durationInput);
    if (!isNaN(currentDur) && currentDur > 0) {
      panels.forEach((p) => {
        onUpdatePanel(p.id, { duration: currentDur });
      });
    }
  };

  const handleApplyMotionToAll = () => {
    if (!selectedPanel) return;
    panels.forEach((p) => {
      onUpdatePanel(p.id, {
        motionType: selectedPanel.motionType,
        easing: selectedPanel.easing || "smooth",
        transitionType: selectedPanel.transitionType || "crossfade",
      });
    });
  };

  const motionOptions: { value: MotionType; label: string }[] = [
    { value: "seperempat-text-sync", label: "✨ Efek Normal (Otomatis sesuai Rasio Gambar)" },
  ];

  return (
    <div
      className="flex flex-col h-full bg-stone-950 border-r border-cyan-500/10 text-stone-300 flex-shrink-0 w-full lg:w-[410px]"
      id="panel-manager-root"
    >
      {/* Header bar */}
      <div className="p-5 border-b border-cyan-500/10 flex items-center justify-between">
        <div>
          <h2 className="text-xs font-bold tracking-widest text-cyan-400 uppercase flex items-center gap-2 neon-glow-cyan">
            Panel Manga
          </h2>
          <p className="text-[10px] text-stone-500 mt-1">Kelola storyboard multi-gambar</p>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full border border-cyan-500/30 shadow-[0_0_8px_rgba(6,182,212,0.1)]">
          {panels.length} slide
        </span>
      </div>

      {/* DRAG AND DROP ZONE (Multi upload + drag presets landing area) */}
      <div className="p-4" id="upload-drag-drop-container">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed py-7 px-4 rounded-lg text-center cursor-pointer transition-all duration-300 ${
            isDragging
              ? "border-cyan-400 bg-cyan-950/20 scale-[1.01] shadow-cyan-950/40 shadow-xl"
              : "border-stone-800 bg-stone-900/10 hover:bg-stone-900/20 hover:border-cyan-500/30 hover:shadow-[0_0_12px_rgba(6,182,212,0.05)]"
          }`}
          title="Geser banyak gambar ke sini"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            multiple // Supporting selection of multiple images!
            className="hidden"
          />

          <div className="flex flex-col items-center justify-center gap-1.5">
            <div
              className={`p-2.5 rounded-full transition-transform ${isDragging ? "bg-cyan-500 text-stone-950 scale-110 shadow-[0_0_12px_rgba(6,182,212,0.4)]" : "bg-stone-900 text-cyan-400 border border-cyan-500/10"}`}
            >
              <UploadCloud className="w-5 h-5" />
            </div>

            <p className="text-xs font-semibold text-stone-200">
              {isDragging ? "Lepaskan file sekarang!" : "Geser & Letakkan Gambar Ke Sini"}
            </p>
            <p className="text-[10px] text-stone-500 leading-normal max-w-[280px] mx-auto">
              Mendukung <strong className="text-stone-300">Drag & Drop Banyak Berkas</strong>{" "}
              sekaligus atau Klik untuk mencari berkas
            </p>
          </div>
        </div>
      </div>

      {/* GLOBAL SCRIPT ENGINE - Paster & Editor block */}
      <div className="px-4 pb-3" id="global-script-paster-deck">
        <div className="p-3.5 bg-stone-900/20 border border-cyan-500/10 rounded-lg space-y-2 shadow-[inset_0_1px_5px_rgba(0,0,0,0.4)]">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] uppercase font-bold tracking-widest text-cyan-400 flex items-center gap-1.5 leading-none">
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              Naskah Cerita Utama (Global)
            </span>
            <span className="text-[8px] bg-cyan-500/10 text-cyan-400 font-bold px-1.5 py-0.5 rounded border border-cyan-500/20 uppercase tracking-wider">
              1 KALI INPUT
            </span>
          </div>
          <p className="text-[10px] text-stone-500 leading-normal">
            Tulis atau tempel seluruh naskah di sini. Setiap kalimat/baris otomatis dipasangkan ke
            panel storyboard secara berurutan.
          </p>
          <textarea
            value={globalScript}
            onChange={(e) => onUpdateGlobalScript(e.target.value)}
            placeholder="Contoh: Kael membuka segel kuno pedang kematian! Aura merah menyala menembus kuil timur. Dengan satu tebasan, seluruh musuh lenyap."
            rows={4}
            className="w-full text-xs p-2 bg-stone-950 border border-stone-850 rounded text-stone-100 placeholder-stone-750 focus:outline-none focus:border-cyan-500/45 focus:ring-1 focus:ring-cyan-500/20 resize-y leading-relaxed font-sans"
          />
          <div className="flex items-center justify-between text-[9.5px] font-mono text-stone-500">
            <span>
              Terdeteksi:{" "}
              <strong className="text-cyan-400/80 font-medium">
                {splitScriptIntoSentences(globalScript).length} paragraf
              </strong>
            </span>
            <span>
              Target Frame:{" "}
              <strong className="text-cyan-400/80 font-medium">{panels.length} panel</strong>
            </span>
          </div>

          {/* AI Generation controller row */}
          <div className="pt-2 border-t border-stone-900/60 flex flex-col gap-2">
            {/* Narration voice sync indicator */}
            {narrationFile ? (
              <div className="flex items-center gap-1.5 p-2 rounded bg-emerald-950/10 border border-emerald-500/20 text-emerald-400 text-[10px] leading-tight">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>
                  <strong>Narasi Suara Aktif ({narrationFile.name})</strong>: AI siap menyinkronkan
                  suara Anda dengan visual storyboard secara otomatis!
                </span>
              </div>
            ) : (
              <div className="p-2 rounded bg-stone-900/40 border border-stone-850 text-stone-500 text-[9.5px] leading-normal">
                💡 <strong>Tips Sinkronisasi</strong>: Rekam atau unggah suara narasi Anda di panel
                bawan untuk menyinkronkan kalimat & durasi antar klip secara nyata!
              </div>
            )}

            <div className="flex items-center justify-between gap-1 mt-1">
              <span className="text-[10px] text-stone-400 font-semibold">Tipe AI Asisten:</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setAiProvider("gemini")}
                  className={`px-2 py-0.5 rounded text-[9.5px] font-bold border transition-all cursor-pointer ${
                    aiProvider === "gemini"
                      ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-[0_0_6px_rgba(6,182,212,0.1)]"
                      : "bg-transparent text-stone-500 border-transparent hover:text-stone-300"
                  }`}
                  id="ai-provider-gemini"
                >
                  Direct Sync (Gemini 3.5)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              {/* Main AI Script Generation Button (Replaces Auto-Edit Main Button) */}
              <button
                type="button"
                onClick={handleAIGenerateScript}
                disabled={isGeneratingScript || isAutoEditing || isAnalyzing}
                className={`w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-bold transition-all cursor-pointer shadow-md ${
                  isGeneratingScript
                    ? "bg-cyan-950/20 text-cyan-400 border border-cyan-950/30 animate-pulse cursor-wait"
                    : "bg-gradient-to-r from-cyan-500 to-purple-600 text-stone-950 hover:brightness-110 shadow-[0_0_15px_rgba(6,182,212,0.3)]"
                }`}
                id="ai-generate-script-btn"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isGeneratingScript
                  ? "AI Sedang Menganalisis Manga..."
                  : "✨ AI Generate: Buat Narasi Otomatis"}
              </button>

              {/* Secondary Buttons Row */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={handleAIAutoEdit}
                  disabled={isAutoEditing || isGeneratingScript || isAnalyzing}
                  className="w-full flex items-center justify-center gap-1 py-1 px-2.5 rounded text-[10px] font-semibold bg-stone-900 text-stone-300 border border-stone-800 hover:bg-stone-850 cursor-pointer"
                  id="ai-auto-edit-btn"
                  title="Penyelarasan Klip Video & Narasi Suara"
                >
                  Sync AI (Vokal)
                </button>
                <button
                  type="button"
                  onClick={handleAIAnalyzeScript}
                  disabled={isAnalyzing || isGeneratingScript || isAutoEditing}
                  className="w-full flex items-center justify-center gap-1 py-1 px-2.5 rounded text-[10px] font-semibold bg-stone-900 text-stone-300 border border-stone-800 hover:bg-stone-850 cursor-pointer"
                  id="ai-analyze-btn"
                >
                  Urai Kalimat Naskah
                </button>
              </div>
            </div>

            {/* Director's Feedback Commentary box */}
            {(autoEditPacing || autoEditInsight) && (
              <div className="mt-2 p-2.5 bg-purple-950/15 border border-purple-500/15 rounded text-stone-300 space-y-1.5 shadow-inner">
                <span className="text-[9px] uppercase font-bold text-purple-400 tracking-wider flex items-center gap-1 leading-none">
                  🎬 Sutradara AI Studio
                </span>
                {autoEditPacing && (
                  <p className="text-[10px] text-stone-200">
                    <strong className="text-gray-400">Tempo Alur:</strong> {autoEditPacing}
                  </p>
                )}
                {autoEditInsight && (
                  <p className="text-[9.5px] text-stone-400 italic leading-relaxed">
                    &quot;{autoEditInsight}&quot;
                  </p>
                )}
              </div>
            )}

            {aiError && (
              <p
                className="text-[9px] text-red-400 leading-tight bg-red-950/15 border border-red-900/20 p-1.5 rounded"
                id="ai-error-indicator"
              >
                ⚠️ {aiError}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* MAIN PANEL STORYBOARD LIST */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2 max-h-[260px] lg:max-h-none border-b border-stone-900/50"
        id="panel-list-viewport"
      >
        <label className="block text-[10.5px] uppercase font-bold tracking-wider text-stone-500 mb-1">
          Urutan Gambar Storyboard ({panels.length})
        </label>

        {panels.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-4 text-center border border-dashed border-stone-900 rounded bg-stone-950/50">
            <ImageIcon className="w-8 h-8 text-stone-800 mb-2" />
            <p className="text-xs text-stone-500">Belum ada slide gambar</p>
            <p className="text-[10px] text-stone-600 mt-1 max-w-[210px]">
              Tarik atau letakkan berkas gambar PC Anda di atas untuk mengaktifkan video
            </p>
          </div>
        ) : (
          panels.map((panel, idx) => {
            const isSelected = panel.id === selectedId;
            return (
              <div
                key={panel.id}
                onClick={() => onSelectPanel(panel.id)}
                className={`group flex items-center gap-3 p-2 rounded cursor-pointer border transition-all text-left ${
                  isSelected
                    ? "bg-cyan-500/10 border-cyan-500/50 neon-border-cyan shadow-[0_0_15px_rgba(6,182,212,0.1)]"
                    : "bg-stone-900/20 border-stone-900/40 hover:border-cyan-500/25 hover:bg-stone-900/30"
                }`}
                id={`panel-card-${panel.id}`}
              >
                {/* Visual Thumbnail */}
                <div className="relative w-14 h-11 bg-stone-900 rounded overflow-hidden flex-shrink-0 border border-stone-800/65">
                  <img
                    referrerPolicy="no-referrer"
                    src={panel.url}
                    alt={panel.name}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 right-0 bg-stone-950/85 px-1 py-0.5 text-[8px] font-mono text-stone-400">
                    {panel.duration}s
                  </span>
                  <span className="absolute top-0 left-0 w-4 h-4 bg-stone-950 text-[9px] font-mono font-bold text-cyan-400 rounded-br flex items-center justify-center">
                    {idx + 1}
                  </span>
                </div>

                {/* Content info */}
                <div className="flex-1 min-w-0 flex items-center">
                  <h4 className="text-xs font-semibold text-stone-200 truncate pr-2">
                    {panel.name}
                  </h4>
                </div>

                {/* Sorting Actions */}
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMovePanel(idx, "up");
                    }}
                    disabled={idx === 0}
                    className="p-1 text-stone-500 hover:text-stone-200 disabled:opacity-20 cursor-pointer"
                    title="Pindah ke atas"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMovePanel(idx, "down");
                    }}
                    disabled={idx === panels.length - 1}
                    className="p-1 text-stone-500 hover:text-stone-200 disabled:opacity-20 cursor-pointer"
                    title="Pindah ke bawah"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePanel(panel.id);
                    }}
                    className="p-1 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                    title="Hapus panel"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Editor Inputs for Active Panel Selection */}
      <div className="p-4 bg-stone-950/85 flex-1 overflow-y-auto space-y-3" id="panel-inspector">
        {selectedPanel ? (
          <div className="space-y-3" id="active-panel-editor">
            <div className="flex items-center justify-between border-b border-stone-900 pb-1.5">
              <span className="text-[10px] uppercase font-bold tracking-widest text-stone-400">
                Detil Kustomisasi Panel #{panels.findIndex((p) => p.id === selectedId) + 1}
              </span>
              <span className="text-[10px] text-stone-500">Penyunting Aktif</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {/* Duration Input */}
              <div className="space-y-1">
                <label className="block text-[10.5px] font-semibold text-stone-400">
                  Durasi (detik)
                </label>
                <input
                  type="text"
                  value={durationInput}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  onBlur={handleDurationBlur}
                  className="w-full text-xs p-1.5 bg-stone-900 border border-stone-900 rounded text-stone-100 focus:outline-none focus:border-cyan-500/35 font-mono focus:ring-1 focus:ring-cyan-500/20"
                  placeholder="Contoh: 4.5"
                />
              </div>

              {/* Dynamic Focus Guide suggestion */}
              <div className="space-y-1">
                <label className="block text-[10.5px] font-semibold text-stone-400">
                  Fokus Objek
                </label>
                <input
                  type="text"
                  value={selectedPanel.focusGuide || ""}
                  onChange={(e) => onUpdatePanel(selectedPanel.id, { focusGuide: e.target.value })}
                  placeholder="Bilah pedang / mata"
                  className="w-full text-xs p-1.5 bg-stone-900 border border-stone-900 rounded text-stone-100 focus:outline-none focus:border-cyan-500/35 focus:ring-1 focus:ring-cyan-500/20"
                />
              </div>
            </div>

            {/* Subtitle / Script input - Read-only display to avoid duplicate entry */}
            <div className="space-y-1">
              <label className="block text-[10.5px] font-semibold text-stone-400">
                Bagian Naskah Panel Ini (Otomatis)
              </label>
              <div className="w-full text-xs p-2 bg-stone-900 border border-stone-900 rounded text-stone-350 italic font-medium leading-relaxed">
                {selectedPanel.subtitle
                  ? `"${selectedPanel.subtitle}"`
                  : "(Hening / Tidak ada naskah)"}
              </div>
              <span className="text-[9px] text-stone-500 block leading-tight">
                *Teks di atas dipetakan otomatis secara berurutan sesuai baris/kalimat penulisan
                Anda pada kotak &quot;Naskah Cerita Utama (Global)&quot; di atas.
              </span>
            </div>

            {/* Auto-apply to all panels action button */}
            <div className="p-2 bg-stone-900/40 rounded border border-cyan-500/10 flex items-center justify-between gap-2 shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)]">
              <span className="text-[10px] text-stone-500 leading-normal">
                Terapkan durasi ini ({durationInput || selectedPanel.duration}s) ke semua panel
                storyboard sekaligus?
              </span>
              <button
                type="button"
                onClick={handleApplyDurationToAll}
                className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-stone-950 font-bold px-2 py-1.5 rounded transition-all border border-cyan-500/20 shadow-sm shrink-0"
                title="Terapkan durasi ke seluruh panel"
              >
                Terapkan Semua
              </button>
            </div>

            {/* Motion Style Selection (Dropdown - saves tremendous physical space) */}
            <div className="space-y-1">
              <label className="block text-[10.5px] font-semibold text-stone-400">
                Animasi Kamera (Ken Burns)
              </label>
              <select
                value={selectedPanel.motionType}
                onChange={(e) =>
                  onUpdatePanel(selectedPanel.id, { motionType: e.target.value as MotionType })
                }
                className="w-full text-xs p-1.5 bg-stone-900 border border-stone-900 rounded text-stone-200 focus:outline-none focus:border-cyan-500/35 cursor-pointer focus:ring-1 focus:ring-cyan-500/20"
              >
                {motionOptions.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-stone-900 text-stone-200">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Easing Curve Selection */}
            <div className="space-y-1">
              <label className="block text-[10.5px] font-semibold text-stone-400">
                Kurva Pelonggaran (Easing Curve)
              </label>
              <select
                value={selectedPanel.easing || "smooth"}
                onChange={(e) =>
                  onUpdatePanel(selectedPanel.id, { easing: e.target.value as EasingType })
                }
                className="w-full text-xs p-1.5 bg-stone-900 border border-stone-900 rounded text-stone-200 focus:outline-none focus:border-cyan-500/35 cursor-pointer focus:ring-1 focus:ring-cyan-500/20"
              >
                <option value="linear" className="bg-stone-900 text-stone-200">
                  Linier (Sama Rata / Linear)
                </option>
                <option value="ease-in-out" className="bg-stone-900 text-stone-200">
                  Melonggarkan Masuk (Ease-In-Out)
                </option>
                <option value="smooth" className="bg-stone-900 text-stone-200">
                  Halus (Smooth / Sinusoidal)
                </option>
              </select>
            </div>

            {/* Transition Style Selection */}
            <div className="space-y-1 font-sans">
              <label className="block text-[10.5px] font-semibold text-stone-400">
                Transisi Panel (Transition Style)
              </label>
              <select
                value={selectedPanel.transitionType || "crossfade"}
                onChange={(e) =>
                  onUpdatePanel(selectedPanel.id, {
                    transitionType: e.target.value as TransitionType,
                  })
                }
                className="w-full text-xs p-1.5 bg-stone-900 border border-stone-900 rounded text-stone-200 focus:outline-none focus:border-cyan-500/35 cursor-pointer focus:ring-1 focus:ring-cyan-500/20"
              >
                <option value="crossfade" className="bg-stone-900 text-stone-200">
                  🌸 Silang Lambat (Crossfade)
                </option>
                <option value="slide-left" className="bg-stone-900 text-stone-200">
                  ⬅️ Geser Kiri (Slide Left)
                </option>
                <option value="slide-right" className="bg-stone-900 text-stone-200">
                  ➡️ Geser Kanan (Slide Right)
                </option>
                <option value="zoom-fade" className="bg-stone-900 text-stone-200">
                  🔎 Perbesar & Memudar (Zoom Fade)
                </option>
                <option value="none" className="bg-stone-900 text-stone-200">
                  ✂️ Potong Langsung (Cut / None)
                </option>
              </select>
            </div>

            {/* Auto-apply motion style to all panels action button */}
            <div className="p-2 bg-stone-900/40 rounded border border-cyan-500/10 flex items-center justify-between gap-2 shadow-[inset_0_1px_4px_rgba(0,0,0,0.3)]">
              <span className="text-[10px] text-stone-500 leading-normal font-sans">
                Terapkan gerakan, easing & transisi ini ke semua panel storyboard sekaligus?
              </span>
              <button
                type="button"
                onClick={handleApplyMotionToAll}
                className="text-[10px] bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-stone-950 font-bold px-2 py-1.5 rounded transition-all border border-cyan-500/20 shadow-sm shrink-0"
                title="Terapkan animasi ke seluruh panel"
              >
                Terapkan Semua
              </button>
            </div>

            {/* Dedicated Delete button for active panel */}
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => onDeletePanel(selectedPanel.id)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-red-950/20 hover:bg-red-900/20 border border-red-900/30 text-red-400 hover:text-red-300 text-xs font-medium rounded transition-all cursor-pointer"
                title="Hapus panel ini"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                Hapus Panel Ini
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-6 text-stone-600">
            <p className="text-xs">Pilih panel di atas untuk mengedit gerakan & teks</p>
          </div>
        )}
      </div>

      {/* Footer Clear All btn */}
      {panels.length > 0 && (
        <div className="p-3.5 border-t border-stone-900 bg-stone-950 flex items-center justify-between text-xs">
          <p className="text-[10px] text-stone-650">
            Total Storyboard:{" "}
            <strong className="text-stone-400">
              {panels.reduce((acc, p) => acc + p.duration, 0).toFixed(1)}s
            </strong>
          </p>
          <button
            onClick={onClearAll}
            className="text-[9.5px] uppercase font-bold tracking-wider text-stone-500 hover:text-red-400 transition-colors px-2 py-1"
          >
            Bersihkan Semua
          </button>
        </div>
      )}
    </div>
  );
};
