/* script.js - 게임의 두뇌 및 동작 (통합 수정본) */

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

// 👕 옷장 & 효과 상태 변수 (NEW)
let selectedTopIdx = parseInt(localStorage.getItem('mobis_top')) || 0;
let selectedBottomIdx = parseInt(localStorage.getItem('mobis_bottom')) || 0;
let selectedEffectIdx = parseInt(localStorage.getItem('mobis_effect')) || 0;

// 🎒 인벤토리 (NEW)
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

function drawSprite32(targetCtx, spriteName, colors, x, y, size) {
    if (!targetCtx) return;
    const data = Sprites32[spriteName];
    if (!data) return;
    const pLength = data.length;
    const pSize = size / pLength;
    data.forEach((row, rIdx) => { 
        row.forEach((cIdx, colIdx) => { 
            const color = typeof cIdx === 'string' ? Colors[cIdx] : colors[cIdx]; 
            if (color) { targetCtx.fillStyle = color; targetCtx.fillRect(x + colIdx * pSize, y + rIdx * pSize, Math.ceil(pSize), Math.ceil(pSize)); }
        }); 
    });
}

function drawDigit(targetCtx, d, dx, dy, ds) {
    const digitData = PixelNumbers[d]; if(!digitData) return;
    digitData.forEach((row, ri) => row.forEach((p, ci) => { if(p) targetCtx.fillRect(dx + ci * ds, dy + ri * ds, ds, ds); }));
}

