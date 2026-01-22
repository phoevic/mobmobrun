/* script.js - 게임의 두뇌 및 동작 */

const wrapper = document.getElementById('game-wrapper');
const LANE_HEIGHT = 80, GRID_SIZE = 60, LEVEL_DIST = 40, MAX_LIVES = 5;
let canvas, ctx, animationFrameId;
let gameState = 'START', lastMenuState = 'START';
let totalMP = parseInt(localStorage.getItem('mobis_final_mp')) || 100;
let myCollection = new Set(JSON.parse(localStorage.getItem('mobis_final_col')) || [28, 999]);
let selectedId = parseInt(localStorage.getItem('mobis_final_selected')) || 28;
let bestDist = parseInt(localStorage.getItem('mobis_final_best')) || 0;
let selectedUniformIdx = parseInt(localStorage.getItem('mobis_final_uniform')) || 0;
let player = { lane: 0, x: 0, targetX: 0, currentX: 0 };
let lives = 3, currentLevel = 1, score = 0, earnedMP = 0, shotClock = 100, cameraY = 0, lanes = [], invulnerable = 0, consecutiveRoads = 0;

/* --- 슈팅 보너스용 변수 추가 --- */
let shootingBullets = [];   // 내가 쏘는 농구공 저장소
let shootingEnemies = [];   // 위에서 내려오는 적 선수들 저장소
let shootingParticles = []; // ✨ 팡팡 터지는 이펙트들을 담을 바구니
let shootingTimer = 0;      // 보너스 스테이지 제한 시간용
let shootingKills = 0;      // 물리친 적 숫자 카운트
let keys = {}; // 어떤 키가 눌려있는지 저장하는 바구니
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
let touchStartX = 0, touchStartY = 0;
let touchMoved = false; // ✨ 이번 터치에서 이미 움직였는지 체크하는 변수
 
    // --- 그리기 함수: 커스텀 팔레트 지원 ---
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

// ✅ 이 코드를 그 자리에 붙여넣으세요!

        function drawCharacter(targetCtx, playerObj, x, y, size, teamColor = "#D70025", numOverride = null) {
            if (!targetCtx) return;
            
            // 🎨 유니폼 색상 적용 (6번 색깔을 teamColor로 교체)
            const sColors = {...Colors, 6: teamColor};
            
            // 1. 특수 캐릭터 (마스코트, 공, 동물 등) 처리
            if (playerObj?.isRedBoo) { drawSprite32(targetCtx, 'redboo', { 0: null, 1: "#000000", 2: "#FFFFFF", 3: "#FF0000" }, x, y, size); return; }
            if (playerObj?.isGongaji) { drawCustomSprite(targetCtx, Sprites32.gongaji, GongajiPalette, x, y, size); return; }
            if (playerObj?.isPegasus) { drawCustomSprite(targetCtx, Sprites32.pegasus, PegasusPalette, x, y, size); return; }
            if (playerObj?.isGorilla) { drawSprite32(targetCtx, 'gorilla', sColors, x, y, size); return; }
            if (playerObj?.isBall || playerObj?.id === 999) { drawSprite32(targetCtx, 'basketball', basketballPalette, x, y, size); return; }
            if (playerObj?.isWhale || playerObj?.id === 26) { drawSprite32(targetCtx, 'whale', Colors, x, y, size); return; }

            // 2. 사람 캐릭터 (선수) 그리기
            let spriteName = 'human_base'; // 기본값: 상대방(적)은 32x32 기본형
            
            // 내 캐릭터 판별 (팀 정보가 없거나, 모비스 팀인 경우)
            const isMyPlayer = !playerObj.team || playerObj.team === "ULSAN HYUNDAI MOBIS";

            if (isMyPlayer) {
                spriteName = 'human_player_64'; // ✨ 내 캐릭터는 64x64 고해상도 사용!
            }

            sColors[3] = playerObj?.hair || "#332211"; // 머리색 적용
            drawSprite32(targetCtx, spriteName, sColors, x, y, size); // 캐릭터 그리기
            
            // 3. 등번호 그리기
            const num = (numOverride !== null && numOverride !== undefined) ? numOverride : playerObj?.number;
            
            if (num !== undefined && num !== null && !["🐶", "🐳", "🏀", "👹", "M", "O", "B", "I", "S"].includes(String(num))) {
                const ns = String(num);
                const pSize = size / 32; // 크기 비율 계산

                if (isMyPlayer) {
                    // ⬛ 내 캐릭터: 흰색 박스 위에 검정 글씨
                    targetCtx.fillStyle = "#111"; 
                    if (ns.length === 1) {
                        drawDigit(targetCtx, ns[0], x + 13.5 * pSize, y + 15 * pSize, pSize * 1.8);
                    } else {
                        drawDigit(targetCtx, ns[0], x + 9 * pSize, y + 16 * pSize, pSize * 1.3);
                        drawDigit(targetCtx, ns[1], x + 16.5 * pSize, y + 16 * pSize, pSize * 1.3);
                    }
                } else {
                    // ⬜ 적 캐릭터: 어두운 옷 위에 흰색 글씨 (기존 유지)
                    targetCtx.fillStyle = "white";
                    if (ns.length === 1) {
                        drawDigit(targetCtx, ns[0], x + 13.5 * pSize, y + 16 * pSize, pSize * 1.8);
                    } else {
                        drawDigit(targetCtx, ns[0], x + 9 * pSize, y + 17 * pSize, pSize * 1.3);
                        drawDigit(targetCtx, ns[1], x + 16.5 * pSize, y + 17 * pSize, pSize * 1.3);
                    }
                }
            }

            // 4. 반짝이는 효과 (스타 플레이어 등)
            if ([6, 12, 45].includes(playerObj?.id)) {
                const time = Date.now() / 400; const radius = size * 0.65;
                for (let i = 0; i < 3; i++) {
                    const angle = time + (i * Math.PI * 2 / 3);
                    const starX = x + size/2 + Math.cos(angle) * radius; 
                    const starY = y + size/2 + Math.sin(angle) * radius;
                    const s = size/18; 
                    targetCtx.fillStyle = "#FFCA08";
                    targetCtx.fillRect(starX - s/2, starY - s*2, s, s*4); 
                    targetCtx.fillRect(starX - s*2, starY - s/2, s*4, s);
                    targetCtx.fillStyle = "white"; 
                    targetCtx.fillRect(starX - s/2, starY - s/2, s, s);
                }
            }
        }

        // --- UI 및 로직 ---
        function syncUI() {
            const map = { 'ui-level': currentLevel, 'ui-score': score, 'ui-mp': totalMP, 'ui-best-game': bestDist, 'ui-best-main': bestDist, 'ui-best-over': bestDist, 'ui-shop-mp': totalMP, 'ui-clear-mp': totalMP, 'ui-collected-count': myCollection.size };
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
            localStorage.setItem('mobis_final_uniform', selectedUniformIdx);
        }

        function resize() {
            canvas = document.getElementById('game-canvas'); if (!canvas) return;
            ctx = canvas.getContext('2d'); 
            // Wrapper 크기에 맞춰 캔버스 사이징
            canvas.width = wrapper.clientWidth; 
            canvas.height = wrapper.clientHeight;
            player.targetX = (Math.floor((canvas.width / 2) / GRID_SIZE) * GRID_SIZE);
            if (gameState !== 'PLAYING') player.currentX = player.targetX; 
            renderPreview(); syncUI();
        }

