/**
 * Ratatouille: Hair-Pull Chaos
 * A physics-based cooking game with noodle arms and ingredient catching
 */

const { Engine, Runner, Bodies, Body, Composite, Events } = Matter;

// ============ Game State ============
let engine, runner, world;
let canvas, ctx;
let linguini, remy;
let leftUpperArm, leftForearm, leftHand;
let rightUpperArm, rightForearm, rightHand;
let soupPot, potBounds;
let leftHandBody, rightHandBody;
let ingredients = [];
let particles = [];
let steamParticles = [];
let soupQuality = 0;
let panicMeter = 0;
let gameActive = false;
let hatWobble = 0;
let remyHairPull = 0;
let screenShake = 0;
let audioContext;
let spawnTimeoutId = null;
let isPaused = false;
let soundFXEnabled = true;
let feedbackTexts = [];
const kitchenImg = new Image();
kitchenImg.src = 'assests/kitchen.jpeg';
const chefImg = new Image();
chefImg.src = 'assests/chef.png';
const fruitImages = {
  banana: new Image(),
  grape: new Image(),
  orange: new Image()
};
fruitImages.banana.src = 'assests/banana.jpeg';
fruitImages.grape.src = 'assests/grape.jpeg';
fruitImages.orange.src = 'assests/orange.jpeg';
const INGREDIENT_TYPES = ['banana', 'grape', 'orange'];
const WIN_SCORE = 100;
const PANIC_MAX = 100;
const SOUP_HIT_BONUS = 15;
const FLOOR_MISS_PANIC = 45;
const PANIC_DECAY = 0.05;
const SPAWN_DELAY_MIN_BASE = 500;
const SPAWN_DELAY_MAX_BASE = 2200;

let currentDifficulty = 'medium';
const difficultySettings = {
  easy: {
    spawnDelayMult: 2.5,
    soupHitBonus: 20,
    panicMissPenalty: 12,
    linguiniSpeed: 12,           // Boosted from 8
    gravity: 0.35                // Slower fall
  },
  medium: {
    spawnDelayMult: 1.8,
    soupHitBonus: 12,
    panicMissPenalty: 25,
    linguiniSpeed: 10,           // Boosted from 6
    gravity: 0.6                 // Default fall
  },
  hard: {
    spawnDelayMult: 1.2,
    soupHitBonus: 8,
    panicMissPenalty: 40,
    linguiniSpeed: 8,            // Boosted from 5
    gravity: 0.85                // Faster fall
  }
};

// DOM Elements
const mainMenu = document.getElementById('main-menu');
const gameUI = document.getElementById('game-ui');
const gameContainer = document.getElementById('game-container');
const winScreen = document.getElementById('win-screen');
const lossScreen = document.getElementById('loss-screen');
const soupMeter = document.getElementById('soup-meter');
const panicMeterEl = document.getElementById('panic-meter');
const soupValue = document.getElementById('soup-value');
const panicValue = document.getElementById('panic-value');
const panicMeterBar = document.querySelector('.panic-meter');

// ============ Audio (Web Audio API) ============
function initAudio() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

let bgMusic;
function startJazzMusic() {
  if (bgMusic) return;
  bgMusic = new Audio('assests/music.mpeg');
  bgMusic.loop = true;
  bgMusic.volume = 0.5;
  bgMusic.play().catch(e => console.error("Audio playback failed:", e));
}

function playPlopSound() {
  if (!audioContext || !soundFXEnabled) return;
  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();
  osc.connect(gain);
  gain.connect(audioContext.destination);
  osc.frequency.setValueAtTime(150, audioContext.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, audioContext.currentTime + 0.1);
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.15, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
  osc.start(audioContext.currentTime);
  osc.stop(audioContext.currentTime + 0.15);
}

function playSplashSound() {
  if (!audioContext || !soundFXEnabled) return;
  const bufferSize = audioContext.sampleRate * 0.1;
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
  }
  const noise = audioContext.createBufferSource();
  noise.buffer = buffer;
  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1200; // Brightened for fruit splashes
  noise.connect(filter);
  filter.connect(audioContext.destination);
  noise.start();
  noise.stop(audioContext.currentTime + 0.1);
}

