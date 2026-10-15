// @ts-nocheck
/**
 * Generates procedural, highly detailed manga-style panels as Base64 images
 * to act as beautiful defaults for the Manga Recap Studio.
 */
export function generateProceduralMangaPanel(index: number, width = 800, height = 600): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // Draw background - solid sky/atmosphere gradient
  const grad = ctx.createLinearGradient(0, 0, width, height);
  if (index === 0) {
    grad.addColorStop(0, "#111116");
    grad.addColorStop(1, "#333344");
  } else if (index === 1) {
    grad.addColorStop(0, "#110505");
    grad.addColorStop(1, "#2d1414");
  } else if (index === 2) {
    grad.addColorStop(0, "#081008");
    grad.addColorStop(1, "#182c18");
  } else {
    grad.addColorStop(0, "#0d0d0d");
    grad.addColorStop(1, "#262626");
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Add manga screentone / halftone dots simulation
  ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
  for (let y = 0; y < height; y += 8) {
    for (let x = y % 16 === 0 ? 0 : 4; x < width; x += 8) {
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw manga action border / split panel style
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 12;
  ctx.strokeRect(10, 10, width - 20, height - 20);

  // Helper for drawing speed lines
  const drawSpeedLines = (
    cx: number,
    cy: number,
    count: number,
    maxRadius: number,
    color = "rgba(255,255,255,0.75)",
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.1;
      const length = maxRadius * (0.4 + Math.random() * 0.6);
      const startDist = maxRadius * 0.25;
      const sx = cx + Math.cos(angle) * startDist;
      const sy = cy + Math.sin(angle) * startDist;
      const ex = cx + Math.cos(angle) * length;
      const ey = cy + Math.sin(angle) * length;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  };

  // Helper for drawing comic sound effects
  const drawSfxText = (text: string, x: number, y: number, angle: number, size = 52) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.font = `italic bold ${size}px 'Arial Black', sans-serif`;

    // Draw thick black background outline
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 14;
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeText(text, 0, 0);
    ctx.fillText(text, 0, 0);

    // Inner highlight stroke
    ctx.strokeStyle = "#ff3333";
    ctx.lineWidth = 2;
    ctx.strokeText(text, 0, 0);
    ctx.restore();
  };

  // Draw distinctive content based on the panel sequence
  if (index === 0) {
    // Panel 1: Hero Awakening (Epic face outline and central perspective speedlines)
    drawSpeedLines(width / 2, height / 2 - 50, 120, width * 0.7);

    // Draw stylized silhouette face
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(width / 2 - 80, height / 2 + 100);
    ctx.lineTo(width / 2, height / 2 - 40); // nose tip
    ctx.lineTo(width / 2 + 80, height / 2 + 100);
    ctx.lineTo(width / 2 + 30, height / 2 + 140);
    ctx.lineTo(width / 2 - 30, height / 2 + 140);
    ctx.closePath();
    ctx.fill();

    // Draw glowing eyes (White sharp triangles with red drop aura)
    ctx.shadowColor = "#ff2222";
    ctx.shadowBlur = 15;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(width / 2 - 45, height / 2 + 10);
    ctx.lineTo(width / 2 - 15, height / 2 + 15);
    ctx.lineTo(width / 2 - 40, height / 2 + 25);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(width / 2 + 45, height / 2 + 10);
    ctx.lineTo(width / 2 + 15, height / 2 + 15);
    ctx.lineTo(width / 2 + 40, height / 2 + 25);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = 0; // reset

    // SFX "DENG!" or "ZZAAPP!"
    drawSfxText("SHIIING!", width / 2, height / 2 - 130, -0.08, 64);

    // Manga layout grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    for (let u = 20; u < width; u += 40) {
      ctx.beginPath();
      ctx.moveTo(u, 20);
      ctx.lineTo(u + (Math.random() - 0.5) * 60, height - 20);
      ctx.stroke();
    }
  } else if (index === 1) {
    // Panel 2: The Forbidden Artifact / Mystic scroll
    // Central radial energy
    const radial = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, 250);
    radial.addColorStop(0, "rgba(255, 230, 100, 0.4)");
    radial.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = radial;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 250, 0, Math.PI * 2);
    ctx.fill();

    // Speed lines radiating outward
    drawSpeedLines(width / 2, height / 2, 70, width * 0.5, "rgba(255, 255, 255, 0.5)");

    // Draw ancient magic seal symbols simple outline
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 100, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 85, 0, Math.PI * 2);
    ctx.stroke();

    // Draw triangles in seal
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const x = width / 2 + Math.cos(angle) * 85;
      const y = height / 2 + Math.sin(angle) * 85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // SFX "WUUUSSH!"
    drawSfxText("WOOOSH!", width / 2 - 120, height / 2 - 140, 0.15, 50);
    drawSfxText("CRACKLE!", width / 2 + 100, height / 2 + 140, -0.1, 44);
  } else if (index === 2) {
    // Panel 3: Clash / Blade collision (Thunder, sparks, sharp diagonal splits)
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 10;
    // Massive diagonal lightning/clash slash
    ctx.beginPath();
    ctx.moveTo(20, height - 100);
    ctx.lineTo(width / 2 - 50, height / 2);
    ctx.lineTo(width / 2 - 10, height / 2 + 40);
    ctx.lineTo(width - 50, 50);
    ctx.stroke();

    // Slash spark circles
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, 40, 0, Math.PI * 2);
    ctx.fill();

    // Fast sharp shards / triangles flying out
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    for (let i = 0; i < 15; i++) {
      const sx = width / 2 + (Math.random() - 0.5) * 300;
      const sy = height / 2 + (Math.random() - 0.5) * 200;
      const size = 10 + Math.random() * 25;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + size, sy + size * 0.5);
      ctx.lineTo(sx - size * 0.3, sy + size * 1.5);
      ctx.closePath();
      ctx.fill();
    }

    // Heavy action vignettes
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    for (let j = 0; j < 360; j += 15) {
      const angle = (j / 180) * Math.PI;
      const r1 = 60 + Math.random() * 40;
      const r2 = 250 + Math.random() * 100;
      ctx.beginPath();
      ctx.moveTo(width / 2 + Math.cos(angle) * r1, height / 2 + Math.sin(angle) * r1);
      ctx.lineTo(width / 2 + Math.cos(angle) * r2, height / 2 + Math.sin(angle) * r2);
      ctx.stroke();
    }

    // Draw SFX "KA-BOOM!"
    drawSfxText("KRA-KOOM!", width / 2, height / 2 - 150, 0, 72);
  } else {
    // Panel 4: Dramatic Hero Face Profile Stand (Manga style cross-hatching shade)
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(20, 20, width - 40, height - 40);

    // Cross-hatching shading on left & right margins
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 1;
    for (let i = 10; i < 250; i += 8) {
      // diagonal lines top-left
      ctx.beginPath();
      ctx.moveTo(i, 20);
      ctx.lineTo(20, i);
      ctx.stroke();

      // diagonal lines bottom-right
      ctx.beginPath();
      ctx.moveTo(width - i, height - 20);
      ctx.lineTo(width - 20, height - i);
      ctx.stroke();
    }

    // Dramatic light ray lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 10; i++) {
      const rx = 100 + i * 60;
      ctx.beginPath();
      ctx.moveTo(rx, 20);
      ctx.lineTo(rx - 80, height - 20);
      ctx.stroke();
    }

    // Center focal object: Stylized Hero blade standing in the ground
    ctx.fillStyle = "#ffffff";
    // Sword body
    ctx.fillRect(width / 2 - 12, height / 2 - 140, 24, 250);
    // Tip triangle
    ctx.beginPath();
    ctx.moveTo(width / 2 - 12, height / 2 + 110);
    ctx.lineTo(width / 2, height / 2 + 140);
    ctx.lineTo(width / 2 + 12, height / 2 + 110);
    ctx.closePath();
    ctx.fill();
    // Handguard
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(width / 2 - 40, height / 2 - 155, 80, 15);
    // Grip
    ctx.fillRect(width / 2 - 8, height / 2 - 210, 16, 55);

    // Sparkles
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(width / 2 - 50, height / 2 + 20, 4, 0, Math.PI * 2);
    ctx.arc(width / 2 + 60, height / 2 + 70, 5, 0, Math.PI * 2);
    ctx.fill();

    drawSfxText("BA-DUM!", width / 2, height / 2 - 240, -0.05, 55);
  }

  // Draw Index stamp in small top corner to designate panel number
  ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
  ctx.fillRect(20, 20, 130, 40);
  ctx.font = "bold 16px 'Courier New', monospace";
  ctx.fillStyle = "#ff5555";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`PANEL #${index + 1}`, 35, 40);

  return canvas.toDataURL("image/png");
}
