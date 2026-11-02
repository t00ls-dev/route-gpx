import { expect, it, afterEach } from 'vitest';
import { setLanguage, t, translateDocument } from '../src/i18n';
afterEach(() => {
  setLanguage('en');
  document.body.replaceChildren();
});
it('translates native UI labels and dynamic messages in both directions', () => {
  setLanguage('pt');
  expect(t('↓ Download GPX')).toBe('↓ Baixar GPX');
  expect(t('7 points')).toBe('7 pontos');
  expect(t('Click the map to place point 3')).toContain('ponto 3');
  setLanguage('en');
  expect(t('↓ Download GPX')).toBe('↓ Download GPX');
});
it('switches existing content and placeholders without overwriting typed place names', () => {
  document.body.innerHTML =
    '<h1>Take the scenic route.</h1><input placeholder="My road trip" value="Postinho do Alto">';
  setLanguage('pt');
  translateDocument();
  expect(document.querySelector('h1')?.textContent).toBe('A estrada é sua.');
  expect(document.querySelector('input')?.value).toBe('Postinho do Alto');
  expect(document.querySelector('input')?.placeholder).toBe('Minha viagem');
  setLanguage('en');
  expect(document.querySelector('h1')?.textContent).toBe(
    'Take the scenic route.',
  );
  expect(document.querySelector('input')?.placeholder).toBe('My road trip');
});
