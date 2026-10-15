// @ts-nocheck
import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import { mixWithBacksound } from "./backsound";

/**
 * GPU Video Export Engine (WebCodecs + WebGL)
 *
 * Pipeline per frame (no CPU pixel loops, no getImageData, no captureStream pacing):
 *   2D scene canvas (GPU-accelerated) -> WebGL texture upload (GPU) -> WebGL draw
 *   -> VideoFrame(webglCanvas) (GPU-backed) -> hardware H.264 VideoEncoder -> mp4-muxer
 *
 * Compression: H.264 High profile, CRF-style constant quality via
 * WebCodecs bitrateMode "quantizer" (QP 23-26). If the device encoder does not
 * expose quantizer mode, it falls back to a VBR bitrate derived from the CRF value.
 */

export type CompressionPreset = "crf23" | "crf24" | "crf26";

export const CRF_VALUES: Record<CompressionPreset, number> = {
  crf23: 23,
  crf24: 24,
  crf26: 26,
};

/** Accepts legacy stored values (crf20 / crf28) and maps them into the 23-26 range. */
export function normalizePreset(p: string | null | undefined): CompressionPreset {
  if (p === "crf23" || p === "crf24" || p === "crf26") return p;
  if (p === "crf20") return "crf23";
  if (p === "crf28") return "crf26";
  return "crf24";
}

export interface RenderResult {
  blob: Blob;
  url: string;
  sizeBytes: number;
  sizeMB: string;
  duration: number;
  mimeType: string;
}

export interface VideoExportOptions {
  /** 2D canvas the scene is drawn onto (source texture for the GPU pass). */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  fps?: number;
  preset: CompressionPreset;
  totalDuration: number;
  narrationAudioUrl?: string | null;
  backsoundUrl?: string | null;
  backsoundVolume?: number;
  renderFrame: (timestamp: number) => void;
  onProgress: (stage: number, stageName: string, percent: number) => void;
  isCancelled: () => boolean;
}

/**
 * VBR fallback bitrate that approximates the given CRF for still-heavy manga content.
 * Manga recaps are mostly static panels with pans/zooms -> very compressible.
 */
export function getBitrateForPreset(
  preset: CompressionPreset,
  width: number,
  height: number,
  fps = 30,
): number {
  const crf = CRF_VALUES[normalizePreset(preset)];
  // ~0.055 bits/pixel/frame at CRF 23, halving roughly every +6 CRF
  const bpp = 0.055 * Math.pow(2, -(crf - 23) / 6);
  return Math.round(width * height * fps * bpp);
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function hasWebCodecs(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window;
}

export async function exportVideoOffline(options: VideoExportOptions): Promise<RenderResult> {
  if (!hasWebCodecs()) {
    throw new Error(
      "Browser ini belum mendukung WebCodecs (akselerasi GPU). Gunakan Chrome/Edge Android versi terbaru.",
    );
  }
  return exportWithWebCodecs(options);
}

/* ------------------------------------------------------------------ */
/* WebGL blitter: uploads the 2D canvas as a texture and draws it.     */
/* ------------------------------------------------------------------ */
interface GLBlitter {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  draw: (source: TexImageSource) => void;
  destroy: () => void;
}

function createGLBlitter(width: number, height: number): GLBlitter {
  const glCanvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });

  const gl =
    (glCanvas as any).getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
      desynchronized: true,
    }) ||
    (glCanvas as any).getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });

  if (!gl) throw new Error("WebGL tidak tersedia di perangkat ini.");
  const g = gl as WebGLRenderingContext;

  const vs = `attribute vec2 p; varying vec2 uv;
    void main(){ uv = vec2((p.x+1.0)*0.5, 1.0-(p.y+1.0)*0.5); gl_Position = vec4(p,0.0,1.0); }`;
  const fs = `precision mediump float; varying vec2 uv; uniform sampler2D t;
    void main(){ gl_FragColor = vec4(texture2D(t, uv).rgb, 1.0); }`;

  const compile = (type: number, src: string) => {
    const s = g.createShader(type)!;
    g.shaderSource(s, src);
    g.compileShader(s);
    if (!g.getShaderParameter(s, g.COMPILE_STATUS))
      throw new Error("Shader error: " + g.getShaderInfoLog(s));
    return s;
  };
  const prog = g.createProgram()!;
  g.attachShader(prog, compile(g.VERTEX_SHADER, vs));
  g.attachShader(prog, compile(g.FRAGMENT_SHADER, fs));
  g.linkProgram(prog);
  g.useProgram(prog);

  const buf = g.createBuffer();
  g.bindBuffer(g.ARRAY_BUFFER, buf);
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
  const loc = g.getAttribLocation(prog, "p");
  g.enableVertexAttribArray(loc);
  g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);

  const tex = g.createTexture();
  g.bindTexture(g.TEXTURE_2D, tex);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.LINEAR);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  g.viewport(0, 0, width, height);

  return {
    canvas: glCanvas,
    draw: (source) => {
      g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, source);
      g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    },
    destroy: () => {
      g.deleteTexture(tex);
      g.deleteBuffer(buf);
      g.deleteProgram(prog);
      (g.getExtension("WEBGL_lose_context") as any)?.loseContext();
    },
  };
}

