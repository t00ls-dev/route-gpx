import type { Route, State } from './core';
import { byId as $ } from './dom';
import { icon } from './icons';
import { distanceLabel } from './units';
import { routeDaylight, sunTimes } from './daylight';

/** Same constant speed as weather passage times when none is configured. */
const DEFAULT_SPEED_KMH = 60;

/**
 * Fills the daylight line in the route summary (`#daylight-summary`, created by
 * the route summary) and the details below the departure date. Text stays in
 * English source form, one text node per phrase, for the DOM translator.
 */
export function renderDaylight(
  state: State,
  route: Route | null,
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
  const departure = state.departure ? Date.parse(state.departure) : NaN;
  const planned = Number.isFinite(departure);
  // Sun times for the local calendar day of the departure, or of today.
  const day = new Date(planned ? departure : now);
  day.setHours(12, 0, 0, 0);
  const sun = sunTimes(day.getTime(), start);
  const sunPhrases = sun.polar
    ? [sun.polar === 'day' ? 'Sun up all day' : 'Sun down all day']
    : [`Sunrise ${clock(sun.sunrise!)}`, `Sunset ${clock(sun.sunset!)}`];

  const phrases = [...sunPhrases];
  let result: ReturnType<typeof routeDaylight> | null = null;
  if (planned) {
    result = routeDaylight(
      route,
      departure,
      state.averageSpeedKmh ?? DEFAULT_SPEED_KMH,
    );
    phrases.push(
      result.nightDistance > 0
        ? `${distance(result.nightDistance)} in the dark`
        : 'None in the dark',
    );
  }
  if (line) {
    const text = document.createElement('p');
    text.className = 'daylight-line';
    text.append(icon('weather-sun'));
    if (!planned)
      text.append(
        document.createTextNode('Today at the start:'),
        document.createTextNode(' '),
      );
    phrases.forEach((phrase, i) => {
      if (i) text.append(document.createTextNode(' · '));
      text.append(document.createTextNode(phrase));
    });
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
