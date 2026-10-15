import { createFileRoute } from "@tanstack/react-router";
import { GoogleGenAI, Type } from "@google/genai";

const MOTION_STYLES =
  "'pan-left-to-right' | 'pan-right-to-left' | 'pan-top-to-bottom' | 'pan-bottom-to-top' | 'zoom-in' | 'zoom-out' | 'shaky-action'";

export const Route = createFileRoute("/api/gemini/analyze-script")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { scriptText, panelCount, provider } = await request.json();
          if (!scriptText) {
            return Response.json({ error: "Script text is required" }, { status: 400 });
          }

          const openApiKey = process.env["OPENAI_API_KEY"];
          const geminiKey = process.env["GEMINI_API_KEY"];
          const isUsingOpenAI =
            provider === "openai" || (!geminiKey && openApiKey && openApiKey !== "");

          if (isUsingOpenAI) {
            if (!openApiKey || openApiKey === "MY_OPENAI_API_KEY" || openApiKey === "") {
              return Response.json(
                {
                  error:
                    "OPENAI_API_KEY is not configured. Please add your key in Settings > Secrets.",
                },
                { status: 400 },
              );
            }

            const prompt = `
        You are an expert Manga Recap Video Director.
        Analyze the following recap script or storyboard outline and break it down into exactly ${panelCount || 5} structured visual scenes matching the storyboard sequence.

        For each scene, design:
        1. An engaging Indonesian subtitle caption (natural, dramatic shonen/seinen manga recap style).
        2. The perfect cinematic motion style: choice of ${MOTION_STYLES}.
        3. An estimated duration (in seconds, e.g., 4 to 8 seconds depending on the dialogue length).
        4. A short focus prompt describing what visual element of the manga panel to pay attention to.

        Recap Script Outline:
        "${scriptText}"

        You MUST respond with a JSON object containing a "scenes" array. Each item in "scenes" MUST have these exact properties:
        - "panelIndex" (number, 0-based index of the manga panel)
        - "subtitle" (string, Indonesian subtitle)
        - "motionStyle" (string, one of: ${MOTION_STYLES})
        - "duration" (number, duration in seconds between 3.5 and 7.5)
        - "focusGuide" (string, focus guide prompt)

        And optionally an "overallPacing" (string) describing the pace.
      `;

            const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openApiKey}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                response_format: { type: "json_object" },
                messages: [
                  {
                    role: "system",
                    content:
                      "You are an expert director helping in returning formatted storyboard JSON in response.",
                  },
                  { role: "user", content: prompt },
                ],
                temperature: 0.7,
              }),
            });

            if (!openaiResponse.ok) {
              const errText = await openaiResponse.text();
              throw new Error(`OpenAI API Error: ${openaiResponse.status} - ${errText}`);
            }

            const openaiData = (await openaiResponse.json()) as any;
            const content = openaiData.choices?.[0]?.message?.content;
            if (!content) throw new Error("Empty response from OpenAI");
            return Response.json(JSON.parse(content));
          }

          if (!geminiKey || geminiKey === "MY_GEMINI_API_KEY") {
            return Response.json(
              {
                error:
                  "GEMINI_API_KEY is not configured or uses placeholder. Please add your key in Settings > Secrets.",
              },
              { status: 400 },
            );
          }

          const ai = new GoogleGenAI({
            apiKey: geminiKey,
            httpOptions: { headers: { "User-Agent": "aistudio-build" } },
          });

          const prompt = `
      You are an expert Manga Recap Video Director.
      Analyze the following recap script or storyboard outline and break it down into exactly ${panelCount || 5} structured visual scenes matching the storyboard sequence.
      For each scene, design:
      1. An engaging Indonesian subtitle caption (natural, dramatic shonen/seinen manga recap style).
      2. The perfect cinematic motion style: choice of ${MOTION_STYLES}.
      3. An estimated duration (in seconds, e.g., 4 to 8 seconds depending on the dialogue length).
      4. A short focus prompt describing what visual element of the manga panel to pay attention to.

      Recap Script Outline:
      "${scriptText}"
    `;

          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                required: ["scenes"],
                properties: {
                  scenes: {
                    type: Type.ARRAY,
                    description:
                      "Array of storyboard scene instructions mapping sequentially to panels",
                    items: {
                      type: Type.OBJECT,
                      required: ["panelIndex", "subtitle", "motionStyle", "duration", "focusGuide"],
                      properties: {
                        panelIndex: {
                          type: Type.INTEGER,
                          description:
                            "0-based index of the manga panel image this scene corresponds to.",
                        },
                        subtitle: {
                          type: Type.STRING,
                          description:
                            "High-impact, engaging narrative subtitle in Indonesian for the scene.",
                        },
                        motionStyle: {
                          type: Type.STRING,
                          description: `Cinematic movement: ${MOTION_STYLES}`,
                        },
                        duration: {
                          type: Type.NUMBER,
                          description:
                            "Ideal voiceover duration for this panel in seconds (typically between 3.5 and 7.5).",
                        },
                        focusGuide: {
                          type: Type.STRING,
                          description:
                            "Description of what is happening or where focus shines on the panel.",
                        },
                      },
                    },
                  },
                  overallPacing: {
                    type: Type.STRING,
                    description:
                      "Brief summary profile: e.g. Fast-paced action, Suspensely slow, Epic hype.",
                  },
                },
              },
            },
          });

          return Response.json(JSON.parse(response.text || "{}"));
        } catch (err: any) {
          console.error("Script analysis error:", err?.message);
          return Response.json(
            { error: err?.message || "Failed to analyze script with AI" },
            { status: 500 },
          );
        }
      },
    },
  },
});
