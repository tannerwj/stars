const fs = require('fs');
const Astro = eval(fs.readFileSync('/home/hatch/workspace/stars-observatory/public/js/astro.js', 'utf8') + '\n;Astro;');
const R2D = Astro.R2D, D2R = Astro.D2R;
let fails = 0;
function check(name, cond, detail) {
  console.log((cond ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
  if (!cond) fails++;
}

// 1. GMST at J2000.0 must be 280.46061837 deg
const j2000 = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
const g = Astro.gmst(j2000) * R2D;
check('GMST@J2000 = 280.460618', Math.abs(g - 280.46061837) < 1e-4, g.toFixed(6));

// 2. Sun at Sept equinox 2026 (Sept 22 ~18:11 UTC; RA 12h at Sept equinox)
const eq = new Date(Date.UTC(2026, 8, 22, 18, 11, 0));
const s = Astro.sunPos(eq);
const raH = s.ra * R2D / 15;
check('Sun RA ~12h at Sept equinox', Math.abs(raH - 12) < 0.15, raH.toFixed(3) + 'h');
check('Sun Dec ~0 at equinox', Math.abs(s.dec * R2D) < 0.6, (s.dec * R2D).toFixed(3));
check('Sun eclLon ~180', Math.abs(s.lon * R2D - 180) < 1.0, (s.lon * R2D).toFixed(2));

// 3. Polaris altitude at Provo ~= latitude
const lat = 40.2338 * D2R, lon = -111.6585;
const now = new Date();
const lst = Astro.lst(now, lon);
const pol = Astro.altAz(37.9545 * D2R, 89.2641 * D2R, lat, lst);
check('Polaris alt ~= lat', Math.abs(pol.alt * R2D - 40.23) < 1.5, (pol.alt * R2D).toFixed(2));

// 4. Moon: ecliptic latitude within ~6 deg, illum in [0,1]
const m = Astro.moonPos(now);
const eclLat = Math.asin(Math.sin(m.dec) * Math.cos(23.44 * D2R) - Math.cos(m.dec) * Math.sin(23.44 * D2R) * Math.sin(m.ra)) * R2D;
check('Moon |ecl lat| < 6', Math.abs(eclLat) < 6, eclLat.toFixed(2));
check('Moon illum sane', m.illum >= 0 && m.illum <= 1, (m.illum * 100).toFixed(1) + '%');

// 5. Planets sane
for (const p of ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']) {
  const pl = Astro.planetPos(p, now);
  const ok = pl.mag > -6 && pl.mag < 8 && pl.dist > 0;
  check(p + ' sane', ok, 'mag ' + pl.mag.toFixed(1) + ' RA ' + (pl.ra * R2D / 15).toFixed(2) + 'h');
}

// 6. Season mid-season dates (safely inside boundaries)
check('season Oct = Autumn', Astro.seasonOf(Astro.sunPos(new Date(Date.UTC(2026, 9, 15))).lon * R2D) === 'Autumn');
check('season Jan = Winter', Astro.seasonOf(Astro.sunPos(new Date(Date.UTC(2026, 0, 15))).lon * R2D) === 'Winter');
check('season Jul = Summer', Astro.seasonOf(Astro.sunPos(new Date(Date.UTC(2026, 6, 15))).lon * R2D) === 'Summer');
check('season Apr = Spring', Astro.seasonOf(Astro.sunPos(new Date(Date.UTC(2026, 3, 15))).lon * R2D) === 'Spring');

// 7. twilight / limiting mag
check('night lim mag', Astro.limitingMag(-20) === 6.5, String(Astro.limitingMag(-20)));
check('day lim mag', Astro.limitingMag(10) === -1.0, String(Astro.limitingMag(10)));
check('twilight labels', Astro.twilight(-20) === 'Astronomical night' && Astro.twilight(5) === 'Daylight', Astro.twilight(-20));

// 8. projection: zenith -> centre, horizon -> rim
const z = Astro.project(Math.PI / 2, 0);
check('zenith at centre', Math.hypot(z.x, z.y) < 1e-9, JSON.stringify(z));
const h = Astro.project(0, 0);
check('horizon at rim', Math.abs(Math.hypot(h.x, h.y) - 1) < 1e-9, Math.hypot(h.x, h.y).toFixed(4));

// 9. B-V colours sane
const c = Astro.bvToRGB(0.65);
check('bv colour', c.every(v => v >= 0 && v <= 255), JSON.stringify(c));

console.log(fails === 0 ? 'ALL PASS' : fails + ' FAILURES');
process.exit(fails ? 1 : 0);
