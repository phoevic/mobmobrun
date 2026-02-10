/* script.js - 게임의 두뇌 및 동작 (최종 수정본) */

const wrapper = document.getElementById('game-wrapper');
const LANE_HEIGHT = 80, GRID_SIZE = 60, LEVEL_DIST = 40, MAX_LIVES = 5;
let canvas, ctx, animationFrameId;
let gameState = 'START', lastMenuState = 'START';
let floatingTexts = []; // 화면에 떠다닐 텍스트들을 담는 바구니

// 💾 저장 데이터 불러오기
let totalMP = parseInt(localStorage.getItem('mobis_final_mp')) || 100;
let myCollection = new Set(JSON.parse(localStorage.getItem('mobis_final_col')) || [28, 999]);
let selectedId = parseInt(localStorage.getItem('mobis_final_selected')) || 28;
let bestDist = parseInt(localStorage.getItem('mobis_final_best')) || 0;

// 👕 옷장 & 효과 상태 변수
let selectedTopIdx = parseInt(localStorage.getItem('mobis_top')) || 0;
let selectedBottomIdx = parseInt(localStorage.getItem('mobis_bottom')) || 0;
let selectedEffectIdx = parseInt(localStorage.getItem('mobis_effect')) || 0;

// 🎒 인벤토리
let myTops = new Set(JSON.parse(localStorage.getItem('mobis_my_tops')) || [0]);
let myBottoms = new Set(JSON.parse(localStorage.getItem('mobis_my_bottoms')) || [0]);
let myEffects = new Set(JSON.parse(localStorage.getItem('mobis_my_effects')) || [0]);

let player = { lane: 0, x: 0, targetX: 0, currentX: 0 };
let lives = 3, currentLevel = 1, score = 0, earnedMP = 0, shotClock = 100, cameraY = 0, lanes = [], invulnerable = 0, consecutiveRoads = 0;

/* --- 슈팅 보너스용 변수 --- */
let shootingBullets = [], shootingEnemies = [], shootingParticles = [], shootingTimer = 0, shootingKills = 0;
let keys = {}; 
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
let touchStartX = 0, touchStartY = 0, touchMoved = false;

// --- 그리기 함수들 ---
function drawCustomSprite(targetCtx, data, palette, x, y, size) {
    if (!targetCtx || !data) return;
    const pLength = data.length;
    const pSize = size / pLength;
    data.forEach((row, rIdx) => { 
        row.forEach((cIdx, colIdx) => { 
            const color = palette[cIdx]; 
            if (color && color !== "transparent") { 
                targetCtx.fillStyle = color; 
                targetCtx.fillRect(x + colIdx * pSize, y + rIdx * pSize, Math.ceil(pSize), Math.ceil(pSize)); 
            } 
        }); 
    });
}

// 💾 스프라이트 캐시 저장소 (렉 방지 핵심)
const spriteCache = {};

function drawSprite32(targetCtx, spriteName, colors, x, y, size) {
    if (!targetCtx) return;

    // 자동차인지 확인 (최적화 대상)
    const isCar = spriteName.startsWith('car_');

    if (isCar) {
        // 1. 캐시 키 생성 (차종 + 차체 색상)
        const carBodyColor = (colors && colors[9]) ? colors[9] : 'def';
        const cacheKey = spriteName + '_' + carBodyColor; 

        // 2. 캐시 적중! (이미 그려둔 그림 사용 -> 초고속)
        const cached = spriteCache[cacheKey];
        if (cached) {
            // 저장된 비율(ratio)을 이용해 가로 길이를 계산
            const drawW = size * cached.ratio;
            targetCtx.drawImage(cached.img, x, y, drawW, size);
            return;
        }

        // 3. 캐시 미스 -> 새로 그리기 (메모리 캔버스 생성)
        const data = Sprites32[spriteName];
        if (!data) return;

        // 데이터의 실제 크기 측정 (64x32 등)
        const h = data.length;
        const w = data[0].length;
        
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const cCtx = c.getContext('2d');
        
        // 픽셀 찍기
        for (let r = 0; r < h; r++) {
            for (let col = 0; col < w; col++) {
                const pVal = data[r][col];
                if (pVal === 0) continue;
                
                // 색상 찾기
                const color = (colors && colors[pVal]) ? colors[pVal] : Colors[pVal];
                if (color) {
                    cCtx.fillStyle = color;
                    cCtx.fillRect(col, r, 1, 1);
                }
            }
        }

        // 결과 저장 (그림 + 비율 정보)
        spriteCache[cacheKey] = { img: c, ratio: w / h };

        // 화면에 그리기
        const drawW = size * (w / h);
        targetCtx.drawImage(c, x, y, drawW, size);
        return;
    }

    // 🟢 [일반 캐릭터] 기존 방식 (매번 그리기 - 동적 변화 대응)
    const data = Sprites32[spriteName];
    if (!data) return;
    
    const pLength = data.length;
    const pSize = size / pLength;
    
    for (let r = 0; r < pLength; r++) {
        for (let c = 0; c < pLength; c++) {
            const pVal = data[r][c];
            if (!pVal) continue;

            let color = (colors && colors[pVal]) ? colors[pVal] : Colors[pVal];
            if (color) { 
                targetCtx.fillStyle = color; 
                targetCtx.fillRect(x + c * pSize, y + r * pSize, Math.ceil(pSize), Math.ceil(pSize)); 
            }
        }
    }
}

function drawDigit(targetCtx, d, dx, dy, ds) {
    const digitData = PixelNumbers[d]; if(!digitData) return;
    digitData.forEach((row, ri) => row.forEach((p, ci) => { if(p) targetCtx.fillRect(dx + ci * ds, dy + ri * ds, ds, ds); }));
}

