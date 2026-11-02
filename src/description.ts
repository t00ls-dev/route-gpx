import { parseCoordinates, type Point } from './core';
export interface RouteIntent {
  stops: string[];
  prefer: boolean;
}
/** Deliberately local and deterministic: no AI service or implicit geocoding. */
export function parseDescription(input: string): RouteIntent {
  if (input.length > 4000)
    throw new Error('Keep the description under 4,000 characters.');
  const prefer =
    /\b(main roads?|major highways?|highways?|vias principais|rodovias principais)\b/i.test(
      input,
    );
  let s = input
    .trim()
    .replace(
      /(?:[.;]\s*|\s+)(?:prefer|use|keep to|stay on|prefira|use apenas|sempre se mantendo pelas?|pelas?)\s+(?:the\s+)?(?:main roads?|major highways?|highways?|vias principais|rodovias principais)[.!]?\s*$/i,
      '',
    )
    .trim();
  s = s.replace(
    /^(?:start(?:ing)?\s+(?:at|from)|from|leave|saindo\s+(?:do|da|de)|começando\s+(?:no|na|em)|de)\s+/i,
    '',
  );
  // Supported connectors are explicit so arbitrary prose cannot invent locations.
  s = s.replace(
    /(?:\s+|,\s*)(?:and\s+|e\s+)?(?:finish(?:ing)?\s+(?:at|in)|end(?:ing)?\s+(?:at|in)|termina(?:ndo)?\s+(?:em|no|na)|até|to)\s+/gi,
    '\n',
  );
  s = s.replace(
    /(?:\s+|,\s*)(?:via|passing\s+through|go\s+through|through|passando\s+(?:por|pelo|pela)|passe\s+(?:por|pelo|pela)|subindo\s+(?:o|a|pelo|pela)|descendo\s+(?:pelo|pela)|em\s+direção\s+(?:a|à|ao))\s+/gi,
    '\n',
  );
  s = s.replace(/\s*(?:→|->|\s>\s)\s*/g, '\n');
  const stops = s
    .split(/\n/)
    .flatMap((part) => part.split(/\s+(?:and|e)\s+(?=[\p{L}(+-])/u))
    .map((p) =>
      p
        .trim()
        .replace(/^[,;]+|[,;.!]+$/g, '')
        .trim(),
    )
    .filter(Boolean);
  if (stops.length < 2)
    throw new Error(
      'Include a start and a destination: “From A via B to C”, “De A passando por B até C”, or one place per line.',
    );
  if (stops.length > 25)
    throw new Error('Use up to 25 places per description.');
  if (stops.some((p) => p.length > 240))
    throw new Error(
      'One place name is too long. Use a specific street or landmark.',
    );
  return { stops, prefer };
}
export function intentPoints(intent: RouteIntent): Point[] {
  return intent.stops.map((name) => ({ name, coord: parseCoordinates(name) }));
}
