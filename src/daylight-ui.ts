import { departureOf } from './departure';
import type { Route, State } from './core';
import { byId as $ } from './dom';
import { icon } from './icons';
import { distanceLabel } from './units';
import { routeDaylight, sunTimes } from './daylight';

/**
 * Fills the daylight line in the route summary (`#daylight-summary`, created by
 * the route summary) and the details below the departure date. Text stays in
 * English source form, one text node per phrase, for the DOM translator.
 */
const phrase = (value: string) => {
  const span = document.createElement('span');
  span.textContent = value;
  return span;
};

export function renderDaylight(
  state: State,
  route: Route | null,
  /** The same average speed as time, arrival and weather. */
  speedKmh: number,
  now = Date.now(),
): void {
  const details = $('daylight-details'),
    list = $('daylight-list'),
    line = document.getElementById('daylight-summary');
  const start = route?.segments.find((segment) => segment.length)?.[0];
  list.replaceChildren();
  details.hidden = true;
  if (!route || !start) {
    line?.replaceChildren();
    return;
  }
  const locale = state.language === 'pt' ? 'pt-BR' : 'en';
  const clock = (time: number) =>
    new Date(time).toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    });
  const when = (time: number) =>
    new Date(time).toLocaleString(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  const distance = (meters: number) =>
    distanceLabel(meters, state.units, locale);
  const leaving = departureOf(state);
  const departure = leaving ? Date.parse(leaving) : NaN;
  const planned = Number.isFinite(departure);
  // Sun times for the local calendar day of the departure, or of today.
  const day = new Date(planned ? departure : now);
  day.setHours(12, 0, 0, 0);
  const sun = sunTimes(day.getTime(), start);
  let result: ReturnType<typeof routeDaylight> | null = null;
  if (planned) result = routeDaylight(route, departure, speedKmh);
  if (line) {
    const text = document.createElement('p');
    text.className = 'daylight-line';
    if (!planned) text.append(phrase('Today at the start:'));
    if (sun.polar)
      text.append(
        phrase(sun.polar === 'day' ? 'Sun up all day' : 'Sun down all day'),
      );
    else
      for (const [kind, time] of [
        ['sunrise', sun.sunrise!],
        ['sunset', sun.sunset!],
      ] as const) {
        // Icon for sight, words for screen readers and the tooltip.
        const label = kind === 'sunrise' ? 'Sunrise' : 'Sunset';
        const item = document.createElement('span');
        item.className = 'sun-time';
        item.title = label;
        const name = document.createElement('span');
        name.className = 'sr-only';
        name.textContent = label;
        item.append(
          icon(kind),
          name,
          document.createTextNode(` ${clock(time)}`),
        );
        text.append(document.createTextNode(' '), item);
      }
    if (result)
      text.append(
        document.createTextNode(' '),
        phrase('·'),
        document.createTextNode(' '),
        phrase(
          result.nightDistance > 0
            ? `${distance(result.nightDistance)} in the dark`
            : 'None in the dark',
        ),
      );
    line.replaceChildren(text);
    if (!planned) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = 'Choose a departure date to see dark sections.';
      line.append(hint);
    }
  }
  if (!result) return;
  const items = [
    ...result.sections.map(
      (section) =>
        `Dark from ${distance(section.from)} (${when(section.start)}) to ${distance(section.to)} (${when(section.end)})`,
    ),
    ...(result.twilightDistance > 0
      ? [`${distance(result.twilightDistance)} in civil twilight`]
      : []),
    ...(result.latestDeparture !== null
      ? [`Leave by ${when(result.latestDeparture)} to arrive before sunset.`]
      : []),
    ...(sun.sunrise !== null
      ? [`Daylight at the start from ${clock(sun.sunrise)}.`]
      : []),
  ];
  for (const item of items) {
    const li = document.createElement('li');
    li.textContent = item;
    list.append(li);
  }
  details.hidden = !items.length;
}
