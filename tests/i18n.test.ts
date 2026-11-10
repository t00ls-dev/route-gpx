import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectLanguage,
  preferredLanguage,
  rememberLanguage,
  setLanguage,
  storedLanguage,
  t,
  translate,
  translateDocument,
} from '../src/i18n';
afterEach(() => {
  setLanguage('en');
  document.body.replaceChildren();
});
it('translates native UI labels and dynamic messages in both directions', () => {
  setLanguage('pt');
  expect(t('Download GPX')).toBe('Baixar GPX');
  expect(t('7 points')).toBe('7 pontos');
  setLanguage('en');
  expect(t('Download GPX')).toBe('Download GPX');
});
it('switches existing content and placeholders without overwriting typed place names', () => {
  document.body.innerHTML =
    '<h1>Plan your route</h1><input placeholder="My road trip" value="Postinho do Alto">';
  setLanguage('pt');
  translateDocument();
  expect(document.querySelector('h1')?.textContent).toBe('Criar rota');
  expect(document.querySelector('input')?.value).toBe('Postinho do Alto');
  expect(document.querySelector('input')?.placeholder).toBe('Minha viagem');
  setLanguage('en');
  expect(document.querySelector('h1')?.textContent).toBe('Plan your route');
  expect(document.querySelector('input')?.placeholder).toBe('My road trip');
});

it('translates generated stop names and short status messages', () => {
  setLanguage('pt');
  expect(
    t(
      'This link suggests other routing servers: example.org. The route uses the default servers.',
    ),
  ).toBe(
    'Este link sugere outros servidores de rota: example.org. A rota usa os servidores padrão.',
  );
  expect(t('Use link servers')).toBe('Usar servidores do link');
  expect(
    t(
      'No route available. Check the points or try again later. OSRM returned an invalid route. The fallback server also failed.',
    ),
  ).toBe(
    'Rota indisponível. Confira os pontos ou tente mais tarde. O OSRM devolveu uma rota inválida. O servidor alternativo também falhou.',
  );
  expect(
    t(
      'No route available. Check the points or try again later. Server returned HTTP 500. The fallback server also failed.',
    ),
  ).toContain('O servidor respondeu HTTP 500.');
  expect(t('Keep default servers')).toBe('Manter servidores padrão');
  expect(t('Stop 2')).toBe('Parada 2');
  expect(t('Return to start')).toBe('Volta ao início');
  expect(t('Check road positions: 2 (150 m)')).toBe(
    'Confira os pontos nas vias: 2 (150 m)',
  );
  setLanguage('en');
  expect(t('Stop 2')).toBe('Stop 2');
});

describe('language preference', () => {
  afterEach(() => localStorage.clear());
  it('detects the first supported browser language by prefix', () => {
    expect(detectLanguage(['es-ES', 'pt-BR'])).toBe('pt');
    expect(detectLanguage(['EN-gb', 'pt'])).toBe('en');
  });
  it('falls back to English when no browser language is supported', () => {
    expect(detectLanguage(['es-ES', 'fr'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });
  it('prefers the stored choice over the browser languages', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    rememberLanguage('pt');
    expect(storedLanguage()).toBe('pt');
    expect(preferredLanguage()).toBe('pt');
    vi.restoreAllMocks();
  });
  it('ignores invalid stored values', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['pt-BR']);
    localStorage.setItem('language', 'xx');
    expect(storedLanguage()).toBeUndefined();
    expect(preferredLanguage()).toBe('pt');
    vi.restoreAllMocks();
  });
});

