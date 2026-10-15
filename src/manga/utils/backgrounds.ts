import paperFrame1Url from "@/assets/paper-loop/frame-1.jpg";
import paperFrame2Url from "@/assets/paper-loop/frame-2.jpg";
import paperFrame3Url from "@/assets/paper-loop/frame-3.jpg";
import paperFrame4Url from "@/assets/paper-loop/frame-4.jpg";
import paperFrame5Url from "@/assets/paper-loop/frame-5.jpg";

export const PAPER_LOOP_FRAME_URLS = [
  paperFrame1Url,
  paperFrame2Url,
  paperFrame3Url,
  paperFrame4Url,
  paperFrame5Url,
];

export type BackgroundStyle = "hitam" | "putih" | "kertas" | "cream" | "kabur" | "custom";

export const BACKGROUND_CHOICES: { value: BackgroundStyle; label: string }[] = [
  { value: "kabur", label: "Kabur" },
  { value: "hitam", label: "Hitam" },
  { value: "kertas", label: "Kertas Kusut Putih" },
  { value: "cream", label: "Cream" },
  { value: "putih", label: "Putih" },
];

export type PaperMotionStyle = "halus-lambat" | "drift" | "stopmotion" | "statis";

export interface PaperMotionConfig {
  enabled: boolean;
  style: PaperMotionStyle;
  speed: number; // 0.3 (sangat lambat) to 1.5
  intensity: number; // opacity / ketebalan: 0.2 (sangat tipis) to 0.8
}

export const DEFAULT_PAPER_MOTION_CONFIG: PaperMotionConfig = {
  enabled: true,
  style: "halus-lambat",
  speed: 0.6,
  intensity: 0.38,
};

export const PAPER_MOTION_STYLES: { value: PaperMotionStyle; label: string; desc: string }[] = [
  {
    value: "halus-lambat",
    label: "🌸 Halus & Gerak Lambat (Rekomendasi)",
    desc: "Tekstur lembut tipis, lipatan berganti perlahan dengan pergeseran santai",
  },
  {
    value: "drift",
    label: "🌊 Drift Mengalir Lambat",
    desc: "Pergeseran mengalir tenang pada satu tekstur kertas putih",
  },
  {
    value: "stopmotion",
    label: "🎞️ Stop-Motion Santai (~2.5 FPS)",
    desc: "Ganti lipatan kertas dengan tempo lambat dan lembut",
  },
  { value: "statis", label: "⏹️ Statis", desc: "Kertas putih bersih tanpa animasi gerak" },
];

export function normalizeBackground(saved: string | null): BackgroundStyle {
  if (saved === "navy") return "kertas";
  if (saved === "abu") return "cream";
  if (saved === "custom" || BACKGROUND_CHOICES.some((choice) => choice.value === saved)) {
    return saved as BackgroundStyle;
  }
  return "kabur";
}

export function normalizePaperMotion(saved: string | null): PaperMotionConfig {
  if (!saved) return { ...DEFAULT_PAPER_MOTION_CONFIG };
  try {
    const parsed = JSON.parse(saved);
    const validStyles = ["halus-lambat", "drift", "stopmotion", "statis", "kombinasi", "grain"];
    let style = parsed.style;
    if (style === "kombinasi" || style === "grain") style = "halus-lambat";
    if (!validStyles.includes(style)) style = "halus-lambat";
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
      style: style as PaperMotionStyle,
      speed: typeof parsed.speed === "number" ? Math.max(0.2, Math.min(2.0, parsed.speed)) : 0.6,
      intensity:
        typeof parsed.intensity === "number"
          ? Math.max(0.15, Math.min(0.9, parsed.intensity))
          : 0.38,
    };
  } catch {
    return { ...DEFAULT_PAPER_MOTION_CONFIG };
  }
}

// A single in-flight decode per URL; export must await it before drawing frame zero.
export function createImageLoader(cache: Record<string, HTMLImageElement>) {
  const pending = new Map<string, Promise<HTMLImageElement>>();
  return (url: string): Promise<HTMLImageElement> => {
    if (cache[url]) return Promise.resolve(cache[url]);
    const existing = pending.get(url);
    if (existing) return existing;
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        cache[url] = image;
        resolve(image);
      };
      image.onerror = () =>
        reject(new Error("Gambar gagal dimuat. Unggah ulang gambar sebelum render."));
      image.src = url;
    });
    pending.set(url, promise);
    void promise.finally(() => pending.delete(url)).catch(() => {});
    return promise;
  };
}