// ============ Particle System ============
class Particle {
  constructor(x, y, vx, vy, color, life, size = 4) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.life = life;
    this.maxLife = life;
    this.size = size;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 0.3;
    this.life -= dt;
  }
  draw(ctx) {
    const alpha = this.life / this.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function createSplashParticles(x, y) {
  const colors = ['rgba(100, 180, 255, 0.8)', 'rgba(180, 220, 255, 0.6)', 'rgba(255, 250, 240, 0.5)'];
  for (let i = 0; i < 25; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    const vx = Math.cos(angle) * speed;
    const vy = -Math.abs(Math.sin(angle)) * speed - 2;
    const color = colors[Math.floor(Math.random() * colors.length)];
    particles.push(new Particle(x, y, vx, vy, color, 0.6 + Math.random() * 0.4, 3 + Math.random() * 4));
  }
}

// Steam particles for the pot
function createSteamParticle() {
  const potCenterX = linguini?.x ?? canvas.width / 2;
  const potTop = canvas.height * 0.7;
  const x = potCenterX + (Math.random() - 0.5) * 80;
  const y = potTop - Math.random() * 20;
  steamParticles.push({
    x, y,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -0.5 - Math.random() * 0.5,
    life: 1,
    size: 8 + Math.random() * 12
  });
}

// ============ Create Characters ============
function createLinguini() {
  const scale = Math.min(canvas.width, canvas.height) / 800;
  const baseY = canvas.height * 0.85;
  const baseX = canvas.width / 2;

  linguini = {
    x: baseX,
    y: baseY,
    scale,
    hatWobble: 0,
    velocity: 0,
    speed: LINGUINI_SPEED
  };

  return linguini;
}

function createRemy() {
  return {
    x: canvas.width / 2,
    y: 0,
    scale: 1,
    hairPull: 0,
    frame: 0
  };
}

// ============ Create Soup Pot (physics body for collision) ============
function createSoupPot() {
  const potCenterX = canvas.width / 2;
  const potTop = canvas.height * 0.72;
  const potWidth = 140;
  const potHeight = 100;

  potBounds = {
    left: potCenterX - potWidth / 2,
    right: potCenterX + potWidth / 2,
    top: potTop,
    bottom: canvas.height,
    centerX: potCenterX,
    centerY: potTop + potHeight / 2
  };

  soupPot = Bodies.rectangle(
    potCenterX,
    potTop + potHeight / 2,
    potWidth - 20,
    potHeight - 20,
    { isStatic: true, label: 'soupPot', render: { visible: false } }
  );
  Composite.add(world, soupPot);
}

function createHandBodies() {
  const scale = linguini?.scale ?? Math.min(canvas.width, canvas.height) / 800;
  const cx = linguini?.x ?? canvas.width / 2;
  const baseY = canvas.height * 0.88;
  const shoulderY = baseY - 90 * scale;
  const elbowLen = 45 * 2.5 * scale;
  const forearmLen = 50 * 2.5 * scale;

  // Exaggerated sine wobble + secondary wobble for funny physics
  const wobble1 = Math.sin(hatWobble * 3) * 8;
  const wobble2 = Math.cos(hatWobble * 2.3) * 6;
  const elbowFlex = Math.sin(hatWobble * 1.7) * 0.15;
  const leftWobbleX = (leftArmForce > 0 ? 1.2 : 0.5) * (wobble1 + wobble2 * 0.5);
  const leftWobbleY = (leftArmForce > 0 ? 1.2 : 0.5) * (wobble2 - wobble1 * 0.4);
  const rightWobbleX = (rightArmForce > 0 ? 1.2 : 0.5) * (-wobble1 + wobble2 * 0.5);
  const rightWobbleY = (rightArmForce > 0 ? 1.2 : 0.5) * (wobble2 + wobble1 * 0.4);

  const leftElbowX = cx - 35 * scale + Math.cos(-Math.PI / 2 + leftArmAngle + elbowFlex) * elbowLen + leftWobbleX * 0.3;
  const leftElbowY = shoulderY + Math.sin(-Math.PI / 2 + leftArmAngle + elbowFlex) * elbowLen + leftWobbleY * 0.3;
  const rightElbowX = cx + 35 * scale + Math.cos(-Math.PI / 2 - rightArmAngle - elbowFlex) * elbowLen + rightWobbleX * 0.3;
  const rightElbowY = shoulderY + Math.sin(-Math.PI / 2 - rightArmAngle - elbowFlex) * elbowLen + rightWobbleY * 0.3;

  let leftHandX = leftElbowX + Math.cos(-Math.PI / 2 + leftArmAngle * 1.4 + elbowFlex) * forearmLen + leftWobbleX;
  let leftHandY = leftElbowY + Math.sin(-Math.PI / 2 + leftArmAngle * 1.4 + elbowFlex) * forearmLen + leftWobbleY;
  let rightHandX = rightElbowX + Math.cos(-Math.PI / 2 - rightArmAngle * 1.4 - elbowFlex) * forearmLen + rightWobbleX;
  let rightHandY = rightElbowY + Math.sin(-Math.PI / 2 - rightArmAngle * 1.4 - elbowFlex) * forearmLen + rightWobbleY;

  if (!leftHandBody) {
    leftHandBody = Bodies.circle(leftHandX, leftHandY, 22, { isStatic: true, label: 'leftHand', render: { visible: false } });
    rightHandBody = Bodies.circle(rightHandX, rightHandY, 22, { isStatic: true, label: 'rightHand', render: { visible: false } });
    Composite.add(world, [leftHandBody, rightHandBody]);
  }
  Body.setPosition(leftHandBody, { x: leftHandX, y: leftHandY });
  Body.setPosition(rightHandBody, { x: rightHandX, y: rightHandY });
}

// ============ Create Floor (for missed ingredients) ============
function createFloor() {
  const floor = Bodies.rectangle(
    canvas.width / 2,
    canvas.height + 20,
    canvas.width + 100,
    40,
    { isStatic: true, label: 'floor', render: { visible: false } }
  );
  Composite.add(world, floor);
}

// ============ Spawn Ingredient ============
function spawnIngredient() {
  if (!gameActive) return;
  const type = INGREDIENT_TYPES[Math.floor(Math.random() * INGREDIENT_TYPES.length)];
  // Center 60% of screen - wider fall zone
  const centerSpan = canvas.width * 0.6;
  const leftEdge = (canvas.width - centerSpan) / 2;
  const x = leftEdge + Math.random() * centerSpan;
  const radius = 18 + Math.random() * 8;

  const body = Bodies.circle(x, -30, radius, {
    restitution: 0.3,
    friction: 0.4,
    label: 'ingredient',
    ingredientType: type
  });
  Composite.add(world, body);
  ingredients.push(body);
}

function scheduleNextSpawn() {
  if (!gameActive || isPaused) return;
  const settings = difficultySettings[currentDifficulty];
  const delay = (SPAWN_DELAY_MIN_BASE + Math.random() * (SPAWN_DELAY_MAX_BASE - SPAWN_DELAY_MIN_BASE)) * settings.spawnDelayMult;
  spawnTimeoutId = setTimeout(() => {
    spawnIngredient();
    scheduleNextSpawn();
  }, delay);
}

// ============ Arm Physics (O and P) + Movement (A and D) ============
let leftArmForce = 0;
let rightArmForce = 0;
let moveLeft = 0;
let moveRight = 0;
let leftArmAngle = -0.5;
let rightArmAngle = -0.5;
const ARM_RAISE_SPEED = 0.14;
const ARM_DROP_SPEED = 0.015;
const LINGUINI_SPEED = 5;
const LINGUINI_MARGIN = 80;

// ============ Drawing ============
function drawKitchenBackground() {
  const w = canvas.width;
  const h = canvas.height;

  if (kitchenImg.complete && kitchenImg.naturalWidth !== 0) {
    // Cover scaling logic
    const imgRatio = kitchenImg.width / kitchenImg.height;
    const canvasRatio = w / h;
    let renderW, renderH, xOffset, yOffset;

    if (canvasRatio > imgRatio) {
      renderW = w;
      renderH = w / imgRatio;
      xOffset = 0;
      yOffset = (h - renderH) / 2;
    } else {
      renderW = h * imgRatio;
      renderH = h;
      xOffset = (w - renderW) / 2;
      yOffset = 0;
    }
    ctx.drawImage(kitchenImg, xOffset, yOffset, renderW, renderH);

    // Slight darkening overlay for readability
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(0, 0, w, h);
  } else {
    // Warm gradient background fallback
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#4a3020');
    bgGrad.addColorStop(0.3, '#5c3d2e');
    bgGrad.addColorStop(0.5, '#6b4a35');
    bgGrad.addColorStop(0.7, '#5c3d2e');
    bgGrad.addColorStop(1, '#3d2817');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);
  }

  // Soft vignette
  const vigGrad = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);
}

