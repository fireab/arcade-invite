// Game Constants & Configuration
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PLAYER_SPEED = 7;
const COIN_SPEED = 3;

// State
let canvas, ctx;
let gameState = 'START'; // START, PLAYING, GAMEOVER, VICTORY
let currentStageIndex = 0;

const stages = [
    { name: 'Ground Class', imgSrc: './book.png', imgObj: null },
    { name: 'Stage 1', imgSrc: './da40.png', imgObj: null },
    { name: 'Stage 2', imgSrc: './da40.png', imgObj: null },
    { name: 'Stage 3', imgSrc: './da40.png', imgObj: null },
    { name: 'Stage 4', imgSrc: './da40.png', imgObj: null },
    { name: 'Stage 5', imgSrc: './da42.png', imgObj: null }
];

let player = { x: 400, y: 500, width: 80, height: 80, speed: PLAYER_SPEED, imgObj: null };
let activeCoin = null; // The falling item
let particles = [];
let stars = [];
let mapCanvas = null; // Cached Ethiopia map background

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

    if (type === 'eat') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'explosion') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.3);
    }
}

// Load images
function loadImages() {
    stages.forEach(stage => {
        const img = new Image();
        img.src = stage.imgSrc;
        stage.imgObj = img;
    });
    // Player starts as da40
    const pImg = new Image();
    pImg.src = './da40.png';
    player.imgObj = pImg;
}

function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    loadImages();

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-restart').addEventListener('click', startGame);
    document.getElementById('btn-screenshot').addEventListener('click', takeScreenshot);

    window.addEventListener('keydown', (e) => {
        if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
    });
    window.addEventListener('keyup', (e) => {
        if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
    });

    canvas.addEventListener('mousedown', (e) => { isMouseDown = true; updateMousePos(e); });
    canvas.addEventListener('mousemove', (e) => { if (isMouseDown) updateMousePos(e); });
    canvas.addEventListener('mouseup', () => { isMouseDown = false; });
    canvas.addEventListener('touchstart', (e) => { isMouseDown = true; updateMousePos(e.touches[0]); }, {passive: false});
    canvas.addEventListener('touchmove', (e) => { if (isMouseDown) updateMousePos(e.touches[0]); }, {passive: false});
    canvas.addEventListener('touchend', () => { isMouseDown = false; });

    for (let i = 0; i < 100; i++) {
        stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 2 + 1,
            speed: Math.random() * 3 + 1
        });
    }

    requestAnimationFrame(gameLoop);
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    player.x = canvas.width / 2;
    player.y = canvas.height - 100;
    createMapCanvas();
}

// ── Mini-Map HUD (bottom-left) ──
const MINIMAP_W = 160;
const MINIMAP_H = 180;
const MINIMAP_PAD = 15;

// Ethiopia outline (normalized 0-1)
const ethOutline = [
    [0.05,0.25],[0.12,0.12],[0.22,0.00],[0.32,0.03],[0.42,0.07],
    [0.52,0.09],[0.60,0.17],[0.68,0.30],[0.82,0.42],[1.00,0.58],
    [0.92,0.73],[0.75,0.80],[0.60,0.79],[0.45,0.74],[0.33,0.76],
    [0.20,0.68],[0.12,0.55],[0.06,0.40]
];

const miniCities = [
    {n:'ADD',x:0.38,y:0.50,cap:true},
    {n:'HWS',x:0.37,y:0.62},{n:'DIR',x:0.58,y:0.40},
    {n:'BAH',x:0.28,y:0.23},{n:'GON',x:0.24,y:0.16}
];

