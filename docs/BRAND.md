# route-gpx identity

Do not version project UI screenshots or embed them in the README. Use the project logo; keep local verification captures in an ignored `*.local/` folder.

The route mark connects two points with a bend, matching the app's purpose. The wordmark is **route-gpx**. Keep the interface light and compact.

| Role                 | Color     |
| -------------------- | --------- |
| Primary / route mark | `#126447` |
| Main text            | `#1b2934` |
| Secondary text       | `#52616d` |
| Background           | `#ffffff` |
| Soft background      | `#edf5f1` |

Use the SVG in `public/icons/icon.svg` for scalable UI branding. PNG exports cover browser tabs, Apple home-screen icons, browser metadata icons and a maskable Android icon. `public/social-card.svg` is the editable source of the sharing preview.

Regenerate PNG files with `node scripts/generate-brand.mjs` (requires Chromium installed through Playwright). All assets are generated locally from repository SVGs.

The manifest supplies browser metadata and uses browser display mode. This is a web tool with no installation flow, service worker or offline cache. Routing and maps require an internet connection.

SEO metadata is present in the initial HTML, with localized titles and descriptions after a language change. Canonical URLs and sharing images never include a route hash or user coordinates. The sitemap lists only the application and help page. `public/robots.txt` and the sitemap target the custom-domain root, https://route-gpx.t00ls.dev/. Activation and HTTPS provisioning are pending; production still uses the Pages project URL. Complete that configuration before publishing a root-base build.

For a renamed repository or custom domain, update Vite's base, manifest `id`/`start_url`/`scope`, canonical and sharing URLs in both HTML files, and the sitemap.
