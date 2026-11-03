# route-gpx identity

The route mark connects two points with a bend, matching the app's purpose. The wordmark is **route-gpx**. Keep the interface light and compact.

| Role                 | Color     |
| -------------------- | --------- |
| Primary / route mark | `#126447` |
| Main text            | `#1b2934` |
| Secondary text       | `#52616d` |
| Background           | `#ffffff` |
| Soft background      | `#edf5f1` |

Use the SVG in `public/icons/icon.svg` for scalable UI branding. PNG exports cover browser tabs, Apple home-screen icons, standard app icons and a maskable Android icon. `public/social-card.svg` is the editable source of the sharing preview.

Regenerate PNG files with `node scripts/generate-brand.mjs` (requires Chromium installed through Playwright). All assets are generated locally from repository SVGs.

The manifest supports standalone display where the browser allows installation. Routing and maps require an internet connection; the app does not install an offline service worker or cache map tiles for offline use.

SEO metadata is present in the initial HTML, with localized titles and descriptions after a language change. Canonical URLs and sharing images never include a route hash or user coordinates. The sitemap lists only the application and help page. `public/robots.txt` is portable to origin-root/custom-domain hosting; on a GitHub Pages project URL, crawlers consult the domain-root robots file. Page-level robots metadata and the project sitemap remain available.

For a renamed repository or custom domain, update Vite's base, manifest `id`/`start_url`/`scope`, canonical and sharing URLs in both HTML files, and the sitemap.
