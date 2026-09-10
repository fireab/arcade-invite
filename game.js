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
let runway = null; // The final landing challenge
let particles = [];
let bgImg = new Image();
bgImg.src = "./mountains.jpg";
let runwayImg = new Image();
runwayImg.src = "./runway_bg.jpg";
let bgY = 0;
let scrollSpeed = 1.5;
let bgFade = 0; // 0 = Mountains, 1 = Runway
let isTransitioningBg = false;
let runwayScrollY = 0;
let isLandingPhase = false;
let landingTimer = 0;

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
let boeingCanvas = document.createElement('canvas');
let isBoeingLoaded = false;
const playerSizes = [80, 100, 125, 155, 190, 230];

function updatePlayerSize(stageIndex) {
  let idx = Math.min(stageIndex, playerSizes.length - 1);
  player.width = playerSizes[idx];
  player.height = playerSizes[idx];
}

function loadImages() {
  stages.forEach((stage) => {
    const img = new Image();
    img.src = stage.imgSrc;
    stage.imgObj = img;
  });
  
  const pImg = new Image();
  pImg.src = "./plane.jpg";
  pImg.onload = () => {
    boeingCanvas.width = pImg.width;
    boeingCanvas.height = pImg.height;
    const pCtx = boeingCanvas.getContext("2d");
    pCtx.drawImage(pImg, 0, 0);
    const imgData = pCtx.getImageData(0, 0, pImg.width, pImg.height);
    const data = imgData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i+1], b = data[i+2];
      let diff = g - Math.max(r, b);
      if (diff > 50) {
        data[i+3] = 0; // Transparent
      } else if (diff > 10) {
        data[i+3] = Math.max(0, 255 - (diff - 10) * 6); // Anti-alias edge
        data[i+1] = Math.max(r, b); // Desaturate green spill
      }
    }
    pCtx.putImageData(imgData, 0, 0);
    isBoeingLoaded = true;
    player.imgObj = boeingCanvas;
  };
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
      e.preventDefault();
      isMouseDown = true;
      updateMousePos(e.touches[0]);
    },
    { passive: false },
  );
  canvas.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
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

  // Item or Runway blip
  if (gameState === "PLAYING") {
    let target = null;
    let color = "";
    if (activeCoin) {
      target = activeCoin;
      color = "rgba(227,25,55,";
    } else if (isLandingPhase) {
      target = { x: canvas.width / 2, y: canvas.height - (canvas.height/2 + landingTimer) };
      color = "rgba(50,150,255,";
    }

    if (target) {
      const bx = cx + (target.x / canvas.width - 0.5) * 2 * R * 0.85;
      const by = cy + (target.y / canvas.height - 0.5) * 2 * R * 0.85;
      const pulse = Math.sin(Date.now() * 0.008) * 0.3 + 0.7;

      // Glow
      ctx.fillStyle = `${color}${0.12 * pulse})`;
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.fill();
      // Dot
      ctx.fillStyle = `${color}${0.9 * pulse})`;
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
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
  if ((gameState === "PLAYING" || gameState === "LANDING_ROLL" || gameState === "LANDED") && stages[currentStageIndex]) {
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
  scrollSpeed = 1.5;
  bgFade = 0;
  isTransitioningBg = false;
  runwayScrollY = 0;
  isLandingPhase = false;
  landingTimer = 0;

  player.x = canvas.width / 2;
  player.y = canvas.height - 100;
  updatePlayerSize(currentStageIndex);
  if (isBoeingLoaded) player.imgObj = boeingCanvas;

  particles = [];
  runway = null;
  spawnCoin();

  document.getElementById("start-screen").classList.remove("active");
  document.getElementById("game-over-screen").classList.remove("active");
  document.getElementById("victory-screen").classList.remove("active");

  updateHUD();
}

function updateHUD() {
  let stageName = "LANDING PHASE";
  if (currentStageIndex < 6) {
    stageName = stages[currentStageIndex].name;
  } else {
    stageName = stages[5].name + " (LANDING)";
  }
  document.getElementById("stage-display").innerText = `CURRENT: ${stageName}`;

  const progressPercent = Math.min((currentStageIndex / 6) * 100, 100);
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
  if (currentStageIndex >= 6) {
    activeCoin = null;
    isLandingPhase = true;
    updateHUD();
    return;
  }

  const stageInfo = stages[currentStageIndex];
  
  // Center Stage 5 perfectly with the runway
  const spawnX = (currentStageIndex === 5) 
    ? canvas.width / 2 
    : Math.random() * (canvas.width - 100) + 50;

  activeCoin = {
    x: spawnX,
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
  if (gameState !== "PLAYING" && gameState !== "LANDING_ROLL") return;

  // Background Transition Logic
  if (isTransitioningBg) {
    bgFade += 0.02; // Fade takes about ~1 second (50 frames)
    if (bgFade >= 1) {
      bgFade = 1;
      isTransitioningBg = false;
      // Now that we are purely on the runway, spawn Stage 5!
      spawnCoin();
    }
  }

  // Landing logic
  if (isLandingPhase && gameState === "PLAYING") {
    landingTimer++;
    if (landingTimer > 150) { // ~2.5s after collecting Stage 5
      if (Math.abs(player.x - canvas.width / 2) < 150) {
        gameState = "LANDING_ROLL";
      } else {
        gameOver();
        document.getElementById("final-stage").innerText = "CRASHED: Missed Runway!";
      }
    }
  }

  // Scroll Background
  if (gameState === "PLAYING" || gameState === "LANDING_ROLL") {
    bgY += scrollSpeed;
    if (bgFade > 0 || isTransitioningBg) {
      runwayScrollY += scrollSpeed;
    }
  }

  // Player Movement (Left/Right only)
  if (gameState === "PLAYING") {
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
  }

  // Active Coin logic
  if (gameState === "PLAYING" && activeCoin) {
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
      updatePlayerSize(currentStageIndex);

      // When Stage 4 is collected (making index 5), trigger the terrain transition
      if (currentStageIndex === 5) {
        isTransitioningBg = true;
        activeCoin = null; // Wait for transition to finish before spawning Stage 5
      } else {
        // Check for player upgrade after Stage 5
        if (currentStageIndex === 6) {
          spawnExplosion(player.x, player.y, "#D4AF37"); // Upgrade effect — ET gold
        }
        
        activeCoin = null;
        setTimeout(spawnCoin, 1000); // 1 second delay before next coin
      }
    }
  }

  if (gameState === "LANDING_ROLL") {
    scrollSpeed -= 0.02;
    player.x += (canvas.width / 2 - player.x) * 0.05;
    player.y -= 1; // Move up a bit for realism

    if (scrollSpeed <= 0) {
      scrollSpeed = 0;
      gameState = "LANDED"; // plane stopped
      setTimeout(victory, 800); 
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

  const drawSeamlessBlock = (img, startY, alpha, scale) => {
    if (!img || !img.complete) return;
    ctx.globalAlpha = alpha;
    
    const W = img.width * scale;
    const H = img.height * scale;
    const offsetX = (canvas.width - W) / 2; // Keep runway perfectly centered
    
    ctx.drawImage(img, offsetX, startY, W, H);
    ctx.save();
    ctx.translate(0, startY + 2 * H);
    ctx.scale(1, -1);
    ctx.drawImage(img, offsetX, 0, W, H);
    ctx.restore();
    ctx.globalAlpha = 1;
  };

  const getScale = (img) => Math.max(canvas.width / img.width, canvas.height / img.height);

  // Mountains Background (Seamless Loop)
  if (bgImg && bgImg.complete && bgFade < 1) {
    const scale = getScale(bgImg);
    const H = bgImg.height * scale;
    let myY = bgY % (H * 2);
    drawSeamlessBlock(bgImg, myY - 2 * H, 1 - bgFade, scale);
    drawSeamlessBlock(bgImg, myY, 1 - bgFade, scale);
  }

  // Runway Background (Single Image, Never Duplicated)
  if (runwayImg && runwayImg.complete && bgFade > 0) {
    // Ensure the runway image is at least 2000px taller than the screen so it can scroll deeply
    const scale = Math.max(canvas.width / runwayImg.width, (canvas.height + 2000) / runwayImg.height);
    const H = runwayImg.height * scale;
    const W = runwayImg.width * scale;
    const offsetX = (canvas.width - W) / 2; // Center horizontally
    
    ctx.globalAlpha = bgFade;
    
    // To ensure the plane lands on the exact same physical spot on the runway regardless of screen size,
    // we calculate a scroll multiplier based on the image scale. 
    // 260 original image pixels from the bottom is our target landing spot (based on the mobile layout).
    let scrollMultiplier = (260 * scale - 100) / 300;
    if (scrollMultiplier < 1) scrollMultiplier = 1; // Fallback to preserve the mobile standard
    
    let offsetScroll = runwayScrollY * scrollMultiplier;
    
    // Start drawing so the BOTTOM of the runway image aligns with the bottom of the screen,
    // and let it scroll down organically.
    const drawY = canvas.height - H + offsetScroll;
    ctx.drawImage(runwayImg, offsetX, drawY, W, H);
    
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "rgba(2, 13, 8, 0.3)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (gameState === "PLAYING" || gameState === "GAMEOVER" || gameState === "LANDING_ROLL" || gameState === "LANDED") {
    // Draw Player
    if (player.imgObj) {
      ctx.save();
      
      // Dynamic 3D drop-shadow
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = player.width * 0.15;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = player.width * 0.1;
      
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
  if (gameState === "PLAYING" || gameState === "LANDING_ROLL" || gameState === "LANDED") {
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
