# route-gpx

Planeje rotas e exporte o traçado completo em GPX.

[Abrir o aplicativo](https://t00ls-dev.github.io/route-gpx/) · [English](README.md) · [Ajuda](https://t00ls-dev.github.io/route-gpx/help.html) · [Licença MIT](LICENSE)

![Rota de Tijuca a Grumari no route-gpx](docs/screenshot.png)

## Recursos

- Defina início, destino e paradas com endereços, coordenadas ou cliques no mapa.
- Mova e reordene pontos, inverta a rota, adicione um retorno e desfaça alterações.
- Confira distância, duração estimada e referências de vias; alterne entre quilômetros e milhas ou defina uma velocidade média.
- Importe GPX e exporte GPX 1.1 com segmentos completos do traçado e pontos de passagem nomeados.
- Compartilhe links de rotas e salve explicitamente rotas nomeadas neste navegador, com importação e exportação de backup JSON.

Um aplicativo estático feito com HTML, TypeScript, Vite e Leaflet. Não exige conta, chave de API nem backend da aplicação. A interface oferece inglês e português do Brasil pelo seletor no cabeçalho.

## Início rápido

1. Digite endereços ou `latitude, longitude` em **Início** e **Destino**, ou clique no mapa para definir os pontos. Coordenadas são aplicadas automaticamente; para endereços, pressione **Buscar** ou Enter e selecione um resultado. **Ver exemplo** carrega um itinerário de exemplo.
2. Adicione paradas e ajuste os pontos. Confira a rota calculada, a distância e a duração.
3. Se desejar, preencha **Nome do GPX** e pressione **Baixar GPX**. O nome vale para o arquivo e o trajeto; quando vazio, são usados os pontos de início e destino.

Para instruções passo a passo, consulte a [página de Ajuda](https://t00ls-dev.github.io/route-gpx/help.html). Há também um [GPX de exemplo](docs/example.gpx).

## Comportamentos importantes

- Arquivos GPX importados podem ter até 10 MB. Os pontos e segmentos do traçado permanecem intactos até você editar um ponto, o que recalcula a rota. Links compartilhados contêm pontos de controle e opções, não a geometria importada, e recalculam ao abrir.
- **Nenhuma rota é salva automaticamente**. Preencha um nome e use **Salvar rota** para guardar a geometria exata no IndexedDB. Salvar com o mesmo nome atualiza a entrada. Reabrir uma rota salva não a recalcula. Exporte backups: limpar os dados do navegador pode remover as rotas salvas.
- O roteamento usa atualmente um perfil de carro. **Preferir vias principais** sinaliza possíveis trechos locais; não garante sua exclusão. As estimativas não incluem paradas nem trânsito em tempo real. Revise o resultado antes de usá-lo.
- Idioma e unidades de distância são independentes. Trocar unidades não altera as coordenadas do GPX. A velocidade média opcional muda a estimativa de tempo; desativá-la restaura a estimativa do roteador.

## Serviços e privacidade

O aplicativo usa tiles do OpenStreetMap, OSRM para roteamento, Valhalla como alternativa e Nominatim para busca de endereços. Mapas, buscas e roteamento exigem conexão à internet. Esses provedores recebem os locais necessários para cada requisição; links compartilhados e backups também contêm locais. O aplicativo não define cookies nem usa analytics.

As buscas de endereços são explícitas, sem autocompletar. As requisições são espaçadas e usam cache quando aplicável, mas os serviços públicos têm capacidade limitada e nenhuma garantia de disponibilidade. Siga a [política do Nominatim](https://operations.osmfoundation.org/policies/nominatim/) e a [política de tiles](https://operations.osmfoundation.org/policies/tiles/); configure serviços próprios antes de ampliar o uso. O espaçamento no navegador não consegue impor um limite de uso compartilhado entre todos os dispositivos.

Altere as URLs base dos serviços em **Configurações**. Serviços remotos precisam de HTTPS e devem permitir requisições entre origens no navegador. Para hospedagem própria, consulte a [documentação do OSRM](https://github.com/Project-OSRM/osrm-backend#quick-start) e a [documentação do Nominatim](https://nominatim.org/release-docs/latest/admin/Installation/).

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

Feito com [Leaflet](https://leafletjs.com/), [OSRM](https://project-osrm.org/), [Valhalla](https://valhalla.github.io/valhalla/), [Nominatim](https://nominatim.org/), [Vite](https://vite.dev/) e [Vitest](https://vitest.dev/). Dados do mapa © [colaboradores do OpenStreetMap](https://www.openstreetmap.org/copyright).

O código do aplicativo é licenciado sob [MIT](LICENSE). Dados e dependências mantêm suas próprias licenças. Sem afiliação com os operadores dos serviços públicos.

[Relatar problema ou contatar o mantenedor](https://github.com/t00ls-dev/route-gpx/issues) · [Relatar problema no mapa](https://www.openstreetmap.org/fixthemap)
