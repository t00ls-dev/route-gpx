const texts = {
  app: {
    en: [
      'route-gpx — Route Planner & GPX Export',
      'Plan routes along real roads, import GPX, FIT or TCX, check weather, elevation and road surface on the way and download complete GPX tracks. Free, no account.',
    ],
    pt: [
      'route-gpx — Planejador de rotas e exportação GPX',
      'Crie rotas pelas ruas, importe GPX, FIT ou TCX, veja clima, elevação e pavimento no caminho e baixe o traçado completo em GPX. Grátis e sem cadastro.',
    ],
  },
  help: {
    en: [
      'route-gpx — Route Planning & GPX Help',
      'Learn to plan and edit routes, import GPX, FIT and TCX, read the itinerary, weather, elevation and surface, set speed and units, and save or share routes.',
    ],
    pt: [
      'route-gpx — Ajuda para criar e exportar rotas',
      'Aprenda a criar e editar rotas, importar GPX, FIT e TCX, ver itinerário, clima, elevação e pavimento, ajustar velocidade e unidades e salvar ou compartilhar.',
    ],
  },
  changelog: {
    en: [
      "route-gpx — What's New",
      'See what changed in route-gpx: new features, changes and fixes in the route planner and GPX export, newest first.',
    ],
    pt: [
      'route-gpx — Novidades',
      'Veja o que mudou no route-gpx: novos recursos, mudanças e correções no planejador de rotas e na exportação GPX, das mais recentes às mais antigas.',
    ],
  },
} as const;

const SITE = 'https://route-gpx.t00ls.dev/';
/**
 * Every page has one indexable URL per language: English at the bare path
 * (also x-default) and Portuguese with `?lang=pt`, matching the hreflang
 * alternates in the HTML and the sitemap. The canonical is set only here, so
 * the raw HTML never names the English URL as canonical of the Portuguese one.
 */
const PATHS = {
  app: '',
  help: 'help.html',
  changelog: 'changelog.html',
} as const;

/** `?lang=pt` for Portuguese, nothing for English (the bare URL). */
export function languageQuery(language: 'en' | 'pt'): string {
  return language === 'pt' ? '?lang=pt' : '';
}

export function canonicalUrl(
  language: 'en' | 'pt',
  page: keyof typeof texts = 'app',
): string {
  return SITE + PATHS[page] + languageQuery(language);
}

export function updateSeo(
  language: 'en' | 'pt',
  page: keyof typeof texts = 'app',
): void {
  const pt = language === 'pt';
  const [title, description] = texts[page][language];
  document.title = title;
  for (const selector of [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ])
    document.querySelector(selector)?.setAttribute('content', description);
  for (const selector of [
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
  ])
    document.querySelector(selector)?.setAttribute('content', title);
  document
    .querySelector('meta[property="og:locale"]')
    ?.setAttribute('content', pt ? 'pt_BR' : 'en_US');
  const url = canonicalUrl(language, page);
  let canonical = document.querySelector<HTMLLinkElement>(
    'link[rel=canonical]',
  );
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.append(canonical);
  }
  canonical.href = url;
  document
    .querySelector('meta[property="og:url"]')
    ?.setAttribute('content', url);
}