/* ------------------------------------------------------------------ */
/* Encoder configuration: hardware H.264 + CRF (quantizer) preferred   */
/* ------------------------------------------------------------------ */
async function pickEncoderConfig(
  width: number,
  height: number,
  fps: number,
  preset: CompressionPreset,
) {
  const VE = (window as any).VideoEncoder;
  // High -> Main -> Baseline, level 4.0 (covers 1080p30)
  const codecs = ["avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.42001f"];
  const fallbackBitrate = getBitrateForPreset(preset, width, height, fps);

  const attempts: any[] = [];
  for (const hw of ["prefer-hardware", "no-preference"]) {
    for (const codec of codecs) {
      attempts.push({ codec, hardwareAcceleration: hw, bitrateMode: "quantizer" });
    }
    for (const codec of codecs) {
      attempts.push({
        codec,
        hardwareAcceleration: hw,
        bitrateMode: "variable",
        bitrate: fallbackBitrate,
      });
    }
  }

  for (const a of attempts) {
    const cfg = {
      ...a,
      width,
      height,
      framerate: fps,
      latencyMode: "quality",
      avc: { format: "avc" },
    };
    try {
      const res = await VE.isConfigSupported(cfg);
      if (res?.supported)
        return { config: res.config ?? cfg, useQuantizer: a.bitrateMode === "quantizer" };
    } catch {
      /* try next */
    }
  }
  throw new Error("Encoder H.264 tidak didukung di perangkat ini.");
}

