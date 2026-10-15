import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI, Type } from "@google/genai";

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error(
      "GEMINI_API_KEY is not configured or uses placeholder. Please add your key in Settings > Secrets.",
    );
  }
  return new GoogleGenAI({ apiKey, httpOptions: { headers: { "User-Agent": "aistudio-build" } } });
}

export const Route = createFileRoute("/api/gemini/generate-script")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { panels } = await request.json();
          if (!panels || !Array.isArray(panels) || panels.length === 0) {
            return Response.json(
              { error: "Manga panels are required for generation" },
              { status: 400 },
            );
          }

          const ai = getGeminiClient();

          const parsedPanels = panels.map((p: any, i: number) => {
            let mimeType = "image/png";
            let data = "";
            if (p.url && p.url.startsWith("data:")) {
              const match = p.url.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
              if (match) {
                mimeType = match[1];
                data = match[2];
              }
            }
            return { mimeType, data, index: i };
          });

          const contents: any[] = [];
          contents.push({
            text: `Tugas Anda adalah menjadi narator ulung manga (recap video narrator) berbahasa Indonesia.
Kami memiliki beberapa gambar halaman manga berurutan dari storyboard kami.
Silakan analisis setiap gambar halaman manga yang dilampirkan secara berurutan sesuai nomor indeksnya (0 hingga ${parsedPanels.length - 1}) untuk menghasilkan alur cerita/narasi yang bersambung dan koheren.

PENTING - STRUKTUR GAMBAR (MULTI SUB-PANEL):
Setiap satu gambar/halaman yang dikirimkan seringkali terdiri dari beberapa kotak adegan kecil (sub-scenes/sub-panels) di dalamnya. Jangan meringkas seluruh halaman manga tersebut menjadi satu kalimat pendek saja yang membuat banyak kejadian penting terlewatkan!

SANGAT PENTING - CARA BACA & MENYUSUN ADEGAN (SCENE BY SCENE):
1. Anda wajib mencermati dan menceritakan seluruh adegan demi adegan (scene-per-scene) yang ada di dalam gambar halaman tersebut secara runut.
2. Cara membacanya adalah dari kanan ke kiri, lalu dari atas ke bawah (sesuai tata cara membaca manga Jepang asli).
3. Terangkan aksi, reaksi wajah, konflik, serta dialog dari masing-masing kotak adegan secara to-the-point dan sambungkan menjadi satu paragraf narasi halaman yang utuh dan komplit tanpa ada detail cerita yang terlewat.

ATURAN NASKAH NARASI:
1. Buat narasi dalam bahasa Indonesia sepenuhnya dari sudut pandang narator atau orang ketiga (narrator view). JANGAN gunakan sudut pandang orang pertama ("saya", "aku") atau sapaan langsung ke penonton ("kamu", "kalian").
2. Tulis naskah dengan gaya bahasa shonen/seinen recap yang menarik, dramatis, namun langsung membahas inti cerita (to the point).
3. Sangat dilarang keras untuk berbelit-belit, bertele-tele, basa-basi (seperti "Halo semuanya", "Selamat datang kembali", "Pada video kali ini kita akan membahas"), atau membuat asumsi palsu/halusinasi di luar informasi aksi visual panel manga tersebut (JANGAN halu atau berspekulasi berlebihan).
4. Pastikan teks narasi halaman tersebut merangkum seluruh jalinan rangkaian peristiwa kotak demi kotak yang ada secara dinamis dan padat.`,
          });

          parsedPanels.forEach((panel: any) => {
            contents.push({
              text: `--- GAMBAR PANEL INDEKS ${panel.index} ---`,
            });
            if (panel.data) {
              contents.push({
                inlineData: {
                  mimeType: panel.mimeType,
                  data: panel.data,
                },
              });
            }
          });

          contents.push({
            text: `Berikan respons Anda dalam format JSON dengan format terstruktur sebagai berikut:
{
  "scenes": [
    {
      "panelIndex": 0,
      "narration": "Teks narasi panel 0 sesuai gambar panel indeks 0. To the point, dramatis, sudut pandang orang ketiga."
    }
  ]
}`,
          });

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: contents,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                required: ["scenes"],
                properties: {
                  scenes: {
                    type: Type.ARRAY,
                    description: "Sequential list of generated narration strings matched to panels",
                    items: {
                      type: Type.OBJECT,
                      required: ["panelIndex", "narration"],
                      properties: {
                        panelIndex: { type: Type.INTEGER },
                        narration: {
                          type: Type.STRING,
                          description:
                            "To the point narrator text in Indonesian matching that panel page content",
                        },
                      },
                    },
                  },
                },
              },
            },
          });

          const parsedData = JSON.parse(response.text || "{}");
          return Response.json(parsedData);
        } catch (err: any) {
          console.error("AI Generate Script logic error:", err?.message);
          return Response.json(
            { error: err?.message || "Failed to generate script with Gemini" },
            { status: 500 },
          );
        }
      },
    },
  },
});
