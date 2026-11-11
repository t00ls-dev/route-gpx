const texts = {
  app: {
    en: [
      'route-gpx — Route Planner & GPX Export',
      'Plan routes along real roads, choose stops and download complete GPX tracks. Free, open source, no API key or account needed.',
    ],
    pt: [
      'route-gpx — Planejador de rotas e exportação GPX',
      'Crie rotas pelas ruas, escolha pontos de passagem e baixe o traçado completo em GPX. Grátis, código aberto e sem cadastro.',
    ],
  },
  help: {
    en: [
      'route-gpx — Route Planning & GPX Help',
      'Learn to set route points, use the map, import and export GPX, estimate travel time, switch units and share routes with route-gpx.',
    ],
    pt: [
      'route-gpx — Ajuda para criar e exportar rotas',
      'Aprenda a definir pontos, usar o mapa, importar e exportar GPX, ajustar a velocidade média e compartilhar rotas no route-gpx.',
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
}
