const frameW = 48,
  frameH = 64,
  durations = [1200, 180, 180, 180, 100, 360];
const names = ['Droite', 'Dos', 'Gauche', 'Face'];
const stage = document.getElementById('stage'),
  ctx = stage.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
let paused = reduced,
  clock = 0,
  last = 0,
  x = 310,
  y = 220,
  direction = 3,
  target = null;
const keys = new Set();
const load = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
const gallery = names.map((name, index) => {
  const card = document.createElement('article');
  card.innerHTML = `<h2>${name}</h2><canvas width="240" height="220" aria-label="${name} : marche et repos"></canvas><p><span>Marche</span><span>Repos</span></p>`;
  document.getElementById('directions').append(card);
  return card.querySelector('canvas').getContext('2d');
});
function idleFrame(t) {
  let time = t % durations.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 6; i++) {
    if (time < durations[i]) return i;
    time -= durations[i];
  }
  return 0;
}
function draw(context, img, dir, frame, px, py, scale = 1) {
  context.imageSmoothingEnabled = false;
  context.drawImage(
    img,
    (dir * 6 + frame) * frameW,
    0,
    frameW,
    frameH,
    Math.round(px - (frameW * scale) / 2),
    Math.round(py - frameH * scale),
    frameW * scale,
    frameH * scale,
  );
}
const pause = document.getElementById('pause');
function setPause() {
  pause.textContent = paused ? 'Reprendre' : 'Pause';
  pause.setAttribute('aria-pressed', String(paused));
}
setPause();
pause.onclick = () => {
  paused = !paused;
  setPause();
};
document.getElementById('background').onchange = (e) =>
  document.body.classList.toggle('dark', e.target.value === 'dark');
stage.addEventListener('pointerdown', (e) => {
  stage.focus();
  const r = stage.getBoundingClientRect();
  target = {
    x: Math.max(40, Math.min(790, ((e.clientX - r.left) * 960) / r.width)),
    y: Math.max(110, Math.min(280, ((e.clientY - r.top) * 300) / r.height)),
  };
});
const movement = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'z', 'q'];
stage.addEventListener('keydown', (e) => {
  if (movement.includes(e.key.toLowerCase())) {
    e.preventDefault();
    keys.add(e.key.toLowerCase());
    target = null;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
stage.addEventListener('blur', () => keys.clear());
Promise.all([
  load('../Characters/original/Aurore_walk.png'),
  load('../Characters/original/Aurore_idle.png'),
  load('../Characters/original/Milo_idle.png'),
])
  .then(([walk, idle, milo]) => {
    document.getElementById('status').textContent = '48 images chargées · prêt à tester';
    function render(now) {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      if (!paused) clock += dt * 1000;
      let dx =
        Number(keys.has('arrowright') || keys.has('d')) -
        Number(keys.has('arrowleft') || keys.has('a') || keys.has('q'));
      let dy =
        Number(keys.has('arrowdown') || keys.has('s')) -
        Number(keys.has('arrowup') || keys.has('w') || keys.has('z'));
      if (target) {
        dx = target.x - x;
        dy = target.y - y;
        if (Math.hypot(dx, dy) < 3) {
          target = null;
          dx = 0;
          dy = 0;
        }
      }
      const moving = !paused && Math.hypot(dx, dy) > 0;
      if (moving) {
        direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 3 : 1;
        const n = Math.hypot(dx, dy);
        x = Math.max(40, Math.min(790, x + (dx / n) * 120 * dt));
        y = Math.max(110, Math.min(280, y + (dy / n) * 120 * dt));
      }
      ctx.clearRect(0, 0, 960, 300);
      ctx.fillStyle = document.body.classList.contains('dark') ? '#d5e0e9' : '#526177';
      ctx.font = '14px system-ui';
      ctx.fillText('Aurore', x - 22, y + 22);
      ctx.fillText('Milo · échelle du jeu', 797, 270);
      draw(
        ctx,
        moving ? walk : idle,
        direction,
        moving ? Math.floor(clock / 100) % 6 : idleFrame(clock),
        x,
        y,
        1.5,
      );
      ctx.drawImage(milo, 18 * 48, 0, 48, 64, 825, 174, 54, 72);
      for (let dir = 0; dir < 4; dir++) {
        const c = gallery[dir];
        c.clearRect(0, 0, 240, 220);
        draw(c, walk, dir, Math.floor(clock / 100) % 6, 60, 198, 2.5);
        draw(c, idle, dir, idleFrame(clock), 180, 198, 2.5);
      }
      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  })
  .catch((error) => {
    document.getElementById('status').textContent =
      'Impossible de charger une planche : ' + error.message;
  });
