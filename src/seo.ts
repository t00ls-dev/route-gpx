export function updateSeo(
  language: 'en' | 'pt',
  page: 'app' | 'help' = 'app',
): void {
  const pt = language === 'pt';
  const title =
    page === 'app'
      ? pt
        ? 'route-gpx — Planejador de rotas e exportação GPX'
        : 'route-gpx — Route Planner & GPX Export'
      : pt
        ? 'route-gpx — Ajuda para criar e exportar rotas'
        : 'route-gpx — Route Planning & GPX Help';
  const description =
    page === 'app'
      ? pt
        ? 'Crie rotas pelas ruas, escolha pontos de passagem e baixe o traçado completo em GPX. Grátis, código aberto e sem cadastro.'
        : 'Plan routes along real roads, choose stops and download complete GPX tracks. Free, open source, no API key or account needed.'
      : pt
        ? 'Aprenda a definir pontos, usar o mapa, importar e exportar GPX, ajustar a velocidade média e compartilhar rotas no route-gpx.'
        : 'Learn to set route points, use the map, import and export GPX, estimate travel time, switch units and share routes with route-gpx.';
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