export function drawCover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
) {
  const scale = Math.max(width / image.width, height / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}

/**
 * Renders a soft, elegant animated white paper background with slow, smooth organic motion.
 * Avoids harsh/dark shadows, keeping the paper bright, clean, and gentle.
 */
export function drawAnimatedPaperBackdrop(
  ctx: CanvasRenderingContext2D,
  paperImages: HTMLImageElement | (HTMLImageElement | null)[] | null,
  width: number,
  height: number,
  time: number,
  config: PaperMotionConfig = DEFAULT_PAPER_MOTION_CONFIG,
  baseColor = "#faf8f5",
) {
  const isEnabled = config.enabled && config.style !== "statis";
  const speed = Math.max(0.2, config.speed || 0.6);
  // Controlled soft opacity: default 0.38 (gentle and translucent over white base)
  const softOpacity = Math.min(0.85, Math.max(0.15, config.intensity || 0.38));

  // 1. Draw solid, clean base paper background
  ctx.save();
  ctx.fillStyle = baseColor || "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // Normalize image pool
  const imagePool: HTMLImageElement[] = Array.isArray(paperImages)
    ? (paperImages.filter(Boolean) as HTMLImageElement[])
    : paperImages
      ? [paperImages]
      : [];

  if (imagePool.length === 0) return;

  // 2. Slow, gentle floating motion variables
  let panX = 0;
  let panY = 0;
  let zoom = 1.03;
  let angle = 0;

  if (isEnabled) {
    const slowTime = time * speed * 0.4;
    panX = Math.sin(slowTime * 0.6) * 8;
    panY = Math.cos(slowTime * 0.45) * 6;
    zoom = 1.03 + Math.sin(slowTime * 0.35) * 0.015;
    angle = Math.sin(slowTime * 0.25) * 0.0025; // ~0.15 degrees
  }

  const drawSinglePaperImage = (img: HTMLImageElement, alpha: number, flipH = false) => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.translate(width / 2 + panX, height / 2 + panY);
    if (angle !== 0) ctx.rotate(angle);
    ctx.scale(zoom * (flipH ? -1 : 1), zoom);

    const baseScale = Math.max(width / img.width, height / img.height) * 1.08;
    const w = img.width * baseScale;
    const h = img.height * baseScale;
    ctx.drawImage(img, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  if (!isEnabled) {
    // Statis: single soft paper frame without movement
    drawSinglePaperImage(imagePool[0] || imagePool[0], softOpacity);
    return;
  }

  if (config.style === "halus-lambat") {
    // Smooth crossfade between paper frames with slow drifting
    const cycleDuration = 3.6 / speed; // ~6 seconds per frame at default 0.6 speed
    const total = imagePool.length;
    const rawProgress = time / cycleDuration;
    const curIdx = Math.floor(rawProgress) % total;
    const nextIdx = (curIdx + 1) % total;
    const t = rawProgress - Math.floor(rawProgress);

    // Ease-in-out curve for smooth dissolve
    const fade = Math.sin((t * Math.PI) / 2);

    const curImg = imagePool[curIdx] || imagePool[0];
    const nextImg = imagePool[nextIdx] || curImg;

    if (curImg) {
      drawSinglePaperImage(curImg, softOpacity * (1 - fade * 0.6));
    }
    if (nextImg && nextImg !== curImg && fade > 0.01) {
      drawSinglePaperImage(nextImg, softOpacity * (fade * 0.6));
    }
  } else if (config.style === "stopmotion") {
    // Relaxed, slow stop-motion (~2.5 FPS)
    const step = Math.floor(time * (2.5 * speed));
    const total = imagePool.length;
    const curIdx = Math.abs(step) % total;
    const curImg = imagePool[curIdx] || imagePool[0];
    const flipH = Math.abs(step) % 2 === 1;
    if (curImg) {
      drawSinglePaperImage(curImg, softOpacity, flipH);
    }
  } else {
    // "drift": Single soft paper frame with slow, gentle continuous floating drift
    const curImg = imagePool[0];
    if (curImg) {
      drawSinglePaperImage(curImg, softOpacity);
    }
  }

  // 3. Delicate soft white sheen overlay (no dark vignette!)
  ctx.save();
  const sheenGrad = ctx.createLinearGradient(0, 0, width, height);
  sheenGrad.addColorStop(0, "rgba(255, 255, 255, 0.05)");
  sheenGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
  sheenGrad.addColorStop(1, "rgba(250, 245, 235, 0.03)");
  ctx.fillStyle = sheenGrad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}
