/**
 * Neon Catch: Hyper-Commerce - Final Advanced Engine
 * Features: Level Select, Persistent Shop, Abilities (Magnet & Freeze), Currency (Gold),
 * Optimized Collision (2.2x), and Retuned Levels.
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

window.onerror = function(msg, url, lineNo, columnNo, error) {
    alert("Kritik Hata: " + msg + "\nSatır: " + lineNo);
    return false;
};

// --- Element Refs ---
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const streakEl = document.getElementById('streak');
const goldEl = document.getElementById('gold-amount');
const totalGoldEl = document.getElementById('total-gold');
const timerDisplayEl = document.getElementById('timer-display');
const levelDisplayEl = document.getElementById('level-display');
const timerBar = document.getElementById('timer-bar');
const healthBar = document.getElementById('health-bar');
const menuScreen = document.getElementById('menu-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const overTitleEl = document.getElementById('over-title');
const highScoreEl = document.getElementById('high-score');
const finalScoreEl = document.getElementById('final-score');
const earnedGoldEl = document.getElementById('earned-gold');
const lockMsgEl = document.getElementById('unlock-msg');
const menuBtn = document.getElementById('menu-btn');
const levelButtons = document.querySelectorAll('.lvl-btn');
const shopBtns = document.querySelectorAll('.buy-btn');
const tabBtns = document.querySelectorAll('.tab-btn');
const musicToggle = document.getElementById('music-toggle');
const bgMusic = document.getElementById('bg-music');

// --- Game Configuration ---
const CONFIG = {
    maxHealth: 100,
    starCount: 120,
    levels: [
        { id: 1, threshold: 1000, time: 240, speed: 2.4, size: 40, missLimit: Infinity, color: '#00f3ff' },
        { id: 2, threshold: 2000, time: 180, speed: 3.5, size: 35, missLimit: Infinity, color: '#00ffaa' },
        { id: 3, threshold: 5000, time: 120, speed: 5.2, size: 30, missLimit: 15, color: '#ffff00' },
        { id: 4, threshold: 10000, time: 60, speed: 6.5, size: 25, missLimit: 12, color: '#ffaa00' },
        { id: 5, threshold: 17000, time: 60, speed: 6.8, size: 28, missLimit: 10, color: '#ff00ff' }
    ],
    comboColors: ['#00f3ff', '#00ffaa', '#ffff00', '#ffaa00', '#ff00ff', '#ffffff']
};

// --- State ---
let state = 'MENU';
let score = 0;
let combo = 0;
let missStreak = 0;
let gold = parseInt(localStorage.getItem('neon_gold')) || 0;
let health = CONFIG.maxHealth;
let currentLevel = null;
let timer = 0;
let lastTime = 0;
let lastSpawnTime = 0;
let items = [];
let stars = [];
let particles = [];
let player = { x: window.innerWidth / 2, y: window.innerHeight / 2, radius: 12, color: '#00f3ff' };
let thresholdReached = false;
let lastGoldSpawnTime = 0;

// --- Abilities State ---
let rawInv = localStorage.getItem('neon_inventory');
let inventory = { magnet: 0, freeze: 0 };
try { 
    if (rawInv) {
        let parsed = JSON.parse(rawInv);
        inventory.magnet = parseInt(parsed.magnet) || 0;
        inventory.freeze = parseInt(parsed.freeze) || 0;
    }
} catch(e) { console.error("Envanter hatası:", e); }

let magnetActive = 0;
let freezeActive = 0;
let isMusicOn = false;

// --- Persistence ---
function saveStats() {
    localStorage.setItem('neon_gold', gold);
    localStorage.setItem('neon_inventory', JSON.stringify(inventory));
    
    let highScore = parseInt(localStorage.getItem('neon_highScore')) || 0;
    if (score > highScore) localStorage.setItem('neon_highScore', score);
    
    if (currentLevel && score >= currentLevel.threshold) {
        let maxLvl = parseInt(localStorage.getItem('neon_maxLevel')) || 1;
        if (currentLevel.id + 1 > maxLvl) localStorage.setItem('neon_maxLevel', currentLevel.id + 1);
    }
}

function loadMenu() {
    if (highScoreEl) highScoreEl.innerText = localStorage.getItem('neon_highScore') || 0;
    if (totalGoldEl) totalGoldEl.innerText = gold;
    
    let maxUnlocked = parseInt(localStorage.getItem('neon_maxLevel')) || 1;
    
    levelButtons.forEach(btn => {
        const id = parseInt(btn.dataset.lvl);
        if (id <= maxUnlocked) btn.classList.remove('locked');
        else btn.classList.add('locked');
    });

    // Update inventory slots safely
    const mSlot = document.getElementById('slot-magnet');
    const fSlot = document.getElementById('slot-freeze');
    
    if (mSlot) {
        mSlot.querySelector('.count').innerText = inventory.magnet || 0;
        mSlot.classList.toggle('owned', inventory.magnet > 0);
    }
    if (fSlot) {
        fSlot.querySelector('.count').innerText = inventory.freeze || 0;
        fSlot.classList.toggle('owned', inventory.freeze > 0);
    }
}

// --- Inputs ---
window.addEventListener('mousemove', e => {
    if (document.pointerLockElement === canvas) {
        player.x += e.movementX; player.y += e.movementY;
        player.x = Math.max(player.radius, Math.min(canvas.width - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(canvas.height - player.radius, player.y));
    }
});

window.addEventListener('keydown', e => {
    if (state === 'GAMEOVER' && e.key === 'Tab') {
        e.preventDefault();
        returnToMenu();
    }
    if (e.key === 'Escape') {
        if (state === 'PLAYING') endGame('DURAKLATILDI', false);
        else if (state === 'GAMEOVER') returnToMenu();
    }
    if (state !== 'PLAYING') return;
    if (e.key === '1') activateMagnet();
    if (e.key === '2') activateTimeFreeze();
});

function activateMagnet() {
    if (inventory.magnet > 0 && magnetActive <= 0) {
        inventory.magnet--;
        magnetActive = 10; // 10 seconds
        playSfx(400, 'sine', 0.5, 0.3);
        document.getElementById('slot-magnet').classList.add('active');
        loadMenu();
    }
}

function activateTimeFreeze() {
    if (inventory.freeze > 0 && freezeActive <= 0) {
        inventory.freeze--;
        freezeActive = 5; // 5 seconds
        playSfx(200, 'square', 0.5, 0.3);
        document.getElementById('slot-freeze').classList.add('active');
        loadMenu();
    }
}

// --- Audio ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSfx(freq, type, dur, vol) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.connect(gain); gain.connect(audioCtx.destination);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    osc.start(); osc.stop(audioCtx.currentTime + dur);
}

// --- Classes ---
class Star {
    constructor() { this.reset(); this.y = Math.random() * canvas.height; }
    reset() { this.x = Math.random() * canvas.width; this.y = -10; this.size = Math.random() * 2; this.speed = Math.random() * 2 + 1; this.alpha = Math.random() * 0.5 + 0.2; }
    update() { this.y += this.speed; if (this.y > canvas.height) this.reset(); }
    draw() { ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); }
}

class Item {
    constructor(isFake = false, isGold = false) {
        this.isFake = isFake;
        this.isGold = isGold;
        this.sides = (isFake || isGold) ? 0 : Math.floor(Math.random() * 4) + 3; // 3 to 6 sides
        this.radius = isFake ? currentLevel.size * 1.1 : (isGold ? currentLevel.size * 0.9 : currentLevel.size);
        this.x = Math.random() * (canvas.width - 60) + 30; this.y = -50;
        this.speed = currentLevel.speed + (Math.random() * 1.5);
        this.color = isFake ? '#ff003c' : (isGold ? '#ffd700' : currentLevel.color);
        this.rotation = 0; this.rotSpd = (Math.random() - 0.5) * 0.15;
    }
    update(dt) {
        if (freezeActive > 0) return;
        if (magnetActive > 0 && !this.isFake) {
            const dx = player.x - this.x; const dy = player.y - this.y;
            this.x += dx * 0.05; this.y += dy * 0.05;
        }
        this.y += this.speed; this.rotation += this.rotSpd;
    }
    draw() {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rotation);
        ctx.shadowBlur = 15; ctx.shadowColor = this.color; ctx.strokeStyle = this.color;
        ctx.lineWidth = 3; ctx.beginPath();
        const r = this.radius;
        
        if (this.isFake) { 
            ctx.moveTo(-r, -r); ctx.lineTo(r, r); ctx.moveTo(r, -r); ctx.lineTo(-r, r); 
        } else if (this.isGold) {
            ctx.arc(0, 0, r, 0, Math.PI * 2);
            ctx.font = "bold 15px Arial"; ctx.fillStyle = "#ffd700"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            ctx.fillText("G", 0, 0);
        } else if (this.sides > 0) {
            for (let i = 0; i < this.sides; i++) {
                const angle = (i / this.sides) * Math.PI * 2;
                const px = Math.cos(angle) * r;
                const py = Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
        }
        ctx.stroke(); ctx.restore();
    }
}

class Particle {
    constructor(x, y, color) { this.x = x; this.y = y; this.color = color; this.vx = (Math.random() - 0.5) * 10; this.vy = (Math.random() - 0.5) * 10; this.alpha = 1; }
    update() { this.x += this.vx; this.y += this.vy; this.alpha -= 0.03; }
    draw() { ctx.save(); ctx.globalAlpha = this.alpha; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, 2, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
}

// --- Engine ---
function update(now) {
    if (!lastTime) { lastTime = now; return; }
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    
    stars.forEach(s => s.update());
    
    if (state !== 'PLAYING') return;

    // Ability Timers
    if (magnetActive > 0) {
        magnetActive -= dt;
        if (magnetActive <= 0) document.getElementById('slot-magnet').classList.remove('active');
    }
    if (freezeActive > 0) {
        freezeActive -= dt;
        if (freezeActive <= 0) document.getElementById('slot-freeze').classList.remove('active');
    }

    // Timer
    if (freezeActive <= 0) timer -= dt;
    timerDisplayEl.innerText = `TIME: ${Math.ceil(timer)}s`;
    timerBar.style.width = (timer / currentLevel.time) * 100 + '%';
    if (timer <= 0) endGame('ZAMAN DOLDU!', false);

    // Spawning
    if (freezeActive <= 0) {
        const spawnFreq = 1200 / (currentLevel.speed * 0.6); 
        if (now - lastSpawnTime > spawnFreq) {
            const maxMulti = Math.min(Math.floor(currentLevel.id / 1.4) + 1, 4); 
            const count = Math.floor(Math.random() * maxMulti) + 1;
            for(let i=0; i<count; i++) {
                const isFake = Math.random() < (0.12 + currentLevel.id * 0.03);
                items.push(new Item(isFake, false)); // Regular and fake items
            }
            lastSpawnTime = now;
        }
        
        // 15-Second Gold Timer
        if (currentLevel.id >= 2 && now - lastGoldSpawnTime > 15000) {
            items.push(new Item(false, true)); // One gold item every 15s
            lastGoldSpawnTime = now;
        }
    }

    items.forEach((item, i) => {
        item.update(dt);
        const dist = Math.hypot(player.x - item.x, player.y - item.y);
        
        if (dist < (player.radius + item.radius) * 2.2) {
            if (item.isFake) {
                score = Math.max(0, score - 300); combo = 0; health -= 8;
                playSfx(150, 'sawtooth', 0.2, 0.2);
            } else if (item.isGold) {
                const goldValues = { 2: 10, 3: 50, 4: 70, 5: 100 };
                const award = goldValues[currentLevel.id] || 0;
                gold += award;
                playSfx(1000, 'sine', 0.2, 0.3);
            } else {
                score += 100; combo++; missStreak = 0;
                playSfx(600 + (combo * 10), 'sine', 0.1, 0.1);
                
                if (!thresholdReached && score >= currentLevel.threshold) {
                    thresholdReached = true;
                    saveStats(); // Unlock next level
                    const nextLvl = currentLevel.id + 1;
                    showGameNotification(`LEVEL ${nextLvl} AÇILDI!`, 5000);
                }
            }
            createExplosion(item.x, item.y, item.color);
            items.splice(i, 1);
        } else if (item.y > canvas.height + 50) {
            if (!item.isFake) { health -= 3; combo = 0; missStreak++; 
                if (currentLevel.missLimit !== Infinity && missStreak >= currentLevel.missLimit) endGame('ÇOK FAZLA KAÇIRDIN!', false);
            }
            items.splice(i, 1);
        }
    });

    particles.forEach((p, i) => { p.update(); if (p.alpha <= 0) particles.splice(i, 1); });
    
    scoreEl.innerText = score;
    comboEl.innerText = combo;
    healthBar.style.width = health + '%';
    goldEl.innerText = gold;
    if (health <= 0) endGame('SİNYAL KESİLDİ', false);

    if (currentLevel.missLimit !== Infinity) {
        document.getElementById('streak-container').classList.remove('hidden');
        document.getElementById('streak').innerText = missStreak;
        document.getElementById('streak-limit').innerText = currentLevel.missLimit;
    } else document.getElementById('streak-container').classList.add('hidden');

    const colorIdx = Math.min(Math.floor(combo / 10), CONFIG.comboColors.length - 1);
    player.color = CONFIG.comboColors[colorIdx];
}

function draw() {
    ctx.fillStyle = freezeActive > 0 ? '#101a2f' : '#050510'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => s.draw());
    if (state !== 'MENU') {
        ctx.save(); ctx.translate(player.x, player.y); ctx.shadowBlur = magnetActive > 0 ? 50 : 30; ctx.shadowColor = player.color;
        ctx.fillStyle = player.color; ctx.beginPath(); ctx.arc(0, 0, player.radius, 0, Math.PI * 2); ctx.fill(); 
        if (magnetActive > 0) { ctx.strokeStyle = '#00f3ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, player.radius + 10, 0, Math.PI * 2); ctx.stroke(); }
        ctx.restore();
        items.forEach(it => it.draw());
        particles.forEach(p => p.draw());
    }
}

function endGame(title, success) {
    state = 'GAMEOVER';
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    canvas.style.cursor = 'auto';
    overTitleEl.innerText = title;
    finalScoreEl.innerText = score;
    
    earnedGoldEl.innerText = 0; // Removed automatic end-game gold conversion
    earnedGoldEl.parentElement.classList.add('hidden'); // Hide earned gold row if desired
    saveStats();
    
    lockMsgEl.innerText = success ? (currentLevel.id < 5 ? `SEVİYE ${currentLevel.id+1} AÇILDI!` : 'USTALIK KANITLANDI!') : 'DİKKATLİ OL!';
    gameOverScreen.classList.remove('hidden');
}

function startLevel(lvlId) {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    currentLevel = CONFIG.levels.find(l => l.id === lvlId);
    if (!currentLevel) return alert("Seviye bulunamadı!");
    
    score = 0; combo = 0; missStreak = 0; health = CONFIG.maxHealth;
    timer = currentLevel.time; items = []; particles = []; magnetActive = 0; freezeActive = 0;
    
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    thresholdReached = false;
    lastGoldSpawnTime = performance.now();
    document.getElementById('game-notification').classList.add('hidden');
    
    if (levelDisplayEl) levelDisplayEl.innerText = `LEVEL ${currentLevel.id}`;
    canvas.requestPointerLock();
    state = 'PLAYING';
    menuScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
}

// --- Menu Controls ---
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        const targetContainer = document.getElementById(`${btn.dataset.tab}-container`);
        if (targetContainer) targetContainer.classList.remove('hidden');
    });
});

levelButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        if (!btn.classList.contains('locked')) startLevel(parseInt(btn.dataset.lvl));
    });
});

shopBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const cost = parseInt(btn.dataset.cost);
        const itemType = btn.closest('.shop-item').dataset.item;
        if (gold >= cost) {
            gold -= cost;
            inventory[itemType]++;
            saveStats(); loadMenu();
            playSfx(800, 'sine', 0.2, 0.2);
        } else alert("Yeterli altın yok!");
    });
});

function returnToMenu() {
    gameOverScreen.classList.add('hidden'); 
    menuScreen.classList.remove('hidden'); 
    loadMenu(); 
    state = 'MENU';
}

menuBtn.addEventListener('click', returnToMenu);
menuBtn.classList.add('hidden'); // Hidden as per request to use Tab only

function showGameNotification(text, duration) {
    const el = document.getElementById('game-notification');
    el.innerText = text;
    el.classList.remove('hidden');
    playSfx(800, 'sine', 0.3, 0.2); // Success sound
    setTimeout(() => {
        el.classList.add('hidden');
    }, duration);
}

musicToggle.addEventListener('click', () => { isMusicOn = !isMusicOn; updateMusic(); });
function updateMusic() {
    if (isMusicOn) { bgMusic.play().catch(e => {}); musicToggle.innerText = '🔊 MUSIC: ON'; }
    else { bgMusic.pause(); musicToggle.innerText = '🔈 MUSIC: OFF'; }
}
window.addEventListener('mousedown', () => { if (!isMusicOn) { isMusicOn = true; updateMusic(); } }, { once: true });
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; });

function init() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    for (let i = 0; i < CONFIG.starCount; i++) stars.push(new Star());
    loadMenu();
    requestAnimationFrame(function loop(now) { update(now); draw(); requestAnimationFrame(loop); });
}
function createExplosion(x, y, color) { for (let i = 0; i < 10; i++) particles.push(new Particle(x, y, color)); }
window.addEventListener('load', init);
