import { expect, it } from 'vitest';
import {
  distanceLabel,
  precipitationLabel,
  shortDistanceLabel,
  temperatureLabel,
} from '../src/units';
it('converts metric to miles with consistent precision and locale', () => {
  expect(distanceLabel(1609.344, 'imperial')).toBe('1 mi');
  expect(distanceLabel(42000, 'imperial')).toBe('26.1 mi');
  expect(distanceLabel(42150, 'metric', 'pt-BR')).toBe('42,2 km');
  expect(shortDistanceLabel(100, 'imperial')).toBe('328 ft');
});
it('converts weather temperature and precipitation with the temperature units', () => {
  expect(temperatureLabel(24.1, 'celsius', 'pt-BR')).toBe('24,1 °C');
  expect(temperatureLabel(24.1, 'fahrenheit')).toBe('75.4 °F');
  expect(temperatureLabel(-40, 'fahrenheit')).toBe('-40 °F');
  expect(temperatureLabel(null, 'fahrenheit')).toBe('— °F');
  expect(precipitationLabel(0.2, 'celsius', 'pt-BR')).toBe('0,2 mm');
  expect(precipitationLabel(12.7, 'fahrenheit')).toBe('0.5 in');
  expect(precipitationLabel(0.2, 'fahrenheit', 'pt-BR')).toBe('0,01 in');
  expect(precipitationLabel(null)).toBe('— mm');
});