function drawCopperPot() {
  const cx = linguini?.x ?? canvas.width / 2;
  const potTop = canvas.height * 0.7;
  const potWidth = 160;
  const potHeight = 120;

  // Pot body - copper gradient
  const potGrad = ctx.createLinearGradient(cx - potWidth / 2, 0, cx + potWidth / 2, 0);
  potGrad.addColorStop(0, '#8b6914');
  potGrad.addColorStop(0.2, '#daa520');
  potGrad.addColorStop(0.5, '#ffd700');
  potGrad.addColorStop(0.8, '#daa520');
  potGrad.addColorStop(1, '#8b6914');

  ctx.save();
  ctx.translate(cx, potTop + potHeight / 2);

  // Main pot body
  ctx.fillStyle = potGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, potWidth / 2, potHeight / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dark rim
  ctx.strokeStyle = '#5c4033';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Steam rising from top
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.beginPath();
  ctx.ellipse(0, -potHeight / 2 - 5, potWidth / 2 - 10, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawSteam() {
  steamParticles.forEach((s, i) => {
    s.x += s.vx;
    s.y += s.vy;
    s.life -= 0.012;
    if (s.life <= 0) {
      steamParticles.splice(i, 1);
      return;
    }
    const alpha = s.life * 0.5;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawLinguini() {
  const scale = linguini?.scale ?? Math.min(canvas.width, canvas.height) / 800;
  const cx = linguini?.x ?? canvas.width / 2;
  const baseY = canvas.height * 0.88;

  hatWobble += 0.08;
  const wobble = Math.sin(hatWobble) * 0.03;

  ctx.save();
  ctx.translate(cx, baseY);

  // Render Chef directly
  if (chefImg.complete) {
    const sw = 180 * scale;
    const sh = 220 * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(chefImg, -sw / 2, -sh, sw, sh);
  } else {
    // Fallback to minimal shape if image hasn't loaded
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-50 * scale, -120 * scale, 100 * scale, 120 * scale);
  }

  ctx.restore();

  // Remy and hair tufts stay on top
  remyHairPull = 0.3 + Math.sin(hatWobble * 0.5) * 0.1;
  // (Hair tufts logic remains but is now positioned relative to sprite head)
  ctx.fillStyle = '#4a3728';
  ctx.beginPath();
  ctx.ellipse(cx - 15 * scale, baseY - 185 * scale, 8 * scale, 12 * scale, -0.3 + remyHairPull * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 15 * scale, baseY - 185 * scale, 8 * scale, 12 * scale, 0.3 - remyHairPull * 0.2, 0, Math.PI * 2);
  ctx.fill();

  const shoulderY = baseY - 90 * scale;
  const elbowLen = 45 * 2.5 * scale;
  const forearmLen = 50 * 2.5 * scale;

  const wobble1 = Math.sin(hatWobble * 3) * 8;
  const wobble2 = Math.cos(hatWobble * 2.3) * 6;
  const elbowFlex = Math.sin(hatWobble * 1.7) * 0.15;
  const leftWobbleX = (leftArmForce > 0 ? 1.2 : 0.5) * (wobble1 + wobble2 * 0.5);
  const leftWobbleY = (leftArmForce > 0 ? 1.2 : 0.5) * (wobble2 - wobble1 * 0.4);
  const rightWobbleX = (rightArmForce > 0 ? 1.2 : 0.5) * (-wobble1 + wobble2 * 0.5);
  const rightWobbleY = (rightArmForce > 0 ? 1.2 : 0.5) * (wobble2 + wobble1 * 0.4);

  const leftShoulderX = cx - 35 * scale;
  const rightShoulderX = cx + 35 * scale;

  const leftElbowX = leftShoulderX + Math.cos(-Math.PI / 2 + leftArmAngle + elbowFlex) * elbowLen + leftWobbleX * 0.3;
  const leftElbowY = shoulderY + Math.sin(-Math.PI / 2 + leftArmAngle + elbowFlex) * elbowLen + leftWobbleY * 0.3;
  const rightElbowX = rightShoulderX + Math.cos(-Math.PI / 2 - rightArmAngle - elbowFlex) * elbowLen + rightWobbleX * 0.3;
  const rightElbowY = shoulderY + Math.sin(-Math.PI / 2 - rightArmAngle - elbowFlex) * elbowLen + rightWobbleY * 0.3;

  const leftHandX = leftElbowX + Math.cos(-Math.PI / 2 + leftArmAngle * 1.4 + elbowFlex) * forearmLen + leftWobbleX;
  const leftHandY = leftElbowY + Math.sin(-Math.PI / 2 + leftArmAngle * 1.4 + elbowFlex) * forearmLen + leftWobbleY;
  const rightHandX = rightElbowX + Math.cos(-Math.PI / 2 - rightArmAngle * 1.4 - elbowFlex) * forearmLen + rightWobbleX;
  const rightHandY = rightElbowY + Math.sin(-Math.PI / 2 - rightArmAngle * 1.4 - elbowFlex) * forearmLen + rightWobbleY;

  const leftHandAngle = -Math.PI / 2 + leftArmAngle * 1.2 + elbowFlex;
  const rightHandAngle = -Math.PI / 2 - rightArmAngle * 1.2 - elbowFlex;

  ctx.strokeStyle = '#f5d5b8';
  ctx.fillStyle = '#f5d5b8';
  ctx.lineWidth = 4 * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(leftShoulderX, shoulderY);
  ctx.lineTo(leftElbowX, leftElbowY);
  ctx.lineTo(leftHandX, leftHandY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightShoulderX, shoulderY);
  ctx.lineTo(rightElbowX, rightElbowY);
  ctx.lineTo(rightHandX, rightHandY);
  ctx.stroke();

  drawOpenHand(leftHandX, leftHandY, leftHandAngle, scale, true);
  drawOpenHand(rightHandX, rightHandY, rightHandAngle, scale, false);
}

function drawOpenHand(x, y, angle, scale, isLeft) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const dir = isLeft ? 1 : -1;
  const palmW = 10 * scale;
  const palmH = 14 * scale;

  ctx.fillStyle = '#f5d5b8';
  ctx.strokeStyle = '#e8c4a8';
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.ellipse(0, 0, palmW, palmH, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const fingerW = 3 * scale;
  const fingerH = 14 * scale;
  const fingerSpread = [0.6, 0.2, -0.2, -0.6];
  for (let i = 0; i < 4; i++) {
    const offsetY = fingerSpread[i] * 10 * scale;
    const slant = fingerSpread[i] * 0.15;
    ctx.beginPath();
    ctx.ellipse(dir * (palmW + fingerH * 0.6), offsetY, fingerW, fingerH, slant, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const thumbW = 4 * scale;
  const thumbH = 10 * scale;
  ctx.beginPath();
  ctx.ellipse(dir * (palmW * 0.3), -palmH - thumbH * 0.2, thumbW, thumbH, dir * -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawRemy() {
  const scale = linguini?.scale ?? Math.min(canvas.width, canvas.height) / 800;
  const cx = linguini?.x ?? canvas.width / 2;
  const headTop = canvas.height * 0.88 - 95 * scale;

  remyHairPull = 0.5 + Math.sin(hatWobble * 0.5) * 0.2;

  // Remy - small rat on Linguini's head
  ctx.save();
  ctx.translate(cx, headTop);
  ctx.imageSmoothingEnabled = true;

  // Body
  ctx.fillStyle = '#6b5344';
  ctx.beginPath();
  ctx.ellipse(0, 15, 12 * scale, 18 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#7d6b5c';
  ctx.beginPath();
  ctx.ellipse(0, -5, 14 * scale, 14 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = '#6b5344';
  ctx.beginPath();
  ctx.ellipse(-10 * scale, -12 * scale, 6, 8, 0, 0, Math.PI * 2);
  ctx.ellipse(10 * scale, -12 * scale, 6, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Arms pulling hair
  ctx.strokeStyle = '#5c4535';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const pullAnim = Math.sin(hatWobble) * 0.2;
  ctx.beginPath();
  ctx.moveTo(-8 * scale, -2);
  ctx.lineTo(-22 * scale - pullAnim * 5, -25 * scale);
  ctx.moveTo(8 * scale, -2);
  ctx.lineTo(22 * scale + pullAnim * 5, -25 * scale);
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(-5, -6, 2, 0, Math.PI * 2);
  ctx.arc(5, -6, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawIngredient(body) {
  const pos = body.position;
  const type = body.ingredientType || 'banana';
  const r = body.circleRadius || 20;

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(body.angle);

  const img = fruitImages[type];
  if (img && img.complete) {
    // Round clipping to match physics body
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(img, -r, -r, r * 2, r * 2);
  } else {
    // Fallback colors for fruits
    ctx.fillStyle = type === 'banana' ? '#f1c40f' : (type === 'grape' ? '#8e44ad' : '#e67e22');
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update(1);
    p.draw(ctx);
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// ============ Input ============
function setupInput() {
  document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyO') leftArmForce = 1;
    if (e.code === 'KeyP') rightArmForce = 1;
    if (e.code === 'KeyA') moveLeft = 1;
    if (e.code === 'KeyD') moveRight = 1;
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyO') leftArmForce = 0;
    if (e.code === 'KeyP') rightArmForce = 0;
    if (e.code === 'KeyA') moveLeft = 0;
    if (e.code === 'KeyD') moveRight = 0;
  });

  // Main Menu Navigation
  document.getElementById('play-btn').addEventListener('click', () => {
    document.getElementById('primary-menu').classList.add('hidden');
    document.getElementById('difficulty-menu').classList.remove('hidden');
  });

  document.getElementById('back-to-main-btn').addEventListener('click', () => {
    document.getElementById('difficulty-menu').classList.add('hidden');
    document.getElementById('primary-menu').classList.remove('hidden');
  });

  document.getElementById('how-to-btn').addEventListener('click', () => {
    document.getElementById('how-to-modal').classList.remove('hidden');
  });

  document.getElementById('credits-btn').addEventListener('click', () => {
    document.getElementById('credits-modal').classList.remove('hidden');
  });

  document.getElementById('main-settings-btn').addEventListener('click', () => {
    document.getElementById('settings-menu').classList.remove('hidden');
  });

  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.overlay-screen').classList.add('hidden');
    });
  });

  // Difficulty button listeners
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      startGame(btn.dataset.difficulty);
    });
  });

  // Settings Menu controls
  document.getElementById('menu-btn').addEventListener('click', pauseGame);
  document.getElementById('resume-btn').addEventListener('click', resumeGame);
  document.getElementById('home-btn').addEventListener('click', () => {
    resumeGame();
    resetToMenu();
  });

  document.getElementById('volume-slider').addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value);
    if (bgMusic) bgMusic.volume = vol;
    // Store in global state if needed
  });

  document.getElementById('sfx-toggle').addEventListener('change', (e) => {
    soundFXEnabled = e.target.checked;
  });
}

// ============ Collision Detection ============
function setupCollisions() {
  Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
      const a = pair.bodyA;
      const b = pair.bodyB;
      if (a.label === 'ingredient' || b.label === 'ingredient') {
        const ing = a.label === 'ingredient' ? a : b;
        const other = a.label === 'ingredient' ? b : a;

        if (other.label === 'soupPot') {
          createSplashParticles(ing.position.x, ing.position.y);
          playPlopSound();
          playSplashSound();
          soupQuality = Math.min(WIN_SCORE, soupQuality + difficultySettings[currentDifficulty].soupHitBonus);
          createFeedbackText(ing.position.x, ing.position.y - 40, 'Perfect!', '#2ecc71');
          Composite.remove(world, ing);
          ingredients = ingredients.filter(i => i !== ing);
          if (soupQuality >= WIN_SCORE) triggerWin();
        } else if (other.label === 'floor') {
          screenShake = 1;
          gameContainer.classList.add('shake');
          setTimeout(() => gameContainer.classList.remove('shake'), 500);
          panicMeter = Math.min(PANIC_MAX, panicMeter + difficultySettings[currentDifficulty].panicMissPenalty);
          createFeedbackText(ing.position.x, canvas.height - 40, 'MISS!', '#e74c3c');
          Composite.remove(world, ing);
          ingredients = ingredients.filter(i => i !== ing);
          if (panicMeter >= PANIC_MAX) triggerLoss();
        } else if (other.label === 'leftHand' || other.label === 'rightHand') {
          // Deflect ingredient toward the soup pot
          const potCenterX = potBounds?.centerX ?? canvas.width / 2;
          const potCenterY = potBounds?.centerY ?? canvas.height * 0.77;
          const dx = potCenterX - ing.position.x;
          const dy = potCenterY - ing.position.y;
          const len = Math.hypot(dx, dy) || 1;
          const strength = 8;
          Body.setVelocity(ing, {
            x: (dx / len) * strength + (Math.random() - 0.5) * 2,
            y: (dy / len) * strength - 3
          });
        }
      }
    });
  });
}

