# <img src="public/icons/icon.svg" width="48" height="48" alt="" align="absmiddle" /> route-gpx

Planeje rotas e exporte o traçado completo em GPX.

[English](README.md)

<p>
  <a href="https://github.com/t00ls-dev/route-gpx/actions/workflows/ci-pages.yml"><img src="https://img.shields.io/github/actions/workflow/status/t00ls-dev/route-gpx/ci-pages.yml?branch=main&label=CI" alt="CI da branch main" /></a>
  <a href="package.json"><img src="https://img.shields.io/badge/Node.js-%3E%3D22.23.4-339933" alt="Node.js 22.23.4 ou superior" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-blue" alt="Licença MIT" /></a>
</p>

Uma ferramenta web estática que transforma endereços, coordenadas e pontos do mapa em um arquivo GPX 1.1 com o traçado completo e pontos de passagem nomeados, sem conta, chave de API nem backend da aplicação.

## Recursos

- **Planejar:** defina início, destino e paradas com endereços, coordenadas, cliques no mapa ou sua localização.
- **Editar:** mova e reordene pontos, inverta a rota, adicione um retorno e desfaça alterações.
- **Revisar:** distância, duração estimada e referências de vias, em quilômetros ou milhas, com velocidade média opcional.
- **GPX:** importe arquivos de até 10 MB e exporte GPX 1.1 com segmentos completos do traçado e pontos de passagem nomeados.
- **Clima:** condições e riscos ao longo da rota para uma data de saída, inclusive no passado recente.
- **Radar de chuva:** imagens recentes de radar opcionais sobre o mapa.
- **Camadas do mapa:** mapas padrão, topográfico e de satélite, com rótulos opcionais.
- **Salvar e compartilhar:** links de rotas, rotas nomeadas salvas neste navegador e importação/exportação de backup JSON.

## Início rápido

1. Abra [route-gpx.t00ls.dev](https://route-gpx.t00ls.dev/).
2. Digite endereços ou `latitude, longitude` em **Início** e **Destino**, ou escolha pontos no mapa.
3. Adicione paradas, ajuste os pontos e confira a rota calculada.
4. Se desejar, preencha **Nome do GPX** e pressione **Baixar GPX**.

Gestos, atalhos e todos os controles são explicados na [página de Ajuda](https://route-gpx.t00ls.dev/help.html).

## Bom saber

- Nada é salvo automaticamente: use **Salvar rota** para guardar a geometria exata neste navegador e exporte backups, pois limpar os dados do navegador pode remover as rotas salvas.
- O roteamento usa atualmente um perfil de carro. **Preferir vias principais** sinaliza possíveis trechos locais, mas não garante sua exclusão; as estimativas não incluem paradas nem trânsito em tempo real.
- Traçados GPX importados permanecem intactos até você editar um ponto, o que recalcula a rota. Links compartilhados guardam pontos e opções, não a geometria importada.
- Os riscos de clima são uma ajuda de revisão, não um alerta oficial, e o GPX exportado não leva previsão nem horários.

## Privacidade

- Sem cookies, analytics nem conta.
- Os provedores de mapa, roteamento, busca, clima e radar recebem os locais necessários para cada requisição e seu endereço IP.
- O clima só é consultado depois que você escolhe uma data de saída; o radar, só quando você o ativa.
- As coordenadas exatas do GPS ficam na memória; usar sua localização como ponto da rota cria uma coordenada arredondada em cerca de 100 m.
- A detecção da região aproximada pelo IP pode ser desligada em **Configurações**.
- Todas as URLs de serviços são configuráveis em **Configurações**.

Provedores, limites, termos, amostragem do clima, radar e camadas do mapa estão detalhados em [serviços e privacidade](docs/SERVICES.pt-BR.md).

## Desenvolvimento local

```sh
npm ci            # instala com Node.js 22.23.4+ (Node 24 e 26+ também são aceitos)
npm run dev       # serve em http://localhost:5173/
npm run build     # verifica tipos e compila a versão de produção
npm run preview   # visualiza o build de produção
```

## Validação

```sh
npx playwright install chromium   # uma vez, para os testes de navegador
npm run lint                      # ESLint
npm run format:check              # Prettier
npm test                          # testes unitários Vitest (serviços públicos simulados)
npm run test:browser              # fluxos no navegador com Playwright
npm run build                     # verificação do TypeScript e build de produção
```

O comando opcional `npm run test:integration` consulta o OSRM real, e `node scripts/browser-check.mjs` executa verificações reais de aceitação, gravando somente na pasta ignorada `.browser-check.local/`.

## Publicação

O GitHub Actions executa verificações em pull requests e pushes para `main`, e builds bem-sucedidos do commit atual da `main` são publicados no GitHub Pages em `https://route-gpx.t00ls.dev/`. O Vite usa `/` como caminho base; consulte as [notas sobre identidade e hospedagem](docs/BRAND.md) antes de mudar o caminho de hospedagem.

## Créditos e licença

Feito com [Leaflet](https://leafletjs.com/), [OSRM](https://project-osrm.org/), [Valhalla](https://valhalla.github.io/valhalla/), [Nominatim](https://nominatim.org/), [Photon](https://github.com/komoot/photon), [Vite](https://vite.dev/) e [Vitest](https://vitest.dev/). Região por IP pelo [ipwho.is](https://ipwhois.io/). Mapas adicionais por [OpenTopoMap](https://opentopomap.org/about) e [EOX](https://maps.eox.at/). Dados do tempo por [Open-Meteo](https://open-meteo.com/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), com horários de passagem e resumos de risco calculados aqui. Radar por [RainViewer](https://www.rainviewer.com/), uso pessoal e educacional. Dados do mapa © [colaboradores do OpenStreetMap](https://www.openstreetmap.org/copyright).

A biblioteca Leaflet distribuída usa a licença BSD de 2 cláusulas; seu aviso completo está em [avisos de terceiros](public/THIRD_PARTY_NOTICES.txt) e é copiado para o build de produção.

O código da ferramenta é licenciado sob [MIT](LICENSE). Dados e dependências mantêm suas próprias licenças. Sem afiliação com os operadores dos serviços públicos.

[Relatar problema ou contatar o mantenedor](https://github.com/t00ls-dev/route-gpx/issues) · [Relatar problema no mapa](https://www.openstreetmap.org/fixthemap)
