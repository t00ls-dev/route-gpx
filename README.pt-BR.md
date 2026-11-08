<img src="public/icons/icon.svg" width="64" height="64" alt="route-gpx" />

# route-gpx

Planeje rotas e exporte o traçado completo em GPX.

[Abrir o site](https://route-gpx.t00ls.dev/) · [English](README.md) · [Ajuda](https://route-gpx.t00ls.dev/help.html) · [Licença MIT](LICENSE)

<p>
  <a href="https://github.com/t00ls-dev/route-gpx/actions/workflows/ci-pages.yml"><img src="https://github.com/t00ls-dev/route-gpx/actions/workflows/ci-pages.yml/badge.svg?branch=main" alt="CI da branch main" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.23.4-339933" alt="Node.js 22.23.4 ou superior" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-blue" alt="Licença MIT" /></a>
</p>

## Recursos

- Mapa em toda a janela com painel lateral recolhível no desktop, folha inferior no celular e controles de tela cheia. Localize-se com permissão e, se desejar, escolha um ponto aproximado para a rota.
- Defina início, destino e paradas com endereços, coordenadas ou cliques no mapa.
- Mova e reordene pontos, inverta a rota, adicione um retorno e desfaça alterações.
- Confira distância, duração estimada e referências de vias; alterne entre quilômetros e milhas ou defina uma velocidade média.
- Importe GPX e exporte GPX 1.1 com segmentos completos do traçado e pontos de passagem nomeados.
- Consulte o clima ao longo da rota para uma data de saída, inclusive no passado recente; veja também o radar de chuva opcional.
- Compartilhe links de rotas e salve explicitamente rotas nomeadas neste navegador, com importação e exportação de backup JSON.

Uma ferramenta web estática feita com HTML, TypeScript, Vite e Leaflet. Não exige conta, chave de API nem backend da aplicação. A interface oferece inglês e português do Brasil pelo seletor no cabeçalho.

## Início rápido

1. Digite endereços ou `latitude, longitude` em **Início** e **Destino**, ou clique no mapa no desktop. Em telas de toque, segure um ponto do mapa por cerca de meio segundo e escolha sua função. Coordenadas são aplicadas automaticamente. Após três caracteres de endereço e uma breve pausa, surgem sugestões; toque em um resultado ou use setas e Enter. Enter sem sugestão selecionada consulta explicitamente o Nominatim.
2. Adicione paradas e ajuste os pontos. Confira a rota calculada, a distância e a duração.
3. Se desejar, preencha **Nome do GPX** e pressione **Baixar GPX**. O nome vale para o arquivo e o trajeto; quando vazio, são usados os pontos de início e destino.

Em telas pequenas, as ferramentas do mapa usam uma coluna de ícones, incluindo Desfazer, junto ao zoom. Dicas e nomes acessíveis identificam cada ação. Os campos de endereço sugerem locais ao digitar, sem botão de busca; o ícone de pin seleciona um ponto no mapa. O ícone de Ajuda explica os gestos de toque. Rotas salvas fica acima de Velocidade média, após os controles de edição.

Quando o navegador oferece suporte, **Compartilhar GPX** abre o menu de compartilhamento do aparelho com o mesmo arquivo GPX nomeado; cancelar não mostra erro. **Baixar GPX** continua disponível. O clique direito no desktop (ou Shift+F10 com o mapa em foco) abre o menu de pontos. Apenas o desenho da rota é simplificado para o zoom atual; a geometria do GPX e das rotas salvas e importadas permanece completa.

Para instruções passo a passo, consulte a [página de Ajuda](https://route-gpx.t00ls.dev/help.html).

## Comportamentos importantes

- Arquivos GPX importados podem ter até 10 MB. Os pontos e segmentos do traçado permanecem intactos até você editar um ponto, o que recalcula a rota. Links compartilhados contêm pontos de controle e opções, não a geometria importada, e recalculam ao abrir.
- **Nenhuma rota é salva automaticamente**. Preencha um nome e use **Salvar rota** para guardar a geometria exata no IndexedDB. Salvar com o mesmo nome atualiza a entrada. Reabrir uma rota salva não a recalcula. Exporte backups: limpar os dados do navegador pode remover as rotas salvas.
- O roteamento usa atualmente um perfil de carro. **Preferir vias principais** sinaliza possíveis trechos locais; não garante sua exclusão. As estimativas não incluem paradas nem trânsito em tempo real. Revise o resultado antes de usá-lo.
- Idioma e unidades de distância são independentes. Trocar unidades não altera as coordenadas do GPX. A velocidade média opcional muda a estimativa de tempo; desativá-la restaura a estimativa do roteador.

Rotas calculadas recentemente são reaproveitadas na memória da página por até 15 minutos (20 rotas), evitando consultas repetidas ao voltar aos mesmos pontos e configurações de roteamento. **Calcular rota** solicita explicitamente um resultado novo. Os caches de busca também são limitados em memória. Recarregar limpa esses caches; não há cache offline de rotas nem de tiles.

## Clima

Em **Clima**, escolha **Data e hora de saída**: o clima é consultado automaticamente após uma breve pausa, quando houver rota pronta. A saída é opcional e vem vazia; sem data não há consulta. A entrada e todos os horários exibidos usam o fuso do aparelho, inclusive mudanças de horário de verão. São aceitas saídas nos últimos **90 dias de calendário UTC**; saídas anteriores ou chegadas além do horizonte de previsão são rejeitadas. Datas passadas mostram **Estimativas do passado**, ou **Estimativas do passado e previsão** quando a viagem atravessa o momento atual. São estimativas arquivadas dos modelos, não observações exatas no ponto da rota. A data acompanha links e rotas salvas antigos compatíveis; ao reabrir, a previsão é consultada novamente, sem armazená-la. Falhas permitem **Tentar novamente**, sem repetição automática.

O traçado completo, inclusive GPX importado, determina a distância acumulada. Há amostras aproximadamente a cada 20 km, incluindo origem, destino e passagens. Abaixo de 20 km/h, o espaçamento é reduzido para cerca de uma hora de deslocamento (por exemplo, 5 km a 5 km/h). O máximo de 20 pontos (20 cards e 20 marcadores no mapa ao todo) tem prioridade, então rotas longas ou muitas passagens podem exigir intervalos maiores. Mais de 20 passagens distintas exige reduzir os pontos. A interface mostra a velocidade exata usada, em km/h ou mph: **60 km/h por padrão**, ou o valor ativado em **Velocidade média**. Pode ser ajustada para deslocamentos lentos ou rápidos; não é vinculada a um veículo. Paradas e trânsito não entram no cálculo. Alterar a velocidade recalcula os horários localmente enquanto o intervalo consultado cobrir a janela; se ultrapassar, use a opção de nova consulta. Deslocamentos mais lentos consultam automaticamente pontos adicionais quando o espaçamento menor exigir; deslocamentos mais rápidos reaproveitam os pontos existentes sem nova consulta. Alterar traçado, saída ou servidor atualiza a previsão automaticamente. Cada amostra tem um único card com horário, distância, condições e riscos, com ícones SVG em traço nos cards e versões coloridas e alinhadas no mapa. Os níveis 1, 2 e 3 usam amarelo, laranja e vermelho, além do rótulo de alerta; sem alerta, o card é neutro. Todos ficam visíveis, sem rolagem interna. Selecionar um ícone no mapa abre o painel e destaca o card de previsão correspondente, sem balão no mapa. Selecionar um card centraliza o mapa naquele ponto; no celular também recolhe o painel. Os cards funcionam com Enter e Espaço. O vento tem um ícone e é mostrado como contra, a favor ou lateral em relação ao sentido local do traçado, com velocidade nas unidades selecionadas. Usa-se a hora de previsão mais próxima: até 45° do vento vindo pela frente é contra, até 45° de trás é a favor e o restante é lateral; abaixo de 1 km/h é calmo. Em curvas usa-se o trecho de saída e no destino o de chegada. É vento do modelo a 10 m, não vento aparente nem cálculo de resistência dependente de trânsito/velocidade; abrigo local e relevo podem alterá-lo.

Os marcadores também mostram velocidade do vento e uma seta apontando **para onde o vento sopra**. As cores indicam vento contra (vermelho), a favor (verde), lateral (âmbar) ou calmo/indisponível (cinza). A direção relativa também aparece por texto nos cards e rótulos acessíveis. Os rótulos acessíveis classificam o vento médio: calmo <1 km/h, fraco 1–<20, moderado 20–<39, forte 39–<62 e muito forte ≥62. Esses [limites simplificados de Beaufort](https://www.canada.ca/en/environment-climate-change/services/general-marine-weather-information/understanding-forecasts/beaufort-wind-scale-table.html) são categorias de apresentação, separadas do limiar de alerta para rajadas de 60 km/h.

Fonte: [Open-Meteo](https://open-meteo.com/en/docs), endpoint configurável `https://api.open-meteo.com`, HTTPS/CORS e sem chave. Termos e documentação consultados em 2026-11-08: API gratuita **somente para uso não comercial**, sem garantia de disponibilidade. Limites publicados: 600 chamadas/minuto, 5.000/hora, 10.000/dia e 300.000/mês; mantenha o consumo abaixo desses tetos. Uma requisição agrupa listas de latitude/longitude, mas **cada localização conta**; mais de 10 variáveis ou mais de duas semanas aumenta a contagem, inclusive fracionada. São usadas oito variáveis horárias: temperatura, probabilidade e volume de precipitação, código do tempo, velocidade/direção do vento, rajadas e visibilidade. Consulte os [termos](https://open-meteo.com/en/terms), a [contagem de chamadas](https://open-meteo.com/en/pricing) e a [licença](https://open-meteo.com/en/licence).

O horizonte futuro é **16 dias de calendário UTC, contando hoje**, com os últimos **90 dias** disponíveis no mesmo endpoint usando datas horárias explícitas; saída, chegada e margem de uma hora devem caber nos horários disponíveis. A consulta única cobre saída até chegada, mais margem, arredondando a cobertura até o fim do dia UTC para permitir ajustes locais. As consultas são serializadas, com ao menos seis segundos entre inícios; um orçamento conservador em memória verifica também os limites por hora, dia e mês. O cache em memória de dez minutos guarda até 200 localizações arredondadas e 100.000 registros horários por página. Localizações já cobertas são reaproveitadas mesmo se a ordem ou a rota mudar; somente localizações distintas ausentes entram na nova requisição agrupada. Reutilizar o cache não prolonga sua validade. Não há repetição automática. Esses limites por página não controlam o tráfego agregado de abas, aparelhos ou de todo o projeto; interrompa ou reconfigure o uso antes de escalar.

Os dados são [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): a interface exibe “Dados do tempo por Open-Meteo”, o link da licença e a indicação de que horários de passagem e resumos de risco são calculados pelo route-gpx. A licença dos dados permite reutilização com atribuição, mas não elimina a restrição não comercial da API gratuita.

A classificação é uma ajuda de revisão, não um alerta oficial, e usa o pior caso na janela de ±1 hora (horas arredondadas para fora). Limiares: risco de chuva com probabilidade ≥60% ou volume ≥1 mm/h; chuva forte ≥10 mm/h; trovoada pelos códigos 95/96/99; neblina pelos códigos 45/48 ou visibilidade ≤1.000 m; rajadas ≥60 km/h; frio/possível gelo ≤2 °C ou códigos de congelamento; calor extremo ≥40 °C. Alertas aparecem por gravidade e dados ausentes são sinalizados. A previsão é aproximada, em grade de alguns quilômetros, pode não captar pancadas locais e fica menos confiável no futuro distante. A hora de passagem depende de trânsito, velocidade e paradas; não é possível avaliar aqui a precisão real da previsão. O GPX permanece idêntico, sem horários nos pontos.

## Radar de chuva

Ative **Radar de chuva** em **Camadas do mapa**. Ele fica desligado por padrão e não exige data de saída. O controle compacto sobre o mapa permite reproduzir/pausar e selecionar o horário. **Legenda e opacidade** expande as opções; a rota permanece visível sobre a imagem. Desative pelo mesmo menu. A escolha, as imagens e a área visualizada não entram em links, rotas salvas ou armazenamento persistente.

O [RainViewer](https://www.rainviewer.com/api.html) permite uso pessoal e educacional, sem chave, com atribuição visível “Radar por RainViewer”. A [documentação específica](https://www.rainviewer.com/api/weather-maps-api.html) e a [transição de 2026](https://www.rainviewer.com/api/transition-faq.html), consultadas em 2026-11-08, limitam a API às últimas duas horas, em passos de dez minutos, zoom nativo máximo 7 e 100 requisições/IP/minuto; não oferece previsão futura nem nuvens por satélite. A FAQ geral contém informações divergentes; adotamos as restrições da documentação específica. A página serializa metadados, máscara e imagens com intervalo mínimo de 800 ms (até 75 inícios/minuto), sem repetições automáticas. Isso não controla o consumo agregado de abas ou aparelhos no mesmo IP.

Somente os tiles visíveis do quadro selecionado são buscados; não há pré-carregamento de quadros, download em massa, service worker ou cache offline. Quadros já vistos usam cache limitado à memória (64 imagens ou 16 MB); metadados têm cache em memória de dois minutos, atualizado só ao ativar ou tentar novamente. Ao mover o mapa ou ocultar a aba, a reprodução pausa. Requisições obsoletas são canceladas. Ativar o radar envia ao RainViewer seu IP e a área visível do mapa, sem enviar a rota nem a data de saída.

A legenda usa refletividade em dBZ da paleta Universal Blue, não volume exato de chuva. A máscara sombreia regiões sem cobertura e é aproximada, atualizada com pouca frequência pelo provedor; transparência não comprova tempo seco. Horários indicam a geração do mosaico, com observações individuais possivelmente anteriores. Imagens com mais de 30 minutos são sinalizadas; ampliar além do nível nativo não acrescenta detalhes. A disponibilidade varia por região e não é garantida. O radar complementa a previsão do Open-Meteo; não substitui seus horários nem prevê a chegada da chuva.

## Serviços e privacidade

Escolher uma data de saída válida consulta automaticamente o Open-Meteo, enviando pontos ao longo da rota e o intervalo de datas e horas previsto. Sem data não há consulta ao serviço de clima. Dados do clima e amostras ficam somente na memória da página: nunca em localStorage, sessionStorage, IndexedDB, logs do site ou links. A saída é a única informação nova da viagem persistida, apenas nos fluxos existentes de link e salvamento explícito. A preferência de URL do servidor não contém locais. Rotas salvas pertencem ao navegador e à origem do site; mudar de domínio não as migra automaticamente. Use a exportação/importação de backup existente para transferi-las.

O site usa o provedor de tiles escolhido, OSRM para roteamento, Valhalla como alternativa, Photon para sugestões e Nominatim para busca explícita de endereços. Mapas, buscas e roteamento exigem conexão à internet. Esses provedores recebem os locais necessários para cada requisição; links compartilhados e backups também contêm locais. O site não define cookies nem usa analytics.

A vista inicial usa, em ordem: uma rota na URL, GPS já autorizado no navegador, região aproximada por IP e, depois, idioma e fuso horário do navegador (sem rede), com vista mundial como último recurso. **Usar minha localização** solicita a posição diretamente; o navegador pede permissão quando necessário, sem tela preliminar de confirmação. As coordenadas exatas do GPS ficam apenas na memória, nunca são armazenadas em links, localStorage, sessionStorage ou IndexedDB e nunca são enviadas a servidores do projeto nem aos serviços de roteamento/busca. Escolher **Definir como início** ou **Adicionar como parada** cria explicitamente uma coordenada arredondada (grade de cerca de 100 m), que segue o comportamento normal de compartilhamento, roteamento e salvamento de rotas. Confira o ponto no mapa. O provedor de tiles recebe requisições da área visível do mapa, inclusive quando centralizada por GPS.

**Detectar região pelo IP** vem ativado e pode ser desligado em **Configurações**; a URL do serviço é configurável. A [documentação do ipwho.is](https://ipwhois.io/documentation) e seus [termos](https://ipwhois.io/terms) oferecem um endpoint gratuito HTTPS, com CORS e sem chave. O limite publicado é de 1.000 requisições/dia, compartilhado por domínio para tráfego CORS do navegador; o uso comercial é permitido, sem garantia de disponibilidade. O navegador envia seu endereço IP ao provedor escolhido, como também faz com os servidores de tiles. O site faz no máximo uma tentativa por sessão da aba, com timeout de 3 s e sem repetições. Apenas um centro aproximado da cidade fica em cache na memória; um indicador de sessão evita novas requisições após recarregar. Falhas usam silenciosamente a vista definida pelo idioma e fuso horário locais. Preferências e estado do painel não contêm dados de localização.

As sugestões usam [Photon](https://github.com/komoot/photon#demo-server) em `https://photon.komoot.io` (configurável em Configurações). A política permite uso razoável em projetos, sem cota numérica nem garantia de disponibilidade; uso intenso pode ser bloqueado. HTTPS e CORS aberto foram verificados. O texto de endereço digitado e um viés do centro do mapa em escala de cidade são enviados após 3 caracteres e pausa de 300 ms, com limite de cinco resultados, cancelamento, cache em memória e inícios serializados com intervalo mínimo de 1 s. Entradas numéricas de coordenadas, inclusive incompletas, não geram sugestões. O Nominatim só é consultado por Enter, inclusive após falha do Photon, nunca automaticamente ao digitar. As requisições são espaçadas e usam cache quando aplicável, mas os serviços públicos têm capacidade limitada e nenhuma garantia de disponibilidade. Siga a [política do Nominatim](https://operations.osmfoundation.org/policies/nominatim/) e a [política de tiles](https://operations.osmfoundation.org/policies/tiles/); configure serviços próprios antes de ampliar o uso. O espaçamento no navegador não consegue impor um limite de uso compartilhado entre todos os dispositivos.

Todos os provedores externos também recebem o IP da requisição e os metadados normais do navegador e podem manter logs próprios conforme suas políticas. O GitHub Pages recebe pedidos dos arquivos do site; fragmentos de URL com o estado da rota não são enviados nas requisições HTTP. O cache HTTP comum dos tiles segue os cabeçalhos do provedor; o projeto não acrescenta armazenamento offline.

O roteamento envia coordenadas de controle e opções para `https://router.project-osrm.org`, ou `https://valhalla1.openstreetmap.de` na alternativa. Os dados de rota derivam do OpenStreetMap (ODbL), com créditos ao OpenStreetMap e ao provedor de roteamento. A [política do operador OSRM](https://routing.openstreetmap.de/about.html) permite no máximo uma requisição/segundo e documenta logs de rotas no servidor; a página espaça inícios de roteamento por ao menos 1,5 segundo. Não foi verificada uma cota numérica separada para o endpoint Valhalla. A busca usa `https://nominatim.openstreetmap.org` e `https://photon.komoot.io`, ambos com dados OSM/ODbL; entradas, limites e caches estão descritos acima. A região por IP usa `https://ipwho.is/`; a documentação do endpoint gratuito permite uso comercial sem chave, mas os termos gerais também contêm cláusulas de conta e redistribuição cuja aplicação deve ser confirmada antes de ampliar o uso.

Altere as URLs base dos serviços em **Configurações**. Serviços remotos precisam de HTTPS e devem permitir requisições entre origens no navegador. Para hospedagem própria, consulte a [documentação do OSRM](https://github.com/Project-OSRM/osrm-backend#quick-start) e a [documentação do Nominatim](https://nominatim.org/release-docs/latest/admin/Installation/).

O botão compacto **i** no canto inferior direito abre um modal com os créditos completos do mapa e os links das licenças da camada ativa, além dos créditos de previsão e radar. Os links abrem em nova aba; **Fechar**, Escape ou um toque fora do card fecha o modal e devolve o foco ao **i**. Trocar de camada fecha o modal e atualiza seu conteúdo. Em telas pequenas, o painel da rota encobre o controle enquanto está aberto; feche o painel para acessá-lo.

As camadas (botão Camadas do mapa) só são carregadas quando ativas; os Rótulos do satélite são opcionais e começam ligados. A escolha e a edição do satélite são preferências do aparelho, fora dos links e das rotas salvas. O provedor da camada ativa recebe seu IP e requisições de tiles da área visível; os rótulos enviam requisições adicionais da área visível à EOX. Não foi adicionado pré-carregamento, armazenamento offline nem service worker. Zoom acima da resolução nativa amplia os tiles existentes; não acrescenta detalhes.

| Camada                                   | Fonte e termos                                                                                                                       | Zoom nativo |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| Padrão                                   | [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/), dados ODbL e tiles com atribuição obrigatória                 | 19          |
| Topográfico                              | [OpenTopoMap](https://opentopomap.org/about#verwendung), OSM/SRTM, CC BY-SA 3.0; incorporação permitida com atribuição               | 17          |
| Satélite                                 | [EOxCloudless 2025](https://cloudless.eox.at/documentation/faq), mosaico Sentinel-2, CC BY-NC-SA 4.0; apenas projetos não comerciais | 14          |
| Alternativa de satélite em Configurações | [EOxCloudless 2016](https://cloudless.eox.at/documentation/faq), CC BY 4.0; permite também uso comercial incorporado                 | 14          |
| Rótulos                                  | [Sobreposição clara EOX::Maps](https://maps.eox.at/), dados OSM/ODbL; incorporação permitida com créditos OSM, EOX e MapServer       | 14          |

Esses serviços não garantem disponibilidade; respeite o uso justo, mantenha a atribuição e contate os provedores antes de ampliar o uso. A EOX não publica cota numérica e pode limitar picos. Seus mosaicos públicos mais novos proíbem uso comercial em produção; escolha 2016 para esse uso. O satélite é um mosaico regional de aproximadamente 10 m, não uma imagem em nível de rua nem ao vivo. Esri World Imagery foi avaliado e excluído: o [resumo de termos vinculado à camada](https://goto.arcgis.com/termsofuse/viewsummary) exige software Esri ou assinatura ArcGIS, incompatível com esta configuração sem conta. As licenças das imagens não mudam a licença MIT do código; capturas do mapa mantêm os termos e créditos das imagens respectivas.

## Desenvolvimento local

Use **Node.js 22 LTS, versão 22.23.4 ou superior** (Node 24 e 26+ também são aceitos):

```sh
npm ci
npm run dev
```

Abra `http://localhost:5173/`. Agentes de código seguem as instruções do projeto em [AGENTS.md](AGENTS.md); [CLAUDE.md](CLAUDE.md) as importa para o Claude Code.

Para compilar e visualizar a versão de produção:

```sh
npm run build
npm run preview
```

## Validação

Instale o Chromium uma vez para os testes de navegador e execute as verificações:

```sh
npx playwright install chromium
npm run lint
npm run format:check
npm test
npm run test:browser
npm run build
```

O Vitest cobre a lógica central e o Playwright cobre os fluxos no navegador. Os testes regulares simulam os serviços públicos. O comando opcional `npm run test:integration` consulta o OSRM real.

O Playwright pode dividir os testes locais sem mudar a configuração:

```sh
npm run test:browser -- --shard=1/2
npm run test:browser -- --shard=2/2
```

O CI atual executa todos os testes unitários e de navegador em um único job de verificação, com um worker Chromium e servidor de desenvolvimento Vite; ainda não usa shards nem relatórios mesclados. O TypeScript é verificado por `npm run build`. O teste opcional com OSRM real é ignorado intencionalmente nas execuções regulares. Testes de clima/radar fixam o relógio e simulam os serviços. Comandos manuais: `npm run format` (reescreve a formatação), `node scripts/generate-brand.mjs` (regenera assets da marca) e `node scripts/browser-check.mjs` (aceitação real); os dois últimos são pontos de entrada documentados, não arquivos órfãos.

O script separado de aceitação `node scripts/browser-check.mjs` exige um servidor local em execução ou `SITE_URL` apontando para um site publicado. Ele consulta serviços reais, lê `docs/example.gpx` como entrada e grava capturas, GPX baixado e relatório somente na pasta ignorada `.browser-check.local/`. Capturas não são versionadas nem incluídas nestes READMEs; use o logo do projeto na apresentação. Execute verificações reais apenas quando necessário.

## Publicação

O site é publicado em `https://route-gpx.t00ls.dev/` com HTTPS; o endereço antigo `https://t00ls-dev.github.io/route-gpx/` redireciona para ele. Rotas salvas pertencem à origem, portanto as rotas salvas no endereço antigo não ficam disponíveis no domínio novo.

O GitHub Actions executa verificações em pull requests e pushes para `main`. Builds bem-sucedidos do commit atual da `main` são publicados no GitHub Pages. O Vite usa `/` como caminho base para `https://route-gpx.t00ls.dev/`; ao mudar o caminho de hospedagem, atualize também os caminhos do manifest, URLs canônicas e de compartilhamento, sitemap e documentação. Veja as [notas sobre identidade e hospedagem](docs/BRAND.md).

## Créditos e licença

Feito com [Leaflet](https://leafletjs.com/), [OSRM](https://project-osrm.org/), [Valhalla](https://valhalla.github.io/valhalla/), [Nominatim](https://nominatim.org/), [Photon](https://github.com/komoot/photon), [Vite](https://vite.dev/) e [Vitest](https://vitest.dev/). Região por IP pelo [ipwho.is](https://ipwhois.io/). Mapas adicionais por [OpenTopoMap](https://opentopomap.org/about) e [EOX](https://maps.eox.at/). Dados do tempo por [Open-Meteo](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), com horários de passagem e resumos de risco calculados aqui. Radar por [RainViewer](https://www.rainviewer.com/), uso pessoal e educacional. Dados do mapa © [colaboradores do OpenStreetMap](https://www.openstreetmap.org/copyright).

A biblioteca Leaflet distribuída usa a licença BSD de 2 cláusulas; seu aviso completo está em [avisos de terceiros](public/THIRD_PARTY_NOTICES.txt) e é copiado para o build de produção.

O código da ferramenta é licenciado sob [MIT](LICENSE). Dados e dependências mantêm suas próprias licenças. Sem afiliação com os operadores dos serviços públicos.

[Relatar problema ou contatar o mantenedor](https://github.com/t00ls-dev/route-gpx/issues) · [Relatar problema no mapa](https://www.openstreetmap.org/fixthemap)