describe('translation coverage', () => {
  const read = (path: string) =>
    readFileSync(resolve(__dirname, '..', path), 'utf8');
  // Product names, units, language codes and licenses stay the same in Portuguese.
  const sameInBothLanguages = new Set([
    'route',
    '-gpx',
    'route-gpx',
    'Language / Idioma',
    'EN',
    'PT',
    'km',
    'mi',
    'km/h',
    '1–200 km/h',
    'EOX 2025 · CC BY-NC-SA 4.0',
    'EOX 2016 · CC BY 4.0',
    'GitHub',
  ]);
  // Thrown only to callers that replace them with a translated message.
  const internalErrors = new Set([
    'Superseded route',
    'Invalid position',
    'Photon unavailable',
    'Invalid Photon response',
    'Invalid route geometry.',
    'Invalid tile template',
    'Invalid tile URL',
    'Invalid tile configuration',
    'Invalid route backup.',
    'Invalid saved route name.',
    'Invalid saved route points.',
    'Invalid saved route geometry.',
    'Local route storage is blocked by another tab.',
  ]);
  const untranslated = (texts: Iterable<string>) =>
    [...new Set(texts)].filter(
      (text) =>
        /[a-z]{2}/i.test(text) &&
        !sameInBothLanguages.has(text) &&
        !internalErrors.has(text) &&
        translate(text, 'pt') === text,
    );

  it('translates every interface text and attribute in index.html', () => {
    const doc = new DOMParser().parseFromString(
      read('index.html'),
      'text/html',
    );
    const texts: string[] = [];
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode()))
      if (!node.parentElement?.closest('script,style,textarea,noscript'))
        texts.push((node.nodeValue ?? '').trim().replace(/\s+/g, ' '));
    doc
      .querySelectorAll('[placeholder],[aria-label],[title]')
      .forEach((element) =>
        ['placeholder', 'aria-label', 'title'].forEach((attr) => {
          const value = element.getAttribute(attr);
          if (value) texts.push(value);
        }),
      );
    expect(untranslated(texts)).toEqual([]);
  });

  it('translates literal status and error messages shown to users', () => {
    const files = readdirSync(resolve(__dirname, '../src')).filter(
      (file) => file.endsWith('.ts') && file !== 'i18n.ts',
    );
    const messages = files.flatMap((file) =>
      Array.from(
        read(`src/${file}`).matchAll(
          /\b(?:new Error|status|libraryMessage|message)\(\s*'((?:[^'\\]|\\.)+)'/g,
        ),
        (match) => match[1].replace(/\\'/g, "'"),
      ),
    );
    expect(messages.length).toBeGreaterThan(50);
    expect(untranslated(messages)).toEqual([]);
  });

  it('uses singular forms and translated provider labels', () => {
    setLanguage('pt');
    expect(t('1 road section to review')).toBe('1 trecho para conferir');
    expect(t('3 road sections to review')).toBe('3 trechos para conferir');
    expect(t('Imported 1 route. Existing names were kept.')).toBe(
      '1 rota importada. Os nomes existentes foram mantidos.',
    );
    expect(t('Imported GPX + OSRM + Valhalla (fallback) · 1.234 points')).toBe(
      'GPX importado + OSRM + Valhalla (alternativo) · 1.234 pontos',
    );
    expect(
      t(
        'No route available. Check the points or try again later. Valhalla could not find a route. The fallback server also failed.',
      ),
    ).toContain('O Valhalla não encontrou uma rota.');
  });
});

it('translates the daylight phrases', () => {
  setLanguage('pt');
  expect(t('Sunrise')).toBe('Nascer do sol');
  expect(t('Sunset')).toBe('Pôr do sol');
  expect(t('12 km in the dark')).toBe('12 km no escuro');
  expect(t('3,5 km in civil twilight')).toBe('3,5 km no crepúsculo civil');
  expect(
    t('Dark from 30 km (8 de nov., 18:31) to 42 km (8 de nov., 18:55)'),
  ).toBe('No escuro de 30 km (8 de nov., 18:31) a 42 km (8 de nov., 18:55)');
  expect(t('Leave by 8 de nov., 17:35 to arrive before sunset.')).toBe(
    'Saia até 8 de nov., 17:35 para chegar antes do pôr do sol.',
  );
  expect(t('Daylight at the start from 05:42.')).toBe(
    'Luz do dia no início a partir de 05:42.',
  );
  expect(t('Today at the start:')).toBe('Hoje no início:');
});

it('translates usage-limit waits for weather and elevation', () => {
  expect(
    translate('Elevation usage limit reached. Try again in 30s.', 'pt'),
  ).toBe('Limite de uso da elevação atingido. Tente em 30s.');
  expect(
    translate('Weather usage limit reached. Try again in 2 min.', 'pt'),
  ).toBe('Limite de uso do clima atingido. Tente em 2 min.');
});
