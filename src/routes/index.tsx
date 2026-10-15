import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

// The manga studio is a fully client-side app (WebCodecs, WebGL, canvas,
// Firebase) — its module must never be evaluated during SSR.
const MangaApp = lazy(() => import("../manga/App"));

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "AUTO EDIT MANGA — Studio Video Recap Manga Otomatis" },
      {
        name: "description",
        content:
          "Ubah panel manga menjadi video recap sinematik otomatis: storyboard AI, sinkronisasi narasi, dan ekspor H.264 lewat GPU (WebCodecs) agar HP tetap dingin.",
      },
      { property: "og:title", content: "AUTO EDIT MANGA — Studio Video Recap Manga Otomatis" },
      {
        property: "og:description",
        content:
          "Storyboard AI, sinkronisasi suara otomatis, dan ekspor video H.264 berakselerasi GPU langsung dari browser HP.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <ClientOnly
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
          Memuat studio…
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-400">
            Memuat studio…
          </div>
        }
      >
        <MangaApp />
      </Suspense>
    </ClientOnly>
  );
}