// ============ Win / Loss ============
function triggerWin() {
  gameActive = false;
  if (spawnTimeoutId) clearTimeout(spawnTimeoutId);
  gameUI.classList.add('hidden');
  winScreen.classList.remove('hidden');
  winScreen.style.pointerEvents = 'auto';
}

function triggerLoss() {
  gameActive = false;
  if (spawnTimeoutId) clearTimeout(spawnTimeoutId);
  gameUI.classList.add('hidden');
  lossScreen.classList.remove('hidden');
  lossScreen.style.pointerEvents = 'auto';
}

// ============ Game Loop Updates ============
function updateArms() {
  // Arm controls: O (left), P (right)
  if (leftArmForce > 0) {
    leftArmAngle = Math.min(1.2, leftArmAngle + ARM_RAISE_SPEED);
  } else {
    leftArmAngle = Math.max(-0.5, leftArmAngle - ARM_DROP_SPEED);
  }
  if (rightArmForce > 0) {
    rightArmAngle = Math.min(1.2, rightArmAngle + ARM_RAISE_SPEED);
  } else {
    rightArmAngle = Math.max(-0.5, rightArmAngle - ARM_DROP_SPEED);
  }

  // Horizontal movement: A (left), D (right)
  if (linguini) {
    const dx = (moveRight - moveLeft) * linguini.speed;
    linguini.velocity = dx;
    linguini.x += dx;
    const minX = LINGUINI_MARGIN;
    const maxX = canvas.width - LINGUINI_MARGIN;
    linguini.x = Math.max(minX, Math.min(maxX, linguini.x));

    // Update soup pot position (moves with Linguini)
    if (soupPot && potBounds) {
      const potCenterY = potBounds.centerY;
      Body.setPosition(soupPot, { x: linguini.x, y: potCenterY });
      potBounds.left = linguini.x - 60;
      potBounds.right = linguini.x + 60;
      potBounds.centerX = linguini.x;
    }
  }
}

