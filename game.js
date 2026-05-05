// game.js v3 — The Academic Trial
// FIXES: (1) click+drag mouse control (2) touch/mobile support (3) skill text from config

const Game = {
  cfg: null, state: 'loading',
  currentLevel: 0, earnedSkills: [], levelGrades: [], essayChunks: [],
  playerRole: 'student', canvas: null, ctx: null, W: 0, H: 0,
  player: null, enemies: [], collectibles: [], particles: [], floats: [], projectiles: [], plagiarismTrail: [],
  integrity: 100, score: 0, waveTimer: 0,
  timerInterval: null, spawnInterval: null, collectInterval: null,
  animId: null, invincible: false, tooltip: null,
  _lastTime: 0, _fps: 0, _fc: 0, _ft: 0,
  _pointerActive: false, _pointerX: 0, _pointerY: 0,
  keyboard: { left: false, right: false, up: false, down: false },
  _usingKeyboard: false,
  cutsceneQueue: [], cutsceneIndex: 0, cutsceneCallback: null,
  // Skill selection
  pendingSkills: [], selectedSkillIndex: -1,
  // Animation state
  _animFrame: 0, _animTimer: 0, _animFps: 10,
  // Enemy info panel tracking
  discoveredEnemies: new Set(), nearbyEnemies: new Set(), NEARBY_DISTANCE: 150,
  // Recording system
  record: {
    name: '', email: '', loginTimestamp: '',
    cutsceneReadTime_sec: 0,
    skillSelectL2Time_sec: 0, skillSelectL3Time_sec: 0, skillSelectL4Time_sec: 0,
    level1Time_sec: 0, level2Time_sec: 0, level3Time_sec: 0, level4Time_sec: 0,
    skillL2: '', skillL3: '', skillL4_1: '', skillL4_2: '',
    gradeL1: '', gradeL2: '', gradeL3: '', gradeL4: '',
    gradeL1_pct: 0, gradeL2_pct: 0, gradeL3_pct: 0, gradeL4_pct: 0,
    integrityL1: 0, integrityL2: 0, integrityL3: 0, integrityL4: 0,
    attacks: {}, collects: {},
    finalScore: 0, finalIntegrity: 0, finalGrade: '', totalPlayTime_sec: 0,
  },
  _phaseStartTime: 0,
  _STORAGE_KEY: 'academic_trial_records',

  _formatTimestamp(date){
    const tz = this.cfg?.global?.timezone || 'GMT+8';
    let offset = 8;
    if(tz.startsWith('GMT')){
      offset = parseInt(tz.replace('GMT','').replace('+','')) || 8;
    }
    try{
      const d = new Date(date);
      const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      const localDate = new Date(utc + (offset * 3600000));
      const y = localDate.getFullYear();
      const m = String(localDate.getMonth() + 1).padStart(2,'0');
      const dd = String(localDate.getDate()).padStart(2,'0');
      const h = String(localDate.getHours()).padStart(2,'0');
      const min = String(localDate.getMinutes()).padStart(2,'0');
      const s = String(localDate.getSeconds()).padStart(2,'0');
      return `${y}/${m}/${dd} ${h}:${min}:${s} ${tz}`;
    }catch{
      return new Date(date).toISOString().slice(0,19).replace('T',' ') + ' ' + tz;
    }
  },

  // Helper: Smart text wrapping - returns array of lines
  _wrapText(ctx, text, maxWidth) {
    if (!text) return [''];
    const metrics = ctx.measureText(text);
    if (metrics.width <= maxWidth) return [text];
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const testMetrics = ctx.measureText(testLine);
      if (testMetrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.slice(0, 2); // Max 2 lines
  },

    async init() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      console.log('Canvas:', this.canvas);
      this.resize();
      window.addEventListener('resize', () => this.resize());

      // POINTER: unified mouse/touch input
      this.canvas.addEventListener('pointerdown', e => {
        e.preventDefault();
        this._pointerActive = true;
        // If it's a touch event, we may want to prevent default behavior like scrolling
        if (e.pointerType === 'touch') {
          // already prevented default above
        }
        this._fromMouse(e);
        // Try to capture pointer so we continue to receive pointermove even if pointer leaves canvas
        if (this.canvas.setPointerCapture) {
          this.canvas.setPointerCapture(e.pointerId);
        }
      });
      this.canvas.addEventListener('pointermove', e => {
        e.preventDefault();
        this._fromMouse(e);
        if(this.state==='arena') this._updateTooltip(this._pointerX,this._pointerY);
      });
      this.canvas.addEventListener('pointerup', e => {
        e.preventDefault();
        this._pointerActive = false;
        if (this.canvas.releasePointerCapture) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
      });
      this.canvas.addEventListener('pointercancel', e => {
        e.preventDefault();
        this._pointerActive = false;
        if (this.canvas.releasePointerCapture) {
          this.canvas.releasePointerCapture(e.pointerId);
        }
      });
      // Prevent text selection during drag (fallback)
      this.canvas.addEventListener('selectstart', e => e.preventDefault());
      document.addEventListener('dragstart', e => e.preventDefault());

      // KEYBOARD: arrow key controls
      window.addEventListener('keydown', e => {
        switch(e.key) {
          case 'ArrowLeft':  e.preventDefault(); this.keyboard.left = true; break;
          case 'ArrowRight': e.preventDefault(); this.keyboard.right = true; break;
          case 'ArrowUp':    e.preventDefault(); this.keyboard.up = true; break;
          case 'ArrowDown':  e.preventDefault(); this.keyboard.down = true; break;
          case ' ': case 'Enter':
            if(this.state === 'cutscene'){
              e.preventDefault();
              this.advanceCutscene();
            }else if(this.state === 'login'){
              // Allow space in login form
            }else{
              e.preventDefault();
            }
            break;
        }
      });
      window.addEventListener('keyup', e => {
        switch(e.key) {
          case 'ArrowLeft':  e.preventDefault(); this.keyboard.left = false; break;
          case 'ArrowRight': e.preventDefault(); this.keyboard.right = false; break;
          case 'ArrowUp':    e.preventDefault(); this.keyboard.up = false; break;
          case 'ArrowDown':  e.preventDefault(); this.keyboard.down = false; break;
        }
      });

      await ConfigParser.load('config.txt');
    this.cfg = ConfigParser.buildGameConfig();
    this._animFps = this.cfg.animation?.fps || 10;
    document.title = this.cfg.global.title;
    document.getElementById('game-title-text').textContent = this.cfg.global.title;
    
    // Clear image cache for fresh load
    AssetLoader.clearCache();
    
    UI.setLoadingText('Loading cutscenes...');
    await AssetLoader.preloadAll(this.cfg, (phrase, loaded, total) => {
      UI.setLoadingText(`${phrase} (${loaded}/${total})...`);
    });
    UI.showScreen('login');
    this.state = 'login';
    this._phaseStartTime = Date.now();
  },

  resize() {
    const w = document.getElementById('game-wrap');
    this.canvas.width  = this.W = w.clientWidth  || window.innerWidth;
    this.canvas.height = this.H = w.clientHeight || window.innerHeight;
  },

  // Get actual display dimensions for image drawing (CSS pixel size)
  getDisplaySize() {
    const r = this.canvas.getBoundingClientRect();
    return { w: r.width, h: r.height };
  },

  _fromMouse(e) {
    const r = this.canvas.getBoundingClientRect();
    this._pointerX = (e.clientX-r.left)*(this.W/r.width);
    this._pointerY = (e.clientY-r.top)*(this.H/r.height);
    if (this.state === 'cutscene') {
      this.advanceCutscene();
      return;
    }
    // Always update target: mousedown sets destination; mousemove steers while held
    if (this.state==='arena' && (e.type==='mousedown' || this._pointerActive)) {
      this.player.tx=this._pointerX; this.player.ty=this._pointerY;
    }
  },
  _fromTouch(e) {
    if (!e.touches.length) return;
    const r = this.canvas.getBoundingClientRect(), t = e.touches[0];
    this._pointerX = (t.clientX-r.left)*(this.W/r.width);
    this._pointerY = (t.clientY-r.top)*(this.H/r.height);
    if (this.state==='arena') { this.player.tx=this._pointerX; this.player.ty=this._pointerY; this._updateTooltip(this._pointerX,this._pointerY); }
  },
  _updateTooltip(mx,my) {
    this.tooltip = null;
    if (!this.enemies) return;
    for (const en of this.enemies) {
      if (!en.disguised && Math.hypot(en.x-mx,en.y-my)<(en.blobSize||en.size)+28) { this.tooltip=en; break; }
    }
  },

  playCutscene(names,cb) {
    const valid = names.filter(n=>AssetLoader.isReady(AssetLoader.paths.cutscene(n)));
    console.log('[Cutscene] playCutscene names:', names, 'valid:', valid.length);
    if (!valid.length) { if(cb) cb(); return; }
    this.resize();
    this.state='cutscene'; this.cutsceneQueue=valid; this.cutsceneIndex=0; this.cutsceneCallback=cb;
    UI.showScreen('cutscene'); this.drawCutsceneFrame();
  },
  drawCutsceneFrame() {
    if (this.state!=='cutscene') return;
    const name = this.cutsceneQueue[this.cutsceneIndex];
    const path = AssetLoader.paths.cutscene(name);
    const img = AssetLoader.getImage(path);
    const r = this.canvas.getBoundingClientRect();
    const dw = r.width, dh = r.height;
    console.log('[Cutscene] draw:', name, 'img:', img ? `w=${img.naturalWidth},h=${img.naturalHeight}` : 'null');
    console.log('[Cutscene] canvas rect:', dw, 'x', dh);
    const ctx=this.ctx;
    ctx.clearRect(0,0,this.W,this.H);
    
    // Fill background first
    ctx.fillStyle='#0a0a16'; ctx.fillRect(0,0,this.W,this.H);
    
    if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      const imgRatio = img.naturalWidth / img.naturalHeight;
      let drawW, drawH, drawX, drawY;
      
      drawH = dh;
      drawW = dh * imgRatio;
      drawX = (dw - drawW) / 2;
      drawY = 0;
      
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      console.log('[Cutscene] drew image successfully with aspect ratio preserved');
    } else {
      console.log('[Cutscene] drew fallback color');
    }
    ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='14px monospace'; ctx.textAlign='center';
    ctx.fillText(`${this.cutsceneIndex+1}/${this.cutsceneQueue.length}  —  Tap or click to continue`,dw/2,dh-24);
  },
  advanceCutscene() {
    this.cutsceneIndex++;
    if (this.cutsceneIndex>=this.cutsceneQueue.length) { UI.hideScreen('cutscene'); this.state='idle'; if(this.cutsceneCallback) this.cutsceneCallback(); }
    else this.drawCutsceneFrame();
  },

