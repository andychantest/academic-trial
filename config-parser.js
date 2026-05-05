// config-parser.js
// Parses the plain-text config.txt file into a usable JS object
// Supports both local file:// and server http:// environments

const ConfigParser = {

  // Raw parsed sections
  _data: {},

  // Load and parse config.txt
  async load(path = 'config.txt') {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error('Cannot load config.txt');
      const text = await response.text();
      this._parse(text);
      console.log('[Config] Loaded successfully:', Object.keys(this._data));
      return true;
    } catch (e) {
      console.warn('[Config] Failed to load config.txt, using defaults:', e.message);
      return false;
    }
  },

  // Parse the INI-style text into sections
  _parse(text) {
    this._data = {};
    let currentSection = '_root';
    const lines = text.split('\n');

    for (let line of lines) {
      line = line.trim();

      // Skip empty lines and comments
      if (!line || line.startsWith('#')) continue;

      // Section header [SECTION_NAME]
      if (line.startsWith('[') && line.endsWith(']')) {
        currentSection = line.slice(1, -1).trim().toUpperCase();
        if (!this._data[currentSection]) this._data[currentSection] = {};
        continue;
      }

      // Key = Value
      const eqIdx = line.indexOf('=');
      if (eqIdx > -1) {
        const key = line.slice(0, eqIdx).trim().toLowerCase();
        const val = line.slice(eqIdx + 1).trim();
        if (!this._data[currentSection]) this._data[currentSection] = {};
        this._data[currentSection][key] = this._coerce(val);
      }
    }
  },

  // Auto-convert strings to appropriate types
  _coerce(val) {
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (val === '') return '';
    const num = Number(val);
    if (!isNaN(num) && val !== '') return num;
    return val;
  },

  // Get a value with a fallback default
  get(section, key, defaultVal = null) {
    const s = (this._data[section] || {})[key];
    return s !== undefined ? s : defaultVal;
  },

  // Get all keys in a section as an object
  section(name) {
    return this._data[name.toUpperCase()] || {};
  },

  // Get all sections matching a prefix (e.g. 'LEVEL_' returns all levels)
  sectionsWithPrefix(prefix) {
    const result = {};
    for (const key of Object.keys(this._data)) {
      if (key.startsWith(prefix.toUpperCase())) {
        result[key] = this._data[key];
      }
    }
    return result;
  },

  // Build full game config from parsed data
  buildGameConfig() {
    const cfg = {};

     // Global
     cfg.global = {
       title: this.get('GLOBAL', 'game_title', 'The Academic Trial'),
language: this.get('GLOBAL', 'language', 'en'),
        showFPS: this.get('GLOBAL', 'show_fps', false),
        timezone: this.get('GLOBAL', 'timezone', 'GMT+8'),
        autoReportDownload: this.get('GLOBAL', 'auto_report_download', false),
        completionMessage: this.get('GLOBAL', 'completion_message', 'Congratulations!'),
       // Font size settings
       fontSizePlayer: this.get('GLOBAL', 'font_size_player', 10),
       fontSizeEnemy: this.get('GLOBAL', 'font_size_enemy', 9),
       fontSizeCollectible: this.get('GLOBAL', 'font_size_collectible', 9),
// Collectible movement and lifetime
        collectibleMoveSpeed: this.get('GLOBAL', 'collectible_move_speed', 0.8),
        collectibleLifeSeconds: this.get('GLOBAL', 'collectible_life_seconds', 20),
        collectibleSize: this.get('GLOBAL', 'collectible_size', 30),
      };

// Player
      cfg.player = {
        moveSpeed: this.get('PLAYER', 'move_speed', 3.0),
        size: this.get('PLAYER', 'size', 15),
        visualSize: this.get('PLAYER', 'visual_size', 48),
        invincibilityMs: this.get('PLAYER', 'invincibility_ms', 800),
      };

      // Role settings
      cfg.enableRoles = {
        student: this.get('PLAYER', 'enable_student', true),
        teacher: this.get('PLAYER', 'enable_teacher', true),
        admin: this.get('PLAYER', 'enable_admin', true),
      };

      // Debug
     cfg.debug = {
       debugMode: this.get('DEBUG', 'debug_mode', false),
     };

     // Animation
     cfg.animation = {
       fps: this.get('ANIMATION', 'animation_fps', 10),
     };

    // Levels
    cfg.levels = [];
    for (let i = 1; i <= 4; i++) {
      const sec = `LEVEL_${i}`;
      cfg.levels.push({
        num: i,
        assignmentName: this.get(sec, 'assignment_name', `Level ${i}`),
        timeLimit: this.get(sec, 'time_limit', 30),
        enemyCount: this.get(sec, 'enemy_count', 5),
        enemySpeedMult: this.get(sec, 'enemy_speed_multiplier', 1.0),
        enemyDamageMult: this.get(sec, 'enemy_damage_multiplier', 1.0),
        enemyRespawnSec: this.get(sec, 'enemy_respawn_seconds', 7),
        collectibleSpawnSec: this.get(sec, 'collectible_spawn_seconds', 5),
        fakeSourceRate: this.get(sec, 'fake_source_rate', 0.8),
        backgroundImage: this.get(sec, 'background_image', ''),
        backgroundMusic: this.get(sec, 'background_music', ''),
        description: this.get(sec, 'level_description', ''),
        resultLow: this.get(sec, 'result_message_low', ''),
        resultHigh: this.get(sec, 'result_message_high', ''),
      });
    }

    // Enemies
    const enemyKeys = ['PLAGIARISM', 'AIBLOB', 'ESSAYMILL', 'FAKESOURCE', 'COLLUDE'];
    cfg.enemies = enemyKeys.map(k => {
      const sec = `ENEMY_${k}`;
      return {
        id: k.toLowerCase(),
        enabled: this.get(sec, 'enabled', true),
        label: this.get(sec, 'label', k),
        color: this.get(sec, 'color', '#888888'),
        speed: this.get(sec, 'speed', 1.0),
        damage: this.get(sec, 'damage', 10),
        size: this.get(sec, 'size', 18),
        spawnWeight: this.get(sec, 'spawn_weight', 3),
        growRate: this.get(sec, 'grow_rate', 0),
        growRateLevel1: this.get(sec, 'grow_rate_level_1', 0.008),
        growRateLevel2: this.get(sec, 'grow_rate_level_2', 0.010),
        growRateLevel3: this.get(sec, 'grow_rate_level_3', 0.012),
        growRateLevel4: this.get(sec, 'grow_rate_level_4', 0.015),
        disguiseDistance: this.get(sec, 'disguise_distance', 0),
        violationType: this.get(sec, 'violation_type', 'VIOLATION'),
        what: this.get(sec, 'what', ''),
        why: this.get(sec, 'why', ''),
        consequence: this.get(sec, 'consequence', ''),
        projectileInterval: this.get(sec, 'projectile_interval', 0),
        projectileSpeed: this.get(sec, 'projectile_speed', 0),
        projectileDamage: this.get(sec, 'projectile_damage', 0),
      };
    }).filter(e => e.enabled);

    // Collectibles
    const collectKeys = ['JOURNAL', 'BOOK', 'DATA', 'EXPERT'];
    cfg.collectibles = collectKeys.map(k => {
      const sec = `COLLECTIBLE_${k}`;
      return {
        id: k.toLowerCase(),
        enabled: this.get(sec, 'enabled', true),
        label: this.get(sec, 'label', k),
        color: this.get(sec, 'color', '#22c55e'),
        size: this.get(sec, 'size', 12),
        points: this.get(sec, 'points', 2),
        essayText: this.get(sec, 'essay_text', '...'),
        image: this.get('IMAGES', `collectible_${k.toLowerCase()}`, ''),
      };
    }).filter(c => c.enabled);

    // Skills
    cfg.skills = [];
    for (let i = 1; i <= 4; i++) {
      const sec = `SKILL_${i}`;
      cfg.skills.push({
        id: i,
        name: this.get(sec, 'name', `Skill ${i}`),
        unlockLevel: this.get(sec, 'unlock_level', i + 1),
        effectDescription: this.get(sec, 'effect_description', ''),
        learnText: this.get(sec, 'learn_text', ''),
        effectType: this.get(sec, 'effect_type', ''),
        effectValue: this.get(sec, 'effect_value', 1),
        absorbRadius: this.get(sec, 'absorb_radius', 2.0),
      });
    }

    // Grading
    cfg.grading = {
      integrityWeight: this.get('GRADING', 'integrity_weight', 0.6),
      collectibleScoreCap: this.get('GRADING', 'collectible_score_cap', 40),
      thresholds: {
        A: this.get('GRADING', 'grade_a_threshold', 80),
        B: this.get('GRADING', 'grade_b_threshold', 65),
        C: this.get('GRADING', 'grade_c_threshold', 50),
        D: this.get('GRADING', 'grade_d_threshold', 35),
      },
      lowGradeThreshold: this.get('GRADING', 'low_grade_threshold', 55),
    };

    // Images
    cfg.images = this.section('IMAGES');

    return cfg;
  }
};
