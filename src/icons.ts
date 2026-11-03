const paths = {
  locate:
    '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
  layers: '<path d="m3 7 9-5 9 5-9 5Z M3 12l9 5 9-5 M3 17l9 5 9-5"/>',
  maximize: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  minimize: '<path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/>',
  route:
    '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h9a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h9"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  up: '<path d="m5 10 7-7 7 7M12 3v18"/>',
  down: '<path d="m5 14 7 7 7-7M12 21V3"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  undo: '<path d="M3 10h11a6 6 0 0 1 0 12M3 10l5-5m-5 5 5 5"/>',
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