drawTitleLoop() {
    if (this.state!=='title') return;
    const ctx=this.ctx, bgPath='images/backgrounds/bg_title.png';
    const { w: dw, h: dh } = this.getDisplaySize();
    ctx.clearRect(0,0,this.W,this.H);
    if (AssetLoader.isReady(bgPath)) { AssetLoader.drawRectAsset(ctx,bgPath,0,0,dw,dh); }
    else {
      const t=Date.now()/1000;
      for(let tx=0;tx<dw;tx+=36) for(let ty=0;ty<dh;ty+=36){ctx.fillStyle=(Math.floor(tx/36)+Math.floor(ty/36))%2===0?'#0c0c1c':'#0a0a16';ctx.fillRect(tx,ty,36,36);}
      for(let i=0;i<8;i++){ctx.fillStyle=`rgba(74,158,255,${0.03+0.02*Math.sin(t+i)})`;ctx.beginPath();ctx.arc(((i*137)%dw),((i*97)%dh)+Math.sin(t*0.5+i)*20,80,0,Math.PI*2);ctx.fill();}
    }
    requestAnimationFrame(()=>this.drawTitleLoop());
  },

  showRoleSelect() {
    const enabledRoles = this.cfg.enableRoles;
    const roles = ['student', 'teacher', 'admin'];
    
    const anyEnabled = roles.some(r => enabledRoles[r]);
    if (!anyEnabled) {
      UI.showScreen('no-role');
      this.state = 'no-role';
      return;
    }
    
    roles.forEach(r => {
      const card = document.getElementById(`role-${r}`);
      if (card) {
        card.style.display = enabledRoles[r] ? '' : 'none';
      }
    });
    
    roles.forEach(r => {
      const card = document.getElementById(`role-${r}`);
      if (card) card.classList.remove('selected');
    });
    this.playerRole = null;
    
    AudioManager.playSfx('button_click'); UI.showScreen('role-select'); this.state='roleselect';
  },
  submitLogin() {
    const nameInput = document.getElementById('login-name');
    const emailInput = document.getElementById('login-email');
    const name = (nameInput && nameInput.value.trim()) || '';
    const email = (emailInput && emailInput.value.trim()) || '';
    
    if (!name || !email) {
      alert('Please enter both name and email.');
      return;
    }
    
    const now = Date.now();
    this.record.name = name;
    this.record.email = email;
    this.record.loginTimestamp = this._formatTimestamp(now);
    this.record.cutsceneReadTime_sec = Math.round((now - this._phaseStartTime) / 1000);
    
    AudioManager.playSfx('button_click');
    this.showRoleSelect();
  },
  selectRole(role) {
    AudioManager.playSfx('button_click'); this.playerRole=role;
    document.querySelectorAll('.role-card').forEach(c=>c.classList.remove('selected'));
    document.getElementById(`role-${role}`).classList.add('selected');
  },
  startGame() {
    // 如果沒有選擇角色，自動選取第一個啟用的角色（按順序：student → teacher → admin）
    if (!this.playerRole) {
      const enabledRoles = this.cfg.enableRoles;
      const roles = ['student', 'teacher', 'admin'];
      const firstEnabled = roles.find(r => enabledRoles[r]);
      if (firstEnabled) {
        this.selectRole(firstEnabled);
      }
    }
    AudioManager.playSfx('button_click');
    this.currentLevel=0; this.earnedSkills=[]; this.levelGrades=[]; this.essayChunks=[];
    // Always go through goToNextLevel as the single entry point — no double-call
    const afterIntro = () => this.goToNextLevel();
    const hadCutscene = this._tryCutscene(['intro_1','intro_2','intro_3','intro_4'], afterIntro);
    if (!hadCutscene) afterIntro();
  },
  goToNextLevel() {
    this.currentLevel++;
    if (this.currentLevel>this.cfg.levels.length) { this.showComplete(); return; }
    const lvl=this.cfg.levels[this.currentLevel-1], newSkills=this.cfg.skills.filter(s=>s.unlockLevel===this.currentLevel);
    const afterCut = () => this.showSkillScreen(newSkills,lvl);
    const hadCutscene = this._tryCutscene([`level${this.currentLevel}_pre`], afterCut);
    if (!hadCutscene) afterCut();
  },
  // Returns true if at least one cutscene image exists and was shown; false otherwise
  _tryCutscene(names, cb) {
    const valid = names.filter(n=>AssetLoader.isReady(AssetLoader.paths.cutscene(n)));
    if (!valid.length) return false;
    this.playCutscene(names, cb);
    return true;
  },

  // ── SKILL SCREEN (text comes from config.txt) ─────────────────
  showSkillScreen(newSkills, lvl) {
    this.state='skill'; UI.showScreen('skill'); AudioManager.playMusic('skill');
    document.getElementById('skill-level-name').textContent=`Level ${this.currentLevel}: ${lvl.assignmentName}`;
    document.getElementById('skill-level-desc').textContent=lvl.description;
    const container=document.getElementById('skill-cards-container');
    container.innerHTML='';
    this.pendingSkills=[];this.selectedSkillIndex=-1;

    // Determine if player needs to select a skill
    // From Level 2, player can select ALL skills (not just new ones for this level)
    const mustSelect = this.currentLevel >= 2;
    const allSkills = this.cfg.skills;
    const earnedTypes = this.earnedSkills;
    const availableSkills = mustSelect ? allSkills.filter(s => !earnedTypes.includes(s.effectType)) : newSkills;
    
    // Level 1: No skills yet
    if (this.currentLevel === 1) {
      container.innerHTML = `
          <div class="no-skill-card">
            <div class="no-skill-icon">!</div>
            <div class="no-skill-title">No Skills Yet</div>
            <div class="no-skill-desc">You have not learned anything about academic integrity yet.<br>
            Head into this assignment unprepared — and experience what happens.</div>
          </div>`;
    }
    // Level 4: Auto-select remaining skills for students to review before beginning
    else if (this.currentLevel === 4) {
      const remaining = allSkills.filter(s => !earnedTypes.includes(s.effectType));
      remaining.forEach(sk => { this.earnedSkills.push(sk.effectType); });
      if(remaining.length > 0) this.record.skillL4_1 = remaining[0].name;
      if(remaining.length > 1) this.record.skillL4_2 = remaining[1].name;
      container.innerHTML += `<div class="skill-selection-header">Remain Skills are ALL Unlocked</div>`;
      let cardsHtml='';
      remaining.forEach((sk,idx)=>{
        const cardId=`skill-expand-${idx}`;
        cardsHtml+=`<div class="skill-card-item skill-selectable skill-selected" data-skill-idx="${idx}">
          <div class="skill-card-badge">✓ ALL SKILLS</div>
          <div class="skill-card-name">${sk.name}</div>
          <div class="skill-card-learn">
            <div class="learn-label">WHAT YOU LEARN</div>
            ${sk.learnText}
          </div>
          <div class="skill-expand-btn expanded" id="${cardId}" onclick="">
            <span class="expand-text">▼ In-Game Effect</span>
            <div class="skill-card-effect">
              <div class="effect-label">IN-GAME EFFECT</div>
              ${sk.effectDescription}
            </div>
          </div>
        </div>`;
      });
      container.innerHTML+=`<div class="skill-selection-grid">${cardsHtml}</div>`;
      if (remaining.length > 0) {
        this.selectedSkillIndex = 0;
        this.pendingSkills = remaining;
      }
    }
    // Level 2+: Show skill selection
    else if (mustSelect && availableSkills.length > 0) {
      this.pendingSkills=availableSkills;
      container.innerHTML+=`<div class="skill-selection-header">Choose One Skill (Required)</div>`;
      let cardsHtml='';
      availableSkills.forEach((sk,idx)=>{
        const isSelected=idx===this.selectedSkillIndex;
        const cardId=`skill-expand-${idx}`;
        cardsHtml+=`<div class="skill-card-item skill-selectable ${isSelected?'skill-selected':''}" data-skill-idx="${idx}" onclick="Game.selectSkill(${idx})">
          <div class="skill-card-badge">${isSelected?'✓ SELECTED':'○ SELECT'}</div>
          <div class="skill-card-name">${sk.name}</div>
          <div class="skill-card-learn">
            <div class="learn-label">WHAT YOU LEARN</div>
            ${sk.learnText}
          </div>
          <div class="skill-expand-btn ${isSelected?'expanded':''}" id="${cardId}" onclick="event.stopPropagation();Game.toggleSkillExpand('${cardId}')">
            <span class="expand-text">▶ Click to see in-game effect</span>
            <div class="skill-card-effect" style="display:none;">
              <div class="effect-label">IN-GAME EFFECT</div>
              ${sk.effectDescription}
            </div>
          </div>
        </div>`;
      });
      container.innerHTML+=`<div class="skill-selection-grid">${cardsHtml}</div>`;
      const allActive=this.cfg.skills.filter(s=>this.earnedSkills.includes(s.effectType));
      if(allActive.length>0){container.innerHTML+=`<div class="skill-summary"><span class="skill-summary-label">Current skills:</span>${allActive.map(s=>`<span class="active-skill-tag">${s.name}</span>`).join('')}</div>`;}
    } else if (!mustSelect && newSkills.length > 0) {
      newSkills.forEach(sk => {
        this.earnedSkills.push(sk.effectType);
        container.innerHTML += `
          <div class="skill-card-item">
            <div class="skill-card-badge">NEW SKILL UNLOCKED</div>
            <div class="skill-card-name">${sk.name}</div>
            <div class="skill-card-columns">
              <div class="skill-card-effect">
                <div class="effect-label">IN-GAME EFFECT</div>
                ${sk.effectDescription}
              </div>
              <div class="skill-card-learn">
                <div class="learn-label">WHAT YOU LEARN</div>
                ${sk.learnText}
              </div>
            </div>
          </div>`;
      });
      const allActive=this.cfg.skills.filter(s=>this.earnedSkills.includes(s.effectType));
      if (allActive.length>0) {
        container.innerHTML+=`<div class="skill-summary"><span class="skill-summary-label">All active skills:</span>${allActive.map(s=>`<span class="active-skill-tag">${s.name}</span>`).join('')}</div>`;
      }
    } else if (mustSelect && availableSkills.length === 0) {
      // All skills already earned
      const allActive = this.cfg.skills.filter(s => this.earnedSkills.includes(s.effectType));
      container.innerHTML += `<div class="skill-selection-header">Skills Already Acquired</div>`;
      if (allActive.length > 0) {
        allActive.forEach(sk => {
          container.innerHTML += `<div class="skill-card-item"><div class="skill-card-badge">ACTIVE</div><div class="skill-card-name">${sk.name}</div><div class="skill-card-columns"><div class="skill-card-effect"><div class="effect-label">IN-GAME EFFECT</div>${sk.effectDescription}</div><div class="skill-card-learn"><div class="learn-label">WHAT YOU LEARN</div>${sk.learnText}</div></div></div>`;
        });
      }
      container.innerHTML += `<div class="skill-summary"><span class="skill-summary-label">Current skills:</span>${allActive.map(s => `<span class="active-skill-tag">${s.name}</span>`).join('')}</div>`;
    }
    AudioManager.playSfx('skill_unlock');
    const btn=document.getElementById('skill-continue-btn');
    const hint=document.getElementById('skill-select-hint');
    btn.textContent=`Begin ${lvl.assignmentName} →`;
    
    // Level 4: Auto-select skill, button should always be green
    if(this.currentLevel === 4){
      btn.classList.remove('btn-disabled');
      btn.classList.add('btn-green');
      hint.style.display='none';
    } else if(mustSelect && availableSkills.length > 0){
      btn.classList.remove('btn-green');
      btn.classList.add('btn-disabled');
      hint.style.display='block';
    } else {
      btn.classList.remove('btn-disabled');
      btn.classList.add('btn-green');
      hint.style.display='none';
    }
    
    btn.onclick=()=>{
      if(mustSelect && availableSkills.length > 0 && this.selectedSkillIndex===-1){return;}
      if(mustSelect&&this.pendingSkills[this.selectedSkillIndex]){
        this.earnedSkills.push(this.pendingSkills[this.selectedSkillIndex].effectType);
        const skillName = this.pendingSkills[this.selectedSkillIndex].name;
        if(this.currentLevel < 4){
          const levelKey = 'skillL' + this.currentLevel;
          this.record[levelKey] = skillName;
        }else{
          const remaining = this.cfg.skills.filter(s => !this.record.skillL2 && !this.record.skillL3 && s.name === skillName);
          if(!this.record.skillL4_1) this.record.skillL4_1 = skillName;
          else if(!this.record.skillL4_2) this.record.skillL4_2 = skillName;
        }
        const timeKey = 'skillSelectL' + this.currentLevel + 'Time_sec';
        this.record[timeKey] = Math.round((Date.now() - this._phaseStartTime) / 1000);
      }
      this._phaseStartTime = Date.now();
      this.launchArena(lvl);
    };
  },

  selectSkill(idx) {
    if(idx<0||idx>=this.pendingSkills.length)return;
    this.selectedSkillIndex=idx;
    const container=document.getElementById('skill-cards-container');
    const cards=container.querySelectorAll('.skill-card-item.skill-selectable');
    cards.forEach((el,i)=>{
      const isSelected=i===idx;
      el.classList.toggle('skill-selected',isSelected);
      el.querySelector('.skill-card-badge').textContent=isSelected?'✓ SELECTED':'○ SELECT';
    });
    // Update button state when skill is selected
    const btn=document.getElementById('skill-continue-btn');
    const hint=document.getElementById('skill-select-hint');
    if(btn&&hint){
      btn.classList.remove('btn-disabled');
      btn.classList.add('btn-green');
      hint.style.display='none';
    }
    AudioManager.playSfx('button_click');
  },

  toggleSkillExpand(cardId) {
    const btn=document.getElementById(cardId);
    if(!btn)return;
    const isExpanded=btn.classList.contains('expanded');
    const effectDiv=btn.querySelector('.skill-card-effect');
    const expandText=btn.querySelector('.expand-text');
    if(isExpanded){
      btn.classList.remove('expanded');
      if(effectDiv)effectDiv.style.display='none';
      if(expandText)expandText.textContent='▶ Click to see in-game effect';
    }else{
      btn.classList.add('expanded');
      if(effectDiv)effectDiv.style.display='block';
      if(expandText)expandText.textContent='▼ In-game effect';
    }
  },

  launchArena(lvl) {
    this.state='arena'; UI.showScreen('arena'); this.resize();
    this.enemies=[]; this.collectibles=[]; this.particles=[]; this.floats=[]; this.projectiles=[]; this.plagiarismTrail=[];
    this.integrity=100; this.score=0; this.essayChunks=[];
    this.record.attacks = {};
    this.record.collects = {};
    this.tooltip=null; this.invincible=false; this._pointerActive=false;
    this._lastTime=0; this._fc=0; this._fps=0; this._ft=0;
    const rb=this.playerRole==='teacher'?1.15:this.playerRole==='admin'?0.9:1.0;
    this.player={x:this.W/2,y:this.H/2,tx:this.W/2,ty:this.H/2,
      size:this.cfg.player.size, speed:this.cfg.player.moveSpeed*rb,
      trail:[], moving:false,
      idleBasePath: AssetLoader.paths.playerIdle(this.playerRole),
      moveBasePath: AssetLoader.paths.playerMove(this.playerRole)};
    for(let i=0;i<lvl.enemyCount;i++) this.spawnEnemy(lvl);
    for(let i=0;i<5;i++) this.spawnCollectible();
    
    // Load background image before starting arena
    const bgName = lvl.backgroundImage.replace('bg_','').replace(/\.(png|jpg)$/,'');
    const bgPath = `images/backgrounds/bg_${bgName}.png`;
    if (!AssetLoader.isReady(bgPath)) {
      console.log('[Arena] Loading background:', bgPath);
      AssetLoader.loadImage(bgPath).then(() => {
        console.log('[Arena] Background loaded:', bgPath);
      });
    }
    this.bgPath = bgPath;
    
    // Load player animation frames before starting
    const idleBase = AssetLoader.paths.playerIdle(this.playerRole);
    const moveBase = AssetLoader.paths.playerMove(this.playerRole);
    console.log('[Arena] Loading player animations:', idleBase, moveBase);
    AssetLoader.preloadAnimation(idleBase).then(frames => {
      console.log('[Arena] Idle frames loaded:', frames.length);
    });
    AssetLoader.preloadAnimation(moveBase).then(frames => {
      console.log('[Arena] Move frames loaded:', frames.length);
    });
    
    // Reset animation frame
    this._animFrame = 0;
    this._animTimer = 0;

    this.updateHUD(lvl); this.discoveredEnemies=new Set();this.nearbyEnemies=new Set(); AudioManager.playMusic(`level${this.currentLevel}`);
    this.waveTimer=lvl.timeLimit;
    clearInterval(this.timerInterval);
    this.timerInterval=setInterval(()=>{this.waveTimer--;document.getElementById('hud-timer').textContent=this.waveTimer+'s';if(this.waveTimer<=0){clearInterval(this.timerInterval);this.endArena(lvl);}},1000);
    clearInterval(this.spawnInterval);
    if(lvl.enemyRespawnSec>0) this.spawnInterval=setInterval(()=>{if(this.state==='arena')this.spawnEnemy(lvl);},lvl.enemyRespawnSec*1000);
    clearInterval(this.collectInterval);
    this.collectInterval=setInterval(()=>{if(this.state==='arena')this.spawnCollectible();},lvl.collectibleSpawnSec*1000);
    if(this.animId) cancelAnimationFrame(this.animId);
    this.animId=requestAnimationFrame(ts=>this.loop(ts));
    document.getElementById('btn-skip-level').style.display=this.cfg.debug.debugMode?'inline-block':'none';
  },

  spawnEnemy(lvl) {
    const pool=[]; this.cfg.enemies.forEach(e=>{for(let w=0;w<e.spawnWeight;w++)pool.push(e);});
    if(!pool.length) return;
    const tmpl=pool[Math.floor(Math.random()*pool.length)];
    const side=Math.floor(Math.random()*4); let x,y;
    if(side===0){x=Math.random()*this.W;y=-30;}else if(side===1){x=this.W+30;y=Math.random()*this.H;}
    else if(side===2){x=Math.random()*this.W;y=this.H+30;}else{x=-30;y=Math.random()*this.H;}
    const collectibleIds = ['journal', 'book', 'data', 'expert'];
    const fakeId = collectibleIds[Math.floor(Math.random() * collectibleIds.length)];
    const isFakeSource = tmpl.id==='fakesource';
    const fakeSize = this.cfg.global.collectibleSize || 30;
    this.enemies.push({...tmpl,x,y,speed:tmpl.speed*lvl.enemySpeedMult,damage:tmpl.damage*lvl.enemyDamageMult,
      blobSize:isFakeSource?fakeSize:tmpl.size,phase:Math.random()*Math.PI*2,hitTimer:0,
      disguised:isFakeSource&&!this.hasSkill('reveal_fake_source')&&!this.hasSkill('reveal_all_fake'),
      fakeCollectibleId: fakeId,
      shootTimer: tmpl.id === 'essaymill' ? (tmpl.projectileInterval || 3) * 60 : 0});
    AudioManager.playSfx('enemy_spawn');
  },