/* --- [수정 후] addLane 함수 전체 --- */
/* --- 1단계 수정: 스토리 모드 맵 생성 --- */
/* --- [수정] 맵 생성 함수 (강 테마: 물/땅/안전 섞기) --- */
/* --- [수정] 맵 생성 함수 (속도 계산 위치 수정 및 괄호 정리 완료) --- */
function addLane(idx) {
    // 1. 기본값: 안전한 땅
    let type = 'safe';
    let color = idx % 2 === 0 ? '#d29145' : '#de9b42'; 
    let objs = [];
    
    // 2. 골인 지점 (변경 없음)
    if (idx > 0 && idx % LEVEL_DIST === 0) {
        type = 'goal'; color = '#D70025';
        ['M', 'O', 'B', 'I', 'S'].forEach((char, i) => { 
            objs.push({ x: 50 + i * 70, type: 'audience', char: char }); 
        });
    } 
    // 3. 실제 게임 구간
    else if (idx > 2) {
        const laneLevel = Math.floor(idx / LEVEL_DIST) + 1;
        const cycle = (laneLevel - 1) % 10 + 1; // 1~10 사이클

        // ⚡ [중요 수정] 속도 계산을 테마 로직보다 '먼저' 해야 합니다!
        let speedMult = 1.0 + (laneLevel * 0.12);
        if (speedMult > 2.5) speedMult = 2.5;

        // A. 테마 확인
        let theme = 'road';
        if (cycle >= 3 && cycle <= 4) theme = 'river';       
        else if (cycle >= 5 && cycle <= 6) theme = 'court';  
        else if (cycle >= 7 && cycle <= 8) theme = 'ice';    
        else if (cycle >= 9) theme = 'cosmic';               

        // B. 강(River) 테마일 때 🌊
        if (theme === 'river') {
            const rand = Math.random();
            
            if (rand < 0.3) {
                // [케이스 1] 통나무가 떠내려오는 '물'
                type = 'river_water'; 
                color = '#42A5F5'; 
            } else if (rand < 0.7) {
                // [케이스 2] 장애물(선수)이 나오는 '강가 땅'
                type = 'river_land';
                color = '#81C784'; 
            } else {
                // [케이스 3] 안전한 땅
                type = 'safe';
                color = '#AED581'; 
            }

            // 강 테마 적 생성 (물이거나 강가 땅일 때)
            if (type !== 'safe') {
                createEnemyInLane(objs, speedMult, laneLevel, type);
            }
        } 
        // C. 다른 테마일 때 (코트, 도로, 얼음, 우주)
        else {
             // 🏀 1. 농구 코트 테마
            if (theme === 'court') {
                type = 'court'; 
                color = '#e5b382'; // 코트 바닥색
                
                // 60% 확률로 적 생성 (40%는 적 없이 바닥만 코트)
                if (Math.random() >= 0.4) {
                     createEnemyInLane(objs, speedMult, laneLevel, type);
                }
            }
            // 🚗 2. 나머지 테마 (Road, Ice, Cosmic)
            else {
                if (Math.random() < 0.4) {
                    type = 'safe'; 
                    // 안전지대 바닥색
                    if(theme === 'ice') color = '#E1F5FE';
                    else if(theme === 'cosmic') color = '#1a1a2e';
                    else color = '#d29145';
                } else {
                    type = theme;
                    // 위험지대 바닥색
                    if (type === 'ice') color = '#e0f7fa';
                    else if (type === 'cosmic') color = '#0a0a2a';
                    else color = '#4a4a4a';
                    
                    // 적 생성
                    createEnemyInLane(objs, speedMult, laneLevel, type);
                }
            }
        }
    }

    // 4. 아이템 생성
    if (idx > 3 && Math.random() < 0.2) { 
        const isChoco = Math.random() > 0.7; 
        objs.push({ x: Math.random() * (canvas.width - 60), type: 'item', name: isChoco ? 'CHOCO' : 'BANANA', width: 40, speed: 0 });
    }

    lanes.push({ type, color, objects: objs, index: idx });
}