// 🖌️ 캐릭터 그리기
function drawCharacter(targetCtx, playerObj, x, y, size, teamColor = "#D70025", numOverride = null, overrideTop = null, overrideBottom = null) {
    if (!targetCtx) return;
    
    // 옷 위치 보정값
    const BOT_ADJUST_X = 2; const BOT_ADJUST_Y = 0;
    const TOP_ADJUST_X = 2; const TOP_ADJUST_Y = 0;
    const pixelUnit = size / 64; 

    const sColors = {...Colors, 6: teamColor};
    if (playerObj?.isRedBoo) { drawSprite32(targetCtx, 'redboo', { 0: null, 1: "#000000", 2: "#FFFFFF", 3: "#FF0000" }, x, y, size); return; }
    if (playerObj?.isGongaji) { drawCustomSprite(targetCtx, Sprites32.gongaji, GongajiPalette, x, y, size); return; }
    if (playerObj?.isPegasus) { drawCustomSprite(targetCtx, Sprites32.pegasus, PegasusPalette, x, y, size); return; }
    if (playerObj?.isGorilla) { drawSprite32(targetCtx, 'gorilla', sColors, x, y, size); return; }
    if (playerObj?.isBall || playerObj?.id === 999) { drawSprite32(targetCtx, 'basketball', basketballPalette, x, y, size); return; }
    if (playerObj?.isWhale || playerObj?.id === 26) { drawSprite32(targetCtx, 'whale', Colors, x, y, size); return; }

    const isMyPlayer = !playerObj.team || playerObj.team === "ULSAN HYUNDAI MOBIS";

    if (isMyPlayer) {
        // 몸체
        if (Sprites32['human_player_64'] && Sprites32['human_player_64'].length > 0) {
             drawSprite32(targetCtx, 'human_player_64', sColors, x, y, size);
        } else {
             drawSprite32(targetCtx, 'human_base', sColors, x, y, size);
        }
        // 하의
        const currentBottomId = (overrideBottom !== null) ? overrideBottom : selectedBottomIdx;
        const bItem = gameShopData.bottoms.find(i => i.id === currentBottomId);
        if (bItem && bItem.sprite && Sprites32[bItem.sprite]) {
            const pal = (bItem.paletteId && PaletteMap[bItem.paletteId]) ? PaletteMap[bItem.paletteId] : HomeUniformPalette;
            drawCustomSprite(targetCtx, Sprites32[bItem.sprite], pal, x + (BOT_ADJUST_X * pixelUnit), y + (BOT_ADJUST_Y * pixelUnit), size);
        }
        // 상의
        const currentTopId = (overrideTop !== null) ? overrideTop : selectedTopIdx;
        const tItem = gameShopData.tops.find(i => i.id === currentTopId);
        if (tItem && tItem.sprite && Sprites32[tItem.sprite]) {
            const pal = (tItem.paletteId && PaletteMap[tItem.paletteId]) ? PaletteMap[tItem.paletteId] : HomeUniformPalette;
            drawCustomSprite(targetCtx, Sprites32[tItem.sprite], pal, x + (TOP_ADJUST_X * pixelUnit), y + (TOP_ADJUST_Y * pixelUnit), size);
        }
    } else {
        sColors[3] = playerObj?.hair || "#332211"; 
        drawSprite32(targetCtx, 'human_base', sColors, x, y, size);
    }
    
    // 등번호
    const num = (numOverride !== null && numOverride !== undefined) ? numOverride : playerObj?.number;
    if (num !== undefined && num !== null && !["🐶", "🐳", "🏀", "👹", "🦄"].includes(String(num))) {
        const ns = String(num);
        const pSize = size / 32;

        if (isMyPlayer) {
            targetCtx.fillStyle = "#FFFFFF"; 
            const MY_NUM_X_OFFSET = 1.3;
            const MY_NUM_Y_OFFSET = 17.5;
            const MY_NUM_SIZE = 0.9;

            if (ns.length === 1) {
                drawDigit(targetCtx, ns[0], x + (14 + MY_NUM_X_OFFSET) * pSize, y + MY_NUM_Y_OFFSET * pSize, pSize * (MY_NUM_SIZE * 1.2));
            } else {
                drawDigit(targetCtx, ns[0], x + (12.5 + MY_NUM_X_OFFSET) * pSize, y + MY_NUM_Y_OFFSET * pSize, pSize * MY_NUM_SIZE);
                drawDigit(targetCtx, ns[1], x + (16.5 + MY_NUM_X_OFFSET) * pSize, y + MY_NUM_Y_OFFSET * pSize, pSize * MY_NUM_SIZE);
            }
        } else {
            targetCtx.fillStyle = "white";
            const enemyYOffset = 16 * pSize;
            if (ns.length === 1) {
                drawDigit(targetCtx, ns[0], x + 13.5 * pSize, y + enemyYOffset, pSize * 1.8);
            } else {
                drawDigit(targetCtx, ns[0], x + 9 * pSize, y + enemyYOffset, pSize * 1.3);
                drawDigit(targetCtx, ns[1], x + 16.5 * pSize, y + enemyYOffset, pSize * 1.3);
            }
        }
    }
    
    // 이펙트
    let effectType = 'none';
    const eItem = gameShopData.effects.find(i => i.id === selectedEffectIdx);
    if (eItem) effectType = eItem.type;

    if ((isMyPlayer && effectType === 'star') || ([6, 12, 45].includes(playerObj?.id) && isMyPlayer)) {
        renderStarEffect(targetCtx, x, y, size);
    }
    if (isMyPlayer && effectType === 'heart') {
        renderHeartEffect(targetCtx, x, y, size);
    }
}

function renderStarEffect(ctx, x, y, size) {
    const time = Date.now() / 400; const radius = size * 0.65;
    for (let i = 0; i < 3; i++) {
        const angle = time + (i * Math.PI * 2 / 3);
        const sx = x + size/2 + Math.cos(angle) * radius; 
        const sy = y + size/2 + Math.sin(angle) * radius;
        const s = size/18; 
        ctx.fillStyle = "#FFCA08"; ctx.fillRect(sx - s/2, sy - s*2, s, s*4); ctx.fillRect(sx - s*2, sy - s/2, s*4, s);
        ctx.fillStyle = "white"; ctx.fillRect(sx - s/2, sy - s/2, s, s);
    }
}

function renderHeartEffect(ctx, x, y, size) {
    const time = Date.now() / 300; 
    const hx = x + size/2 + Math.sin(time) * 20;
    const hy = y - 10 + Math.cos(time) * 5;
    ctx.font = "20px Arial"; ctx.fillStyle = "red"; ctx.textAlign = "center";
    ctx.fillText("❤️", hx, hy);
}

// --- UI 및 로직 ---
function syncUI() {
    const map = { 'ui-level': currentLevel, 'ui-score': score, 'ui-mp': totalMP, 'ui-best-game': bestDist, 'ui-best-main': bestDist, 'ui-shop-mp': totalMP, 'ui-clear-mp': totalMP, 'ui-collected-count': myCollection.size };
    for (const [id, val] of Object.entries(map)) { const el = document.getElementById(id); if (el) el.innerText = val; }
    const mc = document.getElementById('ui-collect-main'); if(mc) mc.innerText = `ROSTER: ${myCollection.size}/30`;
    const bar = document.getElementById('lives-bar'); if (bar) {
        bar.innerHTML = '';
        for(let i=0; i<lives; i++) {
            const c = document.createElement('canvas'); c.width = 24; c.height = 24;
            drawCustomSprite(c.getContext('2d'), LifeSpriteData, LifePalette, 0, 0, 24);
            bar.appendChild(c);
        }
    }
}

function showDamageMsg(msg) {
    const el = document.getElementById('damage-msg');
    if (el) { el.innerText = msg; el.style.display = 'block'; setTimeout(() => el.style.display = 'none', 1500); }
}

function saveGameData() {
    localStorage.setItem('mobis_final_mp', totalMP);
    localStorage.setItem('mobis_final_col', JSON.stringify([...myCollection]));
    localStorage.setItem('mobis_final_selected', selectedId);
    localStorage.setItem('mobis_final_best', bestDist);
    
    // 옷장 정보 저장
    localStorage.setItem('mobis_top', selectedTopIdx);
    localStorage.setItem('mobis_bottom', selectedBottomIdx);
    localStorage.setItem('mobis_effect', selectedEffectIdx);
    localStorage.setItem('mobis_my_tops', JSON.stringify([...myTops]));
    localStorage.setItem('mobis_my_bottoms', JSON.stringify([...myBottoms]));
    localStorage.setItem('mobis_my_effects', JSON.stringify([...myEffects]));
}

function resize() {
    canvas = document.getElementById('game-canvas'); 
    if (!canvas) return;
    ctx = canvas.getContext('2d'); 
    
    // ⚡ [중요] 픽셀 아트를 선명하게 유지하고 성능 향상 (여기서 한 번만 실행)
    ctx.imageSmoothingEnabled = false; 

    canvas.width = wrapper.clientWidth; 
    canvas.height = wrapper.clientHeight;
    player.targetX = (Math.floor((canvas.width / 2) / GRID_SIZE) * GRID_SIZE);
    if (gameState !== 'PLAYING') player.currentX = player.targetX; 
    renderPreview(); syncUI();
}

