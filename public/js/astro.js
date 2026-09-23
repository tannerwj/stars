/* TRIANGULUM — astronomical engine.
 * Pure functions: time, solar/lunar/planetary positions, coordinate transforms.
 * Planetary theory: low-precision Keplerian elements after P. Schlyter
 * ("How to compute planetary positions"), adequate to ~1 arcminute.
 * Star positions are J2000; precession/nutation not applied (sub-degree
 * accuracy is plenty for a survey whose conclusions are foregone).
 */
const Astro = (() => {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = Math.PI * 2;
  const J2000 = 2451545.0;

  const rev = d => ((d % 360) + 360) % 360;
  const rev2 = d => ((d % TAU) + TAU) % TAU;
  const sind = d => Math.sin(d * D2R), cosd = d => Math.cos(d * D2R);

  /* ---------- time ---------- */
  function julianDay(date) { return date.getTime() / 86400000 + 2440587.5; }
  // Greenwich Mean Sidereal Time, radians
  function gmst(date) {
    const jd = julianDay(date);
    const T = (jd - J2000) / 36525;
    let g = 280.46061837 + 360.98564736629 * (jd - J2000)
          + 0.000387933 * T * T - T * T * T / 38710000;
    return rev(g) * D2R;
  }
  function lst(date, lonDeg) { return rev2(gmst(date) + lonDeg * D2R); }

  /* ---------- the Sun ---------- */
  function sunPos(date) {
    const d = julianDay(date) - 2451543.5; // Schlyter epoch: 2000 Jan 0.0
    const w = 282.9404 + 4.70935e-5 * d;
    const e = 0.016709 - 1.151e-9 * d;
    const M = rev(356.0470 + 0.9856002585 * d);
    const E = M + R2D * e * sind(M) * (1 + e * cosd(M));
    const x = cosd(E) - e, y = sind(E) * Math.sqrt(1 - e * e);
    const v = Math.atan2(y, x) * R2D, r = Math.hypot(x, y);
    const lon = rev(v + w);
    const xs = r * cosd(lon), ys = r * sind(lon);
    const ecl = 23.4393 - 3.563e-7 * d;
    const xe = xs, ye = ys * cosd(ecl), ze = ys * sind(ecl);
    const ra = rev2(Math.atan2(ye, xe));
    const dec = Math.atan2(ze, Math.hypot(xe, ye));
    return { ra, dec, lon: lon * D2R, r, M: M * D2R };
  }

  /* ---------- the Moon ---------- */
  function moonPos(date) {
    const d = julianDay(date) - 2451543.5; // Schlyter epoch: 2000 Jan 0.0
    const sun = sunPos(date);
    const N = rev(125.1228 - 0.0529538083 * d);
    const i = 5.1454;
    const w = rev(318.0634 + 0.1643573223 * d);
    const a = 60.2666, e = 0.054900;
    const M = rev(115.3654 + 13.0649929509 * d);
    // solve Kepler
    let E = M + R2D * e * sind(M);
    for (let k = 0; k < 4; k++)
      E = E - (E - R2D * e * sind(E) - M) / (1 - e * cosd(E));
    const x = a * (cosd(E) - e), y = a * Math.sqrt(1 - e * e) * sind(E);
    const v = Math.atan2(y, x) * R2D, r = Math.hypot(x, y);
    const xh = r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(i));
    const yh = r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(i));
    const zh = r * (sind(v + w) * sind(i));
    let lon = rev(Math.atan2(yh, xh) * R2D);
    let lat = Math.atan2(zh, Math.hypot(xh, yh)) * R2D;
    // principal perturbations
    const Ms = sun.M * R2D, Mm = M;
    const Lm = rev(N + w + M), Ls = rev(sun.M * R2D + 282.9404);
    const D = rev(Lm - Ls), F = rev(Lm - N);
    lon += -1.274 * sind(Mm - 2 * D) + 0.658 * sind(2 * D) - 0.186 * sind(Ms)
         - 0.059 * sind(2 * Mm - 2 * D) - 0.057 * sind(Mm - 2 * D + Ms);
    lat += -0.173 * sind(F - 2 * D) - 0.055 * sind(Mm - F - 2 * D)
         - 0.046 * sind(Mm + F - 2 * D) + 0.033 * sind(F + 2 * D)
         + 0.017 * sind(2 * Mm + F);
    const rr = r - 0.58 * cosd(Mm - 2 * D) - 0.46 * cosd(2 * D);
    const xe = rr * cosd(lon) * cosd(lat), ye = rr * (sind(lon) * cosd(lat));
    const ecl = 23.4393 - 3.563e-7 * d;
    // ecliptic -> equatorial
    const xeq = xe;
    const yeq = ye * cosd(ecl) - rr * sind(lat) * sind(ecl);
    const zeq = ye * sind(ecl) + rr * sind(lat) * cosd(ecl);
    const ra = rev2(Math.atan2(yeq, xeq));
    const dec = Math.atan2(zeq, Math.hypot(xeq, yeq));
    const illum = (1 - cosd(D)) / 2;
    return { ra, dec, illum, elong: D };
  }

  /* ---------- planets Mercury..Saturn ---------- */
  const PLANETS = {
    Mercury: { N: [48.3313, 3.24587e-5], i: [7.0047, 5.00e-8], w: [29.1241, 1.01444e-5], a: 0.387098, e: [0.205635, 5.59e-10], M: [168.6562, 4.0923344368] },
    Venus:   { N: [76.6799, 2.46590e-5], i: [3.3946, 2.75e-8],  w: [54.8910, 1.38374e-5], a: 0.723330, e: [0.006773, -1.302e-9], M: [48.0052, 1.6021304744] },
    Mars:    { N: [49.5574, 2.11081e-5], i: [1.8497, -1.78e-8], w: [286.5016, 2.92961e-5], a: 1.523688, e: [0.093405, 2.516e-9],  M: [18.6021, 0.5240207766] },
    Jupiter: { N: [100.4542, 2.76854e-5], i: [1.3030, -1.557e-7], w: [273.8777, 1.64505e-5], a: 5.20256, e: [0.048498, 4.469e-9], M: [19.8950, 0.0830853001] },
    Saturn:  { N: [113.6634, 2.38980e-5], i: [2.4886, -1.081e-7], w: [339.3939, 2.97661e-5], a: 9.55475, e: [0.055546, -9.499e-9], M: [316.9670, 0.0334442282] },
  };
  const MAG_COEF = {
    Mercury: [-0.42, 0.0380, -0.000273, 0.000002],
    Venus:   [-4.47, 0.0103, 0.000057, 0.00000013],
    Mars:    [-1.52, 0.016, 0, 0],
    Jupiter: [-9.40, 0.005, 0, 0],
    Saturn:  [-8.88, 0.044, 0, 0],
  };
  function planetPos(name, date) {
    const P = PLANETS[name]; if (!P) return null;
    const d = julianDay(date) - 2451543.5; // Schlyter epoch: 2000 Jan 0.0
    const N = rev(P.N[0] + P.N[1] * d), inc = P.i[0] + P.i[1] * d;
    const w = rev(P.w[0] + P.w[1] * d), a = P.a;
    const e = P.e[0] + P.e[1] * d, M = rev(P.M[0] + P.M[1] * d);
    let E = M + R2D * e * sind(M);
    for (let k = 0; k < 4; k++)
      E = E - (E - R2D * e * sind(E) - M) / (1 - e * cosd(E));
    const xv = a * (cosd(E) - e), yv = a * Math.sqrt(1 - e * e) * sind(E);
    const v = Math.atan2(yv, xv) * R2D, r = Math.hypot(xv, yv);
    const xh = r * (cosd(N) * cosd(v + w) - sind(N) * sind(v + w) * cosd(inc));
    const yh = r * (sind(N) * cosd(v + w) + cosd(N) * sind(v + w) * cosd(inc));
    const zh = r * (sind(v + w) * sind(inc));
    const sun = sunPos(date);
    const lonsun = sun.lon * R2D, rs = sun.r;
    const xs = rs * cosd(lonsun), ys = rs * sind(lonsun);
    const xg = xh + xs, yg = yh + ys, zg = zh;
    const lon = rev(Math.atan2(yg, xg) * R2D);
    const lat = Math.atan2(zg, Math.hypot(xg, yg)) * R2D;
    const R = Math.hypot(xg, yg, zg); // geocentric distance, AU
    const ecl = 23.4393 - 3.563e-7 * d;
    const xe = R * cosd(lon) * cosd(lat);
    const yeq = R * (sind(lon) * cosd(lat) * cosd(ecl) - sind(lat) * sind(ecl));
    const zeq = R * (sind(lon) * cosd(lat) * sind(ecl) + sind(lat) * cosd(ecl));
    const ra = rev2(Math.atan2(yeq, xe));
    const dec = Math.atan2(zeq, Math.hypot(xe, yeq));
    // phase angle + approximate visual magnitude
    const cosI = (r * r + R * R - rs * rs) / (2 * r * R);
    const FV = Math.acos(Math.max(-1, Math.min(1, cosI))) * R2D;
    const c = MAG_COEF[name];
    const mag = c[0] + 5 * Math.log10(r * R) + c[1] * FV + c[2] * FV * FV + c[3] * FV * FV * FV;
    return { ra, dec, mag, dist: R, phase: FV };
  }

  /* ---------- horizontal coordinates ---------- */
  function altAz(ra, dec, lat, lst) {
    const H = lst - ra;
    const alt = Math.asin(Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H));
    let az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
    az = rev2(az + Math.PI); // from north, eastward
    return { alt, az };
  }
  // stereographic projection of the visible dome, zenith at centre; returns unit coords
  function project(alt, az) {
    const z = Math.PI / 2 - alt;              // zenith distance
    const rho = 2 * Math.tan(z / 2) / 2;      // = tan(z/2); horizon -> 1
    return { x: -rho * Math.sin(az), y: -rho * Math.cos(az), rho };
  }

  /* ---------- star colour from B-V ---------- */
  const BV_STOPS = [
    [-0.40, 148, 172, 255], [-0.15, 176, 196, 255], [0.05, 214, 222, 255],
    [0.30, 255, 246, 232], [0.60, 255, 224, 178], [1.00, 255, 196, 138],
    [1.45, 255, 168, 118], [2.00, 255, 148, 104],
  ];
  function bvToRGB(bv) {
    bv = Math.max(-0.4, Math.min(2.0, bv));
    for (let k = 1; k < BV_STOPS.length; k++) {
      if (bv <= BV_STOPS[k][0]) {
        const a = BV_STOPS[k - 1], b = BV_STOPS[k], f = (bv - a[0]) / (b[0] - a[0]);
        return [Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f), Math.round(a[3] + (b[3] - a[3]) * f)];
      }
    }
    return [255, 148, 104];
  }

  /* ---------- seasons, twilight, limiting magnitude ---------- */
  function seasonOf(eclLonDeg) {
    const s = Math.floor(rev(eclLonDeg + 0) / 90); // 0:Mar equinox..
    return ['Spring', 'Summer', 'Autumn', 'Winter'][s];
  }
  function twilight(sunAltDeg) {
    if (sunAltDeg > 0) return 'Daylight';
    if (sunAltDeg > -6) return 'Civil twilight';
    if (sunAltDeg > -12) return 'Nautical twilight';
    if (sunAltDeg > -18) return 'Astronomical twilight';
    return 'Astronomical night';
  }
  function limitingMag(sunAltDeg) {
    const a = sunAltDeg;
    if (a >= 0) return -1.0;
    if (a >= -6) return -1.0 + (0 - a) / 6 * 4.5;      // -> 3.5
    if (a >= -12) return 3.5 + (-6 - a) / 6 * 2.0;      // -> 5.5
    if (a >= -18) return 5.5 + (-12 - a) / 6 * 0.8;     // -> 6.3
    return 6.5;
  }
  function angSep(ra1, dec1, ra2, dec2) {
    const c = Math.sin(dec1) * Math.sin(dec2) + Math.cos(dec1) * Math.cos(dec2) * Math.cos(ra1 - ra2);
    return Math.acos(Math.max(-1, Math.min(1, c)));
  }
  // point-in-polygon for constellation bounds (arrays of [raRad, decRad] rings)
  function inPoly(ra, dec, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > dec) !== (yj > dec) && ra < (xj - xi) * (dec - yi) / (yj - yi) + xi)
        inside = !inside;
    }
    return inside;
  }

  return {
    D2R, R2D, TAU, J2000, rev, julianDay, gmst, lst, sunPos, moonPos, planetPos,
    altAz, project, bvToRGB, seasonOf, twilight, limitingMag, angSep, inPoly,
  };
})();