// 💡 적 생성 도우미 함수 (반드시 laneLevel을 전달받도록 수정)
/* --- 2단계 수정: 테마별 적 생성 (길막 방지 포함) --- */
/* --- [수정] 장애물 생성 함수 (통나무 로직 & 선수 데이터 적용) --- */
/* --- [수정] 장애물 생성 (강: 물=통나무, 땅=선수) --- */
/* --- [수정] 장애물 생성 (통나무 + KBL 상대팀 + 마스코트) --- */
/* --- [수정] 장애물 생성 (sprites.js 데이터 연동 + 마스코트 확률 UP) --- */
/* --- [수정] 장애물 생성 (sprites.js의 KBL 명단 & 마스코트 연동) --- */
/* --- [수정] 장애물 생성 함수 (모든 맵에서 KBL 선수/마스코트 등장) --- */
function createEnemyInLane(objs, speedMult, laneLevel, laneType) {
    
    // 🌊 [케이스 1] 강물(Water) -> 다양한 길이의 통나무 생성
    if (laneType === 'river_water') {
        const speed = (1.5 + Math.random()) * speedMult * (Math.random() > 0.5 ? 1 : -1);
        
        // 통나무 개수 (2~3개)
        const count = Math.random() > 0.5 ? 2 : 3;

        for (let i = 0; i < count; i++) {
            // 📏 통나무 길이 랜덤 설정 (100px ~ 190px 사이)
            const randomWidth = 100 + Math.floor(Math.random() * 90);

            objs.push({ 
                // 간격을 조금 더 넓혀서(300) 긴 통나무끼리 겹치지 않게 함
                x: (i * 300) + Math.random() * 50, 
                type: 'log', 
                width: randomWidth, // ✨ 랜덤 길이 적용!
                height: 40, 
                speed: speed 
            });
        }
        return; // 통나무 만들고 함수 종료
    }
// 🚗 외제차? 국산차? 랜덤 차 색상 팔레트 목록
    const carColors = ["#FFB655", "#1785B8", "#F44336", "#2196F3", "#FFEB3B", "#4CAF50", "#FF9800", "#9C27B0", "#795548", "#607D8B"];

    // ... (아래쪽 코드는 그대로 두세요) ...
    // 🚗 [케이스 2] 그 외 모든 땅 (도로, 코트, 얼음, 우주, 강가) -> 적 생성
    const lanes = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
    
    // 난이도 설정
    let maxEnemies = 3;
    if (laneLevel <= 2) maxEnemies = 1;
    else if (laneLevel <= 4) maxEnemies = 2;

    let count = 0;

    // 🕵️‍♂️ sprites.js 데이터 가져오기
    const pool = (typeof opponentPool !== 'undefined') ? opponentPool : [];
    const mascots = pool.filter(p => p.isRedBoo || p.isPegasus);
    const players = pool.filter(p => !p.isRedBoo && !p.isPegasus);

    for (let i = 0; i < 4; i++) {
        if (count >= maxEnemies) break;


// ✨ [핵심 수정] 도로(road)일 때 50% 확률로 '픽셀 자동차' 생성!
        // 그 외 지형이거나, 50% 확률에 안 걸리면 기존 '사람' 생성
        let isCar = (laneType === 'road' && Math.random() < 0.5);

        if (Math.random() < 0.5 || isCar) { // 생성 확률 체크 (차가 당첨되면 무조건 생성)
            const laneX = lanes[i] * 60; 
            const speed = (2 + Math.random() * 2) * speedMult * (Math.random() > 0.5 ? 1 : -1);
            
            let finalObj = {
                x: laneX,
                width: 60, height: 60,
                speed: speed
            };

            if (isCar) {
                // 🚗 픽셀 자동차 데이터 설정
                finalObj.type = 'pixel_car';
                // 세단 or 트럭 랜덤 선택
                finalObj.spriteName = Math.random() > 0.5 ? 'car_sedan' : 'car_truck';
                // 차체 색상 랜덤 선택
                finalObj.carColor = carColors[Math.floor(Math.random() * carColors.length)];
                finalObj.name = "교통사고"; // 충돌 메시지용
                finalObj.team = "안전운전"; // 충돌 메시지용
            } else {
                // 🏃‍♂️ 기존 사람/마스코트 데이터 설정
                finalObj.type = 'player';
                let selectedData = null;
                if (Math.random() < 0.225 && mascots.length > 0) {
                    selectedData = mascots[Math.floor(Math.random() * mascots.length)];
                } else if (players.length > 0) {
                    selectedData = players[Math.floor(Math.random() * players.length)];
                }

                if (selectedData) {
                    finalObj.name = selectedData.name;
                    finalObj.team = selectedData.team;
                    finalObj.number = selectedData.number;
                    finalObj.color = selectedData.color;
                    finalObj.isRedBoo = selectedData.isRedBoo;
                    finalObj.isPegasus = selectedData.isPegasus;
                } else {
                    finalObj.name = "OPPONENT"; finalObj.team = "KBL"; finalObj.number = "00"; finalObj.color = "#333";
                }
            }

            objs.push(finalObj);
            count++;
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

    // --- [모드 1] 슈팅 보너스 스테이지 ---
    if (gameState === 'SHOOTING') {
        shootingTimer++;
        if (keys['ArrowLeft']) player.currentX -= 8;
        if (keys['ArrowRight']) player.currentX += 8;
        player.currentX = Math.max(0, Math.min(canvas.width - 60, player.currentX));

        ctx.fillStyle = "#000510"; 
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        if (Math.random() < 0.04) {
            const sX = Math.random() * (canvas.width - 50);
            shootingEnemies.push({ startX: sX, x: sX, y: -50, speed: 3 + Math.random() * 2, theta: Math.random() * Math.PI * 2, amplitude: 30 + Math.random() * 40 });
        }

        if (shootingTimer % 8 === 0) shootingBullets.push({ x: player.currentX + 30, y: canvas.height - 130 });

        shootingBullets.forEach((b, i) => {
            b.y -= 12;
            ctx.fillStyle = "#00ffff"; ctx.fillRect(b.x - 2, b.y, 4, 15);
            if (b.y < -20) shootingBullets.splice(i, 1);
        });

        shootingEnemies.forEach((en, ei) => {
            en.y += en.speed;
            en.theta += 0.05;
            en.x = en.startX + Math.sin(en.theta) * en.amplitude;
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
        drawCharacter(ctx, pObj, player.currentX, canvas.height - 120, 60, uniformPool[selectedUniformIdx]?.color);

        if (shootingTimer > 720) { alert(`보너스 종료! ${shootingKills}명 격파!`); gameState = 'PLAYING'; syncUI(); }
        animationFrameId = requestAnimationFrame(gameLoop);
        return;
    }

    // --- [모드 2] 일반 달리기 스테이지 ---
    cameraY += (player.lane * LANE_HEIGHT - cameraY) * 0.1;
    const baseY = canvas.height - 250;
    let onRiver = false, onLog = false, logSpeed = 0;

    lanes.forEach(lane => {
        const sY = baseY + (cameraY - lane.index * LANE_HEIGHT);
        if (sY < -LANE_HEIGHT || sY > canvas.height) return;

        // 1. 배경 그리기

if (lane.type === 'court') {
                    const relIdx = lane.index % LEVEL_DIST; 
                    const centerX = canvas.width / 2;
                    // 골대(림)의 대략적인 Y 위치 계산 (하단: 4번 레인 / 상단: 35번 레인)
                    const bottomHoopY = sY + (relIdx - 4) * LANE_HEIGHT;
                    const topHoopY = sY + (relIdx - 35) * LANE_HEIGHT;
                    
                    // 치수 설정 (픽셀 단위)
                    const arcRadius = 400;      // 3점 라인 반지름
                    const paintWidth = 140;     // 빨간색 페인트 존 너비
                    const whiteBoxWidth = 80;   // 안쪽 하얀색 박스 너비
                    const borderSize = 45;      // 양옆 검은색 보더 크기

                    // =================================================
                    // 1. 레이어 1: 바닥 및 보더 (Background)
                    // =================================================
                    
                    // 전체 우드톤 바닥
                    ctx.fillStyle = "#E8C68E"; 
                    ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);

                    // 양쪽 사이드 블랙 보더
                    ctx.fillStyle = "#111111"; // 완전 검정보다 살짝 부드러운 검정
                    ctx.fillRect(0, sY, borderSize, LANE_HEIGHT); // 왼쪽
                    ctx.fillRect(canvas.width - borderSize, sY, borderSize, LANE_HEIGHT); // 오른쪽

                    // =================================================
                    // 2. 레이어 2: 텍스트 및 장식 (Decorations)
                    // =================================================

                    // 🌟 [오른쪽] 금색 별 7개 (V7) - 5칸 간격으로 배치
                    if ([5, 10, 15, 20, 25, 30, 35].includes(relIdx)) {
                        ctx.fillStyle = "#FFD700"; 
                        ctx.font = "24px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                        ctx.fillText("★", canvas.width - (borderSize/2), sY + LANE_HEIGHT/2);
                    }

// ==========================================================
                    // 🌟 [핵심 수정 1] 왼쪽 텍스트: "1레인 1글자" 방식 (겹침 완벽 해결)
                    // 글자를 한 번에 그리지 않고, 레인 번호에 맞춰 한 글자씩만 그립니다.
                    // 절대 겹치지 않고 매우 깔끔하게 나옵니다.
                    // ==========================================================
                    const leftText = "HYUNDAI MOBIS PHOEBUS"; // 공백 포함 21자
                    const startLane = 8; // 8번 레인부터 글자 시작 (H)

                    // 현재 레인 번호(relIdx)가 글자 범위 안에 있는지 확인
                    const charIndex = relIdx - startLane;

                    if (charIndex >= 0 && charIndex < leftText.length) {
                        const char = leftText[charIndex];
                        
                        // 공백이 아닐 때만 그리기
                        if (char !== " ") {
                            ctx.save();
                            // 현재 레인의 왼쪽 보더 정중앙으로 이동
                            ctx.translate(borderSize / 2, sY + LANE_HEIGHT / 2);
                            ctx.rotate(-Math.PI / 2); // 90도 회전 (아래에서 위로 읽기)
                            
                            ctx.fillStyle = "white";
                            ctx.font = "bold 28px Galmuri11"; 
                            ctx.textAlign = "center"; 
                            ctx.textBaseline = "middle";
                            ctx.fillText(char, 0, 0); // 글자 하나 콕 박기
                            ctx.restore();
                        }
                    }

                    // =================================================
                    // 3. 레이어 3: 페인트 존 (Paint Zone - Red & White)
                    // =================================================
                    const mobisRed = "#D50032"; 

                    // --- [하단 구역] (0 ~ 6번 레인) ---
                    if (relIdx >= 0 && relIdx <= 5) {
                        // 빨간색 박스 (전체)
                        ctx.fillStyle = mobisRed;
                        ctx.fillRect(centerX - (paintWidth/2), sY, paintWidth, LANE_HEIGHT);

                        // 하얀색 박스 (골대 밑 강조 구역) - 1~3번 레인에 위치
                        if (relIdx >= 4 && relIdx <= 5) {
                            ctx.fillStyle = "white";
                            ctx.fillRect(centerX - (whiteBoxWidth/2), sY, whiteBoxWidth, LANE_HEIGHT);
                        }
                    }

                    // --- [상단 구역] (33 ~ 39번 레인) ---
                    if (relIdx >= 34 && relIdx <= 39) {
                        // 빨간색 박스
                        ctx.fillStyle = mobisRed;
                        ctx.fillRect(centerX - (paintWidth/2), sY, paintWidth, LANE_HEIGHT);

                        // 하얀색 박스 - 36~38번 레인에 위치
                        if (relIdx >= 34 && relIdx <= 35) {
                            ctx.fillStyle = "white";
                            ctx.fillRect(centerX - (whiteBoxWidth/2), sY, whiteBoxWidth, LANE_HEIGHT);
                        }
                    }

                    // =================================================
                    // 4. 레이어 4: 라인 드로잉 (White Lines)
                    // =================================================
                    ctx.strokeStyle = "white";
                    ctx.lineWidth = 4;

                    // 사이드 라인 (보더 경계선)
                    ctx.beginPath();
                    ctx.moveTo(borderSize, sY); ctx.lineTo(borderSize, sY + LANE_HEIGHT);
                    ctx.moveTo(canvas.width - borderSize, sY); ctx.lineTo(canvas.width - borderSize, sY + LANE_HEIGHT);
                    ctx.stroke();

                    // --- [하단 라인 디테일] ---
                    // 베이스라인
                    if (relIdx === 0) { 
                        ctx.beginPath(); ctx.moveTo(borderSize, sY); ctx.lineTo(canvas.width - borderSize, sY); ctx.stroke();
                    }
                    // 페인트존 세로선
                    if (relIdx >= 0 && relIdx <= 5) {
                        ctx.beginPath();
                        ctx.moveTo(centerX - (paintWidth/2), sY); ctx.lineTo(centerX - (paintWidth/2), sY + LANE_HEIGHT);
                        ctx.moveTo(centerX + (paintWidth/2), sY); ctx.lineTo(centerX + (paintWidth/2), sY + LANE_HEIGHT);
                        ctx.stroke();
                    }
                    // 자유투 라인 (가로선 + 반원)
                    if (relIdx === 6) {
                        ctx.beginPath(); ctx.moveTo(centerX - (paintWidth/2), sY + LANE_HEIGHT); ctx.lineTo(centerX + (paintWidth/2), sY + LANE_HEIGHT); ctx.stroke();
                        ctx.beginPath(); ctx.arc(centerX, sY + LANE_HEIGHT, (paintWidth/2), 0, Math.PI, true); ctx.stroke();
                    }
                    // 3점슛 라인 (곡선)
                    if (relIdx <= 11) {
                        ctx.save(); ctx.beginPath(); ctx.rect(borderSize, sY, canvas.width - borderSize*2, LANE_HEIGHT); ctx.clip();
                        ctx.beginPath(); ctx.arc(centerX, bottomHoopY, arcRadius, 0, Math.PI * 2); ctx.stroke();
                        ctx.restore();
                    }
                    // ✨ 노 차지 존 (No Charge Zone) 반원 (스마일 라인)
                    // 골대 중심(약 4번 레인 바닥) 아래에 그려지는 반원
                    if (relIdx === 4) {
                        ctx.beginPath();
                        ctx.arc(centerX, sY + LANE_HEIGHT + 39, 30, 0, Math.PI, true); // 아래로 볼록
                        ctx.stroke();
                    }

                    // --- [중앙 구역 (Center)] ---
                    if (relIdx >= 18 && relIdx <= 22) {
                        const midY = sY + (relIdx - 20) * LANE_HEIGHT + (LANE_HEIGHT / 2);
                        ctx.save(); ctx.beginPath(); ctx.rect(borderSize, sY, canvas.width - borderSize*2, LANE_HEIGHT); ctx.clip();
                        
                        if (relIdx === 20) {
                            // 센터 라인
                            ctx.beginPath(); ctx.moveTo(borderSize, midY); ctx.lineTo(canvas.width - borderSize, midY); ctx.stroke();
                            // 중앙 로고 (빨간 원)
                            ctx.fillStyle = mobisRed;
                            ctx.beginPath(); ctx.arc(centerX, midY, 60, 0, Math.PI * 2); ctx.fill();
                            ctx.strokeStyle = "white"; ctx.lineWidth = 3; ctx.stroke();
                            // PHOEBUS 텍스트
                            ctx.fillStyle = "white"; ctx.font = "bold 16px Galmuri11"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
                            ctx.fillText("PHOEBUS", centerX, midY);
                        } else {
                            // 센터 서클 외곽선
                            ctx.beginPath(); ctx.arc(centerX, midY, 60, 0, Math.PI * 2); ctx.stroke();
                        }
                        ctx.restore();
                    }

                    // --- [상단 라인 디테일] ---
                    // 자유투 라인
                    if (relIdx === 33) {
                        ctx.beginPath(); ctx.moveTo(centerX - (paintWidth/2), sY); ctx.lineTo(centerX + (paintWidth/2), sY); ctx.stroke();
                        ctx.beginPath(); ctx.arc(centerX, sY, (paintWidth/2), 0, Math.PI, false); ctx.stroke();
                    }
                    // 페인트존 세로선
                    if (relIdx >= 34 && relIdx <= 39) {
                        ctx.beginPath();
                        ctx.moveTo(centerX - (paintWidth/2), sY); ctx.lineTo(centerX - (paintWidth/2), sY + LANE_HEIGHT);
                        ctx.moveTo(centerX + (paintWidth/2), sY); ctx.lineTo(centerX + (paintWidth/2), sY + LANE_HEIGHT);
                        ctx.stroke();
                    }
                    // 3점슛 라인
                    if (relIdx >= 28) {
                        ctx.save(); ctx.beginPath(); ctx.rect(borderSize, sY, canvas.width - borderSize*2, LANE_HEIGHT); ctx.clip();
                        ctx.beginPath(); ctx.arc(centerX, topHoopY, arcRadius, 0, Math.PI * 2); ctx.stroke();
                        ctx.restore();
                    }
                    // ✨ 노 차지 존 반원 (상단)
                    if (relIdx === 36) {
                        ctx.beginPath();
                        ctx.arc(centerX, sY +40, 30, 0, Math.PI, false); // 위로 볼록
                        ctx.stroke();
                    }
                    // 베이스라인 (종료)
                    if (relIdx === 39) {
                        ctx.beginPath(); ctx.moveTo(borderSize, sY + LANE_HEIGHT); ctx.lineTo(canvas.width - borderSize, sY + LANE_HEIGHT); ctx.stroke();
                    }

                    // 나무 질감 (투명도 낮춤)
                    ctx.strokeStyle = "rgba(0,0,0,0.04)"; ctx.lineWidth = 1;
                    for(let i=borderSize; i<canvas.width-borderSize; i+=20) { 
                        ctx.beginPath(); ctx.moveTo(i, sY); ctx.lineTo(i, sY+LANE_HEIGHT); ctx.stroke(); 
                    }
                

        } else {
            ctx.fillStyle = lane.color; ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);
        }

   // 2. 특수 지형 효과 (배경색 덧칠)
        if (lane.type === 'ice') {
            // ❄️ 빙판 효과
            let iceGrad = ctx.createLinearGradient(0, sY, 0, sY + LANE_HEIGHT);
            iceGrad.addColorStop(0, "rgba(255, 255, 255, 0.1)"); 
            iceGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.4)"); 
            iceGrad.addColorStop(1, "rgba(255, 255, 255, 0.1)");
            ctx.fillStyle = iceGrad; ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);
        } 
        else if (lane.type === 'cosmic') {
            // 🌌 우주 배경 (진한 남색 + 별)
            ctx.fillStyle = "#020014"; ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);
            for(let i=0; i<3; i++) { 
                ctx.fillStyle="white"; 
                ctx.fillRect((lane.index*150+i*100)%canvas.width, sY+40, 2, 2); 
            }
        } 
// ... (위쪽 court, ice, cosmic 코드들은 그대로 두세요)

        // 🌊 [추가] 강물 디자인: 찰랑거리는 물결 효과
        else if (lane.type === 'river_water') {
            // 1. 깊은 물 색깔 (베이스)
            ctx.fillStyle = "#2196F3"; 
            ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);

            // 2. 넘실거리는 물결 (밝은색 + 움직임)
            const time = Date.now() / 300; // 물결 속도
            ctx.fillStyle = "#64B5F6"; // 밝은 물색
            
            // 물결 줄무늬 그리기
            for (let i = -50; i < canvas.width; i += 60) {
                // Math.sin으로 물결 모양 만들기
                const waveY = Math.sin(time + (i * 0.05)) * 8; 
                ctx.fillRect(i, sY + 30 + waveY, 40, 8); 
                
                // 작은 물결 하나 더
                ctx.fillRect(i + 30, sY + 50 - waveY, 20, 5); 
            }

            // 3. 반짝이는 윤슬 (흰색 점)
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            for (let i = 0; i < 5; i++) {
                // 반짝이가 흘러가는 효과
                const sparkleX = (lane.index * 130 + i * 90 + Date.now()/4) % (canvas.width + 50) - 20;
                const sparkleY = sY + 15 + (i * 12);
                ctx.fillRect(sparkleX, sparkleY, 4, 4);
            }
        }

        // ... (아래 else { ctx.fillStyle = lane.color ... } 는 그대로 두세요)

// 🌊 2. 강 위의 통나무 (River & Log) - 디자인 업그레이드!
        // 3. 객체 그리기 및 충돌 판정
        const isPlayerLane = (player.lane === lane.index);
        if (isPlayerLane && lane.type === 'river_water') onRiver = true;

        lane.objects.forEach((obj, idx) => {
// 👇 [여기서부터 복사] 아이템 그리기 및 획득 로직
            if (obj.type === 'item') {
                // 1. 둥실둥실 효과
                const floatY = Math.sin(Date.now() / 200) * 5; 
                const itemSize = 40; 

                // 2. 바나나 vs 초코바 데이터 선택
                let data, pal;
                if (obj.name === 'CHOCO') {
                    data = ChocoSpriteData;
                    pal = ChocoPalette;
                } else {
                    data = BananaSpriteData;
                    pal = BananaPalette;
                }

                // 3. 그림자 그리기
                ctx.fillStyle = "rgba(0,0,0,0.3)";
                ctx.beginPath();
                ctx.ellipse(obj.x + 10 + (itemSize/2), sY + 50, 15, 5, 0, 0, Math.PI * 2);
                ctx.fill();

                // 4. 픽셀 아트 그리기
                // sprites.js에 데이터가 잘 들어있다면 그려짐
                if (typeof drawCustomSprite === "function" && data && pal) {
                     drawCustomSprite(ctx, data, pal, obj.x + 10, sY + 20 + floatY, itemSize);
                }

                // 5. 냠냠 먹기 (충돌 판정)
                if (isPlayerLane) {
                    const dist = Math.abs((player.currentX + 30) - (obj.x + 30));
                    if (dist < 40) { // 닿았으면
                        lane.objects.splice(idx, 1); // 삭제
                        
                        if (obj.name === 'CHOCO') {
                            totalMP += 20; 
                                 } else {
                            totalMP += 10; 

                        }
                        syncUI(); // 점수판 갱신
                    }
                }
                return; // 아이템은 여기서 끝! (아래 적 코드 실행 안 함)
            }
            // 👆 [여기까지 복사]
            if (['road', 'court', 'ice', 'cosmic', 'river_land'].includes(lane.type)) {
                obj.x += obj.speed;
                if (obj.x > canvas.width + 100) obj.x = -150; if (obj.x < -150) obj.x = canvas.width + 100;
                let drawX = obj.x;
                if (lane.type === 'court') drawX += Math.sin(Date.now() / 100) * 3;

// ✨ [수정] 자동차면 픽셀 차 그리기, 아니면 사람 그리기
// 🚗 [수정] 자동차 그리기 & 판정 (좌표 일치화)
                if (obj.type === 'pixel_car') {
                    ctx.save();
                    
                    // 1. 자동차 그리기
                    // 🎨 방향에 따른 "중앙 기준" 뒤집기 (좌표 오차 원천 차단)
                    // 차의 정중앙(drawX + 30)으로 붓을 옮깁니다.
                    ctx.translate(drawX + 30, sY);
                    
                    if (obj.speed < 0) {
                        ctx.scale(-1, 1); // 오른쪽으로 갈 때만 뒤집기
                    }
                    
                    // 자동차 색상 적용
                    const currentCarPalette = {...CarPalette, 9: obj.carColor};

                    // 그림 그리기 (중앙 기준이므로 x좌표는 -30부터 시작)
                    if (Sprites32[obj.spriteName]) {
                        drawSprite32(ctx, obj.spriteName, currentCarPalette, -30, 10, 60);
                    } else {
                        // 데이터 없을 때 비상용 박스
                        ctx.fillStyle = obj.carColor || "red";
                        ctx.fillRect(-30, 10, 60, 40);
                    }
                    
                    ctx.restore();

                    // 2. 충돌 판정 박스 (Hitbox) 설정
                    // 시각적으로 보이는 차체: drawX ~ drawX + 60
                    // 실제 충돌 영역: 앞뒤 범퍼 조금씩 떼고 중앙만 (drawX + 20 ~ drawX + 40)
                    eLeft = drawX + 20; 
                    eRight = drawX + 40; 

                } else {
                    // 🏃‍♂️ 사람/장애물 그리기 (기존 코드 유지)
                    drawCharacter(ctx, obj, drawX, sY + 10, 60, obj.color, obj.number);
                    
                    // 이름표 그리기
                    const teamName = obj.team || "TEAM";
                    const playerName = obj.name || "PLAYER";
                    ctx.font = "bold 8px Galmuri11"; 
                    const teamWidth = ctx.measureText(teamName).width;
                    ctx.font = "bold 10px Galmuri11";
                    const playerWidth = ctx.measureText(playerName).width;
                    const boxWidth = Math.max(teamWidth, playerWidth) + 8;
                    const boxX = drawX + 30 - (boxWidth / 2);
                    const boxY = sY + 68;

                    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
                    ctx.fillRect(boxX, boxY, boxWidth, 24);
                    ctx.textAlign = "center";
                    ctx.fillStyle = "#FFD700"; ctx.fillText(teamName, boxX + boxWidth/2, boxY + 9);
                    ctx.fillStyle = "white"; ctx.fillText(playerName, boxX + boxWidth/2, boxY + 20);   
                    
                    // 사람 판정은 조금 더 넓게
                    eLeft = drawX + 15;
                    eRight = drawX + 45;
                }

                // 📏 [디버그] 히트박스 눈으로 확인하기 (초록:나, 빨강:적)
                // 문제가 해결되면 이 부분은 지우셔도 됩니다.
                const pLeft = player.currentX + 25; 
                const pRight = player.currentX + 35; 

                // ctx.strokeStyle = "#00FF00"; ctx.strokeRect(pLeft, sY + 20, pRight - pLeft, 40); // 내 박스
                // ctx.strokeStyle = "#FF0000"; ctx.strokeRect(eLeft, sY + 20, eRight - eLeft, 40); // 적 박스

                // 💥 실제 충돌 체크
                if (invulnerable === 0 && isPlayerLane && pRight > eLeft && pLeft < eRight) {
                    lives--; syncUI();
                    triggerHitEffect(); 
                    
                    if (obj.type === 'pixel_car') {
                        showDamageMsg("교통사고! 🚑");
                    } else {
                        const actions = ['블락', '스틸', '굿 파울'];
                        showDamageMsg(`[${obj.team}] ${obj.name}의 ${actions[Math.floor(Math.random()*3)]}!`);
                    }
                    
                    if (lives <= 0) triggerGameOver(obj.type === 'pixel_car' ? "로드킬..." : "파울 아웃!"); 
                    else invulnerable = 60;
                }            // 👈 여기가 땅 위 장애물 if문 닫는 괄호
            

      // ✨ 수정된 통나무 코드 (여기에 넣어야 obj 에러가 안 납니다!)
} else if (lane.type === 'river_water' && obj.type === 'log') {
    obj.x += obj.speed;
    if (obj.x > canvas.width + 100) obj.x = -150;
    if (obj.x < -150) obj.x = canvas.width + 100;

    // 🎨 통나무 디자인
    ctx.fillStyle = "#8D6E63"; // 나무색
    
    // 1. 몸통
    ctx.fillRect(obj.x, sY + 20, obj.width, 40);
    
    // 2. 양쪽 끝 둥글게
    ctx.beginPath(); ctx.arc(obj.x, sY + 40, 20, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(obj.x + obj.width, sY + 40, 20, 0, Math.PI * 2); ctx.fill();

    // 3. 나무 껍질 무늬
    ctx.fillStyle = "#5D4037"; 
    ctx.fillRect(obj.x + 20, sY + 20, 10, 40);
    ctx.fillRect(obj.x + 60, sY + 20, 15, 40);
    ctx.fillRect(obj.x + obj.width - 30, sY + 20, 8, 40);

    // 4. 하이라이트
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(obj.x + 5, sY + 25, obj.width - 10, 5);

// 5. 나이테
    ctx.fillStyle = "#D7CCC8";
    ctx.beginPath(); ctx.ellipse(obj.x, sY + 40, 5, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(obj.x + obj.width, sY + 40, 5, 15, 0, 0, Math.PI * 2); ctx.fill();

    // ✨ [수정] 탑승 판정 널널하게 변경 (+20px 여유)
    // 기존: (player.currentX + 30) > obj.x ...
    // 수정: (obj.x - 20) ~ (obj.x + width + 20) 범위까지 인정!
    if (isPlayerLane && 
        (player.currentX + 30) > (obj.x - 20) && 
        (player.currentX + 30) < (obj.x + obj.width + 20)) { 
        onLog = true; 
        logSpeed = obj.speed; 
    }



            } else if (obj.type === 'audience') {
                const signY = sY + 30; ctx.fillStyle = "#FFFFFF"; ctx.fillRect(obj.x, signY, 40, 30);
                ctx.strokeStyle = "#000000"; ctx.strokeRect(obj.x, signY, 40, 30);
                const d = PixelNumbers[obj.char]; if(d) { ctx.fillStyle = "#D70025"; d.forEach((row, ri) => row.forEach((p, ci) => { if(p) ctx.fillRect(obj.x + 10 + ci * 4, signY + 5 + ri * 4, 4, 4); })); }
            }
        });
    });


if (onRiver && !onLog && invulnerable === 0) { 
    lives--; syncUI(); 
    triggerHitEffect(); // 👈 ✨ [여기!] 물에 빠질 때도 번쩍!
    
    showDamageMsg("으악! 태화강에 빠졌다!"); 
    invulnerable = 60; 
    if (lives <= 0) triggerGameOver("꼬로록.."); 
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
        if (lives <= 0) triggerGameOver("타임아웃!"); else { shotClock = 100; }
    }
    if (invulnerable > 0) invulnerable--;
    document.getElementById('ui-shotclock').style.width = shotClock + '%';
    drawCharacter(ctx, pObj, player.currentX, baseY - jY + 10, 60, uniformPool[selectedUniformIdx]?.color);
    
    animationFrameId = requestAnimationFrame(gameLoop);
}

        function startGame() {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            resize(); 
            player.lane = 0; 
            cameraY = 0;
            
            // 데이터 로드 안전장치: selectedUniformIdx가 유효하지 않으면 0으로 초기화
            if (selectedUniformIdx < 0 || selectedUniformIdx >= uniformPool.length) {
                selectedUniformIdx = 0;
                saveGameData();
            }

            document.querySelectorAll('.overlay, .view').forEach(o => o.classList.add('hidden'));
            gameState = 'PLAYING'; score = 0; earnedMP = 0; shotClock = 100; lives = 3; currentLevel = 1; consecutiveRoads = 0;
            lanes = []; for(let i=0; i<35; i++) addLane(i); 
            gameLoop();
        }

