const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const video = document.querySelector("#cameraVideo");
const trackingCanvas = document.querySelector("#trackingCanvas");
const trackingCtx = trackingCanvas.getContext("2d", { willReadFrequently: true });
const scoreEl = document.querySelector("#score");
const timeEl = document.querySelector("#time");
const finalScoreEl = document.querySelector("#finalScore");
const startButton = document.querySelector("#startButton");
const restartButton = document.querySelector("#restartButton");
const gameOverPanel = document.querySelector("#gameOverPanel");
const cameraStatus = document.querySelector("#cameraStatus");

const CONFIG = {
  roundSeconds: 60,
  spawnEveryMs: 1400,
  catchRadius: 100,
  glass: { x: 0.78, y: 0.18, w: 0.18, h: 0.64 },
};

const state = {
  running: false,
  gameOver: false,
  score: 0,
  remaining: CONFIG.roundSeconds,
  cats: [],
  pills: [],
  particles: [],
  finger: null,
  grabbedCatId: null,
  lastTime: 0,
  spawnClock: 0,
  trackerMode: "camera",
  nextCatId: 1,
};

class FingerTracker {
  constructor() {
    this.testPoint = null;
    this.active = false;
    this.stream = null;
    this.pointerPoint = null;
    this.previousFrame = null;
    this.forceTestMode = new URLSearchParams(location.search).has("testMode");
  }

  async start() {
    this.active = true;
    if (this.forceTestMode) {
      cameraStatus.textContent = "Test finger tracker active";
      state.trackerMode = "test";
      return;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 360 },
        audio: false,
      });
      video.srcObject = this.stream;
      await video.play();
      cameraStatus.textContent = "Camera finger tracking active";
      state.trackerMode = "camera";
    } catch (error) {
      cameraStatus.textContent = "Camera unavailable. Mouse/touch fallback enabled.";
      state.trackerMode = "demo";
    }
  }

  stop() {
    this.active = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.pointerPoint = null;
  }

  setTestPoint(point) {
    this.testPoint = point;
  }

  setPointerPoint(point) {
    this.pointerPoint = point;
  }

  read(now) {
    if (!this.active) return null;
    if (this.testPoint) return { ...this.testPoint, active: true };
    if (this.pointerPoint) return { ...this.pointerPoint, active: true };
    if (state.trackerMode === "demo") return demoFinger(now);
    if (!video.videoWidth) return null;

    trackingCtx.drawImage(video, 0, 0, trackingCanvas.width, trackingCanvas.height);
    const frame = trackingCtx.getImageData(0, 0, trackingCanvas.width, trackingCanvas.height);
    const target = this.findFingerTarget(frame);
    this.previousFrame = new Uint8ClampedArray(frame.data);

    if (!target) return null;
    return {
      x: 1 - target.x / trackingCanvas.width,
      y: target.y / trackingCanvas.height,
      active: true,
    };
  }

  findFingerTarget(frame) {
    let brightCount = 0;
    let brightX = 0;
    let brightY = 0;
    let movingCount = 0;
    let movingX = 0;
    let movingY = 0;
    let skinCount = 0;
    let skinX = 0;
    let skinY = 0;

    for (let y = 0; y < trackingCanvas.height; y += 2) {
      for (let x = 0; x < trackingCanvas.width; x += 2) {
        const i = (y * trackingCanvas.width + x) * 4;
        const r = frame.data[i];
        const g = frame.data[i + 1];
        const b = frame.data[i + 2];
        const brightMarker = r > 190 && g > 80 && b > 110;
        const warmSkin = r > 95 && g > 48 && b > 34 && r > g * 1.18 && r > b * 1.28;

        if (brightMarker) {
          brightCount++;
          brightX += x;
          brightY += y;
          continue;
        }

        if (warmSkin) {
          skinCount++;
          skinX += x;
          skinY += y;

          if (this.previousFrame) {
            const pr = this.previousFrame[i];
            const pg = this.previousFrame[i + 1];
            const pb = this.previousFrame[i + 2];
            const diff = Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb);
            if (diff > 42) {
              movingCount++;
              movingX += x;
              movingY += y;
            }
          }
        }
      }
    }

    if (brightCount >= 6) return { x: brightX / brightCount, y: brightY / brightCount };
    if (movingCount >= 8) return { x: movingX / movingCount, y: movingY / movingCount };
    if (skinCount >= 18) return { x: skinX / skinCount, y: skinY / skinCount };
    return null;
  }
}