// 🖌️ 캐릭터 그리기 (미리보기 기능 추가됨)
// overrideTop/Bottom에 값이 들어오면 현재 장착한 옷 대신 그 옷을 입혀서 그립니다.
// 🖌️ 캐릭터 그리기 (위치 보정 기능 포함)
function drawCharacter(targetCtx, playerObj, x, y, size, teamColor = "#D70025", numOverride = null, overrideTop = null, overrideBottom = null) {
    if (!targetCtx) return;
    
    // ==========================================
    // 🛠️ 옷 위치 강제 보정 (이 숫자를 바꿔서 맞추세요!)
    // ==========================================
    // 양수(+)는 오른쪽/아래, 음수(-)는 왼쪽/위로 이동합니다.
    // 예: 1 = 0.5픽셀 이동, 2 = 1픽셀 이동
    
    // 🩳 하의 위치 조정
    const BOT_ADJUST_X = 2;   // 하의 좌우 (예: -2 하면 왼쪽으로 1픽셀 감)
    const BOT_ADJUST_Y = 0;   // 하의 상하 (예: 2 하면 아래로 1픽셀 내려감)

    // 👕 상의 위치 조정
    const TOP_ADJUST_X = 2;   // 상의 좌우
    const TOP_ADJUST_Y = 0;   // 상의 상하
    // ==========================================

    const pixelUnit = size / 64; // 1픽셀 단위 크기 계산

    // 1. 특수 캐릭터 처리
    const sColors = {...Colors, 6: teamColor};
    if (playerObj?.isRedBoo) { drawSprite32(targetCtx, 'redboo', { 0: null, 1: "#000000", 2: "#FFFFFF", 3: "#FF0000" }, x, y, size); return; }
    if (playerObj?.isGongaji) { drawCustomSprite(targetCtx, Sprites32.gongaji, GongajiPalette, x, y, size); return; }
    if (playerObj?.isPegasus) { drawCustomSprite(targetCtx, Sprites32.pegasus, PegasusPalette, x, y, size); return; }
    if (playerObj?.isGorilla) { drawSprite32(targetCtx, 'gorilla', sColors, x, y, size); return; }
    if (playerObj?.isBall || playerObj?.id === 999) { drawSprite32(targetCtx, 'basketball', basketballPalette, x, y, size); return; }
    if (playerObj?.isWhale || playerObj?.id === 26) { drawSprite32(targetCtx, 'whale', Colors, x, y, size); return; }

    // 2. 사람 캐릭터 그리기
    const isMyPlayer = !playerObj.team || playerObj.team === "ULSAN HYUNDAI MOBIS";

    if (isMyPlayer) {
        // [레이어 1] 기본 몸체
        if (Sprites32['human_player_64'] && Sprites32['human_player_64'].length > 0) {
             drawSprite32(targetCtx, 'human_player_64', sColors, x, y, size);
        } else {
             drawSprite32(targetCtx, 'human_base', sColors, x, y, size);
        }

        // [레이어 2] 하의 입히기 (보정값 적용)
        const currentBottomId = (overrideBottom !== null) ? overrideBottom : selectedBottomIdx;
        const bItem = gameShopData.bottoms.find(i => i.id === currentBottomId);
        
        if (bItem && bItem.sprite && Sprites32[bItem.sprite]) {
            const pal = (bItem.paletteId && PaletteMap[bItem.paletteId]) ? PaletteMap[bItem.paletteId] : HomeUniformPalette;
            // 👇 여기서 위치를 이동시킴
            drawCustomSprite(targetCtx, Sprites32[bItem.sprite], pal, x + (BOT_ADJUST_X * pixelUnit), y + (BOT_ADJUST_Y * pixelUnit), size);
        }

        // [레이어 3] 상의 입히기 (보정값 적용)
        const currentTopId = (overrideTop !== null) ? overrideTop : selectedTopIdx;
        const tItem = gameShopData.tops.find(i => i.id === currentTopId);
        
        if (tItem && tItem.sprite && Sprites32[tItem.sprite]) {
            const pal = (tItem.paletteId && PaletteMap[tItem.paletteId]) ? PaletteMap[tItem.paletteId] : HomeUniformPalette;
            // 👇 여기서 위치를 이동시킴
            drawCustomSprite(targetCtx, Sprites32[tItem.sprite], pal, x + (TOP_ADJUST_X * pixelUnit), y + (TOP_ADJUST_Y * pixelUnit), size);
        }

    } else {
        sColors[3] = playerObj?.hair || "#332211"; 
        drawSprite32(targetCtx, 'human_base', sColors, x, y, size);
    }
    
// 3. 등번호 (우리 팀: 흰색 + 사이즈 축소 + 위치 보정)
    const num = (numOverride !== null && numOverride !== undefined) ? numOverride : playerObj?.number;
    if (num !== undefined && num !== null && !["🐶", "🐳", "🏀", "👹"].includes(String(num))) {
        const ns = String(num);
        const pSize = size / 32;

        if (isMyPlayer) {
            // ⭐ [우리 팀 설정]
            targetCtx.fillStyle = "#FFFFFF"; // 번호 색상: 흰색
            
            // 📍 위치 미세 조정 변수 (여기 숫자를 수정해서 위치를 잡으세요!)
            const MY_NUM_X_OFFSET = 1.3;  // 양수: 오른쪽 이동 / 음수: 왼쪽 이동
            const MY_NUM_Y_OFFSET = 17.5;   // 숫자가 커질수록 아래로 내려감 (현재 19)
            const MY_NUM_SIZE = 0.9;      // 번호 전체 크기 (현재 0.9)

            if (ns.length === 1) {
                // 한 자리 번호
                drawDigit(targetCtx, ns[0], x + (14 + MY_NUM_X_OFFSET) * pSize, y + MY_NUM_Y_OFFSET * pSize, pSize * (MY_NUM_SIZE * 1.2));
            } else {
                // 두 자리 번호 (간격을 좁게 설정)
                drawDigit(targetCtx, ns[0], x + (12.5 + MY_NUM_X_OFFSET) * pSize, y + MY_NUM_Y_OFFSET * pSize, pSize * MY_NUM_SIZE);
                drawDigit(targetCtx, ns[1], x + (16.5 + MY_NUM_X_OFFSET) * pSize, y + MY_NUM_Y_OFFSET * pSize, pSize * MY_NUM_SIZE);
            }
        } else {
            // 👤 [상대 팀 설정] - 기존 유지
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
    // 4. 이펙트
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
// ✨ 효과 그리기 도우미 함수
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
    
    // NEW: 옷장 정보 저장
    localStorage.setItem('mobis_top', selectedTopIdx);
    localStorage.setItem('mobis_bottom', selectedBottomIdx);
    localStorage.setItem('mobis_effect', selectedEffectIdx);
    localStorage.setItem('mobis_my_tops', JSON.stringify([...myTops]));
    localStorage.setItem('mobis_my_bottoms', JSON.stringify([...myBottoms]));
    localStorage.setItem('mobis_my_effects', JSON.stringify([...myEffects]));
}

function resize() {
    canvas = document.getElementById('game-canvas'); if (!canvas) return;
    ctx = canvas.getContext('2d'); 
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
    
    if (idx > 0 && idx % LEVEL_DIST === 0) {
        type = 'goal'; color = '#D70025';
        ['M', 'O', 'B', 'I', 'S'].forEach((char, i) => { objs.push({ x: 50 + i * 70, type: 'audience', char: char }); });
    } else if (idx > 2) {
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
    if (idx > 3 && Math.random() < 0.2) { 
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
        life: 1.0, // 1.0에서 0까지 줄어들며 사라짐
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
                    ctx.save(); ctx.translate(obj.x + 30, sY); if (obj.speed < 0) ctx.scale(-1, 1);
                    drawSprite32(ctx, obj.spriteName, {...CarPalette, 9: obj.carColor}, -30, 10, 60); ctx.restore();
                    eLeft = obj.x + 20; eRight = obj.x + 40;
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
    drawCharacter(ctx, pObj, player.currentX, baseY - jY + 10, 60, "#D70025"); // 기본 색상으로 그리기 (내부에서 처리됨)
 

floatingTexts.forEach((ft, index) => {
    ctx.globalAlpha = ft.life; // 서서히 투명해짐
    ctx.fillStyle = ft.color;
    ctx.font = "bold 10px Galmuri11";
    ctx.textAlign = "center";
    ctx.fillText(ft.text, ft.x, ft.y);
    
    ft.y -= 1.5; // 위로 둥둥 떠오름
    ft.life -= 0.02; // 수명 감소
    
    if (ft.life <= 0) floatingTexts.splice(index, 1);
});
ctx.globalAlpha = 1.0; // 투명도 초기화
   
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
    player.lane++; score = player.lane; totalMP += 1; shotClock = 100; 
    if (player.lane > 0 && player.lane % LEVEL_DIST === 0) { gameState = 'QUIZ'; showQuiz(); }
    const lastLaneIndex = lanes.length > 0 ? lanes[lanes.length - 1].index : -1;
    if (lastLaneIndex < player.lane + 20) { addLane(lastLaneIndex + 1); }
    if (lanes.length > 30 && player.lane > 20) { lanes = lanes.filter(l => l.index > player.lane - 15); }
    syncUI();
}

function moveBackward() {
    if (gameState !== 'PLAYING') return;
    const minAllowedLane = (currentLevel - 1) * LEVEL_DIST;
    if (player.lane > minAllowedLane) { player.lane--; score = player.lane; shotClock = 100; syncUI(); }
}

function showQuiz() {
    const qOverlay = document.getElementById('overlay-quiz'); qOverlay.classList.remove('hidden');
    const mobisPlayers = playerPool.filter(p => !["🏀", "🐶", "🐳"].includes(String(p.number)) && !p.isGorilla); 
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

// (구) 라커룸 기능 - 유지하지만 상점 기능이 메인임
function renderEquipment() {
    const grid = document.getElementById('equipment-grid'); if(!grid) return; grid.innerHTML = '';
    // 기존 유니폼 풀 대신 상점 데이터 활용 가능 여부 확인 필요하나, 일단 빈 상태로 둠
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

/* resetAllData() { ... } 함수 바로 아래에 이 내용을 덮어쓰세요 */

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
        renderAvatarShop(); // 유니폼 탭 클릭 시 상점 그리기
    }
}

// 🛒 아바타 상점 화면 그리기 (상의, 하의, 효과)
// 🛒 아바타 상점 화면 그리기 (캔버스 미리보기 적용)
// 🛒 아바타 상점 화면 그리기 (UI 반응형 수정판)
function renderAvatarShop() {
    const container = document.getElementById('shop-tab-uniform');
    if(!container) return;
    container.innerHTML = ''; 

    // 🎨 스타일 수정: .hidden 클래스가 없을 때만 flex가 적용되도록 수정 (:not(.hidden) 추가)
    const style = document.createElement('style');
    style.innerHTML = `
        /* [수정됨] 숨겨져 있지 않을 때만 flex 적용 */
        #shop-tab-uniform:not(.hidden) {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            padding: 20px 0 !important;
            width: 100% !important;
            box-sizing: border-box !important;
        }

        .shop-category-title {
            width: 90% !important;
            max-width: 380px !important;
            text-align: left !important;
            font-size: 16px !important;
            font-weight: bold !important;
            color: #000 !important;
            margin-top: 15px !important;
            margin-bottom: 8px !important;
            border-bottom: 2px solid #000 !important;
            padding-bottom: 5px !important;
        }

        .shop-card-horizontal {
            display: flex !important;
            flex-direction: row !important;
            width: 90% !important;
            max-width: 380px !important;
            height: 110px !important;
            background: #fff !important;
            border: 3px solid #000 !important;
            border-radius: 12px !important;
            margin-bottom: 12px !important;
            box-shadow: 4px 4px 0px rgba(0,0,0,0.15) !important;
            overflow: hidden !important;
            align-items: center !important;
        }

        .shop-card-img {
            width: 100px !important;
            height: 100% !important;
            background: #f4f4f4 !important;
            border-right: 3px solid #000 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex-shrink: 0 !important;
        }

        .shop-card-info {
            flex: 1 !important;
            height: 100% !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            padding: 0 15px !important;
            gap: 6px !important;
        }

        .shop-item-name {
            font-size: 15px !important;
            font-weight: bold !important;
            color: #000 !important;
            line-height: 1.2 !important;
            margin: 0 !important;
        }

        .shop-item-price {
            font-size: 12px !important;
            color: #666 !important;
            margin: 0 !important;
        }

        .shop-btn-action {
            width: 100% !important;
            height: 32px !important;
            border: none !important;
            border-radius: 6px !important;
            color: white !important;
            font-family: 'Galmuri11', sans-serif !important;
            font-weight: bold !important;
            cursor: pointer !important;
            font-size: 12px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        .shop-btn-action:active {
            transform: translateY(2px);
        }
    `;
    container.appendChild(style);

    let drawQueue = [];

    const addSection = (title, items, type, mySet, selectedId) => {
        const titleDiv = document.createElement('div');
        titleDiv.className = 'shop-category-title';
        titleDiv.innerText = title;
        container.appendChild(titleDiv);

        items.forEach(item => {
            const isOwned = item.price === 0 || mySet.has(item.id);
            const isEquipped = selectedId === item.id;
            const canvasId = `shop-canvas-${type}-${item.id}`;
            drawQueue.push({ type, itemId: item.id, canvasId });

            const card = document.createElement('div');
            card.className = 'shop-card-horizontal';
            card.innerHTML = `
                <div class="shop-card-img">
                    <canvas id="${canvasId}" width="80" height="80" style="image-rendering:pixelated; width:70px; height:70px;"></canvas>
                </div>
                <div class="shop-card-info">
                    <div class="shop-item-name">${item.name}</div>
                    <div class="shop-item-price">${isOwned ? '보유중' : item.price + ' MP'}</div>
                    <button class="shop-btn-action" 
                            onclick="${isOwned ? `equipItem('${type}', ${item.id})` : `buyItem('${type}', ${item.id})`}" 
                            style="background:${isEquipped ? '#002c5f' : '#D50032'};">
                        ${isEquipped ? '장착 중' : (isOwned ? '장착하기' : '구매하기')}
                    </button>
                </div>`;
            container.appendChild(card);
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
    renderAvatarShop(); // 버튼 상태 갱신
    renderPreview(); // 메인 화면 미리보기 갱신
}

// 💥 충돌 시 번쩍 효과 (이 코드가 빠지면 게임이 멈출 수 있습니다)
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