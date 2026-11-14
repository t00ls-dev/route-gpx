import { updateSeo } from './seo';
import type { IconName } from './icons';
export type Language = 'en' | 'pt';
let language: Language = 'en';
const languageKey = 'language';
export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'pt';
}
export function getLanguage(): Language {
  return language;
}
export function detectLanguage(
  langs: readonly string[] = navigator.languages,
): Language {
  for (const lang of langs) {
    const prefix = lang.toLowerCase().split('-')[0];
    if (isLanguage(prefix)) return prefix;
  }
  return 'en';
}
export function storedLanguage(): Language | undefined {
  try {
    const value = localStorage.getItem(languageKey);
    return isLanguage(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
export function rememberLanguage(lang: Language): void {
  if (!isLanguage(lang)) return;
  try {
    localStorage.setItem(languageKey, lang);
  } catch {
    /* Optional preference. */
  }
}
export function preferredLanguage(): Language {
  return storedLanguage() ?? detectLanguage();
}
const pt: Record<string, string> = {
  'Add to home screen': 'Adicionar à tela inicial',
  'Open route-gpx from an icon, like an app. It opens in your browser, and saved routes open even without a connection.':
    'Abra o route-gpx por um ícone, como um app. Ele abre no navegador, e as rotas salvas abrem mesmo sem conexão.',
  'iPhone and iPad': 'iPhone e iPad',
  'Tap Share: in Safari, at the bottom of the screen or in the ⋯ menu; in Chrome, in the address bar.':
    'Toque em Compartilhar: no Safari, na parte de baixo da tela ou no menu ⋯; no Chrome, na barra de endereço.',
  "Choose Add to Home Screen. Scroll down if you don't see it.":
    'Escolha Adicionar à Tela de Início. Role a lista se não aparecer.',
  'Tap Add.': 'Toque em Adicionar.',
  'Open the browser menu ⋮, at the top right in Chrome.':
    'Abra o menu do navegador ⋮, no canto superior direito no Chrome.',
  'Choose Add to home screen. In Samsung Internet: Add page to, then Home screen.':
    'Escolha Adicionar à tela inicial. No Samsung Internet: Adicionar página a, depois Tela inicial.',
  'Confirm with Add. The phone may ask once more where to put it.':
    'Confirme em Adicionar. O celular pode perguntar mais uma vez onde colocar o ícone.',
  'More in Help': 'Mais na Ajuda',
  Navigate: 'Navegar',
  'Start navigation': 'Iniciar navegação',
  'End navigation': 'Sair da navegação',
  End: 'Sair',
  Stop: 'Parar',
  Navigation: 'Navegação',
  'Before you go': 'Antes de sair',
  'Avoid handling the phone while moving. Put it in a mount you can see and check the route before you leave.':
    'Evite mexer no celular em movimento. Prenda-o num suporte à vista e confira a rota antes de sair.',
  'Keep this tab open and the screen on. With the screen off or in another tab, the browser stops following you.':
    'Deixe esta aba aberta e a tela acesa. Com a tela apagada ou em outra aba, o navegador para de acompanhar você.',
  "Don't show this notice again": 'Não exibir mais este aviso',
  'Show the notice when navigation starts':
    'Mostrar o aviso ao iniciar a navegação',
  Then: 'Depois',
  'You have arrived': 'Você chegou',
  'Weak GPS signal': 'Sinal de GPS fraco',
  'Weak GPS': 'GPS fraco',
  'GPS on': 'GPS ativo',
  'Waiting for GPS': 'Aguardando o GPS',
  'Route overview': 'Ver a rota toda',
  'Re-center': 'Centralizar',
  'North up': 'Norte para cima',
  'Compass imprecise. Move the phone in a figure 8.':
    'Bússola imprecisa. Movimente o celular em forma de 8.',
  'This browser cannot draw the map. Follow the directions.':
    'Este navegador não consegue desenhar o mapa. Siga as indicações.',
  'Back to route': 'Volte à rota',
  'Recalculate route': 'Recalcular rota',
  'Recalculating…': 'Recalculando…',
  'Route recalculated': 'Rota recalculada',
  'Could not recalculate the route': 'Não foi possível recalcular a rota',
  'Off the route': 'Fora da rota',
  'Straight line, not by road': 'Em linha reta, não pelas ruas',
  'No map. The route and your position still show.':
    'Sem mapa. A rota e sua posição continuam na tela.',
  'Navigation needs location, which this browser does not offer here.':
    'A navegação precisa da localização, que este navegador não oferece aqui.',
  'No connection. The route on screen is kept; calculate it again when you are back online.':
    'Sem conexão. A rota na tela foi mantida; calcule de novo quando a conexão voltar.',
  'No connection. The route will be calculated when the connection returns.':
    'Sem conexão. A rota será calculada quando a conexão voltar.',
  'Network error.': 'Erro de rede.',
  'You are offline. The route on screen and saved routes still work; routing, search, weather, elevation and surface need a connection.':
    'Você está sem conexão. A rota na tela e as rotas salvas continuam funcionando; roteamento, busca, clima, elevação e pavimento precisam de conexão.',
  'Back to map': 'Voltar ao mapa',
  'Use link servers': 'Usar servidores do link',
  'Keep default servers': 'Manter servidores padrão',
  'View weather': 'Ver clima',
  'Show on map': 'Mostrar no mapa',
  Weather: 'Clima',
  'Light wind': 'Vento fraco',
  'Moderate wind': 'Vento moderado',
  'Strong wind': 'Vento forte',
  'Very strong wind': 'Vento muito forte',
  'Wind toward': 'Vento em direção a',
  'Zoom in to see them': 'Aproxime para ver',
  North: 'Norte',
  'North-east': 'Nordeste',
  East: 'Leste',
  'South-east': 'Sudeste',
  South: 'Sul',
  'South-west': 'Sudoeste',
  West: 'Oeste',
  'North-west': 'Noroeste',
  Headwind: 'Vento contra',
  Tailwind: 'Vento a favor',
  Crosswind: 'Vento lateral',
  'Calm wind': 'Vento calmo',
  'Wind unavailable': 'Vento indisponível',
  'Wind direction unavailable': 'Direção do vento indisponível',
  'Departure must be within the last 90 days.':
    'A saída deve estar nos últimos 90 dias.',
  'No alert': 'Sem alerta',
  'Alert 1': 'Alerta 1',
  'Alert 2': 'Alerta 2',
  'Alert 3': 'Alerta 3',
  'Weather along the route': 'Clima ao longo da rota',
  'Loading weather…': 'Buscando clima…',
  'Weather data license: CC BY 4.0': 'Licença dos dados do tempo: CC BY 4.0',
  'Try again': 'Tentar novamente',
  'Updating weather…': 'Atualizando clima…',
  'Passage times exceed the fetched interval.':
    'Os horários de passagem ultrapassam o intervalo consultado.',

  'Weather data by Open-Meteo': 'Dados do tempo por Open-Meteo',
  'Passage times and risk summaries calculated by route-gpx.':
    'Horários de passagem e resumos de risco calculados pelo route-gpx.',
  'Open-Meteo server': 'Servidor Open-Meteo',
  'Automatic departure': 'Saída automática',
  'Choose departure': 'Escolher saída',
  'Choose a departure to see the weather along the route.':
    'Escolha uma saída para ver o clima ao longo da rota.',
  'Choose a departure date and time.': 'Escolha uma data e hora de saída.',
  'Departure and arrival, including the weather margin, must fit within the 16-day forecast.':
    'A saída e a chegada, incluindo a margem da previsão, devem estar no horizonte de 16 dias.',
  'Calculate or import a route first.': 'Calcule ou importe uma rota primeiro.',
  'Weather service returned an invalid response.':
    'O serviço de clima retornou uma resposta inválida.',
  'Weather usage limit reached.': 'Limite de uso do clima atingido.',
  'Elevation usage limit reached.': 'Limite de uso da elevação atingido.',
  'Weather unavailable. Try again.': 'Clima indisponível. Tente novamente.',
  'Weather request timed out. Try again.':
    'O tempo da consulta de clima esgotou. Tente novamente.',
  'Weather network error. Check your connection and try again.':
    'Falha de rede no clima. Confira a conexão e tente novamente.',
  Thunderstorm: 'Trovoada',
  'Heavy rain': 'Chuva forte',
  'Rain risk': 'Risco de chuva',
  'Fog / low visibility': 'Neblina / baixa visibilidade',
  'Strong wind gusts': 'Rajadas de vento fortes',
  'Cold / possible ice': 'Frio / possível gelo',
  'Extreme heat': 'Calor extremo',
  'Some weather data unavailable': 'Alguns dados de previsão indisponíveis',
  'Clear sky': 'Céu limpo',
  'Mainly clear': 'Predominantemente limpo',
  'Partly cloudy': 'Parcialmente nublado',
  Overcast: 'Encoberto',
  Fog: 'Neblina',
  'Freezing fog': 'Neblina congelante',
  'Light drizzle': 'Garoa leve',
  'Moderate drizzle': 'Garoa moderada',
  'Dense drizzle': 'Garoa intensa',
  'Freezing drizzle': 'Garoa congelante',
  'Light rain': 'Chuva leve',
  'Moderate rain': 'Chuva moderada',
  'Freezing rain': 'Chuva congelante',
  'Light snow': 'Neve leve',
  'Moderate snow': 'Neve moderada',
  'Heavy snow': 'Neve forte',
  'Snow grains': 'Grãos de neve',
  'Rain showers': 'Pancadas de chuva',
  'Heavy rain showers': 'Pancadas fortes de chuva',
  'Snow showers': 'Pancadas de neve',
  'Thunderstorm with hail': 'Trovoada com granizo',
  'Weather unavailable': 'Tempo indisponível',

  'Map layers': 'Camadas do mapa',
  Standard: 'Padrão',
  Topographic: 'Topográfico',
  Satellite: 'Satélite',
  Labels: 'Rótulos',
  'Satellite imagery': 'Imagem de satélite',
  '2025 imagery is for non-commercial use. For commercial use, choose EOX 2016 in Settings.':
    'As imagens de 2025 são para uso não comercial. Para uso comercial, escolha EOX 2016 em Configurações.',
  'Share GPX': 'Compartilhar GPX',
  'Choose route point': 'Escolher ponto da rota',
  'Set as destination': 'Definir como destino',
  'Photon server': 'Servidor Photon',
  'Suggestions unavailable. Press Enter to search with Nominatim.':
    'Sugestões indisponíveis. Pressione Enter para buscar com Nominatim.',
  'No suggestions found. Press Enter to search with Nominatim.':
    'Nenhuma sugestão encontrada. Pressione Enter para buscar com Nominatim.',
  'GPX sharing unavailable. Use Download GPX instead.':
    'Compartilhamento de GPX indisponível. Use Baixar GPX.',
  'Could not share GPX. Use Download GPX instead.':
    'Não foi possível compartilhar o GPX. Use Baixar GPX.',
  'The route already has 50 points.': 'A rota já tem 50 pontos.',
  'Touch and hold to choose a route point':
    'Toque e segure para escolher um ponto da rota',
  'Route panel': 'Painel da rota',
  'Map credits': 'Créditos do mapa',
  '© OpenStreetMap contributors': '© colaboradores do OpenStreetMap',
  'Rendering © EOX::Maps': 'Renderização © EOX::Maps',
  Close: 'Fechar',
  'Detect region by IP': 'Detectar região pelo IP',
  'IP region service': 'Serviço de região por IP',
  'The region service receives your IP address. Only an approximate city view is used.':
    'O serviço de região recebe seu endereço IP. Apenas uma vista aproximada da cidade é usada.',
  'Use my location': 'Usar minha localização',
  'Full screen': 'Tela cheia',
  'Your location': 'Sua localização',
  'Close location': 'Fechar localização',
  'Route points are rounded to about 100 m before sharing or routing. Check the point on the map.':
    'Os pontos da rota são arredondados para cerca de 100 m antes de compartilhar ou calcular. Confira o ponto no mapa.',
  'Set as start': 'Definir como início',
  'Add as stop': 'Adicionar como parada',
  'Location requires HTTPS. Open the secure site or choose a point on the map.':
    'A localização exige HTTPS. Abra o site seguro ou escolha um ponto no mapa.',
  'This browser does not support location. Choose a point on the map.':
    'Este navegador não oferece localização. Escolha um ponto no mapa.',
  'Finding your location…': 'Buscando sua localização…',
  'Location found. Your route has not changed.':
    'Localização encontrada. Sua rota não foi alterada.',
  'Location permission denied. Allow location in your browser site settings, then try again. You can still plan routes without GPS.':
    'Permissão de localização negada. Libere a localização nas configurações deste site no navegador e tente novamente. Você pode continuar planejando rotas sem GPS.',
  'Location timed out. Move to an open area and try again, or choose a point on the map.':
    'O tempo para localizar esgotou. Vá para uma área aberta e tente novamente, ou escolha um ponto no mapa.',
  'Location unavailable. Check your device location settings or choose a point on the map.':
    'Localização indisponível. Confira as configurações de localização do aparelho ou escolha um ponto no mapa.',
  'Use an HTTPS service URL.': 'Use uma URL de serviço HTTPS.',
  Help: 'Ajuda',
  'Save route': 'Salvar rota',
  'Update saved route': 'Atualizar rota',
  'Saved routes': 'Rotas salvas',
  'No saved routes.': 'Nenhuma rota salva.',
  Open: 'Abrir',
  'Download GPX': 'Baixar GPX',
  Delete: 'Excluir',
  'Export backup': 'Exportar backup',
  'Import backup': 'Importar backup',
  'Saved route opened.': 'Rota salva aberta.',
  'Saved route deleted.': 'Rota salva excluída.',
  'Could not access saved routes.': 'Não foi possível acessar as rotas salvas.',
  'Local route storage is unavailable in this browser.':
    'O armazenamento local de rotas não está disponível neste navegador.',
  'Route saved on this device.': 'Rota salva neste dispositivo.',
  'Could not save locally. Download the GPX to keep it.':
    'Não foi possível salvar neste dispositivo. Baixe o GPX para guardar a rota.',
  'Choose a backup smaller than 50 MB.': 'Escolha um backup menor que 50 MB.',
  'Could not import this route backup.':
    'Não foi possível importar este backup de rotas.',

  'GPX name': 'Nome do GPX',
  'Average speed': 'Velocidade média',
  'Distance units': 'Unidades de distância',
  'Temperature units': 'Unidades de temperatura',
  Outbound: 'Ida',
  Return: 'Volta',
  'Automatic (km)': 'Automático (km)',
  'Automatic (mi)': 'Automático (mi)',
  'Automatic (°C)': 'Automático (°C)',
  'Automatic (°F)': 'Automático (°F)',
  Kilometers: 'Quilômetros',
  Miles: 'Milhas',
  'Calculate route': 'Calcular rota',
  Undo: 'Desfazer',
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
  Points: 'Pontos',
  'Add stop': 'Adicionar parada',
  Reverse: 'Inverter',
  'Address or lat, lon': 'Endereço ou lat, lon',
  'Prefer main roads': 'Preferir vias principais',
  Settings: 'Configurações',
  'Advanced: JSON': 'Avançado: JSON',
  'Fit route': 'Ver rota',
  'Set your start and destination.': 'Defina a origem e o destino.',
  'Updating…': 'Atualizando…',
  'Calculating…': 'Calculando…',
  'Route ready.': 'Rota pronta.',
  'Searching…': 'Buscando…',
  'Choose a place.': 'Escolha um lugar.',
  'GPX downloaded.': 'GPX baixado.',
  'Link copied.': 'Link copiado.',
  'Route imported. Edits recalculate only the changed sections.':
    'Rota importada. Alterações recalculam só os trechos alterados.',
  'Settings applied.': 'Configurações aplicadas.',
  'Finding directions…': 'Buscando direções…',
  'Directions not added: the road has changed. Calculate route to update it.':
    'Direções não adicionadas: a via mudou. Calcular rota a atualiza.',
  'Directions unavailable for this track.':
    'Direções indisponíveis para este trajeto.',
  'Directions unavailable. Try again later.':
    'Direções indisponíveis. Tente mais tarde.',
  'Highlighted roads are local sections to review.':
    'As vias destacadas são trechos locais para conferir.',
  'Import GPX, FIT or TCX': 'Importar GPX, FIT ou TCX',
  'Route points': 'Pontos da rota',
  'Round trip': 'Ida e volta',
  'Trip options': 'Opções da viagem',
  'More actions': 'Mais ações',
  'Close settings': 'Fechar configurações',
  'Route summary': 'Resumo da rota',
  'Route details': 'Detalhes da rota',
  "What's new": 'Novidades',
  Import: 'Importar',
  'Copy route link': 'Copiar link da rota',
  'Copy link': 'Copiar link',
  'My road trip': 'Minha viagem',
  'OSRM server': 'Servidor OSRM',
  'Valhalla fallback': 'Fallback Valhalla',
  'Nominatim server': 'Servidor Nominatim',
  'Apply settings': 'Aplicar configurações',
  'Points and settings (latitude, longitude)':
    'Pontos e configurações (latitude, longitude)',
  'Load current state': 'Carregar estado atual',
  'Apply JSON': 'Aplicar JSON',
  'Interactive map': 'Mapa interativo',
  'This route link is invalid. Start a new route below.':
    'O link da rota é inválido. Comece uma nova rota abaixo.',
  'Invalid coordinates. Use latitude, longitude (for example: -22.90, -43.18).':
    'Coordenadas inválidas. Use latitude, longitude (por exemplo: -22.90, -43.18).',
  'Routing server unavailable. Please try again.':
    'Servidor de roteamento indisponível. Tente novamente.',
  'A round trip would exceed the 50-point limit.':
    'A ida e volta ultrapassaria o limite de 50 pontos.',
  'No address found. Try a nearby street, city, or coordinates.':
    'Nenhum endereço encontrado. Tente uma rua próxima, cidade ou coordenadas.',
  'Search returned invalid coordinates.':
    'A busca retornou coordenadas inválidas.',
  'Address search unavailable. Try again later or paste coordinates.':
    'Busca de endereços indisponível. Tente mais tarde ou cole coordenadas.',
  'Choose a GPX smaller than 10 MB.': 'Escolha um GPX menor que 10 MB.',
  'Choose a file smaller than 10 MB.': 'Escolha um arquivo menor que 10 MB.',
  'This file is not a valid GPX, TCX or FIT file.':
    'Este arquivo não é um GPX, TCX ou FIT válido.',
  'No track or route geometry found in this TCX.':
    'Este TCX não contém geometria de trajeto ou rota.',
  'No track or route geometry found in this FIT.':
    'Este FIT não contém geometria de trajeto ou rota.',
  'The TCX contains invalid coordinates.':
    'O TCX contém coordenadas inválidas.',
  'This ZIP has no GPX, TCX or FIT file.':
    'Este ZIP não contém arquivo GPX, TCX ou FIT.',
  'This file is not a valid FIT.': 'Este arquivo não é um FIT válido.',
  'This FIT file is truncated.': 'Este arquivo FIT está incompleto.',
  'This FIT file is damaged (checksum mismatch).':
    'Este arquivo FIT está corrompido (soma de verificação não confere).',
  'This file has too many track points.':
    'Este arquivo tem pontos de trajeto demais.',
  'Invalid route link. Your current route has been kept.':
    'Link de rota inválido. Sua rota atual foi mantida.',
  'Invalid JSON state. Load the current state to see the expected format.':
    'Estado JSON inválido. Carregue o estado atual para ver o formato esperado.',
  'This file is not a valid GPX.': 'Este arquivo não é um GPX válido.',
  'No track or route geometry found in this GPX.':
    'Este GPX não contém geometria de trajeto ou rota.',
  'GPX point without coordinates.': 'Ponto do GPX sem coordenadas.',
  'The GPX contains invalid coordinates.':
    'O GPX contém coordenadas inválidas.',
  'OSRM returned an invalid route.': 'O OSRM devolveu uma rota inválida.',
  'Valhalla returned an invalid route.':
    'O Valhalla devolveu uma rota inválida.',
  'No driving route connects these points.':
    'Não há rota de carro conectando estes pontos.',
  'Use an HTTP(S) server URL without credentials, query or hash.':
    'Use uma URL HTTP(S) de servidor sem credenciais, parâmetros ou hash.',
  'Use HTTPS for a server accessed from this site.':
    'Use HTTPS para um servidor acessado por este site.',
  'This route link is invalid or too large.':
    'Este link de rota é inválido ou grande demais.',
  'This route link contains invalid points or options.':
    'Este link de rota contém pontos ou opções inválidos.',
  'No valid route geometry to export.':
    'Não há geometria de rota válida para exportar.',
  'Name your route before saving.': 'Dê um nome à rota antes de salvar.',
  'Valhalla could not find a route.': 'O Valhalla não encontrou uma rota.',
  'The search server returned an invalid response.':
    'O servidor de busca retornou uma resposta inválida.',
  'Region service requires HTTPS.': 'O serviço de região exige HTTPS.',
  'Distance and average speed must be valid positive numbers.':
    'A distância e a velocidade média devem ser números positivos válidos.',
  'Imported route': 'Rota importada',
  'Imported GPX': 'GPX importado',
  Depart: 'Partida',
  Arrive: 'Chegada',
  'U-turn': 'Retorno',
  'Sharp right': 'Forte à dir.',
  'Turn right': 'Vire à dir.',
  'Slight right': 'Leve à dir.',
  Straight: 'Em frente',
  'Slight left': 'Leve à esq.',
  'Turn left': 'Vire à esq.',
  'Sharp left': 'Forte à esq.',
  Continue: 'Siga',
  Roundabout: 'Rotatória',
  'Leave roundabout': 'Saia da rotatória',
  Ramp: 'Acesso',
  'Ramp left': 'Acesso à esq.',
  'Ramp right': 'Acesso à dir.',
  Exit: 'Saída',
  'Exit left': 'Saída à esq.',
  'Exit right': 'Saída à dir.',
  'Keep left': 'Fique à esq.',
  'Keep right': 'Fique à dir.',
  'Keep straight': 'Fique no centro',
  Merge: 'Entre na via',
  'Merge left': 'Entre pela esq.',
  'Merge right': 'Entre pela dir.',
  'Imported TCX': 'TCX importado',
  'Imported FIT': 'FIT importado',
  'Valhalla (fallback)': 'Valhalla (alternativo)',
  'Lock editing': 'Bloquear edição',
  'Unlock editing': 'Desbloquear edição',
  'Route locked. Map, export and sharing still work.':
    'Rota bloqueada. Mapa, exportação e compartilhamento continuam funcionando.',
  'Route locked. Unlock editing to change it.':
    'Rota bloqueada. Desbloqueie a edição para alterá-la.',
  'Editing unlocked.': 'Edição desbloqueada.',
  Daylight: 'Luz do dia',
  'Route coloring': 'Colorir a rota',
  Elevation: 'Elevação',
  'No significant climbs on this route.':
    'Nenhuma subida relevante nesta rota.',
  max: 'máx',
  Hardest: 'Mais difícil',
  'Check: tunnel or bridge?': 'Confira: túnel ou ponte?',
  'Loading elevation…': 'Buscando elevação…',
  'Elevation unavailable. Try again.':
    'Elevação indisponível. Tente novamente.',
  'Elevation service returned an invalid response.':
    'O serviço de elevação retornou uma resposta inválida.',
  'No elevation data for this route.': 'Sem dados de elevação para esta rota.',
  'Elevation estimated from terrain.': 'Altitude estimada pelo relevo.',
  'See the help.': 'Veja a ajuda.',
  'Recorded in the imported file.': 'Gravada no arquivo importado.',
  'Elevation here': 'Elevação aqui',
  Surface: 'Pavimento',
  'Valhalla returned an invalid response.':
    'O Valhalla retornou uma resposta inválida.',
  'Loading surface…': 'Buscando pavimento…',
  'Surface unavailable. Try again.': 'Pavimento indisponível. Tente novamente.',
  'Surface unavailable for part of the route.':
    'Pavimento indisponível em parte da rota.',
  'No unpaved stretches.': 'Nenhum trecho sem asfalto.',
  'From OpenStreetMap via Valhalla. Roads without a mapped surface count as paved; unpaved stretches are the mapped ones. Check before you leave.':
    'Do OpenStreetMap via Valhalla. Vias sem pavimento mapeado contam como pavimentadas; os trechos sem asfalto são os mapeados. Confira antes de sair.',
  'Valhalla usage limit reached. Try again later.':
    'Limite de uso do Valhalla atingido. Tente mais tarde.',
  Paved: 'Pavimentada',
  Unpaved: 'Sem asfalto',
  Unknown: 'Desconhecido',
  'No elevation data here.': 'Sem dados de elevação aqui.',
  'Elevation data: Copernicus DEM GLO-90 via Open-Meteo':
    'Dados de elevação: Copernicus DEM GLO-90 via Open-Meteo',
  'Route marks': 'Marcas da rota',
  'Direction arrows': 'Setas de direção',
  'Weather on the map': 'Clima no mapa',
  Grade: 'Inclinação',
  'Steep descent (8%+)': 'Descida íngreme (8%+)',
  'Descent (3–8%)': 'Descida (3–8%)',
  'Flat (under 3%)': 'Plano (menos de 3%)',
  'Climb (3–8%)': 'Subida (3–8%)',
  'Steep climb (8%+)': 'Subida íngreme (8%+)',
  None: 'Nenhuma',
  Day: 'Dia',
  Twilight: 'Crepúsculo',
  Dark: 'Escuro',
  'Choose a departure date': 'Escolha a data de saída',
  'Travel the route': 'Percorrer a rota',
  Play: 'Reproduzir',
  Pause: 'Pausar',
  'Playback speed': 'Velocidade da reprodução',
  'Position along the route': 'Posição na rota',
  'Very high UV': 'UV muito alto',
  'Extreme UV': 'UV extremo',
  Departure: 'Saída',
  Sunrise: 'Nascer do sol',
  Sunset: 'Pôr do sol',
  Distance: 'Distância',
  Time: 'Tempo',
  Arrival: 'Chegada',
  'Sun up all day': 'Sol o dia todo',
  'Sun down all day': 'Sem sol o dia todo',
  'None in the dark': 'Nada no escuro',
  'Today at the start:': 'Hoje no início:',
  'Choose a departure date to see dark sections.':
    'Escolha a data de saída para ver os trechos no escuro.',
  Start: 'Início',
  Destination: 'Destino',
  Via: 'Passagem',
};
const patterns: [RegExp, (...args: string[]) => string][] = [
  [
    /^Contains modified Copernicus Sentinel data (2016|2025)$/,
    (year) => `Contém dados Copernicus Sentinel modificados de ${year}`,
  ],
  [/^Open saved route: (.*?)$/, (n) => `Abrir rota salva: ${n}`],
  [/^Download saved route: (.*?)$/, (n) => `Baixar rota salva: ${n}`],
  [/^Delete saved route: (.*?)$/, (n) => `Excluir rota salva: ${n}`],
  [
    /^Imported 1 route\. Existing names were kept\.$/,
    () => '1 rota importada. Os nomes existentes foram mantidos.',
  ],
  [
    /^Imported (\d+) routes\. Existing names were kept\.$/,
    (n) => `${n} rotas importadas. Os nomes existentes foram mantidos.`,
  ],

  [/^At (.*?) (km\/h|mph) · no stops$/, (n, u) => `A ${n} ${u} · sem paradas`],
  [
    /^Rain (.+)% · (.+) (mm|in)$/,
    (chance, amount, unit) => `Chuva ${chance}% · ${amount} ${unit}`,
  ],
  [/^Location of point (\d+)$/, (n) => `Local do ponto ${n}`],
  [/^Results for point (\d+)$/, (n) => `Resultados do ponto ${n}`],
  [
    /^Set (the start|the destination|stop \d+) on the map$/,
    (p) =>
      `Defina ${p === 'the start' ? 'o início' : p === 'the destination' ? 'o destino' : 'a ' + t(p.replace('stop', 'Stop')).toLowerCase()} no mapa`,
  ],

  [/^(.+) in the dark$/, (distance) => `${distance} no escuro`],
  [/^(.+) in civil twilight$/, (distance) => `${distance} no crepúsculo civil`],
  [
    /^Dark from (.+) \((.+)\) to (.+) \((.+)\)$/,
    (from, start, to, end) =>
      `No escuro de ${from} (${start}) a ${to} (${end})`,
  ],
  [
    /^Leave by (.+) to arrive before sunset\.$/,
    (time) => `Saia até ${time} para chegar antes do pôr do sol.`,
  ],
  [
    /^Daylight at the start from (.+)\.$/,
    (time) => `Luz do dia no início a partir de ${time}.`,
  ],
  [
    /^UV (\d+(?:–\d+)?) · (Low|Moderate|High|Very high|Extreme)$/,
    (value, category) =>
      `UV ${value} · ${({ Low: 'baixo', Moderate: 'moderado', High: 'alto', 'Very high': 'muito alto', Extreme: 'extremo' } as Record<string, string>)[category]}`,
  ],
  [/^(.+) · (.+) left$/, (done, left) => `${done} · faltam ${left}`],
  [/^(\S+ (?:km|mi)) of (\S+ (?:km|mi))$/, (done, all) => `${done} de ${all}`],
  [
    /^(.+) · (daylight|twilight|dark)$/,
    (time, light) =>
      `${time} · ${({ daylight: 'dia', twilight: 'crepúsculo', dark: 'escuro' } as Record<string, string>)[light]}`,
  ],
  [/^About (-?[\d.,]+ (?:m|ft))$/, (value) => `Cerca de ${value}`],
  [
    /^Min (.+) · Max (.+) · Avg (.+)$/,
    (min, max, avg) => `Mín ${min} · Máx ${max} · Média ${avg}`,
  ],
  [
    /^(.+) · (.+) · Gain so far (.+) · Loss so far (.+)$/,
    (at, ele, up, down) =>
      `${at} · ${ele} · Ganho até aqui ${up} · Perda até aqui ${down}`,
  ],
  [
    /^Elevation gain (.+) · Elevation loss (.+)$/,
    (up, down) => `Ganho de elevação ${up} · Perda de elevação ${down}`,
  ],
  [/^Stop (\d+)$/, (n) => `Parada ${n}`],
  [
    /^Finding directions… (\d+)\/(\d+)$/,
    (a, b) => `Buscando direções… ${a}/${b}`,
  ],
  [
    /^(Weather|Elevation) usage limit reached\. Try again in (\d+)(s| min| h)\.$/,
    (kind, n, unit) =>
      `Limite de uso ${kind === 'Weather' ? 'do clima' : 'da elevação'} atingido. Tente em ${n}${unit}.`,
  ],
  [/^Recalculate in (\d+) s$/, (n) => `Recalcular em ${n} s`],
  [/^Climbs \((\d+)\)$/, (n) => `Subidas (${n})`],
  [/^Unpaved stretches \((\d+)\)$/, (n) => `Trechos sem asfalto (${n})`],
  [
    /^Surface is not available for this route: it would need more than (\d+) requests\.$/,
    (n) =>
      `Pavimento indisponível para esta rota: seriam necessários mais de ${n} pedidos.`,
  ],
  [/^Roundabout, exit (\d+)$/, (n) => `Rotatória, ${n}ª saída`],
  [
    /^Weather sampled at (\d+) of (\d+) stops\.$/,
    (a, b) => `Clima amostrado em ${a} de ${b} paradas.`,
  ],
  [/^Point (\d+)$/, (n) => `Ponto ${n}`],
  [
    /^(\d+) more samples? here(, none worse)?$/,
    (n, none) =>
      `${n} ${n === '1' ? 'amostra' : 'amostras'} a mais aqui${none ? ', nenhuma pior' : ''}`,
  ],
  [/^(\d+) of (\d+) with alerts$/, (a, b) => `${a} de ${b} com alerta`],
  [/^Check road positions: (.*?)$/, (p) => `Confira os pontos nas vias: ${p}`],

  [
    /^(.*?) · (.*?) points$/,
    // Providers combine as "Imported GPX + OSRM"; names without a key stay as is.
    (p, n) =>
      `${p
        .split(' + ')
        .map((part) => pt[part] ?? part)
        .join(' + ')} · ${n} pontos`,
  ],
  [/^1 road section to review$/, () => '1 trecho para conferir'],
  [/^(\d+) road sections to review$/, (n) => `${n} trechos para conferir`],
  [/^Itinerary \((\d+)\)$/, (n) => `Itinerário (${n})`],

  [/^(\d+) points$/, (n) => `${n} pontos`],
  [/^Select point (\d+)$/, (n) => `Selecionar ponto ${n}`],
  [/^Remove point (\d+)$/, (n) => `Remover ponto ${n}`],
  [
    /^Move point (\d+) (up|down)$/,
    (n, d) => `Mover ponto ${n} para ${d === 'up' ? 'cima' : 'baixo'}`,
  ],
  [/^(\d+)\. (Start|Destination|Via)$/, (n, kind) => `${n}. ${pt[kind]}`],
  [
    /^This link suggests other routing servers: (.+)\. The route uses the default servers\.$/,
    (hosts) =>
      `Este link sugere outros servidores de rota: ${hosts}. A rota usa os servidores padrão.`,
  ],
  [
    /^No route available\. Check the points or try again later\. (.*?) The fallback server also failed\.$/,
    (p) =>
      `Rota indisponível. Confira os pontos ou tente mais tarde. ${translate(p, 'pt')} O servidor alternativo também falhou.`,
  ],
  [
    /^Server returned HTTP (\d+)\.$/,
    (code) => `O servidor respondeu HTTP ${code}.`,
  ],
];
export function t(value: string): string {
  return translate(value, language);
}
/** Translates English source text into `lang` without changing the page language. */
export function translate(value: string, lang: Language): string {
  if (lang === 'en') return value;
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
  updateSeo(lang);
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

/** Open-Meteo WMO interpretation codes; text keys use the normal DOM translator. */
export function weatherDescription(code: number | null): {
  icon: IconName;
  text: string;
} {
  const codes: Record<number, [IconName, string]> = {
    0: ['weather-sun', 'Clear sky'],
    1: ['weather-partly-cloudy', 'Mainly clear'],
    2: ['weather-partly-cloudy', 'Partly cloudy'],
    3: ['weather-cloud', 'Overcast'],
    45: ['weather-fog', 'Fog'],
    48: ['weather-fog', 'Freezing fog'],
    51: ['weather-drizzle', 'Light drizzle'],
    53: ['weather-drizzle', 'Moderate drizzle'],
    55: ['weather-drizzle', 'Dense drizzle'],
    56: ['weather-freezing-rain', 'Freezing drizzle'],
    57: ['weather-freezing-rain', 'Freezing drizzle'],
    61: ['weather-rain', 'Light rain'],
    63: ['weather-rain', 'Moderate rain'],
    65: ['weather-heavy-rain', 'Heavy rain'],
    66: ['weather-freezing-rain', 'Freezing rain'],
    67: ['weather-freezing-rain', 'Freezing rain'],
    71: ['weather-snow', 'Light snow'],
    73: ['weather-snow', 'Moderate snow'],
    75: ['weather-snow', 'Heavy snow'],
    77: ['weather-snow', 'Snow grains'],
    80: ['weather-rain', 'Rain showers'],
    81: ['weather-rain', 'Rain showers'],
    82: ['weather-heavy-rain', 'Heavy rain showers'],
    85: ['weather-snow', 'Snow showers'],
    86: ['weather-snow', 'Snow showers'],
    95: ['weather-thunderstorm', 'Thunderstorm'],
    96: ['weather-hail', 'Thunderstorm with hail'],
    99: ['weather-hail', 'Thunderstorm with hail'],
  };
  const [icon, text] = codes[code ?? -1] ?? ['help', 'Weather unavailable'];
  return { icon, text };
}
