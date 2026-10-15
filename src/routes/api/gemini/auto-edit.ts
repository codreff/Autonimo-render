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

export const Route = createFileRoute("/api/gemini/auto-edit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { scriptText, panelCount, audioBase64, audioMimeType } = await request.json();

          if (!panelCount || panelCount <= 0) {
            return Response.json({ error: "Panel count must be greater than 0" }, { status: 400 });
          }

          const ai = getGeminiClient();
          let responseText = "";

          if (audioBase64 && audioMimeType) {
            // MULTIMODAL MODE: Analyze actual user narration audio along with text script
            const audioPart = {
              inlineData: {
                mimeType: audioMimeType,
                data: audioBase64,
              },
            };

            const prompt = `
        You are an expert AI Video Editor and Director specializing in shonen and seinen manga recap videos.
        I am giving you an audio recording of a person narrating a story, along with the text script: "${scriptText || ""}".
        There are exactly ${panelCount} visual panels in our storyboard.
        
        Your task is to automatically edit and sync this audio to our ${panelCount} storyboard slides:
        1. Parse the voiceover audio and match the spoken sentences or passages under each of the ${panelCount} panels sequentially.
        2. Detect key scenes/transitions: determine exactly how long (in seconds) each of the ${panelCount} slides should be shown to align with the spoken vocal parts.
        3. For each of the ${panelCount} scenes, auto-select a suitable camera transition or Ken Burns movement based on the emotional pace: 'zoom-in' | 'zoom-out' | 'pan-left-to-right' | 'pan-right-to-left' | 'pan-top-to-bottom' | 'pan-bottom-to-top' | 'shaky-action' | 'manga-multi-focus'.
        4. Recommend a focus point/guide (for example "Aura pedang", "Ekspresi wajah terkejut", "Gelembung dialog", "Latar belakang kuil") to center interest.

        You MUST respond with a JSON object containing a "scenes" array. Each item in "scenes" MUST map to index 0 to ${panelCount - 1} and contain:
        - "panelIndex" (integer)
        - "duration" (number of seconds, matching the exact timing of the voiceover part)
        - "motionStyle" (string, transition name: 'zoom-in' | 'zoom-out' | 'pan-left-to-right' | 'pan-right-to-left' | 'pan-top-to-bottom' | 'pan-bottom-to-top' | 'shaky-action' | 'manga-multi-focus')
        - "subtitle" (string, Indonesian transcribed text from the corresponding audio segment)
        - "focusGuide" (string, focus guide prompt)

        Additionally provide a summary "overallPacing" (string) and "aiNarratorInsight" (string, Indonesian feedback comment highlighting the sync quality and detected tone).
      `;

            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: [audioPart, { text: prompt }],
              config: {
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  required: ["scenes"],
                  properties: {
                    scenes: {
                      type: Type.ARRAY,
                      description: "Sequential list of audio segments perfectly mapped to panels",
                      items: {
                        type: Type.OBJECT,
                        required: [
                          "panelIndex",
                          "duration",
                          "motionStyle",
                          "subtitle",
                          "focusGuide",
                        ],
                        properties: {
                          panelIndex: { type: Type.INTEGER },
                          duration: {
                            type: Type.NUMBER,
                            description: "Audio duration of spoken vocal in seconds",
                          },
                          motionStyle: { type: Type.STRING },
                          subtitle: {
                            type: Type.STRING,
                            description: "Transcribed spoken caption text",
                          },
                          focusGuide: { type: Type.STRING },
                        },
                      },
                    },
                    overallPacing: { type: Type.STRING },
                    aiNarratorInsight: {
                      type: Type.STRING,
                      description: "Brief Indonesian review of sync results",
                    },
                  },
                },
              },
            });

            responseText = response.text || "{}";
          } else {
            // TEXT-BASED PREDICTION MODE: Predict voice speed if no vocal recording is provided
            const prompt = `
        You are an expert AI Video Editor and Manga Recap Director.
        Analyze the following global narrative script and automatically edit a recap flow for exactly ${panelCount} storyboard panels:
        Script: "${scriptText || "Kael membuka pedang pusaka!"}"
        
        Since we do not have an active voiceover recording file, you must predict natural human timing (around 150 words-per-minute or 2.5 words/sec) to sync the narration sentences to each individual slide:
        1. Segment the script into exactly ${panelCount} distinct dramatic blocks.
        2. Assign each block its calculated duration in seconds.
        3. Detect the scene's emotional context and designate an optimal transition: 'zoom-in', 'zoom-out', 'pan-left-to-right', 'pan-right-to-left', 'pan-top-to-bottom', 'pan-bottom-to-top', 'shaky-action', or 'manga-multi-focus'.
        4. Detail a unique focus point/action spotlight for manga frame zoom focus.

        You MUST respond with a JSON object containing a "scenes" array. Each item in "scenes" MUST map to index 0 to ${panelCount - 1} and contain:
        - "panelIndex" (integer)
        - "duration" (number)
        - "motionStyle" (string, transition name: 'zoom-in' | 'zoom-out' | 'pan-left-to-right' | 'pan-right-to-left' | 'pan-top-to-bottom' | 'pan-bottom-to-top' | 'shaky-action' | 'manga-multi-focus')
        - "subtitle" (string, Indonesian sentence mapping sequentially)
        - "focusGuide" (string)

        Provide global "overallPacing" (string) and "aiNarratorInsight" (string, a cool Indonesian directing advice from the AI editor).
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
                      items: {
                        type: Type.OBJECT,
                        required: [
                          "panelIndex",
                          "duration",
                          "motionStyle",
                          "subtitle",
                          "focusGuide",
                        ],
                        properties: {
                          panelIndex: { type: Type.INTEGER },
                          duration: { type: Type.NUMBER },
                          motionStyle: { type: Type.STRING },
                          subtitle: { type: Type.STRING },
                          focusGuide: { type: Type.STRING },
                        },
                      },
                    },
                    overallPacing: { type: Type.STRING },
                    aiNarratorInsight: { type: Type.STRING },
                  },
                },
              },
            });

            responseText = response.text || "{}";
          }

          const parsedData = JSON.parse(responseText);
          return Response.json(parsedData);
        } catch (err: any) {
          console.error("AI Auto-Edit logic error:", err?.message);
          return Response.json(
            { error: err?.message || "Failed to edit video with Gemini Auto-Editor" },
            { status: 500 },
          );
        }
      },
    },
  },
});
