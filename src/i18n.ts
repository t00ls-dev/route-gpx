export type Language = 'en' | 'pt';
let language: Language = 'en';
const pt: Record<string, string> = {
  Help: 'Ajuda',
  'Average speed must be between 1 and 200 km/h.':
    'A velocidade média deve ficar entre 1 e 200 km/h.',
  'Average speed': 'Velocidade média',
  'Use router estimate': 'Usar estimativa do roteador',
  'Enter an average speed greater than zero.':
    'Informe uma velocidade média maior que zero.',
  'Distance units': 'Unidades de distância',
  'Calculate route': 'Calcular rota',
  '↶ Undo': '↶ Desfazer',
  'Change undone.': 'Alteração desfeita.',
  'Set on map': 'Definir no mapa',
  'Set your start.': 'Defina a origem.',
  'Set your destination.': 'Defina o destino.',
  'Set all stops.': 'Defina todas as paradas.',
  'Enter a place, or paste coordinates.':
    'Digite um lugar ou cole coordenadas.',
  'Enter a place or valid coordinates.':
    'Informe um lugar ou coordenadas válidas.',

  'Round trip added. Check stops on divided roads.':
    'Ida e volta adicionada. Confira os pontos em vias de pistas separadas.',
  'Copy the link from your address bar.': 'Copie o link na barra de endereços.',
  'Return to start': 'Volta ao início',
  'Unnamed road': 'Via sem nome',
  'Zoom in': 'Aproximar',
  'Zoom out': 'Afastar',
  'Place your start on the map': 'Posicione a origem no mapa',

  'Plan your route': 'Criar rota',
  'Try example': 'Ver exemplo',
  'Describe a route': 'Descrever uma rota',
  Review: 'Revisar',
  Points: 'Pontos',
  '＋ Stop': '＋ Parada',
  '⇅ Reverse': '⇅ Inverter',
  'Place or coordinates': 'Lugar ou coordenadas',
  'Address or lat, lon': 'Endereço ou lat, lon',
  'Prefer main roads': 'Preferir vias principais',
  Settings: 'Configurações',
  'Advanced: JSON': 'Avançado: JSON',
  'Public, shared servers.': 'Servidores públicos e compartilhados.',
  '◎ Fit route': '◎ Ver rota',
  'Set your start and destination.': 'Defina a origem e o destino.',
  'Set all points.': 'Defina todos os pontos.',
  'Updating…': 'Atualizando…',
  'Calculating…': 'Calculando…',
  'Route ready.': 'Rota pronta.',
  'Searching…': 'Buscando…',
  'Choose a place.': 'Escolha um lugar.',
  'GPX downloaded.': 'GPX baixado.',
  'Link copied.': 'Link copiado.',
  'Review the places.': 'Confira os lugares.',
  'Create route': 'Criar rota',
  'Places found. Check the markers.': 'Lugares encontrados. Confira os pontos.',
  'GPX imported. Edits recalculate the route.':
    'GPX importado. Alterações recalculam a rota.',
  'Import GPX': 'Importar GPX',
  'From Metrô Uruguai via Postinho do Alto to Grumari':
    'De Metrô Uruguai passando por Postinho do Alto até Grumari',

  'Your road, point by point.': 'Seu caminho, ponto a ponto.',
  'Open source ↗': 'Código aberto ↗',

  'MAKE YOUR NEXT MOVE': 'PLANEJE A PRÓXIMA VIAGEM',
  'Take the scenic route.': 'A estrada é sua.',
  'Choose the roads you love.': 'Escolha por onde passar.',
  'Take every turn with you in GPX.': 'Leve cada curva com você em GPX.',
  '↗ Try Tijuca → Grumari': '↗ Testar Tijuca → Grumari',
  '↑ Import GPX': '↑ Importar GPX',
  'Describe your route': 'Descreva sua rota',
  'ON YOUR DEVICE': 'NO SEU DISPOSITIVO',
  'Use English or Portuguese. Start with “From”, add “via” stops, and finish with “to”. Or list one place per line.':
    'Use inglês ou português. Comece com “De”, acrescente “passando por” e termine com “até”. Ou informe um lugar por linha.',
  'Where would you like to go?': 'Por onde você quer passar?',
  'From Metrô Uruguai via Alto da Boa Vista via Postinho do Alto via Estrada das Furnas via Barra da Tijuca via Prainha to Grumari. Prefer main roads.':
    'De Metrô Uruguai passando por Alto da Boa Vista passando por Postinho do Alto passando por Estrada das Furnas passando por Barra da Tijuca passando por Prainha até Grumari. Prefira vias principais.',
  '↝ Review described route': '↝ Revisar descrição da rota',
  'Local text parser, not an AI service. Review the extracted places. Road and direction requests are guided by stops, not guaranteed.':
    'Interpretador de texto local, sem serviço de IA. Confira os lugares extraídos. Pedidos de vias e direção são guiados por pontos e precisam de revisão.',
  'Your itinerary': 'Seu itinerário',
  'Route points': 'Pontos da rota',
  'Select a point. Click the map, search an address, or paste lat, lon.':
    'Selecione um ponto. Clique no mapa, busque um endereço ou cole lat, lon.',
  '＋ Add a stop': '＋ Adicionar parada',
  '⇅ Reverse route': '⇅ Inverter rota',
  '↶ Round trip': '↶ Ida e volta',
  'Address or coordinates for the selected point':
    'Endereço ou coordenadas do ponto selecionado',
  'e.g. -22.6917362, -43.4589026': 'Ex.: -22.6917362, -43.4589026',
  Search: 'Buscar',
  'Addresses are searched only when you press Search.':
    'Endereços são buscados somente ao tocar em Buscar.',
  'Address results': 'Resultados de endereços',
  'Prefer major highways': 'Preferir vias principais',
  'Review the roads and guide your route with stops.':
    'Confira as vias e guie sua rota com pontos de passagem.',
  'Route summary': 'Resumo da rota',
  'From the first point to the last turn.': 'Do primeiro ponto à última curva.',
  'Set your start and destination to begin.':
    'Defina origem e destino para começar.',
  'Ready when you are.': 'Pronto para traçar seu caminho.',
  '↓ Download GPX': '↓ Baixar GPX',
  'Copy route link': 'Copiar link da rota',
  'Copy link': 'Copiar link',
  'Settings & privacy': 'Configurações e privacidade',
  'Trip name': 'Nome da viagem',
  'My road trip': 'Minha viagem',
  'OSRM server': 'Servidor OSRM',
  'Valhalla fallback': 'Fallback Valhalla',
  'Nominatim server': 'Servidor Nominatim',
  'Apply settings': 'Aplicar configurações',
  'No cookies or analytics. Points are stored in the link. Coordinates, searches and the map area are sent to your selected services. Avoid sharing links containing private locations.':
    'Sem cookies ou analytics. Os pontos ficam no link. Coordenadas, buscas e a área do mapa são enviados aos serviços escolhidos. Evite compartilhar links com locais privados.',
  'Public, shared servers: limited capacity and best-effort availability. Requests are spaced out. No address autocomplete or map downloads.':
    'Servidores públicos e compartilhados, com capacidade e disponibilidade limitadas. Requisições espaçadas. Sem autocompletar endereços ou baixar mapas.',
  'Nominatim usage policy ↗': 'Política de uso do Nominatim ↗',
  'Advanced: route state as JSON': 'Avançado: estado da rota em JSON',
  'Points and settings (latitude, longitude)':
    'Pontos e configurações (latitude, longitude)',
  'Load current state': 'Carregar estado atual',
  'Apply JSON': 'Aplicar JSON',
  'Made for the open road.': 'Feito para ir mais longe.',
  'Data © OpenStreetMap · OSRM · Valhalla · Leaflet · Nominatim':
    'Dados © OpenStreetMap · OSRM · Valhalla · Leaflet · Nominatim',
  'Interactive map': 'Mapa interativo',
  'Click the map to place a point': 'Clique no mapa para posicionar um ponto',
  '◎ Fit entire route': '◎ Ver rota inteira',
  'Select this point on the map': 'Selecionar este ponto no mapa',
  'Choose your start': 'Defina sua origem',
  'Choose your destination': 'Defina seu destino',
  'Choose a stop': 'Defina um ponto de passagem',
  'No highway references returned':
    'O roteador não retornou referências de rodovias',
  'Road references unavailable for imported tracks':
    'Referências de vias indisponíveis em trajetos importados',
  'Highway preference is a review aid. OSRM cannot guarantee a highway-only route; add stops on the roads you want.':
    'A preferência por vias principais auxilia a revisão. O OSRM não garante uma rota só por rodovias; adicione pontos nas vias desejadas.',
  'This route link is invalid. Start a new route below.':
    'O link da rota é inválido. Comece uma nova rota abaixo.',
  'Invalid coordinates. Use latitude, longitude (for example: -22.90, -43.18).':
    'Coordenadas inválidas. Use latitude, longitude (por exemplo: -22.90, -43.18).',
  'Place all points to calculate a driving route.':
    'Posicione todos os pontos para calcular a rota de carro.',
  'Route updated. Waiting briefly before recalculating…':
    'Rota alterada. Aguardando um instante antes de recalcular…',
  'Finding your route along the streets…': 'Calculando sua rota pelas ruas…',
  'Route ready. Review the roads, then download your GPX.':
    'Rota pronta. Confira as vias e baixe seu GPX.',
  'Routing server unavailable. Please try again.':
    'Servidor de roteamento indisponível. Tente novamente.',
  'A round trip would exceed the 50-point limit.':
    'A ida e volta ultrapassaria o limite de 50 pontos.',
  'Round trip added. Each direction will be routed along drivable streets. Check stops on divided roads for unwanted detours.':
    'Ida e volta adicionada. Cada sentido seguirá as vias permitidas para carros. Confira os pontos em vias com pistas separadas para evitar desvios.',
  'Invalid coordinates. Use latitude (-90 to 90), longitude (-180 to 180).':
    'Coordenadas inválidas. Use latitude (-90 a 90), longitude (-180 a 180).',
  'Enter at least three characters or a latitude, longitude pair.':
    'Informe ao menos três caracteres ou um par latitude, longitude.',
  'Searching for this address…': 'Buscando este endereço…',
  'No address found. Try a nearby street, city, or coordinates.':
    'Nenhum endereço encontrado. Tente uma rua próxima, cidade ou coordenadas.',
  'Search returned invalid coordinates.':
    'A busca retornou coordenadas inválidas.',
  'Choose an address result.': 'Selecione um resultado da busca.',
  'Address search unavailable. Try again later or paste coordinates.':
    'Busca de endereços indisponível. Tente mais tarde ou cole coordenadas.',
  'GPX downloaded with every geometry point and your stops.':
    'GPX baixado com todos os pontos da geometria e suas paradas.',
  'Route link copied. It contains the points and settings.':
    'Link copiado. Ele contém os pontos e as configurações.',
  'Copy the URL from your browser’s address bar to share this route.':
    'Copie a URL na barra de endereços do navegador para compartilhar esta rota.',
  'Choose a GPX smaller than 10 MB.': 'Escolha um GPX menor que 10 MB.',
  'Original GPX geometry preserved. Editing a point recalculates the track on streets. Shared links contain control points; they recalculate the route.':
    'Geometria original do GPX preservada. Editar um ponto recalcula o trajeto pelas ruas. Links compartilhados contêm os pontos de controle e recalculam a rota.',
  'Invalid route link. Your current route has been kept.':
    'Link de rota inválido. Sua rota atual foi mantida.',
  'Search area (optional)': 'Região da busca (opcional)',
  'e.g. Rio de Janeiro, Brazil': 'Ex.: Rio de Janeiro, Brasil',
  'Find places & build route': 'Buscar lugares e gerar rota',
  'The route changed. Review the description again.':
    'A rota mudou. Revise a descrição novamente.',
  'Give each point a place name or coordinates.':
    'Informe um lugar ou coordenadas para cada ponto.',
  'Places resolved using the first search match. Review every marker; routing starts automatically.':
    'Lugares definidos pelo primeiro resultado da busca. Confira cada marcador; o cálculo começa automaticamente.',
  'Review the places below. No address search has been sent yet.':
    'Revise os lugares abaixo. Nenhuma busca de endereço foi enviada ainda.',
  'Invalid JSON state. Load the current state to see the expected format.':
    'Estado JSON inválido. Carregue o estado atual para ver o formato esperado.',
  'Keep the description under 4,000 characters.':
    'Use até 4.000 caracteres na descrição.',
  'Include a start and a destination: “From A via B to C”, “De A passando por B até C”, or one place per line.':
    'Inclua origem e destino: “De A passando por B até C”, “From A via B to C” ou um lugar por linha.',
  'Use up to 25 places per description.': 'Use até 25 lugares por descrição.',
  'One place name is too long. Use a specific street or landmark.':
    'O nome de um lugar é longo demais. Use uma rua ou ponto de referência.',
  'This file is not a valid GPX.': 'Este arquivo não é um GPX válido.',
  'No track or route geometry found in this GPX.':
    'Este GPX não contém geometria de trajeto ou rota.',
  'GPX point without coordinates.': 'Ponto do GPX sem coordenadas.',
  'The GPX contains invalid coordinates.':
    'O GPX contém coordenadas inválidas.',
  'No driving route connects these points.':
    'Não há rota de carro conectando estes pontos.',
  'Use an HTTP(S) server URL without credentials, query or hash.':
    'Use uma URL HTTP(S) de servidor sem credenciais, parâmetros ou hash.',
  'Use HTTPS for a server accessed from this site.':
    'Use HTTPS para um servidor acessado por este site.',
  Start: 'Início',
  Destination: 'Destino',
  Via: 'Passagem',
};
const patterns: [RegExp, (...args: string[]) => string][] = [
  [/^At (.*?) (km\/h|mph) · no stops$/, (n, u) => `A ${n} ${u} · sem paradas`],
  [/^Location of point (\d+)$/, (n) => `Local do ponto ${n}`],
  [/^Search point (\d+)$/, (n) => `Buscar ponto ${n}`],
  [/^Results for point (\d+)$/, (n) => `Resultados do ponto ${n}`],
  [
    /^Set (Start|Destination|Stop \d+) on the map$/,
    (p) =>
      `Defina ${p === 'Start' ? 'o início' : p === 'Destination' ? 'o destino' : 'a ' + t(p).toLowerCase()} no mapa`,
  ],

  [/^Stop (\d+)$/, (n) => `Parada ${n}`],
  [/^Point (\d+)$/, (n) => `Ponto ${n}`],
  [/^Finding “(.*?)”…$/, (p) => `Buscando “${p}”…`],
  [/^Check road positions: (.*?)$/, (p) => `Confira os pontos nas vias: ${p}`],

  [/^(.*?) · (.*?) points$/, (p, n) => `${p} · ${n} pontos`],
  [/^Place point (\d+) on the map$/, (n) => `Posicione o ponto ${n} no mapa`],
  [/^(\d+) road sections to review$/, (n) => `${n} trechos para conferir`],
  [/^Roads \((\d+)\)$/, (n) => `Vias (${n})`],

  [/^(\d+) points$/, (n) => `${n} pontos`],
  [
    /^Click the map to place point (\d+)$/,
    (n) => `Clique no mapa para posicionar o ponto ${n}`,
  ],
  [/^Select point (\d+)$/, (n) => `Selecionar ponto ${n}`],
  [/^Name of point (\d+)$/, (n) => `Nome do ponto ${n}`],
  [/^Coordinates of point (\d+)$/, (n) => `Coordenadas do ponto ${n}`],
  [/^Remove point (\d+)$/, (n) => `Remover ponto ${n}`],
  [
    /^Move point (\d+) (up|down)$/,
    (n, d) => `Mover ponto ${n} para ${d === 'up' ? 'cima' : 'baixo'}`,
  ],
  [/^Described place (\d+)$/, (n) => `Lugar descrito ${n}`],
  [/^(\d+)\. (Start|Destination|Via)$/, (n, kind) => `${n}. ${pt[kind]}`],
  [/^Roads used \((\d+) sections\)$/, (n) => `Vias usadas (${n} trechos)`],
  [
    /^(.*?) · full geometry · (.*?) points$/,
    (provider, n) => `${provider} · geometria completa · ${n} pontos`,
  ],
  [
    /^(\d+) possible local-road sections of 500 m or more\. Check the road list and adjust your stops\. Access roads and ramps may be included\.$/,
    (n) =>
      `${n} possíveis trechos de vias locais com 500 m ou mais. Confira a lista e ajuste os pontos. Acessos e alças podem estar incluídos.`,
  ],
  [
    /^Finding “(.*?)”… \(public search, at most one request per second\)$/,
    (p) =>
      `Buscando “${p}”… (serviço público, no máximo uma requisição por segundo)`,
  ],
  [
    /^Could not find “(.*?)”\. Edit the place name or add a city\.$/,
    (p) =>
      `Não foi possível encontrar “${p}”. Edite o nome ou acrescente a cidade.`,
  ],
  [
    /^Invalid search result for “(.*?)”\.$/,
    (p) => `Resultado de busca inválido para “${p}”.`,
  ],
  [
    /^Some points were snapped more than 100 m to a drivable road: (.*?)\. Move them closer to your intended road\.$/,
    (p) =>
      `Alguns pontos foram ajustados mais de 100 m para uma via de carro: ${p}. Aproxime-os da via desejada.`,
  ],
  [
    /^No route available\. Check the points or try again later\. (.*?) The fallback server also failed\.$/,
    (p) =>
      `Rota indisponível. Confira os pontos ou tente mais tarde. ${p} O servidor alternativo também falhou.`,
  ],
];
export function t(value: string): string {
  if (language === 'en') return value;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (pt[normalized]) return pt[normalized];
  for (const [pattern, replace] of patterns) {
    const m = normalized.match(pattern);
    if (m) return replace(...m.slice(1));
  }
  return value;
}
const originals = new WeakMap<Node, string>();
const attributes = new WeakMap<Element, Map<string, string>>();
export function translateDocument(root: Document | Element = document): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('script,style,textarea,option')) continue;
    const original = originals.get(node) ?? node.nodeValue ?? '';
    originals.set(node, original);
    const translated = t(original);
    if (node.nodeValue !== translated) node.nodeValue = translated;
  }
  root.querySelectorAll('[placeholder],[aria-label],[title]').forEach((e) => {
    let map = attributes.get(e);
    if (!map) {
      map = new Map();
      attributes.set(e, map);
    }
    for (const attr of ['placeholder', 'aria-label', 'title']) {
      if (!e.hasAttribute(attr)) continue;
      const original = map.get(attr) ?? e.getAttribute(attr)!;
      map.set(attr, original);
      const translated = t(original);
      if (e.getAttribute(attr) !== translated) e.setAttribute(attr, translated);
    }
  });
}
export function setLanguage(lang: Language): void {
  language = lang;
  document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en';
  document.title =
    lang === 'pt'
      ? 'route-gpx · Seu caminho, ponto a ponto'
      : 'route-gpx · Your road, point by point';
  translateDocument();
}
export function observeTranslations(): void {
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      translateDocument();
    });
  }).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['placeholder', 'aria-label', 'title'],
  });
}