/* --- [수정] 앞으로 이동 (맵 겹침 버그 수정 & 렉 방지 유지) --- */
function moveForward() {
    if (gameState !== 'PLAYING') return;
    
    player.lane++; 
    score = player.lane; 
    totalMP += 1; 
    shotClock = 100; 

    // 퀴즈 및 레벨업 체크
    if (player.lane > 0 && player.lane % LEVEL_DIST === 0) { 
        gameState = 'QUIZ'; 
        showQuiz(); 
    }

    // 🏗️ [버그 수정 핵심] 길 만들기 로직 변경
    // 기존: addLane(lanes.length) -> 삭제된 개수만큼 번호가 밀려서 겹침 발생
    // 수정: 현재 존재하는 '가장 마지막 레인 번호'를 찾아서 그 다음 번호를 생성
    const lastLaneIndex = lanes.length > 0 ? lanes[lanes.length - 1].index : -1;
    
    // 내 위치보다 20칸 앞까지 길이 없으면 새로 추가
    if (lastLaneIndex < player.lane + 20) {
        addLane(lastLaneIndex + 1);
    }
    
    // 🧹 [렉 방지] 지나온 길 삭제
    if (lanes.length > 50 && player.lane > 20) {
        // 화면 밖으로 벗어난(내 위치 - 15칸) 길을 삭제
        lanes = lanes.filter(l => l.index > player.lane - 15);
    }

    syncUI();
}

