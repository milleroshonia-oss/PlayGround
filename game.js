(() => {
  const canvas = document.querySelector('#world');
  const ctx = canvas.getContext('2d');
  const shell = document.querySelector('#game-shell');
  const storeKey = 'muse-no-edges-v1';
  const $ = (selector) => document.querySelector(selector);
  const ui = {
    echoCount: $('#echo-count'), progress: $('#progress-fill'), mission: $('#mission-title'),
    coordinates: $('#coordinates'), region: $('#region-name'), toast: $('#toast'), echoToast: $('#echo-toast'),
    welcome: $('#welcome-modal'), help: $('#help-modal')
  };
  const W = 760;
  const regionWords = ['THE OPEN', 'SOFT DISTANCE', 'AFTERGLOW', 'BLUE HOUR', 'QUIET ORBIT', 'WILD HORIZON', 'DREAM FIELD', 'ELSEWHERE'];
  const keys = new Set();
  const touchKeys = new Set();
  let width = innerWidth, height = innerHeight, dpr = 1, last = performance.now();
  let selectedTool = 'bloom';
  let drawing = null;
  let callUntil = 0;
  let toastTimer = 0;
  let echoToastTimer = 0;
  let currentRegion = '';
  let milestoneShown = false;
  let data;
  try { data = JSON.parse(localStorage.getItem(storeKey) || '{}'); } catch { data = {}; }
  data.player ||= { x: 0, y: 0 };
  data.creations ||= [];
  data.collected ||= [];
  data.echoes ||= 0;
  const player = { x: Number(data.player.x) || 0, y: Number(data.player.y) || 0, vx: 0, vy: 0, facing: 0 };
  const collected = new Set(data.collected);
  let echoes = Number(data.echoes) || 0;
  let creations = data.creations;
  let echoCache = new Map();
  const particles = [];

  function save() {
    data.player = { x: Math.round(player.x), y: Math.round(player.y) };
    data.creations = creations.slice(-1500);
    data.collected = [...collected].slice(-1500);
    data.echoes = echoes;
    try { localStorage.setItem(storeKey, JSON.stringify(data)); } catch {}
  }
  function resize() {
    width = innerWidth; height = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize); resize();

  function hash(x, y, n = 0) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(n | 0, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function regionAt(x, y) {
    const gx = Math.floor(x / (W * 3)), gy = Math.floor(y / (W * 3));
    return regionWords[Math.floor(hash(gx, gy, 91) * regionWords.length)];
  }
  function screenToWorld(sx, sy) { return { x: sx - width / 2 + player.x, y: sy - height / 2 + player.y }; }
  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 1900);
  }
  function updateHud() {
    const gx = Math.round(player.x / 100), gy = Math.round(player.y / 100);
    ui.coordinates.textContent = `${gx} : ${gy}`;
    const r = regionAt(player.x, player.y);
    ui.region.textContent = r;
    if (r !== currentRegion) {
      if (currentRegion) showToast(`YOU FOUND ${r}`);
      currentRegion = r;
    }
    ui.echoCount.textContent = String(echoes);
    ui.progress.style.width = `${Math.min(echoes / 12 * 100, 100)}%`;
    ui.mission.textContent = echoes >= 12 ? 'A constellation is yours' : echoes === 0 ? 'Find your first echoes' : 'Follow the little lights';
  }
  function pulseEchoMessage() {
    ui.echoToast.classList.add('show'); clearTimeout(echoToastTimer);
    echoToastTimer = setTimeout(() => ui.echoToast.classList.remove('show'), 1200);
  }
  function spawnBurst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, speed = 25 + Math.random() * 105;
      particles.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .45 + Math.random() * .65, max: .7, color, size: 1 + Math.random() * 2.2 });
    }
  }
  function getEchoes() {
    const minX = Math.floor((player.x - width / 2 - 200) / W), maxX = Math.floor((player.x + width / 2 + 200) / W);
    const minY = Math.floor((player.y - height / 2 - 200) / W), maxY = Math.floor((player.y + height / 2 + 200) / W);
    const found = [];
    for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
      for (let i = 0; i < 2; i++) {
        const id = `${cx},${cy},${i}`;
        if (collected.has(id)) continue;
        let e = echoCache.get(id);
        if (!e) {
          e = { id, x: (cx + .18 + hash(cx, cy, i * 7 + 1) * .64) * W, y: (cy + .18 + hash(cx, cy, i * 7 + 2) * .64) * W, phase: hash(cx, cy, i + 19) * 7, vx: 0, vy: 0 };
          echoCache.set(id, e);
        }
        found.push(e);
      }
    }
    if (echoCache.size > 500) {
      const visible = new Set(found.map(e => e.id));
      for (const id of echoCache.keys()) if (!visible.has(id)) echoCache.delete(id);
    }
    return found;
  }
  function collectEcho(e) {
    collected.add(e.id); echoes++;
    spawnBurst(e.x, e.y, '#b8ffe6', 16);
    pulseEchoMessage();
    if (echoes === 12 && !milestoneShown) { milestoneShown = true; setTimeout(() => showToast('A CONSTELLATION IS YOURS — AND THE OPEN GOES ON'), 350); }
    save(); updateHud();
  }
  function doCall() {
    callUntil = performance.now() + 1800;
    spawnBurst(player.x, player.y, '#d6bbff', 22);
    showToast('THE LIGHT HEARS YOU');
  }
  function setTool(tool) {
    selectedTool = tool;
    document.querySelectorAll('.tool').forEach(button => button.classList.toggle('active', button.dataset.tool === tool));
    if (tool !== 'erase') showToast(`${tool === 'bloom' ? 'BLOOM' : tool === 'orb' ? 'LANTERN' : 'RIBBON'} SELECTED`);
  }
  function createAt(point) {
    if (selectedTool === 'erase') {
      let best = -1, distance = 58;
      for (let i = 0; i < creations.length; i++) {
        const c = creations[i];
        let d = Math.hypot(c.x - point.x, c.y - point.y);
        if (c.type === 'ribbon') for (const p of c.points) d = Math.min(d, Math.hypot(p.x - point.x, p.y - point.y));
        if (d < distance) { distance = d; best = i; }
      }
      if (best >= 0) { const c = creations.splice(best, 1)[0]; spawnBurst(c.x, c.y, '#ffafd7', 8); save(); showToast('LET IT GO'); }
      else showToast('NOTHING TO ERASE HERE');
      return;
    }
    if (selectedTool === 'ribbon') return;
    creations.push({ type: selectedTool, x: point.x, y: point.y, seed: Math.random() * 1000, scale: .8 + Math.random() * .6 });
    if (creations.length > 1500) creations.shift();
    spawnBurst(point.x, point.y, selectedTool === 'bloom' ? '#ffaed0' : '#9df2d4', 9);
    save();
  }
  function onPointerDown(event) {
    if (event.button === 2) { event.preventDefault(); const old = selectedTool; selectedTool = 'erase'; createAt(screenToWorld(event.clientX, event.clientY)); selectedTool = old; return; }
    if (event.button !== 0 || !ui.welcome.classList.contains('hidden') || !ui.help.classList.contains('hidden')) return;
    const point = screenToWorld(event.clientX, event.clientY);
    if (selectedTool === 'ribbon') {
      drawing = { points: [point], x: point.x, y: point.y };
      canvas.setPointerCapture?.(event.pointerId);
    } else createAt(point);
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', event => {
    if (!drawing) return;
    const p = screenToWorld(event.clientX, event.clientY), lastPoint = drawing.points[drawing.points.length - 1];
    if (Math.hypot(p.x - lastPoint.x, p.y - lastPoint.y) > 7) drawing.points.push(p);
  });
  function finishDrawing() {
    if (!drawing) return;
    if (drawing.points.length > 1) {
      creations.push({ type: 'ribbon', x: drawing.x, y: drawing.y, points: drawing.points, seed: Math.random() * 1000 });
      if (creations.length > 1500) creations.shift();
      save();
    }
    drawing = null;
  }
  canvas.addEventListener('pointerup', finishDrawing); canvas.addEventListener('pointercancel', finishDrawing);
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  document.querySelectorAll('.tool').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
  $('#begin-button').addEventListener('click', () => { ui.welcome.classList.add('hidden'); shell.focus?.(); });
  $('#help-button').addEventListener('click', () => ui.help.classList.remove('hidden'));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).classList.add('hidden')));
  $('#call-button').addEventListener('pointerdown', e => { e.preventDefault(); doCall(); });
  $('#reset-button').addEventListener('click', () => {
    if (!confirm('Begin a new open world? This clears your creations and collected echoes on this device.')) return;
    localStorage.removeItem(storeKey); creations = []; collected.clear(); echoes = 0; player.x = 0; player.y = 0; player.vx = 0; player.vy = 0; echoCache.clear(); save(); updateHud(); showToast('A NEW OPENING');
  });
  document.querySelectorAll('.touch-controls button').forEach(button => {
    const dir = button.dataset.dir;
    const down = e => { e.preventDefault(); touchKeys.add(dir); button.setPointerCapture?.(e.pointerId); };
    const up = e => { e.preventDefault(); touchKeys.delete(dir); };
    button.addEventListener('pointerdown', down); button.addEventListener('pointerup', up); button.addEventListener('pointercancel', up); button.addEventListener('lostpointercapture', up);
  });
  addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
    const key = e.key.toLowerCase();
    if (key === 'escape' && !ui.help.classList.contains('hidden')) { ui.help.classList.add('hidden'); return; }
    if (!ui.welcome.classList.contains('hidden') || !ui.help.classList.contains('hidden')) return;
    if (['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(key)) keys.add(key);
    if (key === '1') setTool('bloom'); if (key === '2') setTool('orb'); if (key === '3') setTool('ribbon'); if (key === 'x') setTool('erase');
    if (key === ' ') doCall();
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); touchKeys.clear(); });

  function drawBackground(time) {
    ctx.fillStyle = '#090817'; ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * .53, height * .47, 20, width * .53, height * .47, Math.max(width, height) * .68);
    glow.addColorStop(0, '#19132f'); glow.addColorStop(.52, '#101024'); glow.addColorStop(1, '#080817'); ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    const parallax = .18, ox = -player.x * parallax, oy = -player.y * parallax;
    const size = 440, minX = Math.floor((ox - 100) / size), maxX = Math.floor((ox + width + 100) / size), minY = Math.floor((oy - 100) / size), maxY = Math.floor((oy + height + 100) / size);
    for (let cy = minY; cy <= maxY; cy++) for (let cx = minX; cx <= maxX; cx++) {
      const r = hash(cx, cy, 190), sx = cx * size - ox, sy = cy * size - oy;
      if (r > .72) {
        const gx = sx + hash(cx, cy, 192) * size, gy = sy + hash(cx, cy, 193) * size, radius = 110 + hash(cx, cy, 194) * 130;
        const n = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
        n.addColorStop(0, r > .91 ? '#603c8020' : '#3550801a'); n.addColorStop(1, '#17142b00'); ctx.fillStyle = n; ctx.fillRect(gx - radius, gy - radius, radius * 2, radius * 2);
      }
      for (let i = 0; i < 12; i++) {
        const x = sx + hash(cx, cy, i * 3 + 1) * size, y = sy + hash(cx, cy, i * 3 + 2) * size;
        const radius = .45 + hash(cx, cy, i * 3 + 3) * 1.25, alpha = .12 + hash(cx, cy, i * 3 + 4) * .42;
        const twinkle = .7 + .3 * Math.sin(time / 1300 + hash(cx, cy, i + 31) * 6.28);
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = `rgba(218,208,255,${alpha * twinkle})`; ctx.fill();
      }
    }
    // Sparse nearby motes make the depth legible without implying a boundary.
    for (let i = 0; i < 34; i++) {
      const x = (hash(i, 821, 2) * width + time * (.002 + hash(i, 821, 3) * .006)) % width;
      const y = (hash(i, 822, 4) * height + Math.sin(time / 1400 + i) * 12 + height) % height;
      ctx.fillStyle = `rgba(194,172,255,${.12 + hash(i, 822, 7) * .24})`; ctx.fillRect(x, y, 1.2, 1.2);
    }
  }
  function glowCircle(x, y, radius, color, alpha = 1) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color.replace('ALPHA', String(.35 * alpha))); g.addColorStop(1, color.replace('ALPHA', '0'));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
  function drawBloom(c, time) {
    const scale = c.scale || 1, phase = c.seed || 0;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.sin(time / 1700 + phase) * .11); ctx.scale(scale, scale);
    glowCircle(0, 0, 53, 'rgba(255,145,204,ALPHA)', .68);
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.rotate(i * Math.PI / 3 + Math.sin(time / 1300 + phase) * .04);
      const g = ctx.createLinearGradient(0, -4, 0, -28); g.addColorStop(0, '#ffb2d8'); g.addColorStop(1, '#dcaeff');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -14, 5.2, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 7); ctx.fillStyle = '#fff0bd'; ctx.shadowColor = '#ffe4ad'; ctx.shadowBlur = 12; ctx.fill(); ctx.restore();
  }
  function drawLantern(c, time) {
    const scale = c.scale || 1, phase = c.seed || 0, bob = Math.sin(time / 780 + phase) * 5;
    ctx.save(); ctx.translate(c.x, c.y + bob); ctx.scale(scale, scale);
    glowCircle(0, 0, 67, 'rgba(122,255,220,ALPHA)', .72);
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fillStyle = '#b8ffe6'; ctx.shadowColor = '#85ffd7'; ctx.shadowBlur = 20; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.strokeStyle = '#afffe74d'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }
  function drawRibbon(c, time) {
    if (!c.points || c.points.length < 2) return;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(c.points[0].x, c.points[0].y);
    for (let i = 1; i < c.points.length; i++) ctx.lineTo(c.points[i].x, c.points[i].y);
    ctx.strokeStyle = '#b7a0ff20'; ctx.lineWidth = 15; ctx.shadowColor = '#ac8dff'; ctx.shadowBlur = 25; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c.points[0].x, c.points[0].y); for (let i = 1; i < c.points.length; i++) ctx.lineTo(c.points[i].x, c.points[i].y);
    ctx.strokeStyle = `rgba(203,183,255,${.62 + .18 * Math.sin(time / 500 + (c.seed || 0))})`; ctx.lineWidth = 2.3; ctx.shadowBlur = 12; ctx.stroke(); ctx.restore();
  }
  function drawEcho(e, time) {
    const pulse = 1 + Math.sin(time / 410 + e.phase) * .13, r = 6 * pulse;
    glowCircle(e.x, e.y, 40, 'rgba(148,255,219,ALPHA)', .72);
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(Math.PI / 4 + time / 2400 + e.phase);
    ctx.fillStyle = '#c9ffe8'; ctx.shadowColor = '#8affd5'; ctx.shadowBlur = 17;
    ctx.fillRect(-r / 2, -r / 2, r, r); ctx.restore();
    ctx.beginPath(); ctx.arc(e.x, e.y, 13 * pulse, 0, Math.PI * 2); ctx.strokeStyle = '#a4f5d431'; ctx.lineWidth = 1; ctx.stroke();
  }
  function drawPlayer(time) {
    const x = player.x, y = player.y;
    const radius = 26 + Math.sin(time / 360) * 3;
    glowCircle(x, y, radius * 2.7, 'rgba(201,169,255,ALPHA)', .9);
    ctx.save(); ctx.translate(x, y); ctx.rotate(player.facing + Math.PI / 4 + Math.sin(time / 550) * .06);
    ctx.beginPath(); ctx.roundRect(-7, -7, 14, 14, 4); ctx.fillStyle = '#f1dfff'; ctx.shadowColor = '#c4a0ff'; ctx.shadowBlur = 22; ctx.fill();
    ctx.beginPath(); ctx.roundRect(-3.2, -3.2, 6.4, 6.4, 2); ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 11; ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, 20 + Math.sin(time / 480) * 2, 0, Math.PI * 2); ctx.strokeStyle = '#d7bcff24'; ctx.lineWidth = 1; ctx.stroke();
    if (time < callUntil) {
      const p = 1 - (callUntil - time) / 1800;
      ctx.beginPath(); ctx.arc(x, y, 22 + p * 300, 0, Math.PI * 2); ctx.strokeStyle = `rgba(203,176,255,${Math.sin(p * Math.PI) * .48})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, 22 + p * 300, 0, Math.PI * 2); ctx.strokeStyle = `rgba(158,255,219,${Math.sin(p * Math.PI) * .16})`; ctx.lineWidth = 10; ctx.stroke();
    }
  }
  function update(dt, time) {
    const up = keys.has('w') || keys.has('arrowup') || touchKeys.has('up'), down = keys.has('s') || keys.has('arrowdown') || touchKeys.has('down');
    const left = keys.has('a') || keys.has('arrowleft') || touchKeys.has('left'), right = keys.has('d') || keys.has('arrowright') || touchKeys.has('right');
    let dx = (right ? 1 : 0) - (left ? 1 : 0), dy = (down ? 1 : 0) - (up ? 1 : 0);
    if (dx || dy) { const m = Math.hypot(dx, dy); dx /= m; dy /= m; player.facing = Math.atan2(dy, dx); }
    const speed = 280;
    player.vx += (dx * speed - player.vx) * Math.min(1, dt * 7.5);
    player.vy += (dy * speed - player.vy) * Math.min(1, dt * 7.5);
    if (!dx) player.vx *= Math.max(0, 1 - dt * 2.4); if (!dy) player.vy *= Math.max(0, 1 - dt * 2.4);
    player.x += player.vx * dt; player.y += player.vy * dt;
    const echoList = getEchoes();
    for (const e of echoList) {
      if (time < callUntil) {
        const ddx = player.x - e.x, ddy = player.y - e.y, dist = Math.hypot(ddx, ddy);
        if (dist < 380 && dist > 1) { e.vx += ddx / dist * 980 * dt; e.vy += ddy / dist * 980 * dt; }
      }
      e.vx *= Math.exp(-2.2 * dt); e.vy *= Math.exp(-2.2 * dt); e.x += e.vx * dt; e.y += e.vy * dt;
      if (Math.hypot(player.x - e.x, player.y - e.y) < 27) collectEcho(e);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-2.5 * dt); p.vy *= Math.exp(-2.5 * dt);
      if (p.life <= 0) particles.splice(i, 1);
    }
    updateHud();
  }
  function render(time) {
    drawBackground(time);
    const echoList = getEchoes();
    ctx.save(); ctx.translate(width / 2 - player.x, height / 2 - player.y);
    // A soft, non-grid ground haze gives creations a shared sense of place.
    const ground = ctx.createRadialGradient(player.x, player.y, 0, player.x, player.y, 350);
    ground.addColorStop(0, '#4e3a6711'); ground.addColorStop(1, '#22183700'); ctx.fillStyle = ground; ctx.fillRect(player.x - 350, player.y - 350, 700, 700);
    for (const c of creations) {
      if (c.type === 'bloom') drawBloom(c, time); else if (c.type === 'orb') drawLantern(c, time); else drawRibbon(c, time);
    }
    if (drawing) drawRibbon({ points: drawing.points, seed: 0 }, time);
    for (const e of echoList) drawEcho(e, time);
    drawPlayer(time);
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life / .2); ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.restore();
  }
  function frame(now) {
    const dt = Math.min(.035, (now - last) / 1000); last = now;
    if (ui.welcome.classList.contains('hidden') && ui.help.classList.contains('hidden')) update(dt, now);
    render(now); requestAnimationFrame(frame);
  }
  updateHud(); requestAnimationFrame(frame);
  setInterval(save, 12000);
})();
