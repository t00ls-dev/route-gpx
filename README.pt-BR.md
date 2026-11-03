# route-gpx

Planeje rotas e exporte o traçado completo em GPX.

[Abrir o aplicativo](https://t00ls-dev.github.io/route-gpx/) · [English](README.md) · [Ajuda](https://t00ls-dev.github.io/route-gpx/help.html) · [Licença MIT](LICENSE)

![Rota de Tijuca a Grumari no route-gpx](docs/screenshot.png)

## Recursos

- Mapa em toda a janela com painel lateral recolhível no desktop, folha inferior no celular e controles de tela cheia. Localize-se com permissão e, se desejar, escolha um ponto aproximado para a rota.
- Defina início, destino e paradas com endereços, coordenadas ou cliques no mapa.
- Mova e reordene pontos, inverta a rota, adicione um retorno e desfaça alterações.
- Confira distância, duração estimada e referências de vias; alterne entre quilômetros e milhas ou defina uma velocidade média.
- Importe GPX e exporte GPX 1.1 com segmentos completos do traçado e pontos de passagem nomeados.
- Compartilhe links de rotas e salve explicitamente rotas nomeadas neste navegador, com importação e exportação de backup JSON.

Um aplicativo estático feito com HTML, TypeScript, Vite e Leaflet. Não exige conta, chave de API nem backend da aplicação. A interface oferece inglês e português do Brasil pelo seletor no cabeçalho.

## Início rápido

1. Digite endereços ou `latitude, longitude` em **Início** e **Destino**, ou clique no mapa no desktop. Em telas de toque, segure um ponto do mapa por cerca de meio segundo e escolha sua função. Coordenadas são aplicadas automaticamente; para endereços, pressione **Buscar** ou Enter e selecione um resultado. **Ver exemplo** carrega um itinerário de exemplo. Surgem sugestões ao digitar; setas e Enter selecionam uma. Sem sugestão selecionada, **Buscar** ou Enter consulta explicitamente o Nominatim.
2. Adicione paradas e ajuste os pontos. Confira a rota calculada, a distância e a duração.
3. Se desejar, preencha **Nome do GPX** e pressione **Baixar GPX**. O nome vale para o arquivo e o trajeto; quando vazio, são usados os pontos de início e destino.

Quando o navegador oferece suporte, **Compartilhar GPX** abre o menu de compartilhamento do aparelho com o mesmo arquivo GPX nomeado; cancelar não mostra erro. **Baixar GPX** continua disponível. O clique direito no desktop (ou Shift+F10 com o mapa em foco) abre o menu de pontos. Apenas o desenho da rota é simplificado para o zoom atual; a geometria do GPX e das rotas salvas e importadas permanece completa.

Para instruções passo a passo, consulte a [página de Ajuda](https://t00ls-dev.github.io/route-gpx/help.html). Há também um [GPX de exemplo](docs/example.gpx).

## Comportamentos importantes

- Arquivos GPX importados podem ter até 10 MB. Os pontos e segmentos do traçado permanecem intactos até você editar um ponto, o que recalcula a rota. Links compartilhados contêm pontos de controle e opções, não a geometria importada, e recalculam ao abrir.
- **Nenhuma rota é salva automaticamente**. Preencha um nome e use **Salvar rota** para guardar a geometria exata no IndexedDB. Salvar com o mesmo nome atualiza a entrada. Reabrir uma rota salva não a recalcula. Exporte backups: limpar os dados do navegador pode remover as rotas salvas.
- O roteamento usa atualmente um perfil de carro. **Preferir vias principais** sinaliza possíveis trechos locais; não garante sua exclusão. As estimativas não incluem paradas nem trânsito em tempo real. Revise o resultado antes de usá-lo.
- Idioma e unidades de distância são independentes. Trocar unidades não altera as coordenadas do GPX. A velocidade média opcional muda a estimativa de tempo; desativá-la restaura a estimativa do roteador.

## Serviços e privacidade

O aplicativo usa tiles do OpenStreetMap, OSRM para roteamento, Valhalla como alternativa e Nominatim para busca de endereços. Mapas, buscas e roteamento exigem conexão à internet. Esses provedores recebem os locais necessários para cada requisição; links compartilhados e backups também contêm locais. O aplicativo não define cookies nem usa analytics.

A vista inicial usa, em ordem: uma rota na URL, GPS já autorizado no navegador, região aproximada por IP e, depois, idioma e fuso horário do navegador (sem rede), com vista mundial como último recurso. **Usar minha localização** explica a finalidade antes de continuar para o pedido de permissão do navegador. As coordenadas exatas do GPS ficam apenas na memória, nunca são armazenadas em links, localStorage, sessionStorage ou IndexedDB e nunca são enviadas a servidores do projeto nem aos serviços de roteamento/busca. Escolher **Definir como início** ou **Adicionar como parada** cria explicitamente uma coordenada arredondada (grade de cerca de 100 m), que segue o comportamento normal de compartilhamento, roteamento e salvamento de rotas. Confira o ponto no mapa. O provedor de tiles recebe requisições da área visível do mapa, inclusive quando centralizada por GPS.

**Detectar região pelo IP** vem ativado e pode ser desligado em **Configurações**; a URL do serviço é configurável. A [documentação do ipwho.is](https://ipwhois.io/documentation) e seus [termos](https://ipwhois.io/terms) oferecem um endpoint gratuito HTTPS, com CORS e sem chave. O limite publicado é de 1.000 requisições/dia, compartilhado por domínio para tráfego CORS do navegador; o uso comercial é permitido, sem garantia de disponibilidade. O navegador envia seu endereço IP ao provedor escolhido, como também faz com os servidores de tiles. O aplicativo faz no máximo uma tentativa por sessão da aba, com timeout de 3 s e sem repetições. Apenas um centro aproximado da cidade fica em cache na memória; um indicador de sessão evita novas requisições após recarregar. Falhas usam silenciosamente a vista sem rede. Preferências e estado do painel não contêm dados de localização.

As sugestões usam [Photon](https://github.com/komoot/photon#demo-server) em `https://photon.komoot.io` (configurável em Configurações). A política permite uso razoável em projetos, sem cota numérica nem garantia de disponibilidade; uso intenso pode ser bloqueado. HTTPS e CORS aberto foram verificados. O texto digitado e um viés do centro do mapa em escala de cidade são enviados após 3 caracteres e pausa de 300 ms, com limite de cinco resultados, cancelamento, cache em memória e inícios serializados com intervalo mínimo de 1 s. O Nominatim só é consultado por Buscar/Enter, inclusive após falha do Photon, nunca automaticamente ao digitar. As requisições são espaçadas e usam cache quando aplicável, mas os serviços públicos têm capacidade limitada e nenhuma garantia de disponibilidade. Siga a [política do Nominatim](https://operations.osmfoundation.org/policies/nominatim/) e a [política de tiles](https://operations.osmfoundation.org/policies/tiles/); configure serviços próprios antes de ampliar o uso. O espaçamento no navegador não consegue impor um limite de uso compartilhado entre todos os dispositivos.

Altere as URLs base dos serviços em **Configurações**. Serviços remotos precisam de HTTPS e devem permitir requisições entre origens no navegador. Para hospedagem própria, consulte a [documentação do OSRM](https://github.com/Project-OSRM/osrm-backend#quick-start) e a [documentação do Nominatim](https://nominatim.org/release-docs/latest/admin/Installation/).

As camadas (botão Camadas do mapa) só são carregadas quando ativas; os Rótulos do satélite são opcionais e começam ligados. A escolha e a edição do satélite são preferências do aparelho, fora dos links e das rotas salvas. O provedor da camada ativa recebe seu IP e requisições de tiles da área visível; os rótulos enviam requisições adicionais da área visível à EOX. Não foi adicionado pré-carregamento, armazenamento offline nem service worker. Zoom acima da resolução nativa amplia os tiles existentes; não acrescenta detalhes.

| Camada                                   | Fonte e termos                                                                                                                           | Zoom nativo |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Padrão                                   | [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/), dados ODbL e tiles com atribuição obrigatória                     | 19          |
| Topográfico                              | [OpenTopoMap](https://opentopomap.org/about#verwendung), OSM/SRTM, CC BY-SA 3.0; incorporação permitida com atribuição                   | 17          |
| Satélite                                 | [EOxCloudless 2025](https://cloudless.eox.at/documentation/license), mosaico Sentinel-2, CC BY-NC-SA 4.0; apenas projetos não comerciais | 14          |
| Alternativa de satélite em Configurações | [EOxCloudless 2016](https://cloudless.eox.at/documentation/faq), CC BY 4.0; permite também uso comercial incorporado                     | 14          |
| Rótulos                                  | [Sobreposição clara EOX::Maps](https://maps.eox.at/), dados OSM/ODbL; incorporação permitida com créditos OSM, EOX e MapServer           | 14          |

Esses serviços não garantem disponibilidade; respeite o uso justo, mantenha a atribuição e contate os provedores antes de ampliar o uso. A EOX não publica cota numérica e pode limitar picos. Seus mosaicos públicos mais novos proíbem uso comercial em produção; escolha 2016 para esse uso. O satélite é um mosaico regional de aproximadamente 10 m, não uma imagem em nível de rua nem ao vivo. Esri World Imagery foi avaliado e excluído: o [resumo de termos vinculado à camada](https://goto.arcgis.com/termsofuse/viewsummary) exige software Esri ou assinatura ArcGIS, incompatível com esta configuração sem conta. As licenças das imagens não mudam a licença MIT do código; capturas do mapa mantêm os termos e créditos das imagens respectivas.

## Desenvolvimento local

Use Node.js **22.12 ou superior**:

```sh
npm ci
npm run dev
```

Abra `http://localhost:5173/route-gpx/`. Para compilar e visualizar a versão de produção:

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

O script separado de aceitação `node scripts/browser-check.mjs` exige um servidor local em execução ou `SITE_URL` apontando para um site publicado. Ele consulta serviços reais e atualiza capturas de tela, o GPX de exemplo e o relatório em `docs/`; execute-o apenas quando essas verificações forem necessárias.

## Publicação

O GitHub Actions executa verificações em pull requests e pushes para `main`. Builds bem-sucedidos do commit atual da `main` são publicados no GitHub Pages. O Vite usa `/route-gpx/` como caminho base; ao mudar o caminho de hospedagem, atualize também os caminhos do manifest, URLs canônicas e de compartilhamento, sitemap e documentação. Veja as [notas sobre identidade e hospedagem](docs/BRAND.md).

## Créditos e licença

Feito com [Leaflet](https://leafletjs.com/), [OSRM](https://project-osrm.org/), [Valhalla](https://valhalla.github.io/valhalla/), [Nominatim](https://nominatim.org/), [Photon](https://github.com/komoot/photon), [Vite](https://vite.dev/) e [Vitest](https://vitest.dev/). Região por IP pelo [ipwho.is](https://ipwhois.io/). Mapas adicionais por [OpenTopoMap](https://opentopomap.org/about) e [EOX](https://maps.eox.at/). Dados do mapa © [colaboradores do OpenStreetMap](https://www.openstreetmap.org/copyright).

O código do aplicativo é licenciado sob [MIT](LICENSE). Dados e dependências mantêm suas próprias licenças. Sem afiliação com os operadores dos serviços públicos.

[Relatar problema ou contatar o mantenedor](https://github.com/t00ls-dev/route-gpx/issues) · [Relatar problema no mapa](https://www.openstreetmap.org/fixthemap)
