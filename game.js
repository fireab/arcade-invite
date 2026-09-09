// Game Constants & Configuration
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_SPEED = 7;
const COIN_SPEED = 3;

// State
let canvas, ctx;
let gameState = "START"; // START, PLAYING, GAMEOVER, VICTORY
let currentStageIndex = 0;

const stages = [
  { name: "Ground Class", imgSrc: "./book.png", imgObj: null },
  { name: "Stage 1", imgSrc: "./da40.png", imgObj: null },
  { name: "Stage 2", imgSrc: "./da40.png", imgObj: null },
  { name: "Stage 3", imgSrc: "./da40.png", imgObj: null },
  { name: "Stage 4", imgSrc: "./da40.png", imgObj: null },
  { name: "Stage 5", imgSrc: "./da42.png", imgObj: null },
];

let player = {
  x: 400,
  y: 500,
  width: 80,
  height: 80,
  speed: PLAYER_SPEED,
  imgObj: null,
};
let activeCoin = null; // The falling item
let particles = [];
let bgImg = new Image();
bgImg.src = "./mountains.jpg";
let bgY = 0;

// Input
const keys = { ArrowLeft: false, ArrowRight: false, a: false, d: false };
let isMouseDown = false;
let mousePos = { x: 0, y: 0 };

// Audio Context
let audioCtx;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playSound(type) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  if (type === "eat") {
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioCtx.currentTime + 0.1,
    );
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } else if (type === "explosion") {
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      0.01,
      audioCtx.currentTime + 0.3,
    );
    gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioCtx.currentTime + 0.3,
    );
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  }
}

// Load images
function loadImages() {
  stages.forEach((stage) => {
    const img = new Image();
    img.src = stage.imgSrc;
    stage.imgObj = img;
  });
  // Player starts as da40
  const pImg = new Image();
  pImg.src = "./da40.png";
  player.imgObj = pImg;
}

function init() {
  canvas = document.getElementById("gameCanvas");
  ctx = canvas.getContext("2d");

  loadImages();

  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  document.getElementById("btn-start").addEventListener("click", startGame);
  document.getElementById("btn-restart").addEventListener("click", startGame);
  document
    .getElementById("btn-screenshot")
    .addEventListener("click", takeScreenshot);

  window.addEventListener("keydown", (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
  });
  window.addEventListener("keyup", (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
  });

  canvas.addEventListener("mousedown", (e) => {
    isMouseDown = true;
    updateMousePos(e);
  });
  canvas.addEventListener("mousemove", (e) => {
    if (isMouseDown) updateMousePos(e);
  });
  canvas.addEventListener("mouseup", () => {
    isMouseDown = false;
  });
  canvas.addEventListener(
    "touchstart",
    (e) => {
      isMouseDown = true;
      updateMousePos(e.touches[0]);
    },
    { passive: false },
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      if (isMouseDown) updateMousePos(e.touches[0]);
    },
    { passive: false },
  );
  canvas.addEventListener("touchend", () => {
    isMouseDown = false;
  });



  requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  player.x = canvas.width / 2;
  player.y = canvas.height - 100;
}

// ── Radar HUD (bottom-left) ──
function getRadarSize() {
  // Smaller on mobile
  return canvas.width < 500 ? 45 : 55;
}

