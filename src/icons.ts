const cloud =
  '<path class="weather-cloud-shape" d="M6 14a4 4 0 1 1 .8-7.9A6 6 0 0 1 18.5 7a3.5 3.5 0 0 1-.5 7Z"/>';
const lightning =
  '<path class="weather-lightning" d="m13 14-4 5h4l-1 4 6-7h-4l1-2"/>';
const paths = {
  'weather-sun':
    '<circle class="weather-sun-shape" cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  'weather-partly-cloudy':
    '<circle class="weather-sun-shape" cx="8" cy="7" r="3"/><path class="weather-sun-rays" d="M8 1v1M1 7h1m1-5 1 1m8-1-1 1M3 12l1-1"/><path class="weather-cloud-shape" d="M9 19a4 4 0 1 1 1-7.9 5 5 0 0 1 9.5 1 3.5 3.5 0 0 1-1.5 6.9Z"/>',
  'weather-cloud': cloud,
  'weather-fog': cloud + '<path d="M5 18h14M8 22h8"/>',
  'weather-drizzle':
    cloud +
    '<circle class="weather-precipitation" cx="8" cy="18" r=".65" fill="currentColor"/><circle class="weather-precipitation" cx="16" cy="20" r=".65" fill="currentColor"/>',
  'weather-rain':
    cloud + '<path class="weather-precipitation" d="m9 18-1 3m8-3-1 3"/>',
  'weather-heavy-rain':
    cloud +
    '<path class="weather-precipitation" d="m7 17-1 5m7-5-1 5m7-5-1 5"/>',
  'weather-freezing-rain':
    cloud +
    '<path class="weather-precipitation" d="m7 18 4 4m-4 0 4-4m5-1-1 5"/>',
  'weather-snow':
    cloud +
    '<path class="weather-precipitation" d="M12 16v6m-2.6-4.5 5.2 3m-5.2 0 5.2-3"/>',
  'weather-thunderstorm': cloud + lightning,
  'weather-hail':
    cloud +
    lightning +
    '<circle class="weather-precipitation" cx="5" cy="19" r=".65" fill="currentColor"/><circle class="weather-precipitation" cx="20" cy="21" r=".65" fill="currentColor"/>',
  alert: '<path d="m12 3 10 18H2Z M12 9v5m0 3v.1"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  chevron: '<path d="m6 15 6-6 6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  external:
    '<path d="M14 3h7v7m0-7L10 14M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6"/>',
  wind: '<path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 17h5a2 2 0 1 1-2 2"/>',
  locate:
    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  layers: '<path d="m3 7 9-5 9 5-9 5Z M3 12l9 5 9-5 M3 17l9 5 9-5"/>',
  maximize: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  minimize: '<path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/>',
  route:
    '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  up: '<path d="m5 10 7-7 7 7M12 3v18"/>',
  down: '<path d="m5 14 7 7 7-7M12 21V3"/>',
  info: '<path d="M12 11v6m-1-6h1m-1 6h2"/><circle cx="12" cy="7" r=".5"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5m-5 5 5 5"/>',
  sunrise:
    '<path d="M2 20h20M7 20a5 5 0 0 1 10 0M12 3v6M9 6l3-3 3 3M4.5 12.5 6 14M19.5 12.5 18 14"/>',
  sunset:
    '<path d="M2 20h20M7 20a5 5 0 0 1 10 0M12 9V3M9 6l3 3 3-3M4.5 12.5 6 14M19.5 12.5 18 14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock:
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1-1.5 2M12 16v1"/>',
} as const;
export type IconName = keyof typeof paths;
export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('button-icon', `icon-${name}`);
  svg.innerHTML = paths[name];
  return svg;
}
/** Labels remain English source keys; the existing DOM observer translates them. */
export function iconControl(
  control: HTMLElement,
  name: IconName,
  label: string,
  alwaysIcon = false,
) {
  const caption = document.createElement('span');
  caption.className = 'button-label';
  caption.textContent = label;
  control.replaceChildren(icon(name), caption);
  control.setAttribute('aria-label', label);
  control.setAttribute('title', label);
  control.classList.add('icon-control');
  if (alwaysIcon) control.classList.add('icon-only');
}

/** Center the painted geometry, not the SVG baseline or unused viewBox space. */
export function centerIcon(svg: SVGSVGElement): void {
  const box = svg.getBBox();
  if (!box.width || !box.height) return;
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute(
    'transform',
    `translate(${(12 - box.x - box.width / 2).toFixed(3)} ${(12 - box.y - box.height / 2).toFixed(3)})`,
  );
  group.append(...Array.from(svg.childNodes));
  svg.append(group);
}