const tracker = new FingerTracker();

function resizeCanvas() {
  const dpr = Math.max(1, Math.min(devicePixelRatio, 2));
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function startGame() {
  state.running = true;
  state.gameOver = false;
  state.score = 0;
  state.remaining = CONFIG.roundSeconds;
  state.cats = [];
  state.pills = [];
  state.particles = [];
  state.grabbedCatId = null;
  state.spawnClock = 0;
  state.lastTime = performance.now();
  startButton.hidden = true;
  gameOverPanel.hidden = true;
  updateHud();
  tracker.start();
  spawnCat({ x: -70, y: canvasHeight() * 0.52, vx: 190, vy: -170 });
}

function endGame() {
  state.running = false;
  state.gameOver = true;
  state.grabbedCatId = null;
  finalScoreEl.textContent = String(state.score);
  gameOverPanel.hidden = false;
  tracker.stop();
}

function restartGame() {
  startGame();
}

function spawnCat(overrides = {}) {
  const h = canvasHeight();
  const cat = {
    id: state.nextCatId++,
    x: overrides.x ?? -80,
    y: overrides.y ?? h * (0.34 + Math.random() * 0.42),
    vx: overrides.vx ?? 180 + Math.random() * 120,
    vy: overrides.vy ?? -220 - Math.random() * 100,
    radius: 36,
    rotation: Math.random() * Math.PI,
    spin: -2 + Math.random() * 4,
    grabbed: false,
    processed: false,
    hue: 145 + Math.random() * 170,
  };
  state.cats.push(cat);
  return cat;
}

function update(dt, now) {
  state.finger = tracker.read(now);

  if (state.running) {
    state.remaining = Math.max(0, state.remaining - dt);
    state.spawnClock += dt * 1000;
    if (state.spawnClock > CONFIG.spawnEveryMs) {
      state.spawnClock = 0;
      spawnCat();
    }
    if (state.remaining <= 0) endGame();
  }

  moveCats(dt);
  updatePills(dt);
  updateParticles(dt);
  updateHud();
}

function moveCats(dt) {
  const w = canvasWidth();
  const h = canvasHeight();
  const glass = glassRect();
  const finger = state.finger ? toCanvasPoint(state.finger) : null;

  if (!finger) state.grabbedCatId = null;

  for (const cat of state.cats) {
    if (cat.processed) continue;
    cat.rotation += cat.spin * dt;

    const isGrabbed = state.grabbedCatId === cat.id;
    if (isGrabbed && finger) {
      cat.x = finger.x;
      cat.y = finger.y;
      cat.vx = 0;
      cat.vy = 0;
      if (pointInRect(cat, glass)) processCat(cat);
      continue;
    }

    if (state.running && finger && !state.grabbedCatId && distance(cat, finger) < CONFIG.catchRadius) {
      state.grabbedCatId = cat.id;
      cat.grabbed = true;
      burst(cat.x, cat.y, "#00ffcc", 12);
      continue;
    }

    cat.vy += 420 * dt;
    cat.x += cat.vx * dt;
    cat.y += cat.vy * dt;
  }

  state.cats = state.cats.filter(
    (cat) => !cat.processed && cat.x < w + 120 && cat.y < h + 140 && cat.y > -180,
  );
}

function processCat(cat) {
  cat.processed = true;
  state.grabbedCatId = null;
  state.score += 100;
  state.pills.push({
    x: cat.x,
    y: cat.y,
    life: 1,
    hue: cat.hue,
    rotation: cat.rotation,
  });
  burst(cat.x, cat.y, "#fbff29", 28);
  burst(cat.x, cat.y, "#ff28d4", 18);
}

function updatePills(dt) {
  for (const pill of state.pills) {
    pill.life -= dt * 0.72;
    pill.y -= 18 * dt;
    pill.rotation += 2.5 * dt;
  }
  state.pills = state.pills.filter((pill) => pill.life > 0);
}

function updateParticles(dt) {
  for (const particle of state.particles) {
    particle.life -= dt * 1.8;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 80 * dt;
  }
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 240;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.65,
      color,
      size: 2 + Math.random() * 5,
    });
  }
}