function drawRadar() {
  const R = getRadarSize();
  const pad = canvas.width < 500 ? 10 : 15;
  const cx = pad + R + 5;
  const cy = canvas.height - pad - R - 5;

  // Radar background
  ctx.fillStyle = "rgba(0,20,12,0.6)";
  ctx.beginPath();
  ctx.arc(cx, cy, R + 4, 0, Math.PI * 2);
  ctx.fill();

  // Outer ring
  ctx.strokeStyle = "rgba(0,230,118,0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();

  // Inner ring
  ctx.strokeStyle = "rgba(0,230,118,0.15)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.5, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair lines
  ctx.strokeStyle = "rgba(0,230,118,0.12)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - R, cy);
  ctx.lineTo(cx + R, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - R);
  ctx.lineTo(cx, cy + R);
  ctx.stroke();

  // Sweep line (rotating)
  const sweepAngle = (Date.now() * 0.002) % (Math.PI * 2);
  ctx.strokeStyle = "rgba(0,230,118,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(sweepAngle) * R, cy + Math.sin(sweepAngle) * R);
  ctx.stroke();

  // Sweep fade trail
  ctx.fillStyle = "rgba(0,230,118,0.04)";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R, sweepAngle - 0.5, sweepAngle);
  ctx.closePath();
  ctx.fill();

  // Item blip
  if (activeCoin && gameState === "PLAYING") {
    const bx = cx + (activeCoin.x / canvas.width - 0.5) * 2 * R * 0.85;
    const by = cy + (activeCoin.y / canvas.height - 0.5) * 2 * R * 0.85;
    const pulse = Math.sin(Date.now() * 0.008) * 0.3 + 0.7;

    // Glow
    ctx.fillStyle = `rgba(227,25,55,${0.12 * pulse})`;
    ctx.beginPath();
    ctx.arc(bx, by, 6, 0, Math.PI * 2);
    ctx.fill();
    // Dot
    ctx.fillStyle = `rgba(227,25,55,${0.9 * pulse})`;
    ctx.beginPath();
    ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Player   blip
  if (gameState === "PLAYING") {
    const px = cx + (player.x / canvas.width - 0.5) * 2 * R * 0.85;
    const py = cy + R * 0.75;
    ctx.fillStyle = "rgba(0,230,118,0.8)";
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Stage label
  if (gameState === "PLAYING" && stages[currentStageIndex]) {
    const fontSize = canvas.width < 500 ? 4 : 5;
    ctx.fillStyle = "rgba(212,175,55,0.6)";
    ctx.font = `${fontSize}px "Press Start 2P"`;
    ctx.textAlign = "center";
    ctx.fillText(stages[currentStageIndex].name.toUpperCase(), cx, cy + R + 14);
  }
}

function updateMousePos(evt) {
  const rect = canvas.getBoundingClientRect();
  mousePos.x = evt.clientX - rect.left;
}

function startGame() {
  initAudio();
  gameState = "PLAYING";
  currentStageIndex = 0;

  player.x = canvas.width / 2;
  player.y = canvas.height - 100;
  // reset player image to da40
  player.imgObj = stages[1].imgObj; // da40.jpeg

  particles = [];
  spawnCoin();

  document.getElementById("start-screen").classList.remove("active");
  document.getElementById("game-over-screen").classList.remove("active");
  document.getElementById("victory-screen").classList.remove("active");

  updateHUD();
}

function updateHUD() {
  let stageName = stages[currentStageIndex]
    ? stages[currentStageIndex].name
    : "COMPLETED";
  document.getElementById("stage-display").innerText = `CURRENT: ${stageName}`;

  const progressPercent = (currentStageIndex / stages.length) * 100;
  document.getElementById("progress-bar").style.width = `${progressPercent}%`;
}

function gameOver() {
  gameState = "GAMEOVER";
  playSound("explosion");
  document.getElementById("game-over-screen").classList.add("active");
  document.getElementById("final-stage").innerText =
    `MISSED: ${stages[currentStageIndex].name}`;
}

function victory() {
  gameState = "VICTORY";
  document.getElementById("victory-screen").classList.add("active");
  // Ethiopian flag colored fireworks: green, gold, red
  const etColors = ["#006B3F", "#D4AF37", "#E31937", "#00e676"];
  setInterval(() => {
    const color = etColors[Math.floor(Math.random() * etColors.length)];
    spawnExplosion(
      Math.random() * canvas.width,
      Math.random() * canvas.height,
      color,
    );
  }, 500);
}

function spawnCoin() {
  if (currentStageIndex >= stages.length) {
    victory();
    return;
  }

  const stageInfo = stages[currentStageIndex];
  activeCoin = {
    x: Math.random() * (canvas.width - 100) + 50,
    y: -100,
    width: 60,
    height: 60,
    speed: COIN_SPEED + currentStageIndex * 0.5,
    stage: stageInfo,
  };
  updateHUD();
}

function spawnExplosion(x, y, color = "#ff0") {
  for (let i = 0; i < 20; i++) {
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      life: 1,
      color: color,
    });
  }
}

