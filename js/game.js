(function () {
  'use strict';

  const { Engine, World, Bodies, Body, Events, Composite, Vector, Runner } = Matter;

  // ======================== CONFIG ========================
  const CFG = {
    MAX_EMOJIS: 25,
    WARN_THRESHOLD: 21,
    WARN_DURATION: 5000,
    CLICK_COOLDOWN: 300,
    CLICK_IMPULSE_RANGE: 90,
    CLICK_SCALE: 1.25,
    CLICK_SCALE_MS: 200,
    CHAIN_WINDOW: 800,
    EMOTION_MAX: 150,
    EMOTION_MERGE: 3,
    EMOTION_CHAIN: 5,
    SPAWN_INIT_DELAY: 2800,
    SPAWN_MIN_DELAY: 1400,
    SPAWN_SPEED_FACTOR: 40,
    AUTO_LAUNCH_IDLE: 3000,
    MERGE_VEL_MIN: 0.8,
    GRAVITY: 0,
    BOUNCE_EMOJI: 0.9,
    BOUNCE_WALL: 1.0,
    FRICTION: 0.005,
    FRICTION_AIR: 0.003,
    WALL: 20,
    WALL_PAD: 4,
    ATTRACT_FORCE: 0.00012,
    ATTRACT_RANGE: 160,
    PARTICLE_LIFE: 500,
    PARTICLE_COUNT: 10,
    SPEED_DURATION: 2000,
    INITIAL_EMOJIS: 5,
    LAUNCH_SPEED_BASE: 10,
    LAUNCH_SPEED_RAND: 3,
    LAUNCH_ANGLE_SPREAD: 1.2,
    LAUNCH_JITTER_X: 30,
  };

  const LEVELS = [
    { lv: 1, emoji: '😀', r: 18, color: '#FFE066', glow: '#FFE06666' },
    { lv: 2, emoji: '😎', r: 23, color: '#63E6BE', glow: '#63E6BE66' },
    { lv: 3, emoji: '🤣', r: 28, color: '#74C0FC', glow: '#74C0FC66' },
    { lv: 4, emoji: '😍', r: 34, color: '#FF8787', glow: '#FF878766' },
    { lv: 5, emoji: '🤪', r: 40, color: '#DA77F2', glow: '#DA77F266' },
    { lv: 6, emoji: '😱', r: 47, color: '#FFA94D', glow: '#FFA94D66' },
    { lv: 7, emoji: '🤩', r: 54, color: '#A9E34B', glow: '#A9E34B66' },
    { lv: 8, emoji: '👻', r: 62, color: '#E599F7', glow: '#E599F766' },
    { lv: 9, emoji: '👑', r: 70, color: '#FFD43B', glow: '#FFD43B66' },
  ];

  const SKILLS = [
    { id: 'clear', icon: '🌪️', name: '清除风暴', desc: '清除5个最低等级表情' },
    { id: 'auto',  icon: '🔗', name: '自动合成', desc: '自动匹配合成3对同级表情' },
    { id: 'speed', icon: '⚡', name: '时间加速', desc: '全场加速2秒' },
  ];

  // ======================== STATE ========================
  const S = {
    score: 0,
    emotion: 0,
    chainCount: 0,
    chainTimer: null,
    lastClickTime: 0,
    warnActive: false,
    warnStart: 0,
    gameOver: false,
    paused: false,
    customEmojis: new Map(),
    customEmojisB64: new Map(),
    previewB64: null,
    selectedCustomLevel: 1,
    spawnTimer: 0,
    spawnDelay: CFG.SPAWN_INIT_DELAY,
    nextSpawnLevel: 1,
    input: { isDown: false, startX: 0, startY: 0, currX: 0, currY: 0, isAiming: false },
    maxLevel: 1,
    mergeCount: 0,
    burstCount: 0,
    startTime: 0,
    particles: [],
    emojiData: new Map(),
    mergeLock: new Set(),
    pendingMerges: [],
    shakeIntensity: 0,
    shakeEnd: 0,
    speedEnd: 0,
    comboTimer: null,
    ripples: [],
  };

  // ======================== DOM ========================
  const $ = (id) => document.getElementById(id);
  const dom = {
    app: $('app'),
    screenStart: $('screen-start'),
    screenGame: $('screen-game'),
    screenOver: $('screen-gameover'),
    canvas: $('game-canvas'),
    scoreVal: $('score-value'),
    emotionFill: $('emotion-fill'),
    emotionText: $('emotion-text'),
    emojiCount: $('emoji-count'),
    comboPopup: $('combo-popup'),
    levelPopup: $('level-popup'),
    warnOverlay: $('warning-overlay'),
    warnTimer: $('warning-timer'),
    btnBurst: $('btn-burst'),
    finalScore: $('final-score'),
    finalLevel: $('final-level'),
    finalMerges: $('final-merges'),
    finalTime: $('final-time'),
    modalCustom: $('modal-custom'),
    modalBurst: $('modal-burst'),
    previewCanvas: $('preview-canvas'),
    emojiUpload: $('emoji-upload'),
    skillChoices: $('skill-choices'),
  };

  let ctx, engine, world, runner;
  let W = 0, H = 0, dpr = 1;
  let walls = [];
  let emojiTextures = {};
  let customTextures = {};
  let animFrameId = null;

  // ======================== TEXTURE CACHE ========================
  function buildTexture(level) {
    const info = LEVELS[level - 1];
    const size = info.r * 2 + 8;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * dpr);
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const cx = size / 2, cy = size / 2;

    x.beginPath();
    x.arc(cx, cy, info.r, 0, Math.PI * 2);
    x.fillStyle = info.color;
    x.fill();
    x.strokeStyle = 'rgba(0,0,0,0.15)';
    x.lineWidth = 1.5;
    x.stroke();

    x.font = `${Math.round(info.r * 1.1)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(info.emoji, cx, cy + 1);

    return c;
  }

  function buildCustomTexture(img, level) {
    const r = LEVELS[level - 1].r;
    const size = r * 2 + 8;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(size * dpr);
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    const cx = size / 2, cy = size / 2;

    x.save();
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.clip();
    x.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    x.restore();

    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.strokeStyle = LEVELS[level - 1].color;
    x.lineWidth = 2;
    x.stroke();

    return c;
  }

  function initTextures() {
    for (let i = 1; i <= 9; i++) {
      emojiTextures[i] = buildTexture(i);
    }
    for (const [level, img] of S.customEmojis) {
      customTextures[level] = buildCustomTexture(img, level);
    }
  }

  // ======================== PHYSICS ========================
  function initPhysics() {
    engine = Engine.create({
      gravity: { x: 0, y: CFG.GRAVITY },
      constraintIterations: 3,
    });
    world = engine.world;

    createWalls();
    Events.on(engine, 'collisionStart', onCollision);
  }

  function createWalls() {
    walls.forEach(w => World.remove(world, w));
    walls = [];
    const t = CFG.WALL;
    const p = CFG.WALL_PAD;
    const opts = { isStatic: true, friction: 0.01, restitution: CFG.BOUNCE_WALL, label: 'wall' };
    walls.push(
      Bodies.rectangle(W / 2, H - p + t / 2, W + t * 2, t, opts),   // bottom
      Bodies.rectangle(p - t / 2, H / 2, t, H * 2, opts),           // left
      Bodies.rectangle(W - p + t / 2, H / 2, t, H * 2, opts),       // right
      Bodies.rectangle(W / 2, p - t / 2, W + t * 2, t, opts),       // top
    );
    World.add(world, walls);
  }

  // ======================== EMOJI BODIES ========================
  function createEmoji(x, y, level, velocityX, velocityY) {
    const info = LEVELS[level - 1];
    const body = Bodies.circle(x, y, info.r, {
      restitution: CFG.BOUNCE_EMOJI,
      friction: CFG.FRICTION,
      frictionAir: CFG.FRICTION_AIR,
      density: 0.001 * (1 + level * 0.5),
      label: 'emoji',
    });
    if (velocityX !== undefined) {
      Body.setVelocity(body, { x: velocityX || 0, y: velocityY || 0 });
    }
    World.add(world, body);
    S.emojiData.set(body.id, {
      level,
      body,
      clickTime: 0,
      clickScale: 1,
      born: performance.now(),
    });
    return body;
  }

  function getLaunchSpeed(level) {
    const base = CFG.LAUNCH_SPEED_BASE * (1 - (level - 1) * 0.07);
    const rand = (Math.random() - 0.5) * 2 * CFG.LAUNCH_SPEED_RAND;
    return Math.max(3, base + rand);
  }

  function launchEmoji(level, angle, useJitter = true) {
    const cx = W / 2 + (useJitter ? (Math.random() - 0.5) * CFG.LAUNCH_JITTER_X * 2 : 0);
    const r = LEVELS[level - 1].r;
    const cy = H - CFG.WALL_PAD - r - 5;
    if (angle === undefined) {
      angle = -Math.PI / 2 + (Math.random() - 0.5) * CFG.LAUNCH_ANGLE_SPREAD * 2;
    }
    const speed = getLaunchSpeed(level);
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;
    return createEmoji(cx, cy, level, vx, vy);
  }

  function doLaunch(angle) {
    launchEmoji(S.nextSpawnLevel, angle, false);
    S.spawnTimer = performance.now();
    S.spawnDelay = Math.max(CFG.SPAWN_MIN_DELAY,
      CFG.SPAWN_INIT_DELAY - Math.floor(S.score / 100) * CFG.SPAWN_SPEED_FACTOR);
    S.nextSpawnLevel = getSpawnLevel();
  }

  function removeEmoji(bodyId) {
    const data = S.emojiData.get(bodyId);
    if (!data) return;
    World.remove(world, data.body);
    S.emojiData.delete(bodyId);
  }

  // ======================== COLLISION → MERGE ========================
  function onCollision(event) {
    const pairs = event.pairs;
    for (let i = 0; i < pairs.length; i++) {
      const { bodyA, bodyB } = pairs[i];
      if (S.mergeLock.has(bodyA.id) || S.mergeLock.has(bodyB.id)) continue;

      const a = S.emojiData.get(bodyA.id);
      const b = S.emojiData.get(bodyB.id);
      if (!a || !b) continue;
      if (a.level !== b.level) continue;
      if (a.level >= 9) continue;

      const relVel = Vector.magnitude(Vector.sub(bodyA.velocity, bodyB.velocity));
      if (relVel < CFG.MERGE_VEL_MIN) continue;

      S.mergeLock.add(bodyA.id);
      S.mergeLock.add(bodyB.id);
      S.pendingMerges.push({
        idA: bodyA.id,
        idB: bodyB.id,
        posA: { ...bodyA.position },
        posB: { ...bodyB.position },
        level: a.level,
      });
    }
  }

  function processMerges() {
    if (S.pendingMerges.length === 0) return;
    const merges = S.pendingMerges.splice(0);
    for (const m of merges) {
      if (!S.emojiData.has(m.idA) || !S.emojiData.has(m.idB)) {
        S.mergeLock.delete(m.idA);
        S.mergeLock.delete(m.idB);
        continue;
      }
      const mx = (m.posA.x + m.posB.x) / 2;
      const my = (m.posA.y + m.posB.y) / 2;
      const newLv = m.level + 1;

      removeEmoji(m.idA);
      removeEmoji(m.idB);
      createEmoji(mx, my, newLv);

      spawnParticles(mx, my, LEVELS[newLv - 1].color, CFG.PARTICLE_COUNT);
      addScore(newLv);
      advanceChain();
      addEmotion(CFG.EMOTION_MERGE);

      S.mergeCount++;
      if (newLv > S.maxLevel) {
        S.maxLevel = newLv;
        showLevelUp(newLv);
      }
      if (newLv >= 7) triggerShake(3 + newLv);

      S.mergeLock.delete(m.idA);
      S.mergeLock.delete(m.idB);
    }
  }

  // ======================== SCORE ========================
  function addScore(level) {
    let base = level * 10;
    let mult = 1;
    if (S.chainCount >= 4) mult = 3;
    else if (S.chainCount === 3) mult = 2;
    else if (S.chainCount === 2) mult = 1.5;
    S.score += Math.round(base * mult);
  }

  // ======================== CHAIN SYSTEM ========================
  function advanceChain() {
    S.chainCount++;
    if (S.chainTimer) clearTimeout(S.chainTimer);
    S.chainTimer = setTimeout(resetChain, CFG.CHAIN_WINDOW);

    addEmotion(CFG.EMOTION_CHAIN);

    if (S.chainCount >= 2) {
      showCombo(S.chainCount);
    }
    if (S.chainCount >= 4) {
      applyGlobalAcceleration();
    }
  }

  function resetChain() {
    S.chainCount = 0;
    S.chainTimer = null;
  }

  function applyGlobalAcceleration() {
    for (const [, data] of S.emojiData) {
      const b = data.body;
      const dir = Vector.normalise(b.velocity);
      Body.applyForce(b, b.position, { x: dir.x * 0.003, y: dir.y * 0.003 });
    }
  }

  // ======================== EMOTION BURST ========================
  function addEmotion(amt) {
    S.emotion = Math.min(CFG.EMOTION_MAX, S.emotion + amt);
    dom.btnBurst.disabled = S.emotion < CFG.EMOTION_MAX;
  }

  function showBurstModal() {
    if (S.emotion < CFG.EMOTION_MAX) return;
    S.paused = true;
    dom.modalBurst.classList.remove('hidden');

    const indices = [];
    const pool = [0, 1, 2];
    while (indices.length < 3 && pool.length > 0) {
      const idx = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      indices.push(idx);
    }

    dom.skillChoices.innerHTML = '';
    indices.forEach(i => {
      const sk = SKILLS[i];
      const btn = document.createElement('button');
      btn.className = 'skill-btn';
      btn.innerHTML = `
        <span class="skill-emoji">${sk.icon}</span>
        <div class="skill-info">
          <span class="skill-name">${sk.name}</span>
          <span class="skill-desc">${sk.desc}</span>
        </div>`;
      btn.addEventListener('click', () => executeBurst(sk.id));
      dom.skillChoices.appendChild(btn);
    });
  }

  function executeBurst(skillId) {
    dom.modalBurst.classList.add('hidden');
    S.paused = false;
    S.emotion = 0;
    S.burstCount++;
    dom.btnBurst.disabled = true;

    switch (skillId) {
      case 'clear': burstClear(); break;
      case 'auto':  burstAutoMerge(); break;
      case 'speed': burstSpeed(); break;
    }
  }

  function burstClear() {
    const sorted = [...S.emojiData.entries()].sort((a, b) => a[1].level - b[1].level);
    const toRemove = sorted.slice(0, 5);
    for (const [id, data] of toRemove) {
      spawnParticles(data.body.position.x, data.body.position.y, '#ef4444', 6);
      removeEmoji(id);
    }
    triggerShake(8);
  }

  function burstAutoMerge() {
    const byLevel = {};
    for (const [id, data] of S.emojiData) {
      if (data.level >= 9) continue;
      if (!byLevel[data.level]) byLevel[data.level] = [];
      byLevel[data.level].push(id);
    }
    let merged = 0;
    for (const lv in byLevel) {
      const ids = byLevel[lv];
      while (ids.length >= 2 && merged < 3) {
        const id1 = ids.shift();
        const id2 = ids.shift();
        const d1 = S.emojiData.get(id1);
        const d2 = S.emojiData.get(id2);
        if (!d1 || !d2) continue;
        const mx = (d1.body.position.x + d2.body.position.x) / 2;
        const my = (d1.body.position.y + d2.body.position.y) / 2;
        const newLv = d1.level + 1;
        removeEmoji(id1);
        removeEmoji(id2);
        createEmoji(mx, my, newLv);
        spawnParticles(mx, my, LEVELS[newLv - 1].color, 8);
        addScore(newLv);
        S.mergeCount++;
        if (newLv > S.maxLevel) S.maxLevel = newLv;
        merged++;
      }
      if (merged >= 3) break;
    }
  }

  function burstSpeed() {
    S.speedEnd = performance.now() + CFG.SPEED_DURATION;
  }

  // ======================== CRASH SYSTEM ========================
  function checkCrash(now) {
    const count = S.emojiData.size;
    if (count > CFG.MAX_EMOJIS) {
      if (!S.warnActive) {
        S.warnActive = true;
        S.warnStart = now;
        dom.warnOverlay.classList.remove('hidden');
      }
      const elapsed = now - S.warnStart;
      const remain = Math.max(0, Math.ceil((CFG.WARN_DURATION - elapsed) / 1000));
      dom.warnTimer.textContent = remain;
      if (elapsed >= CFG.WARN_DURATION) {
        endGame();
      }
    } else {
      if (S.warnActive) {
        S.warnActive = false;
        dom.warnOverlay.classList.add('hidden');
      }
    }

    if (count > CFG.WARN_THRESHOLD) {
      applyAttraction();
    }
  }

  function applyAttraction() {
    const entries = [...S.emojiData.values()];
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (entries[i].level !== entries[j].level) continue;
        const a = entries[i].body;
        const b = entries[j].body;
        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0 && dist < CFG.ATTRACT_RANGE) {
          const f = CFG.ATTRACT_FORCE;
          const nx = dx / dist, ny = dy / dist;
          Body.applyForce(a, a.position, { x: nx * f, y: ny * f });
          Body.applyForce(b, b.position, { x: -nx * f, y: -ny * f });
        }
      }
    }
  }

  // ======================== SPAWNING ========================
  function checkAutoLaunch(now) {
    if (S.emojiData.size >= CFG.MAX_EMOJIS + 3) return;
    if (now - S.spawnTimer > S.spawnDelay + CFG.AUTO_LAUNCH_IDLE) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * CFG.LAUNCH_ANGLE_SPREAD * 2;
      doLaunch(angle);
    }
  }

  function getSpawnLevel() {
    const r = Math.random();
    if (S.score < 200) return 1;
    if (S.score < 500) return r < 0.8 ? 1 : 2;
    if (S.score < 1000) return r < 0.6 ? 1 : r < 0.9 ? 2 : 3;
    return r < 0.5 ? 1 : r < 0.85 ? 2 : 3;
  }

  // ======================== CLICK / TAP ========================
  function handleClick(px, py) {
    if (S.gameOver || S.paused) return;
    const now = performance.now();
    if (now - S.lastClickTime < CFG.CLICK_COOLDOWN) return;

    let clicked = null;
    let clickedData = null;
    for (const [id, data] of S.emojiData) {
      const b = data.body;
      const dx = b.position.x - px;
      const dy = b.position.y - py;
      const r = LEVELS[data.level - 1].r;
      if (dx * dx + dy * dy < r * r * 1.2) {
        clicked = b;
        clickedData = data;
        break;
      }
    }
    if (!clicked) return;
    S.lastClickTime = now;

    clickedData.clickTime = now;
    clickedData.clickScale = CFG.CLICK_SCALE;

    S.ripples.push({ x: clicked.position.x, y: clicked.position.y, r: 0, maxR: CFG.CLICK_IMPULSE_RANGE, life: 400, maxLife: 400, color: LEVELS[clickedData.level - 1].color });

    const randAngle = Math.random() * Math.PI * 2;
    Body.applyForce(clicked, clicked.position, {
      x: Math.cos(randAngle) * 0.008,
      y: Math.sin(randAngle) * 0.008,
    });

    for (const [id, data] of S.emojiData) {
      const b = data.body;
      if (b === clicked) continue;
      const dx = b.position.x - clicked.position.x;
      const dy = b.position.y - clicked.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0 && dist < CFG.CLICK_IMPULSE_RANGE) {
        const strength = 0.08 * (1 - dist / CFG.CLICK_IMPULSE_RANGE);
        Body.applyForce(b, b.position, {
          x: (dx / dist) * strength,
          y: (dy / dist) * strength,
        });
      }
    }
  }

  // ======================== PARTICLES ========================
  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 1.5 + Math.random() * 3;
      S.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: 2 + Math.random() * 3,
        color,
        life: CFG.PARTICLE_LIFE,
        maxLife: CFG.PARTICLE_LIFE,
      });
    }
  }

  function updateParticles(dt) {
    for (let i = S.particles.length - 1; i >= 0; i--) {
      const p = S.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.97;
      p.vy *= 0.97;
      p.life -= dt;
      if (p.life <= 0) S.particles.splice(i, 1);
    }
  }

  // ======================== SCREEN SHAKE ========================
  function triggerShake(intensity) {
    S.shakeIntensity = intensity;
    S.shakeEnd = performance.now() + 300;
  }

  function getShakeOffset(now) {
    if (now > S.shakeEnd) return { x: 0, y: 0 };
    const t = (S.shakeEnd - now) / 300;
    const i = S.shakeIntensity * t;
    return {
      x: (Math.random() - 0.5) * i * 2,
      y: (Math.random() - 0.5) * i * 2,
    };
  }

  // ======================== RENDERING ========================
  function render(now) {
    ctx.clearRect(0, 0, W, H);

    const shake = getShakeOffset(now);
    ctx.save();
    ctx.translate(shake.x, shake.y);

    drawContainer();
    drawAiming(now);
    drawEmojis(now);
    drawRipples();
    drawParticles();

    ctx.restore();
  }

  function drawContainer() {
    const bgGrd = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    bgGrd.addColorStop(0, 'rgba(35, 28, 70, 0.4)');
    bgGrd.addColorStop(1, 'rgba(15, 14, 23, 0)');
    ctx.fillStyle = bgGrd;
    ctx.fillRect(0, 0, W, H);

    const p = CFG.WALL_PAD;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.strokeRect(p, p, W - p * 2, H - p * 2);

    // launch zone glow at bottom center
    const glowGrd = ctx.createRadialGradient(W / 2, H - p, 0, W / 2, H - p, 60);
    glowGrd.addColorStop(0, 'rgba(255, 137, 6, 0.12)');
    glowGrd.addColorStop(1, 'rgba(255, 137, 6, 0)');
    ctx.fillStyle = glowGrd;
    ctx.fillRect(W / 2 - 60, H - p - 60, 120, 60);
  }

  function drawAiming(now) {
    if (S.paused || S.gameOver) return;

    const cx = W / 2;
    const r = LEVELS[S.nextSpawnLevel - 1].r;
    const cy = H - CFG.WALL_PAD - r - 5;

    const timeSinceLastLaunch = now - S.spawnTimer;
    const cooldownProgress = Math.min(1, timeSinceLastLaunch / S.spawnDelay);
    const isReady = cooldownProgress >= 1;

    // Draw trajectory line whenever aiming, regardless of cooldown
    if (S.input.isAiming) {
      const dx = S.input.currX - cx;
      const dy = S.input.currY - cy;
      let angle = Math.atan2(dy, dx);
      if (angle > -0.1 && angle < Math.PI / 2) angle = -0.1;
      if (angle >= Math.PI / 2 || angle < -Math.PI + 0.1) angle = -Math.PI + 0.1;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * 150, cy + Math.sin(angle) * 150);

      const grad = ctx.createLinearGradient(cx, cy, cx + Math.cos(angle) * 150, cy + Math.sin(angle) * 150);
      grad.addColorStop(0, `rgba(255, 255, 255, ${isReady ? 0.9 : 0.4})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = isReady ? 4 : 2;
      ctx.lineCap = 'round';
      ctx.setLineDash([8, 12]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = 'butt';
    }

    // Draw the preview emoji — quick pop-in only during cooldown
    const info = LEVELS[S.nextSpawnLevel - 1];
    const POPIN_MS = 150;
    const popProgress = Math.min(1, timeSinceLastLaunch / POPIN_MS);
    const scale = 0.6 + 0.4 * popProgress;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.4 + 0.6 * popProgress;

    const tex = customTextures[S.nextSpawnLevel] || emojiTextures[S.nextSpawnLevel];
    if (tex) {
      const drawSize = r * 2 + 8;
      ctx.drawImage(tex, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = info.color;
      ctx.fill();
    }
    ctx.restore();

    // Auto-launch countdown circle — only after ready
    if (isReady && S.emojiData.size < CFG.MAX_EMOJIS + 3) {
      const idleTime = timeSinceLastLaunch - S.spawnDelay;
      const autoProgress = Math.min(1, Math.max(0, idleTime / CFG.AUTO_LAUNCH_IDLE));

      if (autoProgress > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * autoProgress);
        ctx.strokeStyle = autoProgress > 0.75 ? '#ef4444' : '#63E6BE';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }
  }

  function drawEmojis(now) {
    for (const [id, data] of S.emojiData) {
      const b = data.body;
      const info = LEVELS[data.level - 1];
      let scale = 1;
      if (data.clickTime > 0) {
        const elapsed = now - data.clickTime;
        if (elapsed < CFG.CLICK_SCALE_MS) {
          const t = elapsed / CFG.CLICK_SCALE_MS;
          scale = 1 + (data.clickScale - 1) * (1 - t);
        } else {
          data.clickScale = 1;
          data.clickTime = 0;
        }
      }

      const px = b.position.x;
      const py = b.position.y;
      const r = info.r;

      if (scale > 1.01) {
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        ctx.arc(px, py, r * scale * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = info.color;
        ctx.fill();
        ctx.restore();
      }

      const tex = customTextures[data.level] || emojiTextures[data.level];
      if (tex) {
        const drawSize = (r * 2 + 8) * scale;
        ctx.drawImage(tex,
          px - drawSize / 2,
          py - drawSize / 2,
          drawSize, drawSize
        );
      } else {
        ctx.beginPath();
        ctx.arc(px, py, r * scale, 0, Math.PI * 2);
        ctx.fillStyle = info.color;
        ctx.fill();
      }
    }
  }

  function drawParticles() {
    for (const p of S.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRipples() {
    for (const rp of S.ripples) {
      const t = 1 - rp.life / rp.maxLife;
      const radius = rp.maxR * t;
      const alpha = 0.3 * (1 - t);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = rp.color;
      ctx.lineWidth = 2 * (1 - t) + 0.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function updateRipples(dt) {
    for (let i = S.ripples.length - 1; i >= 0; i--) {
      S.ripples[i].life -= dt;
      if (S.ripples[i].life <= 0) S.ripples.splice(i, 1);
    }
  }

  // ======================== UI ========================
  function updateUI() {
    dom.scoreVal.textContent = S.score;
    const emotionPct = Math.round((S.emotion / CFG.EMOTION_MAX) * 100);
    dom.emotionFill.style.width = emotionPct + '%';
    dom.emotionText.textContent = S.emotion;
    dom.emojiCount.textContent = S.emojiData.size;

    const countEl = dom.emojiCount.parentElement;
    if (S.emojiData.size > CFG.WARN_THRESHOLD) {
      countEl.style.color = '#ef4444';
    } else {
      countEl.style.color = '';
    }
  }

  function showCombo(count) {
    let text, style;
    if (count >= 4) {
      text = `🔥 ×${count} 连锁!`;
    } else {
      text = `×${count} 连锁`;
    }
    dom.comboPopup.textContent = text;
    dom.comboPopup.classList.remove('hidden');
    dom.comboPopup.classList.remove('show');
    void dom.comboPopup.offsetWidth;
    dom.comboPopup.classList.add('show');
    clearTimeout(S.comboTimer);
    S.comboTimer = setTimeout(() => {
      dom.comboPopup.classList.add('hidden');
      dom.comboPopup.classList.remove('show');
    }, 700);
  }

  function showLevelUp(level) {
    const emoji = LEVELS[level - 1].emoji;
    dom.levelPopup.textContent = `${emoji} Lv.${level}!`;
    dom.levelPopup.classList.remove('hidden');
    dom.levelPopup.classList.remove('show');
    void dom.levelPopup.offsetWidth;
    dom.levelPopup.classList.add('show');
    setTimeout(() => {
      dom.levelPopup.classList.add('hidden');
      dom.levelPopup.classList.remove('show');
    }, 900);
  }

  // ======================== CUSTOM EMOJI ========================
  function loadCustomEmojis() {
    try {
      const oldStored = localStorage.getItem('customEmoji');
      if (oldStored) {
        localStorage.setItem('customEmoji_1', oldStored);
        localStorage.removeItem('customEmoji');
      }
      for (let i = 1; i <= 9; i++) {
        const stored = localStorage.getItem('customEmoji_' + i);
        if (!stored) continue;
        S.customEmojisB64.set(i, stored);
        const img = new Image();
        const lv = i;
        img.onload = () => {
          S.customEmojis.set(lv, img);
          customTextures[lv] = buildCustomTexture(img, lv);
        };
        img.src = stored;
      }
    } catch (e) {}
  }

  function processUpload(file) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const cx = c.getContext('2d');
        const size = Math.min(img.width, img.height);
        const sx = (img.width - size) / 2;
        const sy = (img.height - size) / 2;
        cx.beginPath();
        cx.arc(64, 64, 64, 0, Math.PI * 2);
        cx.clip();
        cx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128);

        const b64 = c.toDataURL('image/jpeg', 0.7);
        if (b64.length > 120000) {
          alert('图片过大，请选择较小的图片');
          return;
        }
        S.previewB64 = b64;
        const prev = new Image();
        prev.onload = () => drawPreview(prev);
        prev.src = b64;
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function drawPreview(img) {
    const pc = dom.previewCanvas;
    const cx = pc.getContext('2d');
    cx.clearRect(0, 0, 128, 128);
    cx.save();
    cx.beginPath();
    cx.arc(64, 64, 60, 0, Math.PI * 2);
    cx.clip();
    cx.drawImage(img, 4, 4, 120, 120);
    cx.restore();
    cx.beginPath();
    cx.arc(64, 64, 60, 0, Math.PI * 2);
    cx.strokeStyle = LEVELS[S.selectedCustomLevel - 1].color;
    cx.lineWidth = 3;
    cx.stroke();
  }

  function drawDefaultPreview(level) {
    const pc = dom.previewCanvas;
    const cx = pc.getContext('2d');
    cx.clearRect(0, 0, 128, 128);
    cx.font = '60px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(LEVELS[level - 1].emoji, 64, 68);
    cx.beginPath();
    cx.arc(64, 64, 60, 0, Math.PI * 2);
    cx.strokeStyle = LEVELS[level - 1].color;
    cx.lineWidth = 3;
    cx.stroke();
  }

  function saveCustomEmoji() {
    const b64 = S.previewB64;
    const level = S.selectedCustomLevel;
    if (!b64) return;
    try {
      localStorage.setItem('customEmoji_' + level, b64);
    } catch (e) {
      alert('存储空间不足');
      return;
    }
    S.customEmojisB64.set(level, b64);
    const img = new Image();
    img.onload = () => {
      S.customEmojis.set(level, img);
      customTextures[level] = buildCustomTexture(img, level);
      updateLevelSelector();
    };
    img.src = b64;
    hideModal('custom');
  }

  function clearCustomEmoji() {
    const level = S.selectedCustomLevel;
    try { localStorage.removeItem('customEmoji_' + level); } catch (e) {}
    S.customEmojis.delete(level);
    S.customEmojisB64.delete(level);
    delete customTextures[level];
    S.previewB64 = null;
    drawDefaultPreview(level);
    updateLevelSelector();
  }

  function renderLevelSelector() {
    const container = document.getElementById('level-selector');
    container.innerHTML = '';
    for (let i = 1; i <= 9; i++) {
      const slot = document.createElement('div');
      slot.className = 'level-slot'
        + (i === S.selectedCustomLevel ? ' selected' : '')
        + (S.customEmojis.has(i) ? ' has-custom' : '');
      slot.textContent = LEVELS[i - 1].emoji;
      slot.dataset.level = i;
      slot.addEventListener('click', () => selectCustomLevel(i));
      container.appendChild(slot);
    }
  }

  function selectCustomLevel(level) {
    S.selectedCustomLevel = level;
    S.previewB64 = null;
    updateLevelSelector();
    if (S.customEmojis.has(level)) {
      drawPreview(S.customEmojis.get(level));
    } else {
      drawDefaultPreview(level);
    }
  }

  function updateLevelSelector() {
    const slots = document.querySelectorAll('.level-slot');
    slots.forEach(slot => {
      const lv = parseInt(slot.dataset.level);
      slot.classList.toggle('selected', lv === S.selectedCustomLevel);
      slot.classList.toggle('has-custom', S.customEmojis.has(lv));
    });
  }

  // ======================== SHARE ========================
  function captureScreenshot() {
    return new Promise((resolve) => {
      try {
        dom.canvas.toBlob((blob) => resolve(blob), 'image/png');
      } catch (e) {
        resolve(null);
      }
    });
  }

  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  function saveScreenshot(blob) {
    if (isMobile) {
      showScreenshotPreview(blob);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `表情乱碰_${S.score}分_${new Date().toISOString().slice(0,19).replace(/[T:]/g,'-')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
  }

  function showScreenshotPreview(blob) {
    const modal = $('modal-screenshot');
    const img = $('screenshot-img');
    const oldUrl = img.src;
    if (oldUrl && oldUrl.startsWith('blob:')) URL.revokeObjectURL(oldUrl);
    img.src = URL.createObjectURL(blob);
    modal.classList.remove('hidden');

    const closeBtn = $('btn-screenshot-close');
    const backdrop = modal.querySelector('.modal-backdrop');
    const close = () => {
      modal.classList.add('hidden');
      S.paused = false;
    };
    closeBtn.onclick = close;
    backdrop.onclick = close;
  }

  async function shareResult() {
    const url = location.href;
    const shareText = `🎮 表情乱碰 | 得分 ${S.score} | 最高 Lv.${S.maxLevel} | 合成 ${S.mergeCount}次\n我把自己合成封神了，你敢试吗？\n${url}`;

    const blob = await captureScreenshot();

    // Web Share API —— 优先携带截图文件
    if (navigator.share) {
      if (blob && navigator.canShare) {
        const file = new File([blob], 'emoji-bump.png', { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ title: '表情乱碰', text: shareText, url, files: [file] });
            return;
          } catch (e) { /* 用户取消或不支持，继续降级 */ }
        }
      }
      try {
        await navigator.share({ title: '表情乱碰', text: shareText, url });
        if (blob) saveScreenshot(blob);
        return;
      } catch (e) { /* 继续降级 */ }
    }

    // 微信 JSSDK
    if (typeof wx !== 'undefined' && wx.ready) {
      wx.ready(() => {
        wx.updateAppMessageShareData({
          title: '表情乱碰 - 我得了' + S.score + '分!',
          desc: '我把自己合成封神了，你敢试吗？',
          link: url,
          imgUrl: blob ? URL.createObjectURL(blob) : '',
        });
      });
      if (blob) saveScreenshot(blob);
      return;
    }

    // 兜底：截图保存 + 复制战绩链接到剪贴板
    try {
      await navigator.clipboard.writeText(shareText);
    } catch (e) { /* 忽略 */ }
    if (blob) {
      saveScreenshot(blob);
    } else {
      alert(shareText);
    }
  }

  // ======================== SCREEN MANAGEMENT ========================
  function showScreen(name) {
    [dom.screenStart, dom.screenGame, dom.screenOver].forEach(s =>
      s.classList.remove('active'));
    switch (name) {
      case 'start': dom.screenStart.classList.add('active'); break;
      case 'game':  dom.screenGame.classList.add('active'); break;
      case 'over':  dom.screenOver.classList.add('active'); break;
    }
  }

  function showModal(name) {
    S.paused = true;
    if (name === 'custom') {
      dom.modalCustom.classList.remove('hidden');
      renderLevelSelector();
      if (S.customEmojis.has(S.selectedCustomLevel)) {
        drawPreview(S.customEmojis.get(S.selectedCustomLevel));
      } else {
        drawDefaultPreview(S.selectedCustomLevel);
      }
    }
    if (name === 'burst') showBurstModal();
  }

  function hideModal(name) {
    if (name === 'custom') dom.modalCustom.classList.add('hidden');
    if (name === 'burst') dom.modalBurst.classList.add('hidden');
    S.paused = false;
  }

  // ======================== GAME FLOW ========================
  function startGame() {
    resetState();
    showScreen('game');
    resizeCanvas();
    initPhysics();
    initTextures();

    S.startTime = performance.now();
    S.spawnTimer = S.startTime;

    for (let i = 0; i < CFG.INITIAL_EMOJIS; i++) {
      setTimeout(() => {
        if (!S.gameOver) launchEmoji(1);
      }, i * 300);
    }

    S.gameOver = false;
    lastFrameTime = performance.now();
    gameLoop(lastFrameTime);
  }

  function resetState() {
    if (engine) {
      Events.off(engine, 'collisionStart', onCollision);
      Engine.clear(engine);
    }
    if (animFrameId) cancelAnimationFrame(animFrameId);

    S.score = 0;
    S.emotion = 0;
    S.chainCount = 0;
    if (S.chainTimer) clearTimeout(S.chainTimer);
    S.chainTimer = null;
    S.lastClickTime = 0;
    S.warnActive = false;
    S.gameOver = false;
    S.paused = false;
    S.spawnDelay = CFG.SPAWN_INIT_DELAY;
    S.nextSpawnLevel = 1;
    S.input = { isDown: false, startX: 0, startY: 0, currX: 0, currY: 0, isAiming: false };
    S.maxLevel = 1;
    S.mergeCount = 0;
    S.burstCount = 0;
    S.particles = [];
    S.ripples = [];
    S.emojiData.clear();
    S.mergeLock.clear();
    S.pendingMerges = [];
    S.shakeIntensity = 0;
    S.speedEnd = 0;

    dom.warnOverlay.classList.add('hidden');
    dom.comboPopup.classList.add('hidden');
    dom.levelPopup.classList.add('hidden');
    dom.btnBurst.disabled = true;
  }

  function endGame() {
    S.gameOver = true;
    if (animFrameId) cancelAnimationFrame(animFrameId);

    const dur = Math.round((performance.now() - S.startTime) / 1000);
    dom.finalScore.textContent = S.score;
    dom.finalLevel.textContent = 'Lv.' + S.maxLevel + ' ' + LEVELS[S.maxLevel - 1].emoji;
    dom.finalMerges.textContent = S.mergeCount;
    dom.finalTime.textContent = dur + 's';

    setTimeout(() => showScreen('over'), 600);
  }

  // ======================== KEEP-ALIVE NUDGE ========================
  function nudgeSlowEmojis() {
    for (const [, data] of S.emojiData) {
      const b = data.body;
      const speed = Vector.magnitude(b.velocity);
      if (speed < 0.8) {
        const angle = Math.random() * Math.PI * 2;
        Body.applyForce(b, b.position, {
          x: Math.cos(angle) * 0.0004,
          y: Math.sin(angle) * 0.0004,
        });
      }
    }
  }

  // ======================== GAME LOOP ========================
  let lastFrameTime = 0;
  let frameSkip = false;

  function gameLoop(timestamp) {
    if (S.gameOver) return;
    animFrameId = requestAnimationFrame(gameLoop);

    const dt = Math.min(timestamp - lastFrameTime, 33);
    lastFrameTime = timestamp;

    if (S.paused) {
      render(timestamp);
      return;
    }

    // FPS throttle: skip every other render frame when stressed
    const stressed = S.emojiData.size > CFG.WARN_THRESHOLD;
    if (stressed) {
      frameSkip = !frameSkip;
    } else {
      frameSkip = false;
    }

    const isFast = timestamp < S.speedEnd;
    const engineDt = isFast ? dt * 2.5 : dt;
    Engine.update(engine, engineDt);

    nudgeSlowEmojis();
    processMerges();
    checkAutoLaunch(timestamp);
    checkCrash(timestamp);
    updateParticles(dt);
    updateRipples(dt);

    if (!frameSkip) {
      updateUI();
      render(timestamp);
    }
  }

  // ======================== CANVAS RESIZE ========================
  function resizeCanvas() {
    const canvas = dom.canvas;
    const parent = canvas.parentElement;
    const topBar = document.getElementById('hud-top');
    const bottomBar = document.getElementById('hud-bottom');
    const topH = topBar ? topBar.offsetHeight : 52;
    const bottomH = bottomBar ? bottomBar.offsetHeight : 60;

    const availW = parent.clientWidth;
    const availH = parent.clientHeight - topH - bottomH;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = availW + 'px';
    canvas.style.height = availH + 'px';
    canvas.width = Math.round(availW * dpr);
    canvas.height = Math.round(availH * dpr);

    W = availW;
    H = availH;

    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    if (engine) {
      createWalls();
      initTextures();
    }
  }

  // ======================== EVENT BINDINGS ========================
  function bindEvents() {
    $('btn-start').addEventListener('click', startGame);
    $('btn-restart').addEventListener('click', startGame);

    $('btn-custom-start').addEventListener('click', () => showModal('custom'));
    $('btn-custom-game').addEventListener('click', () => showModal('custom'));

    $('btn-burst').addEventListener('click', () => showModal('burst'));

    $('btn-share').addEventListener('click', shareResult);
    $('btn-share-result').addEventListener('click', shareResult);

    $('btn-save-emoji').addEventListener('click', saveCustomEmoji);
    $('btn-clear-emoji').addEventListener('click', clearCustomEmoji);
    $('btn-cancel-emoji').addEventListener('click', () => hideModal('custom'));

    dom.modalCustom.querySelector('.modal-backdrop').addEventListener('click', () => hideModal('custom'));
    dom.modalBurst.querySelector('.modal-backdrop').addEventListener('click', () => hideModal('burst'));

    dom.emojiUpload.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) processUpload(e.target.files[0]);
    });

    const canvas = dom.canvas;

    function handlePointerDown(x, y) {
      if (S.gameOver || S.paused) return;
      S.input.isDown = true;
      S.input.startX = x;
      S.input.startY = y;
      S.input.currX = x;
      S.input.currY = y;
      S.input.isAiming = true;
    }

    function handlePointerMove(x, y) {
      if (!S.input.isDown) return;
      S.input.currX = x;
      S.input.currY = y;
    }

    function handlePointerUp(x, y) {
      if (!S.input.isDown) return;
      S.input.isDown = false;
      S.input.isAiming = false;

      const dx = x - S.input.startX;
      const dy = y - S.input.startY;
      const isDrag = (dx * dx + dy * dy > 25);

      let clickedEmoji = false;
      if (!isDrag) {
        for (const [id, data] of S.emojiData) {
          const b = data.body;
          const edx = b.position.x - S.input.startX;
          const edy = b.position.y - S.input.startY;
          const r = LEVELS[data.level - 1].r;
          if (edx * edx + edy * edy < r * r * 1.2) {
            clickedEmoji = true;
            break;
          }
        }
      }

      if (!isDrag && clickedEmoji) {
        handleClick(x, y);
      } else {
        if (S.emojiData.size >= CFG.MAX_EMOJIS + 3) return;
        
        const cx = W / 2;
        const cy = H - CFG.WALL_PAD - LEVELS[S.nextSpawnLevel - 1].r - 5;
        let aimDx = x - cx;
        let aimDy = y - cy;
        let angle = Math.atan2(aimDy, aimDx);
        
        if (angle > -0.1 && angle < Math.PI / 2) angle = -0.1;
        if (angle >= Math.PI / 2 || angle < -Math.PI + 0.1) angle = -Math.PI + 0.1;

        doLaunch(angle);
      }
    }

    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      handlePointerDown(t.clientX - rect.left, t.clientY - rect.top);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      handlePointerMove(t.clientX - rect.left, t.clientY - rect.top);
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0] || { clientX: S.input.currX, clientY: S.input.currY };
      const rect = canvas.getBoundingClientRect();
      let x = t.clientX;
      let y = t.clientY;
      if (t.clientX === undefined) { // fallback
        x = S.input.currX + rect.left;
        y = S.input.currY + rect.top;
      }
      handlePointerUp(x - rect.left, y - rect.top);
    });

    canvas.addEventListener('mousedown', (e) => {
      const rect = canvas.getBoundingClientRect();
      handlePointerDown(e.clientX - rect.left, e.clientY - rect.top);
    });

    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      handlePointerMove(e.clientX - rect.left, e.clientY - rect.top);
    });

    window.addEventListener('mouseup', (e) => {
      if (!S.input.isDown) return;
      const rect = canvas.getBoundingClientRect();
      handlePointerUp(e.clientX - rect.left, e.clientY - rect.top);
    });

    window.addEventListener('resize', () => {
      if (dom.screenGame.classList.contains('active')) {
        resizeCanvas();
      }
    });
  }

  // ======================== INIT ========================
  function init() {
    loadCustomEmojis();
    bindEvents();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
