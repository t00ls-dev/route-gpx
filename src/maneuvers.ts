import type { Modifier, Route, Step } from './core';
import type { IconName } from './icons';
import { indexTrack, locateOnTrack } from './track-position';

/**
 * Itinerary instructions from a step's maneuver kind, turn direction and
 * roundabout exit. Returns English source text (translated by `src/i18n.ts`).
 * Pure; no DOM.
 */

const ROUNDABOUT = new Set(['roundabout', 'rotary', 'roundabout turn']);
const LEAVE_ROUNDABOUT = new Set(['exit roundabout', 'exit rotary']);

type Side = 'left' | 'right' | 'straight';
const side = (modifier?: Modifier): Side | null =>
  !modifier
    ? null
    : modifier.endsWith('left')
      ? 'left'
      : modifier.endsWith('right')
        ? 'right'
        : modifier === 'straight'
          ? 'straight'
          : null;

// Short wording so each itinerary line fits on one line.
const TURN: Record<Modifier, string> = {
  uturn: 'U-turn',
  'sharp right': 'Sharp right',
  right: 'Turn right',
  'slight right': 'Slight right',
  straight: 'Straight',
  'slight left': 'Slight left',
  left: 'Turn left',
  'sharp left': 'Sharp left',
};

/** Instruction for the maneuver that starts a step, or null when unknown. */
export function maneuverText(step: Step): string | null {
  const { kind, modifier, exit } = step;
  const direction = side(modifier);
  if (kind === 'depart') return 'Depart';
  if (kind === 'arrive') return 'Arrive';
  if (kind && ROUNDABOUT.has(kind))
    return exit ? `Roundabout, exit ${exit}` : 'Roundabout';
  if (kind && LEAVE_ROUNDABOUT.has(kind)) return 'Leave roundabout';
  if (kind === 'on ramp')
    return direction === 'left' || direction === 'right'
      ? `Ramp ${direction}`
      : 'Ramp';
  if (kind === 'off ramp')
    return direction === 'left' || direction === 'right'
      ? `Exit ${direction}`
      : 'Exit';
  if (kind === 'fork') return direction ? `Keep ${direction}` : 'Keep straight';
  if (kind === 'merge')
    return direction === 'left' || direction === 'right'
      ? `Merge ${direction}`
      : 'Merge';
  if (kind === 'continue' || kind === 'new name')
    return modifier && modifier !== 'straight' ? TURN[modifier] : 'Continue';
  return modifier ? TURN[modifier] : null;
}

/** Arrow for the maneuver; right-hand turns mirror the left-hand drawing. */
export function maneuverIcon(
  step: Step,
): { name: IconName; mirror: boolean } | null {
  const { kind, modifier } = step;
  if (kind && (ROUNDABOUT.has(kind) || LEAVE_ROUNDABOUT.has(kind)))
    return { name: 'maneuver-roundabout', mirror: false };
  if (kind === 'arrive') return { name: 'pin', mirror: false };
  if (kind === 'depart' || !modifier)
    return kind ? { name: 'maneuver-straight', mirror: false } : null;
  const mirror = modifier.endsWith('right');
  // Lane-like maneuvers (ramps, forks, merges) read as gentle turns.
  const gentle = ['on ramp', 'off ramp', 'fork', 'merge'].includes(kind ?? '');
  if (modifier === 'uturn') return { name: 'maneuver-uturn', mirror: false };
  if (modifier === 'straight')
    return { name: 'maneuver-straight', mirror: false };
  if (modifier.startsWith('slight') || gentle)
    return { name: 'maneuver-slight-left', mirror };
  if (modifier.startsWith('sharp'))
    return { name: 'maneuver-sharp-left', mirror };
  return { name: 'maneuver-left', mirror };
}

/** Farther than this from the track, a maneuver location is not trusted. */
const MAX_OFF_TRACK = 50;

/**
 * Along-track distance of each step's maneuver, from its location projected
 * on the full-resolution track, or null without a usable location. Steps are
 * placed in order, so loops and out-and-back routes keep the right pass. This
 * also works on imported tracks with rerouted sections, whose steps cover only
 * part of the route.
 */
export function maneuverPositions(
  route: Route,
  /**
   * Whole routed route (not an imported track): steps without a location,
   * saved before locations existed, are placed by adding up the lengths of
   * the steps before them.
   */
  routed = false,
): (number | null)[] {
  const index = indexTrack(route.segments);
  let progress = 0,
    sum = 0;
  return route.steps.map((step) => {
    const before = sum;
    sum += step.distance;
    if (!step.at) {
      if (!routed) return null;
      progress = Math.max(progress, before);
      return before;
    }
    const position = locateOnTrack(index, step.at, {
      progress,
      backtrack: 0,
    });
    if (!position || position.offTrack > MAX_OFF_TRACK)
      return routed ? before : null;
    progress = position.distance;
    return position.distance;
  });
}