function update() {
  if (gameState !== "PLAYING") return;

  // Scroll Background
  bgY += 1.5;
  if (bgImg && bgImg.complete) {
    const H = bgImg.height * (canvas.width / bgImg.width);
    if (bgY >= H * 2) {
      bgY -= H * 2;
    }
  }

  // Player Movement (Left/Right only)
  if (keys.ArrowLeft || keys.a) player.x -= player.speed;
  if (keys.ArrowRight || keys.d) player.x += player.speed;

  if (isMouseDown) {
    const dx = mousePos.x - player.x;
    player.x += dx * 0.1;
  }

  player.x = Math.max(
    player.width / 2,
    Math.min(canvas.width - player.width / 2, player.x),
  );

  // Active Coin logic
  if (activeCoin) {
    activeCoin.y += activeCoin.speed;

    // If coin falls off the bottom
    if (activeCoin.y > canvas.height + activeCoin.height) {
      gameOver();
      return;
    }

    // Collision with player
    if (
      Math.abs(activeCoin.x - player.x) <
        (activeCoin.width + player.width) / 2.5 &&
      Math.abs(activeCoin.y - player.y) <
        (activeCoin.height + player.height) / 2.5
    ) {
      playSound("eat");
      spawnExplosion(activeCoin.x, activeCoin.y, "#00e676");

      currentStageIndex++;

      // Check for player upgrade after Stage 4
      if (currentStageIndex === 5) {
        // Index 5 is Stage 5 (da42)
        player.imgObj = stages[5].imgObj; // da42
        spawnExplosion(player.x, player.y, "#D4AF37"); // Upgrade effect — ET gold
      }

      activeCoin = null;
      setTimeout(spawnCoin, 1000); // 1 second delay before next coin
    }
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    let p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.05;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (bgImg && bgImg.complete) {
    const W = canvas.width;
    const H = bgImg.height * (W / bgImg.width);
    
    // Draw seamless 2H blocks. bgY goes from 0 to 2H.
    // We need to draw the block starting at bgY - 2H, and the block starting at bgY.
    const drawSeamlessBlock = (startY) => {
      // Normal image (top half of the block)
      ctx.drawImage(bgImg, 0, startY, W, H);
      
      // Flipped image (bottom half of the block)
      ctx.save();
      ctx.translate(0, startY + 2 * H);
      ctx.scale(1, -1);
      ctx.drawImage(bgImg, 0, 0, W, H);
      ctx.restore();
    };

    drawSeamlessBlock(bgY - 2 * H);
    drawSeamlessBlock(bgY);
    
    // Add a dark overlay to make UI and game elements pop
    ctx.fillStyle = "rgba(2, 13, 8, 0.3)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#020d08";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (gameState === "PLAYING" || gameState === "GAMEOVER") {
    // Draw Player
    if (player.imgObj && player.imgObj.complete) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.drawImage(
        player.imgObj,
        -player.width / 2,
        -player.height / 2,
        player.width,
        player.height,
      );
      ctx.restore();
    } else {
      // Fallback rectangle — ET green
      ctx.fillStyle = "#006B3F";
      ctx.fillRect(
        player.x - player.width / 2,
        player.y - player.height / 2,
        player.width,
        player.height,
      );
    }

    // Draw Active Coin
    if (activeCoin) {
      if (activeCoin.stage.imgObj && activeCoin.stage.imgObj.complete) {
        ctx.save();
        ctx.translate(activeCoin.x, activeCoin.y);
        ctx.drawImage(
          activeCoin.stage.imgObj,
          -activeCoin.width / 2,
          -activeCoin.height / 2,
          activeCoin.width,
          activeCoin.height,
        );

        // Draw Label below the coin
        ctx.fillStyle = "#D4AF37";
        ctx.font = '10px "Press Start 2P"';
        ctx.textAlign = "center";
        ctx.fillText(activeCoin.stage.name, 0, activeCoin.height / 2 + 15);
        ctx.restore();
      } else {
        ctx.fillStyle = "#D4AF37";
        ctx.fillRect(
          activeCoin.x - activeCoin.width / 2,
          activeCoin.y - activeCoin.height / 2,
          activeCoin.width,
          activeCoin.height,
        );
      }
    }
  }

  particles.forEach((p) => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.life * 5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // Radar HUD overlay
  if (gameState === "PLAYING") {
    drawRadar();
  }
}

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

function takeScreenshot() {
  const card = document.querySelector(".invitation-card");
  const btn = document.getElementById("btn-screenshot");

  // Temporarily hide the button so it doesn't appear in the screenshot
  btn.style.display = "none";

  // Pause the float animation for a clean capture
  card.style.animation = "none";
  card.style.transform = "translateY(0)";

  html2canvas(card, {
    backgroundColor: "#020d08",
    scale: 2, // Higher resolution
    useCORS: true,
    logging: false,
  })
    .then((screenshotCanvas) => {
      // Restore button and animation
      btn.style.display = "";
      card.style.animation = "";
      card.style.transform = "";

      // Create download link
      const link = document.createElement("a");
      link.download = "batch3-flash-ceremony-invitation.png";
      link.href = screenshotCanvas.toDataURL("image/png");
      link.click();

      // Visual feedback
      const originalText = btn.innerHTML;
      btn.innerHTML = "✅ SAVED!";
      btn.classList.add("screenshot-success");
      setTimeout(() => {
        btn.innerHTML = originalText;
        btn.classList.remove("screenshot-success");
      }, 2000);
    })
    .catch((err) => {
      // Restore button on error
      btn.style.display = "";
      card.style.animation = "";
      card.style.transform = "";
      console.error("Screenshot failed:", err);
    });
}

window.onload = init;