function addLane(idx) {
    let type = 'safe';
    let color = idx % 2 === 0 ? '#d29145' : '#de9b42'; 
    let objs = [];
    
// script.js 내 addLane 함수 중 goal 라인 부분
if (idx > 0 && idx % LEVEL_DIST === 0) {
    type = 'goal'; color = '#D70025';
    
    // 📏 중앙 정렬: (박스 6개 x 간격 60px)에서 마지막 여백 제외 약 340px
    const totalWidth = 340; 
    const startX = (canvas.width - totalWidth) / 2;

    ['M', 'O', 'B', 'I', 'S'].forEach((char, i) => { 
        objs.push({ x: startX + i * 60, type: 'audience', char: char }); 
    });
    // 하트 기호를 넣을 박스 추가
    objs.push({ x: startX + 300, type: 'goal_heart' });
}

else if (idx > 2) {
        const laneLevel = Math.floor(idx / LEVEL_DIST) + 1;
        const cycle = (laneLevel - 1) % 10 + 1;
        let speedMult = 1.0 + (laneLevel * 0.05); if (speedMult > 2.0) speedMult = 2.0;

        let theme = 'road';
        if (cycle >= 3 && cycle <= 4) theme = 'river';       
        else if (cycle >= 5 && cycle <= 6) theme = 'court';  
        else if (cycle >= 7 && cycle <= 8) theme = 'ice';    
        else if (cycle >= 9) theme = 'cosmic';               

        if (theme === 'river') {
            const rand = Math.random();
            if (rand < 0.3) { type = 'river_water'; color = '#42A5F5'; } 
            else if (rand < 0.7) { type = 'river_land'; color = '#81C784'; } 
            else { type = 'safe'; color = '#AED581'; }
            if (type !== 'safe') createEnemyInLane(objs, speedMult, laneLevel, type);
        } else {
            if (theme === 'court') {
                type = 'court'; color = '#e5b382';
                if (Math.random() >= 0.4) createEnemyInLane(objs, speedMult, laneLevel, type);
            } else {
                if (Math.random() < 0.4) {
                    type = 'safe'; 
                    if(theme === 'ice') color = '#E1F5FE'; else if(theme === 'cosmic') color = '#1a1a2e'; else color = '#d29145';
                } else {
                    type = theme;
                    if (type === 'ice') color = '#e0f7fa'; else if (type === 'cosmic') color = '#0a0a2a'; else color = '#4a4a4a';
                    createEnemyInLane(objs, speedMult, laneLevel, type);
                }
            }
        }
    }
if (idx > 3 && idx % LEVEL_DIST !== 0 && Math.random() < 0.2) { 
    const isChoco = Math.random() > 0.7; 
    objs.push({ x: Math.random() * (canvas.width - 60), type: 'item', name: isChoco ? 'CHOCO' : 'BANANA', width: 40, speed: 0 });
}
    lanes.push({ type, color, objects: objs, index: idx });
}

function createEnemyInLane(objs, speedMult, laneLevel, laneType) {
    if (laneType === 'ice') {
        if (Math.random() < 0.7) { 
            const laneX = [0, 60, 120, 180][Math.floor(Math.random() * 4)];
            const isSnowball = Math.random() > 0.4;
            objs.push({
                x: laneX, y: -canvas.height, type: 'ice_falling', subType: isSnowball ? 'snowball' : 'slider',
                width: 60, height: 60, speedY: (5 + Math.random() * 4) * speedMult, 
                name: isSnowball ? "왕눈덩이" : "미끄러지는 선수", team: "동계훈련", color: "#FFFFFF"
            });
        }
        return;
    }
    if (laneType === 'river_water') {
        const speed = (1.5 + Math.random()) * speedMult * 0.7 * (Math.random() > 0.5 ? 1 : -1);
        const count = Math.random() > 0.5 ? 2 : 3;
        for (let i = 0; i < count; i++) {
            const randomWidth = 100 + Math.floor(Math.random() * 90);
            objs.push({ x: (i * 300) + Math.random() * 50, type: 'log', width: randomWidth, height: 40, speed: speed });
        }
        return;
    }

    const carColors = ["#FFB655", "#1785B8", "#F4436", "#2196F3", "#FFEB3B", "#4CAF50", "#FF9800", "#9C27B0", "#795548", "#607D8B"];
    const availableLanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    let maxEnemies = (laneLevel <= 2) ? 1 : (laneLevel <= 4 ? 2 : 3);
    let count = 0;
    const pool = (typeof opponentPool !== 'undefined') ? opponentPool : [];
    const mascots = pool.filter(p => p.isRedBoo || p.isPegasus);
    const players = pool.filter(p => !p.isRedBoo && !p.isPegasus);

    for (let i = 0; i < 4; i++) {
        if (count >= maxEnemies) break;
        let isCar = (laneType === 'road' && Math.random() < 0.5);
        if (Math.random() < 0.5 || isCar) {
            const laneX = availableLanes[i] * 60; 
            const speed = (1.2 + Math.random() * 1.0) * speedMult * (Math.random() > 0.5 ? 1 : -1);
            let finalObj = { x: laneX, width: 60, height: 60, speed: speed };

            if (isCar) {
                finalObj.type = 'pixel_car';
                finalObj.spriteName = Math.random() > 0.5 ? 'car_sedan' : 'car_truck';
                finalObj.carColor = carColors[Math.floor(Math.random() * carColors.length)];
                finalObj.name = "교통사고"; finalObj.team = "안전운전";
            } else {
                finalObj.type = 'player';
                let selectedData = (Math.random() < 0.2 && mascots.length > 0) ? mascots[Math.floor(Math.random() * mascots.length)] : players[Math.floor(Math.random() * players.length)];
                if (selectedData) {
                    finalObj.name = selectedData.name; finalObj.team = selectedData.team;
                    finalObj.number = selectedData.number; finalObj.color = selectedData.color;
                    finalObj.isRedBoo = selectedData.isRedBoo; finalObj.isPegasus = selectedData.isPegasus;
                } else {
                    finalObj.name = "OPPONENT"; finalObj.team = "KBL"; finalObj.number = "00"; finalObj.color = "#333";
                }
            }
            objs.push(finalObj); count++;
        }
    }
}

function triggerGameOver(reason) {
    if (gameState === 'DYING' || gameState === 'OVER') return;
    gameState = 'DYING'; showDamageMsg(reason); if (animationFrameId) cancelAnimationFrame(animationFrameId);
    setTimeout(() => {
        gameState = 'OVER'; bestDist = Math.max(bestDist, score); saveGameData();
        document.querySelectorAll('.overlay, .view').forEach(v => v.classList.add('hidden'));
        document.getElementById('overlay-over').classList.remove('hidden');
        document.getElementById('ui-final-stats').innerHTML = `STAGE: LV.${currentLevel}<br>DIST: ${score}m`;
        syncUI();
    }, 1000);
}