function render(now) {
  const w = canvasWidth();
  const h = canvasHeight();
  ctx.clearRect(0, 0, w, h);
  drawBackground(w, h, now);
  drawGlass(glassRect(), now);
  for (const cat of state.cats) drawCat(cat);
  for (const pill of state.pills) drawPill(pill);
  for (const particle of state.particles) drawParticle(particle);
  drawFinger();
  if (!state.running && !state.gameOver) drawAttractText(w, h);
}

function drawBackground(w, h, now) {
  const t = now * 0.001;
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, "#06000f");
  gradient.addColorStop(0.48, "#18002e");
  gradient.addColorStop(1, "#001f26");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 16; i++) {
    const x = ((i * 173 + t * 42) % (w + 240)) - 120;
    const y = h * (0.15 + ((i * 31) % 70) / 100);
    ctx.strokeStyle = `hsla(${(i * 47 + t * 32) % 360}, 100%, 62%, 0.26)`;
    ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(x - 80, y + Math.sin(t + i) * 24);
    ctx.bezierCurveTo(x + 70, y - 90, x + 160, y + 90, x + 310, y - 22);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGlass(rect, now) {
  const t = now * 0.004;
  ctx.save();
  ctx.shadowColor = "#8cfff0";
  ctx.shadowBlur = 26;
  ctx.strokeStyle = "rgba(140, 255, 240, 0.9)";
  ctx.lineWidth = 4;
  ctx.fillStyle = "rgba(150, 255, 245, 0.1)";
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(0, 255, 204, 0.16)";
  ctx.fillRect(rect.x + 8, rect.y + rect.h * 0.62 + Math.sin(t) * 5, rect.w - 16, rect.h * 0.28);
  ctx.fillStyle = "#fbff29";
  ctx.font = "900 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("GLASS", rect.x + rect.w / 2, rect.y + rect.h + 34);
  ctx.restore();
}

function drawCat(cat) {
  ctx.save();
  ctx.translate(cat.x, cat.y);
  ctx.rotate(cat.rotation);
  ctx.globalCompositeOperation = "lighter";
  ctx.shadowColor = `hsl(${cat.hue}, 100%, 60%)`;
  ctx.shadowBlur = cat.grabbed ? 34 : 22;

  ctx.fillStyle = `hsl(${cat.hue}, 100%, 58%)`;
  ctx.beginPath();
  ctx.arc(0, 2, cat.radius * 0.82, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-24, -20);
  ctx.lineTo(-12, -52);
  ctx.lineTo(3, -23);
  ctx.moveTo(22, -21);
  ctx.lineTo(38, -50);
  ctx.lineTo(42, -16);
  ctx.fill();

  ctx.fillStyle = "#05020b";
  ctx.beginPath();
  ctx.arc(-13, -3, 5, 0, Math.PI * 2);
  ctx.arc(15, -3, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#fbff29";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 12, 12, 0.1, Math.PI - 0.1);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.8)";
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 18, 8);
    ctx.lineTo(side * 42, 2);
    ctx.moveTo(side * 18, 14);
    ctx.lineTo(side * 44, 18);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPill(pill) {
  ctx.save();
  ctx.translate(pill.x, pill.y);
  ctx.rotate(pill.rotation);
  ctx.globalAlpha = Math.max(0, pill.life);
  ctx.shadowColor = "#fbff29";
  ctx.shadowBlur = 28 * pill.life;
  ctx.fillStyle = `hsla(${pill.hue}, 100%, 62%, ${pill.life})`;
  ctx.beginPath();
  ctx.roundRect(-34, -13, 68, 26, 13);
  ctx.fill();
  ctx.fillStyle = `rgba(251, 255, 41, ${pill.life})`;
  ctx.fillRect(0, -13, 3, 26);
  ctx.restore();
}

function drawParticle(particle) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, particle.life);
  ctx.shadowColor = particle.color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = particle.color;
  ctx.beginPath();
  ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFinger() {
  if (!state.finger) return;
  const finger = toCanvasPoint(state.finger);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = "#00ffcc";
  ctx.fillStyle = "rgba(0, 255, 204, 0.16)";
  ctx.shadowColor = "#00ffcc";
  ctx.shadowBlur = 24;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(finger.x, finger.y, CONFIG.catchRadius * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawAttractText(w, h) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "#ff28d4";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 clamp(42px, 8vw, 90px) sans-serif";
  ctx.fillText("Catch cats with your finger", w / 2, h * 0.45);
  ctx.font = "700 24px sans-serif";
  ctx.fillStyle = "#9efff0";
  ctx.fillText("Move them into the glowing glass", w / 2, h * 0.52);
  ctx.restore();
}

function loop(now) {
  const dt = Math.min(0.033, (now - state.lastTime) / 1000 || 0);
  state.lastTime = now;
  update(dt, now);
  render(now);
  requestAnimationFrame(loop);
}

function updateHud() {
  scoreEl.textContent = String(state.score);
  timeEl.textContent = String(Math.ceil(state.remaining));
}

function canvasWidth() {
  return canvas.clientWidth || innerWidth;
}

function canvasHeight() {
  return canvas.clientHeight || innerHeight;
}

function glassRect() {
  const w = canvasWidth();
  const h = canvasHeight();
  return {
    x: w * CONFIG.glass.x,
    y: h * CONFIG.glass.y,
    w: w * CONFIG.glass.w,
    h: h * CONFIG.glass.h,
  };
}

function toCanvasPoint(point) {
  return { x: point.x * canvasWidth(), y: point.y * canvasHeight() };
}

function pointInRect(point, rect) {
  return point.x > rect.x && point.x < rect.x + rect.w && point.y > rect.y && point.y < rect.y + rect.h;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function demoFinger(now) {
  const t = now * 0.0004;
  return {
    x: 0.22 + Math.sin(t) * 0.13,
    y: 0.5 + Math.cos(t * 1.7) * 0.18,
    active: true,
  };
}

function setPointerFromEvent(event) {
  if (!state.running) return;
  const rect = canvas.getBoundingClientRect();
  tracker.setPointerPoint({
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  });
}

startButton.addEventListener("click", startGame);
restartButton.addEventListener("click", restartGame);
canvas.addEventListener("pointerdown", (event) => {
  canvas.setPointerCapture?.(event.pointerId);
  setPointerFromEvent(event);
});
canvas.addEventListener("pointermove", setPointerFromEvent);
canvas.addEventListener("pointerup", () => tracker.setPointerPoint(null));
canvas.addEventListener("pointercancel", () => tracker.setPointerPoint(null));
addEventListener("resize", resizeCanvas);
resizeCanvas();
requestAnimationFrame(loop);

window.__gameTestApi = {
  start: startGame,
  restart: restartGame,
  end: endGame,
  setFinger(point) {
    tracker.setTestPoint(point);
  },
  clearFinger() {
    tracker.setTestPoint(null);
  },
  spawnCatAt(point) {
    const p = toCanvasPoint(point);
    return spawnCat({ x: p.x, y: p.y, vx: 0, vy: 0 }).id;
  },
  forceTime(seconds) {
    state.remaining = seconds;
  },
  snapshot() {
    return {
      running: state.running,
      gameOver: state.gameOver,
      score: state.score,
      cats: state.cats.length,
      pills: state.pills.length,
      trackerMode: state.trackerMode,
      grabbedCatId: state.grabbedCatId,
    };
  },
};