/** Street-type and title words shortened for display (Portuguese and English names). */
const ABBREVIATIONS: [RegExp, string][] = [
  // Portuguese street types, at the start of a name.
  [/^Rua\b/, 'R.'],
  [/^Avenida\b/, 'Av.'],
  [/^Estrada\b/, 'Estr.'],
  [/^Rodovia\b/, 'Rod.'],
  [/^Travessa\b/, 'Tv.'],
  [/^Alameda\b/, 'Al.'],
  [/^Praça\b/, 'Pç.'],
  [/^Ladeira\b/, 'Ld.'],
  [/^Largo\b/, 'Lgo.'],
  [/^Viaduto\b/, 'Vd.'],
  [/^Túnel\b/, 'Tún.'],
  [/^Ponte\b/, 'Pte.'],
  [/^Marginal\b/, 'Marg.'],
  [/^Auto-?[Ee]strada\b/, 'Autoestr.'],
  [/^Elevado\b/, 'Elev.'],
  [/^Contorno\b/, 'Cont.'],
  [/^Acesso\b/, 'Ac.'],
  [/^Beco\b/, 'Bc.'],
  [/^Servidão\b/, 'Serv.'],
  [/^Calçadão\b/, 'Calç.'],
  [/^Parque\b/, 'Pq.'],
  [/^Jardim\b/, 'Jd.'],
  [/^Vila\b/, 'Vl.'],
  // Titles anywhere in a name.
  [/\bProfessora\b/g, 'Profa.'],
  [/\bProfessor\b/g, 'Prof.'],
  [/\bDoutora\b/g, 'Dra.'],
  [/\bDoutor\b/g, 'Dr.'],
  [/\bPresidente\b/g, 'Pres.'],
  [/\bEngenheiro\b/g, 'Eng.'],
  [/\bGeneral\b/g, 'Gen.'],
  [/\bCoronel\b/g, 'Cel.'],
  [/\bMarechal\b/g, 'Mal.'],
  [/\bAlmirante\b/g, 'Alm.'],
  [/\bBrigadeiro\b/g, 'Brig.'],
  [/\bComendador\b/g, 'Com.'],
  [/\bDesembargador\b/g, 'Des.'],
  [/\bSenador\b/g, 'Sen.'],
  [/\bDeputado\b/g, 'Dep.'],
  [/\bGovernador\b/g, 'Gov.'],
  [/\bPrefeito\b/g, 'Pref.'],
  [/\bCapitão\b/g, 'Cap.'],
  [/\bTenente\b/g, 'Ten.'],
  [/\bSargento\b/g, 'Sgt.'],
  [/\bPadre\b/g, 'Pe.'],
  // Carriageway words anywhere ("Rodovia X - Pista Lateral").
  [/\bPista Lateral\b/g, 'P. Lat.'],
  [/\bPista Central\b/g, 'P. Centr.'],
  [/\bAuxiliar\b/g, 'Aux.'],
  [/\bExpressa\b/g, 'Expr.'],
  [/\bMinistro\b/g, 'Min.'],
  [/\bConselheiro\b/g, 'Cons.'],
  [/\bMajor\b/g, 'Maj.'],
  [/\bMonsenhor\b/g, 'Mons.'],
  [/\bVisconde\b/g, 'Visc.'],
  [/\bNossa Senhora\b/g, 'N. Sra.'],
  [/\bSanta\b/g, 'Sta.'],
  [/\bSanto\b/g, 'Sto.'],
  // English street types, at the end of a name.
  [/\bStreet$/, 'St'],
  [/\bAvenue$/, 'Ave'],
  [/\bRoad$/, 'Rd'],
  [/\bBoulevard$/, 'Blvd'],
  [/\bHighway$/, 'Hwy'],
  [/\bDrive$/, 'Dr'],
  [/\bLane$/, 'Ln'],
];

/**
 * Shorter road name for the itinerary line. Display only: the full name stays
 * in the accessible label, the tooltip, GPX and storage. Each part of a
 * combined Valhalla name ("A / B") is shortened on its own.
 */
export function shortRoadName(name: string): string {
  return name
    .split(' / ')
    .map((part) =>
      ABBREVIATIONS.reduce((text, [pattern, short]) => {
        // `\b` does not see accented letters as word characters; require a
        // following space or end so "Santana" or "Ruanda" stay intact.
        return text.replace(
          new RegExp(`${pattern.source}(?=\\s|$)`, pattern.flags),
          short,
        );
      }, part),
    )
    .join(' / ');
}