function gameLoop() {

    if (gameState !== 'PLAYING' && gameState !== 'SHOOTING') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (gameState === 'SHOOTING') {
        shootingTimer++;
        if (keys['ArrowLeft']) player.currentX -= 8;
        if (keys['ArrowRight']) player.currentX += 8;
        player.currentX = Math.max(0, Math.min(canvas.width - 60, player.currentX));
        ctx.fillStyle = "#000510"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        if (Math.random() < 0.04) {
            const sX = Math.random() * (canvas.width - 50);
            shootingEnemies.push({ startX: sX, x: sX, y: -50, speed: 3 + Math.random() * 2, theta: Math.random() * Math.PI * 2, amplitude: 30 + Math.random() * 40 });
        }
        if (shootingTimer % 8 === 0) shootingBullets.push({ x: player.currentX + 30, y: canvas.height - 130 });
        shootingBullets.forEach((b, i) => {
            b.y -= 12; ctx.fillStyle = "#00ffff"; ctx.fillRect(b.x - 2, b.y, 4, 15);
            if (b.y < -20) shootingBullets.splice(i, 1);
        });
        shootingEnemies.forEach((en, ei) => {
            en.y += en.speed; en.theta += 0.05; en.x = en.startX + Math.sin(en.theta) * en.amplitude;
            ctx.font = "40px Arial"; ctx.fillText("👾", en.x, en.y + 40);
            shootingBullets.forEach((b, bi) => {
                if (Math.abs(b.x - (en.x + 25)) < 30 && Math.abs(b.y - (en.y + 25)) < 30) {
                    for(let i=0; i<5; i++) shootingParticles.push({ x: en.x + 20, y: en.y + 20, life: 1.0, vx: (Math.random()-0.5)*6, vy: (Math.random()-0.5)*6, size: 2+Math.random()*4, type: 'particle' });
                    shootingEnemies.splice(ei, 1); shootingBullets.splice(bi, 1); shootingKills++; totalMP += 5;
                }
            });
            if (en.y > canvas.height) shootingEnemies.splice(ei, 1);
        });
        shootingParticles.forEach((p, pi) => {
            p.x += p.vx; p.y += p.vy; p.life -= 0.02;
            ctx.globalAlpha = p.life; ctx.fillStyle = "#00ffff"; ctx.fillRect(p.x, p.y, p.size, p.size);
            if (p.life <= 0) shootingParticles.splice(pi, 1);
        });
        ctx.globalAlpha = 1.0;
        const pObj = playerPool.find(p => p.id === selectedId) || playerPool[0];
        drawCharacter(ctx, pObj, player.currentX, canvas.height - 120, 60, "#D70025");
        if (shootingTimer > 720) { alert(`보너스 종료! ${shootingKills}명 격파!`); gameState = 'PLAYING'; syncUI(); }
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }

    cameraY += (player.lane * LANE_HEIGHT - cameraY) * 0.1;
    const baseY = canvas.height - 250;
    let onRiver = false, onLog = false, logSpeed = 0;

    lanes.forEach(lane => {
        const sY = baseY + (cameraY - lane.index * LANE_HEIGHT);
        if (sY < -LANE_HEIGHT || sY > canvas.height) return;

        if (lane.type === 'court') {
            const relIdx = lane.index % LEVEL_DIST; 
            const centerX = canvas.width / 2;
            const bottomHoopY = sY + (relIdx - 4) * LANE_HEIGHT;
            const topHoopY = sY + (relIdx - 35) * LANE_HEIGHT;
            const arcRadius = 400, paintWidth = 140, whiteBoxWidth = 80, borderSize = 45;
            
            ctx.fillStyle = "#E8C68E"; ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);
            ctx.fillStyle = "#111111"; ctx.fillRect(0, sY, borderSize, LANE_HEIGHT); ctx.fillRect(canvas.width - borderSize, sY, borderSize, LANE_HEIGHT);

            if ([5, 10, 15, 20, 25, 30, 35].includes(relIdx)) {
                ctx.fillStyle = "#FFD700"; ctx.font = "24px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText("★", canvas.width - (borderSize/2), sY + LANE_HEIGHT/2);
            }
            const leftText = "HYUNDAI MOBIS PHOEBUS"; const startLane = 8; const charIndex = relIdx - startLane;
            if (charIndex >= 0 && charIndex < leftText.length && leftText[charIndex] !== " ") {
                ctx.save(); ctx.translate(borderSize / 2, sY + LANE_HEIGHT / 2); ctx.rotate(-Math.PI / 2);
                ctx.fillStyle = "white"; ctx.font = "bold 28px Galmuri11"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillText(leftText[charIndex], 0, 0); ctx.restore();
            }

            const mobisRed = "#D50032"; 
            if (relIdx >= 0 && relIdx <= 5) {
                ctx.fillStyle = mobisRed; ctx.fillRect(centerX - (paintWidth/2), sY, paintWidth, LANE_HEIGHT);
                if (relIdx >= 4 && relIdx <= 5) { ctx.fillStyle = "white"; ctx.fillRect(centerX - (whiteBoxWidth/2), sY, whiteBoxWidth, LANE_HEIGHT); }
            }
            if (relIdx >= 34 && relIdx <= 39) {
                ctx.fillStyle = mobisRed; ctx.fillRect(centerX - (paintWidth/2), sY, paintWidth, LANE_HEIGHT);
                if (relIdx >= 34 && relIdx <= 35) { ctx.fillStyle = "white"; ctx.fillRect(centerX - (whiteBoxWidth/2), sY, whiteBoxWidth, LANE_HEIGHT); }
            }

            ctx.strokeStyle = "white"; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.moveTo(borderSize, sY); ctx.lineTo(borderSize, sY + LANE_HEIGHT); ctx.moveTo(canvas.width - borderSize, sY); ctx.lineTo(canvas.width - borderSize, sY + LANE_HEIGHT); ctx.stroke();

            if (relIdx === 0) { ctx.beginPath(); ctx.moveTo(borderSize, sY); ctx.lineTo(canvas.width - borderSize, sY); ctx.stroke(); }
            if (relIdx >= 0 && relIdx <= 5) { ctx.beginPath(); ctx.moveTo(centerX - (paintWidth/2), sY); ctx.lineTo(centerX - (paintWidth/2), sY + LANE_HEIGHT); ctx.moveTo(centerX + (paintWidth/2), sY); ctx.lineTo(centerX + (paintWidth/2), sY + LANE_HEIGHT); ctx.stroke(); }
            if (relIdx === 6) { ctx.beginPath(); ctx.moveTo(centerX - (paintWidth/2), sY + LANE_HEIGHT); ctx.lineTo(centerX + (paintWidth/2), sY + LANE_HEIGHT); ctx.stroke(); ctx.beginPath(); ctx.arc(centerX, sY + LANE_HEIGHT, (paintWidth/2), 0, Math.PI, true); ctx.stroke(); }
            if (relIdx <= 11) { ctx.save(); ctx.beginPath(); ctx.rect(borderSize, sY, canvas.width - borderSize*2, LANE_HEIGHT); ctx.clip(); ctx.beginPath(); ctx.arc(centerX, bottomHoopY, arcRadius, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
            if (relIdx === 4) { ctx.beginPath(); ctx.arc(centerX, sY + LANE_HEIGHT + 39, 30, 0, Math.PI, true); ctx.stroke(); }

            if (relIdx >= 18 && relIdx <= 22) {
                const midY = sY + (relIdx - 20) * LANE_HEIGHT + (LANE_HEIGHT / 2);
                ctx.save(); ctx.beginPath(); ctx.rect(borderSize, sY, canvas.width - borderSize*2, LANE_HEIGHT); ctx.clip();
                if (relIdx === 20) {
                    ctx.beginPath(); ctx.moveTo(borderSize, midY); ctx.lineTo(canvas.width - borderSize, midY); ctx.stroke();
                    ctx.fillStyle = mobisRed; ctx.beginPath(); ctx.arc(centerX, midY, 60, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
                    ctx.fillStyle = "white"; ctx.font = "bold 16px Galmuri11"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("PHOEBUS", centerX, midY);
                } else { ctx.beginPath(); ctx.arc(centerX, midY, 60, 0, Math.PI * 2); ctx.stroke(); }
                ctx.restore();
            }

            if (relIdx === 33) { ctx.beginPath(); ctx.moveTo(centerX - (paintWidth/2), sY); ctx.lineTo(centerX + (paintWidth/2), sY); ctx.stroke(); ctx.beginPath(); ctx.arc(centerX, sY, (paintWidth/2), 0, Math.PI, false); ctx.stroke(); }
            if (relIdx >= 34 && relIdx <= 39) { ctx.beginPath(); ctx.moveTo(centerX - (paintWidth/2), sY); ctx.lineTo(centerX - (paintWidth/2), sY + LANE_HEIGHT); ctx.moveTo(centerX + (paintWidth/2), sY); ctx.lineTo(centerX + (paintWidth/2), sY + LANE_HEIGHT); ctx.stroke(); }
            if (relIdx >= 28) { ctx.save(); ctx.beginPath(); ctx.rect(borderSize, sY, canvas.width - borderSize*2, LANE_HEIGHT); ctx.clip(); ctx.beginPath(); ctx.arc(centerX, topHoopY, arcRadius, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
            if (relIdx === 36) { ctx.beginPath(); ctx.arc(centerX, sY +40, 30, 0, Math.PI, false); ctx.stroke(); }
            if (relIdx === 39) { ctx.beginPath(); ctx.moveTo(borderSize, sY + LANE_HEIGHT); ctx.lineTo(canvas.width - borderSize, sY + LANE_HEIGHT); ctx.stroke(); }

            ctx.strokeStyle = "rgba(0,0,0,0.04)"; ctx.lineWidth = 1;
            for(let i=borderSize; i<canvas.width-borderSize; i+=20) { ctx.beginPath(); ctx.moveTo(i, sY); ctx.lineTo(i, sY+LANE_HEIGHT); ctx.stroke(); }
        } else {
            ctx.fillStyle = lane.color; ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);
        }

        if (lane.type === 'ice') {
            let iceGrad = ctx.createLinearGradient(0, sY, 0, sY + LANE_HEIGHT);
            iceGrad.addColorStop(0, "rgba(255, 255, 255, 0.1)"); iceGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.4)"); iceGrad.addColorStop(1, "rgba(255, 255, 255, 0.1)");
            ctx.fillStyle = iceGrad; ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);
            ctx.fillStyle = "white";
            for(let i=0; i<3; i++) { const snowX = (lane.index * 123 + i * 200) % canvas.width; const snowSize = 2 + (lane.index % 3); ctx.beginPath(); ctx.arc(snowX, sY + 20, snowSize, 0, Math.PI * 2); ctx.fill(); } 
        }
        else if (lane.type === 'cosmic') {
            ctx.fillStyle = "#020014"; ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);
            for(let i=0; i<3; i++) { ctx.fillStyle="white"; ctx.fillRect((lane.index*150+i*100)%canvas.width, sY+40, 2, 2); }
        } 
        else if (lane.type === 'river_water') {
            ctx.fillStyle = "#2196F3"; ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);
            const time = Date.now() / 300; ctx.fillStyle = "#64B5F6"; 
            for (let i = -50; i < canvas.width; i += 60) { const waveY = Math.sin(time + (i * 0.05)) * 8; ctx.fillRect(i, sY + 30 + waveY, 40, 8); ctx.fillRect(i + 30, sY + 50 - waveY, 20, 5); }
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            for (let i = 0; i < 5; i++) { const sparkleX = (lane.index * 130 + i * 90 + Date.now()/4) % (canvas.width + 50) - 20; const sparkleY = sY + 15 + (i * 12); ctx.fillRect(sparkleX, sparkleY, 4, 4); }
        }
        if (lane.type === 'road') {
            ctx.fillStyle = "#454545"; ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);
            ctx.fillStyle = "rgba(0,0,0,0.1)"; for (let i = 0; i < 15; i++) { const dotX = (lane.index * 77 + i * 130) % canvas.width; ctx.fillRect(dotX, sY + (i * 5) % LANE_HEIGHT, 2, 2); }
            ctx.fillStyle = "#555555"; ctx.fillRect(0, sY, canvas.width, 2); ctx.fillRect(0, sY + LANE_HEIGHT - 2, canvas.width, 2); 
            ctx.fillStyle = "rgba(255, 255, 255, 0.4)"; const dashWidth = 30; const gap = 40; for (let x = 0; x < canvas.width; x += (dashWidth + gap)) { ctx.fillRect(x, sY + LANE_HEIGHT / 2 - 2, dashWidth, 4); }
        } 

        const isPlayerLane = (player.lane === lane.index);
        if (isPlayerLane && lane.type === 'river_water') onRiver = true;

        lane.objects.forEach((obj, idx) => {
            let eLeft, eRight; 
            if (obj.type === 'ice_falling') {
                obj.y += obj.speedY; const drawY = sY + obj.y;
                if (obj.subType === 'snowball') { ctx.fillStyle = "white"; ctx.beginPath(); ctx.arc(obj.x + 30, drawY + 30, 28, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#D1F2FF"; ctx.lineWidth = 3; ctx.stroke(); } 
                else { drawCharacter(ctx, obj, obj.x, drawY, 60, "#004B8D", "❄️"); }
                eLeft = obj.x + 10; eRight = obj.x + 50;
                if (isPlayerLane && invulnerable === 0 && (player.currentX + 35) > eLeft && (player.currentX + 25) < eRight && Math.abs(baseY - drawY) < 45) {
                    lives--; syncUI(); triggerHitEffect(); showDamageMsg(obj.subType === 'snowball' ? "눈덩이 직격! ☃️" : "빙판 충돌! 🧊");
                    if (lives <= 0) triggerGameOver("동사..."); else invulnerable = 60;
                }
                if (obj.y > canvas.height + 100) { lane.objects.splice(idx, 1); }
                return;
            }
            if (obj.type === 'item') {
                const floatY = Math.sin(Date.now() / 200) * 5; const itemSize = 40;
                let data = obj.name === 'CHOCO' ? ChocoSpriteData : BananaSpriteData; let pal = obj.name === 'CHOCO' ? ChocoPalette : BananaPalette;
                if (typeof drawCustomSprite === "function") drawCustomSprite(ctx, data, pal, obj.x + 10, sY + 20 + floatY, itemSize);
              if (isPlayerLane && Math.abs((player.currentX + 30) - (obj.x + 30)) < 40) {
    lane.objects.splice(idx, 1);
    const gain = (obj.name === 'CHOCO' ? 20 : 10);
    totalMP += gain;
    
    // ✨ 여기에 텍스트 효과 추가!
    floatingTexts.push({
        x: player.currentX + 30,
        y: baseY - 50,
        text: `+${gain} MP`,
        life: 1.0, 
        color: obj.name === 'CHOCO' ? "#FFD700" : "#FFFFFF"
    });
    
    syncUI();
}
                return;
            }
            if (['road', 'court', 'ice', 'cosmic', 'river_land'].includes(lane.type)) {
                obj.x += obj.speed;
                if (obj.x > canvas.width + 100) obj.x = -150; if (obj.x < -150) obj.x = canvas.width + 100;
                
                if (obj.type === 'pixel_car') {
                    ctx.save(); 
                    // 차 위치를 중앙으로 보정 (+30) 후, 속도 방향에 따라 뒤집기
                    ctx.translate(obj.x + 30, sY); 
                    if (obj.speed < 0) ctx.scale(-1, 1);
                    
                    // 🚗 [수정됨] 자동차 크기를 60 -> 50으로 줄이고, 위치를 중앙으로 보정 (-40, 20)
                    // 너비는 비율에 따라 자동 계산됨 (약 100px)
                    drawSprite32(ctx, obj.spriteName, {...CarPalette, 9: obj.carColor}, -30, 10, 60); 
                    ctx.restore();
                    eLeft = obj.x + 10; eRight = obj.x + 40;
                } else {
                    drawCharacter(ctx, obj, obj.x, sY + 10, 60, obj.color, obj.number);
                    const teamName = obj.team || "TEAM"; const playerName = obj.name || "PLAYER";
                    ctx.font = "bold 8px Galmuri11"; const teamWidth = ctx.measureText(teamName).width;
                    ctx.font = "bold 10px Galmuri11"; const playerWidth = ctx.measureText(playerName).width;
                    const boxWidth = Math.max(teamWidth, playerWidth) + 8; const boxX = obj.x + 30 - (boxWidth / 2); const boxY = sY + 68;
                    ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; ctx.fillRect(boxX, boxY, boxWidth, 24);
                    ctx.textAlign = "center"; ctx.fillStyle = "#FFD700"; ctx.fillText(teamName, boxX + boxWidth/2, boxY + 9); ctx.fillStyle = "white"; ctx.fillText(playerName, boxX + boxWidth/2, boxY + 20);   
                    eLeft = obj.x + 15; eRight = obj.x + 45;
                }
                if (invulnerable === 0 && isPlayerLane && (player.currentX + 35) > eLeft && (player.currentX + 25) < eRight) {
                    lives--; syncUI(); triggerHitEffect(); showDamageMsg(obj.type === 'pixel_car' ? "교통사고! 🚑" : `[${obj.team}] ${obj.name}의 파울!`);
                    if (lives <= 0) triggerGameOver("파울 아웃!"); else invulnerable = 60;
                }
            }
            else if (lane.type === 'river_water' && obj.type === 'log') {
                obj.x += obj.speed; if (obj.x > canvas.width + 100) obj.x = -150; if (obj.x < -150) obj.x = canvas.width + 100;
                const logY = sY + 20; const logH = 40;
                ctx.fillStyle = "#6D4C41"; ctx.fillRect(obj.x, logY, obj.width, logH);
                ctx.fillStyle = "#8D6E63"; ctx.beginPath(); ctx.ellipse(obj.x, logY + logH/2, 10, logH/2, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(obj.x + obj.width, logY + logH/2, 10, logH/2, 0, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = "#5D4037"; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(obj.x + obj.width, logY + logH/2, 5, logH/4, 0, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = "rgba(0,0,0,0.2)"; for (let i = 20; i < obj.width - 20; i += 40) { ctx.fillRect(obj.x + i, logY + 10, 15, 3); ctx.fillRect(obj.x + i + 10, logY + 25, 20, 3); }
                ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(obj.x + 5, logY + 5, obj.width - 10, 5);
                if (isPlayerLane && (player.currentX + 30) > (obj.x - 20) && (player.currentX + 30) < (obj.x + obj.width + 20)) { onLog = true; logSpeed = obj.speed; }
            }
            else if (obj.type === 'audience') {
                const signY = sY + 30; ctx.fillStyle = "#FFFFFF"; ctx.fillRect(obj.x, signY, 40, 30);
                const d = PixelNumbers[obj.char]; if(d) { ctx.fillStyle = "#D70025"; d.forEach((row, ri) => row.forEach((p, ci) => { if(p) ctx.fillRect(obj.x + 10 + ci * 4, signY + 5 + ri * 4, 4, 4); })); }
            }
// ✨ 하트 그리기 추가

else if (obj.type === 'goal_heart') {
    const signY = sY + 30;
    
    // 1. 하얀색 배경 박스
    ctx.fillStyle = "#FFFFFF"; 
    ctx.fillRect(obj.x, signY, 40, 30); 

    // 2. ♥ 기호 그리기
    ctx.fillStyle = "#D70025"; // 하트 색상 (모비스 레드)
    ctx.font = "bold 24px Arial"; // 기호 크기 조절
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    // 박스(40x30)의 정중앙인 (x+20, y+15) 지점에 출력
    ctx.fillText("♥", obj.x + 20, signY + 15);
}
        });            
    });

    if (onRiver && !onLog && invulnerable === 0) { 
        lives--; syncUI(); triggerHitEffect(); showDamageMsg("으악! 태화강에 빠졌다!"); invulnerable = 60; if (lives <= 0) triggerGameOver("꼬로록.."); 
    }
    if (onLog) { player.targetX += logSpeed; player.currentX += logSpeed; }

    const currentLane = lanes.find(l => l.index === player.lane);
    player.currentX += (player.targetX - player.currentX) * (currentLane?.type === 'ice' ? 0.07 : 0.35);

    const jY = Math.sin((Math.abs(player.lane * LANE_HEIGHT - cameraY) / LANE_HEIGHT) * Math.PI) * 50;
    const pObj = playerPool.find(p => p.id === selectedId) || playerPool[0];

    shotClock -= Math.min(0.5, 0.12 + (currentLevel * 0.02));
    if (shotClock <= 0) { 
        lives--; syncUI(); 
        const v = ['24초 바이얼레이션', '하프코트 바이얼레이션', '더블 드리블'];
        showDamageMsg(`${pObj.name}의 ${v[Math.floor(Math.random()*3)]}!`);
        if (lives <= 0) triggerGameOver("파울 아웃!"); else { shotClock = 100; }
    }
    if (invulnerable > 0) invulnerable--;
    document.getElementById('ui-shotclock').style.width = shotClock + '%';
    drawCharacter(ctx, pObj, player.currentX - 7, baseY - jY + 2, 70, "#D70025"); 
 
    // 텍스트 렌더링 최적화 (루프 밖에서 폰트 설정)
    ctx.font = "bold 10px Galmuri11";
    ctx.textAlign = "center";
    
    floatingTexts.forEach((ft, index) => {
        ctx.globalAlpha = ft.life; 
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        
        ft.y -= 1.5; 
        ft.life -= 0.02; 
        
        if (ft.life <= 0) floatingTexts.splice(index, 1);
    });
    ctx.globalAlpha = 1.0;
   
    animationFrameId = requestAnimationFrame(gameLoop);
}

function startGame() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    resize(); player.lane = 0; cameraY = 0;
    document.querySelectorAll('.overlay, .view').forEach(o => o.classList.add('hidden'));
    gameState = 'PLAYING'; score = 0; earnedMP = 0; shotClock = 100; lives = 3; currentLevel = 1; consecutiveRoads = 0;
    lanes = []; for(let i=0; i<35; i++) addLane(i); 
    gameLoop();
}

function moveForward() {
    if (gameState !== 'PLAYING') return;
    
    // 💡 수정 포인트: 다음 칸(player.lane + 1)이 현재 최고 점수(score)보다 높을 때만 처리
    if (player.lane + 1 > score) {
        score = player.lane + 1; // 최고 도달 거리 갱신
        totalMP += 1;            // 새로운 칸에 도달했을 때만 MP 지급
    }

    player.lane++; // 실제 플레이어 위치 이동
    shotClock = 100; 
    
    // 퀴즈 및 레인 추가 로직 (기존 유지)
    if (player.lane > 0 && player.lane % LEVEL_DIST === 0) { 
        gameState = 'QUIZ'; 
        showQuiz(); 
    }

    const lastLaneIndex = lanes.length > 0 ? lanes[lanes.length - 1].index : -1;
    if (lastLaneIndex < player.lane + 20) { 
        addLane(lastLaneIndex + 1); 
    }

    // 지나간 레인 삭제 로직 (기존 6칸 유지)
    if (lanes.length > 15 && player.lane > 10) { 
        lanes = lanes.filter(l => l.index > player.lane - 6); 
    }
    
    syncUI();
}
function moveBackward() {
    if (gameState !== 'PLAYING') return;
    const minAllowedLane = (currentLevel - 1) * LEVEL_DIST;

    // 💡 수정 포인트: score(최대 전진 거리)보다 2칸 초과해서 뒤로 가지 못하게 조건을 추가합니다.
    if (player.lane > minAllowedLane && player.lane > score - 2) {
        player.lane--;
        // score = player.lane; // <--- 이 줄을 삭제하여 score가 줄어들지 않고 '최대 거리'를 유지하게 합니다.
        shotClock = 100;
        syncUI();
    }
}

function showQuiz() {
    const qOverlay = document.getElementById('overlay-quiz'); qOverlay.classList.remove('hidden');
    const mobisPlayers = playerPool.filter(p => !["🏀", "🐶", "🐳", "🦄"].includes(String(p.number)) && !p.isGorilla); 
    const target = mobisPlayers[Math.floor(Math.random() * mobisPlayers.length)];
    const isNameQuiz = Math.random() > 0.5;
    document.getElementById('quiz-feedback').classList.add('hidden'); document.getElementById('quiz-next-btn').classList.add('hidden');
    
    if (isNameQuiz) {
        document.getElementById('quiz-question').innerText = `현대모비스 No.${target.number} 선수의 이름은?`;
        let opts = [target.name]; while(opts.length < 4) { const r = mobisPlayers[Math.floor(Math.random()*mobisPlayers.length)].name; if(!opts.includes(r)) opts.push(r); }
        renderOptions(opts, target.name);
    } else {
        document.getElementById('quiz-question').innerText = `${target.name} 선수의 등번호는?`;
        let opts = [target.number]; while(opts.length < 4) { const r = mobisPlayers[Math.floor(Math.random()*mobisPlayers.length)].number; if(!opts.includes(r)) opts.push(r); }
        renderOptions(opts, target.number);
    }
}

function renderOptions(opts, correct) {
    opts.sort(() => Math.random() - 0.5); const container = document.getElementById('quiz-options'); container.innerHTML = '';
    opts.forEach(o => { 
        const b = document.createElement('button'); b.className = 'quiz-option'; b.innerText = o; 
        b.onclick = () => {
            document.querySelectorAll('.quiz-option').forEach(x => x.disabled = true);
            const f = document.getElementById('quiz-feedback'); const n = document.getElementById('quiz-next-btn');
            f.classList.remove('hidden'); n.classList.remove('hidden');
            if(o == correct){ totalMP += 50; f.innerText = "정답! (+50 MP)"; f.style.color = "green"; } else { f.innerText = `오답! 정답은 ${correct}`; f.style.color = "red"; }
            syncUI();
        };
        container.appendChild(b);
    });
}

function moveToClearScreen() { 
    document.getElementById('overlay-quiz').classList.add('hidden'); 
    gameState = 'LEVEL_CLEAR'; 
    document.getElementById('overlay-clear').classList.remove('hidden'); 
    const statsEl = document.getElementById('ui-clear-stats'); if(statsEl) statsEl.innerText = `STAGE ${currentLevel} COMPLETED!`;
    syncUI(); 
}

function continueGame() {
    currentLevel++; shotClock = 100;
    document.getElementById('overlay-clear').classList.add('hidden');
    if (currentLevel % 5 === 0) startShootingBonus(); else { gameState = 'PLAYING'; gameLoop(); }
}

function startShootingBonus() {
    gameState = 'SHOOTING'; shootingBullets = []; shootingEnemies = []; shootingParticles = []; shootingTimer = 0; shootingKills = 0;
    player.currentX = canvas.width / 2 - 30; gameLoop();
}

function switchTab(tab) { 
    lastMenuState = gameState; 
    document.querySelectorAll('.view, .overlay').forEach(v => v.classList.add('hidden')); 
    document.getElementById(`view-${tab}`).classList.remove('hidden'); 
    if(tab==='collection') renderCollection(); 
    if(tab==='equipment') renderEquipment(); // 구버전 라커룸 (이제 잘 안씀)
    if(tab==='shop') switchShopTab('scout'); // 상점 열면 기본 탭 열기
    syncUI(); 
}

function closeViews() { 
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden')); 
    if (gameState === 'LEVEL_CLEAR') document.getElementById('overlay-clear').classList.remove('hidden');
    else if (gameState === 'QUIZ') document.getElementById('overlay-quiz').classList.remove('hidden');
    else if (gameState === 'OVER') document.getElementById('overlay-over').classList.remove('hidden');
    else if (gameState === 'START') document.getElementById('overlay-start').classList.remove('hidden');
    renderPreview(); syncUI(); 
}

function renderPreview() { 
    if(!document.getElementById('preview-canvas')) return; 
    const cp = document.getElementById('preview-canvas').getContext('2d'); 
    cp.clearRect(0,0,80,80); 
    drawCharacter(cp, playerPool.find(p=>p.id===selectedId), 0,0,80, "#D70025"); 
}

function resetGame() { 
    gameState = 'START'; score = 0; earnedMP = 0; lives = 3; currentLevel = 1; 
    document.querySelectorAll('.overlay, .view').forEach(v => v.classList.add('hidden')); 
    document.getElementById('overlay-start').classList.remove('hidden'); 
    resize(); 
}

function buyLife() {
    if (totalMP < 500) return showDamageMsg("MP 부족!");
    if (lives >= MAX_LIVES) return showDamageMsg("이미 생명이 가득 찼습니다!");
    totalMP -= 500; lives++; syncUI(); showDamageMsg("생명 충전 완료! ❤️");
}

function scoutPlayer() {
    const avail = playerPool.filter(p => !myCollection.has(p.id));
    if (avail.length === 0) return showDamageMsg("모든 선수를 영입했습니다!");
    const scoutPrice = 200; 
    if (totalMP < scoutPrice) return showDamageMsg(`MP 부족! (${scoutPrice} 필요)`);
    totalMP -= scoutPrice;
    const p = avail[Math.floor(Math.random() * avail.length)];
    myCollection.add(p.id); saveGameData(); syncUI();
    const modal = document.getElementById('modal'); modal.classList.remove('hidden');
    document.getElementById('scout-result').innerHTML = `
        <div class="id-card">
            <div class="id-header"><span>PHOEBUS OFFICIAL</span><span>PLAYER CARD</span></div>
            <div class="id-body text-black">
                <div class="id-photo-area"><canvas id="card-canvas" width="80" height="80"></canvas></div>
                <div class="id-info-main"><div class="id-team">ULSAN HYUNDAI MOBIS</div><div class="id-name">${p.name}</div><div class="id-number">#${p.number}</div></div>
            </div>
            <div class="id-footer text-black">
                <div class="info-row"><span class="info-label">POSITION</span><span class="info-val">${p.pos || '-'}</span></div>
                <div class="info-row"><span class="info-label">PHYSICAL</span><span class="info-val">${p.height || '-'}/${p.weight || '-'}</span></div>
                <div class="info-row" style="grid-column: span 2"><span class="info-label">DRAFT</span><span class="info-val">${p.draft || '-'}</span></div>
            </div>
            <button onclick="document.getElementById('modal').classList.add('hidden')" class="btn-pixel w-full mt-4 h-10 text-white text-xs font-normal uppercase">Confirm</button>
        </div>`;
    setTimeout(() => { const c = document.getElementById('card-canvas'); if(c) drawCharacter(c.getContext('2d'), p, 0, 0, 80); }, 50);
}

function renderCollection() {
    const grid = document.getElementById('player-grid'); if(!grid) return; grid.innerHTML = '';
    const sorted = [...playerPool].sort((a,b) => (a.id===28?-1:b.id===28?1:a.id===999?-1:b.id===999?1:String(a.number).localeCompare(String(b.number), undefined, {numeric:true})));
    sorted.forEach(p => {
        const owned = myCollection.has(p.id), sel = selectedId === p.id;
        grid.innerHTML += `<div onclick="${owned?`selectPlayerFromRoster(${p.id})`:''}" class="p-2 border-4 ${selectedId===p.id?'border-yellow-400 bg-yellow-50':'border-black'} bg-white text-center"><canvas id="item-${p.id}" width="64" height="64" class="mx-auto ${owned?'':'grayscale opacity-30'}"></canvas><div class="text-[10px] mt-1 text-black font-normal">${owned?p.name:'??'}</div></div>`; setTimeout(()=> { if(document.getElementById(`item-${p.id}`)) drawCharacter(document.getElementById(`item-${p.id}`).getContext('2d'), p, 0,0,64); }, 50); });
}

function renderEquipment() {
    const grid = document.getElementById('equipment-grid'); if(!grid) return; grid.innerHTML = '';
}

function selectPlayerFromRoster(id) { 
    selectedId = id; saveGameData(); renderCollection(); renderPreview(); closeViews();
}

function togglePause() { if (gameState === 'PLAYING') gameState = 'PAUSED'; else if (gameState === 'PAUSED') { gameState = 'PLAYING'; gameLoop(); } }

window.addEventListener('touchstart', e => { touchStartX = e.changedTouches[0].screenX; touchStartY = e.changedTouches[0].screenY; touchMoved = false; }, {passive: false});
window.addEventListener('touchmove', e => {
    if (gameState !== 'PLAYING' && gameState !== 'SHOOTING') return;
    if (gameState === 'SHOOTING') {
        const touchX = e.touches[0].clientX; const canvasRect = canvas.getBoundingClientRect();
        player.currentX = touchX - canvasRect.left - 30; player.currentX = Math.max(0, Math.min(canvas.width - 60, player.currentX)); e.preventDefault(); return;
    }
    if (gameState === 'PLAYING' && !touchMoved) {
        const xDiff = e.changedTouches[0].screenX - touchStartX; const yDiff = e.changedTouches[0].screenY - touchStartY; const threshold = 25;
        if (Math.abs(xDiff) > Math.abs(yDiff)) {
            if (Math.abs(xDiff) > threshold) {
                if (xDiff > 0) player.targetX = Math.min(canvas.width - GRID_SIZE, player.targetX + GRID_SIZE); else player.targetX = Math.max(0, player.targetX - GRID_SIZE); touchMoved = true;
            }
        } else {
            if (Math.abs(yDiff) > threshold) { if (yDiff < -threshold) moveForward(); else if (yDiff > threshold) moveBackward(); touchMoved = true; }
        }
    }
    if (e.cancelable) e.preventDefault();
}, {passive: false});
window.addEventListener('touchend', () => { touchMoved = false; }, {passive: false});

window.onload = resize; window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
    if (gameState === 'SHOOTING') return; 
    if (e.repeat || gameState !== 'PLAYING') return;
    if (e.code === 'ArrowUp' || e.code === 'Space') moveForward();
    if (e.code === 'ArrowDown') moveBackward(); 
    if (e.code === 'ArrowLeft') player.targetX = Math.max(0, player.targetX - GRID_SIZE);
    if (e.code === 'ArrowRight') player.targetX = Math.min(canvas.width - GRID_SIZE, player.targetX + GRID_SIZE);
});

