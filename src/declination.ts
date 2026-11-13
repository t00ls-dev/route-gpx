/**
 * Magnetic declination from the World Magnetic Model WMM2025 (NOAA NCEI and
 * the British Geological Survey, public domain), valid from 2025.0 to 2030.0.
 * Phone compasses point to magnetic north; adding the declination turns
 * their heading into one relative to true north, the north of the map.
 * Computed on the device from the position; nothing is requested.
 */

const EPOCH = 2025;
const MAX_ORDER = 12;
/**
 * Coefficients of degree n = 1…12 and order m = 0…n, in this order:
 * g, h (nT) and their yearly change (nT/year), from WMM2025.COF.
 */
const COEFFICIENTS: readonly (readonly [number, number, number, number])[] = [
  [-29351.8, 0, 12, 0],
  [-1410.8, 4545.4, 9.7, -21.5],
  [-2556.6, 0, -11.6, 0],
  [2951.1, -3133.6, -5.2, -27.7],
  [1649.3, -815.1, -8, -12.1],
  [1361, 0, -1.3, 0],
  [-2404.1, -56.6, -4.2, 4],
  [1243.8, 237.5, 0.4, -0.3],
  [453.6, -549.5, -15.6, -4.1],
  [895, 0, -1.6, 0],
  [799.5, 278.6, -2.4, -1.1],
  [55.7, -133.9, -6, 4.1],
  [-281.1, 212, 5.6, 1.6],
  [12.1, -375.6, -7, -4.4],
  [-233.2, 0, 0.6, 0],
  [368.9, 45.4, 1.4, -0.5],
  [187.2, 220.2, 0, 2.2],
  [-138.7, -122.9, 0.6, 0.4],
  [-142, 43, 2.2, 1.7],
  [20.9, 106.1, 0.9, 1.9],
  [64.4, 0, -0.2, 0],
  [63.8, -18.4, -0.4, 0.3],
  [76.9, 16.8, 0.9, -1.6],
  [-115.7, 48.8, 1.2, -0.4],
  [-40.9, -59.8, -0.9, 0.9],
  [14.9, 10.9, 0.3, 0.7],
  [-60.7, 72.7, 0.9, 0.9],
  [79.5, 0, -0, 0],
  [-77, -48.9, -0.1, 0.6],
  [-8.8, -14.4, -0.1, 0.5],
  [59.3, -1, 0.5, -0.8],
  [15.8, 23.4, -0.1, 0],
  [2.5, -7.4, -0.8, -1],
  [-11.1, -25.1, -0.8, 0.6],
  [14.2, -2.3, 0.8, -0.2],
  [23.2, 0, -0.1, 0],
  [10.8, 7.1, 0.2, -0.2],
  [-17.5, -12.6, 0, 0.5],
  [2, 11.4, 0.5, -0.4],
  [-21.7, -9.7, -0.1, 0.4],
  [16.9, 12.7, 0.3, -0.5],
  [15, 0.7, 0.2, -0.6],
  [-16.8, -5.2, -0, 0.3],
  [0.9, 3.9, 0.2, 0.2],
  [4.6, 0, -0, 0],
  [7.8, -24.8, -0.1, -0.3],
  [3, 12.2, 0.1, 0.3],
  [-0.2, 8.3, 0.3, -0.3],
  [-2.5, -3.3, -0.3, 0.3],
  [-13.1, -5.2, 0, 0.2],
  [2.4, 7.2, 0.3, -0.1],
  [8.6, -0.6, -0.1, -0.2],
  [-8.7, 0.8, 0.1, 0.4],
  [-12.9, 10, -0.1, 0.1],
  [-1.3, 0, 0.1, 0],
  [-6.4, 3.3, 0, 0],
  [0.2, 0, 0.1, -0],
  [2, 2.4, 0.1, -0.2],
  [-1, 5.3, -0, 0.1],
  [-0.6, -9.1, -0.3, -0.1],
  [-0.9, 0.4, 0, 0.1],
  [1.5, -4.2, -0.1, 0],
  [0.9, -3.8, -0.1, -0.1],
  [-2.7, 0.9, -0, 0.2],
  [-3.9, -9.1, -0, -0],
  [2.9, 0, 0, 0],
  [-1.5, 0, -0, -0],
  [-2.5, 2.9, 0, 0.1],
  [2.4, -0.6, 0, -0],
  [-0.6, 0.2, 0, 0.1],
  [-0.1, 0.5, -0.1, -0],
  [-0.6, -0.3, 0, -0],
  [-0.1, -1.2, -0, 0.1],
  [1.1, -1.7, -0.1, -0],
  [-1, -2.9, -0.1, 0],
  [-0.2, -1.8, -0.1, 0],
  [2.6, -2.3, -0.1, 0],
  [-2, 0, 0, 0],
  [-0.2, -1.3, 0, -0],
  [0.3, 0.7, -0, 0],
  [1.2, 1, -0, -0.1],
  [-1.3, -1.4, -0, 0.1],
  [0.6, -0, -0, -0],
  [0.6, 0.6, 0.1, -0],
  [0.5, -0.1, -0, -0],
  [-0.1, 0.8, 0, 0],
  [-0.4, 0.1, 0, -0],
  [-0.2, -1, -0.1, -0],
  [-1.3, 0.1, -0, 0],
  [-0.7, 0.2, -0.1, -0.1],
];

