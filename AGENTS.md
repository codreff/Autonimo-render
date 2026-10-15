<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Video backdrops are painted on the scene canvas for both preview and export; preload selected backdrop and panel images before encoding to prevent missing first-frame assets.
- Panel foregrounds and alpha-aware side shadows use the same scene canvas in preview and export; cache shadow rasters independently of animated zoom to avoid per-frame blur and CSS-only export differences.
- Background choice normalization and image loading live in `src/manga/utils/backgrounds.ts` so saved legacy choices and concurrent image decodes stay consistent.
- Home-screen installation uses a manifest and public raster icons only; do not add an app-shell service worker unless offline use is explicitly requested, to prevent stale preview caches.
