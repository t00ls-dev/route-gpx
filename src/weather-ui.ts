import { speedFromKmh } from './travel-time';
import { byId as $ } from './dom';
import L from 'leaflet';
import { type Route, type State, serverUrl } from './core';
import { t, weatherDescription } from './i18n';
import { distanceLabel, precipitationLabel, temperatureLabel } from './units';
import { classifyWeather, groupWeather, uvCategory } from './weather-risk';
import { windRelation, windStrength, windFlowDirection } from './weather-wind';
import { icon, centerIcon } from './icons';
import {
  declineAutomaticDeparture,
  departureOf,
  isAutomaticDeparture,
  setAutomaticDeparture,
  untilNextSlot,
} from './departure';
import {
  countdown,
  retryIn,
  UsageLimitError,
  weatherForecast,
} from './services';
import {
  DEFAULT_WEATHER_URL,
  HOUR,
  departureError,
  forecastInterval,
  localDateTime,
  nearestHour,
  passageTime,
  sampleRoute,
  sampleRouteStops,
  weatherWindow,
  type WeatherForecast,
  type WeatherPoint,
} from './weather';
import { distanceUnits, temperatureUnits } from './unit-preferences';
import { weatherPasses } from './route-marks';
const AUTOMATIC = 'automatic-departure';
/**
 * Runs a change that resizes content above `element` (weather cards, arrival)
 * and scrolls back so the element stays where the user touched it. Browsers
 * without scroll anchoring, such as Safari, would otherwise jump.
 */
function keepInPlace(element: HTMLElement, change: () => void) {
  const before = element.getBoundingClientRect().top;
  change();
  // Measured before the next paint, after every change listener has run
  // (the route summary re-renders in its own listener).
  requestAnimationFrame(() => restorePosition(element, before));
}
function restorePosition(element: HTMLElement, before: number) {
  const delta = element.getBoundingClientRect().top - before;
  if (Math.abs(delta) < 1) return;
  let scroller: HTMLElement | null = element.parentElement;
  while (
    scroller &&
    !(
      scroller.scrollHeight > scroller.clientHeight &&
      /auto|scroll/.test(getComputedStyle(scroller).overflowY)
    )
  )
    scroller = scroller.parentElement;
  (scroller ?? document.scrollingElement)?.scrollBy(0, delta);
}
/** Alerts the UV line itself carries on a weather card. */
const UV_RISKS = new Set(['Very high UV', 'Extreme UV']);