/* --- [수정] 뒤로 이동 (레벨 제한 기능 추가) --- */
function moveBackward() {
    if (gameState !== 'PLAYING') return;
    
    // 🚫 [핵심: 레벨 벽] 현재 레벨의 시작점 계산
    // 레벨 1: 0, 레벨 2: 40, 레벨 3: 80 ...
    const minAllowedLane = (currentLevel - 1) * LEVEL_DIST;

    // 시작점보다 앞서 있을 때만 뒤로 갈 수 있음
    if (player.lane > minAllowedLane) {
        player.lane--;
        score = player.lane; // 점수도 깎임 (공정하게)
        shotClock = 100;     // 샷클락 리셋
        syncUI();
    } else {
        // 못 간다는 신호 (선택 사항: 띵~ 소리나 메시지)
        // showDamageMsg("뒤로 갈 수 없습니다!"); 
    }
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
    
    // ✨ 현재 스테이지 번호를 화면에 표시해줍니다.
    const statsEl = document.getElementById('ui-clear-stats');
    if(statsEl) statsEl.innerText = `STAGE ${currentLevel} COMPLETED!`;
    
    syncUI(); 
}
function continueGame() {
    currentLevel++;
    shotClock = 100;
    // 💡 초기화 코드를 모두 지웠습니다. 이제 플레이어는 그 자리에서 계속 전진합니다.

    document.getElementById('overlay-clear').classList.add('hidden');
    // ... (이하 슈팅 보너스 체크 로직)

    // 🚀 5의 배수 레벨(5, 10, 15...)이면 슈팅 보너스 스테이지 시작!
    if (currentLevel % 5 === 0) {
        startShootingBonus();
    } else {
        gameState = 'PLAYING';
        gameLoop();
    }
}

