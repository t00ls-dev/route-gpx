import { describe, expect, it } from 'vitest';
import type { Coord, Route, Step } from '../src/core';
import { translate } from '../src/i18n';
import {
  maneuverIcon,
  maneuverPositions,
  maneuverText,
  shortRoadName,
} from '../src/maneuvers';
import { milepostLabel, stepDistanceLabel } from '../src/units';

const step = (extra: Partial<Step>): Step => ({
  name: 'Road',
  ref: '',
  distance: 100,
  duration: 10,
  ...extra,
});

describe('maneuver instructions', () => {
  it.each<[Partial<Step>, string | null]>([
    [{ kind: 'depart', modifier: 'right' }, 'Depart'],
    [{ kind: 'turn', modifier: 'left' }, 'Turn left'],
    [{ kind: 'turn', modifier: 'slight right' }, 'Slight right'],
    [{ kind: 'turn', modifier: 'sharp left' }, 'Sharp left'],
    [{ kind: 'turn', modifier: 'uturn' }, 'U-turn'],
    [{ kind: 'end of road', modifier: 'right' }, 'Turn right'],
    [{ kind: 'continue', modifier: 'straight' }, 'Continue'],
    [{ kind: 'new name' }, 'Continue'],
    [{ kind: 'continue', modifier: 'slight left' }, 'Slight left'],
    [{ kind: 'roundabout', exit: 2 }, 'Roundabout, exit 2'],
    [{ kind: 'rotary' }, 'Roundabout'],
    [{ kind: 'exit roundabout' }, 'Leave roundabout'],
    [{ kind: 'on ramp', modifier: 'slight right' }, 'Ramp right'],
    [{ kind: 'on ramp' }, 'Ramp'],
    [{ kind: 'off ramp', modifier: 'left' }, 'Exit left'],
    [{ kind: 'fork', modifier: 'slight left' }, 'Keep left'],
    [{ kind: 'fork', modifier: 'straight' }, 'Keep straight'],
    [{ kind: 'merge', modifier: 'right' }, 'Merge right'],
    [{ kind: 'merge' }, 'Merge'],
    [{ kind: 'arrive' }, 'Arrive'],
    [{ kind: 'notification' }, null],
    [{}, null],
  ])('%o → %s', (extra, expected) => {
    expect(maneuverText(step(extra))).toBe(expected);
  });

  it('has a Portuguese translation for every instruction', () => {
    const texts = [
      ...[
        'uturn',
        'sharp right',
        'right',
        'slight right',
        'straight',
        'slight left',
        'left',
        'sharp left',
      ].map((modifier) =>
        maneuverText(
          step({ kind: 'turn', modifier: modifier as Step['modifier'] }),
        )!,
      ),
      ...['on ramp', 'off ramp', 'fork', 'merge'].flatMap((kind) =>
        [undefined, 'left', 'right'].map((modifier) =>
          maneuverText(step({ kind, modifier: modifier as Step['modifier'] }))!,
        ),
      ),
      'Depart',
      'Arrive',
      'Continue',
      'Roundabout',
      'Leave roundabout',
    ];
    for (const text of texts) expect(translate(text, 'pt')).not.toBe(text);
    expect(translate('Roundabout, exit 3', 'pt')).toBe('Rotatória, 3ª saída');
    expect(translate('Turn left', 'pt')).toBe('Vire à esq.');
  });

  it('chooses arrows, mirroring right-hand turns', () => {
    expect(maneuverIcon(step({ kind: 'turn', modifier: 'left' }))).toEqual({
      name: 'maneuver-left',
      mirror: false,
    });
    expect(
      maneuverIcon(step({ kind: 'turn', modifier: 'sharp right' })),
    ).toEqual({
      name: 'maneuver-sharp-left',
      mirror: true,
    });
    expect(maneuverIcon(step({ kind: 'fork', modifier: 'right' }))).toEqual({
      name: 'maneuver-slight-left',
      mirror: true,
    });
    expect(maneuverIcon(step({ kind: 'turn', modifier: 'uturn' }))!.name).toBe(
      'maneuver-uturn',
    );
    expect(maneuverIcon(step({ kind: 'roundabout', exit: 1 }))!.name).toBe(
      'maneuver-roundabout',
    );
    expect(maneuverIcon(step({ kind: 'depart' }))!.name).toBe(
      'maneuver-straight',
    );
    expect(maneuverIcon(step({}))).toBeNull();
  });
});