export function setupWeather(
  map: L.Map,
  getState: () => State,
  getRoute: () => Route | null,
  syncState: () => void,
  /** The device's average speed in km/h (see `storedSpeedKmh`). */
  getSpeed: () => number,
) {
  const departure = $<HTMLInputElement>('departure'),
    retry = $<HTMLButtonElement>('weather-retry');
  // Route editing pins stay above weather, including neighboring samples.
  map.createPane('weather').style.zIndex = '590';
  const markers = L.layerGroup().addTo(map);
  let endpoint = DEFAULT_WEATHER_URL;
  try {
    endpoint = serverUrl(localStorage.getItem('weather-server') ?? endpoint);
  } catch {
    /* Optional server preference, no route data. */
  }
  $<HTMLInputElement>('weather-server').value = endpoint;
  let forecast: WeatherForecast | undefined,
    points: WeatherPoint[] = [],
    /** Distinct route stops for the fetched samples. */
    stops = 0,
    sourceRoute: Route | null = null,
    sourceDeparture: string | undefined,
    sourceEndpoint = '',
    stale = false,
    controller: AbortController | undefined,
    requestVersion = 0,
    automaticTimer: ReturnType<typeof setTimeout> | undefined,
    attemptedRoute: Route | null = null,
    attemptedDeparture: string | undefined,
    attemptedEndpoint = '',
    attemptedSpeed = 0;
  let cancelLimit = () => {},
    /** The single automatic retry after a usage limit was already used. */
    limitRetried = false;
  const message = (value: string, error = false) => {
    $('weather-status').replaceChildren(document.createTextNode(value));
    $('weather-status').classList.toggle('error', error);
  };
  /** No departure: say so, with a link to the departure field. */
  function askForDeparture() {
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'link-button';
    choose.textContent = 'Choose departure';
    choose.onclick = () => {
      departure.scrollIntoView({ block: 'center' });
      departure.focus({ preventScroll: true });
      // Opens the date picker where the browser allows it.
      try {
        departure.showPicker();
      } catch {
        /* Focus is enough without picker support. */
      }
    };
    $('weather-status').classList.remove('error');
    $('weather-status').replaceChildren(
      document.createTextNode(
        'Choose a departure to see the weather along the route.',
      ),
      document.createTextNode(' '),
      choose,
    );
  }
  function invalidate() {
    cancelLimit();
    requestVersion++;
    controller?.abort();
    controller = undefined;
    clearTimeout(automaticTimer);
    automaticTimer = undefined;
    attemptedRoute = null;
    retry.disabled = false;
    retry.hidden = true;
    if (forecast) {
      stale = true;
      message('Updating weather…');
    }
    markers.clearLayers();
    $('weather-result').hidden = true;
  }
  function times(samples: WeatherPoint[]) {
    const date = departureOf(getState()) ?? '';
    const error = departureError(date);
    if (error) throw new Error(error);
    return samples.map((p) => passageTime(p, Date.parse(date), getSpeed()));
  }
  async function revealCard(card: HTMLElement) {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        $('fullscreen').click();
      }
    } else if (document.body.classList.contains('map-fullscreen'))
      $('fullscreen').click();
    if (!card.isConnected) return;
    if ($('route-panel').hidden) $('panel-toggle').click();
    $<HTMLDetailsElement>('weather-section').open = true;
    $('weather-details')
      .querySelectorAll('[aria-current]')
      .forEach((element) => element.removeAttribute('aria-current'));
    card.setAttribute('aria-current', 'true');
    card.focus({ preventScroll: true });
    card.scrollIntoView({
      block: 'center',
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
  }
  function render() {
    markers.clearLayers();
    showDeparture();
    if (!departureOf(getState())) {
      $('weather-result').hidden = true;
      // Weather is sampled at the passage times, which need a departure.
      if (getRoute()) askForDeparture();
      else message('');
      return;
    }
    if (!forecast) {
      schedule();
      return;
    }
    const state = getState();
    if (
      stale ||
      getRoute() !== sourceRoute ||
      departureOf(state) !== sourceDeparture ||
      endpoint !== sourceEndpoint
    ) {
      $('weather-result').hidden = true;
      schedule();
      return;
    }
    let passage: number[];
    try {
      passage = times(points);
    } catch (error) {
      message((error as Error).message, true);
      $('weather-result').hidden = true;
      return;
    }
    if (
      passage[0] - HOUR < forecast.start ||
      passage.at(-1)! + HOUR > forecast.end
    ) {
      message('Passage times exceed the fetched interval.');
      retry.hidden = false;
      $('weather-result').hidden = true;
      return;
    }
    const desiredPoints = sampleRoute(sourceRoute!, state.points, getSpeed());
    const largestGap = (samples: WeatherPoint[]) =>
      Math.max(
        0,
        ...samples.slice(1).map((p, i) => p.distance - samples[i].distance),
      );
    if (largestGap(points) > largestGap(desiredPoints) + 1) {
      message('Updating weather…');
      $('weather-result').hidden = true;
      schedule();
      return;
    }
    if (automaticTimer !== undefined) {
      clearTimeout(automaticTimer);
      automaticTimer = undefined;
      attemptedRoute = null;
    }
    const locale = state.language === 'pt' ? 'pt-BR' : 'en';
    const time = (v: number) =>
      new Date(v).toLocaleString(locale, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    const details = $('weather-details');
    details.replaceChildren();
    // On a road used both ways, each sample names its pass.
    const passes = weatherPasses(sourceRoute!, points);
    // What each sample shows; consecutive equivalent samples share a card.
    const facts = points.map((point, i) => {
      const hour = nearestHour(forecast!.hours[i], passage[i]);
      const window = weatherWindow(forecast!.hours[i], passage[i]);
      const risks = classifyWeather(window);
      const uvRisk = risks.find((risk) => UV_RISKS.has(risk.text));
      const nearUv = hour.uv === null ? null : Math.round(hour.uv);
      // A UV alert covers the worst hour of the passage window.
      const topUv = uvRisk
        ? Math.round(Math.max(...window.map((h) => h.uv ?? -Infinity)))
        : nearUv;
      return {
        point,
        hour,
        risks,
        uvRisk,
        nearUv,
        topUv,
        weather: weatherDescription(hour.code),
        relation: windRelation(hour.wind, hour.windDirection, point.bearing),
        pass: passes[i],
      };
    });
    const groups = groupWeather(
      facts.map((f) => ({
        stop: !!f.point.stop,
        text: f.weather.text,
        severity: f.risks[0]?.severity ?? 0,
        risks: f.risks.map((risk) => risk.text).sort(),
        relation: f.relation,
        uv: f.topUv !== null && f.topUv >= 1 ? uvCategory(f.topUv) : null,
        uvAlert: !!f.uvRisk,
        pass: f.pass,
        temperature: f.hour.temperature,
        probability: f.hour.probability,
        wind: f.hour.wind,
      })),
    );
    const speedUnit = () => (distanceUnits() === 'imperial' ? 'mph' : 'km/h');
    const speedLabel = (kmh: number | null) =>
      kmh === null
        ? null
        : `${speedFromKmh(kmh, distanceUnits()).toLocaleString(locale, {
            maximumFractionDigits: 1,
          })} ${speedUnit()}`;
    /** "4 km" or "4–9 km": the number of the lowest, the label of the highest. */
    const range = (
      values: (number | null)[],
      label: (value: number | null) => string,
    ) => {
      const known = values.filter((v): v is number => v !== null);
      if (!known.length) return label(null);
      const low = Math.min(...known),
        high = Math.max(...known);
      const top = label(high);
      return label(low) === top ? top : `${label(low).split(' ')[0]}–${top}`;
    };
    const clock = (v: number) =>
      new Date(v).toLocaleTimeString(locale, {
        hour: '2-digit',
        minute: '2-digit',
      });
    // Local calendar days between two times, for "23:51–06:23 (+1)".
    const daysApart = (a: number, b: number) => {
      const day = (v: number) => {
        const d = new Date(v);
        return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
      };
      return Math.round((day(b) - day(a)) / 86_400_000);
    };
    groups.forEach((group) => {
      const first = group[0],
        last = group.at(-1)!,
        // The marker sits on the middle sample of the run.
        mid = group[Math.floor((group.length - 1) / 2)];
      const f = facts[first],
        m = facts[mid];
      const { weather, relation, pass, risks, uvRisk } = f;
      const at = (i: number) => facts[i];
      const values = (pick: (i: number) => number | null) => group.map(pick);
      const km = range(
        values((i) => at(i).point.distance),
        (v) => distanceLabel(v ?? 0, distanceUnits(), locale),
      );
      // A later day: the end time with its day offset, as "23:51–06:23 (+1)".
      const until = (from: number, to: number) => {
        const days = daysApart(from, to);
        return `${clock(to)}${days ? ` (+${days})` : ''}`;
      };
      const when =
        first === last
          ? time(passage[first])
          : `${time(passage[first])}–${until(passage[first], passage[last])}`;
      const passText = pass
        ? ` · ${t(pass === 'return' ? 'Return' : 'Outbound')}`
        : '';

      const severity = risks[0]?.severity ?? 0;
      const item = document.createElement('li');
      const detail = document.createElement('button');
      detail.type = 'button';
      detail.className = 'weather-card';
      detail.id = `weather-point-${first}`;
      detail.dataset.severity = String(severity);
      const header = document.createElement('span');
      header.className = 'weather-card-header';
      const heading = document.createElement('strong');
      heading.textContent = when;
      const badge = document.createElement('span');
      badge.className = 'weather-card-severity';
      badge.textContent = t(severity ? `Alert ${severity}` : 'No alert');
      header.append(heading, badge);
      // Where along the route, on its own line like the other topics, so the
      // header keeps the time and the badge on one line.
      const place = document.createElement('span');
      place.className = 'weather-card-place';
      place.append(icon('route'), `${km}${passText}`);
      const conditions = document.createElement('span');
      conditions.className = 'weather-card-conditions';
      conditions.append(icon(weather.icon), t(weather.text));
      // One topic per line, as wind and UV, in the chosen units and the
      // interface's number format; a merged card shows ranges.
      const temperature = document.createElement('span');
      temperature.className = 'weather-card-temperature';
      temperature.append(
        icon('thermometer'),
        range(
          values((i) => at(i).hour.temperature),
          (v) => temperatureLabel(v, temperatureUnits(), locale),
        ),
      );
      const rain = document.createElement('span');
      rain.className = 'weather-card-rain';
      rain.append(
        icon('droplet'),
        t(
          `Rain ${range(
            values((i) => at(i).hour.probability),
            (v) => `${v ?? '—'}%`,
          )} · ${range(
            values((i) => at(i).hour.precipitation),
            (v) => precipitationLabel(v, temperatureUnits(), locale),
          )}`,
        ),
      );
      const wind = document.createElement('span');
      wind.className = 'weather-card-wind';
      const windRange = values((i) => at(i).hour.wind).every((v) => v === null)
        ? null
        : range(
            values((i) => at(i).hour.wind),
            (v) => speedLabel(v) ?? '—',
          );
      wind.append(
        icon('wind'),
        document.createTextNode(
          `${t(relation)}${windRange === null ? '' : ` · ${windRange}`}`,
        ),
      );
      detail.append(header, place, conditions, temperature, rain, wind);
      // UV only while the sun counts (rounded index 1 or more). With a UV
      // alert the line carries it, from the nearest hour up to the worst one.
      let uvText = '';
      const tops = values((i) => at(i).topUv).filter(
        (v): v is number => v !== null,
      );
      if (tops.length && Math.max(...tops) >= 1) {
        const high = Math.max(...tops);
        const lows = values((i) => at(i).nearUv ?? at(i).topUv).filter(
          (v): v is number => v !== null,
        );
        const low = Math.min(...lows, high);
        uvText = t(
          `UV ${low < high ? `${low}–${high}` : high} · ${uvCategory(high)}`,
        );
        const uv = document.createElement('span');
        uv.className = 'weather-card-uv';
        uv.dataset.category = uvCategory(high);
        if (uvRisk) uv.dataset.alert = '';
        uv.append(
          icon(uvRisk ? 'alert' : 'weather-sun'),
          document.createTextNode(uvText),
        );
        detail.append(uv);
      }
      const extraRisks = risks.filter(
        (risk) => risk.text !== weather.text && !UV_RISKS.has(risk.text),
      );
      if (extraRisks.length) {
        const warnings = document.createElement('span');
        warnings.className = 'weather-card-risks';
        warnings.append(
          icon('alert'),
          document.createTextNode(
            extraRisks.map((risk) => t(risk.text)).join(' · '),
          ),
        );
        detail.append(warnings);
      }
      item.append(detail);
      details.append(item);
      const markerBody = document.createElement('span');
      markerBody.className = 'weather-marker-content';
      const markerIcon = document.createElement('span');
      markerIcon.className = 'weather-marker-symbol';
      markerIcon.setAttribute('aria-hidden', 'true');
      const mapSymbol = icon(weather.icon);
      markerIcon.append(mapSymbol);
      const hour = m.hour;
      const strength = windStrength(hour.wind);
      const flow =
        hour.wind !== null && hour.wind >= 1
          ? windFlowDirection(hour.windDirection)
          : null;
      const windBadge = document.createElement('span');
      windBadge.className = 'weather-marker-wind';
      windBadge.dataset.strength = strength.level;
      windBadge.dataset.relation = relation;
      windBadge.setAttribute('aria-hidden', 'true');
      const arrow = icon(flow ? 'up' : 'wind');
      if (flow) {
        arrow.classList.add('weather-wind-arrow');
        arrow.dataset.direction = String(flow.degrees);
        arrow.style.transform = `rotate(${flow.degrees}deg)`;
      }
      const windValue = document.createElement('span');
      windValue.className = 'weather-marker-wind-value';
      windValue.textContent =
        hour.wind === null
          ? '—'
          : speedFromKmh(hour.wind, distanceUnits()).toLocaleString(locale, {
              maximumFractionDigits: hour.wind < 100 ? 1 : 0,
            });
      const windUnit = document.createElement('span');
      windUnit.className = 'weather-marker-wind-unit';
      windUnit.textContent = speedUnit();
      windBadge.append(arrow, windValue, windUnit);
      markerBody.append(markerIcon, windBadge);
      const marker = L.marker(m.point.coord, {
        pane: 'weather',
        icon: L.divIcon({
          // A return marker hangs to the left, beside the outbound one.
          className:
            pass === 'return'
              ? 'weather-marker weather-marker-return'
              : 'weather-marker',
          html: markerBody,
          iconSize: [60, 52],
          iconAnchor: pass === 'return' ? [58, 40] : [2, 40],
        }),
        keyboard: true,
      }).addTo(markers);
      centerIcon(mapSymbol);
      const markerSpeed = speedLabel(hour.wind);
      marker
        .getElement()
        ?.setAttribute(
          'aria-label',
          `${t('View weather')}: ${when} · ${km}${passText} · ${t(weather.text)} · ${t(strength.text)}${relation === strength.text ? '' : ` · ${t(relation)}`}${markerSpeed === null ? '' : ` · ${markerSpeed}`}${flow ? ` · ${t('Wind toward')} ${t(flow.compass)}` : ''}`,
        );
      detail.setAttribute(
        'aria-label',
        `${t('Show on map')}: ${when} · ${km}${passText} · ${conditions.textContent} · ${temperature.textContent} · ${rain.textContent} · ${wind.textContent} · ${t(severity ? `Alert ${severity}` : 'No alert')}${uvRisk ? ` · ${uvText}` : ''}${extraRisks.length ? ` · ${extraRisks.map((risk) => t(risk.text)).join(' · ')}` : ''}`,
      );
      detail.setAttribute('aria-controls', 'map');
      detail.onclick = () => {
        if (
          !$('route-panel').hidden &&
          matchMedia('(max-width: 759px)').matches
        )
          $('panel-toggle').click();
        map.stop();
        map.setView(m.point.coord, Math.max(map.getZoom(), 12), {
          animate: false,
        });
        marker.getElement()?.focus({ preventScroll: true });
      };
      marker.getElement()?.setAttribute('aria-controls', detail.id);
      marker.getElement()?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          void revealCard(detail);
        }
      });
      marker.on('click', () => {
        void revealCard(detail);
      });
    });
    $('weather-result').hidden = false;
    retry.hidden = true;
    // More stops than the sample cap: say how many have their own card.
    const sampled = points.filter((p) => p.stop).length;
    message(
      sampled < stops ? `Weather sampled at ${sampled} of ${stops} stops.` : '',
    );
  }
  // Date errors show next to the field, which lives in the route summary.
  const dateError = (value: string) => {
    $('departure-error').replaceChildren(document.createTextNode(value));
    if (value) departure.setAttribute('aria-invalid', 'true');
    else departure.removeAttribute('aria-invalid');
  };
  departure.onchange = (event) => {
    if (!(event instanceof CustomEvent))
      return keepInPlace(departure, () => applyDeparture(event));
    applyDeparture(event);
  };
  function applyDeparture(event: Event) {
    invalidate();
    // The automatic departure moving: nothing to store.
    if (event instanceof CustomEvent && event.detail === AUTOMATIC) {
      dateError('');
      render();
      return;
    }
    const value = departure.value;
    if (!value) {
      declineAutomaticDeparture();
      delete getState().departure;
      dateError('');
      showDeparture();
      syncState();
      render();
      return;
    }
    const date = new Date(value);
    const iso = Number.isFinite(date.getTime()) ? date.toISOString() : '';
    const error = departureError(iso);
    if (error) {
      declineAutomaticDeparture();
      delete getState().departure;
      dateError(error);
      automaticBox.checked = false;
      message('');
      syncState();
      return;
    }
    dateError('');
    // Any edit by the user fixes the departure, even the suggested time.
    getState().departure = iso;
    showDeparture();
    syncState();
    schedule();
  }
  /** Change event for the automatic departure, told apart from user edits. */
  const automaticChange = () =>
    new CustomEvent('change', { detail: AUTOMATIC });
  const automaticBox = $<HTMLInputElement>('auto-departure');
  /** Last automatic departure shown, to notice when it moves to a new slot. */
  let shownAutomatic = departureOf(getState());
  /** Field and checkbox for the automatic or chosen departure. */
  function showDeparture() {
    const state = getState(),
      automatic = isAutomaticDeparture(state);
    if (document.activeElement !== departure) {
      const value = departureOf(state);
      departure.value = value ? localDateTime(value) : '';
    }
    if (automatic) shownAutomatic = departureOf(state);
    automaticBox.checked = automatic;
  }
  // Checked: follow the next half hour again. Unchecked by hand: no automatic
  // departure on this device. Editing or clearing the field only unchecks it.
  automaticBox.onchange = () =>
    keepInPlace(automaticBox, () => {
      setAutomaticDeparture(automaticBox.checked);
      if (automaticBox.checked) {
        delete getState().departure;
        dateError('');
        syncState();
      }
      departure.dispatchEvent(automaticChange());
    });
  // The automatic departure moves at each slot while the page is visible;
  // a hidden tab catches up when it becomes visible again.
  let slotTimer: ReturnType<typeof setTimeout> | undefined;
  /** Announces the automatic departure when it has moved to a new slot. */
  function moveAutomatic() {
    const state = getState(),
      value = departureOf(state);
    if (!isAutomaticDeparture(state) || value === shownAutomatic) return;
    shownAutomatic = value;
    if (getRoute()) departure.dispatchEvent(automaticChange());
    else showDeparture();
  }
  function nextSlot() {
    clearTimeout(slotTimer);
    // At least a second apart, so an exact slot boundary cannot spin.
    slotTimer = setTimeout(
      () => {
        if (document.hidden) return;
        if (document.activeElement === departure) {
          slotTimer = setTimeout(nextSlot, 30_000);
          return;
        }
        moveAutomatic();
        nextSlot();
      },
      Math.max(1000, untilNextSlot()),
    );
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    moveAutomatic();
    nextSlot();
  });
  nextSlot();
  function schedule() {
    const state = getState(),
      route = getRoute(),
      date = departureOf(state);
    if (!route || !date) return;
    const error = departureError(date);
    if (error) {
      message(error, true);
      return;
    }
    if (
      attemptedRoute === route &&
      attemptedDeparture === date &&
      attemptedEndpoint === endpoint &&
      attemptedSpeed === getSpeed()
    )
      return;
    attemptedRoute = route;
    attemptedDeparture = date;
    attemptedEndpoint = endpoint;
    attemptedSpeed = getSpeed();
    clearTimeout(automaticTimer);
    automaticTimer = setTimeout(() => {
      automaticTimer = undefined;
      requestForecast();
    }, 500);
  }
  function requestForecast() {
    let samples: WeatherPoint[],
      requestedStops: number,
      passage: number[],
      interval: { start: number; end: number };
    try {
      const route = getRoute();
      if (!route) throw new Error('Calculate or import a route first.');
      ({ samples, stops: requestedStops } = sampleRouteStops(
        route,
        getState().points,
        getSpeed(),
      ));
      passage = times(samples);
      interval = forecastInterval(passage[0], passage.at(-1)!);
    } catch (error) {
      message((error as Error).message, true);
      return;
    }
    invalidate();
    const version = requestVersion,
      route = getRoute(),
      date = departureOf(getState()),
      base = endpoint;
    const valid = () =>
      version === requestVersion &&
      route === getRoute() &&
      date === departureOf(getState()) &&
      base === endpoint;
    attemptedRoute = route;
    attemptedDeparture = date;
    attemptedEndpoint = base;
    attemptedSpeed = getSpeed();
    controller = new AbortController();
    retry.disabled = true;
    retry.hidden = true;
    message('Loading weather…');
    void weatherForecast(
      base,
      samples,
      interval.start,
      interval.end,
      controller.signal,
      valid,
    )
      .then((data) => {
        if (!valid()) return;
        limitRetried = false;
        forecast = data;
        points = samples;
        stops = requestedStops;
        sourceRoute = route;
        sourceDeparture = date;
        sourceEndpoint = base;
        stale = false;
        render();
      })
      .catch((error) => {
        if (!valid()) return;
        // Usage limit: a live countdown, then one automatic retry; refused
        // again, the button appears only when the countdown ends.
        if (error instanceof UsageLimitError) {
          const again = !limitRetried;
          limitRetried = true;
          cancelLimit();
          cancelLimit = countdown(
            error.wait,
            (seconds) => {
              if (!valid()) return cancelLimit();
              message(
                `Weather usage limit reached. ${retryIn(seconds * 1000)}`,
              );
            },
            () => {
              if (!valid()) return;
              if (again) requestForecast();
              else {
                message('Weather usage limit reached.', true);
                retry.hidden = false;
              }
            },
          );
          return;
        }
        message(
          error instanceof Error
            ? error.message
            : 'Weather unavailable. Try again.',
          true,
        );
        retry.hidden = false;
      })
      .finally(() => {
        if (valid()) {
          retry.disabled = false;
          controller = undefined;
        }
      });
  }
  retry.onclick = requestForecast;
  return {
    invalidate,
    render,
    syncInputs: showDeparture,
    /** The Open-Meteo base URL (device preference), also used for elevation. */
    endpoint: () => endpoint,
    applyServer() {
      const value = serverUrl(
        $<HTMLInputElement>('weather-server').value.trim(),
      );
      if (value !== endpoint) invalidate();
      endpoint = value;
      try {
        localStorage.setItem('weather-server', endpoint);
      } catch {
        /* Optional preference. */
      }
    },
  };
}
