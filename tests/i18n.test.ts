import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectLanguage,
  preferredLanguage,
  rememberLanguage,
  setLanguage,
  storedLanguage,
  t,
  translateDocument,
} from '../src/i18n';
afterEach(() => {
  setLanguage('en');
  document.body.replaceChildren();
});
it('translates native UI labels and dynamic messages in both directions', () => {
  setLanguage('pt');
  expect(t('↓ Download GPX')).toBe('↓ Baixar GPX');
  expect(t('7 points')).toBe('7 pontos');
  setLanguage('en');
  expect(t('↓ Download GPX')).toBe('↓ Download GPX');
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
