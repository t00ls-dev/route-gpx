import { speedFromKmh } from './travel-time';
import { byId as $ } from './dom';
import L from 'leaflet';
import { type Route, type State, serverUrl } from './core';
import { t, weatherDescription } from './i18n';
import { distanceLabel } from './units';
import { classifyWeather } from './weather-risk';
import { windRelation, windStrength, windFlowDirection } from './weather-wind';
import { icon, centerIcon } from './icons';
import { weatherForecast } from './services';
import {
  DEFAULT_WEATHER_URL,
  HOUR,
  departureError,
  forecastInterval,
  localDateTime,
  nearestHour,
  passageTime,
  sampleRoute,
  weatherWindow,
  type WeatherForecast,
  type WeatherPoint,
} from './weather';
export function setupWeather(
  map: L.Map,
  getState: () => State,
  getRoute: () => Route | null,
  syncState: () => void,
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
  const message = (value: string, error = false) => {
    $('weather-status').replaceChildren(document.createTextNode(value));
    $('weather-status').classList.toggle('error', error);
  };
  function invalidate() {
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
    const state = getState();
    const error = departureError(state.departure ?? '');
    if (error) throw new Error(error);
    return samples.map((p) =>
      passageTime(p, Date.parse(state.departure!), state.averageSpeedKmh ?? 60),
    );
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
    if (!getState().departure) {
      $('weather-result').hidden = true;
      message('');
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
      state.departure !== sourceDeparture ||
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
    const desiredPoints = sampleRoute(
      sourceRoute!,
      state.points,
      state.averageSpeedKmh ?? 60,
    );
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
    points.forEach((point, i) => {
      const hour = nearestHour(forecast!.hours[i], passage[i]);
      const risks = classifyWeather(
        weatherWindow(forecast!.hours[i], passage[i]),
      );
      const weather = weatherDescription(hour.code);
      const km = distanceLabel(point.distance, state.units, locale);

      const severity = risks[0]?.severity ?? 0;
      const item = document.createElement('li');
      const detail = document.createElement('button');
      detail.type = 'button';
      detail.className = 'weather-card';
      detail.id = `weather-point-${i}`;
      detail.dataset.severity = String(severity);
      const header = document.createElement('span');
      header.className = 'weather-card-header';
      const when = document.createElement('strong');
      when.textContent = `${time(passage[i])} · ${km}`;
      const badge = document.createElement('span');
      badge.className = 'weather-card-severity';
      badge.textContent = t(severity ? `Alert ${severity}` : 'No alert');
      header.append(when, badge);
      const conditions = document.createElement('span');
      conditions.className = 'weather-card-conditions';
      conditions.append(
        icon(weather.icon),
        document.createTextNode(
          `${t(weather.text)} · ${hour.temperature ?? '—'} °C · ${hour.precipitation ?? '—'} mm · ${hour.probability ?? '—'}%`,
        ),
      );
      const relation = windRelation(
        hour.wind,
        hour.windDirection,
        point.bearing,
      );
      const wind = document.createElement('span');
      wind.className = 'weather-card-wind';
      const windSpeed =
        hour.wind === null
          ? null
          : speedFromKmh(hour.wind, state.units).toLocaleString(locale, {
              maximumFractionDigits: 1,
            });
      wind.append(
        icon('wind'),
        document.createTextNode(
          `${t(relation)}${windSpeed === null ? '' : ` · ${windSpeed} ${state.units === 'imperial' ? 'mph' : 'km/h'}`}`,
        ),
      );
      detail.append(header, conditions, wind);
      const extraRisks = risks.filter((risk) => risk.text !== weather.text);
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
          : speedFromKmh(hour.wind, state.units).toLocaleString(locale, {
              maximumFractionDigits: hour.wind < 100 ? 1 : 0,
            });
      const windUnit = document.createElement('span');
      windUnit.className = 'weather-marker-wind-unit';
      windUnit.textContent = state.units === 'imperial' ? 'mph' : 'km/h';
      windBadge.append(arrow, windValue, windUnit);
      markerBody.append(markerIcon, windBadge);
      const marker = L.marker(point.coord, {
        pane: 'weather',
        icon: L.divIcon({
          className: 'weather-marker',
          html: markerBody,
          iconSize: [60, 52],
          iconAnchor: [2, 40],
        }),
        keyboard: true,
      }).addTo(markers);
      centerIcon(mapSymbol);
      marker
        .getElement()
        ?.setAttribute(
          'aria-label',
          `${t('View weather')}: ${time(passage[i])} · ${km} · ${t(weather.text)} · ${t(strength.text)}${relation === strength.text ? '' : ` · ${t(relation)}`}${windSpeed === null ? '' : ` · ${windSpeed} ${state.units === 'imperial' ? 'mph' : 'km/h'}`}${flow ? ` · ${t('Wind toward')} ${t(flow.compass)}` : ''}`,
        );
      detail.setAttribute(
        'aria-label',
        `${t('Show on map')}: ${time(passage[i])} · ${km} · ${conditions.textContent} · ${wind.textContent} · ${t(severity ? `Alert ${severity}` : 'No alert')}${extraRisks.length ? ` · ${extraRisks.map((risk) => t(risk.text)).join(' · ')}` : ''}`,
      );
      detail.setAttribute('aria-controls', 'map');
      detail.onclick = () => {
        if (
          !$('route-panel').hidden &&
          matchMedia('(max-width: 759px)').matches
        )
          $('panel-toggle').click();
        map.stop();
        map.setView(point.coord, Math.max(map.getZoom(), 12), {
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
    message('');
  }
  // Date errors show next to the field, which lives in the route summary.
  const dateError = (value: string) => {
    $('departure-error').replaceChildren(document.createTextNode(value));
    if (value) departure.setAttribute('aria-invalid', 'true');
    else departure.removeAttribute('aria-invalid');
  };
  departure.onchange = () => {
    invalidate();
    const value = departure.value;
    if (!value) {
      delete getState().departure;
      dateError('');
      message('');
      syncState();
      return;
    }
    const date = new Date(value);
    const iso = Number.isFinite(date.getTime()) ? date.toISOString() : '';
    const error = departureError(iso);
    if (error) {
      delete getState().departure;
      dateError(error);
      message('');
      syncState();
      return;
    }
    dateError('');
    getState().departure = iso;
    syncState();
    schedule();
  };
  function schedule() {
    const state = getState(),
      route = getRoute();
    if (!route || !state.departure) return;
    const error = departureError(state.departure);
    if (error) {
      message(error, true);
      return;
    }
    if (
      attemptedRoute === route &&
      attemptedDeparture === state.departure &&
      attemptedEndpoint === endpoint &&
      attemptedSpeed === (state.averageSpeedKmh ?? 60)
    )
      return;
    attemptedRoute = route;
    attemptedDeparture = state.departure;
    attemptedEndpoint = endpoint;
    attemptedSpeed = state.averageSpeedKmh ?? 60;
    clearTimeout(automaticTimer);
    automaticTimer = setTimeout(() => {
      automaticTimer = undefined;
      requestForecast();
    }, 500);
  }
  function requestForecast() {
    let samples: WeatherPoint[],
      passage: number[],
      interval: { start: number; end: number };
    try {
      const route = getRoute();
      if (!route) throw new Error('Calculate or import a route first.');
      samples = sampleRoute(
        route,
        getState().points,
        getState().averageSpeedKmh ?? 60,
      );
      passage = times(samples);
      interval = forecastInterval(passage[0], passage.at(-1)!);
    } catch (error) {
      message((error as Error).message, true);
      return;
    }
    invalidate();
    const version = requestVersion,
      route = getRoute(),
      date = getState().departure,
      base = endpoint;
    const valid = () =>
      version === requestVersion &&
      route === getRoute() &&
      date === getState().departure &&
      base === endpoint;
    attemptedRoute = route;
    attemptedDeparture = date;
    attemptedEndpoint = base;
    attemptedSpeed = getState().averageSpeedKmh ?? 60;
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
        forecast = data;
        points = samples;
        sourceRoute = route;
        sourceDeparture = date;
        sourceEndpoint = base;
        stale = false;
        render();
      })
      .catch((error) => {
        if (valid()) {
          message(
            error instanceof Error
              ? error.message
              : 'Weather unavailable. Try again.',
            true,
          );
          retry.hidden = false;
        }
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
    syncInputs() {
      departure.value = getState().departure
        ? localDateTime(getState().departure!)
        : '';
    },
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