function createMapCanvas() {
    // Static map layer (cached)
    mapCanvas = document.createElement('canvas');
    mapCanvas.width = MINIMAP_W;
    mapCanvas.height = MINIMAP_H;
    const m = mapCanvas.getContext('2d');

    // Background panel
    m.fillStyle = 'rgba(0,20,12,0.7)';
    m.strokeStyle = 'rgba(0,230,118,0.3)';
    m.lineWidth = 1.5;
    m.beginPath();
    m.roundRect(0, 0, MINIMAP_W, MINIMAP_H, 8);
    m.fill(); m.stroke();

    // Inner border
    m.strokeStyle = 'rgba(212,175,55,0.15)';
    m.lineWidth = 0.5;
    m.beginPath();
    m.roundRect(3, 3, MINIMAP_W-6, MINIMAP_H-6, 6);
    m.stroke();

    // Map area within the panel
    const mX = 10, mY = 22, mW = MINIMAP_W - 20, mH = MINIMAP_H - 40;

    // Grid
    m.strokeStyle = 'rgba(0,107,63,0.12)';
    m.lineWidth = 0.3;
    for (let i = 0; i <= 6; i++) {
        m.beginPath(); m.moveTo(mX, mY+i/6*mH); m.lineTo(mX+mW, mY+i/6*mH); m.stroke();
        m.beginPath(); m.moveTo(mX+i/6*mW, mY); m.lineTo(mX+i/6*mW, mY+mH); m.stroke();
    }

    // Country fill
    const pts = ethOutline.map(([x,y]) => ({ x: mX+x*mW, y: mY+y*mH }));
    m.beginPath(); m.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => m.lineTo(p.x, p.y)); m.closePath();
    m.fillStyle = 'rgba(0,107,63,0.15)'; m.fill();

    // Country border
    m.setLineDash([3,2]); m.strokeStyle = 'rgba(0,230,118,0.35)'; m.lineWidth = 1;
    m.beginPath(); m.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => m.lineTo(p.x, p.y)); m.closePath(); m.stroke();
    m.setLineDash([]);

    // Ras Dashen mountain
    const rX = mX+0.35*mW, rY = mY+0.12*mH;
    m.fillStyle = 'rgba(212,175,55,0.3)';
    m.beginPath(); m.moveTo(rX-4, rY+4); m.lineTo(rX, rY-4); m.lineTo(rX+4, rY+4); m.closePath(); m.fill();

    // Cities
    miniCities.forEach(c => {
        const cx = mX+c.x*mW, cy = mY+c.y*mH;
        if (c.cap) {
            m.fillStyle = 'rgba(212,175,55,0.5)';
            m.beginPath(); m.arc(cx,cy,2.5,0,Math.PI*2); m.fill();
        } else {
            m.fillStyle = 'rgba(0,230,118,0.3)';
            m.beginPath(); m.arc(cx,cy,1.5,0,Math.PI*2); m.fill();
        }
        m.fillStyle = c.cap ? 'rgba(212,175,55,0.5)' : 'rgba(0,230,118,0.25)';
        m.font = '4px "Press Start 2P"'; m.textAlign='center';
        m.fillText(c.n, cx, cy-5);
    });

    // Title bar
    m.fillStyle = 'rgba(0,230,118,0.4)';
    m.font = '5px "Press Start 2P"'; m.textAlign = 'center';
    m.fillText('ETHIOPIA', MINIMAP_W/2, 14);

    // ET flag stripe at very top
    const stripeY = 4, stripeH = 2;
    m.fillStyle = '#006B3F'; m.fillRect(8, stripeY, (MINIMAP_W-16)/3, stripeH);
    m.fillStyle = '#D4AF37'; m.fillRect(8+(MINIMAP_W-16)/3, stripeY, (MINIMAP_W-16)/3, stripeH);
    m.fillStyle = '#E31937'; m.fillRect(8+2*(MINIMAP_W-16)/3, stripeY, (MINIMAP_W-16)/3, stripeH);
}