function resetAllData() {
    const firstCheck = confirm("경고: 모든 선수와 최고 점수가 사라집니다. 정말 초기화할까요?");
    if (firstCheck) {
        const secondCheck = confirm("진짜로 다 지울까요? 이 작업은 되돌릴 수 없습니다.");
        if (secondCheck) {
            localStorage.clear();
            alert("데이터가 모두 사라졌습니다. 처음부터 다시 시작합니다!");
            location.reload();
        }
    }
}

// 🛍️ 상점 탭 전환 함수
function switchShopTab(tabName) {
    document.getElementById('shop-tab-scout').classList.add('hidden');
    document.getElementById('shop-tab-items').classList.add('hidden');
    document.getElementById('shop-tab-uniform').classList.add('hidden');
    document.querySelectorAll('.shop-tab-btn').forEach(btn => btn.classList.remove('active'));

    const btns = document.querySelectorAll('.shop-tab-btn');
    if(tabName === 'scout') { 
        btns[0].classList.add('active'); 
        document.getElementById('shop-tab-scout').classList.remove('hidden'); 
    } else if(tabName === 'items') { 
        btns[1].classList.add('active'); 
        document.getElementById('shop-tab-items').classList.remove('hidden'); 
    } else if(tabName === 'uniform') { 
        btns[2].classList.add('active'); 
        document.getElementById('shop-tab-uniform').classList.remove('hidden');
        renderAvatarShop(); 
    }
}

