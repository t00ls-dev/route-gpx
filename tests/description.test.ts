import { expect, it } from 'vitest';
import { parseDescription, intentPoints } from '../src/description';
it('parses English route intent and highway preference', () =>
  expect(
    parseDescription(
      'From Metrô Uruguai via Postinho do Alto and Estrada das Furnas to Grumari. Prefer main roads.',
    ),
  ).toEqual({
    stops: [
      'Metrô Uruguai',
      'Postinho do Alto',
      'Estrada das Furnas',
      'Grumari',
    ],
    prefer: true,
  }));
it('parses Portuguese route intent', () =>
  expect(
    parseDescription(
      'Saindo do Metrô Uruguai passando pelo Postinho do Alto até Grumari. Prefira vias principais.',
    ).stops,
  ).toEqual(['Metrô Uruguai', 'Postinho do Alto', 'Grumari']));
it('supports one place per line and coordinate pairs', () => {
  const i = parseDescription('(-22.9, -43.1)\nGrumari');
  expect(intentPoints(i)[0].coord).toEqual([-22.9, -43.1]);
});
it('rejects vague instructions with no endpoints', () =>
  expect(() => parseDescription('a nice drive')).toThrow(
    'start and a destination',
  ));
it('rejects excessive place lists', () =>
  expect(() => parseDescription(Array(30).fill('Place').join('\n'))).toThrow(
    '25 places',
  ));