spawnCollectible() {
      const lvl=this.cfg.levels[this.currentLevel-1],rate=lvl.fakeSourceRate||0.8;
      const size = this.cfg.global.collectibleSize || 30;
      if(Math.random()<rate){
        const fakeTmpl=this.cfg.enemies.find(e=>e.id==='fakesource');
        if(fakeTmpl){
          const collectibleIds=['journal','book','data','expert'],fakeId=collectibleIds[Math.floor(Math.random()*collectibleIds.length)];
          this.enemies.push({...fakeTmpl,x:300+Math.random()*(this.W-340),y:60+Math.random()*(this.H-120),speed:fakeTmpl.speed,damage:fakeTmpl.damage,
            blobSize:size,phase:Math.random()*Math.PI*2,hitTimer:0,disguised:true,fakeCollectibleId:fakeId,waveOffset:Math.random()*Math.PI*2,bob:0});
        }
      }else{
        const pool=this.cfg.collectibles; if(!pool.length) return;
        const tmpl=pool[Math.floor(Math.random()*pool.length)];
        const waveOffset=Math.random()*Math.PI*2,waveSpeed=0.5+Math.random()*0.5;
        this.collectibles.push({...tmpl,size:size,x:300+Math.random()*(this.W-340),y:60+Math.random()*(this.H-120),bob:Math.random()*Math.PI*2,life:this.cfg.global.collectibleLifeSeconds*60,waveOffset:waveOffset,waveSpeed:waveSpeed});
      }
    },

  hasSkill(t){return this.earnedSkills.includes(t);},
  getSkillValue(t){const sk=this.cfg.skills.find(s=>s.effectType===t);return sk?sk.effectValue:0;},
  getSkillAbsorbRadius(t){const sk=this.cfg.skills.find(s=>s.effectType===t);return sk?sk.absorbRadius:2.0;},

  loop(ts) {
    if(this.state!=='arena') return;
    this.animId=requestAnimationFrame(t=>this.loop(t));
    const dt=Math.min((ts-(this._lastTime||ts))/16.67,3); this._lastTime=ts;
    this._fc++; this._ft+=dt*16.67; if(this._ft>=1000){this._fps=this._fc;this._fc=0;this._ft=0;}
    
    // Animation frame timer
    this._animTimer += dt * 16.67;
    const frameDuration = 1000 / this._animFps;
    if (this._animTimer >= frameDuration) {
      this._animFrame++;
      this._animTimer = this._animTimer % frameDuration;
    }
    
    const ctx=this.ctx; ctx.clearRect(0,0,this.W,this.H);
    this.drawBg(); this.updateCollectibles(dt); this.updateEnemies(dt); this.updateProjectiles(dt);
    this.movePlayer(dt); this.drawPlayer();
    this.drawProjectiles(dt);
    this.drawParticles(dt); this.drawFloats(dt); this.drawTooltip(); this.drawHint(); this.drawEnemyInfo();
    if(this.cfg.global.showFPS){ctx.fillStyle='#ffffff55';ctx.font='11px monospace';ctx.textAlign='left';ctx.fillText(`FPS: ${this._fps}`,8,this.H-8);}
  },

  drawBg() {
    const ctx=this.ctx,T=36;
    const { w: dw, h: dh } = this.getDisplaySize();
    if(this.bgPath && AssetLoader.isReady(this.bgPath)) {
      const img = AssetLoader.getImage(this.bgPath);
      console.log('[drawBg] Drawing background:', this.bgPath, 'img:', img ? `${img.naturalWidth}x${img.naturalHeight}` : 'null');
      AssetLoader.drawRectAsset(ctx,this.bgPath,0,0,dw,dh);
    } else {
      console.log('[drawBg] No background, using fallback. bgPath:', this.bgPath, 'isReady:', this.bgPath ? AssetLoader.isReady(this.bgPath) : 'null');
      for(let tx=0;tx<dw;tx+=T) for(let ty=0;ty<dh;ty+=T){ctx.fillStyle=(Math.floor(tx/T)+Math.floor(ty/T))%2===0?'#0c0c1c':'#0a0a16';ctx.fillRect(tx,ty,T,T);}
      for(let i=0;i<8;i++){ctx.fillStyle=`rgba(74,158,255,${0.03+0.02*Math.sin(Date.now()/1000+i)})`;ctx.beginPath();ctx.arc(((i*137)%dw),((i*97)%dh)+Math.sin(Date.now()/1000*0.5+i)*20,80,0,Math.PI*2);ctx.fill();}
    }
  },