function renderAvatarShop() {
    const container = document.getElementById('shop-tab-uniform');
    if(!container) return;
    container.innerHTML = ''; 

    // 🎨 스타일 수정: .hidden 클래스가 없을 때만 flex가 적용되도록 수정
    const style = document.createElement('style');
    style.innerHTML = `
        .u-shop-wrapper {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            padding: 10px 0 30px 0;
        }
        .u-shop-title {
            width: 90%;
            max-width: 380px;
            text-align: left;
            font-size: 16px;
            font-weight: bold;
            color: #000;
            margin-top: 15px;
            margin-bottom: 8px;
            border-bottom: 2px solid #000;
            padding-bottom: 5px;
        }
        .u-shop-card {
            display: flex;
            flex-direction: row;
            width: 90%;
            max-width: 380px;
            height: 100px;
            background: #fff;
            border: 3px solid #000;
            border-radius: 10px;
            margin-bottom: 12px;
            box-shadow: 4px 4px 0px rgba(0,0,0,0.15);
            overflow: hidden;
            align-items: center;
        }
        .u-shop-img {
            width: 90px;
            height: 100%;
            background: #f4f4f4;
            border-right: 2px solid #eee;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .u-shop-info {
            flex: 1;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 0 15px;
            gap: 4px;
        }
        .u-shop-name {
            font-size: 14px;
            font-weight: bold;
            color: #000;
            line-height: 1.2;
            margin: 0;
        }
        .u-shop-price {
            font-size: 12px;
            color: #666;
            margin: 0;
        }
        .u-shop-btn {
            width: 100%;
            height: 30px;
            border: none;
            border-radius: 5px;
            color: white;
            font-family: 'Galmuri11', sans-serif;
            font-weight: bold;
            cursor: pointer;
            font-size: 11px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .u-shop-btn:active {
            transform: translateY(2px);
        }
    `;
    container.appendChild(style);

    const wrapper = document.createElement('div');
    wrapper.className = 'u-shop-wrapper';
    container.appendChild(wrapper);

    let drawQueue = [];

    const addSection = (title, items, type, mySet, selectedId) => {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'u-shop-title';
        titleDiv.innerText = title;
        wrapper.appendChild(titleDiv);

        items.forEach(item => {
            const isOwned = item.price === 0 || mySet.has(item.id);
            const isEquipped = selectedId === item.id;
            const canvasId = `u-shop-cvs-${type}-${item.id}`;
            drawQueue.push({ type, itemId: item.id, canvasId });

            const card = document.createElement('div');
            card.className = 'u-shop-card';
            card.innerHTML = `
                <div class="u-shop-img">
                    <canvas id="${canvasId}" width="80" height="80" style="image-rendering:pixelated; width:70px; height:70px;"></canvas>
                </div>
                <div class="u-shop-info">
                    <div class="u-shop-name">${item.name}</div>
                    <div class="u-shop-price">${isOwned ? '보유중' : item.price + ' MP'}</div>
                    <button class="u-shop-btn" 
                            onclick="${isOwned ? `equipItem('${type}', ${item.id})` : `buyItem('${type}', ${item.id})`}" 
                            style="background:${isEquipped ? '#002c5f' : '#D50032'};">
                        ${isEquipped ? '장착 중' : (isOwned ? '장착하기' : '구매하기')}
                    </button>
                </div>`;
            wrapper.appendChild(card);
        });
    };

    addSection("👕 상의 (Tops)", gameShopData.tops, 'tops', myTops, selectedTopIdx);
    addSection("🩳 하의 (Bottoms)", gameShopData.bottoms, 'bottoms', myBottoms, selectedBottomIdx);

    setTimeout(() => {
        drawQueue.forEach(req => {
            const cvs = document.getElementById(req.canvasId);
            if (!cvs) return;
            const ctx = cvs.getContext('2d');
            const item = gameShopData[req.type].find(i => i.id === req.itemId);
            
            ctx.clearRect(0,0,80,80);

            if (item && item.sprite && Sprites32[item.sprite]) {
                const pal = (item.paletteId && PaletteMap[item.paletteId]) ? PaletteMap[item.paletteId] : HomeUniformPalette;
                drawCustomSprite(ctx, Sprites32[item.sprite], pal, -4, -4, 88); 
            } else {
                ctx.fillStyle = "#eee";
                ctx.fillRect(10, 10, 60, 60);
                ctx.font = "bold 40px Arial"; 
                ctx.textAlign="center"; 
                ctx.textBaseline="middle";
                ctx.fillStyle = "#ccc";
                ctx.fillText(req.type === 'tops' ? "T" : "P", 40, 40);
            }
        });
    }, 50);
}

