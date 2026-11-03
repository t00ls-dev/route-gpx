# Project guidance

- Present route-gpx as a route planner with GPX export. Keep public descriptions and sharing metadata neutral about transport mode and languages.
- Preserve accurate explanations of the routing services and their current driving profile where they help users understand routing behavior or configure a service. Do not change routing behavior solely to revise presentation.
- Keep localized SEO text, HTML metadata, manifest, social card, README introductions, and relevant tests consistent when changing the public description. Regenerate the social card PNG with `node scripts/generate-brand.mjs` after editing its SVG.