// ============ Init & Run ============
function init() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');

  const resize = () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (engine && world && soupPot) {
      Composite.remove(world, soupPot);
      createSoupPot();
    }
  };

  window.addEventListener('resize', resize);
  resize();

  engine = Engine.create();
  world = engine.world;
  engine.gravity.y = 0.6;

  runner = Runner.create();
  Runner.run(runner, engine);

  createSoupPot();
  createFloor();
  createLinguini();
  createRemy();
  setupInput();
  setupCollisions();
  initAudio();

  // Custom game loop - we draw everything ourselves
  function gameLoop() {
    if (!isPaused) {
      Engine.update(engine, 1000 / 60);
      if (gameActive && leftHandBody && rightHandBody) createHandBodies();
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawKitchenBackground();
    drawCopperPot();
    drawSteam();
    drawParticles();
    drawFeedback();

    // Draw ingredients (physics bodies)
    ingredients.forEach(ing => {
      if (ing && ing.position) drawIngredient(ing);
    });

    drawLinguini();
    drawRemy();
    requestAnimationFrame(gameLoop);
  }
  gameLoop();

  // Spawn steam
  setInterval(createSteamParticle, 300);

  // Game loop for non-physics updates
  setInterval(() => {
    if (gameActive && !isPaused) {
      updateArms();
      panicMeter = Math.max(0, panicMeter - PANIC_DECAY);
      soupValue.textContent = Math.round(soupQuality) + '%';
      panicValue.textContent = Math.round(panicMeter) + '%';
      soupMeter.style.width = soupQuality + '%';
      panicMeterEl.style.width = panicMeter + '%';
      panicMeterBar.classList.toggle('panic-high', panicMeter > 70);
    }
  }, 16);
}

