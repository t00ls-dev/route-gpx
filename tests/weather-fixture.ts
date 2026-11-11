export function weatherResponse(url: URL) {
  const start = Date.parse(url.searchParams.get('start_hour')! + ':00Z');
  const end = Date.parse(url.searchParams.get('end_hour')! + ':00Z');
  const time = Array.from(
    { length: Math.round((end - start) / 3600000) + 1 },
    (_, i) => start / 1000 + i * 3600,
  );
  return (
    url.searchParams
      .get('latitude')!
      .split(',')
      // Neighbouring locations differ by 3 °C, more than cards merge across, so
      // each sample keeps its own card unless a test sets uniform weather.
      .map((_, location) => ({
        utc_offset_seconds: 0,
        hourly: {
          time,
          temperature_2m: time.map((): number => (location % 2 ? 24 : 21)),
          precipitation_probability: time.map(() => 80),
          precipitation: time.map(() => 12),
          weather_code: time.map(() => 65),
          wind_speed_10m: time.map(() => 20),
          wind_direction_10m: time.map(() => 90),
          wind_gusts_10m: time.map(() => 65),
          visibility: time.map(() => 10000),
          uv_index: time.map(() => 7),
        },
      }))
  );
}