/** Schmidt-normalized coefficient tables, built once on first use. */
let model: {
  c: number[][];
  cd: number[][];
  k: number[][];
} | null = null;

function grid(): number[][] {
  return Array.from({ length: MAX_ORDER + 1 }, () =>
    new Array<number>(MAX_ORDER + 1).fill(0),
  );
}

function load() {
  const c = grid(),
    cd = grid(),
    k = grid(),
    snorm = grid();
  let i = 0;
  for (let n = 1; n <= MAX_ORDER; n++)
    for (let m = 0; m <= n; m++) {
      const [g, h, dg, dh] = COEFFICIENTS[i++];
      c[m][n] = g;
      cd[m][n] = dg;
      if (m !== 0) {
        c[n][m - 1] = h;
        cd[n][m - 1] = dh;
      }
    }
  snorm[0][0] = 1;
  for (let n = 1; n <= MAX_ORDER; n++) {
    snorm[0][n] = (snorm[0][n - 1] * (2 * n - 1)) / n;
    let j = 2;
    for (let m = 0; m <= n; m++) {
      k[m][n] = ((n - 1) ** 2 - m ** 2) / ((2 * n - 1) * (2 * n - 3));
      if (m > 0) {
        const flnmj = ((n - m + 1) * j) / (n + m);
        snorm[m][n] = snorm[m - 1][n] * Math.sqrt(flnmj);
        j = 1;
        c[n][m - 1] *= snorm[m][n];
        cd[n][m - 1] *= snorm[m][n];
      }
      c[m][n] *= snorm[m][n];
      cd[m][n] *= snorm[m][n];
    }
  }
  k[1][1] = 0;
  return { c, cd, k };
}

/** Decimal year of a date, as the model counts time. */
export function decimalYear(date: Date): number {
  const year = date.getUTCFullYear();
  const start = Date.UTC(year, 0, 1),
    end = Date.UTC(year + 1, 0, 1);
  return year + (date.getTime() - start) / (end - start);
}

/**
 * Declination in degrees, east positive: how far magnetic north lies east of
 * true north at a place (geodetic latitude and longitude in degrees, height
 * in km above the ellipsoid) and decimal year.
 */