// 💰 아이템 구매 로직
function buyItem(type, id) {
    let item, mySet;
    if(type === 'tops') { item = gameShopData.tops.find(i=>i.id===id); mySet = myTops; }
    else if(type === 'bottoms') { item = gameShopData.bottoms.find(i=>i.id===id); mySet = myBottoms; }
    else if(type === 'effects') { item = gameShopData.effects.find(i=>i.id===id); mySet = myEffects; }

    if(!item) return;
    if(totalMP < item.price) { showDamageMsg("MP가 부족합니다!"); return; }

    totalMP -= item.price;
    mySet.add(id);
    saveGameData();
    showDamageMsg(`${item.name} 구매 완료!`);
    renderAvatarShop(); 
    syncUI(); 
}

// 👕 아이템 장착 로직
function equipItem(type, id) {
    if(type === 'tops') selectedTopIdx = id;
    else if(type === 'bottoms') selectedBottomIdx = id;
    else if(type === 'effects') selectedEffectIdx = id;

    saveGameData();
    renderAvatarShop(); 
    renderPreview(); 
}

function triggerHitEffect() {
    const flash = document.getElementById('flash-overlay');
    if (flash) {
        flash.style.backgroundColor = "rgba(215, 0, 37, 0.5)";
        setTimeout(() => flash.style.backgroundColor = "transparent", 150);
    }
    if (canvas) {
        canvas.classList.remove('hit-effect');
        void canvas.offsetWidth;
        canvas.classList.add('hit-effect');
        setTimeout(() => canvas.classList.remove('hit-effect'), 300);
    }
}