describe('maneuver positions', () => {
  // About 111 m per 0.001° of longitude at the equator.
  const east = (from: number, to: number): Coord[] =>
    Array.from({ length: to - from + 1 }, (_, i) => [0, (from + i) * 0.001]);
  const route = (segments: Coord[][], steps: Partial<Step>[]): Route => ({
    segments,
    steps: steps.map(step),
    distance: 0,
    duration: null,
    provider: 'OSRM',
  });

  it('projects each location on the track, in order', () => {
    const positions = maneuverPositions(
      route([east(0, 10)], [{ at: [0, 0] }, { at: [0.0001, 0.005] }, {}]),
    );
    expect(positions[0]).toBeCloseTo(0, 3);
    expect(positions[1]).toBeCloseTo(556, -1);
    expect(positions[2]).toBeNull();
  });

  it('keeps the right pass on an out-and-back route', () => {
    const track = [...east(0, 10), ...east(0, 9).reverse()];
    const positions = maneuverPositions(
      route(
        [track],
        [{ at: [0, 0.005] }, { at: [0, 0.01] }, { at: [0, 0.005] }],
      ),
    );
    expect(positions[0]).toBeCloseTo(556, -1);
    expect(positions[1]).toBeCloseTo(1112, -1);
    // The same place on the way back is ahead of the turn.
    expect(positions[2]).toBeCloseTo(1668, -1);
  });

  it('ignores locations far from the track and counts across segment gaps', () => {
    const positions = maneuverPositions(
      route(
        [east(0, 5), east(20, 25)],
        [{ at: [0.01, 0.002] }, { at: [0, 0.022] }],
      ),
    );
    expect(positions[0]).toBeNull();
    // 5 edges in the first segment, then 2 in the second; the gap adds nothing.
    expect(positions[1]).toBeCloseTo(778, -1);
  });

  it('shortens street types and titles without touching other words', () => {
    expect(shortRoadName('Rua Professor Mauriti Santos')).toBe(
      'R. Prof. Mauriti Santos',
    );
    expect(shortRoadName('Avenida Presidente Vargas')).toBe('Av. Pres. Vargas');
    expect(shortRoadName('Estrada das Paineiras')).toBe('Estr. das Paineiras');
    expect(shortRoadName('Túnel Antônio Rebouças')).toBe(
      'Tún. Antônio Rebouças',
    );
    expect(
      shortRoadName('Rodovia Presidente Dutra / Rua Nossa Senhora de Fátima'),
    ).toBe('Rod. Pres. Dutra / R. N. Sra. de Fátima');
    expect(shortRoadName('Main Street')).toBe('Main St');
    expect(shortRoadName('Autoestrada Lagoa-Barra')).toBe(
      'Autoestr. Lagoa-Barra',
    );
    expect(shortRoadName('Auto-Estrada Engenheiro Fernando Mac Dowell')).toBe(
      'Autoestr. Eng. Fernando Mac Dowell',
    );
    expect(shortRoadName('Elevado do Joá')).toBe('Elev. do Joá');
    expect(shortRoadName('Rodovia Washington Luiz - Pista Lateral')).toBe(
      'Rod. Washington Luiz - P. Lat.',
    );
    expect(shortRoadName('Rodovia Washington Luiz - Auxiliar')).toBe(
      'Rod. Washington Luiz - Aux.',
    );
    expect(shortRoadName('Via Expressa Sul')).toBe('Via Expr. Sul');
    expect(shortRoadName('Ruanda Santana Praçaville')).toBe(
      'Ruanda Santana Praçaville',
    );
    expect(shortRoadName('Avenue Road Street')).toBe('Avenue Road St');
  });

  it('formats compact step lengths', () => {
    expect(stepDistanceLabel(537, 'metric', 'en')).toBe('540 m');
    expect(stepDistanceLabel(3, 'metric', 'en')).toBe('10 m');
    expect(stepDistanceLabel(2049, 'metric', 'pt-BR')).toBe('2 km');
    expect(stepDistanceLabel(2149, 'metric', 'pt-BR')).toBe('2,1 km');
    expect(stepDistanceLabel(100, 'imperial', 'en')).toBe('330 ft');
    expect(stepDistanceLabel(1609.344, 'imperial', 'en')).toBe('1 mi');
  });

  it('formats positions like road markers', () => {
    expect(milepostLabel(12345, 'metric', 'en')).toBe('km 12.3');
    expect(milepostLabel(12345, 'metric', 'pt-BR')).toBe('km 12,3');
    expect(milepostLabel(0, 'metric', 'en')).toBe('km 0.0');
    expect(milepostLabel(16093.44, 'imperial', 'en')).toBe('mi 10.0');
  });
});