function pauseGame() {
  if (!gameActive) return;
  isPaused = true;
  document.getElementById('settings-menu').classList.remove('hidden');
}

function resumeGame() {
  isPaused = false;
  document.getElementById('settings-menu').classList.add('hidden');
  scheduleNextSpawn();
}

function createFeedbackText(x, y, text, color) {
  feedbackTexts.push({ x, y, text, color, life: 1, vy: -1.5 });
}

function drawFeedback() {
  ctx.save();
  ctx.font = 'bold 24px Inter, sans-serif';
  ctx.textAlign = 'center';
  feedbackTexts.forEach((f, i) => {
    f.y += f.vy;
    f.life -= 0.02;
    if (f.life <= 0) {
      feedbackTexts.splice(i, 1);
      return;
    }
    ctx.globalAlpha = f.life;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.restore();
}

// ============ Menu Logic ============
function startGame(difficulty = 'medium') {
  currentDifficulty = difficulty;
  if (audioContext?.state === 'suspended') audioContext.resume();
  startJazzMusic();

  mainMenu.classList.add('hidden');
  document.getElementById('primary-menu').classList.remove('hidden');
  document.getElementById('difficulty-menu').classList.add('hidden');
  gameUI.classList.remove('hidden');
  gameActive = true;
  const settings = difficultySettings[currentDifficulty];
  engine.gravity.y = settings.gravity;

  if (linguini) {
    linguini.x = canvas.width / 2;
    linguini.speed = settings.linguiniSpeed;
  }

  ingredients.forEach(ing => Composite.remove(world, ing));
  ingredients = [];
  particles = [];

  soupValue.textContent = '0%';
  panicValue.textContent = '0%';
  soupMeter.style.width = '0%';
  panicMeterEl.style.width = '0%';

  if (spawnTimeoutId) clearTimeout(spawnTimeoutId);
  scheduleNextSpawn();
}

function resetToMenu() {
  if (bgMusic) {
    bgMusic.pause();
    bgMusic.currentTime = 0;
    bgMusic = null;
  }
  winScreen.classList.add('hidden');
  lossScreen.classList.add('hidden');
  mainMenu.classList.remove('hidden');
  document.getElementById('primary-menu').classList.remove('hidden');
  document.getElementById('difficulty-menu').classList.add('hidden');
  gameUI.classList.add('hidden');
  gameActive = false;
  winScreen.style.pointerEvents = 'none';
  lossScreen.style.pointerEvents = 'none';
}

document.getElementById('replay-win-btn').addEventListener('click', resetToMenu);
document.getElementById('replay-loss-btn').addEventListener('click', resetToMenu);

init();