movePlayer(dt) {
     const p=this.player;
     
     // 計算 UI 元素的邊距，確保玩家不會移動到 UI 下方
     const hudTop = document.getElementById('hud-top');
     const essayPanel = document.getElementById('essay-panel');
     const topMargin = hudTop ? hudTop.offsetHeight + 10 : 60;
     const bottomMargin = essayPanel ? essayPanel.offsetHeight + 10 : 60;
     
     // 左側敵人資訊面板寬度
     const enemyPanelWidth = 320;
     
     // Keyboard input: set target based on arrow keys
     const keySpeed = p.speed * 1.5;
     if (this.keyboard.left)  { p.tx -= keySpeed * dt; }
     if (this.keyboard.right) { p.tx += keySpeed * dt; }
     if (this.keyboard.up)    { p.ty -= keySpeed * dt; }
     if (this.keyboard.down)  { p.ty += keySpeed * dt; }
     
     // 左側邊界需要避開敵人資訊面板
     if (p.tx < enemyPanelWidth + p.size + 10) p.tx = enemyPanelWidth + p.size + 10;
     if (p.tx > this.W - p.size) p.tx = this.W - p.size;
     
     // 上下邊界需要避開 UI 元素
     if (p.ty < topMargin + p.size) p.ty = topMargin + p.size;
     if (p.ty > this.H - bottomMargin - p.size) p.ty = this.H - bottomMargin - p.size;
     
     // 確保玩家實際位置也在邊界內（防止被推動超出邊界）
     if (p.x < enemyPanelWidth + p.size + 10) p.x = enemyPanelWidth + p.size + 10;
     if (p.x > this.W - p.size) p.x = this.W - p.size;
     if (p.y < topMargin + p.size) p.y = topMargin + p.size;
     if (p.y > this.H - bottomMargin - p.size) p.y = this.H - bottomMargin - p.size;
     
     const dx=p.tx-p.x, dy=p.ty-p.y, d=Math.sqrt(dx*dx+dy*dy);
     if (d > 4) {
       p.moving = true;
       p.x += dx/d * p.speed * dt;
       p.y += dy/d * p.speed * dt;
     } else {
       p.moving = false;
     }
     p.trail.unshift({x:p.x,y:p.y}); if(p.trail.length>12) p.trail.pop();
   },

  drawPlayer() {
    const ctx=this.ctx,p=this.player;
    p.trail.forEach((t,i)=>{ctx.fillStyle=`rgba(74,158,255,${(1-i/12)*0.1})`;ctx.beginPath();ctx.arc(t.x,t.y,p.size*(1-i/14),0,Math.PI*2);ctx.fill();});
    if(this.playerRole==='admin'){ctx.fillStyle='rgba(192,122,245,0.1)';ctx.beginPath();ctx.arc(p.x,p.y,p.size+28,0,Math.PI*2);ctx.fill();}
    // Drag line indicator
    if(this._pointerActive){
      const dx=p.tx-p.x,dy=p.ty-p.y,d=Math.sqrt(dx*dx+dy*dy);
      if(d>10){ctx.strokeStyle='rgba(74,158,255,0.25)';ctx.lineWidth=1;ctx.setLineDash([4,6]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.tx,p.ty);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='rgba(74,158,255,0.2)';ctx.beginPath();ctx.arc(p.tx,p.ty,8,0,Math.PI*2);ctx.fill();}
    }
    
    // Animation: get base path and current frame
    const basePath = p.moving ? p.moveBasePath : p.idleBasePath;
    const visualSize = this.cfg.player.visualSize || 48;
    const animInfo = AssetLoader.getAnimationInfo(basePath);
    
    if (animInfo.isReady && animInfo.count > 0) {
      const img = AssetLoader.getAnimationFrame(basePath, this._animFrame);
      if (img && img.complete && img.naturalWidth > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, visualSize / 2, 0, Math.PI * 2);
        ctx.clip();
        const scale = visualSize / Math.max(img.naturalWidth, img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, p.x - dw / 2, p.y - dh / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.fillStyle = '#4a9eff33'; ctx.beginPath(); ctx.arc(p.x, p.y, visualSize / 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#4a9eff'; ctx.beginPath(); ctx.arc(p.x, p.y, visualSize / 2 - 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `bold ${this.cfg.global.fontSizePlayer}px monospace`; ctx.textAlign = 'center'; ctx.fillText('YOU', p.x, p.y + 4);
      }
    } else {
      ctx.fillStyle = '#4a9eff33'; ctx.beginPath(); ctx.arc(p.x, p.y, visualSize / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#4a9eff'; ctx.beginPath(); ctx.arc(p.x, p.y, visualSize / 2 - 4, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = '#fff'; ctx.font = `bold ${this.cfg.global.fontSizePlayer}px monospace`; ctx.textAlign = 'center'; ctx.fillText('YOU', p.x, p.y + 4);
    }
    
    // Draw collection range and absorb area circles if has Proper Citation skill
    if(this.hasSkill('collection_range')){
      const rangeRadius=p.size;
      const absorbRad=p.size*3.0*this.getSkillAbsorbRadius('collection_range');
      ctx.strokeStyle='rgba(74,158,255,0.4)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,rangeRadius,0,Math.PI*2);ctx.stroke();
      ctx.setLineDash([5,5]);ctx.strokeStyle='rgba(74,158,255,0.2)';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,absorbRad,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    }

    // Draw barrier if has Ethical Work skill
    if(this.hasSkill('barrier')){
      const barrierRadius = p.size + 25;
      const barrierPath = 'images/effects/barrier.png';
      const hasImage = AssetLoader.isReady(barrierPath);

      if(hasImage){
        const img = AssetLoader.getImage(barrierPath);
        ctx.save();
        ctx.globalAlpha = 0.6 + Math.sin(Date.now() / 200) * 0.15;
        ctx.beginPath();
        ctx.arc(p.x, p.y, barrierRadius, 0, Math.PI * 2);
        ctx.clip();
        const scale = barrierRadius * 2 / Math.max(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, p.x - img.naturalWidth * scale / 2, p.y - img.naturalHeight * scale / 2, img.naturalWidth * scale, img.naturalHeight * scale);
        ctx.restore();
      }else{
        // Dotted circle
        const pulse = Math.sin(Date.now() / 200);
        ctx.strokeStyle = `rgba(6, 182, 212, ${0.5 + pulse * 0.15})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 8]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, barrierRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Shield emoji on top
        const shieldSize = Math.max(14, p.size * 0.6);
        ctx.fillStyle = `rgba(6, 182, 212, ${0.8 + pulse * 0.2})`;
        ctx.font = `${shieldSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛡️', p.x, p.y - barrierRadius + shieldSize);

        // Horizontal text below
        ctx.fillStyle = `rgba(6, 182, 212, ${0.9})`;
        ctx.font = 'bold 8px monospace';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('Ethical Work', p.x, p.y + barrierRadius - 5);
      }
    }

    // Debug mode: show collision area
    if (this.cfg.debug.debugMode) {
      ctx.strokeStyle = '#4a9eff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#ff000066';
      ctx.beginPath(); ctx.moveTo(p.x - p.size, p.y); ctx.lineTo(p.x + p.size, p.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y - p.size); ctx.lineTo(p.x, p.y + p.size); ctx.stroke();
    }
  },

   updateCollectibles(dt) {
     const ctx=this.ctx;
     for(let i=this.collectibles.length-1;i>=0;i--){
       const c=this.collectibles[i];
       // Wave movement
       c.bob += 0.04 * dt;
       // Apply wave-based movement using configurable speed
c.x += Math.sin(c.bob + c.waveOffset) * c.waveSpeed * this.cfg.global.collectibleMoveSpeed * dt;
        c.y += Math.cos(c.bob + c.waveOffset) * c.waveSpeed * this.cfg.global.collectibleMoveSpeed * dt;
       
       // Keep collectibles within bounds
       if (c.x < c.size) c.x = c.size;
       if (c.x > this.W - c.size) c.x = this.W - c.size;
       if (c.y < c.size) c.y = c.size;
       if (c.y > this.H - c.size) c.y = this.H - c.size;
       
// Life decrement using configurable time (converted from seconds to frames)
        c.life -= dt;
        if(c.life<=0){this.collectibles.splice(i,1);continue;}
        
        const cy=c.y+Math.sin(c.bob)*3;
        
        // Collection range check with Proper Citation skill - check BEFORE drawing
        const hasCollectionRange=this.hasSkill('collection_range');
        const collectionRadius=this.player.size;
        const absorbRadius=hasCollectionRange?(this.player.size*3.0*this.getSkillAbsorbRadius('collection_range')):collectionRadius;
        const distToPlayer=Math.hypot(c.x-this.player.x,c.y-this.player.y);
        
        if(c.absorbing){
          const absorbSpeed=80;
          const dx=this.player.x-c.x,dy=this.player.y-c.y;
          const dist=Math.sqrt(dx*dx+dy*dy);
          // Draw absorbing visual effect BEFORE movement
          if(dist > collectionRadius + c.size){
            // Draw dashed line from collectible to player
            ctx.save();
            ctx.strokeStyle='rgba(74,158,255,0.5)';
            ctx.lineWidth=2;
            ctx.setLineDash([4,4]);
            ctx.beginPath();
            ctx.moveTo(c.x,c.y);
            ctx.lineTo(this.player.x,this.player.y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            
            // Draw pulsing glow around collectible
            const pulseIntensity = 0.4 + Math.sin(Date.now()/150) * 0.2;
            ctx.fillStyle=`rgba(74,158,255,${pulseIntensity})`;
            ctx.beginPath();
            ctx.arc(c.x,c.y,c.size + 8,0,Math.PI*2);
            ctx.fill();
          }
          if(dist<collectionRadius+c.size){
            this.score+=c.points; this.essayChunks.push({t:'g',text:c.essayText});
            this.addFloat(c.x,c.y,'+'+c.points+' '+c.label,c.color);
            if(!this.record.collects[c.id]) this.record.collects[c.id] = 0;
            this.record.collects[c.id]++;
            for(let p=0;p<7;p++) this.particles.push({x:c.x,y:c.y,vx:(Math.random()-.5)*4,vy:(Math.random()-.5)*4,color:c.color,life:28,sz:3});
            AudioManager.playSfx('collect'); this.collectibles.splice(i,1); this.updateEssay(); this.updateHUDScore();
            continue;
          }else{
            c.x+=dx/dist*absorbSpeed*dt;
            c.y+=dy/dist*absorbSpeed*dt;
          }
        }else if(distToPlayer<absorbRadius+c.size){
          c.absorbing=true;
          continue;
        }
        
        // Normal drawing - draw shadow/glow
        ctx.fillStyle=c.color+'28';ctx.beginPath();ctx.arc(c.x,cy,c.size+7,0,Math.PI*2);ctx.fill();

        // Find collectible image - check numbered sequence first
        const basePath = `images/collectibles/collectible_${c.id}`;
        const paths = [];
        for (let f = 1; f <= 5; f++) {
          paths.push(`${basePath}_${f}.png`);
        }
        // Also check without number for backward compatibility
        paths.push(`${basePath}.png`);

        const readyPath = paths.find(p => AssetLoader.isReady(p));
if(readyPath){
          const img=AssetLoader.getImage(readyPath);
          if(img&&img.complete&&img.naturalWidth>0){
            ctx.save();ctx.beginPath();ctx.arc(c.x,cy,c.size,0,Math.PI*2);ctx.clip();
            const scale=c.size*2/Math.max(img.naturalWidth,img.naturalHeight);
            const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
            ctx.drawImage(img,c.x-dw/2,cy-dh/2,dw,dh);
            ctx.restore();
          }else{ctx.fillStyle=c.color;ctx.beginPath();ctx.arc(c.x,cy,c.size,0,Math.PI*2);ctx.fill();}
          // Draw label below collectible with word wrap
          ctx.fillStyle='#fff';ctx.font=`bold ${this.cfg.global.fontSizeCollectible}px monospace`;ctx.textAlign='center';
          const collectLabel = c.label || '';
          const collectMaxW = c.size * 2;
          const collectLines = this._wrapText(ctx, collectLabel, collectMaxW);
          collectLines.forEach((line, i) => ctx.fillText(line, c.x, cy + c.size + 10 + i * 10));
        }else{ctx.fillStyle=c.color;ctx.beginPath();ctx.arc(c.x,cy,c.size,0,Math.PI*2);ctx.fill();
          ctx.fillStyle='#fff';ctx.font=`bold ${this.cfg.global.fontSizeCollectible}px monospace`;ctx.textAlign='center';
          const collectLabel = c.label || '';
          const collectMaxW = c.size * 2;
          const collectLines = this._wrapText(ctx, collectLabel, collectMaxW);
          collectLines.forEach((line, i) => ctx.fillText(line, c.x, cy + c.size + 10 + i * 10));
        }
        // Debug mode: show collectible collision area
        if(this.cfg.debug.debugMode){ctx.strokeStyle='#00ff00';ctx.lineWidth=2;ctx.beginPath();ctx.arc(c.x,cy,c.size,0,Math.PI*2);ctx.stroke();}
      }
    },

  updateEnemies(dt) {
    const ctx=this.ctx, lvl=this.cfg.levels[this.currentLevel-1];
    for(let i=this.enemies.length-1;i>=0;i--){
      const e=this.enemies[i]; e.phase+=0.025*dt; if(e.hitTimer>0) e.hitTimer-=dt;
      if(e.id==='aiblob'){
        const gm=this.hasSkill('slow_aiblob')?this.getSkillValue('slow_aiblob'):1.0;
        let growRate = e.growRate || 0.015;
        if(this.currentLevel === 1) growRate = e.growRateLevel1 || 0.008;
        else if(this.currentLevel === 2) growRate = e.growRateLevel2 || 0.010;
        else if(this.currentLevel === 3) growRate = e.growRateLevel3 || 0.012;
        else if(this.currentLevel === 4) growRate = e.growRateLevel4 || 0.015;
        e.blobSize=Math.min(e.size*2.5,e.blobSize+growRate*gm*dt);
      }
      if(e.id==='fakesource'){if(this.hasSkill('reveal_all_fake'))e.disguised=false;else if(this.hasSkill('reveal_fake_source'))e.disguised=Math.hypot(e.x-this.player.x,e.y-this.player.y)>this.getSkillValue('reveal_fake_source');}
      const dx=this.player.x-e.x,dy=this.player.y-e.y,d=Math.sqrt(dx*dx+dy*dy);
      let spd=e.speed; if(e.id==='plagiarism'&&this.hasSkill('slow_plagiarism'))spd*=(1-this.getSkillValue('slow_plagiarism'));

      // Plagiarism trail recording
      if(e.id==='plagiarism'){
        if(!e.trail) e.trail = [];
        e.trail.unshift({x: e.x, y: e.y});
        if(e.trail.length > 120) e.trail.pop();
      }

      // Essay Mill projectile shooting logic
      if(e.id==='essaymill'){
        if(!e.shootTimer) e.shootTimer=(e.projectileInterval||3)*60;
        e.shootTimer-=dt;
        if(e.shootTimer<=0){
          this.spawnProjectile(e);
          e.shootTimer=(e.projectileInterval||3)*60;
        }
      }
      
      // Define enemy size and boundaries
      const es=e.blobSize||e.size;
      const enemyPanelWidth = 320; // 左側敵人資訊面板寬度
      
      // FAKE SOURCE ABSORPTION LOGIC - Proper Citation skill
      if(e.id==='fakesource'&&e.disguised&&this.hasSkill('collection_range')){
        const collectionRadius=this.player.size;
        const absorbRadius=this.player.size*3.0*this.getSkillAbsorbRadius('collection_range');
        
        // If also has Source Verification → reveal instead of absorbing
        if(this.hasSkill('reveal_all_fake')){
          e.disguised=false;
}else if(d < absorbRadius + es){
          // Absorb towards player
          const absorbSpeed=60;
          e.x+=dx/d*absorbSpeed*dt;
          e.y+=dy/d*absorbSpeed*dt;
        }else{
          // Outside absorb range - normal wave movement
          e.bob=(e.bob||0)+0.04*dt;
          e.waveOffset=e.waveOffset||Math.random()*Math.PI*2;
          const sz=e.blobSize||e.size;
          const newX=e.x+Math.sin(e.bob+e.waveOffset)*0.5*dt;
          const newY=e.y+Math.cos(e.bob+e.waveOffset)*0.5*dt;
          if(newX>enemyPanelWidth+sz&&newX<this.W-sz)e.x=newX;
          if(newY>sz&&newY<this.H-sz)e.y=newY;
        }
      }else if(e.id==='fakesource'&&e.disguised){e.bob=(e.bob||0)+0.04*dt;e.waveOffset=e.waveOffset||Math.random()*Math.PI*2;const sz=e.blobSize||e.size,newX=e.x+Math.sin(e.bob+e.waveOffset)*0.5*dt,newY=e.y+Math.cos(e.bob+e.waveOffset)*0.5*dt;
        if(newX>enemyPanelWidth+sz&&newX<this.W-sz)e.x=newX;if(newY>sz&&newY<this.H-sz)e.y=newY;}
      else{e.x+=dx/d*spd*dt; e.y+=dy/d*spd*dt;}
      const col=e.disguised?'#22c55e':e.color;
      ctx.fillStyle=col+'22';ctx.beginPath();ctx.arc(e.x,e.y,es+7,0,Math.PI*2);ctx.fill();
      if(this.playerRole==='teacher'&&!e.disguised){ctx.strokeStyle=e.color+'44';ctx.lineWidth=1.5;ctx.setLineDash([4,4]);ctx.beginPath();ctx.arc(e.x,e.y,es+18,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
      let ip;
      if(e.disguised){
        // Fake source disguised as collectible
        const fakeBasePath = `images/collectibles/collectible_${e.fakeCollectibleId}`;
        const fakePaths = [];
        for (let f = 1; f <= 5; f++) {
          fakePaths.push(`${fakeBasePath}_${f}.png`);
        }
        fakePaths.push(`${fakeBasePath}.png`);
        ip = fakePaths.find(p => AssetLoader.isReady(p)) || fakeBasePath + '.png';
      }else{
        // Regular enemy - check PNG sequence first
        const enemyBasePath = `images/enemies/enemy_${e.id}`;
        const enemyPaths = [];
        for (let f = 1; f <= 5; f++) {
          enemyPaths.push(`${enemyBasePath}_${f}.png`);
        }
        enemyPaths.push(`${enemyBasePath}.png`);
        ip = enemyPaths.find(p => AssetLoader.isReady(p));
        
        // If no sequence found, try state-specific images
        if(!ip){
          if(e.hitTimer>0) ip = `images/enemies/enemy_${e.id}_hit.png`;
          else if(e.id==='aiblob'&&e.blobSize>e.size*1.3) ip = `images/enemies/enemy_${e.id}_grow.png`;
          else if(e.id==='fakesource'&&!e.disguised) ip = `images/enemies/enemy_${e.id}_reveal.png`;
          else if(e.id==='essaymill') ip = `images/enemies/enemy_${e.id}_lure.png`;
          else if(e.speed>1.0) ip = `images/enemies/enemy_${e.id}_fast.png`;
          else ip = `images/enemies/enemy_${e.id}.png`;
        }
      }
      const imgArr=Array.isArray(ip)?ip:[ip];
      const readyPath=imgArr.find(p=>AssetLoader.isReady(p));
      if(readyPath){
        const img=AssetLoader.getImage(readyPath);
        if(img&&img.complete&&img.naturalWidth>0){
          // If disguised, show as collectible (image + text below)
          if(e.disguised){
            ctx.save();ctx.beginPath();ctx.arc(e.x,e.y,es,0,Math.PI*2);ctx.clip();
            const scale=es*2/Math.max(img.naturalWidth,img.naturalHeight);
            const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
            ctx.drawImage(img,e.x-dw/2,e.y-dh/2,dw,dh);
            ctx.restore();
            // Draw label with smart wrapping
            ctx.fillStyle='#fff';ctx.font=`bold ${this.cfg.global.fontSizeEnemy}px monospace`;ctx.textAlign='center';
            const nameMap={journal:'JOURNAL',book:'BOOK',data:'DATA',expert:'EXPERT'};const fakeLabel=nameMap[e.fakeCollectibleId]||'';const maxW=es*2;const lines=this._wrapText(ctx,fakeLabel,maxW);lines.forEach((line,i)=>ctx.fillText(line,e.x,e.y+es+10+i*10));}
          // Regular enemy - show image + text below
          else{
            ctx.save();ctx.beginPath();ctx.arc(e.x,e.y,es,0,Math.PI*2);ctx.clip();
            const scale=es*2/Math.max(img.naturalWidth,img.naturalHeight);
            const dw=img.naturalWidth*scale,dh=img.naturalHeight*scale;
            ctx.drawImage(img,e.x-dw/2,e.y-dh/2,dw,dh);
            ctx.restore();
            // Draw label with smart wrapping
            ctx.fillStyle='#fff';ctx.font=`bold ${this.cfg.global.fontSizeEnemy}px monospace`;ctx.textAlign='center';
            const enemyLabel=e.label||'';const maxW=es*2;const lines=this._wrapText(ctx,enemyLabel,maxW);lines.forEach((line,i)=>ctx.fillText(line,e.x,e.y+es+10+i*10));
          }
        }else{
          ctx.fillStyle=col;ctx.beginPath();ctx.arc(e.x,e.y,es,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=`bold ${this.cfg.global.fontSizeEnemy}px monospace`;ctx.textAlign='center';
          const nameMap={journal:'JOURNAL',book:'BOOK',data:'DATA',expert:'EXPERT'};
          ctx.fillText(e.disguised?nameMap[e.fakeCollectibleId]?.slice(0,6):e.label.slice(0,7),e.x,e.y+3);}
      }else{
        ctx.fillStyle=col;ctx.beginPath();ctx.arc(e.x,e.y,es,0,Math.PI*2);ctx.fill();ctx.fillStyle='#fff';ctx.font=`bold ${this.cfg.global.fontSizeEnemy}px monospace`;ctx.textAlign='center';
        const nameMap={journal:'JOURNAL',book:'BOOK',data:'DATA',expert:'EXPERT'};
        ctx.fillText(e.disguised?nameMap[e.fakeCollectibleId]?.slice(0,6):e.label.slice(0,7),e.x,e.y+3);}
      if(!this.invincible&&Math.hypot(e.x-this.player.x,e.y-this.player.y)<this.player.size+es+2){
        // Check for Source Verification skill - reduce fake source damage by 50%
        let damageMultiplier=1;
        if(e.id==='fakesource'&&this.hasSkill('reveal_all_fake')){
          damageMultiplier=0.5;
        }
        this.integrity=Math.max(0,this.integrity-e.damage*0.08*dt*damageMultiplier);
        this.essayChunks.push({t:e.id==='aiblob'?'c':'b',text:e.violationType});
        this.addFloat(this.player.x,this.player.y-22,'− '+(damageMultiplier<1?'⚠ ':'')+e.violationType,e.color);
        if(!this.record.attacks[e.id]) this.record.attacks[e.id] = 0;
        this.record.attacks[e.id]++;
        for(let p=0;p<6;p++) this.particles.push({x:this.player.x,y:this.player.y,vx:(Math.random()-.5)*3,vy:(Math.random()-.5)*3,color:e.color,life:20,sz:3});
        AudioManager.playSfx('hit'); this.invincible=true;
        setTimeout(()=>this.invincible=false,this.cfg.player.invincibilityMs);
        e.hitTimer=8; this.enemies.splice(i,1); this.updateHUDIntegrity(); this.updateEssay();
        if(this.integrity<=0){clearInterval(this.timerInterval);this.endArena(lvl);}
      }
      // Source Verification skill: red warning flash when fake source is revealed
      if(e.id==='fakesource'&&e.disguised&&this.hasSkill('reveal_all_fake')){
        const dist=Math.hypot(e.x-this.player.x,e.y-this.player.y);
        if(dist<150){
          const flashIntensity=Math.sin(Date.now()/150)*0.3+0.5;
          ctx.strokeStyle=`rgba(255,50,50,${flashIntensity})`;ctx.lineWidth=3;ctx.beginPath();ctx.arc(e.x,e.y,es+10,0,Math.PI*2);ctx.stroke();
        }
      }
      // Plagiarism Awareness skill: warning when close
      if(e.id==='plagiarism'&&this.hasSkill('slow_plagiarism')){
        const dist=Math.hypot(e.x-this.player.x,e.y-this.player.y);
        if(dist<360&&dist>30){
          const warningPulse=Math.sin(Date.now()/100)*0.3+0.7;
          ctx.fillStyle=`rgba(227, 75, 75, ${warningPulse})`;
          ctx.font='bold 12px monospace';
          ctx.textAlign='center';
          ctx.fillText('⚠ PLAGIARISM!', e.x, e.y - es - 15);
        }
      }
      // Plagiarism trail - unified for all rendering paths
      if(e.id==='plagiarism'&&this.hasSkill('slow_plagiarism')&&e.trail&&e.trail.length>1){
        ctx.strokeStyle='rgba(227, 75, 75, 0.25)';
        ctx.lineWidth=3;
        ctx.beginPath();
        e.trail.forEach((p, idx) => {
          if(idx===0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
        // Draw trail dots
        e.trail.forEach((p, idx) => {
          if(idx % 5 === 0){
            ctx.fillStyle=`rgba(227, 75, 75, ${0.3 - idx*0.007})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI*2);
            ctx.fill();
          }
        });
      }
      // Debug mode: show enemy collision area
      if(this.cfg.debug.debugMode){ctx.strokeStyle='#ff0000';ctx.lineWidth=2;ctx.beginPath();ctx.arc(e.x,e.y,es,0,Math.PI*2);ctx.stroke();}
    }
  },

  drawParticles(dt){for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;this.ctx.globalAlpha=Math.max(0,p.life/28);this.ctx.fillStyle=p.color;this.ctx.fillRect(p.x-p.sz/2,p.y-p.sz/2,p.sz,p.sz);if(p.life<=0)this.particles.splice(i,1);}this.ctx.globalAlpha=1;},
  drawFloats(dt){for(let i=this.floats.length-1;i>=0;i--){const f=this.floats[i];f.y+=f.vy*dt;f.life-=dt;this.ctx.globalAlpha=Math.max(0,f.life/55);this.ctx.fillStyle=f.color;this.ctx.font='bold 13px monospace';this.ctx.textAlign='center';this.ctx.fillText(f.text,f.x,f.y);if(f.life<=0)this.floats.splice(i,1);}this.ctx.globalAlpha=1;},
  addFloat(x,y,text,color){this.floats.push({x,y,text,color,life:55,vy:-1.4});},

  spawnProjectile(enemy) {
    const speed = enemy.projectileSpeed || 2.5;
    const dx = this.player.x - enemy.x;
    const dy = this.player.y - enemy.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if(dist > 0){
      this.projectiles.push({
        x: enemy.x,
        y: enemy.y,
        vx: (dx/dist) * speed,
        vy: (dy/dist) * speed,
        damage: enemy.projectileDamage || 18,
        color: '#f97316',
        size: 12
      });
      AudioManager.playSfx('enemy_spawn');
    }
  },

  updateProjectiles(dt) {
    const ctx = this.ctx;
    for(let i = this.projectiles.length - 1; i >= 0; i--){
      const p = this.projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Remove if out of screen
      if(p.x < -50 || p.x > this.W + 50 || p.y < -50 || p.y > this.H + 50){
        this.projectiles.splice(i, 1);
        continue;
      }

      // Barrier collision check
      const hasBarrier = this.hasSkill('barrier');
      const barrierRadius = hasBarrier ? this.player.size + 25 : 0;
      const distToPlayer = Math.hypot(p.x - this.player.x, p.y - this.player.y);

      if(hasBarrier && distToPlayer < barrierRadius + p.size){
        // Blocked by barrier - remove projectile with effect
        for(let j = 0; j < 5; j++){
          this.particles.push({
            x: p.x, y: p.y,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            color: '#4a9eff', life: 20, sz: 3
          });
        }
        this.projectiles.splice(i, 1);
        continue;
      }

      // Player collision
      if(distToPlayer < this.player.size + p.size){
        this.integrity = Math.max(0, this.integrity - p.damage);
        for(let j = 0; j < 6; j++){
          this.particles.push({
            x: this.player.x, y: this.player.y,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            color: p.color, life: 20, sz: 3
          });
        }
        this.addFloat(this.player.x, this.player.y - 22, '- ' + p.damage, p.color);
        AudioManager.playSfx('hit');
        this.projectiles.splice(i, 1);
        this.updateHUDIntegrity();
        if(this.integrity <= 0){
          clearInterval(this.timerInterval);
          const lvl = this.cfg.levels[this.currentLevel - 1];
          this.endArena(lvl);
        }
      }
    }
  },

  drawProjectiles(dt) {
    const ctx = this.ctx;
    const projectilePath = 'images/projectiles/projectile_paper.png';
    const hasImage = AssetLoader.isReady(projectilePath);

    for(const p of this.projectiles){
      if(hasImage){
        const img = AssetLoader.getImage(projectilePath);
        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.clip();
        const scale = p.size * 2 / Math.max(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, p.x - img.naturalWidth * scale / 2, p.y - img.naturalHeight * scale / 2, img.naturalWidth * scale, img.naturalHeight * scale);
        ctx.restore();
      }else{
        // Fallback: yellow triangle pointing in velocity direction
        ctx.save();
        ctx.translate(p.x, p.y);
        const angle = Math.atan2(p.vy, p.vx);
        ctx.rotate(angle);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.size, 0);
        ctx.lineTo(-p.size * 0.7, -p.size * 0.7);
        ctx.lineTo(-p.size * 0.7, p.size * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  },

  drawTooltip() {
    if(!this.tooltip) return;
    const e=this.tooltip,ctx=this.ctx,TW=Math.min(260,this.W-20);
    const bx=Math.min(Math.max(e.x-TW/2,8),this.W-TW-8),by=Math.min(e.y+20,this.H-200);
    ctx.fillStyle='rgba(10,10,30,0.96)';ctx.strokeStyle=e.color;ctx.lineWidth=2;
    this._rr(bx,by,TW,175,6);ctx.fill();ctx.stroke();
    ctx.fillStyle=e.color;ctx.font='bold 13px monospace';ctx.textAlign='left';ctx.fillText(e.label,bx+12,by+22);
    ctx.fillStyle=e.color+'30';ctx.fillRect(bx+12,by+28,Math.min(ctx.measureText(e.violationType).width+10,TW-24),18);
    ctx.fillStyle=e.color;ctx.font='bold 10px monospace';ctx.fillText(e.violationType,bx+17,by+41);
    ctx.fillStyle='#ccc';ctx.font='11px monospace';
    this._wrap(ctx,'What: '+e.what,bx+12,by+64,TW-24,14);
    this._wrap(ctx,'Why: '+e.why,bx+12,by+96,TW-24,14);
    ctx.fillStyle='#f97316';this._wrap(ctx,'Result: '+e.consequence,bx+12,by+134,TW-24,13);
  },

  drawHint() {
    const isMobile=window.matchMedia('(pointer: coarse)').matches;
    const hint=isMobile?'TOUCH & DRAG to move  |  COLLECT glowing items  |  AVOID threats':'CLICK to move  |  DRAG to steer  |  HOVER enemies to learn';
    this.ctx.fillStyle='#ffffff14';this.ctx.font='11px monospace';this.ctx.textAlign='center';
    this.ctx.fillText(hint,this.W/2,this.H-10);
  },

drawEnemyInfo() {
    if(this.state!=='arena'||!this.cfg.enemies) return;
    const enabledEnemies = this.cfg.enemies.filter(e => e.enabled !== false);
    if(!enabledEnemies.length) return;
    
    const hudTopHeight = 55;
    const bottomMargin = 25;
    const panelW = Math.min(320, this.W * 0.35);
    const panelH = this.H - hudTopHeight - bottomMargin;
    const ctx = this.ctx;
    ctx.save();
    
    ctx.fillStyle = 'rgba(6,6,15,0.95)';
    ctx.fillRect(0, hudTopHeight, panelW, panelH);
    ctx.strokeStyle = '#2d2d50';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(panelW, hudTopHeight);
    ctx.lineTo(panelW, hudTopHeight + panelH);
    ctx.stroke();
    
    const currentNearby = new Set;
    if(this.player) {
      for(const en of this.enemies) {
        if(en.disguised) continue;
        const dist = Math.hypot(en.x - this.player.x, en.y - this.player.y);
        if(dist < this.NEARBY_DISTANCE) {
          currentNearby.add(en.id);
          if(!this.discoveredEnemies.has(en.id)) this.discoveredEnemies.add(en.id);
        }
      }
    }
    
    const padding = 12;
    const maxTextW = panelW - padding * 2 - 8;
    const lineHeight = 16;
    const blockGap = 20;
    const imgSize = 64;
    
    const blockHeights = enabledEnemies.map(e => {
      const whatLines = Math.ceil(this._estimateLines(ctx, 'What: ' + (e.what || ''), maxTextW, 11));
      const whyLines = Math.ceil(this._estimateLines(ctx, 'Why: ' + (e.why || ''), maxTextW, 11));
      const resultLines = Math.ceil(this._estimateLines(ctx, 'Result: ' + (e.consequence || ''), maxTextW, 11));
      
      const labelH = imgSize;
      const separatorH = 6;
      const contentH = (whatLines + whyLines + resultLines) * lineHeight;
      const gap = 16;
      
      return labelH + separatorH + contentH + gap;
    });
    
    let currentY = hudTopHeight + 10;
    enabledEnemies.forEach((e, index) => {
      const nearby = currentNearby.has(e.id);
      const blockH = blockHeights[index];
      
      const whatLines = Math.ceil(this._estimateLines(ctx, 'What: ' + (e.what || ''), maxTextW, 11));
      const whyLines = Math.ceil(this._estimateLines(ctx, 'Why: ' + (e.why || ''), maxTextW, 11));
      const resultLines = Math.ceil(this._estimateLines(ctx, 'Result: ' + (e.consequence || ''), maxTextW, 11));
      const enemyColor = e.color || '#e24b4b';
      
      if(nearby) {
        ctx.fillStyle = 'rgba(226,75,75,0.15)';
        ctx.fillRect(4, currentY + 2, panelW - 8, blockH - 4);
        ctx.strokeStyle = '#e24b4b';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = '#3d3d5c';
        ctx.lineWidth = 1;
      }
      ctx.strokeRect(4, currentY + 2, panelW - 8, blockH - 4);
      
      let textY = currentY + 22;
      
      const imgX = padding;
      const imgY = textY - 10;
      const imgPath = 'images/enemies/enemy_' + e.id + '.png';
      const imgPath1 = 'images/enemies/enemy_' + e.id + '_1.png';
      
      if(AssetLoader.isReady(imgPath) || AssetLoader.isReady(imgPath1)) {
        const readyPath = AssetLoader.isReady(imgPath) ? imgPath : imgPath1;
        const img = AssetLoader.getImage(readyPath);
        if(img && img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(imgX + imgSize/2, imgY + imgSize/2, imgSize/2, 0, Math.PI * 2);
          ctx.clip();
          const scale = imgSize / Math.max(img.naturalWidth, img.naturalHeight);
          const dw = img.naturalWidth * scale;
          const dh = img.naturalHeight * scale;
          ctx.drawImage(img, imgX + imgSize/2 - dw/2, imgY + imgSize/2 - dh/2, dw, dh);
          ctx.restore();
        }
      }
      
      const nameX = padding + imgSize + 10;
      ctx.fillStyle = nearby ? '#fff' : '#ccc';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(e.label, nameX, textY);
      textY += imgSize;
      
      ctx.strokeStyle = enemyColor + '40';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, textY);
      ctx.lineTo(panelW - padding, textY);
      ctx.stroke();
      textY += 6;
      
      ctx.fillStyle = nearby ? '#aaa' : '#888';
      ctx.font = 'bold 11px monospace';
      this._wrap(ctx, 'What: ' + (e.what || ''), padding, textY, maxTextW, lineHeight);
      textY += whatLines * lineHeight;
      
      ctx.fillStyle = nearby ? '#aaa' : '#888';
      ctx.font = 'bold 11px monospace';
      this._wrap(ctx, 'Why: ' + (e.why || ''), padding, textY, maxTextW, lineHeight);
      textY += whyLines * lineHeight;
      
      ctx.fillStyle = nearby ? '#ff8888' : '#e24b4b';
      ctx.font = 'bold 11px monospace';
      this._wrap(ctx, 'Result: ' + (e.consequence || ''), padding, textY, maxTextW, lineHeight);
      textY += resultLines * lineHeight;
      
      currentY += blockH;
    });
    
    ctx.restore();
  },
  
  _estimateLines(ctx, text, maxWidth, fontSize) {
    ctx.font = fontSize + 'px monospace';
    const words = text.split(' ');
    let line = '';
    let lines = 1;
    for(const w of words) {
      const test = line + w + ' ';
      if(ctx.measureText(test).width > maxWidth && line) {
        lines++;
        line = w + ' ';
      } else {
        line = test;
      }
    }
    return lines;
  },
  
  _truncateSingleLine(ctx, text, x, y, maxWidth) {
    if(!text) return;
    let result = text;
    while(ctx.measureText(result).width > maxWidth && result.length > 0) {
      result = result.slice(0, -1);
    }
    ctx.fillText(result + (result.length < text.length ? '...' : ''), x, y);
  },

  _rr(x,y,w,h,r){const c=this.ctx;c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();},
  _wrap(ctx,text,x,y,mw,lh){const words=text.split(' ');let line='',cy=y;for(const w of words){const t=line+w+' ';if(ctx.measureText(t).width>mw&&line){ctx.fillText(line,x,cy);line=w+' ';cy+=lh;}else line=t;}ctx.fillText(line,x,cy);},

  updateHUD(lvl){if(lvl){document.getElementById('hud-level').textContent=`${this.currentLevel}/4`;document.getElementById('hud-assignment').textContent=lvl.assignmentName;document.getElementById('hud-timer').textContent=lvl.timeLimit+'s';}this.updateHUDIntegrity();this.updateHUDScore();this.updateSkillBadges();},
  updateHUDIntegrity(){const pct=Math.round(this.integrity);document.getElementById('hud-integrity-pct').textContent=pct+'%';const bar=document.getElementById('hud-integrity-bar');bar.style.width=pct+'%';bar.style.background=pct>60?'#22c55e':pct>30?'#eab308':'#e24b4b';const g=this.calcGrade();document.getElementById('hud-grade').textContent=g.letter;document.getElementById('hud-grade').style.color=g.color;},
  updateHUDScore(){document.getElementById('hud-score').textContent=this.score;},
  updateSkillBadges(){const active=this.cfg.skills.filter(s=>this.earnedSkills.includes(s.effectType));document.getElementById('hud-skills').innerHTML=active.length===0?'<span class="skill-badge-empty">No skills yet</span>':active.map(s=>`<span class="skill-badge-active">${s.name}</span>`).join('');},
  updateEssay(){const el=document.getElementById('essay-display');if(!this.essayChunks.length){el.innerHTML='<span class="essay-placeholder">Collect sources to build your essay...</span>';return;}el.innerHTML=this.essayChunks.slice(-8).map(c=>{if(c.t==='g')return`<span class="essay-good">${c.text} </span>`;if(c.t==='b')return`<span class="essay-bad">[${c.text} detected] </span>`;if(c.t==='c')return`<span class="essay-corrupt">[AI-generated content detected] </span>`;return'';}).join('');},
  calcGrade(){const g=this.cfg.grading,cs=Math.min(this.score*4,g.collectibleScoreCap),total=this.integrity*g.integrityWeight+cs*(1-g.integrityWeight),t=g.thresholds;if(this.integrity<=0)return{letter:'F',pct:0,color:'#6b7280'};if(total>=t.A)return{letter:'A',pct:Math.round(total),color:'#22c55e'};if(total>=t.B)return{letter:'B',pct:Math.round(total),color:'#3b82f6'};if(total>=t.C)return{letter:'C',pct:Math.round(total),color:'#f5c842'};if(total>=t.D)return{letter:'D',pct:Math.round(total),color:'#f97316'};return{letter:'E',pct:Math.round(total),color:'#e24b4b'};},

  endArena(lvl){
    this.state='result';clearInterval(this.timerInterval);clearInterval(this.spawnInterval);clearInterval(this.collectInterval);if(this.animId)cancelAnimationFrame(this.animId);
    const grade=this.calcGrade();this.levelGrades.push({level:this.currentLevel,name:lvl.assignmentName,...grade});
    const timeKey = 'level' + this.currentLevel + 'Time_sec';
    this.record[timeKey] = Math.round((Date.now() - this._phaseStartTime) / 1000);
    const gradeKey = 'gradeL' + this.currentLevel;
    this.record[gradeKey] = grade.letter;
    this.record[gradeKey + '_pct'] = grade.pct;
    const integrityKey = 'integrityL' + this.currentLevel;
    this.record[integrityKey] = Math.round(this.integrity);
    AudioManager.playSfx(grade.letter==='A'||grade.letter==='B'?'grade_a':'grade_f');AudioManager.playMusic('result');
    UI.showScreen('result');
    document.getElementById('result-assignment').textContent=lvl.assignmentName;
    document.getElementById('result-level-num').textContent=`Level ${this.currentLevel} of 4`;
    document.getElementById('result-grade-letter').textContent=grade.letter;document.getElementById('result-grade-letter').style.color=grade.color;
    document.getElementById('result-grade-pct').textContent=grade.pct+'%';
    document.getElementById('result-message').textContent=grade.pct<this.cfg.grading.lowGradeThreshold?lvl.resultLow:lvl.resultHigh;
    document.getElementById('result-essay').innerHTML=this.essayChunks.slice(-6).map(c=>{if(c.t==='g')return`<span class="essay-good">${c.text.slice(0,60)}... </span>`;if(c.t==='b')return`<span class="essay-bad">[${c.text}] </span>`;if(c.t==='c')return`<span class="essay-corrupt">[AI content] </span>`;return'';}).join('')||'<span class="essay-placeholder">No essay built.</span>';
    document.getElementById('result-history').innerHTML=this.levelGrades.map(g=>`<div class="grade-hist-item"><span class="grade-hist-name">${g.name}</span><span class="grade-hist-grade" style="color:${g.color}">${g.letter} (${g.pct}%)</span></div>`).join('');
    const btn=document.getElementById('result-next-btn');
    if(this.currentLevel<4){btn.textContent=`Continue to Level ${this.currentLevel+1} →`;btn.onclick=()=>{const go=()=>this.goToNextLevel();if(!this._tryCutscene([`level${this.currentLevel}_post`],go))go();};}
    else{btn.textContent='See Final Results';btn.onclick=()=>{const go=()=>this.showComplete();if(!this._tryCutscene(['level4_post','graduation'],go))go();};}
    AudioManager.playSfx('level_complete');
  },

  showComplete(){
    this.state='complete';UI.showScreen('complete');AudioManager.playMusic('graduation',false);AudioManager.playSfx('graduation');
    document.getElementById('complete-message').textContent=this.cfg.global.completionMessage;
    document.getElementById('complete-history').innerHTML=this.levelGrades.map(g=>`<div class="grade-hist-item large"><span class="grade-hist-name">${g.name}</span><span class="grade-hist-grade" style="color:${g.color}">${g.letter} — ${g.pct}%</span></div>`).join('');
    const finalGrade = this.calcGrade();
    this.record.finalScore = this.score;
    this.record.finalIntegrity = Math.round(this.integrity);
    this.record.finalGrade = finalGrade.letter;
    const totalTime = (this.record.level1Time_sec || 0) + (this.record.level2Time_sec || 0) + (this.record.level3Time_sec || 0) + (this.record.level4Time_sec || 0);
    this.record.totalPlayTime_sec = totalTime;
    this._saveRecordToStorage();
    const autoDownload = this.cfg?.global?.autoReportDownload !== false;
    if(autoDownload){
      this._autoDownloadCSV();
    }else{
      const btn = document.getElementById('download-report-btn');
      if(btn) btn.style.display = 'inline-block';
    }
  },

  _autoDownloadCSV(){
    const r = this.record;
    const baseHeaders = [
      'Name', 'Email', 'LoginTimestamp',
      'CutsceneReadTime_sec',
      'SkillSelectL2Time_sec', 'Level2Time_sec', 'Skill_L2',
      'SkillSelectL3Time_sec', 'Level3Time_sec', 'Skill_L3',
      'SkillSelectL4Time_sec', 'Level4Time_sec', 'Skill_L4_1', 'Skill_L4_2',
      'GradeLevel1', 'GradeLevel1_pct', 'GradeLevel2', 'GradeLevel2_pct', 'GradeLevel3', 'GradeLevel3_pct', 'GradeLevel4', 'GradeLevel4_pct',
      'IntegrityLevel1', 'IntegrityLevel2', 'IntegrityLevel3', 'IntegrityLevel4',
      'FinalScore', 'FinalIntegrity', 'FinalGrade',
      'TotalPlayTime_sec'
    ];
    const attackKeys = Object.keys(r.attacks || {});
    const collectKeys = Object.keys(r.collects || {});
    const headers = [...baseHeaders];
    attackKeys.forEach(k => headers.push('Attack_' + k));
    collectKeys.forEach(k => headers.push('Collect_' + k));
    const escape = v => {
      if(v === null || v === undefined) return '';
      const s = String(v);
      if(s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const values = [
      r.name, r.email, r.loginTimestamp,
      r.cutsceneReadTime_sec || 0,
      r.skillSelectL2Time_sec || 0, r.level2Time_sec || 0, r.skillL2 || '',
      r.skillSelectL3Time_sec || 0, r.level3Time_sec || 0, r.skillL3 || '',
      r.skillSelectL4Time_sec || 0, r.level4Time_sec || 0, r.skillL4_1 || '', r.skillL4_2 || '',
      r.gradeL1 || '', r.gradeL1_pct || 0, r.gradeL2 || '', r.gradeL2_pct || 0, r.gradeL3 || '', r.gradeL3_pct || 0, r.gradeL4 || '', r.gradeL4_pct || 0,
      r.integrityL1 || 0, r.integrityL2 || 0, r.integrityL3 || 0, r.integrityL4 || 0,
      r.finalScore || 0, r.finalIntegrity || 0, r.finalGrade || '',
      r.totalPlayTime_sec || 0
    ];
    attackKeys.forEach(k => values.push(r.attacks?.[k] || 0));
    collectKeys.forEach(k => values.push(r.collects?.[k] || 0));
    const csv = headers.map(escape).join(',') + '\n' + values.map(escape).join(',');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const namePart = (r.name || 'record').replace(/[^a-z0-9]/gi, '_');
    a.download = namePart + '_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  exportSingleCSV(){
    const r = this.record;
    const baseHeaders = [
      'Name', 'Email', 'LoginTimestamp',
      'CutsceneReadTime_sec',
      'SkillSelectL2Time_sec', 'Level2Time_sec', 'Skill_L2',
      'SkillSelectL3Time_sec', 'Level3Time_sec', 'Skill_L3',
      'SkillSelectL4Time_sec', 'Level4Time_sec', 'Skill_L4_1', 'Skill_L4_2',
      'GradeLevel1', 'GradeLevel1_pct', 'GradeLevel2', 'GradeLevel2_pct', 'GradeLevel3', 'GradeLevel3_pct', 'GradeLevel4', 'GradeLevel4_pct',
      'IntegrityLevel1', 'IntegrityLevel2', 'IntegrityLevel3', 'IntegrityLevel4',
      'FinalScore', 'FinalIntegrity', 'FinalGrade',
      'TotalPlayTime_sec'
    ];
    const attackKeys = Object.keys(r.attacks || {});
    const collectKeys = Object.keys(r.collects || {});
    const headers = [...baseHeaders];
    attackKeys.forEach(k => headers.push('Attack_' + k));
    collectKeys.forEach(k => headers.push('Collect_' + k));
    const escape = v => {
      if(v === null || v === undefined) return '';
      const s = String(v);
      if(s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const values = [
      r.name, r.email, r.loginTimestamp,
      r.cutsceneReadTime_sec || 0,
      r.skillSelectL2Time_sec || 0, r.level2Time_sec || 0, r.skillL2 || '',
      r.skillSelectL3Time_sec || 0, r.level3Time_sec || 0, r.skillL3 || '',
      r.skillSelectL4Time_sec || 0, r.level4Time_sec || 0, r.skillL4_1 || '', r.skillL4_2 || '',
      r.gradeL1 || '', r.gradeL1_pct || 0, r.gradeL2 || '', r.gradeL2_pct || 0, r.gradeL3 || '', r.gradeL3_pct || 0, r.gradeL4 || '', r.gradeL4_pct || 0,
      r.integrityL1 || 0, r.integrityL2 || 0, r.integrityL3 || 0, r.integrityL4 || 0,
      r.finalScore || 0, r.finalIntegrity || 0, r.finalGrade || '',
      r.totalPlayTime_sec || 0
    ];
    attackKeys.forEach(k => values.push(r.attacks?.[k] || 0));
    collectKeys.forEach(k => values.push(r.collects?.[k] || 0));
    const csv = headers.map(escape).join(',') + '\n' + values.map(escape).join(',');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const namePart = (r.name || 'record').replace(/[^a-z0-9]/gi, '_');
    a.download = namePart + '_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  _saveRecordToStorage(){
    try{
      const key = this._STORAGE_KEY;
      let records = [];
      const existing = localStorage.getItem(key);
      if(existing){
        try{ records = JSON.parse(existing); if(!Array.isArray(records)) records = []; }
        catch{ records = []; }
      }
      records.push(this.record);
      localStorage.setItem(key, JSON.stringify(records));
      console.log('[Record] Saved to LocalStorage. Total records:', records.length);
    }catch(e){
      console.error('[Record] Failed to save:', e);
    }
  },

  exportCSV(){
    try{
      const key = this._STORAGE_KEY;
      const existing = localStorage.getItem(key);
      let records = [];
      if(existing){
        try{ records = JSON.parse(existing); if(!Array.isArray(records)) records = []; }
        catch{ records = []; }
      }
      if(records.length === 0){
        alert('No records found.');
        return;
      }
      const baseHeaders = [
        'Name', 'Email', 'LoginTimestamp',
        'CutsceneReadTime_sec',
        'SkillSelectL2Time_sec', 'Level2Time_sec', 'Skill_L2',
        'SkillSelectL3Time_sec', 'Level3Time_sec', 'Skill_L3',
        'SkillSelectL4Time_sec', 'Level4Time_sec', 'Skill_L4_1', 'Skill_L4_2',
        'GradeLevel1', 'GradeLevel2', 'GradeLevel3', 'GradeLevel4',
        'IntegrityLevel1', 'IntegrityLevel2', 'IntegrityLevel3', 'IntegrityLevel4',
        'FinalScore', 'FinalIntegrity', 'FinalGrade',
        'TotalPlayTime_sec'
      ];
      const allAttackKeys = new Set();
      const allCollectKeys = new Set();
      records.forEach(r => {
        if(r.attacks) Object.keys(r.attacks).forEach(k => allAttackKeys.add(k));
        if(r.collects) Object.keys(r.collects).forEach(k => allCollectKeys.add(k));
      });
      const headers = [...baseHeaders];
      allAttackKeys.forEach(k => headers.push('Attack_' + k));
      allCollectKeys.forEach(k => headers.push('Collect_' + k));
      const escape = v => {
        if(v === null || v === undefined) return '';
        const s = String(v);
        if(s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
        return s;
      };
      const rows = records.map(r => {
        const values = [
          r.name, r.email, r.loginTimestamp,
          r.cutsceneReadTime_sec || 0,
          r.skillSelectL2Time_sec || 0, r.level2Time_sec || 0, r.skillL2 || '',
          r.skillSelectL3Time_sec || 0, r.level3Time_sec || 0, r.skillL3 || '',
          r.skillSelectL4Time_sec || 0, r.level4Time_sec || 0, r.skillL4_1 || '', r.skillL4_2 || '',
          r.gradeL1 || '', r.gradeL2 || '', r.gradeL3 || '', r.gradeL4 || '',
          r.integrityL1 || 0, r.integrityL2 || 0, r.integrityL3 || 0, r.integrityL4 || 0,
          r.finalScore || 0, r.finalIntegrity || 0, r.finalGrade || '',
          r.totalPlayTime_sec || 0
        ];
        allAttackKeys.forEach(k => values.push(r.attacks?.[k] || 0));
        allCollectKeys.forEach(k => values.push(r.collects?.[k] || 0));
        return values.map(escape).join(',');
      });
      const csv = headers.map(escape).join(',') + '\n' + rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'academic_trial_all_records_' + new Date().toISOString().slice(0,10) + '.csv';
      a.click();
      URL.revokeObjectURL(url);
    }catch(e){
      console.error('[Export] Failed:', e);
      alert('Failed to export CSV.');
    }
  },

  skipLevel(){
    if(!this.cfg.debug.debugMode)return;
    const lvl=this.cfg.levels[this.currentLevel-1];
    console.log('[Debug] Skipping level:', this.currentLevel);
    this.endArena(lvl);
  },
};

// Teacher can export all records by typing this in browser console:
window.exportAllRecords = function(){
  try{
    const key = 'academic_trial_records';
    const existing = localStorage.getItem(key);
    let records = [];
    if(existing){
      try{ records = JSON.parse(existing); if(!Array.isArray(records)) records = []; }
      catch{ records = []; }
    }
    if(records.length === 0){
      console.log('No records found.');
      return;
    }
    const baseHeaders = [
      'Name', 'Email', 'LoginTimestamp',
      'CutsceneReadTime_sec',
      'SkillSelectL2Time_sec', 'Level2Time_sec', 'Skill_L2',
      'SkillSelectL3Time_sec', 'Level3Time_sec', 'Skill_L3',
      'SkillSelectL4Time_sec', 'Level4Time_sec', 'Skill_L4_1', 'Skill_L4_2',
      'GradeLevel1', 'GradeLevel1_pct', 'GradeLevel2', 'GradeLevel2_pct', 'GradeLevel3', 'GradeLevel3_pct', 'GradeLevel4', 'GradeLevel4_pct',
      'IntegrityLevel1', 'IntegrityLevel2', 'IntegrityLevel3', 'IntegrityLevel4',
      'FinalScore', 'FinalIntegrity', 'FinalGrade',
      'TotalPlayTime_sec'
    ];
    const allAttackKeys = new Set();
    const allCollectKeys = new Set();
    records.forEach(r => {
      if(r.attacks) Object.keys(r.attacks).forEach(k => allAttackKeys.add(k));
      if(r.collects) Object.keys(r.collects).forEach(k => allCollectKeys.add(k));
    });
    const headers = [...baseHeaders];
    allAttackKeys.forEach(k => headers.push('Attack_' + k));
    allCollectKeys.forEach(k => headers.push('Collect_' + k));
    const escape = v => {
      if(v === null || v === undefined) return '';
      const s = String(v);
      if(s.includes(',') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const rows = records.map(r => {
      const values = [
        r.name, r.email, r.loginTimestamp,
        r.cutsceneReadTime_sec || 0,
        r.skillSelectL2Time_sec || 0, r.level2Time_sec || 0, r.skillL2 || '',
        r.skillSelectL3Time_sec || 0, r.level3Time_sec || 0, r.skillL3 || '',
        r.skillSelectL4Time_sec || 0, r.level4Time_sec || 0, r.skillL4_1 || '', r.skillL4_2 || '',
        r.gradeL1 || '', r.gradeL2 || '', r.gradeL3 || '', r.gradeL4 || '',
        r.integrityL1 || 0, r.integrityL2 || 0, r.integrityL3 || 0, r.integrityL4 || 0,
        r.finalScore || 0, r.finalIntegrity || 0, r.finalGrade || '',
        r.totalPlayTime_sec || 0
      ];
      allAttackKeys.forEach(k => values.push(r.attacks?.[k] || 0));
      allCollectKeys.forEach(k => values.push(r.collects?.[k] || 0));
      return values.map(escape).join(',');
    });
    const csv = headers.map(escape).join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'academic_trial_all_records_' + new Date().toISOString().slice(0,10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    console.log('Exported', records.length, 'records');
  }catch(e){
    console.error('Failed to export:', e);
  }
};
console.log('[Record] Use exportAllRecords() in console to export all student records to CSV.');
