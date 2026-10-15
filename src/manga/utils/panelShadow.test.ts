import { describe, expect, it, vi } from "vitest";
import { createPanelShadowCache } from "./panelShadow";

describe("panel side shadows", () => {
  it("reuses a shadow across animation and proportional 720p/1080p output", () => {
    const bufferContext = { drawImage: vi.fn() };
    const buffer = { width: 0, height: 0, getContext: () => bufferContext };
    const create = vi
      .spyOn(document, "createElement")
      .mockReturnValue(buffer as unknown as HTMLCanvasElement);
    try {
      const image = { src: "panel", width: 400, height: 600 } as HTMLImageElement;
      const ctx = { canvas: { width: 1280, height: 720 }, drawImage: vi.fn() };
      const draw = createPanelShadowCache();
      draw(ctx as unknown as CanvasRenderingContext2D, image, 0, 0, 480, 720, 1280, "shadow-color");
      draw(ctx as unknown as CanvasRenderingContext2D, image, 0, 0, 528, 792, 1280, "shadow-color");
      ctx.canvas = { width: 1920, height: 1080 };
      draw(
        ctx as unknown as CanvasRenderingContext2D,
        image,
        0,
        0,
        720,
        1080,
        1920,
        "shadow-color",
      );
      expect(create).toHaveBeenCalledTimes(1);
      expect(bufferContext.drawImage).toHaveBeenCalledTimes(2);
      expect(ctx.drawImage).toHaveBeenCalledTimes(3);
      const preview = ctx.drawImage.mock.calls[0];
      const output = ctx.drawImage.mock.calls[2];
      for (let i = 1; i < 5; i++) expect(output?.[i]).toBeCloseTo(preview?.[i] * 1.5);
    } finally {
      create.mockRestore();
    }
  });
});