export function magneticDeclination(
  latitude: number,
  longitude: number,
  year: number,
  heightKm = 0,
): number {
  model ??= load();
  const { c, cd, k } = model;
  const a = 6378.137,
    b = 6356.7523142,
    re = 6371.2;
  const a2 = a * a,
    b2 = b * b,
    c2 = a2 - b2,
    a4 = a2 * a2,
    b4 = b2 * b2,
    c4 = a4 - b4;
  const dt = year - EPOCH;
  const rad = Math.PI / 180;
  const rlat = latitude * rad,
    rlon = longitude * rad;
  const srlat = Math.sin(rlat),
    crlat = Math.cos(rlat),
    srlat2 = srlat * srlat,
    crlat2 = crlat * crlat;
  // Geodetic to spherical coordinates.
  const q = Math.sqrt(a2 - c2 * srlat2);
  const q1 = heightKm * q;
  const q2 = ((q1 + a2) / (q1 + b2)) ** 2;
  const ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
  const st = Math.sqrt(1 - ct * ct);
  const r = Math.sqrt(
    heightKm * heightKm + 2 * q1 + (a4 - c4 * srlat2) / (q * q),
  );
  const d = Math.sqrt(a2 * crlat2 + b2 * srlat2);
  const ca = (heightKm + d) / r,
    sa = (c2 * crlat * srlat) / (r * d);

  const sp = new Array<number>(MAX_ORDER + 1).fill(0),
    cp = new Array<number>(MAX_ORDER + 1).fill(0);
  sp[0] = 0;
  cp[0] = 1;
  sp[1] = Math.sin(rlon);
  cp[1] = Math.cos(rlon);
  for (let m = 2; m <= MAX_ORDER; m++) {
    sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1];
    cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1];
  }
  const p = grid(),
    dp = grid(),
    tc = grid();
  p[0][0] = 1;
  const pp = new Array<number>(MAX_ORDER + 1).fill(0);
  pp[0] = 1;
  const aor = re / r;
  let ar = aor * aor,
    br = 0,
    bt = 0,
    bp = 0,
    bpp = 0;
  for (let n = 1; n <= MAX_ORDER; n++) {
    ar *= aor;
    for (let m = 0; m <= n; m++) {
      // Associated Legendre functions and their derivatives.
      if (n === m) {
        p[m][n] = st * p[m - 1][n - 1];
        dp[m][n] = st * dp[m - 1][n - 1] + ct * p[m - 1][n - 1];
      } else if (n === 1 && m === 0) {
        p[m][n] = ct * p[m][n - 1];
        dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1];
      } else {
        if (m > n - 2) {
          p[m][n - 2] = 0;
          dp[m][n - 2] = 0;
        }
        p[m][n] = ct * p[m][n - 1] - k[m][n] * p[m][n - 2];
        dp[m][n] =
          ct * dp[m][n - 1] - st * p[m][n - 1] - k[m][n] * dp[m][n - 2];
      }
      // Coefficients at the date.
      tc[m][n] = c[m][n] + dt * cd[m][n];
      if (m !== 0) tc[n][m - 1] = c[n][m - 1] + dt * cd[n][m - 1];
      const par = ar * p[m][n];
      const temp1 =
        m === 0 ? tc[m][n] * cp[m] : tc[m][n] * cp[m] + tc[n][m - 1] * sp[m];
      const temp2 =
        m === 0 ? tc[m][n] * sp[m] : tc[m][n] * sp[m] - tc[n][m - 1] * cp[m];
      bt -= ar * temp1 * dp[m][n];
      bp += m * temp2 * par;
      br += (n + 1) * temp1 * par;
      // At the geographic poles the east component needs its own series.
      if (st === 0 && m === 1) {
        pp[n] = n === 1 ? pp[n - 1] : ct * pp[n - 1] - k[m][n] * pp[n - 2];
        bpp += ar * pp[n] * temp2;
      }
    }
  }
  bp = st === 0 ? bpp : bp / st;
  // Back to geodetic north and east components.
  const bx = -bt * ca - br * sa,
    by = bp;
  return Math.atan2(by, bx) / rad;
}