// 슈팅 게임을 시작하기 위해 데이터를 초기화하는 함수입니다.
function startShootingBonus() {
    gameState = 'SHOOTING';
    shootingBullets = [];
    shootingEnemies = [];
	shootingParticles = [];
    shootingTimer = 0;
    shootingKills = 0;
    player.currentX = canvas.width / 2 - 30; // 내 캐릭터를 화면 중앙 바닥에 배치
    gameLoop();
}
        function switchTab(tab) { lastMenuState = gameState; document.querySelectorAll('.view, .overlay').forEach(v => v.classList.add('hidden')); document.getElementById(`view-${tab}`).classList.remove('hidden'); if(tab==='collection') renderCollection(); if(tab==='equipment') renderEquipment(); syncUI(); }
        
        function closeViews() { 
            document.querySelectorAll('.view').forEach(v => v.classList.add('hidden')); 
            if (gameState === 'LEVEL_CLEAR') {
                document.getElementById('overlay-clear').classList.remove('hidden');
            } else if (gameState === 'QUIZ') {
                document.getElementById('overlay-quiz').classList.remove('hidden');
            } else if (gameState === 'OVER') {
                document.getElementById('overlay-over').classList.remove('hidden');
            } else if (gameState === 'START') {
                document.getElementById('overlay-start').classList.remove('hidden');
            }
            renderPreview(); syncUI(); 
        }

        function renderPreview() { 
            if(!document.getElementById('preview-canvas')) return; 
            const cp = document.getElementById('preview-canvas').getContext('2d'); 
            cp.clearRect(0,0,80,80); 
            // 미리보기에서도 유니폼 색상 안전하게 로드
            const uniformInfo = uniformPool[selectedUniformIdx];
            const currentUniformColor = uniformInfo ? uniformInfo.color : "#D70025";
            drawCharacter(cp, playerPool.find(p=>p.id===selectedId), 0,0,80, currentUniformColor); 
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

            // 👇 [수정] 여기에 원하는 가격을 입력하세요! (예: 500)
            const scoutPrice = 200; 

            // 👇 100이라고 적혀있던 곳을 scoutPrice로 바꿨습니다.
            if (totalMP < scoutPrice) return showDamageMsg(`MP 부족! (${scoutPrice} 필요)`);
            
            // 👇 여기도 100을 지우고 scoutPrice로 바꿨습니다.
            totalMP -= scoutPrice;

const p = avail[Math.floor(Math.random() * avail.length)];
            myCollection.add(p.id); saveGameData(); syncUI();
            const modal = document.getElementById('modal'); modal.classList.remove('hidden');
            document.getElementById('scout-result').innerHTML = `
                <div class="id-card">
                    <div class="id-header"><span>PHOEBUS OFFICIAL</span><span>PLAYER CARD</span></div>
                    <div class="id-body text-black">
                        <div class="id-photo-area"><canvas id="card-canvas" width="80" height="80"></canvas></div>
                        <div class="id-info-main">
                            <div class="id-team">ULSAN HYUNDAI MOBIS</div>
                            <div class="id-name">${p.name}</div>
                            <div class="id-number">#${p.number}</div>
                        </div>
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
            uniformPool.forEach(u => {
                const isSelected = selectedUniformIdx === u.id;
                grid.innerHTML += `
                    <div onclick="selectUniform(${u.id})" class="p-4 border-4 ${isSelected ? 'border-yellow-400 bg-yellow-50' : 'border-black bg-white'} cursor-pointer flex justify-between items-center shadow-md">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 border-2 border-black" style="background-color: ${u.color}"></div>
                            <div class="font-normal">${u.name}</div>
                        </div>
                        ${isSelected ? '<div class="text-green-600 font-bold text-sm">EQUIPPED</div>' : ''}
                    </div>
                `;
            });
        }

// 👇 유니폼 선택 함수 (수정됨: 클릭 즉시 화면 갱신)
function selectUniform(id) {
    // 1. 선택한 유니폼 번호 저장
    selectedUniformIdx = id; 
    saveGameData(); 

    // 2. 🌟 핵심: 상점의 유니폼 목록을 다시 그려라! (이게 없어서 안 바뀌었던 겁니다)
    // 방금 전 상점 코드에 추가했던 그 함수를 여기서 호출합니다.
    if (typeof renderShopUniforms === "function") {
        renderShopUniforms(); 
    }
}
        function selectPlayerFromRoster(id) { 
            selectedId = id; 
            saveGameData(); 
            renderCollection(); 
            renderPreview(); 
            // 선택 후 자동으로 창 닫고 복귀
            closeViews();
        }
        
        function togglePause() { if (gameState === 'PLAYING') gameState = 'PAUSED'; else if (gameState === 'PAUSED') { gameState = 'PLAYING'; gameLoop(); } }

        // --- 터치 이벤트 핸들러 추가 ---
 /* --- 🚀 반응 속도 개선 + 상하좌우 즉시 이동 로직 --- */

window.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
    touchMoved = false; // 새로운 터치가 시작될 때 잠금 해제
}, {passive: false});

window.addEventListener('touchmove', e => {
    if (gameState !== 'PLAYING' && gameState !== 'SHOOTING') return;

    // 🛸 슈팅 모드일 때: 기존 드래그 로직
    if (gameState === 'SHOOTING') {
        const touchX = e.touches[0].clientX;
        const canvasRect = canvas.getBoundingClientRect();
        player.currentX = touchX - canvasRect.left - 30;
        player.currentX = Math.max(0, Math.min(canvas.width - 60, player.currentX));
        e.preventDefault();
        return;
    }

    // 🏃 달리기 모드일 때: 스와이프 즉시 반응
    if (gameState === 'PLAYING' && !touchMoved) {
        const xDiff = e.changedTouches[0].screenX - touchStartX;
        const yDiff = e.changedTouches[0].screenY - touchStartY;
        const threshold = 25; // 25px만 움직여도 즉시 반응! (더 민감하게 조정됨)

        if (Math.abs(xDiff) > Math.abs(yDiff)) {
            // 좌우 이동
            if (Math.abs(xDiff) > threshold) {
                if (xDiff > 0) player.targetX = Math.min(canvas.width - GRID_SIZE, player.targetX + GRID_SIZE);
                else player.targetX = Math.max(0, player.targetX - GRID_SIZE);
                touchMoved = true; // 한 번 움직였으면 잠금
            }
        } else {
            // 상하 이동
            if (Math.abs(yDiff) > threshold) {
                if (yDiff < -threshold) moveForward();  // 위로 스와이프
                else if (yDiff > threshold) moveBackward(); // 아래로 스와이프 (추가됨!)
                touchMoved = true; // 잠금
            }
        }
    }
    if (e.cancelable) e.preventDefault();
}, {passive: false});

window.addEventListener('touchend', () => {
    touchMoved = false; // 손가락을 떼면 다음 움직임을 위해 잠금 해제
}, {passive: false});

        window.onload = resize;
        window.addEventListener('resize', resize);
window.addEventListener('keydown', (e) => {
    if (gameState === 'SHOOTING') return; 
    if (e.repeat || gameState !== 'PLAYING') return;
    
    if (e.code === 'ArrowUp' || e.code === 'Space') moveForward();
    
    // ✨ [추가] 아래 화살표 키를 누르면 뒤로 이동
    if (e.code === 'ArrowDown') moveBackward(); 
    
    if (e.code === 'ArrowLeft') player.targetX = Math.max(0, player.targetX - GRID_SIZE);
    if (e.code === 'ArrowRight') player.targetX = Math.min(canvas.width - GRID_SIZE, player.targetX + GRID_SIZE);
});


// script.js 맨 아래에 추가
function resetAllData() {
    // 1. 사용자에게 정말 지울 것인지 확인 (브라우저 알림창)
    const firstCheck = confirm("경고: 모든 선수와 최고 점수가 사라집니다. 정말 초기화할까요?");
    
    if (firstCheck) {
        // 2. 한 번 더 물어봐서 실수를 방지합니다.
        const secondCheck = confirm("진짜로 다 지울까요? 이 작업은 되돌릴 수 없습니다.");
        
        if (secondCheck) {
            // 3. 로컬 스토리지 데이터 삭제
            localStorage.removeItem('mobis_final_mp');
            localStorage.removeItem('mobis_final_col');
            localStorage.removeItem('mobis_final_best');
            localStorage.removeItem('mobis_final_selected');
            localStorage.removeItem('mobis_final_uniform');
            
            // 4. 완료 알림 후 페이지 새로고침
            alert("데이터가 모두 사라졌습니다. 처음부터 다시 시작합니다!");
            location.reload();
        }
    }
}

// 👇 [복사] 상점 탭 기능 (script.js 맨 아래에 추가)
function switchShopTab(tabName) {
    // 1. 모든 탭 숨기기
    document.getElementById('shop-tab-scout').classList.add('hidden');
    document.getElementById('shop-tab-items').classList.add('hidden');
    document.getElementById('shop-tab-uniform').classList.add('hidden');
    
    // 2. 버튼 활성 표시 끄기
    document.querySelectorAll('.shop-tab-btn').forEach(btn => btn.classList.remove('active'));

    // 3. 선택한 탭 켜기
    const btns = document.querySelectorAll('.shop-tab-btn');
    if(tabName === 'scout') { 
        btns[0].classList.add('active'); 
        document.getElementById('shop-tab-scout').classList.remove('hidden'); 
    }
    if(tabName === 'items') { 
        btns[1].classList.add('active'); 
        document.getElementById('shop-tab-items').classList.remove('hidden'); 
    }
    if(tabName === 'uniform') { 
        btns[2].classList.add('active'); 
        document.getElementById('shop-tab-uniform').classList.remove('hidden');
        renderShopUniforms(); // 유니폼 목록 그리기
    }
}

// 상점 유니폼 목록 렌더링
function renderShopUniforms() {
    const grid = document.getElementById('shop-tab-uniform');
    if(!grid) return;
    grid.innerHTML = '';
    
    if(typeof uniformPool !== 'undefined') {
        uniformPool.forEach(u => {
            grid.innerHTML += `
                <div class="product-card">
                    <div class="product-header">${u.name}</div>
                    <div class="product-img-area" style="background-color: ${u.color};"></div>
                    <div class="product-info">
                        <button onclick="selectUniform(${u.id})" class="product-btn" ${selectedUniformIdx === u.id ? 'disabled' : ''}>
                            ${selectedUniformIdx === u.id ? '착용 중' : '착용하기'}
                        </button>
                    </div>
                </div>`;
        });
    }
}

// 💥 [추가] 충돌 시 번쩍+흔들림 효과
function triggerHitEffect() {
    // 1. 빨간 화면 번쩍!
    const flash = document.getElementById('flash-overlay');
    if (flash) {
        flash.style.backgroundColor = "rgba(215, 0, 37, 0.5)"; // 모비스 레드 반투명
        setTimeout(() => flash.style.backgroundColor = "transparent", 150);
    }

    // 2. 화면 흔들림 (CSS hit-effect 클래스 활용)
    if (canvas) {
        canvas.classList.remove('hit-effect'); // 혹시 있으면 제거하고
        void canvas.offsetWidth; // 리플로우 강제 (애니메이션 리셋)
        canvas.classList.add('hit-effect'); // 다시 추가
        setTimeout(() => canvas.classList.remove('hit-effect'), 300);
    }
}