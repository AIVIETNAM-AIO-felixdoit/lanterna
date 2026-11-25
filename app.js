/* Lanterna — a night sky of wishes.
 * Vanilla JS · Canvas 2D · Web Audio API · localStorage
 */
(() => {
  'use strict';

  /* ---------------- Data ---------------- */
  const MOODS = {
    hope:      { label: 'Hope',       color: '#ffb347', rgb: [255, 179, 71] },
    love:      { label: 'Love',       color: '#ff7a90', rgb: [255, 122, 144] },
    gratitude: { label: 'Gratitude',  color: '#5fe0b0', rgb: [95, 224, 176] },
    calm:      { label: 'Letting go', color: '#7cc4ff', rgb: [124, 196, 255] },
    dream:     { label: 'Dream',      color: '#b98cff', rgb: [185, 140, 255] },
  };
  const STORE_KEY = 'lanterna.v1';
  const MAX_IN_SKY = 70;

  const SEEDS = [
    ['May my grandmother stay healthy and laugh loudly for many more years.', 'love'],
    ['I hope I pass my exams and make my parents proud.', 'hope'],
    ['Thank you to the stranger who paid for my coffee today.', 'gratitude'],
    ["I'm letting go of the fear of not being good enough.", 'calm'],
    ['One day I will build something that millions of people use.', 'dream'],
    ['Grateful for late-night talks with my best friend.', 'gratitude'],
    ['I wish for peace in every home tonight.', 'hope'],
    ['Letting go of a friendship that ended. Thank you for the memories.', 'calm'],
    ['To see the northern lights with someone I love.', 'dream'],
    ['I hope my little brother finds his courage at his new school.', 'love'],
    ['Thankful that today was simply… a good day.', 'gratitude'],
    ['Next year: more sunrises, fewer screens.', 'hope'],
  ];

  const INSPIRATION = [
    ['I am grateful for ', 'gratitude'],
    ['Today I am letting go of ', 'calm'],
    ['I hope that next year I ', 'hope'],
    ['To the person who ', 'love'],
    ['One day I will ', 'dream'],
    ['I forgive myself for ', 'calm'],
    ['Thank you, ', 'gratitude'],
    ['I wish everyone I love could ', 'love'],
    ['If I were braver, I would ', 'dream'],
    ['A small thing that made me smile: ', 'gratitude'],
  ];

  const $ = (s) => document.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // Seeded PRNG so each lantern always returns to the same place in the sky
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }

  function loadWishes() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY));
      if (Array.isArray(d)) return d.filter((w) => w && w.id && w.text && MOODS[w.mood]);
    } catch (_) { /* ignore corrupted storage */ }
    return null;
  }
  function saveWishes() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(wishes)); } catch (_) { /* storage full / private mode */ }
  }

  let wishes = loadWishes();
  if (!wishes) {
    const now = Date.now();
    wishes = SEEDS.map(([text, mood], i) => ({ id: 'seed' + i, text, mood, at: now - (i + 1) * 5.3 * 3600e3 }));
    saveWishes();
  }

  /* ---------------- Canvas setup ---------------- */
  const canvas = $('#sky');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, HORIZON = 0;
  let stars = [], ridges = [], shooting = [], sparks = [];
  let lanterns = [];
  let hovered = null, highlight = null;
  const glowSprites = {};

  function makeGlowSprites() {
    for (const [key, m] of Object.entries(MOODS)) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const [r, gg, b] = m.rgb;
      const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, `rgba(${r},${gg},${b},0.55)`);
      grad.addColorStop(0.35, `rgba(${r},${gg},${b},0.18)`);
      grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
      glowSprites[key] = c;
    }
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    HORIZON = H * 0.8;
    buildStars();
    buildRidges();
  }

  function buildStars() {
    const count = clamp(Math.round((W * H) / 2600), 120, 650);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.pow(Math.random(), 1.4) * HORIZON * 0.95,
      r: Math.random() < 0.08 ? rand(1.2, 1.9) : rand(0.3, 1.1),
      p: Math.random() * Math.PI * 2,
      s: rand(0.0008, 0.003),
      warm: Math.random() < 0.2,
    }));
  }

  function buildRidges() {
    const layers = [
      { base: 0.82, amp: 0.09, color: '#1a1840', seed: 3 },
      { base: 0.88, amp: 0.07, color: '#121131', seed: 7 },
      { base: 0.95, amp: 0.05, color: '#0b0a22', seed: 11 },
    ];
    ridges = layers.map((L) => {
      const pts = [];
      const step = 6;
      for (let x = 0; x <= W + step; x += step) {
        const t = x / W;
        const n = Math.sin(t * 6.1 + L.seed) * 0.5 + Math.sin(t * 13.7 + L.seed * 2.3) * 0.25 +
                  Math.sin(t * 29.3 + L.seed * 0.7) * 0.12 + Math.sin(t * 61 + L.seed) * 0.04;
        pts.push([x, HORIZON * L.base - (n + 0.6) * HORIZON * L.amp]);
      }
      return { pts, color: L.color };
    });
  }

  /* ---------------- Lanterns ---------------- */
  function createLantern(w, launching) {
    const r = seeded(w.id);
    return {
      id: w.id,
      wish: w,
      x: 0.04 + r() * 0.92,
      ty: 0.06 + Math.pow(r(), 0.85) * 0.56, // target altitude (fraction of horizon)
      size: 0.8 + r() * 0.45,
      phase: r() * Math.PI * 2,
      speed: 0.5 + r() * 0.8,
      born: performance.now(),
      launching,
      leaving: 0,
      sx: 0, sy: 0, sr: 0, // screen position cache for hit testing
    };
  }

  function syncLanterns() {
    const visible = wishes.slice(0, MAX_IN_SKY);
    const keep = new Set(visible.map((w) => w.id));
    lanterns = lanterns.filter((l) => keep.has(l.id) || l.leaving);
    for (const w of visible) {
      if (!lanterns.some((l) => l.id === w.id)) lanterns.push(createLantern(w, false));
    }
  }

  function drawLantern(l, x, y, s, flicker, alpha) {
    const m = MOODS[l.wish.mood];
    const [r, g, b] = m.rgb;
    ctx.globalAlpha = alpha;

    // Outer glow
    const gs = s * (6.5 + flicker * 0.8) * (l === hovered || l === highlightLantern() ? 1.5 : 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprites[l.wish.mood], x - gs / 2, y - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';

    const w = s, h = s * 1.35;
    const top = y - h / 2, bot = y + h / 2;

    // Body (paper)
    const body = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    body.addColorStop(0, `rgb(${r * 0.6 | 0},${g * 0.45 | 0},${b * 0.4 | 0})`);
    body.addColorStop(0.5, `rgb(${Math.min(255, r + 70)},${Math.min(255, g + 70)},${Math.min(255, b + 60)})`);
    body.addColorStop(1, `rgb(${r * 0.6 | 0},${g * 0.45 | 0},${b * 0.4 | 0})`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.36, top);
    ctx.lineTo(x + w * 0.36, top);
    ctx.bezierCurveTo(x + w * 0.62, top + h * 0.3, x + w * 0.55, bot - h * 0.2, x + w * 0.3, bot);
    ctx.lineTo(x - w * 0.3, bot);
    ctx.bezierCurveTo(x - w * 0.55, bot - h * 0.2, x - w * 0.62, top + h * 0.3, x - w * 0.36, top);
    ctx.closePath();
    ctx.fill();

    // Inner light
    const inner = ctx.createRadialGradient(x, bot - h * 0.18, 0, x, bot - h * 0.18, h * 0.75);
    inner.addColorStop(0, `rgba(255,250,220,${0.75 + flicker * 0.25})`);
    inner.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = inner;
    ctx.fill();

    // Ribs
    if (s > 14) {
      ctx.strokeStyle = `rgba(${r * 0.4 | 0},${g * 0.3 | 0},${b * 0.3 | 0},0.35)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, top); ctx.lineTo(x, bot);
      ctx.moveTo(x - w * 0.2, top); ctx.quadraticCurveTo(x - w * 0.32, y, x - w * 0.17, bot);
      ctx.moveTo(x + w * 0.2, top); ctx.quadraticCurveTo(x + w * 0.32, y, x + w * 0.17, bot);
      ctx.stroke();
    }

    // Caps
    ctx.fillStyle = 'rgba(40,20,20,0.85)';
    ctx.fillRect(x - w * 0.38, top - s * 0.05, w * 0.76, s * 0.09);
    ctx.fillRect(x - w * 0.31, bot - s * 0.03, w * 0.62, s * 0.07);

    // Flame
    ctx.fillStyle = `rgba(255,236,170,${0.8 + flicker * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(x, bot + s * 0.08, s * 0.07, s * (0.1 + flicker * 0.04), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  function highlightLantern() {
    if (!highlight || performance.now() > highlight.until) return null;
    return lanterns.find((l) => l.id === highlight.id) || null;
  }

  /* ---------------- Effects ---------------- */
  function spawnShootingStar() {
    shooting.push({
      x: rand(W * 0.1, W * 0.9), y: rand(0, HORIZON * 0.35),
      vx: rand(-9, -5) * (Math.random() < 0.5 ? -1 : 1), vy: rand(3, 5),
      life: 1,
    });
  }

  function burst(x, y, rgb) {
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(0.4, 2.6);
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.2, life: 1, rgb, r: rand(0.8, 2.2) });
    }
  }

  /* ---------------- Render loop ---------------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last);
    last = now;
    const t = now;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
    sky.addColorStop(0, '#04061a');
    sky.addColorStop(0.45, '#0b1035');
    sky.addColorStop(0.8, '#24184a');
    sky.addColorStop(1, '#4a2550');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Horizon warmth
    const warm = ctx.createRadialGradient(W * 0.5, HORIZON, 0, W * 0.5, HORIZON, Math.max(W, H) * 0.6);
    warm.addColorStop(0, 'rgba(255,140,80,0.22)');
    warm.addColorStop(1, 'rgba(255,140,80,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, W, HORIZON);

    // Stars
    for (const s of stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
      ctx.fillStyle = s.warm ? `rgba(255,225,180,${a})` : `rgba(230,235,255,${a})`;
      if (s.r > 1.1) {
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillRect(s.x, s.y, s.r * 1.6, s.r * 1.6);
      }
    }

    // Moon
    const mx = W * 0.82, my = HORIZON * 0.2, mr = clamp(W * 0.03, 22, 46);
    const halo = ctx.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 6);
    halo.addColorStop(0, 'rgba(255,240,210,0.25)');
    halo.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - mr * 6, my - mr * 6, mr * 12, mr * 12);
    const moon = ctx.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr);
    moon.addColorStop(0, '#fffaf0');
    moon.addColorStop(1, '#f2dcae');
    ctx.fillStyle = moon;
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();

    // Shooting stars
    if (!reduceMotion && Math.random() < dt / 6000) spawnShootingStar();
    for (let i = shooting.length - 1; i >= 0; i--) {
      const s = shooting[i];
      s.x += s.vx * dt / 16; s.y += s.vy * dt / 16; s.life -= dt / 1100;
      if (s.life <= 0) { shooting.splice(i, 1); continue; }
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 14, s.y - s.vy * 14);
      g.addColorStop(0, `rgba(255,255,255,${s.life})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 14, s.y - s.vy * 14); ctx.stroke();
    }

    // Lanterns: compute positions, draw far ones first
    const baseSize = clamp(W * 0.017, 13, 24);
    for (let i = lanterns.length - 1; i >= 0; i--) {
      const l = lanterns[i];
      const sway = reduceMotion ? 0 : Math.sin(t * 0.00035 * l.speed + l.phase) * 14;
      const bob = reduceMotion ? 0 : Math.sin(t * 0.0008 * l.speed + l.phase * 2) * 5;
      let yFrac = l.ty;
      let alpha = 1;
      if (l.launching) {
        const p = clamp((t - l.born) / 7000, 0, 1);
        yFrac = 1.02 + (l.ty - 1.02) * easeOut(p);
        if (p >= 1) l.launching = false;
      }
      if (l.leaving) {
        const p = clamp((t - l.leaving) / 2500, 0, 1);
        yFrac = l.ty - p * (l.ty + 0.3);
        alpha = 1 - p;
        if (p >= 1) { lanterns.splice(i, 1); continue; }
      }
      const depth = 0.6 + clamp(yFrac, 0, 1) * 0.75;
      l.sx = l.x * W + sway;
      l.sy = yFrac * HORIZON + bob;
      l.sr = baseSize * l.size * depth;
      l.alpha = alpha;
    }
    const order = lanterns.slice().sort((a, b) => a.sr - b.sr);
    for (const l of order) {
      const flicker = reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin(t * 0.012 * l.speed + l.phase) * Math.sin(t * 0.007 + l.phase);
      drawLantern(l, l.sx, l.sy, l.sr, flicker, l.alpha);
    }

    // Highlight ring
    const hl = highlightLantern();
    if (hl) {
      const p = ((t / 900) % 1);
      ctx.strokeStyle = `rgba(255,230,170,${1 - p})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hl.sx, hl.sy, hl.sr * (1 + p * 2.5), 0, Math.PI * 2); ctx.stroke();
    }

    // Sparks
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.x += p.vx * dt / 16; p.y += p.vy * dt / 16; p.vy += 0.02 * dt / 16; p.life -= dt / 1400;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${p.life})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life + 0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // Mountains
    for (const r of ridges) {
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (const [x, y] of r.pts) ctx.lineTo(x, y);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }

    // River
    const riverTop = HORIZON;
    const river = ctx.createLinearGradient(0, riverTop, 0, H);
    river.addColorStop(0, '#1b1640');
    river.addColorStop(1, '#05061a');
    ctx.fillStyle = river;
    ctx.fillRect(0, riverTop, W, H - riverTop);

    // Moon reflection & lantern reflections
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 14; k++) {
      const yy = riverTop + 6 + k * (H - riverTop) / 14;
      const wob = reduceMotion ? 0 : Math.sin(t * 0.002 + k) * 8;
      const wid = mr * (1.2 - k * 0.05) * (0.6 + 0.4 * Math.sin(t * 0.003 + k * 1.7));
      ctx.fillStyle = `rgba(255,235,200,${0.18 - k * 0.011})`;
      ctx.fillRect(mx - wid + wob, yy, wid * 2, 2);
    }
    for (const l of lanterns) {
      if (l.sy > riverTop) continue;
      const ry = riverTop + (riverTop - l.sy) * 0.12 + 6;
      if (ry > H) continue;
      const [r, g, b] = MOODS[l.wish.mood].rgb;
      const wob = reduceMotion ? 0 : Math.sin(t * 0.003 + l.phase) * 3;
      ctx.fillStyle = `rgba(${r},${g},${b},${0.12 * (l.alpha ?? 1)})`;
      ctx.fillRect(l.sx - l.sr * 0.3 + wob, ry, l.sr * 0.6, l.sr * 0.25);
      ctx.fillRect(l.sx - l.sr * 0.18 - wob, ry + l.sr * 0.45, l.sr * 0.36, l.sr * 0.15);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Launching lanterns are in front of the mountains while low
    for (const l of lanterns) {
      if (l.launching && l.sy > HORIZON * 0.75) {
        drawLantern(l, l.sx, l.sy, l.sr, 0.8, 1);
      }
    }

    requestAnimationFrame(frame);
  }

  /* ---------------- Interaction with the sky ---------------- */
  function lanternAt(px, py) {
    let best = null, bestD = Infinity;
    for (const l of lanterns) {
      if (l.leaving) continue;
      const d = Math.hypot(px - l.sx, py - l.sy);
      if (d < Math.max(l.sr * 1.1, 16) && d < bestD) { best = l; bestD = d; }
    }
    return best;
  }

  canvas.addEventListener('pointermove', (e) => {
    hovered = lanternAt(e.clientX, e.clientY);
    canvas.style.cursor = hovered ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', () => { hovered = null; });
  canvas.addEventListener('click', (e) => {
    const l = lanternAt(e.clientX, e.clientY);
    if (l) openWish(l.wish);
  });

  /* ---------------- Dialog ---------------- */
  const dialog = $('#wishDialog');
  let dialogWish = null;
  function openWish(w) {
    dialogWish = w;
    const m = MOODS[w.mood];
    dialog.style.setProperty('--c', m.color);
    $('#dlgMood').textContent = m.label;
    $('#dlgText').textContent = '“' + w.text + '”';
    $('#dlgMeta').textContent = 'Released ' + timeAgo(w.at);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    chime([783.99, 1046.5], 0.06);
  }
  function closeDialog() {
    if (dialog.open) dialog.close ? dialog.close() : dialog.removeAttribute('open');
  }
  $('#dlgClose').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });
  $('#dlgCopy').addEventListener('click', async () => {
    if (!dialogWish) return;
    const text = `🏮 "${dialogWish.text}" — released on Lanterna\n${location.href.split('#')[0]}`;
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard ✨'); }
    catch (_) { toast("Couldn't copy, sorry"); }
  });

  /* ---------------- Composer ---------------- */
  const form = $('#composer');
  const input = $('#wish');
  const charCount = $('#charCount');

  input.addEventListener('input', () => {
    charCount.textContent = input.value.length;
    charCount.parentElement.classList.toggle('warn', input.value.length > 125);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); form.requestSubmit(); }
  });

  let lastInspire = -1;
  $('#inspireBtn').addEventListener('click', () => {
    let i;
    do { i = Math.floor(Math.random() * INSPIRATION.length); } while (i === lastInspire);
    lastInspire = i;
    const [text, mood] = INSPIRATION[i];
    input.value = text;
    form.querySelector(`input[value="${mood}"]`).checked = true;
    input.dispatchEvent(new Event('input'));
    input.focus();
    input.setSelectionRange(text.length, text.length);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim().replace(/\s+/g, ' ');
    if (text.length < 2) {
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      toast('Write a few words first 🌙');
      input.focus();
      return;
    }
    const mood = form.querySelector('input[name="mood"]:checked').value;
    const w = { id: uid(), text, mood, at: Date.now() };
    wishes.unshift(w);
    saveWishes();

    const l = createLantern(w, true);
    lanterns.push(l);
    syncLanterns();
    burst(l.x * W, HORIZON + 10, MOODS[mood].rgb);
    highlight = { id: w.id, until: performance.now() + 9000 };

    input.value = '';
    input.dispatchEvent(new Event('input'));
    chime();
    toast('Your lantern is rising ✨');
    renderJournal();
    updateCounter();
  });

  /* ---------------- Journal ---------------- */
  let filter = 'all';
  const list = $('#journalList');
  const empty = $('#emptyState');
  const filtersEl = $('#filters');
  const search = $('#search');

  function renderFilters() {
    const counts = { all: wishes.length };
    for (const k of Object.keys(MOODS)) counts[k] = wishes.filter((w) => w.mood === k).length;
    const items = [['all', 'All', '#ffc56b'], ...Object.entries(MOODS).map(([k, m]) => [k, m.label, m.color])];
    filtersEl.innerHTML = '';
    for (const [k, label, color] of items) {
      const b = document.createElement('button');
      b.className = 'filter';
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(filter === k));
      b.style.setProperty('--c', color);
      b.innerHTML = `<i></i>${label} <small>${counts[k]}</small>`;
      b.addEventListener('click', () => { filter = k; renderJournal(); });
      filtersEl.appendChild(b);
    }
  }

  function renderChart() {
    const el = $('#moodChart');
    const total = wishes.length || 1;
    const counts = Object.entries(MOODS).map(([k, m]) => [k, m, wishes.filter((w) => w.mood === k).length]);
    const top = counts.slice().sort((a, b) => b[2] - a[2])[0];
    el.innerHTML = `<div class="chart-title"><span>Your sky's mood</span><b>${wishes.length ? 'Mostly ' + top[1].label.toLowerCase() : 'Empty'}</b></div>
      <div class="bar-wrap">${counts.map(([, m, c]) => `<div class="bar" title="${m.label}: ${c}" style="width:${(c / total) * 100}%;background:${m.color}"></div>`).join('')}</div>`;
  }

  function renderJournal() {
    renderFilters();
    renderChart();
    const q = search.value.trim().toLowerCase();
    const items = wishes.filter((w) => (filter === 'all' || w.mood === filter) && (!q || w.text.toLowerCase().includes(q)));
    list.innerHTML = '';
    empty.hidden = items.length > 0;
    items.forEach((w, i) => {
      const m = MOODS[w.mood];
      const li = document.createElement('li');
      li.className = 'entry card';
      li.style.setProperty('--c', m.color);
      li.style.animationDelay = Math.min(i, 12) * 40 + 'ms';
      const p = document.createElement('p');
      p.className = 'entry-text';
      p.textContent = w.text;
      const meta = document.createElement('div');
      meta.className = 'entry-meta';
      meta.innerHTML = `<span><span class="entry-tag">${m.label}</span> · ${timeAgo(w.at)}</span>
        <span class="entry-actions">
          <button type="button" data-act="find" title="Find this lantern in the sky">Find in sky</button>
          <button type="button" data-act="del" class="danger" title="Release this lantern forever">Release</button>
        </span>`;
      meta.querySelector('[data-act="find"]').addEventListener('click', () => findInSky(w));
      meta.querySelector('[data-act="del"]').addEventListener('click', () => releaseForever(w, li));
      li.append(p, meta);
      list.appendChild(li);
    });
  }
  search.addEventListener('input', renderJournal);

  function findInSky(w) {
    const idx = wishes.indexOf(w);
    if (idx >= MAX_IN_SKY) { toast('This lantern has drifted beyond the sky. It lives on in your journal 🌌'); return; }
    highlight = { id: w.id, until: performance.now() + 6000 };
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    toast('Look for the pulsing light ✨');
  }

  function releaseForever(w, li) {
    const l = lanterns.find((x) => x.id === w.id);
    if (l) l.leaving = performance.now();
    wishes = wishes.filter((x) => x.id !== w.id);
    saveWishes();
    li.classList.add('leaving');
    chime([659.25, 523.25, 392], 0.07);
    toast('Released. Let it go 🕊️');
    setTimeout(() => { syncLanterns(); renderJournal(); updateCounter(); }, 550);
  }

  function updateCounter() {
    $('#litCount').textContent = wishes.length;
  }

  /* ---------------- Utilities ---------------- */
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  function timeAgo(ts) {
    const s = (ts - Date.now()) / 1000;
    const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [u, sec] of units) if (Math.abs(s) >= sec) return rtf.format(Math.round(s / sec), u);
    return 'just now';
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---------------- Sound (Web Audio, fully synthesized) ---------------- */
  let actx = null, ambient = null, soundOn = false;
  function audio() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function chime(notes = [523.25, 659.25, 783.99, 1046.5], vol = 0.09) {
    if (!soundOn) return;
    const a = audio();
    notes.forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t0 = a.currentTime + i * 0.13;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.2);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + 2.3);
    });
  }
  function startAmbient() {
    const a = audio();
    const master = a.createGain();
    master.gain.setValueAtTime(0, a.currentTime);
    master.gain.linearRampToValueAtTime(0.06, a.currentTime + 3);
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    lp.connect(master).connect(a.destination);
    const nodes = [];
    [110, 164.81, 220, 277.18, 329.63].forEach((f, i) => {
      const o = a.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = rand(-7, 7);
      const g = a.createGain();
      g.gain.value = 0.18;
      const lfo = a.createOscillator();
      lfo.frequency.value = 0.04 + i * 0.027;
      const lg = a.createGain();
      lg.gain.value = 0.16;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(lp);
      o.start(); lfo.start();
      nodes.push(o, lfo);
    });
    // Gentle random wind-chime notes
    const pent = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];
    const timer = setInterval(() => {
      if (Math.random() < 0.5) chime([pent[Math.floor(Math.random() * pent.length)]], 0.025);
    }, 2600);
    ambient = { master, nodes, timer };
  }
  function stopAmbient() {
    if (!ambient) return;
    const { master, nodes, timer } = ambient;
    clearInterval(timer);
    master.gain.cancelScheduledValues(actx.currentTime);
    master.gain.setValueAtTime(master.gain.value, actx.currentTime);
    master.gain.linearRampToValueAtTime(0, actx.currentTime + 0.8);
    setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch (_) {} }), 900);
    ambient = null;
  }
  const soundBtn = $('#soundBtn');
  soundBtn.addEventListener('click', () => {
    soundOn = !soundOn;
    soundBtn.setAttribute('aria-pressed', String(soundOn));
    if (soundOn) { startAmbient(); toast('Ambient sound on 🎐'); } else { stopAmbient(); toast('Sound off'); }
  });

  /* ---------------- Save sky as image ---------------- */
  $('#saveBtn').addEventListener('click', () => {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const o = out.getContext('2d');
    o.drawImage(canvas, 0, 0);
    o.scale(DPR, DPR);
    o.fillStyle = 'rgba(255,240,215,0.92)';
    o.textAlign = 'center';
    o.font = `600 ${clamp(W * 0.05, 32, 64)}px "Cormorant Garamond", Georgia, serif`;
    o.fillText('Lanterna', W / 2, H * 0.9);
    o.font = `400 ${clamp(W * 0.012, 12, 16)}px Inter, sans-serif`;
    o.fillStyle = 'rgba(220,210,235,0.85)';
    o.fillText(`${wishes.length} lanterns lit in my sky`, W / 2, H * 0.9 + 28);
    out.toBlob((blob) => {
      if (!blob) return toast("Couldn't save image");
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my-lanterna-sky.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast('Your sky was saved 📸');
    });
  });

  /* ---------------- Boot ---------------- */
  makeGlowSprites();
  resize();
  syncLanterns();
  renderJournal();
  updateCounter();
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 120); });


  requestAnimationFrame(frame);
})();
