# route-gpx identity

Do not version project UI screenshots or embed them in the README. Use the project logo; keep local verification captures in an ignored `*.local/` folder.

The route mark connects two points with a bend, matching the app's purpose. The wordmark is **route-gpx**. Keep the interface light and compact.

| Role                    | Token                    | Color     |
| ----------------------- | ------------------------ | --------- |
| Primary / route mark    | `--color-primary`        | `#126447` |
| Primary, hover and text | `--color-primary-strong` | `#0d4a35` |
| Main text               | `--color-text`           | `#1b2934` |
| Secondary text          | `--color-text-muted`     | `#52616d` |
| Background              | `--color-surface`        | `#ffffff` |
| Subtle background       | `--color-subtle`         | `#f5f7f8` |
| Soft background         | `--color-soft`           | `#edf5f1` |
| Dividers                | `--color-border`         | `#cbd4dc` |
| Control borders         | `--color-border-strong`  | `#8795a1` |
| Focus ring              | `--color-focus`          | `#0b72c6` |
| Errors                  | `--color-danger`         | `#a3262b` |
| Warnings                | `--color-warning`        | `#74420b` |

The tokens are defined once at the top of `src/style.css` for a single light, high-contrast theme. Text uses the system font stack (no web font is loaded): 15px on wide screens and 16px on phones, with at least 13px for secondary text and 16px in editable fields on touch screens. Controls are at least 44px tall, with 8px and 12px corner radii.

The planner is a 400px side panel next to the map on wide screens and a bottom sheet over the map on phones (closed, half or full height). Export actions stay in a bar below the scrolling panel, and map tools are icon-only buttons with accessible names.

Use the SVG in `public/icons/icon.svg` for scalable UI branding. PNG exports cover browser tabs, Apple home-screen icons, browser metadata icons and a maskable Android icon. `public/social-card.svg` is the editable source of the sharing preview.

Regenerate PNG files with `node scripts/generate-brand.mjs` (requires Chromium installed through Playwright). All assets are generated locally from repository SVGs.

The manifest supplies browser metadata and uses browser display mode. Its `theme_color` and `background_color` match the HTML `theme-color` (`#ffffff`), so the browser bar blends with the white header of the light theme; the primary green stays in the icons and route mark. This is a web tool with no installation flow, service worker or offline cache. Routing and maps require an internet connection.

SEO metadata is present in the initial HTML, with localized titles and descriptions after a language change. Canonical URLs and sharing images never include a route hash or user coordinates. The sitemap lists only the application and help page. `public/robots.txt` and the sitemap target the custom-domain root, https://route-gpx.t00ls.dev/, which GitHub Pages serves with enforced HTTPS; the old project URL https://t00ls-dev.github.io/route-gpx/ redirects there.

For a renamed repository or custom domain, update Vite's base, manifest `id`/`start_url`/`scope`, canonical and sharing URLs in both HTML files, and the sitemap.