async function exportWithWebCodecs(options: VideoExportOptions): Promise<RenderResult> {
  const {
    canvas,
    fps = 30,
    preset,
    totalDuration,
    narrationAudioUrl,
    renderFrame,
    onProgress,
    isCancelled,
  } = options;
  const width = even(options.width);
  const height = even(options.height);
  const totalFrames = Math.max(1, Math.ceil(totalDuration * fps));
  const crf = CRF_VALUES[normalizePreset(preset)];

  onProgress(1, "Menyiapkan encoder GPU (H.264 hardware)...", 2);

  // 1. Decode narration audio (unchanged sync behaviour: starts at t=0)
  let audioBuffer: AudioBuffer | null = null;
  if (narrationAudioUrl) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const actx = new AudioCtx();
      const resp = await fetch(narrationAudioUrl);
      audioBuffer = await actx.decodeAudioData(await resp.arrayBuffer());
      try {
        actx.close();
      } catch {}
    } catch (e) {
      console.warn("Gagal decode audio:", e);
    }
  }

  // 1b. Mix looped backsound under the voiceover (follows VO length, fades out)
  if (options.backsoundUrl) {
    try {
      onProgress(1, "Mencampur backsound...", 3);
      audioBuffer = await mixWithBacksound(
        audioBuffer,
        options.backsoundUrl,
        options.backsoundVolume ?? 0.2,
        totalDuration,
        totalDuration,
      );
    } catch (e) {
      console.warn("Gagal mencampur backsound:", e);
    }
  }

  let canEncodeAudio = false;
  if (audioBuffer && "AudioEncoder" in window) {
    try {
      const s = await (window as any).AudioEncoder.isConfigSupported({
        codec: "mp4a.40.2",
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
        bitrate: 96000,
      });
      canEncodeAudio = !!s.supported;
    } catch {}
  }

  // 2. Encoder config
  const { config, useQuantizer } = await pickEncoderConfig(width, height, fps, preset);

  // 3. Muxer
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width, height, frameRate: fps },
    audio:
      canEncodeAudio && audioBuffer
        ? {
            codec: "aac",
            numberOfChannels: audioBuffer.numberOfChannels,
            sampleRate: audioBuffer.sampleRate,
          }
        : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  // 4. Video encoder
  let encoderError: Error | null = null;
  const videoEncoder = new (window as any).VideoEncoder({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: any) => {
      encoderError = e;
    },
  });
  videoEncoder.configure(config);

  // 5. Audio encoder (AAC 96 kbps - transparent for narration, smaller file)
  if (canEncodeAudio && audioBuffer) {
    const audioEncoder = new (window as any).AudioEncoder({
      output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
      error: (e: any) => console.error("AudioEncoder error:", e),
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      bitrate: 96000,
    });
    const ch = audioBuffer.numberOfChannels;
    const sr = audioBuffer.sampleRate;
    const length = Math.min(audioBuffer.length, Math.floor(totalDuration * sr));
    const chunkSize = 8192;
    const channels = Array.from({ length: ch }, (_, i) => audioBuffer!.getChannelData(i));
    for (let off = 0; off < length; off += chunkSize) {
      if (isCancelled()) {
        audioEncoder.close();
        videoEncoder.close();
        throw new Error("Render dibatalkan");
      }
      const n = Math.min(chunkSize, length - off);
      const data = new Float32Array(n * ch);
      for (let c = 0; c < ch; c++) data.set(channels[c].subarray(off, off + n), c * n);
      const ad = new (window as any).AudioData({
        format: "f32-planar",
        sampleRate: sr,
        numberOfFrames: n,
        numberOfChannels: ch,
        timestamp: Math.round((off / sr) * 1_000_000),
        data,
      });
      audioEncoder.encode(ad);
      ad.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  // 6. GPU blitter
  const blitter = createGLBlitter(width, height);

  // Backpressure: wait for the hardware encoder to drain instead of busy-looping
  const waitForDrain = () =>
    new Promise<void>((resolve) => {
      if (videoEncoder.encodeQueueSize <= 2) return resolve();
      const onDeq = () => {
        if (videoEncoder.encodeQueueSize <= 2) {
          videoEncoder.removeEventListener?.("dequeue", onDeq);
          resolve();
        }
      };
      if (videoEncoder.addEventListener) videoEncoder.addEventListener("dequeue", onDeq);
      else setTimeout(resolve, 8);
    });

  const frameDurUs = Math.round(1_000_000 / fps);
  const gop = fps * 4; // keyframe every 4s -> smaller file, still seekable

  try {
    for (let i = 0; i < totalFrames; i++) {
      if (isCancelled()) throw new Error("Render dibatalkan oleh pengguna");
      if (encoderError) throw encoderError;

      renderFrame(Math.min(i / fps, totalDuration));
      blitter.draw(canvas);

      const frame = new (window as any).VideoFrame(blitter.canvas, {
        timestamp: i * frameDurUs,
        duration: frameDurUs,
      });
      const encOpts: any = { keyFrame: i % gop === 0 };
      if (useQuantizer) encOpts.avc = { quantizer: crf };
      videoEncoder.encode(frame, encOpts);
      frame.close();

      if (videoEncoder.encodeQueueSize > 2) await waitForDrain();

      // Yield to the UI thread periodically so the phone stays responsive & cool
      if (i % 15 === 0 || i === totalFrames - 1) {
        const pct = Math.round(((i + 1) / totalFrames) * 92);
        onProgress(1, `Render GPU H.264 CRF ${crf} (${pct}%)...`, pct);
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    onProgress(2, "Menuntaskan kompresi & muxing MP4...", 95);
    await videoEncoder.flush();
    if (encoderError) throw encoderError;
  } finally {
    try {
      if (videoEncoder.state !== "closed") {
        videoEncoder.close();
      }
    } catch {
      // ignore
    }
    blitter.destroy();
  }

  muxer.finalize();
  const blob = new Blob([target.buffer], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  onProgress(2, "Selesai!", 100);

  return {
    blob,
    url,
    sizeBytes: blob.size,
    sizeMB: (blob.size / (1024 * 1024)).toFixed(1),
    duration: totalDuration,
    mimeType: "video/mp4",
  };
}
