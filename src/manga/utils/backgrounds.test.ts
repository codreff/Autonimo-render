import { describe, expect, it, vi } from "vitest";
import { BACKGROUND_CHOICES, createImageLoader, normalizeBackground } from "./backgrounds";

describe("Video backgrounds", () => {
  it("migrates navy and gray choices without losing other selections", () => {
    expect(normalizeBackground("navy")).toBe("kertas");
    expect(normalizeBackground("abu")).toBe("cream");
    expect(normalizeBackground("custom")).toBe("custom");
    expect(normalizeBackground(null)).toBe("kabur");
    expect(BACKGROUND_CHOICES.map((c) => c.value)).not.toContain("navy");
    expect(BACKGROUND_CHOICES.map((c) => c.value)).not.toContain("abu");
  });

  it("waits for decoding and shares a single request before export", async () => {
    const images: { onload?: () => void; src?: string }[] = [];
    vi.stubGlobal(
      "Image",
      class {
        constructor() {
          images.push(this);
        }
      },
    );
    try {
      const cache: Record<string, HTMLImageElement> = {};
      const load = createImageLoader(cache);
      const first = load("custom-image");
      const second = load("custom-image");
      expect(first).toBe(second);
      expect(cache["custom-image"]).toBeUndefined();
      expect(images).toHaveLength(1);
      images[0]?.onload?.();
      await first;
      expect(cache["custom-image"]).toBe(images[0]);
      expect(await load("custom-image")).toBe(images[0]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
