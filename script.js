/* script.js - 게임의 두뇌 및 동작 */

const wrapper = document.getElementById('game-wrapper');
const LANE_HEIGHT = 80, GRID_SIZE = 60, LEVEL_DIST = 50, MAX_LIVES = 5;
let canvas, ctx, animationFrameId;
let gameState = 'START', lastMenuState = 'START';
let totalMP = parseInt(localStorage.getItem('mobis_final_mp')) || 100;
let myCollection = new Set(JSON.parse(localStorage.getItem('mobis_final_col')) || [28, 999]);
let selectedId = parseInt(localStorage.getItem('mobis_final_selected')) || 28;
let bestDist = parseInt(localStorage.getItem('mobis_final_best')) || 0;
let selectedUniformIdx = parseInt(localStorage.getItem('mobis_final_uniform')) || 0;
let player = { lane: 0, x: 0, targetX: 0, currentX: 0 };
let lives = 3, currentLevel = 1, score = 0, earnedMP = 0, shotClock = 100, cameraY = 0, lanes = [], invulnerable = 0, consecutiveRoads = 0;
let touchStartX = 0, touchStartY = 0;
 
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

        function drawCharacter(targetCtx, playerObj, x, y, size, teamColor = "#D70025", numOverride = null) {
            if (!targetCtx) return;
            const sColors = {...Colors, 6: teamColor};
            
            if (playerObj?.isRedBoo) { drawSprite32(targetCtx, 'redboo', { 0: null, 1: "#000000", 2: "#FFFFFF", 3: "#FF0000" }, x, y, size); return; }
            if (playerObj?.isGongaji) { drawCustomSprite(targetCtx, Sprites32.gongaji, GongajiPalette, x, y, size); return; }
	    if (playerObj?.isPegasus) {drawCustomSprite(targetCtx, Sprites32.pegasus, PegasusPalette, x, y, size); return; }
            if (playerObj?.isGorilla) drawSprite32(targetCtx, 'gorilla', sColors, x, y, size);
            else if (playerObj?.isBall || playerObj?.id === 999) drawSprite32(targetCtx, 'basketball', basketballPalette, x, y, size);
            else if (playerObj?.isWhale || playerObj?.id === 26) drawSprite32(targetCtx, 'whale', Colors, x, y, size);
            else {
                sColors[3] = playerObj?.hair || "#332211";
                drawSprite32(targetCtx, 'human_base', sColors, x, y, size);
                
                const num = (numOverride !== null && numOverride !== undefined) ? numOverride : playerObj?.number;
                
                if (num !== undefined && num !== null && !["🐶", "🐳", "🏀", "👹", "M", "O", "B", "I", "S"].includes(String(num))) {
                    targetCtx.fillStyle = "white";
                    const ns = String(num);
                    const pSize = size / 32;
                    if (ns.length === 1) {
                        drawDigit(targetCtx, ns[0], x + 13.5 * pSize, y + 16 * pSize, pSize * 1.8);
                    } else {
                        drawDigit(targetCtx, ns[0], x + 9 * pSize, y + 17 * pSize, pSize * 1.3);
                        drawDigit(targetCtx, ns[1], x + 16.5 * pSize, y + 17 * pSize, pSize * 1.3);
                    }
                }
            }
            if ([6, 12, 45].includes(playerObj?.id)) {
                const time = Date.now() / 400; const radius = size * 0.65;
                for (let i = 0; i < 3; i++) {
                    const angle = time + (i * Math.PI * 2 / 3);
                    const starX = x + size/2 + Math.cos(angle) * radius; const starY = y + size/2 + Math.sin(angle) * radius;
                    const s = size/18; targetCtx.fillStyle = "#FFCA08";
                    targetCtx.fillRect(starX - s/2, starY - s*2, s, s*4); targetCtx.fillRect(starX - s*2, starY - s/2, s*4, s);
                    targetCtx.fillStyle = "white"; targetCtx.fillRect(starX - s/2, starY - s/2, s, s);
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

        function addLane(idx) {
            let type = 'safe', color = idx % 2 === 0 ? '#d29145' : '#de9b42', objs = [];
            if (idx > 0 && idx % LEVEL_DIST === 0) { 
                type = 'goal'; color = '#D70025'; 
                // 관객들과 팻말 배치 (M, O, B, I, S)
                const letters = ['M', 'O', 'B', 'I', 'S'];
                
                // 화면 너비에 맞춰 간격 조정 (잘리지 않게)
                const signWidth = 40;
                const minGap = 5;
                const preferredGap = 30; // 간격 넓게
                
                // 가용 너비 확인
                const maxContentWidth = canvas.width - 40; // 좌우 20px 여유
                const totalSignWidth = signWidth * letters.length;
                
                // 갭 계산
                let gap = preferredGap;
                if (totalSignWidth + gap * (letters.length - 1) > maxContentWidth) {
                    gap = (maxContentWidth - totalSignWidth) / (letters.length - 1);
                }
                
                const totalWidth = totalSignWidth + gap * (letters.length - 1);
                const startX = (canvas.width - totalWidth) / 2;
                
                // 팻말 든 관객 (중앙 정렬)
                letters.forEach((char, i) => {
                    objs.push({ 
                        x: startX + i * (signWidth + gap), 
                        type: 'audience',
                        char: char, 
                        color: '#D70025'
                    });
                });
                consecutiveRoads = 0; 
} else if (idx > 2) {
                // 1. 강이 나올 확률 계산 (기본 10% + 레벨당 3%씩 증가하되, 최대 35%로 제한)
                let riverProb = Math.min(0.35, 0.10 + (currentLevel * 0.03));

                // 난이도 상향: 장애물(도로/강) 등장 확률 (레벨 1: 50% -> 레벨 10: 90% 로 증가)
                const difficultyFactor = Math.min(0.9, 0.35 + (currentLevel * 0.04));

                if (Math.random() < difficultyFactor) {
                    // 2. 강(River) 생성 조건: 레벨 4부터 등장하며 계산된 riverProb 확률에 따라 생성
                    if (currentLevel >= 4 && Math.random() < riverProb) {
                        type = 'river'; 
                        color = '#4fa4b8'; // 물 색깔
                        
                        // 통나무 생성
                        const logCount = Math.floor(Math.random() * 2) + 2; // 2~3개 통나무
                        const speed = (Math.random() * 1.5 + 1.0) * (Math.random()>0.5?1:-1);
                        for(let i=0; i<logCount; i++) {
                            objs.push({
                                x: (canvas.width / logCount) * i + Math.random() * 50,
                                type: 'log',
                                width: 120, // 통나무 너비
                                speed: speed
                            });
                        }
                    } else {
                        // 3. 강이 아니거나 레벨이 낮은 경우 도로(road) 생성
                        type = 'road'; 
                        color = '#4a4a4a'; 
                        
                        // 적 수 증가: 레벨이 오를수록 최대 4명까지
                        const maxEnemies = Math.min(4, 1 + Math.floor(currentLevel/2));
                        const enemyCount = Math.floor(Math.random() * maxEnemies) + 1;
                        
                        // 기본 속도 상향
                        const speedMult = 1.0 + (currentLevel * 0.06); 
                        
                        for(let i=0; i<enemyCount; i++) {
                            const enemy = opponentPool[Math.floor(Math.random() * opponentPool.length)];
                            objs.push({ 
                                x: Math.random()*(canvas.width-60), 
                                speed: (Math.random()*1.2+1.5) * speedMult * (Math.random()>0.5?1:-1), 
                                team: enemy.team, 
                                name: enemy.name, 
                                number: enemy.number, 
                                color: enemy.color, 
                                isRedBoo: enemy.isRedBoo,  
                                isPegasus: enemy.isPegasus // 페가수스 인식표 추가
                            });
                        }
                    }
                } else if (Math.random() > 0.8) {
                    // 아이템 생성 (바나나 또는 초콜릿)
                    const r = Math.random();
                    let itemKey = 'banana';
                    if (r > 0.5) itemKey = 'choco'; 
                    objs.push({ 
                        x: Math.floor(Math.random()*(canvas.width/GRID_SIZE-1))*GRID_SIZE + GRID_SIZE/2, 
                        type: 'item', 
                        itemKey: itemKey 
                    });
                }
            }
            lanes.push({ type, color, objects: objs, index: idx });
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
            if (gameState !== 'PLAYING') return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            cameraY += (player.lane * LANE_HEIGHT - cameraY) * 0.1;
            const baseY = canvas.height - 250;

            let onRiver = false;
            let onLog = false;
            let logSpeed = 0;

            lanes.forEach(lane => {
                const sY = baseY + (cameraY - lane.index * LANE_HEIGHT);
                if (sY < -LANE_HEIGHT || sY > canvas.height) return;
                
                // 배경 그리기
                ctx.fillStyle = lane.color; 
                ctx.fillRect(0, sY, canvas.width, LANE_HEIGHT);

                // 강(River) 물결 효과 추가
                if (lane.type === 'river') {
                    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
                    const time = Date.now() / 500;
                    for(let i=0; i<canvas.width; i+=40) {
                        const waveY = Math.sin(i * 0.05 + time) * 5 + 10;
                        ctx.fillRect(i, sY + 20 + waveY, 20, 2);
                        ctx.fillRect(i + 20, sY + 50 - waveY, 15, 2);
                    }
                }
                
                // 플레이어가 현재 레인에 있는지 확인
                const isPlayerLane = (player.lane === lane.index);
                if (isPlayerLane && lane.type === 'river') onRiver = true;

                const objectsToDraw = [...lane.objects]; 
                
                objectsToDraw.forEach((obj, idx) => {
                    if (lane.type === 'road') {
                        obj.x += obj.speed; if (obj.x > canvas.width + 100) obj.x = -150; if (obj.x < -150) obj.x = canvas.width + 100;
                        drawCharacter(ctx, obj, obj.x, sY + 10, 60, obj.color, obj.number);
                        
                        ctx.fillStyle = "rgba(0,0,0,0.5)";
                        const text = `[${obj.team}] ${obj.name}`;
                        const textWidth = ctx.measureText(text).width;
                        ctx.fillRect(obj.x + 30 - textWidth/2 - 4, sY + 68, textWidth + 8, 14);
                        ctx.fillStyle = 'white'; ctx.font = 'normal 10px Galmuri11'; ctx.textAlign = 'center'; ctx.fillText(text, obj.x + 30, sY + 79);

                        if (invulnerable === 0 && isPlayerLane && player.currentX + 40 > obj.x && player.currentX + 20 < obj.x + 60) {
                            lives--; syncUI(); 
                            const actions = ['블락', '스틸', '굿 파울'];
                            const action = actions[Math.floor(Math.random() * actions.length)];
                            const msg = `[${obj.team}] ${obj.name}의 ${action}!`;
                            
                            if (lives <= 0) triggerGameOver(msg); 
                            else { 
                                showDamageMsg(msg); 
                                invulnerable = 60; 
                                const container = document.getElementById('game-wrapper');
                                container.classList.remove('hit-effect');
                                void container.offsetWidth; 
                                container.classList.add('hit-effect');
                                const flash = document.getElementById('flash-overlay');
                                flash.style.backgroundColor = 'rgba(255, 0, 0, 0.4)';
                                setTimeout(() => flash.style.backgroundColor = 'transparent', 150);
                            }
                        }
                    } else if (lane.type === 'river' && obj.type === 'log') {
                        // 통나무 이동
                        obj.x += obj.speed;
                        if (obj.x > canvas.width + 100) obj.x = -150; 
                        if (obj.x < -150) obj.x = canvas.width + 100;
                        
                        // 통나무 그리기 (질감 추가)
                        // 메인 몸통
                        ctx.fillStyle = "#8B4513";
                        ctx.fillRect(obj.x, sY + 20, obj.width, 40);
                        // 질감 (나뭇결)
                        ctx.fillStyle = "#5D2906"; // 어두운 색
                        for(let i=0; i<obj.width; i+=10) {
                            ctx.fillRect(obj.x + i, sY + 25, 2, 30); // 세로 줄무늬
                            if(i % 30 === 0) ctx.fillRect(obj.x + i, sY + 35, 6, 6); // 옹이
                        }
                        // 하이라이트
                        ctx.fillStyle = "#A0522D";
                        ctx.fillRect(obj.x, sY + 20, obj.width, 4);

                        // 플레이어와 충돌 확인 (통나무 위에 있는지)
                        if (isPlayerLane) {
                            const pCenter = player.currentX + 30;
                            if (pCenter > obj.x && pCenter < obj.x + obj.width) {
                                onLog = true;
                                logSpeed = obj.speed;
                            }
                        }
                    } else if (obj.type === 'item') {
                        if (obj.itemKey === 'banana') drawCustomSprite(ctx, BananaSpriteData, BananaPalette, obj.x - 15, sY + 25, 30);
                        else if (obj.itemKey === 'choco') drawCustomSprite(ctx, ChocoSpriteData, ChocoPalette, obj.x - 15, sY + 25, 30);
                        
                        if (isPlayerLane && Math.abs(player.currentX + 30 - obj.x) < 40) { lane.objects.splice(idx, 1); totalMP += 10; syncUI(); }
} else if (obj.type === 'audience' && obj.char) {
    // 1. 기준 높이 설정 (이 숫자 하나로 팻말 전체 높이를 조절합니다!)
    const signY = sY + 30; // 더 올리고 싶으면 숫자를 키우세요 (예: sY - 50)

    // 2. 팻말 지지대 (손잡이)
    ctx.fillStyle = "#5D4037";
    ctx.fillRect(obj.x + 18, signY + 30, 4, 20); // 팻말 바로 아래에 붙게 설정

    // 3. 팻말 판 (하얀색 사각형)
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(obj.x, signY, 40, 30);
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.strokeRect(obj.x, signY, 40, 30);

    // 4. 글자 그리기 (PixelNumbers 활용)
    ctx.fillStyle = "#D70025";
    const d = PixelNumbers[obj.char];
    if(d) {
        const pixelSize = 4;
        const charWidth = 5 * pixelSize;  // 20
        const charHeight = 5 * pixelSize; // 20
        
        // 팻말 판(signY)의 정중앙에 글자가 오도록 계산합니다.
        const charX = obj.x + (40 - charWidth) / 2;
        const charY = signY + (30 - charHeight) / 2; 
        
        d.forEach((row, ri) => row.forEach((p, ci) => { 
            if(p) ctx.fillRect(charX + ci * pixelSize, charY + ri * pixelSize, pixelSize, pixelSize); 
        }));
    }
}
                });
            });

            // 강에 있을 때 로직 처리
            if (onRiver) {
                if (onLog) {
                    // 통나무 위에 있으면 같이 이동
                    player.targetX += logSpeed;
                    player.currentX += logSpeed;
                } else if (invulnerable === 0) {
                    // 물에 빠짐
                    lives--; syncUI();
                    showDamageMsg("으악! 물에 빠졌다!");
                    invulnerable = 60; // 무적 시간 부여 (헤엄치는 시간)
                    
                    const container = document.getElementById('game-wrapper');
                    container.classList.remove('hit-effect');
                    void container.offsetWidth; 
                    container.classList.add('hit-effect');
                    const flash = document.getElementById('flash-overlay');
                    flash.style.backgroundColor = 'rgba(0, 0, 255, 0.4)';
                    setTimeout(() => flash.style.backgroundColor = 'transparent', 150);

                    if (lives <= 0) triggerGameOver("익사!");
                }
            }

            player.currentX += (player.targetX - player.currentX) * 0.2;
            const jY = Math.sin((Math.abs(player.lane * LANE_HEIGHT - cameraY) / LANE_HEIGHT) * Math.PI) * 50;
            const pObj = playerPool.find(p => p.id === selectedId) || playerPool[0];

            // 샷클락 감소 속도 상향 (기존보다 빠르게)
            // 레벨 1 기준 10초 버팀 -> 약 0.17 감소
            const decayAccel = Math.min(0.8, 0.17 + (currentLevel * 0.05));
            shotClock -= decayAccel;
            if (shotClock <= 0) { 
                lives--; syncUI(); 
                const violations = ['샷클락 바이얼레이션', '하프코트 바이얼레이션', '더블 드리블'];
                const violation = violations[Math.floor(Math.random() * violations.length)];
                const msg = `${pObj.name}의 ${violation}!`;
                
                if (lives <= 0) triggerGameOver(msg); else { showDamageMsg(msg); shotClock = 100; } 
            }
            if (invulnerable > 0) invulnerable--;
            document.getElementById('ui-shotclock').style.width = shotClock + '%';
            
            // 유니폼 색상 적용하여 플레이어 그리기 (안전장치 추가)
            const uniformInfo = uniformPool[selectedUniformIdx];
            const currentUniformColor = uniformInfo ? uniformInfo.color : "#D70025";
            drawCharacter(ctx, pObj, player.currentX, baseY - jY + 10, 60, currentUniformColor);
            
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

        function moveForward() {
            if (gameState !== 'PLAYING') return;
            player.lane++; score = player.lane; totalMP += 1; shotClock = 100; 
            if (player.lane > 0 && player.lane % LEVEL_DIST === 0) { gameState = 'QUIZ'; showQuiz(); }
            if (lanes.length < player.lane + 20) addLane(lanes.length); 
            syncUI();
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
        function continueGame() { currentLevel++; shotClock = 100; document.getElementById('overlay-clear').classList.add('hidden'); gameState = 'PLAYING'; gameLoop(); }
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
            if (totalMP < 100) return showDamageMsg("MP 부족!");
            totalMP -= 100; const p = avail[Math.floor(Math.random() * avail.length)];
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

        function selectUniform(id) {
            selectedUniformIdx = id;
            saveGameData();
            renderEquipment();
            renderPreview();
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
        window.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
        }, {passive: false});

        window.addEventListener('touchend', e => {
            const touchEndX = e.changedTouches[0].screenX;
            const touchEndY = e.changedTouches[0].screenY;
            handleGesture(touchStartX, touchStartY, touchEndX, touchEndY);
        }, {passive: false});

        function handleGesture(startX, startY, endX, endY) {
            if (gameState !== 'PLAYING') return;
            const xDiff = endX - startX;
            const yDiff = endY - startY;

            // 가로 이동이 세로 이동보다 크면 스와이프로 판단 (좌우 이동)
            if (Math.abs(xDiff) > Math.abs(yDiff)) {
                if (Math.abs(xDiff) > 30) { // 최소 스와이프 거리 30px
                    if (xDiff > 0) {
                         // 오른쪽 스와이프
                         player.targetX = Math.min(canvas.width - GRID_SIZE, player.targetX + GRID_SIZE);
                    } else {
                         // 왼쪽 스와이프
                         player.targetX = Math.max(0, player.targetX - GRID_SIZE);
                    }
                }
            } else {
                // 세로 이동이 더 크면
                // 위로 스와이프 (yDiff 음수) -> 앞으로 이동
                if (yDiff < -30) {
                    moveForward();
                }
                // 탭(클릭)이나 아래로 스와이프는 무시 (오작동 방지)
            }
        }

        window.onload = resize;
        window.addEventListener('resize', resize);
        window.addEventListener('keydown', (e) => {
            if (e.repeat || gameState !== 'PLAYING') return;
            if (e.code === 'ArrowUp' || e.code === 'Space') moveForward();
            if (e.code === 'ArrowLeft') player.targetX = Math.max(0, player.targetX - GRID_SIZE);
            if (e.code === 'ArrowRight') player.targetX = Math.min(canvas.width - GRID_SIZE, player.targetX + GRID_SIZE);
        });