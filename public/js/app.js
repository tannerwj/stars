/* TRIANGULUM — Stellar Triangulation Observatory
 * A serious instrument for the rigorous classification of three-star figures. */
(function () {
'use strict';

var $ = function (id) { return document.getElementById(id); };
var TAU = Math.PI * 2, D2R = Math.PI / 180, R2D = 180 / Math.PI;
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- state ---------------- */
var site = { name: 'Provo, Utah', lat: 40.2338 * D2R, lon: -111.6585 * D2R };
var simMs = Date.now();          // simulated epoch (ms)
var playing = true, speed = 1;
var layers = { grid: true, equatorial: false, ecliptic: false, constellations: true, milkyway: true, labels: true };
var verts = [null, null, null];  // selected vertex star objects
var registry = [];               // filed triangles
var triSeq = 0, adjUsed = [];
var hover = null;                // hovered star
var selectedReg = -1;            // registry index highlighted
var meteors = [];
var lastFrame = 0, lastReadout = 0;
var nextMeteorAt = 0;

var canvas = $('sky'), ctx = canvas.getContext('2d');
var W = 0, H = 0, DPR = 1, CX = 0, CY = 0, K = 0;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  CX = W * 0.5 - (W > 900 ? 120 : 0);
  CY = H * 0.52 + (W <= 600 ? 44 : 0);
  K = Math.min(W, H) * 0.46;
}
window.addEventListener('resize', resize);
resize();

/* ---------------- catalogs ---------------- */
var N_FIELD = FIELD.length / 5;
var fRA = new Float64Array(N_FIELD), fDec = new Float64Array(N_FIELD),
    fMag = new Float32Array(N_FIELD), fHip = new Int32Array(N_FIELD),
    fSinDec = new Float64Array(N_FIELD), fCosDec = new Float64Array(N_FIELD),
    fCol = new Uint8ClampedArray(N_FIELD * 3),
    fX = new Float32Array(N_FIELD), fY = new Float32Array(N_FIELD),
    fVis = new Uint8Array(N_FIELD);
(function () {
  for (var i = 0; i < N_FIELD; i++) {
    var ra = FIELD[i * 5], dec = FIELD[i * 5 + 1];
    fRA[i] = ra; fDec[i] = dec;
    fMag[i] = FIELD[i * 5 + 2];
    fHip[i] = FIELD[i * 5 + 3];
    var bv = FIELD[i * 5 + 4];
    fSinDec[i] = Math.sin(dec); fCosDec[i] = Math.cos(dec);
    var c = Astro.bvToRGB(bv);
    fCol[i * 3] = c[0]; fCol[i * 3 + 1] = c[1]; fCol[i * 3 + 2] = c[2];
  }
})();

var STARS_NAMED = (function () { return NAMED.map(function (s, idx) {
  // [name, raRad, decRad, mag, bv, designation, distLy, spectral]
  return { sid: 'n' + idx, ra: s[1], dec: s[2], mag: s[3], bv: s[4], hip: 0,
           name: s[0], desig: s[5], dist: s[6], sp: s[7],
           sinDec: Math.sin(s[2]), cosDec: Math.cos(s[2]),
           col: Astro.bvToRGB(s[4]), x: 0, y: 0, vis: false };
}); })();
// clickable: all named stars + bright field stars
var CLICK_MAG = 4.5;

function starLabel(s) { return s.name || s.desig || ('HIP ' + s.hip); }
function starSub(s) {
  var parts = [];
  if (s.name && s.desig) parts.push(s.desig);
  else if (s.hip) parts.push('HIP ' + s.hip);
  parts.push('mag ' + s.mag.toFixed(2));
  return parts.join(' · ');
}
function fieldStarObj(i) {
  return { sid: 'f' + i, ra: fRA[i], dec: fDec[i], mag: fMag[i], hip: fHip[i],
           name: '', desig: fHip[i] ? 'HIP ' + fHip[i] : 'HYG field star',
           dist: 0, sp: '', col: [fCol[i*3], fCol[i*3+1], fCol[i*3+2]],
           x: fX[i], y: fY[i], vis: !!fVis[i], _fi: i };
}

/* ---------------- constellation lookup ---------------- */
function constellationAt(ra, dec) {
  if (Math.abs(dec) > 88.6 * D2R) return dec > 0 ? 'UMi' : 'Oct'; // pole caps
  var ids = Object.keys(CON_BOUNDS);
  for (var k = 0; k < ids.length; k++) {
    var rings = CON_BOUNDS[ids[k]];
    for (var r = 0; r < rings.length; r++) {
      var ring = rings[r];
      if (Astro.inPoly(ra, dec, ring) || Astro.inPoly(ra + TAU, dec, ring) || Astro.inPoly(ra - TAU, dec, ring))
        return ids[k];
    }
  }
  return '—';
}

/* ---------------- projection ---------------- */
var sinLat = 0, cosLat = 1;
function setLat(lat) { sinLat = Math.sin(lat); cosLat = Math.cos(lat); }
setLat(site.lat);

// project ra/dec -> screen. returns null if behind the dome (below horizon)
function project(ra, dec, sinDec, cosDec, lst, out) {
  var hAng = lst - ra;
  var sinH = Math.sin(hAng), cosH = Math.cos(hAng);
  var sinAlt = sinDec * sinLat + cosDec * cosLat * cosH;
  if (sinAlt < -0.015) return null;
  var alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  var cosAlt = Math.cos(alt);
  var cosAz = (sinDec - sinAlt * sinLat) / (cosAlt * cosLat);
  cosAz = Math.max(-1, Math.min(1, cosAz));
  var sinAz = -sinH * cosDec / cosAlt;
  var az = Math.atan2(sinAz, cosAz);
  var t = Math.tan((Math.PI / 2 - alt) / 2);
  out.x = CX + K * t * Math.sin(az);
  out.y = CY - K * t * Math.cos(az);
  out.alt = alt;
  return out;
}
var _p = { x: 0, y: 0, alt: 0 };
// ecliptic -> equatorial (J2000, mean obliquity), radians in/out
function eclToEq(lam, bet) {
  var ecl = 23.4393 * D2R;
  var x = Math.cos(lam) * Math.cos(bet), y = Math.sin(lam) * Math.cos(bet), z = Math.sin(bet);
  var yeq = y * Math.cos(ecl) - z * Math.sin(ecl), zeq = y * Math.sin(ecl) + z * Math.cos(ecl);
  var ra = Math.atan2(yeq, x);
  return { ra: ra < 0 ? ra + TAU : ra, dec: Math.asin(Math.max(-1, Math.min(1, zeq))) };
}

/* ---------------- time ---------------- */
function simDate() { return new Date(simMs); }
function fmtClock(d) {
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
}
function fmtHMS(hours) {
  hours = ((hours % 24) + 24) % 24;
  var h = Math.floor(hours), m = Math.floor((hours - h) * 60), s = Math.floor((((hours - h) * 60) - m) * 60);
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return p(h) + ':' + p(m) + ':' + p(s);
}
function fmtDate(d) {
  var mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getUTCDate() + ' ' + mon[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

/* ---------------- sky background ---------------- */
function skyGradient(sunAlt) {
  var g = ctx.createRadialGradient(CX, CY, 0, CX, CY, Math.max(W, H) * 0.75);
  var sd = sunAlt * R2D;
  if (sd > 8) {           // day
    g.addColorStop(0, '#2a4a73'); g.addColorStop(0.55, '#1b3358'); g.addColorStop(1, '#0b1830');
  } else if (sd > -6) {   // golden / blue hour
    g.addColorStop(0, '#3d3a55'); g.addColorStop(0.5, '#1c2340'); g.addColorStop(1, '#070b18');
  } else if (sd > -12) {  // twilight
    g.addColorStop(0, '#141a33'); g.addColorStop(0.6, '#0a0f24'); g.addColorStop(1, '#04060e');
  } else {                // night
    g.addColorStop(0, '#0a0e1c'); g.addColorStop(0.6, '#05070f'); g.addColorStop(1, '#020308');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawSunGlow(sun, lst) {
  var sunAlt = Astro.altAz(sun.ra, sun.dec, site.lat, lst).alt;
  if (sunAlt < -24 * D2R) return;
  if (!project(sun.ra, sun.dec, Math.sin(sun.dec), Math.cos(sun.dec), lst, _p)) {
    // below horizon: glow at horizon in sun's azimuth direction
    var aa = Astro.altAz(sun.ra, sun.dec, site.lat, lst);
    var x = CX + K * 1.02 * Math.sin(aa.az), y = CY - K * 1.02 * Math.cos(aa.az);
    var g = ctx.createRadialGradient(x, y, 0, x, y, K * 0.55);
    var warm = Math.max(0, 1 + sunAlt * R2D / 18);
    g.addColorStop(0, 'rgba(255,150,80,' + (0.28 * warm).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    return;
  }
  var g2 = ctx.createRadialGradient(_p.x, _p.y, 0, _p.x, _p.y, K * 0.4);
  g2.addColorStop(0, 'rgba(255,220,160,0.85)');
  g2.addColorStop(0.12, 'rgba(255,190,120,0.35)');
  g2.addColorStop(1, 'rgba(255,180,100,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath(); ctx.arc(_p.x, _p.y, 9, 0, TAU); ctx.fill();
}

function drawMilkyWay(lst) {
  if (!layers.milkyway) return;
  ctx.fillStyle = 'rgba(165,175,215,0.055)';
  ctx.beginPath();
  var started = false;
  for (var p = 0; p < MW_POLYS.length; p++) {
    var poly = MW_POLYS[p];
    for (var i = 0; i < poly.length; i++) {
      var ra = poly[i][0], dec = poly[i][1];
      var sd = Math.sin(dec), cd = Math.cos(dec);
      if (!project(ra, dec, sd, cd, lst, _p)) { started = false; continue; }
      if (!started) { ctx.moveTo(_p.x, _p.y); started = true; }
      else ctx.lineTo(_p.x, _p.y);
    }
    started = false;
    ctx.closePath();
  }
  ctx.fill();
}

function drawGrid(lst) {
  ctx.lineWidth = 1;
  // horizon ring
  ctx.strokeStyle = 'rgba(230,225,210,0.34)';
  ctx.beginPath(); ctx.arc(CX, CY, K, 0, TAU); ctx.stroke();
  if (layers.grid) {
    ctx.strokeStyle = 'rgba(230,225,210,0.10)';
    ctx.fillStyle = 'rgba(154,160,180,0.75)';
    ctx.font = '10px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var alts = [30, 60];
    for (var a = 0; a < alts.length; a++) {
      var r = K * Math.tan((90 - alts[a]) * D2R / 2);
      ctx.beginPath(); ctx.arc(CX, CY, r, 0, TAU); ctx.stroke();
    }
    var cards = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
    for (var c = 0; c < cards.length; c++) {
      var az = cards[c][1] * D2R;
      var x1 = CX + K * 0.02 * Math.sin(az), y1 = CY - K * 0.02 * Math.cos(az);
      var x2 = CX + K * 0.985 * Math.sin(az), y2 = CY - K * 0.985 * Math.cos(az);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.fillText(cards[c][0], CX + K * 1.045 * Math.sin(az), CY - K * 1.045 * Math.cos(az));
    }
    ctx.font = '9px ui-monospace, monospace';
    for (var d = 0; d < 12; d++) {
      if (d % 3 === 0) continue;
      var az2 = d * 30 * D2R;
      ctx.beginPath();
      ctx.moveTo(CX + K * 0.9 * Math.sin(az2), CY - K * 0.9 * Math.cos(az2));
      ctx.lineTo(CX + K * 0.985 * Math.sin(az2), CY - K * 0.985 * Math.cos(az2));
      ctx.stroke();
    }
  }
  if (layers.equatorial) {
    ctx.strokeStyle = 'rgba(120,150,220,0.14)';
    var ra, dec, sd, cd, ok;
    for (var hh = 0; hh < 12; hh++) {
      ra = hh * 2 * 15 * D2R; ctx.beginPath(); ok = false;
      for (var dd = -80; dd <= 80; dd += 4) {
        dec = dd * D2R; sd = Math.sin(dec); cd = Math.cos(dec);
        if (!project(ra, dec, sd, cd, lst, _p)) { ok = false; continue; }
        if (!ok) { ctx.moveTo(_p.x, _p.y); ok = true; } else ctx.lineTo(_p.x, _p.y);
      }
      ctx.stroke();
    }
    for (var dp = -60; dp <= 60; dp += 30) {
      dec = dp * D2R; sd = Math.sin(dec); cd = Math.cos(dec);
      ctx.beginPath(); ok = false;
      for (var h2 = 0; h2 <= 360; h2 += 4) {
        ra = h2 * D2R;
        if (!project(ra, dec, sd, cd, lst, _p)) { ok = false; continue; }
        if (!ok) { ctx.moveTo(_p.x, _p.y); ok = true; } else ctx.lineTo(_p.x, _p.y);
      }
      ctx.stroke();
    }
  }
  if (layers.ecliptic) {
    ctx.strokeStyle = 'rgba(217,164,65,0.4)';
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    var started = false;
    for (var lam = 0; lam <= 360; lam += 2) {
      var eq = eclToEq(lam * D2R, 0);
      if (!project(eq.ra, eq.dec, Math.sin(eq.dec), Math.cos(eq.dec), lst, _p)) { started = false; continue; }
      if (!started) { ctx.moveTo(_p.x, _p.y); started = true; } else ctx.lineTo(_p.x, _p.y);
    }
    ctx.stroke(); ctx.setLineDash([]);
    if (layers.labels) {
      ctx.fillStyle = 'rgba(217,164,65,0.8)'; ctx.font = 'italic 10px Georgia, serif';
      var e0 = eclToEq(0, 0);
      if (project(e0.ra, e0.dec, Math.sin(e0.dec), Math.cos(e0.dec), lst, _p)) ctx.fillText('ecliptic', _p.x + 8, _p.y - 8);
    }
  }
}

function drawConstellations(lst) {
  if (!layers.constellations) return;
  ctx.strokeStyle = 'rgba(150,165,205,0.34)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (var i = 0; i < CON_LINES.length; i++) {
    var s = CON_LINES[i];
    var sd1 = Math.sin(s[1]), cd1 = Math.cos(s[1]);
    var sd2 = Math.sin(s[3]), cd2 = Math.cos(s[3]);
    var a = project(s[0], s[1], sd1, cd1, lst, { x: 0, y: 0, alt: 0 });
    var b = project(s[2], s[3], sd2, cd2, lst, { x: 0, y: 0, alt: 0 });
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  if (layers.labels) {
    ctx.fillStyle = 'rgba(170,178,205,0.85)';
    ctx.font = 'italic 11px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var j = 0; j < CON_LABELS.length; j++) {
      var L = CON_LABELS[j];
      var sd = Math.sin(L[2]), cd = Math.cos(L[2]);
      if (!project(L[1], L[2], sd, cd, lst, _p)) continue;
      if (_p.alt < 4 * D2R) continue;
      ctx.fillText(L[0], _p.x, _p.y);
    }
  }
}

function starRadius(mag) {
  return Math.max(0.55, 4.6 * Math.pow(10, -0.2 * (mag + 1.5)));
}

function drawStars(lst, limMag, t) {
  var i, r, alpha, fade, tw;
  // project all named stars first (positions feed labels, picking, triangles)
  for (i = 0; i < STARS_NAMED.length; i++) {
    var ns = STARS_NAMED[i];
    if (ns.mag > limMag || !project(ns.ra, ns.dec, ns.sinDec, ns.cosDec, lst, _p)) { ns.vis = false; continue; }
    ns.x = _p.x; ns.y = _p.y; ns.vis = true;
  }
  // glow sprites for the brightest
  for (i = 0; i < STARS_NAMED.length; i++) {
    var s = STARS_NAMED[i];
    if (!s.vis || s.mag > 1.6) continue;
    r = starRadius(s.mag) * 3.2;
    var g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
    g.addColorStop(0, 'rgba(255,250,235,0.5)');
    g.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = g;
    ctx.fillRect(s.x - r, s.y - r, r * 2, r * 2);
  }
  // field stars
  for (i = 0; i < N_FIELD; i++) {
    var m = fMag[i];
    if (m > limMag) { fVis[i] = 0; continue; }
    var hAng = lst - fRA[i];
    var sinAlt = fSinDec[i] * sinLat + fCosDec[i] * cosLat * Math.cos(hAng);
    if (sinAlt < -0.015) { fVis[i] = 0; continue; }
    var alt = Math.asin(sinAlt > 1 ? 1 : sinAlt);
    var cosAlt = Math.cos(alt);
    var cosAz = (fSinDec[i] - sinAlt * sinLat) / (cosAlt * cosLat);
    cosAz = cosAz > 1 ? 1 : (cosAz < -1 ? -1 : cosAz);
    var az = Math.atan2(-Math.sin(hAng) * fCosDec[i] / cosAlt, cosAz);
    var tt = Math.tan((Math.PI / 2 - alt) / 2);
    var x = CX + K * tt * Math.sin(az), y = CY - K * tt * Math.cos(az);
    fX[i] = x; fY[i] = y; fVis[i] = 1;
    r = starRadius(m);
    fade = (limMag - m) < 0.9 ? Math.max(0.15, (limMag - m) / 0.9) : 1;
    var hfade = alt < 8 * D2R ? Math.max(0.1, (alt * R2D + 1) / 9) : 1;
    tw = REDUCED || m > 3 ? 1 : 0.82 + 0.18 * Math.sin(t * 2.1 + i * 1.7);
    alpha = fade * hfade * tw;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgb(' + fCol[i*3] + ',' + fCol[i*3+1] + ',' + fCol[i*3+2] + ')';
    if (r <= 1.7) ctx.fillRect(x - r / 2, y - r / 2, r, r);
    else { ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, TAU); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  // named stars on top
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  var drawnLabels = [];
  for (i = 0; i < STARS_NAMED.length; i++) {
    var n = STARS_NAMED[i];
    if (!n.vis) continue;
    r = starRadius(n.mag);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgb(' + n.col[0] + ',' + n.col[1] + ',' + n.col[2] + ')';
    ctx.beginPath(); ctx.arc(n.x, n.y, Math.max(1.1, r * 0.72), 0, TAU); ctx.fill();
    if (layers.labels && n.mag <= 1.6) {
      var ok = true;
      for (var q = 0; q < drawnLabels.length; q++) {
        var dx = drawnLabels[q][0] - n.x, dy = drawnLabels[q][1] - n.y;
        if (dx * dx + dy * dy < 46 * 46) { ok = false; break; }
      }
      if (ok) {
        drawnLabels.push([n.x, n.y]);
        ctx.font = 'italic 12px Georgia, serif';
        ctx.fillStyle = 'rgba(220,215,195,0.92)';
        ctx.fillText(starLabel(n), n.x + r + 5, n.y - r - 3);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/* ================= solar system ================= */
var PLANETS = [
  { k: 'Mercury', n: 'Mercury', c: '#c2a98e', r: 2.4 },
  { k: 'Venus',   n: 'Venus',   c: '#f2e8c8', r: 3.4 },
  { k: 'Mars',    n: 'Mars',    c: '#e08a5a', r: 3.0 },
  { k: 'Jupiter', n: 'Jupiter', c: '#e8cf9e', r: 4.4 },
  { k: 'Saturn',  n: 'Saturn',  c: '#dcc48e', r: 3.8 }
];

function drawBodies(date, lst, sun) {
  var i, sd, cd;
  // moon with simple phase shading
  var mo = Astro.moonPos(date);
  sd = Math.sin(mo.dec); cd = Math.cos(mo.dec);
  if (project(mo.ra, mo.dec, sd, cd, lst, _p) && _p.alt > 0) {
    var r = 7.5, mx = _p.x, my = _p.y;
    ctx.fillStyle = 'rgba(150,155,170,0.30)';
    ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(mx, my, r, 0, TAU); ctx.clip();
    var dir = Math.sin((lst - sun.ra) - (lst - mo.ra)) > 0 ? 1 : -1;
    var litW = Math.max(0.5, 2 * r * mo.illum);
    ctx.fillStyle = '#e4e7ee';
    if (dir > 0) ctx.fillRect(mx + r - litW, my - r, litW, 2 * r);
    else ctx.fillRect(mx - r, my - r, litW, 2 * r);
    ctx.restore();
    if (layers.labels) {
      ctx.fillStyle = 'rgba(220,215,195,0.85)'; ctx.font = 'italic 11px Georgia, serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('Moon', mx + r + 6, my - 4);
    }
  }
  // planets
  for (i = 0; i < PLANETS.length; i++) {
    var P = PLANETS[i];
    var pl = Astro.planetPos(P.k, date);
    if (pl.mag > 8) continue;
    sd = Math.sin(pl.dec); cd = Math.cos(pl.dec);
    if (!project(pl.ra, pl.dec, sd, cd, lst, _p) || _p.alt <= 0) continue;
    if (pl.mag < 1) {
      var g = ctx.createRadialGradient(_p.x, _p.y, 0, _p.x, _p.y, P.r * 3);
      g.addColorStop(0, 'rgba(255,250,235,0.45)'); g.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = g; ctx.fillRect(_p.x - P.r * 3, _p.y - P.r * 3, P.r * 6, P.r * 6);
    }
    ctx.fillStyle = P.c;
    ctx.beginPath(); ctx.arc(_p.x, _p.y, P.r, 0, TAU); ctx.fill();
    if (P.k === 'Saturn') {
      ctx.strokeStyle = 'rgba(220,196,142,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(_p.x, _p.y, P.r * 1.9, P.r * 0.7, -0.35, 0, TAU); ctx.stroke();
    }
    if (layers.labels) {
      ctx.fillStyle = 'rgba(220,215,195,0.85)'; ctx.font = 'italic 11px Georgia, serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(P.n, _p.x + P.r + 6, _p.y - 4);
    }
  }
}

/* ================= meteors ================= */
function updateMeteors(dt, dark) {
  var i;
  if (!REDUCED && dark && meteors.length < 6 && simMs > nextMeteorAt) {
    var az = Math.random() * TAU, alt = (18 + Math.random() * 55) * D2R;
    var tt = Math.tan((Math.PI / 2 - alt) / 2);
    var x = CX + K * tt * Math.sin(az), y = CY - K * tt * Math.cos(az);
    var ang = Math.random() * TAU, sp = 320 + Math.random() * 520;
    meteors.push({ x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.7 + Math.random() * 0.4, max: 1 });
    meteors[meteors.length - 1].max = meteors[meteors.length - 1].life;
    nextMeteorAt = simMs + 5000 + Math.random() * 14000;
  }
  for (i = meteors.length - 1; i >= 0; i--) {
    var m = meteors[i];
    m.life -= dt; m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.life <= 0) meteors.splice(i, 1);
  }
}
function drawMeteors() {
  for (var i = 0; i < meteors.length; i++) {
    var m = meteors[i], a = Math.max(0, m.life / m.max);
    var tx = m.x - m.vx * 0.14, ty = m.y - m.vy * 0.14;
    var g = ctx.createLinearGradient(m.x, m.y, tx, ty);
    g.addColorStop(0, 'rgba(255,255,255,' + (0.85 * a).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = g; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
  }
}

/* ================= triangles ================= */
var ROMAN = ['I', 'II', 'III'];
function projStar(s, lst) {
  if (project(s.ra, s.dec, Math.sin(s.dec), Math.cos(s.dec), lst, _p)) { s.x = _p.x; s.y = _p.y; return true; }
  return false;
}
function triPath(vs, lst) {
  // Builds the figure path in pixel space. Tolerates 1-3 vertices;
  // closes the path only for a complete figure. Returns pixel points or null.
  var pts = [];
  for (var i = 0; i < vs.length; i++) {
    if (!vs[i] || !projStar(vs[i], lst)) return null;
    pts.push([vs[i].x, vs[i].y]);
  }
  if (!pts.length) return null;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
  if (pts.length === 3) ctx.closePath();
  return pts;
}
function drawTriangles(lst) {
  var i, j, k, pts;
  for (i = 0; i < registry.length; i++) {
    var t = registry[i], hl = (i === selectedReg);
    ctx.strokeStyle = hl ? 'rgba(242,192,99,0.95)' : 'rgba(217,164,65,0.30)';
    ctx.lineWidth = hl ? 1.8 : 1;
    pts = triPath(t.verts, lst);
    if (pts) ctx.stroke();
    if (hl && pts) {
      ctx.fillStyle = '#f2c063';
      for (j = 0; j < pts.length; j++) {
        ctx.beginPath(); ctx.arc(pts[j][0], pts[j][1], 3.4, 0, TAU); ctx.fill();
      }
      if (layers.labels) {
        ctx.font = '12px Georgia, serif'; ctx.textAlign = 'center';
        ctx.fillText(t.name, pts[0][0], pts[0][1] - 16);
      }
    }
  }
  var n = 0;
  for (k = 0; k < 3; k++) if (verts[k]) n++;
  if (n > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(224,184,90,.8)'; ctx.shadowBlur = 14;
    ctx.strokeStyle = 'rgba(242,192,99,0.9)'; ctx.lineWidth = 1.5;
    pts = triPath(verts.filter(Boolean), lst);
    if (pts) ctx.stroke();
    ctx.restore();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (k = 0; k < 3; k++) {
      var v = verts[k]; if (!v) continue;
      if (!projStar(v, lst)) continue;
      var px = v.x, py = v.y;
      ctx.strokeStyle = '#f2c063'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(px, py, 11, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#f2c063'; ctx.font = 'italic 11px Georgia, serif';
      ctx.fillText(ROMAN[k], px, py - 20);
    }
  }
  if (ping && simMs < ping.until) {
    var pr = 14 + ((performance.now() - ping.t0) / 22) % 26;
    if (projStar(ping, lastLst)) {
      ctx.strokeStyle = 'rgba(242,192,99,' + Math.max(0, 0.9 - pr / 40).toFixed(3) + ')';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(ping.x, ping.y, pr, 0, TAU); ctx.stroke();
    }
  } else ping = null;
  if (hover) {
    if (!projStar(hover, lst)) hover = null;
  }
  if (hover && hover.x !== undefined) {
    ctx.strokeStyle = 'rgba(242,192,99,0.85)'; ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.arc(hover.x, hover.y, 13, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ================= picking ================= */
// star x/y are CSS-pixel coords; clicks and hover arrive in the same space
function pickStar(px, py) {
  var best = null, bd = 22 * 22, i, dx, dy, d2;
  for (i = 0; i < STARS_NAMED.length; i++) {
    var s = STARS_NAMED[i];
    if (!s.vis) continue;
    dx = s.x - px; dy = s.y - py; d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = s; }
  }
  for (i = 0; i < N_FIELD; i++) {
    if (!fVis[i] || fMag[i] > CLICK_MAG) continue;
    dx = fX[i] - px; dy = fY[i] - py; d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = fieldStarObj(i); }
  }
  return best;
}
var tooltipTimer = 0, mouseX = 0, mouseY = 0, mouseMoved = false;
canvas.addEventListener('mousemove', function (e) {
  mouseX = e.clientX; mouseY = e.clientY; mouseMoved = true;
});
canvas.addEventListener('mouseleave', function () { hover = null; $('tooltip').hidden = true; });
function updateHover() {
  if (!mouseMoved) return;
  mouseMoved = false;
  var s = pickStar(mouseX, mouseY);
  hover = s;
  var tt = $('tooltip');
  if (!s || !$('briefing').hidden) {
    tt.hidden = true;
    canvas.style.cursor = 'crosshair';
    return;
  }
  var cn = constellationAt(s.ra, s.dec);
  tt.innerHTML = '<div><span class="tt-name">' + esc(starLabel(s)) + '</span>' +
    (s.desig && s.desig !== s.name ? '<span class="tt-desig">' + esc(s.desig) + '</span>' : '') + '</div>' +
    '<div class="tt-data">mag ' + s.mag.toFixed(2) +
    (s.dist ? ' · ' + Math.round(s.dist) + ' ly' : '') +
    '<br>' + esc(CON_NAMES[cn] || cn) +
    '<br>RA ' + fmtHMS(s.ra * R2D / 15) + ' · Dec ' + fmtDec(s.dec) + '<br>' +
    '<span style="color:#f2c063">click to select as vertex</span></div>';
  tt.hidden = false;
  var tw = tt.offsetWidth, th = tt.offsetHeight;
  tt.style.left = Math.min(W - tw - 14, mouseX + 18) + 'px';
  tt.style.top = Math.min(H - th - 14, mouseY + 16) + 'px';
  canvas.style.cursor = 'pointer';
  if (!s) canvas.style.cursor = 'crosshair';
}
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function fmtDec(dec) {
  var d = dec * R2D, sign = d < 0 ? '−' : '+', a = Math.abs(d);
  var d0 = Math.floor(a), m = Math.floor((a - d0) * 60);
  return sign + d0 + '°' + (m < 10 ? '0' : '') + m + '′';
}

var downPos = null;
canvas.addEventListener('pointerdown', function (e) { downPos = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', function (e) {
  if (!downPos) return;
  var dx = e.clientX - downPos[0], dy = e.clientY - downPos[1];
  downPos = null;
  if (dx * dx + dy * dy > 36 || !$('briefing').hidden) return;
  handleClick(e.clientX, e.clientY);
});

function handleClick(px, py) {
  var s = pickStar(px, py);
  if (!s) return;
  var at = -1, k;
  for (k = 0; k < 3; k++) if (verts[k] && verts[k].sid === s.sid) at = k;
  if (at >= 0) {
    verts.splice(at, 1); verts.push(null);
    selectedReg = -1; renderVertices(); return;
  }
  var filled = verts.filter(Boolean).length;
  if (filled >= 3) verts = [s, null, null];
  else verts[verts.indexOf(null)] = s;
  selectedReg = -1;
  renderVertices();
  if (verts.filter(Boolean).length === 3) analyze();
}

function clearVerts() {
  verts = [null, null, null]; selectedReg = -1;
  $('analysis').hidden = true;
  renderVertices();
}
$('btnClearV').addEventListener('click', clearVerts);

function renderVertices() {
  var lis = $('vertices').children;
  for (var k = 0; k < 3; k++) {
    var li = lis[k], v = verts[k];
    if (v) {
      li.className = 'filled';
      var cn = constellationAt(v.ra, v.dec);
      li.querySelector('.vs').innerHTML = esc(starLabel(v)) +
        '<small>' + esc(starSub(v)) + ' · ' + esc(CON_NAMES[cn] || cn) + '</small>';
    } else {
      li.className = '';
      li.querySelector('.vs').textContent = '— awaiting selection —';
    }
  }
}

/* ================= analysis ================= */
var TRI_ADJ = [
  ['AETERNUM', 'the Eternal Triangle'], ['PERPETUUM', 'the Perpetual Triangle'],
  ['INVICTUM', 'the Unconquered Triangle'], ['CERTUM', 'the Certain Triangle'],
  ['VERUM', 'the True Triangle'], ['SERENUM', 'the Serene Triangle'],
  ['CLARUM', 'the Bright Triangle'], ['IMMOTUM', 'the Unmoved Triangle'],
  ['FIDELE', 'the Faithful Triangle'], ['MAGNUM', 'the Great Triangle'],
  ['PRIMUM', 'the First Triangle'], ['NOVUM', 'the New Triangle'],
  ['ANTIQUUM', 'the Ancient Triangle'], ['ULTIMUM', 'the Final Triangle'],
  ['AEQUUM', 'the Level Triangle'], ['PERFECTUM', 'the Perfect Triangle'],
  ['FIRMUM', 'the Steadfast Triangle'], ['VIGIL', 'the Watchful Triangle'],
  ['BEATUM', 'the Blessed Triangle'], ['MIRABILE', 'the Wondrous Triangle'],
  ['SUBLIME', 'the Sublime Triangle'], ['AUGUSTUM', 'the August Triangle'],
  ['FAUSTUM', 'the Fortunate Triangle'], ['TACITUM', 'the Silent Triangle'],
  ['SOLIDUM', 'the Solid Triangle'], ['CANDIDUM', 'the Radiant Triangle'],
  ['AUREUM', 'the Golden Triangle'], ['STABILE', 'the Stable Triangle'],
  ['QUIETUM', 'the Quiet Triangle'], ['PLACIDUM', 'the Placid Triangle']
];
var TRI_NOTES = [
  'The instrument records, without surprise, that the figure is a triangle.',
  'Peer review was unanimous. The figure is a triangle.',
  'Euclid, <i>Elements</i> I, concurs.',
  'Three vertices entered; one triangle returned. As always.',
  'The Survey&rsquo;s tally of non-triangles remains at zero.',
  'Verified twice. Triangular on both occasions.',
  'Its interior angles sum to 180.0&deg;, as on every prior occasion.',
  'The figure has been measured, classified, and found to be a triangle.',
  'No alternative classification was available.',
  'The stars were consulted individually. All three agreed: triangle.'
];
var TRI_DEG_NOTE = 'The vertices are nearly collinear &mdash; a degenerate triangle of negligible area. ' +
  'The Survey files it as a triangle regardless. Standards are standards.';

function planarAngle(p, q, r) {
  var v1x = p.x - q.x, v1y = p.y - q.y, v2x = r.x - q.x, v2y = r.y - q.y;
  var d1 = Math.hypot(v1x, v1y), d2 = Math.hypot(v2x, v2y);
  if (d1 < 1e-6 || d2 < 1e-6) return 0;
  var c = (v1x * v2x + v1y * v2y) / (d1 * d2);
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
}

function analyze() {
  var A = verts[0], B = verts[1], C = verts[2];
  for (var i = 0; i < 3; i++) projStar(verts[i], lastLst);
  var a = Astro.angSep(B.ra, B.dec, C.ra, C.dec) * R2D;
  var b = Astro.angSep(A.ra, A.dec, C.ra, C.dec) * R2D;
  var c = Astro.angSep(A.ra, A.dec, B.ra, B.dec) * R2D;
  var angA = planarAngle(B, A, C), angB = planarAngle(A, B, C), angC = planarAngle(A, C, B);
  var sum = angA + angB + angC;
  var mx = Math.max(angA, angB, angC);
  var angleType = Math.abs(mx - 90) <= 0.6 ? 'Right' : (mx > 90 ? 'Obtuse' : 'Acute');
  var ss = [a, b, c].sort(function (x, y) { return x - y; });
  var sideType = ss[2] / ss[0] < 1.02 ? 'Equilateral' :
    (ss[1] / ss[0] < 1.02 || ss[2] / ss[1] < 1.02 ? 'Isosceles' : 'Scalene');
  // planar area in square degrees via mean pixel scale
  var pxArea = Math.abs((B.x - A.x) * (C.y - A.y) - (C.x - A.x) * (B.y - A.y)) / 2;
  var pxSides = [Math.hypot(B.x - A.x, B.y - A.y), Math.hypot(C.x - B.x, C.y - B.y), Math.hypot(A.x - C.x, A.y - C.y)];
  var meanPx = (pxSides[0] + pxSides[1] + pxSides[2]) / 3, meanDeg = (a + b + c) / 3;
  var areaDeg2 = meanPx > 0 ? pxArea * Math.pow(meanDeg / meanPx, 2) : 0;
  var degenerate = areaDeg2 < 1e-4 || mx > 179.4;

  triSeq++;
  var adj = TRI_ADJ[(triSeq - 1) % TRI_ADJ.length];
  var name = 'TRIANGULUM ' + adj[0], sub = adj[1];
  var id = 'TRI-' + new Date(simMs).getUTCFullYear() + '-' + String(triSeq).padStart(4, '0');
  var t = {
    id: id, name: name, sub: sub,
    verts: verts.map(function (v) { return { ra: v.ra, dec: v.dec, mag: v.mag, sid: v.sid, name: starLabel(v), desig: v.desig || '' }; }),
    sides: [a, b, c], angles: [angA, angB, angC], angleSum: sum,
    angleType: angleType, sideType: sideType, areaDeg2: areaDeg2,
    degenerate: degenerate,
    note: degenerate ? TRI_DEG_NOTE : TRI_NOTES[(triSeq - 1) % TRI_NOTES.length],
    filedAt: simMs, site: site.name
  };
  registry.push(t);
  saveRegistry();
  renderRegistry();
  renderVerdict(t);
  updatePlaque();
  var an = $('analysis');
  an.hidden = false;
  an.querySelector('.statusline').textContent = '■ figure resolved — classification complete';
}

function renderVerdict(t) {
  var an = $('analysis');
  an.hidden = false;
  an.querySelector('.statusline').textContent = t.degenerate ?
    '■ figure resolved — degenerate case filed' : '■ figure resolved — classification complete';
  var rows = t.verts.map(function (v, i) {
    return '<tr><td>Vertex ' + ROMAN[i] + '</td><td colspan="3">' + esc(v.name) +
      (v.desig && v.desig !== v.name ? ' <span style="color:#9aa0b4">' + esc(v.desig) + '</span>' : '') + '</td></tr>';
  }).join('');
  var sNames = ['a', 'b', 'c'];
  for (var i = 0; i < 3; i++)
    rows += '<tr><td>Side ' + sNames[i] + '</td><td>' + t.sides[i].toFixed(3) + '°</td><td>∠' + ROMAN[i] + '</td><td>' + t.angles[i].toFixed(2) + '°</td></tr>';
  $('verdict').hidden = false;
  $('verdict').innerHTML =
    '<div class="tri-id">' + esc(t.id) + '</div>' +
    '<div class="tri-filed">filed ' + fmtDate(new Date(t.filedAt)) + ' ' + fmtClock(new Date(t.filedAt)) + ' UTC</div>' +
    '<h3>' + esc(t.name) + '</h3><div class="latin-sub">' + esc(t.sub) + ' · ' + esc(t.site) + '</div>' +
    '<div class="stamp">△ Triangle</div>' +
    '<table class="verdict-table"><tr><th>Element</th><th>Measure</th><th>Angle</th><th>Measure</th></tr>' + rows +
    '<tr><td>Class</td><td colspan="3">' + t.angleType + ' · ' + t.sideType + '</td></tr>' +
    '<tr><td>Area</td><td colspan="3">≈ ' + (t.areaDeg2 < 0.01 ? t.areaDeg2.toExponential(2) : t.areaDeg2.toFixed(3)) + ' sq°</td></tr>' +
    '<tr><td>Σ angles</td><td colspan="3">' + t.angleSum.toFixed(2) + '°</td></tr></table>' +
    '<div class="verdict-note">&ldquo;' + t.note + '&rdquo;</div>' +
    '<div class="btnrow"><button type="button" class="ghost" id="btnAgain">File another figure</button>' +
    '<button type="button" class="ghost" id="btnCard">Export card (PNG)</button></div>';
  $('btnAgain').addEventListener('click', clearVerts);
  $('btnCard').addEventListener('click', function () { exportPNG(t); });
}

function updatePlaque() {
  var el = $('standingText');
  if (!registry.length) el.textContent = 'The Survey awaits its first figure.';
  else el.innerHTML = 'Every figure examined &mdash; without exception &mdash; has been a triangle.' +
    '<br><span style="font-size:12px;color:#9aa0b4">' + registry.length + ' figure' +
    (registry.length > 1 ? 's' : '') + ' filed to date.</span>';
  $('regCount').textContent = registry.length;
  var rs = $('registryStats');
  if (rs) rs.textContent = registry.length + (registry.length === 1 ? ' figure examined · ' : ' figures examined · ') + registry.length +
    ' triangles · 0 non-triangles (100.0%)';
}

/* ================= registry ================= */
function saveRegistry() {
  try { localStorage.setItem('triangulum.registry.v1', JSON.stringify({ seq: triSeq, items: registry })); } catch (e) {}
}
function loadRegistry() {
  try {
    var d = JSON.parse(localStorage.getItem('triangulum.registry.v1'));
    if (d && d.items) { registry = d.items; triSeq = d.seq || d.items.length; }
  } catch (e) {}
}
function renderRegistry() {
  var list = $('registryList');
  list.innerHTML = '';
  $('registryEmpty').style.display = registry.length ? 'none' : '';
  for (var i = registry.length - 1; i >= 0; i--) {
    (function (t, idx) {
      var li = document.createElement('li');
      li.innerHTML = '<button class="r-del" title="Remove">×</button>' +
        '<div class="r-id">' + esc(t.id) + '</div><div class="r-name">' + esc(t.name) + '</div>' +
        '<div class="r-sub">' + esc(t.sub) + ' — ' + t.angleType + ' ' + t.sideType + '</div>' +
        '<div class="r-verts">' + t.verts.map(function (v) { return esc(v.name); }).join(' · ') + '</div>';
      li.querySelector('.r-del').addEventListener('click', function (ev) {
        ev.stopPropagation();
        registry.splice(idx, 1); saveRegistry(); renderRegistry(); updatePlaque();
        if (selectedReg === idx) { selectedReg = -1; $('analysis').hidden = true; }
      });
      li.addEventListener('click', function () {
        selectedReg = (selectedReg === idx) ? -1 : idx;
        document.querySelector('[data-tab="instrument"]').click();
        if (selectedReg >= 0) renderVerdict(registry[selectedReg]);
        else $('analysis').hidden = true;
      });
      list.appendChild(li);
    })(registry[i], i);
  }
}

/* ================= search ================= */
function nextRise(ra, dec, fromMs) {
  var sd = Math.sin(dec), cd = Math.cos(dec);
  for (var m = 0; m <= 24 * 60; m += 5) {
    var d = new Date(fromMs + m * 60000);
    var aa = Astro.altAz(ra, dec, site.lat, Astro.lst(d, site.lon * R2D));
    if (aa.alt > 0.5 * D2R) return d;
  }
  return null;
}
function compass(az) {
  var pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return pts[Math.round(az * R2D / 22.5) % 16];
}
function doSearch() {
  var q = $('starSearch').value.trim().toLowerCase();
  var box = $('searchResult');
  if (!q) { box.hidden = true; return; }
  var best = null, i, s;
  for (i = 0; i < STARS_NAMED.length; i++) {
    s = STARS_NAMED[i];
    var nm = s.name.toLowerCase(), dg = (s.desig || '').toLowerCase();
    if (nm === q || dg === q) { best = s; break; }
    if (!best && (nm.indexOf(q) === 0 || nm.indexOf(q) > 0 || dg.indexOf(q) >= 0)) best = s;
  }
  if (!best) {
    box.hidden = false;
    box.innerHTML = 'No catalogued star matches &ldquo;' + esc(q) + '&rdquo;. Try Vega, Antares, Polaris&hellip;';
    return;
  }
  var d = new Date(simMs);
  var aa = Astro.altAz(best.ra, best.dec, site.lat, Astro.lst(d, site.lon * R2D));
  var cn = constellationAt(best.ra, best.dec);
  var html = '<strong>' + esc(best.name) + '</strong>' +
    (best.desig ? ' <span class="mono">' + esc(best.desig) + '</span>' : '') +
    '<br><span class="mono">mag ' + best.mag.toFixed(2) +
    (best.dist ? ' · ' + Math.round(best.dist) + ' ly' : '') +
    ' · ' + esc(CON_NAMES[cn] || cn) + '<br>RA ' + fmtHMS(best.ra * R2D / 15) +
    ' · Dec ' + fmtDec(best.dec) + '</span><br>';
  if (aa.alt > 0) {
    html += 'Currently ' + (aa.alt * R2D).toFixed(0) + '&deg; above the horizon, ' + compass(aa.az) + '.';
    ping = { ra: best.ra, dec: best.dec, until: simMs + 6000, t0: performance.now(), x: 0, y: 0 };
  } else {
    var nr = nextRise(best.ra, best.dec, simMs);
    html += nr ? 'Below the horizon &mdash; rises about ' + fmtClock(nr) + ' UTC.'
               : 'Below the horizon for the next 24 hours.';
  }
  box.hidden = false;
  box.innerHTML = html;
}
$('searchGo').addEventListener('click', doSearch);
$('starSearch').addEventListener('keydown', function (e) { if (e.key === 'Enter') doSearch(); });

/* ================= readouts / chronometer ================= */
function darkWindow(fromMs) {
  var start = -1, end = -1, prev = 0;
  for (var m = 0; m <= 36 * 60; m += 5) {
    var d = new Date(fromMs + m * 60000);
    var sun = Astro.sunPos(d);
    var alt = Astro.altAz(sun.ra, sun.dec, site.lat, Astro.lst(d, site.lon * R2D)).alt;
    var dark = alt < -18 * D2R;
    if (dark && start < 0) start = fromMs + m * 60000;
    if (!dark && start >= 0) { end = fromMs + m * 60000; break; }
    prev = alt;
  }
  return start >= 0 ? { start: start, end: end } : null;
}
function updateReadouts(date) {
  var lonMin = site.lon * R2D * 4;
  var siteD = new Date(simMs + lonMin * 60000);
  $('roLocal').textContent = fmtClock(siteD);
  $('roLocal').title = 'Local mean solar time for the observing site';
  $('roUTC').textContent = fmtClock(date);
  $('roLST').textContent = fmtHMS(lastLst * R2D / 15);
  var sunD = (lastSunAlt * R2D);
  var twFull = Astro.twilight(lastSunAlt * R2D).toLowerCase();
  var sunTxt = (sunD >= 0 ? '+' : '') + sunD.toFixed(1) + '° ' + twFull;
  $('roSun').textContent = sunTxt;
  $('roSun').title = sunTxt;
  var mo = Astro.moonPos(date);
  var mcn = constellationAt(mo.ra, mo.dec);
  var moonTxt = Math.round(mo.illum * 100) + '% · ' + (CON_NAMES[mcn] || mcn);
  $('roMoon').textContent = moonTxt;
  $('roMoon').title = moonTxt;
  var se = Astro.seasonOf(lastSun.lon * R2D);
  if (site.lat < 0) se = { Spring: 'Autumn', Summer: 'Winter', Autumn: 'Spring', Winter: 'Summer' }[se];
  $('roSeason').textContent = se;
  // chronometer
  var dp = $('datePick');
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = date.getUTCFullYear() + '-' + p2(date.getUTCMonth() + 1) + '-' + p2(date.getUTCDate());
  if (dp.value !== iso) dp.value = iso;
  $('chronoTime').textContent = fmtClock(date) + ' UTC';
  if (playing && !scrubbing) $('timeSlider').value = date.getUTCHours() * 60 + date.getUTCMinutes();
  // day notice
  var dn = $('dayNotice');
  if (lastSunAlt > -6 * D2R) {
    dn.hidden = false;
    var dw = darkWindow(simMs);
    $('dayNoticeText').textContent = dw ?
      'The stars are present but uncooperative. Astronomical darkness returns ' +
      fmtClock(new Date(dw.start)).slice(0, 5) + ' → ' + (dw.end > 0 ? fmtClock(new Date(dw.end)).slice(0, 5) : '—') + ' UTC.' :
      'No true night in the next 36 hours at this site. The Survey is patient.';
  } else dn.hidden = true;
}
$('btnNight').addEventListener('click', function () {
  var dw = darkWindow(simMs);
  simMs = dw ? dw.start + 60000 : simMs + 6 * 3600000;
});

var scrubbing = false;
function togglePlay() {
  playing = !playing;
  $('btnPlay').textContent = playing ? '⏸' : '▶';
  $('btnPlay').setAttribute('aria-label', playing ? 'Pause' : 'Play');
}
$('btnPlay').addEventListener('click', togglePlay);
var speedBtns = document.querySelectorAll('.speeds button');
for (var sb = 0; sb < speedBtns.length; sb++) {
  (function (b) {
    b.addEventListener('click', function () {
      speed = parseFloat(b.dataset.speed);
      for (var k = 0; k < speedBtns.length; k++) speedBtns[k].classList.remove('active');
      b.classList.add('active');
    });
  })(speedBtns[sb]);
}
$('btnDayMinus').addEventListener('click', function () { simMs -= 86400000; });
$('btnDayPlus').addEventListener('click', function () { simMs += 86400000; });
$('btnNow').addEventListener('click', function () { simMs = Date.now(); });
$('datePick').addEventListener('change', function () {
  var v = this.value;
  if (!v) return;
  var m = v.split('-');
  if (m.length !== 3) return;
  var d = new Date(simMs);
  // keep the current time of day; move the calendar date
  simMs = Date.UTC(parseInt(m[0], 10), parseInt(m[1], 10) - 1, parseInt(m[2], 10),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
});
var slider = $('timeSlider');
slider.addEventListener('pointerdown', function () { scrubbing = true; });
window.addEventListener('pointerup', function () { scrubbing = false; });
slider.addEventListener('input', function () {
  var d = new Date(simMs);
  var mins = parseInt(slider.value, 10);
  simMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    Math.floor(mins / 60), mins % 60, 0);
});

/* ================= layers / tabs / site ================= */
var layerBtns = document.querySelectorAll('#layers button');
for (var lb = 0; lb < layerBtns.length; lb++) {
  (function (b) {
    b.addEventListener('click', function () {
      var k = b.dataset.layer;
      layers[k] = !layers[k];
      b.classList.toggle('active', layers[k]);
      b.setAttribute('aria-pressed', layers[k]);
    });
  })(layerBtns[lb]);
}
var tabBtns = document.querySelectorAll('.tab[data-tab]');
for (var tb = 0; tb < tabBtns.length; tb++) {
  (function (b) {
    b.addEventListener('click', function () {
      for (var k = 0; k < tabBtns.length; k++) {
        tabBtns[k].classList.remove('active');
        tabBtns[k].setAttribute('aria-selected', 'false');
        $('tab-' + tabBtns[k].dataset.tab).classList.remove('active');
      }
      b.classList.add('active');
      b.setAttribute('aria-selected', 'true');
      $('tab-' + b.dataset.tab).classList.add('active');
      if (W <= 900) $('console').classList.add('open');
    });
  })(tabBtns[tb]);
}
$('consoleToggle').addEventListener('click', function () {
  var c = $('console'), open = c.classList.toggle('open');
  this.setAttribute('aria-expanded', open);
});
var consoleClose = $('consoleClose');
if (consoleClose) consoleClose.addEventListener('click', function () {
  $('console').classList.remove('open');
  $('consoleToggle').setAttribute('aria-expanded', 'false');
});
$('siteGo').addEventListener('click', function () {
  var la = parseFloat($('siteLat').value), lo = parseFloat($('siteLon').value);
  if (!isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return;
  site.lat = la * D2R; site.lon = lo * D2R;
  site.name = $('siteName').value.trim() || 'Custom site';
  setLat(site.lat);
  try { localStorage.setItem('triangulum.site.v1', JSON.stringify({ name: site.name, lat: la, lon: lo })); } catch (e) {}
});

/* ================= export ================= */
function exportPNG(t) {
  t = t || registry[registry.length - 1];
  var w = 1600, h = 1000, ch = 250;
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var g = c.getContext('2d');
  g.fillStyle = '#04060c'; g.fillRect(0, 0, w, h);
  g.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, w, h - ch);
  g.strokeStyle = 'rgba(217,164,65,0.5)'; g.lineWidth = 1;
  g.strokeRect(24.5, 24.5, w - 49, h - 49);
  var y = h - ch + 52;
  g.fillStyle = '#d9a441'; g.font = '600 15px sans-serif';
  g.fillText('T R I A N G U L U M   —   S T E L L A R   T R I A N G U L A T I O N   O B S E R V A T O R Y', 60, y);
  y += 40;
  g.fillStyle = '#f2c063'; g.font = '26px Georgia, serif';
  g.fillText(t ? t.name + '  ·  ' + t.sub : 'Survey chart — no figure filed', 60, y);
  y += 30;
  g.fillStyle = '#9aa0b4'; g.font = '15px monospace';
  if (t) {
    g.fillText(t.id + '   filed ' + fmtDate(new Date(t.filedAt)) + ' ' + fmtClock(new Date(t.filedAt)) + ' UTC   site: ' + t.site, 60, y);
    y += 28;
    g.fillText('vertices  ' + t.verts.map(function (v) { return v.name; }).join('  ·  '), 60, y);
    y += 28;
    g.fillText('sides  ' + t.sides.map(function (s) { return s.toFixed(3) + '°'; }).join('   ') +
      '      angles  ' + t.angles.map(function (a) { return a.toFixed(2) + '°'; }).join('   '), 60, y);
    y += 28;
    g.fillText('class  ' + t.angleType + ' ' + t.sideType + '      Σ ' + t.angleSum.toFixed(2) + '°', 60, y);
    y += 40;
    g.strokeStyle = '#f2c063'; g.lineWidth = 2;
    g.strokeRect(60, y - 26, 250, 44);
    g.fillStyle = '#f2c063'; g.font = '600 17px sans-serif';
    g.fillText('△  T R I A N G L E', 84, y + 4);
  } else {
    g.fillText(fmtDate(new Date(simMs)) + ' ' + fmtClock(new Date(simMs)) + ' UTC', 60, y);
  }
  c.toBlob(function (blob) {
    var aEl = document.createElement('a');
    aEl.href = URL.createObjectURL(blob);
    aEl.download = 'triangulum-' + (t ? t.id : 'chart') + '.png';
    aEl.click();
    setTimeout(function () { URL.revokeObjectURL(aEl.href); }, 4000);
  });
}
$('btnExport').addEventListener('click', function () { exportPNG(null); });

/* ================= briefing ================= */
function hideBriefing() {
  $('briefing').hidden = true;
  try { localStorage.setItem('triangulum.seen.v1', '1'); } catch (e) {}
}
$('btnBegin').addEventListener('click', hideBriefing);
$('btnBriefing').addEventListener('click', function () { $('briefing').hidden = false; });

/* ================= keyboard ================= */
document.addEventListener('keydown', function (e) {
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight') simMs += 600000;
  else if (e.key === 'ArrowLeft') simMs -= 600000;
  else if (e.key === 'Escape') { if (!$('briefing').hidden) hideBriefing(); hover = null; }
  else if (e.key === 'c' || e.key === 'C') clearVerts();
});

/* ================= main loop ================= */
var lastLst = 0, lastSunAlt = -100, lastSun = null, ping = null;

function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.1, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  if (playing) simMs += dt * speed * 1000;
  var date = new Date(simMs);
  var lst = Astro.lst(date, site.lon * R2D);
  lastLst = lst;
  var sun = Astro.sunPos(date);
  lastSun = sun;
  lastSunAlt = Astro.altAz(sun.ra, sun.dec, site.lat, lst).alt;
  var limMag = Astro.limitingMag(lastSunAlt * R2D);
  var t = now / 1000;

  skyGradient(lastSunAlt);
  drawSunGlow(sun, lst);
  var darkF = Math.max(0, Math.min(1, (-lastSunAlt * R2D - 6) / 12));
  if (limMag > 1.5) {
    if (layers.milkyway && darkF > 0.15) drawMilkyWay(lst);
    drawGrid(lst);
    drawConstellations(lst);
  } else {
    drawGrid(lst);
  }
  if (limMag > 0.4) {
    drawStars(lst, limMag, t);
    drawBodies(date, lst, sun);
  }
  drawTriangles(lst);
  var dark = lastSunAlt < -12 * D2R;
  updateMeteors(dt, dark && limMag > 3);
  drawMeteors();
  updateHover();

  if (now - lastReadout > 500) {
    lastReadout = now;
    updateReadouts(date);
  }
}

/* ================= debug handle (used by automated tests) ================= */
window.TRIANGULUM = {
  handleClick: handleClick, pickStar: pickStar,
  verts: function () { return verts; },
  registry: function () { return registry; },
  setSimMs: function (ms) { simMs = ms; },
  getSimMs: function () { return simMs; },
  starByName: function (n) { for (var i = 0; i < STARS_NAMED.length; i++) if (STARS_NAMED[i].name === n) return STARS_NAMED[i]; return null; },
  toPx: function (s) { return [s.x, s.y]; },
  clearVerts: clearVerts
};

/* ================= init ================= */
(function init() {
  loadRegistry();
  try {
    var sd = JSON.parse(localStorage.getItem('triangulum.site.v1'));
    if (sd) {
      site.name = sd.name; site.lat = sd.lat * D2R; site.lon = sd.lon * D2R;
      setLat(site.lat);
      $('siteName').value = sd.name; $('siteLat').value = sd.lat; $('siteLon').value = sd.lon;
    }
  } catch (e) {}
  renderVertices();
  renderRegistry();
  updatePlaque();
  if (W <= 900) $('console').classList.remove('open');
  else $('console').classList.add('open');
  try { if (!localStorage.getItem('triangulum.seen.v1')) $('briefing').hidden = false; }
  catch (e) { $('briefing').hidden = false; }
  $('timeSlider').value = new Date(simMs).getUTCHours() * 60 + new Date(simMs).getUTCMinutes();
  requestAnimationFrame(frame);
})();

})();