// Draw live mini-map with blip tracking the falling item
function drawMiniMap() {
    if (!mapCanvas) return;

    const mx = MINIMAP_PAD;
    const my = canvas.height - MINIMAP_H - MINIMAP_PAD;

    // Draw cached static map
    ctx.globalAlpha = 0.85;
    ctx.drawImage(mapCanvas, mx, my);
    ctx.globalAlpha = 1;

    // Map content area within mini-map
    const mX = mx + 10, mY = my + 22, mW = MINIMAP_W - 20, mH = MINIMAP_H - 40;

    // Live blip for active coin (map screen position → map position)
    if (activeCoin && gameState === 'PLAYING') {
        // Map coin's screen X to Ethiopia map X, coin Y to map Y
        const blipX = mX + (activeCoin.x / canvas.width) * mW;
        const blipY = mY + (activeCoin.y / canvas.height) * mH;
        const pulse = Math.sin(Date.now() * 0.008) * 0.3 + 0.7;

        // Blip glow
        ctx.fillStyle = `rgba(227,25,55,${0.15 * pulse})`;
        ctx.beginPath(); ctx.arc(blipX, blipY, 8, 0, Math.PI*2); ctx.fill();

        // Blip dot
        ctx.fillStyle = `rgba(227,25,55,${0.8 * pulse})`;
        ctx.beginPath(); ctx.arc(blipX, blipY, 3, 0, Math.PI*2); ctx.fill();

        // Blip ring
        ctx.strokeStyle = `rgba(227,25,55,${0.4 * pulse})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(blipX, blipY, 5 + Math.sin(Date.now()*0.005)*2, 0, Math.PI*2); ctx.stroke();
    }

    // Player blip
    if (gameState === 'PLAYING') {
        const pBlipX = mX + (player.x / canvas.width) * mW;
        const pBlipY = mY + mH - 5;
        ctx.fillStyle = 'rgba(0,230,118,0.7)';
        ctx.beginPath(); ctx.arc(pBlipX, pBlipY, 2, 0, Math.PI*2); ctx.fill();
    }

    // Stage label at bottom of mini-map
    if (gameState === 'PLAYING' && stages[currentStageIndex]) {
        ctx.fillStyle = 'rgba(212,175,55,0.6)';
        ctx.font = '5px "Press Start 2P"'; ctx.textAlign = 'center';
        ctx.fillText(stages[currentStageIndex].name.toUpperCase(), mx + MINIMAP_W/2, my + MINIMAP_H - 8);
    }
}

function updateMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    mousePos.x = evt.clientX - rect.left;
}

function startGame() {
    initAudio();
    gameState = 'PLAYING';
    currentStageIndex = 0;
    
    player.x = canvas.width / 2;
    player.y = canvas.height - 100;
    // reset player image to da40
    player.imgObj = stages[1].imgObj; // da40.jpeg
    
    particles = [];
    spawnCoin();

    document.getElementById('start-screen').classList.remove('active');
    document.getElementById('game-over-screen').classList.remove('active');
    document.getElementById('victory-screen').classList.remove('active');
    
    updateHUD();
}

function updateHUD() {
    let stageName = stages[currentStageIndex] ? stages[currentStageIndex].name : 'COMPLETED';
    document.getElementById('stage-display').innerText = `CURRENT: ${stageName}`;
    
    const progressPercent = (currentStageIndex / stages.length) * 100;
    document.getElementById('progress-bar').style.width = `${progressPercent}%`;
}

function gameOver() {
    gameState = 'GAMEOVER';
    playSound('explosion');
    document.getElementById('game-over-screen').classList.add('active');
    document.getElementById('final-stage').innerText = `MISSED: ${stages[currentStageIndex].name}`;
}

function victory() {
    gameState = 'VICTORY';
    document.getElementById('victory-screen').classList.add('active');
    // Ethiopian flag colored fireworks: green, gold, red
    const etColors = ['#006B3F', '#D4AF37', '#E31937', '#00e676'];
    setInterval(() => {
        const color = etColors[Math.floor(Math.random() * etColors.length)];
        spawnExplosion(Math.random() * canvas.width, Math.random() * canvas.height, color);
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
        speed: COIN_SPEED + (currentStageIndex * 0.5),
        stage: stageInfo
    };
    updateHUD();
}

function spawnExplosion(x, y, color = '#ff0') {
    for (let i = 0; i < 20; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1,
            color: color
        });
    }
}

function update() {
    if (gameState !== 'PLAYING') return;

    // Background Stars
    stars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) {
            star.y = 0;
            star.x = Math.random() * canvas.width;
        }
    });

    // Player Movement (Left/Right only)
    if (keys.ArrowLeft || keys.a) player.x -= player.speed;
    if (keys.ArrowRight || keys.d) player.x += player.speed;

    if (isMouseDown) {
        const dx = mousePos.x - player.x;
        player.x += dx * 0.1;
    }

    player.x = Math.max(player.width/2, Math.min(canvas.width - player.width/2, player.x));

    // Active Coin logic
    if (activeCoin) {
        activeCoin.y += activeCoin.speed;
        
        // If coin falls off the bottom
        if (activeCoin.y > canvas.height + activeCoin.height) {
            gameOver();
            return;
        }

        // Collision with player
        if (Math.abs(activeCoin.x - player.x) < (activeCoin.width + player.width)/2.5 && 
            Math.abs(activeCoin.y - player.y) < (activeCoin.height + player.height)/2.5) {
            
            playSound('eat');
            spawnExplosion(activeCoin.x, activeCoin.y, '#00e676');
            
            currentStageIndex++;
            
            // Check for player upgrade after Stage 4
            if (currentStageIndex === 5) { // Index 5 is Stage 5 (da42)
                player.imgObj = stages[5].imgObj; // da42
                spawnExplosion(player.x, player.y, '#D4AF37'); // Upgrade effect — ET gold
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

    ctx.fillStyle = '#fff';
    stars.forEach(star => {
        ctx.globalAlpha = Math.random() * 0.5 + 0.5;
        ctx.fillRect(star.x, star.y, star.size, star.size);
    });
    ctx.globalAlpha = 1;

    if (gameState === 'PLAYING' || gameState === 'GAMEOVER') {
        // Draw Player
        if (player.imgObj && player.imgObj.complete) {
            ctx.save();
            ctx.translate(player.x, player.y);
            ctx.drawImage(player.imgObj, -player.width/2, -player.height/2, player.width, player.height);
            ctx.restore();
        } else {
            // Fallback rectangle — ET green
            ctx.fillStyle = '#006B3F';
            ctx.fillRect(player.x - player.width/2, player.y - player.height/2, player.width, player.height);
        }

        // Draw Active Coin
        if (activeCoin) {
            if (activeCoin.stage.imgObj && activeCoin.stage.imgObj.complete) {
                ctx.save();
                ctx.translate(activeCoin.x, activeCoin.y);
                ctx.drawImage(activeCoin.stage.imgObj, -activeCoin.width/2, -activeCoin.height/2, activeCoin.width, activeCoin.height);
                
                // Draw Label below the coin
                ctx.fillStyle = '#D4AF37';
                ctx.font = '10px "Press Start 2P"';
                ctx.textAlign = 'center';
                ctx.fillText(activeCoin.stage.name, 0, activeCoin.height/2 + 15);
                ctx.restore();
            } else {
                ctx.fillStyle = '#D4AF37';
                ctx.fillRect(activeCoin.x - activeCoin.width/2, activeCoin.y - activeCoin.height/2, activeCoin.width, activeCoin.height);
            }
        }
    }

    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.life * 5, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Mini-map HUD overlay
    if (gameState === 'PLAYING') {
        drawMiniMap();
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

function takeScreenshot() {
    const card = document.querySelector('.invitation-card');
    const btn = document.getElementById('btn-screenshot');
    
    // Temporarily hide the button so it doesn't appear in the screenshot
    btn.style.display = 'none';
    
    // Pause the float animation for a clean capture
    card.style.animation = 'none';
    card.style.transform = 'translateY(0)';
    
    html2canvas(card, {
        backgroundColor: '#020d08',
        scale: 2, // Higher resolution
        useCORS: true,
        logging: false
    }).then(screenshotCanvas => {
        // Restore button and animation
        btn.style.display = '';
        card.style.animation = '';
        card.style.transform = '';
        
        // Create download link
        const link = document.createElement('a');
        link.download = 'batch3-flash-ceremony-invitation.png';
        link.href = screenshotCanvas.toDataURL('image/png');
        link.click();
        
        // Visual feedback
        const originalText = btn.innerHTML;
        btn.innerHTML = '✅ SAVED!';
        btn.classList.add('screenshot-success');
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.classList.remove('screenshot-success');
        }, 2000);
    }).catch(err => {
        // Restore button on error
        btn.style.display = '';
        card.style.animation = '';
        card.style.transform = '';
        console.error('Screenshot failed:', err);
    });
}

window.onload = init;
