// Tech Hangman Novel Extensions
// Loaded after /script.js. Intentionally written as an additive layer.

(function () {
  if (window.__TECH_HANGMAN_NOVEL__) return;
  window.__TECH_HANGMAN_NOVEL__ = true;

  // -----------------------------
  // Settings
  // -----------------------------
  const SETTINGS = {
    traceEnabled: localStorage.getItem('hangman_trace') !== 'false',
    visualMode: localStorage.getItem('hangman_visual') || 'network', // 'network' | 'hangman'
    maxModules: 2,
  };

  // Legacy function refs (populated when we wrap)
  let legacyInitGameRef = null;

  // -----------------------------
  // SFX Extensions (Escape / Death)
  // -----------------------------
  function soundEnabled() {
    try {
      return typeof isSoundEnabled === 'undefined' ? true : !!isSoundEnabled;
    } catch {
      return true;
    }
  }

  function playExtendedSfx(kind) {
    if (!soundEnabled()) return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    function env(gain, t0, t1, peak) {
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    }

    if (kind === 'escape') {
      const o1 = ctx.createOscillator();
      const o2 = ctx.createOscillator();
      const g = ctx.createGain();
      o1.type = 'triangle';
      o2.type = 'sine';

      o1.frequency.setValueAtTime(420, now);
      o1.frequency.exponentialRampToValueAtTime(980, now + 0.55);

      o2.frequency.setValueAtTime(140, now);
      o2.frequency.exponentialRampToValueAtTime(560, now + 0.55);

      o1.connect(g);
      o2.connect(g);
      g.connect(ctx.destination);
      env(g, now, now + 0.65, 0.08);

      o1.start(now);
      o2.start(now);
      o1.stop(now + 0.7);
      o2.stop(now + 0.7);

      setTimeout(() => {
        try { ctx.close(); } catch {}
      }, 900);
      return;
    }

    if (kind === 'death') {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, now);
      o.frequency.exponentialRampToValueAtTime(48, now + 0.55);
      o.connect(g);
      g.connect(ctx.destination);
      env(g, now, now + 0.65, 0.09);
      o.start(now);
      o.stop(now + 0.7);

      setTimeout(() => {
        try { ctx.close(); } catch {}
      }, 900);
      return;
    }

    try { ctx.close(); } catch {}
  }

  if (typeof playSfx === 'function' && !playSfx.__novel_extended__) {
    const legacyPlaySfx = playSfx;
    const wrapped = function (type) {
      if (type === 'escape' || type === 'death') {
        try { playExtendedSfx(type); } catch {}
        return;
      }
      return legacyPlaySfx(type);
    };
    wrapped.__novel_extended__ = true;
    playSfx = wrapped;
  }

  // -----------------------------
  // DOM
  // -----------------------------
  const tracePanel = document.getElementById('trace-panel');
  const traceBarFill = document.getElementById('trace-bar-fill');
  const tracePercentEl = document.getElementById('trace-percent');
  const traceCountEl = document.getElementById('trace-count');
  const lockdownRow = document.getElementById('lockdown-row');

  const intrusionSvg = document.getElementById('intrusion-svg');
  const hangmanSvg = document.querySelector('.hangman-svg');

  const cyberdeckBar = document.getElementById('cyberdeck-bar');
  const moduleVowelScanBtn = document.getElementById('module-vowel-scan');
  const moduleRollbackBtn = document.getElementById('module-rollback');
  const moduleRerouteBtn = document.getElementById('module-reroute');

  const cyberdeckPopup = document.getElementById('cyberdeck-popup');
  const cyberdeckModulesEl = document.getElementById('cyberdeck-modules');
  const openCyberdeckBtn = document.getElementById('open-cyberdeck-btn');
  const saveCyberdeckBtn = document.getElementById('save-cyberdeck-btn');
  const closeCyberdeckBtn = document.getElementById('close-cyberdeck-btn');

  // Selection tools (wired later for Mission/Districts)
  const openMissionBtn = document.getElementById('open-mission-btn');
  const openDistrictsBtn = document.getElementById('open-districts-btn');

  // Action bar buttons (wired later)
  const missionCodeBtn = document.getElementById('mission-code-btn');
  const districtsBtn = document.getElementById('districts-btn');


  // Mode buttons / grids (Codebreaker adds a 4th mode)
  const modeClassicBtn = document.getElementById('mode-classic');
  const modeStoryBtn = document.getElementById('mode-story');
  const modeMultiplayerBtn = document.getElementById('mode-multiplayer');
  const modeCodebreakerBtn = document.getElementById('mode-codebreaker');

  const classicGrid = document.getElementById('classic-categories');
  const storyGrid = document.getElementById('story-levels');
  const multiplayerGrid = document.getElementById('multiplayer-options');
  const codebreakerGrid = document.getElementById('codebreaker-categories');

  const codebreakerPanel = document.getElementById('codebreaker-panel');
  const codebreakerSnippet = document.getElementById('codebreaker-snippet');
  const codebreakerChoices = document.getElementById('codebreaker-choices');
  const codebreakerExplain = document.getElementById('codebreaker-explain');
  const codebreakerStepEl = document.getElementById('codebreaker-step');

  function setModeActive(btn) {
    [modeClassicBtn, modeStoryBtn, modeMultiplayerBtn, modeCodebreakerBtn].forEach((b) => {
      if (!b) return;
      b.classList.toggle('active', b === btn);
    });
  }

  function hideAllModeGrids() {
    [classicGrid, storyGrid, multiplayerGrid, codebreakerGrid].forEach((g) => {
      if (g) g.classList.add('hidden');
    });
  }

  // Codebreaker mode click (legacy mode selector doesn't know about this mode).
  if (modeCodebreakerBtn) {
    modeCodebreakerBtn.addEventListener('click', () => {
      currentMode = 'codebreaker';
      setModeActive(modeCodebreakerBtn);
      hideAllModeGrids();
      if (codebreakerGrid) codebreakerGrid.classList.remove('hidden');
      if (typeof playSfx === 'function') playSfx('click');
    });
  }

  // When switching away from Codebreaker via legacy buttons, ensure our grid is hidden.
  [modeClassicBtn, modeStoryBtn, modeMultiplayerBtn].forEach((btn) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (modeCodebreakerBtn) modeCodebreakerBtn.classList.remove('active');
      if (codebreakerGrid) codebreakerGrid.classList.add('hidden');
      if (codebreakerPanel) codebreakerPanel.classList.add('hidden');
    });
  });

  // -----------------------------
  // Defensive DOM: Hint display area (legacy script references these IDs)
  // -----------------------------
  try {
    const clueContainer = document.querySelector('.clue-container');
    if (clueContainer && !document.getElementById('hint-display-area')) {
      const hintArea = document.createElement('div');
      hintArea.id = 'hint-display-area';
      hintArea.className = 'hidden';

      const hintText = document.createElement('p');
      hintText.id = 'clue-display-v2';
      hintText.className = 'neon-text';
      hintText.style.marginTop = '12px';
      hintText.style.fontSize = '0.95rem';
      hintText.style.color = '#fff';
      hintText.style.textTransform = 'uppercase';
      hintArea.appendChild(hintText);

      clueContainer.appendChild(hintArea);
    }
  } catch {
    // Non-fatal
  }

  // -----------------------------
  // TRACE/ICE Helpers
  // -----------------------------
  let lockdownState = { shuffle: false, vowels: false, hints: false };

  // Each entry corresponds to 1 unit of wrongGuesses.
  // { kind: 'guess', letter: 'A' } or { kind: 'module', id: 'vowel_scan' }
  let penaltyStack = [];

  // Mission (seeded run) state
  let activeMission = null;
  let missionRoundIndex = 0;
  let missionWins = 0;
  let missionStartMs = 0;
  let missionCompleted = false;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function hash32(str) {
    // FNV-1a-ish
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function seededShuffle(arr, seed) {
    // Fisher-Yates with xorshift32
    let x = (seed >>> 0) || 1;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      const j = (x >>> 0) % (i + 1);
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function getThresholds() {
    const max = Math.max(1, MAX_MISTAKES || 1);
    const shuffleAt = Math.max(2, Math.floor(max * 0.25));
    const vowelsAt = Math.max(shuffleAt + 1, Math.floor(max * 0.5));
    const hintsAt = Math.max(vowelsAt + 1, Math.floor(max * 0.75));
    return { shuffleAt, vowelsAt, hintsAt };
  }

  function syncLockdownUI() {
    if (!lockdownRow) return;
    function setActive(key, active) {
      const el = lockdownRow.querySelector('[data-lock="' + key + '"]');
      if (!el) return;
      el.classList.toggle('active', !!active);
    }

    setActive('shuffle', lockdownState.shuffle);
    setActive('vowels', lockdownState.vowels);
    setActive('hints', lockdownState.hints);
  }

  function recomputeLockdowns() {
    if (!SETTINGS.traceEnabled) {
      lockdownState = { shuffle: false, vowels: false, hints: false };
      syncLockdownUI();
      return;
    }

    const t = getThresholds();
    lockdownState.shuffle = wrongGuesses >= t.shuffleAt;
    lockdownState.vowels = wrongGuesses >= t.vowelsAt;
    lockdownState.hints = wrongGuesses >= t.hintsAt;
    syncLockdownUI();

    // Reflect hint cost in button text (if present)
    if (typeof hintRevealLetter !== 'undefined' && hintRevealLetter) {
      const cost = lockdownState.hints ? 100 : 50;
      hintRevealLetter.innerText = 'REVEAL LETTER (-' + cost + ' XP)';
    }
  }

  function setDiagramVisibility() {
    if (!hangmanSvg || !intrusionSvg) return;

    if (SETTINGS.visualMode === 'hangman') {
      hangmanSvg.classList.remove('hidden');
      intrusionSvg.classList.add('hidden');
    } else {
      hangmanSvg.classList.add('hidden');
      intrusionSvg.classList.remove('hidden');
    }
  }

  function clearNetParts() {
    const els = document.querySelectorAll('.net-part');
    els.forEach((el) => el.classList.remove('drawn'));
  }

  function drawNetParts(indices) {
    if (!indices || indices.length === 0) return;

    indices.forEach((idx) => {
      const el = document.querySelector('.net-part-' + String(idx));
      if (el) el.classList.add('drawn');
    });
  }

  function rebuildPenaltyVisuals() {
    // Reset both visuals; only one is shown, but keeping both consistent avoids edge bugs.
    if (typeof hangmanParts !== 'undefined' && hangmanParts) {
      hangmanParts.forEach((p) => p.classList.remove('drawn'));
    }
    clearNetParts();

    const mapping = MISTAKE_MAPPINGS && selectedDifficulty ? MISTAKE_MAPPINGS[selectedDifficulty] : null;
    if (!mapping) return;

    for (let i = 0; i < penaltyStack.length; i++) {
      const parts = mapping[i];
      if (!parts) continue;

      // Hangman
      parts.forEach((partIdx) => {
        const partEl = document.querySelector('.part-' + String(partIdx));
        if (partEl) partEl.classList.add('drawn');
      });

      // Network
      drawNetParts(parts);
    }
  }

  function updateTraceUI() {
    if (!SETTINGS.traceEnabled || !tracePanel) return;

    tracePanel.classList.remove('hidden');

    const max = Math.max(1, MAX_MISTAKES || 1);
    const pct = clamp(Math.round((wrongGuesses / max) * 100), 0, 100);

    if (traceBarFill) traceBarFill.style.width = String(pct) + '%';
    if (tracePercentEl) tracePercentEl.innerText = String(pct) + '%';
    if (traceCountEl) traceCountEl.innerText = String(wrongGuesses) + ' / ' + String(max);
  }

  // -----------------------------
  // Mission-seeded word fetch (uses Next /api/word with seed params)
  // -----------------------------
  async function runLegacyInitSeeded(legacyInitGame) {
    if (!activeMission || !activeMission.seed) return legacyInitGame();

    const originalFetch = window.fetch.bind(window);
    const roundIndex = missionRoundIndex;
    missionRoundIndex += 1;

    window.fetch = async function (input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';

        // Intercept legacy word fetch only
        if (url && url.startsWith(API_URL + '/word') && url.indexOf('seed=') === -1) {
          const params = new URLSearchParams();
          params.set('seed', String(activeMission.seed));
          params.set('i', String(roundIndex));
          params.set('category', String(activeMission.category || selectedCategory || ''));
          params.set('difficulty', String(activeMission.difficulty || selectedDifficulty || ''));
          return originalFetch(API_URL + '/word?' + params.toString());
        }
      } catch {
        // Non-fatal
      }
      return originalFetch(input, init);
    };

    try {
      return await legacyInitGame();
    } finally {
      window.fetch = originalFetch;
    }
  }

  // -----------------------------
  // Hint Override (dynamic XP cost under lockdown)
  // -----------------------------
  // Legacy attaches a click handler already; we intercept in capture-phase.
  if (typeof hintRevealLetter !== 'undefined' && hintRevealLetter) {
    hintRevealLetter.addEventListener(
      'click',
      async (e) => {
        if (!lockdownState.hints) return; // let legacy run normally

        e.preventDefault();
        e.stopImmediatePropagation();

        const cost = 100;
        if (isGameOver || currentMode === 'codebreaker') return;

        if (currentXp < cost) {
          if (typeof showToast === 'function') {
            showToast('INSUFFICIENT EXP', 'Need ' + cost + ' EXP for this trace-locked action.', '#ff3333');
          }
          return;
        }

        const unGuessed = currentWord
          .split('')
          .filter((l) => !guessedLetters.includes(l));

        if (unGuessed.length === 0) return;

        const randLetter = unGuessed[Math.floor(Math.random() * unGuessed.length)];
        handleGuess(randLetter);

        try {
          await fetch(API_URL + '/hints', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId, type: 'letter', word: currentWord }),
          });
        } catch {
          // Non-fatal
        }

        currentXp -= cost;
        if (typeof currentXpSpan !== 'undefined' && currentXpSpan) {
          currentXpSpan.innerText = 'EXP: ' + String(currentXp);
        }
      },
      true
    );
  }

  // -----------------------------
  // CODEBREAKER
  // -----------------------------

  const CODEBREAKER_PUZZLES = [
    {
      id: 'db_join',
      category: 'DATABASE',
      difficulty: 'EASY',
      title: 'RELATIONAL LINK',
      snippet: 'SELECT u.name, o.total\nFROM users u {{TOKEN}} orders o ON o.user_id = u.id\nWHERE o.total > 100;',
      answer: 'JOIN',
      choices: ['JOIN', 'UNION', 'ORDER', 'GROUP'],
      explain: 'JOIN merges rows across related tables.'
    },
    {
      id: 'db_index',
      category: 'DATABASE',
      difficulty: 'MEDIUM',
      title: 'QUERY ACCELERATOR',
      snippet: 'CREATE {{TOKEN}} idx_users_email ON users(email);',
      answer: 'INDEX',
      choices: ['INDEX', 'TRIGGER', 'VIEW', 'SCHEMA'],
      explain: 'Indexes speed up lookups by providing an efficient access path.'
    },
    {
      id: 'linux_kernel',
      category: 'LINUX',
      difficulty: 'EASY',
      title: 'RING ZERO',
      snippet: 'The {{TOKEN}} is responsible for process scheduling, memory management, and drivers.',
      answer: 'KERNEL',
      choices: ['KERNEL', 'SHELL', 'PACKAGE', 'DAEMON'],
      explain: 'The kernel is the OS core that mediates hardware and processes.'
    },
    {
      id: 'linux_grep',
      category: 'LINUX',
      difficulty: 'EASY',
      title: 'SIGNAL HUNTER',
      snippet: 'cat app.log | {{TOKEN}} -i error',
      answer: 'GREP',
      choices: ['GREP', 'TAR', 'SSH', 'PING'],
      explain: 'grep filters lines that match a pattern.'
    },
    {
      id: 'net_router',
      category: 'NETWORKING',
      difficulty: 'EASY',
      title: 'PACKET FORWARDER',
      snippet: 'A {{TOKEN}} forwards packets between networks based on routing tables.',
      answer: 'ROUTER',
      choices: ['ROUTER', 'SWITCH', 'MODEM', 'FIREWALL'],
      explain: 'Routers operate at Layer 3 and choose paths between networks.'
    },
    {
      id: 'net_tcp',
      category: 'NETWORKING',
      difficulty: 'MEDIUM',
      title: 'RELIABLE STREAM',
      snippet: '{{TOKEN}} provides ordered, reliable, error-checked delivery of bytes.',
      answer: 'TCP',
      choices: ['TCP', 'UDP', 'ICMP', 'ARP'],
      explain: 'TCP is connection-oriented and ensures delivery and ordering.'
    },
    {
      id: 'web_cors',
      category: 'WEBDEVELOPMENT',
      difficulty: 'MEDIUM',
      title: 'BROWSER GATEKEEPER',
      snippet: '{{TOKEN}} controls cross-origin requests enforced by browsers.',
      answer: 'CORS',
      choices: ['CORS', 'CSR', 'CDN', 'SSR'],
      explain: 'CORS is a browser security mechanism for cross-origin access.'
    },
    {
      id: 'web_jwt',
      category: 'WEBDEVELOPMENT',
      difficulty: 'EASY',
      title: 'SIGNED PASSPORT',
      snippet: 'A {{TOKEN}} is a compact, signed token used for stateless authentication.',
      answer: 'JWT',
      choices: ['JWT', 'CSRF', 'CORS', 'DOM'],
      explain: 'JWTs can be verified by signature and carry claims without server-side session state.'
    },
    {
      id: 'cloud_docker',
      category: 'CLOUD',
      difficulty: 'EASY',
      title: 'CONTAINMENT UNIT',
      snippet: '{{TOKEN}} packages applications and dependencies into portable containers.',
      answer: 'DOCKER',
      choices: ['DOCKER', 'VAGRANT', 'ANSIBLE', 'JENKINS'],
      explain: 'Docker uses containerization to run apps consistently across environments.'
    },
    {
      id: 'cloud_k8s',
      category: 'CLOUD',
      difficulty: 'HARD',
      title: 'ORCHESTRATOR',
      snippet: '{{TOKEN}} manages container scheduling, scaling, and service discovery.',
      answer: 'KUBERNETES',
      choices: ['KUBERNETES', 'KAFKA', 'ELASTICSEARCH', 'MONGODB'],
      explain: 'Kubernetes orchestrates containers across a cluster.'
    }
  ];

  let activeCodebreaker = null;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function setCodebreakerUI(enabled) {
    if (codebreakerPanel) codebreakerPanel.classList.toggle('hidden', !enabled);
    // Keyboard must stay hidden in Codebreaker; regular modes should show it.
    if (keyboardDiv) keyboardDiv.classList.toggle('hidden', !!enabled);

    // Disable letter-hints in Codebreaker (not a letter game).
    if (enabled) {
      if (typeof hintRevealCat !== 'undefined' && hintRevealCat) {
        hintRevealCat.disabled = true;
        hintRevealCat.classList.add('disabled');
      }
      if (typeof hintRevealLetter !== 'undefined' && hintRevealLetter) {
        hintRevealLetter.disabled = true;
        hintRevealLetter.classList.add('disabled');
      }
    } else {
      if (typeof hintRevealCat !== 'undefined' && hintRevealCat) {
        hintRevealCat.disabled = false;
        hintRevealCat.classList.remove('disabled');
      }
      if (typeof hintRevealLetter !== 'undefined' && hintRevealLetter) {
        hintRevealLetter.disabled = false;
        hintRevealLetter.classList.remove('disabled');
      }
    }
  }

  function pickCodebreakerPuzzle() {
    const diff = (selectedDifficulty || 'MEDIUM').toUpperCase();
    const cat = (selectedCategory || 'RANDOM').toUpperCase();

    let pool = CODEBREAKER_PUZZLES.filter((p) => p.difficulty === diff);
    if (cat !== 'RANDOM') pool = pool.filter((p) => p.category === cat);

    if (pool.length === 0) {
      // Fallback: any diff/category
      pool = CODEBREAKER_PUZZLES.slice();
    }

    if (activeMission && activeMission.seed) {
      const seed = hash32(String(activeMission.seed) + '|' + diff + '|' + cat + '|' + String(missionRoundIndex));
      return pool[seed % pool.length];
    }

    return pool[Math.floor(Math.random() * pool.length)];
  }

  function renderCodebreakerPuzzle() {
    if (!activeCodebreaker || !codebreakerSnippet || !codebreakerChoices) return;

    const p = activeCodebreaker;
    const filled = !!p.solved;

    const snippetHtml = escapeHtml(p.snippet).replace(
      /{{TOKEN}}/g,
      filled
        ? '<span class="cb-blank">' + escapeHtml(p.answer) + '</span>'
        : '<span class="cb-blank">[____]</span>'
    );

    codebreakerSnippet.innerHTML = snippetHtml;

    if (codebreakerExplain) {
      codebreakerExplain.classList.toggle('hidden', !filled);
      codebreakerExplain.innerText = filled ? p.explain : '';
    }

    if (codebreakerStepEl) {
      codebreakerStepEl.innerText = filled ? 'COMPLETE' : '1 / 1';
    }

    // Choices
    codebreakerChoices.innerHTML = '';

    let choices = p.choices.slice();
    if (lockdownState.shuffle) {
      const seed = hash32(p.id + '|' + String(wrongGuesses));
      choices = seededShuffle(choices, seed);
    }

    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'cb-choice';
      btn.innerText = choice;

      if (filled) {
        btn.classList.add('disabled');
        btn.disabled = true;
      }

      btn.addEventListener('click', () => {
        if (isGameOver || !activeCodebreaker || activeCodebreaker.solved) return;

        const correct = choice.toUpperCase() === p.answer.toUpperCase();
        if (correct) {
          btn.classList.add('correct');
          activeCodebreaker.solved = true;

          // Mark as 'won' using the legacy win cinematic
          currentWord = p.answer.toUpperCase();
          guessedLetters = Array.from(new Set(currentWord.split('')));

          // Small score reward (legacy checkWin adds its own bonus)
          currentScore += 250;
          if (typeof updateScoreUI === 'function') updateScoreUI();
          if (typeof playSfx === 'function') playSfx('correct');

          renderCodebreakerPuzzle();

          setTimeout(() => {
            if (typeof checkWin === 'function') checkWin();
          }, 500);
          return;
        }

        // Wrong
        btn.classList.add('wrong', 'disabled');
        btn.disabled = true;
        currentScore = Math.max(0, currentScore - 75);
        if (typeof updateScoreUI === 'function') updateScoreUI();
        if (typeof playSfx === 'function') playSfx('wrong');

        // Apply TRACE hit
        applyTraceHit('codebreaker_wrong', 1);

        // Under ICE, refresh ordering to keep pressure.
        renderCodebreakerPuzzle();
      });

      codebreakerChoices.appendChild(btn);
    });
  }

  async function startCodebreakerRound() {
    // Reset core state for a round
    guessedLetters = [];
    wrongGuesses = 0;
    isGameOver = false;
    hintsUsed = 0;
    gameStartTime = Date.now();

    penaltyStack = [];

    // Reset DOM (subset of legacy initGame)
    if (typeof gameContainer !== 'undefined' && gameContainer) {
      gameContainer.classList.remove('win-state', 'loss-state', 'game-loss', 'game-container-shake', 'trace-loss');
    }
    if (typeof redOverlay !== 'undefined' && redOverlay) redOverlay.classList.remove('active');
    if (typeof popup !== 'undefined' && popup) popup.classList.remove('show', 'popup-win', 'popup-loss');

    // Clear visuals
    if (typeof hangmanParts !== 'undefined' && hangmanParts) {
      hangmanParts.forEach((part) => part.classList.remove('drawn', 'detach-head', 'detach-body'));
    }
    clearNetParts();

    setCodebreakerUI(true);
    setDiagramVisibility();

    activeCodebreaker = pickCodebreakerPuzzle();
    if (activeMission) missionRoundIndex += 1;
    activeCodebreaker = Object.assign({}, activeCodebreaker, { solved: false });

    // Wire into legacy score/progress plumbing
    currentWord = activeCodebreaker.answer.toUpperCase();
    currentWordData = {
      word: currentWord,
      clue: activeCodebreaker.title,
      category: selectedCategory || activeCodebreaker.category,
      description: activeCodebreaker.explain
    };

    if (typeof clueText !== 'undefined' && clueText) {
      clueText.innerText = activeCodebreaker.title;
    }

    renderCodebreakerPuzzle();
    updateTraceUI();
    recomputeLockdowns();
  }

  // -----------------------------
  // Cyberdeck
  // -----------------------------
  const CYBERDECK_MODULES = [
    {
      id: 'vowel_scan',
      name: 'VOWEL SCAN',
      desc: 'Reveal a random vowel in the target word. +1 TRACE, -150 SCORE.',
      kind: 'active',
      uses: 1,
    },
    {
      id: 'rollback',
      name: 'ROLLBACK',
      desc: 'Undo your last wrong guess. Costs -250 SCORE. (Does not undo module TRACE.)',
      kind: 'active',
      uses: 1,
    },
    {
      id: 'reroute',
      name: 'REROUTE',
      desc: 'Abort current target and fetch a new one. -200 SCORE, +1 TRACE.',
      kind: 'active',
      uses: 1,
    },
  ];

  function loadCyberdeck() {
    try {
      const raw = localStorage.getItem('hangman_cyberdeck');
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveCyberdeck(ids) {
    localStorage.setItem('hangman_cyberdeck', JSON.stringify(ids));
  }

  let selectedModules = loadCyberdeck();
  let moduleUses = {};

  function resetModuleUses() {
    moduleUses = {};
    CYBERDECK_MODULES.forEach((m) => {
      moduleUses[m.id] = m.uses;
    });
  }

  function moduleEnabled(id) {
    return selectedModules.includes(id) && (moduleUses[id] || 0) > 0;
  }

  function syncCyberdeckBar() {
    if (!cyberdeckBar) return;

    const any = selectedModules.length > 0 && currentMode !== 'codebreaker';
    cyberdeckBar.classList.toggle('hidden', !any);

    function syncBtn(btn, id) {
      if (!btn) return;
      const inLoadout = selectedModules.includes(id);
      btn.style.display = inLoadout ? '' : 'none';
      btn.disabled = !moduleEnabled(id) || isGameOver || currentMode === 'codebreaker';
    }

    syncBtn(moduleVowelScanBtn, 'vowel_scan');
    syncBtn(moduleRollbackBtn, 'rollback');
    syncBtn(moduleRerouteBtn, 'reroute');
  }

  function openCyberdeck() {
    if (!cyberdeckPopup || !cyberdeckModulesEl) return;

    cyberdeckModulesEl.innerHTML = '';

    const max = SETTINGS.maxModules;

    CYBERDECK_MODULES.forEach((mod) => {
      const card = document.createElement('div');
      card.className = 'module-card' + (selectedModules.includes(mod.id) ? ' selected' : '');

      card.innerHTML =
        '<div class="module-name">' +
        mod.name +
        '</div>' +
        '<div class="module-desc">' +
        mod.desc +
        '</div>' +
        '<div class="module-meta">' +
        '<span class="module-chip">' +
        mod.kind.toUpperCase() +
        '</span>' +
        '<span class="module-chip">USES: ' +
        String(mod.uses) +
        '</span>' +
        '<span class="module-chip">' +
        (selectedModules.includes(mod.id) ? 'EQUIPPED' : 'AVAILABLE') +
        '</span>' +
        '</div>';

      card.addEventListener('click', () => {
        const idx = selectedModules.indexOf(mod.id);
        if (idx >= 0) {
          selectedModules.splice(idx, 1);
          card.classList.remove('selected');
          if (typeof playSfx === 'function') playSfx('click');
          return;
        }

        if (selectedModules.length >= max) {
          if (typeof showToast === 'function') {
            showToast('CYBERDECK FULL', 'You can equip only ' + max + ' modules.', '#ff3333');
          }
          return;
        }

        selectedModules.push(mod.id);
        card.classList.add('selected');
        if (typeof playSfx === 'function') playSfx('click');
      });

      cyberdeckModulesEl.appendChild(card);
    });

    cyberdeckPopup.classList.remove('hidden');
  }

  function closeCyberdeck() {
    if (!cyberdeckPopup) return;
    cyberdeckPopup.classList.add('hidden');
  }

  if (openCyberdeckBtn) {
    openCyberdeckBtn.addEventListener('click', () => {
      openCyberdeck();
      if (typeof playSfx === 'function') playSfx('click');
    });
  }

  if (closeCyberdeckBtn) {
    closeCyberdeckBtn.addEventListener('click', () => {
      closeCyberdeck();
      if (typeof playSfx === 'function') playSfx('click');
    });
  }

  if (saveCyberdeckBtn) {
    saveCyberdeckBtn.addEventListener('click', () => {
      saveCyberdeck(selectedModules);
      closeCyberdeck();
      if (typeof showToast === 'function') {
        showToast('CYBERDECK SAVED', String(selectedModules.length) + ' module(s) equipped.', '#00ffcc');
      }
      if (typeof playSfx === 'function') playSfx('click');
      syncCyberdeckBar();
    });
  }

  // -----------------------------
  // Synthetic TRACE Hit (for modules)
  // -----------------------------
  function applyTraceHit(sourceId, count) {
    const c = typeof count === 'number' ? count : 1;
    const mapping = MISTAKE_MAPPINGS && selectedDifficulty ? MISTAKE_MAPPINGS[selectedDifficulty] : null;
    if (!mapping) return;

    for (let i = 0; i < c; i++) {
      if (wrongGuesses >= MAX_MISTAKES) break;

      const parts = mapping[wrongGuesses];
      if (parts) {
        // Hangman
        parts.forEach((partIdx) => {
          const partEl = document.querySelector('.part-' + String(partIdx));
          if (partEl) partEl.classList.add('drawn');
        });
        // Network
        drawNetParts(parts);
      }

      wrongGuesses++;
      penaltyStack.push({ kind: 'module', id: sourceId });
    }

    updateTraceUI();
    recomputeLockdowns();
    if (typeof checkLoss === 'function') checkLoss();
  }

  function removeLastWrongGuessPenalty() {
    for (let i = penaltyStack.length - 1; i >= 0; i--) {
      const p = penaltyStack[i];
      if (p && p.kind === 'guess' && p.letter) {
        const letter = p.letter;

        penaltyStack.splice(i, 1);
        wrongGuesses = penaltyStack.length;

        const idx = guessedLetters.indexOf(letter);
        if (idx >= 0) guessedLetters.splice(idx, 1);

        rebuildPenaltyVisuals();
        if (typeof renderWord === 'function') renderWord();
        if (typeof renderKeyboard === 'function') renderKeyboard();
        updateTraceUI();
        recomputeLockdowns();
        return true;
      }
    }
    return false;
  }

  // -----------------------------
  // Reroute helper (preserve TRACE across target changes)
  // -----------------------------
  async function reroutePreservingTrace() {
    if (!legacyInitGameRef) {
      // Fallback: best-effort
      if (typeof initGame === 'function') initGame();
      return;
    }

    const preservedWrong = wrongGuesses;
    const preservedStack = penaltyStack.slice();

    clearNetParts();
    setDiagramVisibility();

    await legacyInitGameRef();

    wrongGuesses = preservedWrong;
    penaltyStack = preservedStack;

    rebuildPenaltyVisuals();
    updateTraceUI();
    recomputeLockdowns();
    if (typeof renderKeyboard === 'function') renderKeyboard();
    syncCyberdeckBar();
  }

  // -----------------------------
  // Module actions
  // -----------------------------
  if (moduleVowelScanBtn) {
    moduleVowelScanBtn.addEventListener('click', () => {
      if (!moduleEnabled('vowel_scan') || isGameOver || currentMode === 'codebreaker') return;

      const vowels = ['A', 'E', 'I', 'O', 'U'];
      const available = vowels.filter((v) => currentWord.includes(v) && !guessedLetters.includes(v));

      if (available.length === 0) {
        if (typeof showToast === 'function') {
          showToast('VOWEL SCAN', 'No vowels left to reveal.', '#0088ff');
        }
        moduleUses['vowel_scan'] = 0;
        syncCyberdeckBar();
        return;
      }

      const pick = available[Math.floor(Math.random() * available.length)];
      moduleUses['vowel_scan'] = Math.max(0, (moduleUses['vowel_scan'] || 0) - 1);

      currentScore = Math.max(0, currentScore - 150);
      if (typeof updateScoreUI === 'function') updateScoreUI();

      applyTraceHit('vowel_scan', 1);

      if (isGameOver) {
        syncCyberdeckBar();
        return;
      }

      handleGuess(pick);

      if (typeof showToast === 'function') {
        showToast('VOWEL SCAN', 'Injected vowel ' + pick + '. TRACE increased.', '#0088ff');
      }
      if (typeof playSfx === 'function') playSfx('click');
      syncCyberdeckBar();
    });
  }

  if (moduleRollbackBtn) {
    moduleRollbackBtn.addEventListener('click', () => {
      if (!moduleEnabled('rollback') || isGameOver || currentMode === 'codebreaker') return;

      moduleUses['rollback'] = Math.max(0, (moduleUses['rollback'] || 0) - 1);

      const ok = removeLastWrongGuessPenalty();
      currentScore = Math.max(0, currentScore - 250);
      if (typeof updateScoreUI === 'function') updateScoreUI();

      if (typeof showToast === 'function') {
        showToast('ROLLBACK', ok ? 'Last wrong guess reverted.' : 'No wrong guess to rollback.', '#ff00ff');
      }
      if (typeof playSfx === 'function') playSfx('click');
      syncCyberdeckBar();
    });
  }

  if (moduleRerouteBtn) {
    moduleRerouteBtn.addEventListener('click', async () => {
      if (!moduleEnabled('reroute') || isGameOver || currentMode === 'codebreaker') return;

      moduleUses['reroute'] = Math.max(0, (moduleUses['reroute'] || 0) - 1);

      currentScore = Math.max(0, currentScore - 200);
      if (typeof updateScoreUI === 'function') updateScoreUI();

      if (typeof showToast === 'function') {
        showToast('REROUTE', 'Target aborted. Rerouting to a new system. TRACE increased.', '#ff00ff');
      }
      if (typeof playSfx === 'function') playSfx('click');

      applyTraceHit('reroute', 1);
      if (isGameOver) {
        syncCyberdeckBar();
        return;
      }
      await reroutePreservingTrace();
    });
  }

  // -----------------------------
  // Wrap legacy functions
  // -----------------------------
  if (typeof initGame === 'function') {
    const legacyInitGame = initGame;
    legacyInitGameRef = legacyInitGame;
    initGame = async function () {
      penaltyStack = [];
      resetModuleUses();

      if (typeof gameContainer !== 'undefined' && gameContainer) {
        gameContainer.classList.remove('trace-loss');
      }

      clearNetParts();
      setDiagramVisibility();

      if (currentMode === 'codebreaker') {
        await startCodebreakerRound();
        syncCyberdeckBar();
        return;
      }

      // Ensure Codebreaker UI is hidden in letter modes
      setCodebreakerUI(false);

      const res = activeMission ? await runLegacyInitSeeded(legacyInitGame) : await legacyInitGame();
      updateTraceUI();
      recomputeLockdowns();
      syncCyberdeckBar();
      return res;
    };
  }

  if (typeof handleGuess === 'function') {
    const legacyHandleGuess = handleGuess;
    handleGuess = function (letter) {
      if (currentMode === 'codebreaker') return;

      const beforeWrong = wrongGuesses;
      legacyHandleGuess(letter);

      if (wrongGuesses > beforeWrong) {
        penaltyStack.push({ kind: 'guess', letter: letter });
        const mapping = MISTAKE_MAPPINGS && selectedDifficulty ? MISTAKE_MAPPINGS[selectedDifficulty] : null;
        const parts = mapping ? mapping[beforeWrong] : null;
        if (parts) drawNetParts(parts);
      }

      updateTraceUI();
      recomputeLockdowns();
      syncCyberdeckBar();
    };
  }

  if (typeof renderKeyboard === 'function') {
    const legacyRenderKeyboard = renderKeyboard;
    renderKeyboard = function () {
      if (!keyboardDiv) return;

      if (currentMode === 'codebreaker') {
        keyboardDiv.classList.add('hidden');
        return;
      }

      keyboardDiv.classList.remove('hidden');
      keyboardDiv.innerHTML = '';

      let layout = 'QWERTYUIOPASDFGHJKLZXCVBNM'.split('');
      if (lockdownState.shuffle) {
        const seed = hash32((currentWord || '') + '|' + String(wrongGuesses) + '|' + String(MAX_MISTAKES));
        layout = seededShuffle(layout, seed);
      }

      layout.forEach((letter) => {
        const btn = document.createElement('button');
        btn.className = 'key';
        btn.innerText = letter;
        btn.id = 'key-' + letter;

        const guessed = guessedLetters.includes(letter);
        if (guessed) {
          if (currentWord.includes(letter)) btn.classList.add('correct', 'disabled');
          else btn.classList.add('wrong', 'disabled');
        }

        const isVowel = 'AEIOU'.includes(letter);
        if (!guessed && lockdownState.vowels && isVowel) {
          btn.classList.add('disabled');
          btn.disabled = true;
          btn.title = 'VOWELS LOCKED BY ICE';
        }

        btn.addEventListener('click', () => handleGuess(letter));
        keyboardDiv.appendChild(btn);
      });

      if (!SETTINGS.traceEnabled) legacyRenderKeyboard();
    };
  }

  if (typeof checkLoss === 'function') {
    const legacyCheckLoss = checkLoss;
    checkLoss = function () {
      // Codebreaker shares the same TRACE failure state; run legacy loss then apply overlays.

      const wasOver = isGameOver;
      legacyCheckLoss();

      if (!wasOver && isGameOver && wrongGuesses >= MAX_MISTAKES) {
        if (typeof gameContainer !== 'undefined' && gameContainer) {
          gameContainer.classList.add('trace-loss');
        }

        if (typeof popupMessage !== 'undefined' && popupMessage) {
          setTimeout(() => {
            popupMessage.innerText = 'TRACE COMPLETE. AGENT COMPROMISED. REDEPLOY AND TRY AGAIN.';
          }, 1550);
        }

        if (typeof nextBtn !== 'undefined' && nextBtn) {
          setTimeout(() => {
            nextBtn.innerText = 'REDEPLOY';
          }, 1550);
        }

        // Mission runs end on first failure
        if (activeMission && !missionCompleted) {
          missionCompleted = true;
          activeMission.status = 'failed';
          if (typeof showToast === 'function') {
            showToast('MISSION FAILED', 'TRACE completed before mission objectives. Review leaderboard and retry.', '#ff3333');
          }
        }
      }
    };
  }

  // Hide panels when exiting to selection/login
  if (typeof changeProtocolBtn !== 'undefined' && changeProtocolBtn) {
    changeProtocolBtn.addEventListener('click', () => {
      if (tracePanel) tracePanel.classList.add('hidden');
      if (cyberdeckBar) cyberdeckBar.classList.add('hidden');
    });
  }

  if (typeof logoutBtn !== 'undefined' && logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (tracePanel) tracePanel.classList.add('hidden');
      if (cyberdeckBar) cyberdeckBar.classList.add('hidden');
      if (cyberdeckPopup) cyberdeckPopup.classList.add('hidden');
    });
  }

  // -----------------------------
  // Mission Codes (Seeded Runs)
  // -----------------------------
  const missionPopup = document.getElementById('mission-popup');
  const missionSeedInput = document.getElementById('mission-seed-input');
  const generateMissionBtn = document.getElementById('generate-mission-btn');
  const missionCodeOutput = document.getElementById('mission-code-output');
  const copyMissionBtn = document.getElementById('copy-mission-btn');
  const shareMissionBtn = document.getElementById('share-mission-btn');
  const missionCodeInput = document.getElementById('mission-code-input');
  const loadMissionBtn = document.getElementById('load-mission-btn');
  const closeMissionBtn = document.getElementById('close-mission-btn');

  let pendingMissionConfig = null;
  let pendingDuelCode = null;

  // Active duel challenge (code-based)
  let activeDuel = null;

  function toB64Url(str) {
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function fromB64Url(token) {
    const b64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    return decodeURIComponent(escape(atob(padded)));
  }

  function encodeMission(cfg) {
    const payload = JSON.stringify(cfg);
    return 'THM1.' + toB64Url(payload);
  }

  function parseMission(input) {
    if (!input) return null;
    let raw = String(input).trim();

    try {
      if (raw.includes('mission=')) {
        const u = new URL(raw, window.location.origin);
        const token = u.searchParams.get('mission');
        if (token) raw = token;
      }
    } catch {
      // Ignore
    }

    if (raw.startsWith('THM1.')) raw = raw.slice('THM1.'.length);

    try {
      const json = fromB64Url(raw);
      const cfg = JSON.parse(json);
      return cfg && typeof cfg === 'object' ? cfg : null;
    } catch {
      return null;
    }
  }

  function normalizeMission(cfg) {
    const safe = {
      v: 1,
      seed: String(cfg.seed || '').slice(0, 24) || String(Date.now()),
      mode: cfg.mode === 'codebreaker' ? 'codebreaker' : 'classic',
      category: String(cfg.category || 'RANDOM').toUpperCase(),
      difficulty: String(cfg.difficulty || 'MEDIUM').toUpperCase(),
      length: clamp(parseInt(cfg.length || 10, 10) || 10, 1, 25),
      deck: Array.isArray(cfg.deck) ? cfg.deck.slice(0, 3).map(String) : [],
      visual: cfg.visual === 'hangman' ? 'hangman' : 'network',
    };

    if (!MISTAKE_MAPPINGS[safe.difficulty]) safe.difficulty = 'MEDIUM';
    if (!safe.category) safe.category = 'RANDOM';

    return safe;
  }

  function missionKey(cfg) {
    const deck = Array.isArray(cfg.deck) ? cfg.deck.slice().map(String).sort().join('+') : '';
    const visual = cfg.visual === 'hangman' ? 'hangman' : 'network';
    return [
      'v' + String(cfg.v || 1),
      cfg.seed,
      cfg.mode,
      cfg.category,
      cfg.difficulty,
      String(cfg.length),
      'deck:' + deck,
      'vis:' + visual,
    ].join('|');
  }

  function buildMissionConfig(seedInput) {
    const seed = (seedInput || '').trim() || Math.random().toString(36).slice(2, 8) + '-' + Date.now().toString(36).slice(-4);

    const mode = currentMode === 'codebreaker' ? 'codebreaker' : 'classic';
    const category = (selectedCategory || 'RANDOM').toUpperCase();
    const difficulty = (selectedDifficulty || 'MEDIUM').toUpperCase();

    return normalizeMission({
      seed,
      mode,
      category,
      difficulty,
      length: 10,
      deck: selectedModules.slice(),
      visual: SETTINGS.visualMode,
    });
  }

  function openMissionPopup() {
    if (!missionPopup) return;
    missionPopup.classList.remove('hidden');
    refreshMissionLeaderboard().catch(() => {});
  }

  function closeMissionPopup() {
    if (!missionPopup) return;
    missionPopup.classList.add('hidden');
  }

  function ensureMissionLeaderboardEl() {
    if (!missionPopup) return null;
    const content = missionPopup.querySelector('.mission-content');
    if (!content) return null;

    let el = document.getElementById('mission-leaderboard');
    if (el) return el;

    el = document.createElement('div');
    el.id = 'mission-leaderboard';
    el.style.marginTop = '14px';
    el.style.borderTop = '1px solid rgba(255,255,255,0.12)';
    el.style.paddingTop = '14px';
    content.appendChild(el);
    return el;
  }

  function renderMissionLeaderboard(rows) {
    const el = ensureMissionLeaderboardEl();
    if (!el) return;

    const safeRows = Array.isArray(rows) ? rows : [];

    if (safeRows.length === 0) {
      el.innerHTML = '<div style="color: rgba(255,255,255,0.65)">No runs yet for this mission.</div>';
      return;
    }

    const htmlRows = safeRows
      .slice(0, 10)
      .map((r, i) => {
        const name = escapeHtml(String(r.username || 'UNKNOWN').toUpperCase());
        const score = escapeHtml(String(r.score ?? r.val ?? 0));
        const time = escapeHtml(String(r.time_seconds ?? r.time ?? ''));
        return (
          '<tr>' +
          '<td>#' + (i + 1) + '</td>' +
          '<td>' + name + '</td>' +
          '<td>' + score + '</td>' +
          '<td>' + (time ? time + 's' : '-') + '</td>' +
          '</tr>'
        );
      })
      .join('');

    el.innerHTML =
      '<div style="color: var(--neon-cyan); font-weight: 900; letter-spacing: 2px; margin-bottom: 10px;">TOP RUNS</div>' +
      '<div style="overflow:auto; max-height: 240px;">' +
      '<table style="width:100%; border-collapse: collapse; font-size: 0.85rem;">' +
      '<thead>' +
      '<tr style="color: rgba(255,255,255,0.8)">' +
      '<th style="text-align:left; padding:6px;">RANK</th>' +
      '<th style="text-align:left; padding:6px;">AGENT</th>' +
      '<th style="text-align:left; padding:6px;">SCORE</th>' +
      '<th style="text-align:left; padding:6px;">TIME</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' +
      htmlRows +
      '</tbody>' +
      '</table>' +
      '</div>';
  }

  async function refreshMissionLeaderboard() {
    if (!activeMission) return;

    try {
      const res = await fetch(API_URL + '/mission/leaderboard?mission_key=' + encodeURIComponent(activeMission.key));
      if (!res.ok) throw new Error('leaderboard fetch failed');
      const data = await res.json();
      renderMissionLeaderboard(data.rows || data || []);
    } catch {
      renderMissionLeaderboard([]);
    }
  }

  async function submitMissionRun() {
    if (!activeMission || !currentUserId) return;

    const totalSeconds = Math.floor((Date.now() - missionStartMs) / 1000);

    try {
      await fetch(API_URL + '/mission/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUserId,
          mission_key: activeMission.key,
          seed: activeMission.seed,
          mode: activeMission.mode,
          category: activeMission.category,
          difficulty: activeMission.difficulty,
          length: activeMission.length,
          score: currentScore,
          time_seconds: totalSeconds,
        }),
      });
    } catch {
      // Non-fatal
    }
  }

  async function startMission(cfg) {
    const normalized = normalizeMission(cfg);

    if (!currentUserId) {
      pendingMissionConfig = normalized;
      openMissionPopup();
      if (typeof showToast === 'function') {
        showToast('MISSION LOADED', 'Login required to begin seeded missions.', '#00ffcc');
      }
      return;
    }

    activeMission = Object.assign({}, normalized, { key: missionKey(normalized), status: 'active' });
    missionRoundIndex = 0;
    missionWins = 0;
    missionStartMs = Date.now();
    missionCompleted = false;

    SETTINGS.visualMode = normalized.visual;
    localStorage.setItem('hangman_visual', normalized.visual);

    selectedModules = normalized.deck.slice();
    saveCyberdeck(selectedModules);

    currentMode = normalized.mode;
    if (normalized.mode === 'codebreaker' && modeCodebreakerBtn) {
      setModeActive(modeCodebreakerBtn);
      hideAllModeGrids();
      if (codebreakerGrid) codebreakerGrid.classList.remove('hidden');
    }

    selectedCategory = normalized.category;
    selectedDifficulty = normalized.difficulty;
    MAX_MISTAKES = MISTAKE_MAPPINGS[selectedDifficulty].length;

    if (typeof selectionScreen !== 'undefined' && selectionScreen) selectionScreen.classList.add('hidden');
    if (typeof gameContainer !== 'undefined' && gameContainer) gameContainer.classList.remove('hidden');

    closeMissionPopup();
    if (typeof initGame === 'function') await initGame();

    refreshMissionLeaderboard().catch(() => {});
  }

  if (openMissionBtn) openMissionBtn.addEventListener('click', () => { openMissionPopup(); if (typeof playSfx === 'function') playSfx('click'); });
  if (missionCodeBtn) missionCodeBtn.addEventListener('click', () => { openMissionPopup(); if (typeof playSfx === 'function') playSfx('click'); });
  if (closeMissionBtn) closeMissionBtn.addEventListener('click', () => { closeMissionPopup(); if (typeof playSfx === 'function') playSfx('click'); });

  if (generateMissionBtn) {
    generateMissionBtn.addEventListener('click', () => {
      const cfg = buildMissionConfig(missionSeedInput ? missionSeedInput.value : '');
      const code = encodeMission(cfg);
      if (missionCodeOutput) missionCodeOutput.value = code;
      if (typeof showToast === 'function') showToast('MISSION GENERATED', 'Share it. Everyone gets the same run.', '#00ffcc');
      refreshMissionLeaderboard().catch(() => {});
      if (typeof playSfx === 'function') playSfx('click');
    });
  }

  if (copyMissionBtn) {
    copyMissionBtn.addEventListener('click', async () => {
      const text = missionCodeOutput ? missionCodeOutput.value : '';
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        if (typeof showToast === 'function') showToast('COPIED', 'Mission code copied to clipboard.', '#00ffcc');
      } catch {
        // ignore
      }
      if (typeof playSfx === 'function') playSfx('click');
    });
  }

  if (shareMissionBtn) {
    shareMissionBtn.addEventListener('click', async () => {
      const text = missionCodeOutput ? missionCodeOutput.value : '';
      if (!text) return;
      const cfg = parseMission(text);
      if (!cfg) return;
      const token = text.startsWith('THM1.') ? text.slice('THM1.'.length) : text;
      const url = window.location.origin + window.location.pathname + '?mission=' + encodeURIComponent(token);

      if (navigator.share) {
        try {
          await navigator.share({ title: 'Tech Hangman Mission', text: 'Run this seeded mission and compare scores.', url: url });
        } catch {
          // ignore
        }
      } else {
        try {
          await navigator.clipboard.writeText(url);
          if (typeof showToast === 'function') showToast('LINK COPIED', 'Mission link copied to clipboard.', '#00ffcc');
        } catch {
          // ignore
        }
      }
      if (typeof playSfx === 'function') playSfx('click');
    });
  }

  if (loadMissionBtn) {
    loadMissionBtn.addEventListener('click', async () => {
      const raw = missionCodeInput ? missionCodeInput.value : '';
      const cfg = parseMission(raw);
      if (!cfg) {
        if (typeof showToast === 'function') showToast('INVALID CODE', 'Mission code could not be decoded.', '#ff3333');
        return;
      }
      await startMission(cfg);
      if (typeof playSfx === 'function') playSfx('click');
    });
  }

  // Load mission from URL (defer start until login)
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('mission');
    if (token) {
      const cfg = parseMission(token);
      if (cfg) pendingMissionConfig = normalizeMission(cfg);
    }

    const duel = params.get('duel');
    if (duel) {
      pendingDuelCode = String(duel).trim();
    }
  } catch {
    // ignore
  }

  if (typeof applyUserSession === 'function') {
    const legacyApplyUserSession = applyUserSession;
    applyUserSession = function (data) {
      legacyApplyUserSession(data);
      primeUserProgress({ force: true }).catch(() => {});
      if (pendingMissionConfig) {
        const cfg = pendingMissionConfig;
        pendingMissionConfig = null;
        startMission(cfg).catch(() => {});
      }

      if (pendingDuelCode) {
        const code = pendingDuelCode;
        pendingDuelCode = null;
        startDuelFromCode(code).catch(() => {});
      }
    };
  }

  // Mission progress hooks
  if (typeof checkWin === 'function') {
    const legacyCheckWin = checkWin;
    checkWin = function () {
      const wasOver = isGameOver;
      legacyCheckWin();

      if (!wasOver && isGameOver && activeMission && !missionCompleted) {
        missionWins += 1;
        if (typeof showToast === 'function') {
          showToast('MISSION PROGRESS', missionWins + ' / ' + activeMission.length + ' targets cracked.', '#00ffcc');
        }

        if (missionWins >= activeMission.length) {
          missionCompleted = true;
          activeMission.status = 'completed';
          submitMissionRun().finally(() => refreshMissionLeaderboard().catch(() => {}));
        }
      }
    };
  }

  // Stop next from starting another round after mission completion/failure.
  const nextBtnEl = document.getElementById('next-btn');
  if (nextBtnEl) {
    nextBtnEl.addEventListener(
      'click',
      (e) => {
        if (!activeMission || !missionCompleted) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        openMissionPopup();
      },
      true
    );
  }

  // -----------------------------
  // Duel Codes (Invite / Join)
  // -----------------------------
  const duelOverlayEl = document.getElementById('duel-setup-overlay');
  const duelWordInputEl = document.getElementById('duel-word-input');
  const duelErrorEl = document.getElementById('duel-error-msg');

  function normalizeDuelCode(raw) {
    if (!raw) return '';
    let s = String(raw).trim();

    try {
      if (s.includes('duel=')) {
        const u = new URL(s, window.location.origin);
        const token = u.searchParams.get('duel');
        if (token) s = token;
      }
    } catch {
      // ignore
    }

    s = s.replace(/[^a-zA-Z0-9-]/g, '').toUpperCase();
    return s;
  }

  function duelToast(title, msg, color) {
    if (typeof showToast === 'function') showToast(title, msg, color || '#ff3333');
  }

  function ensureDuelCodePanel() {
    if (!duelOverlayEl) return null;
    if (document.getElementById('duel-code-panel')) return document.getElementById('duel-code-panel');

    const anchor = document.getElementById('duel-error-msg');
    const host = anchor && anchor.parentElement ? anchor.parentElement : duelOverlayEl;

    const panel = document.createElement('div');
    panel.id = 'duel-code-panel';
    panel.style.marginTop = '14px';
    panel.style.borderTop = '1px solid rgba(255,255,255,0.12)';
    panel.style.paddingTop = '14px';

    panel.innerHTML =
      '<div style="color: var(--neon-blue); font-weight: 900; letter-spacing: 3px; margin-bottom: 10px;">DUEL CODES</div>' +
      '<p class="login-subtitle" style="margin:0 0 10px;">Generate a code and share it. Your friend can join from another device.</p>' +

      '<div class="mission-row">' +
      '<input id="duel-code-input" type="text" placeholder="PASTE DUEL CODE" autocomplete="off" style="flex:1; min-width:220px; padding:10px 12px; border-radius:12px; border:1px solid rgba(0,255,204,0.25); background: rgba(0,0,0,0.35); color: rgba(255,255,255,0.9); font-family: Space Mono, monospace;" />' +
      '<button id="duel-join-btn" class="text-btn highlight-btn">JOIN</button>' +
      '</div>' +

      '<div class="mission-row" style="margin-top:10px;">' +
      '<button id="duel-generate-btn" class="text-btn">GENERATE (FROM WORD)</button>' +
      '<button id="duel-random-btn" class="text-btn">RANDOM CODE</button>' +
      '</div>' +

      '<textarea id="duel-code-output" class="mission-code-output" readonly rows="2" placeholder="DUEL CODE OUTPUT"></textarea>' +

      '<div class="mission-row">' +
      '<button id="duel-copy-btn" class="text-btn">COPY</button>' +
      '<button id="duel-share-btn" class="text-btn">SHARE LINK</button>' +
      '<button id="duel-start-code-btn" class="text-btn highlight-btn">START CODE</button>' +
      '</div>' +

      '<div id="duel-leaderboard" style="margin-top:14px;"></div>';

    host.insertBefore(panel, document.getElementById('duel-cancel-btn'));
    return panel;
  }

  function renderDuelLeaderboard(rows) {
    const el = document.getElementById('duel-leaderboard');
    if (!el) return;

    const safe = Array.isArray(rows) ? rows : [];
    if (safe.length === 0) {
      el.innerHTML = '<div style="color: rgba(255,255,255,0.6); font-family: Space Mono, monospace; font-size:0.8rem;">No duel runs yet.</div>';
      return;
    }

    const htmlRows = safe
      .slice(0, 10)
      .map((r, i) => {
        const name = escapeHtml(String(r.username || 'UNKNOWN').toUpperCase());
        const score = escapeHtml(String(r.score ?? 0));
        const time = escapeHtml(String(r.time_seconds ?? ''));
        const win = (r.is_win === 1 || r.is_win === true) ? 'WIN' : 'LOSS';
        return (
          '<tr>' +
          '<td style="padding:6px;">#' + (i + 1) + '</td>' +
          '<td style="padding:6px;">' + name + '</td>' +
          '<td style="padding:6px;">' + score + '</td>' +
          '<td style="padding:6px;">' + (time ? time + 's' : '-') + '</td>' +
          '<td style="padding:6px;">' + win + '</td>' +
          '</tr>'
        );
      })
      .join('');

    el.innerHTML =
      '<div style="color: var(--neon-cyan); font-weight: 900; letter-spacing: 2px; margin-bottom: 10px;">DUEL BOARD</div>' +
      '<div style="overflow:auto; max-height: 180px;">' +
      '<table style="width:100%; border-collapse: collapse; font-size: 0.8rem;">' +
      '<thead>' +
      '<tr style="color: rgba(255,255,255,0.8)">' +
      '<th style="text-align:left; padding:6px;">RANK</th>' +
      '<th style="text-align:left; padding:6px;">AGENT</th>' +
      '<th style="text-align:left; padding:6px;">SCORE</th>' +
      '<th style="text-align:left; padding:6px;">TIME</th>' +
      '<th style="text-align:left; padding:6px;">RESULT</th>' +
      '</tr>' +
      '</thead>' +
      '<tbody>' +
      htmlRows +
      '</tbody>' +
      '</table>' +
      '</div>';
  }

  async function refreshDuelLeaderboard(code) {
    const c = normalizeDuelCode(code);
    if (!c) return;

    try {
      const res = await fetch(API_URL + '/duel/leaderboard?code=' + encodeURIComponent(c));
      if (!res.ok) throw new Error('leaderboard');
      const data = await res.json();
      renderDuelLeaderboard(data.rows || data || []);
    } catch {
      renderDuelLeaderboard([]);
    }
  }

  async function createDuelCode(payload) {
    try {
      const res = await fetch(API_URL + '/duel/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data && data.error ? data.error : 'create failed');
      return data;
    } catch (e) {
      throw e;
    }
  }

  async function getDuelByCode(code) {
    const c = normalizeDuelCode(code);
    if (!c) throw new Error('Invalid duel code');

    const res = await fetch(API_URL + '/duel/get?code=' + encodeURIComponent(c));
    const data = await res.json();
    if (!res.ok) throw new Error(data && data.error ? data.error : 'Invalid duel code');
    return data;
  }

  function startDuelWord(word, meta) {
    const w = String(word || '').trim().toUpperCase();
    if (!w) throw new Error('Empty word');

    const diff = String((meta && meta.difficulty) || 'MEDIUM').toUpperCase();
    selectedCategory = 'DUEL';
    selectedDifficulty = MISTAKE_MAPPINGS[diff] ? diff : 'MEDIUM';
    MAX_MISTAKES = MISTAKE_MAPPINGS[selectedDifficulty].length;

    currentWord = w;
    currentWordData = {
      word: w,
      clue: 'DUEL_CODE_TARGET',
      category: 'DUEL',
      description: 'Duel code challenge. Two agents, one target.',
    };

    if (typeof clueText !== 'undefined' && clueText) {
      clueText.innerText = 'DUEL TARGET';
    }

    if (duelOverlayEl) duelOverlayEl.classList.add('hidden');
    if (typeof selectionScreen !== 'undefined' && selectionScreen) selectionScreen.classList.add('hidden');
    if (typeof gameContainer !== 'undefined' && gameContainer) gameContainer.classList.remove('hidden');

    guessedLetters = [];
    wrongGuesses = 0;
    isGameOver = false;
    hintsUsed = 0;
    gameStartTime = Date.now();

    if (typeof renderWord === 'function') renderWord();
    if (typeof renderKeyboard === 'function') renderKeyboard();

    activeDuel = meta && meta.code ? {
      code: normalizeDuelCode(meta.code),
      created_by: meta.created_by || null,
    } : null;

    duelToast('DUEL ENGAGED', 'Code loaded. Share the same code so both of you crack the same target.', '#ff3333');
    refreshDuelLeaderboard(activeDuel && activeDuel.code).catch(() => {});
  }

  async function startDuelFromCode(rawCode) {
    const panel = ensureDuelCodePanel();
    const code = normalizeDuelCode(rawCode);
    if (!code) {
      duelToast('INVALID CODE', 'Paste a duel code like ABC12345.', '#ff3333');
      throw new Error('invalid');
    }

    const data = await getDuelByCode(code);
    const word = String(data.word || '').toUpperCase();

    startDuelWord(word, {
      code: code,
      difficulty: data.difficulty || 'MEDIUM',
      created_by: data.creator_user_id || null,
    });

    // Keep the code in the panel for quick sharing
    const out = document.getElementById('duel-code-output');
    const inp = document.getElementById('duel-code-input');
    if (out) out.value = code;
    if (inp) inp.value = code;

    return true;
  }

  async function submitDuelRun(isWin) {
    if (!activeDuel || !activeDuel.code || !currentUserId) return;

    const seconds = Math.floor((Date.now() - gameStartTime) / 1000);
    try {
      await fetch(API_URL + '/duel/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUserId,
          code: activeDuel.code,
          score: currentScore,
          time_seconds: seconds,
          is_win: !!isWin,
        }),
      });
    } catch {
      // ignore
    }

    refreshDuelLeaderboard(activeDuel.code).catch(() => {});
  }

  // Inject UI and wire events
  const duelPanel = ensureDuelCodePanel();
  if (duelPanel) {
    const codeInput = document.getElementById('duel-code-input');
    const codeOutput = document.getElementById('duel-code-output');

    const joinBtn = document.getElementById('duel-join-btn');
    const genBtn = document.getElementById('duel-generate-btn');
    const rndBtn = document.getElementById('duel-random-btn');
    const copyBtn = document.getElementById('duel-copy-btn');
    const shareBtn = document.getElementById('duel-share-btn');
    const startBtn = document.getElementById('duel-start-code-btn');

    if (joinBtn) {
      joinBtn.addEventListener('click', () => {
        const raw = codeInput ? codeInput.value : '';
        startDuelFromCode(raw).catch((e) => {
          duelToast('DUEL JOIN FAILED', String(e && e.message ? e.message : 'Invalid code'), '#ff3333');
        });
        if (typeof playSfx === 'function') playSfx('click');
      });
    }

    if (genBtn) {
      genBtn.addEventListener('click', async () => {
        const word = duelWordInputEl ? duelWordInputEl.value.trim().toUpperCase() : '';
        if (word.length < 3) {
          if (duelErrorEl) duelErrorEl.innerText = 'WORD TOO SHORT (MIN 3)';
          return;
        }
        if (!/^[A-Z]+$/.test(word)) {
          if (duelErrorEl) duelErrorEl.innerText = 'ALPHABET ONLY';
          return;
        }

        try {
          const data = await createDuelCode({ user_id: currentUserId || null, word: word, difficulty: 'MEDIUM' });
          const code = normalizeDuelCode(data.code || '');
          if (codeOutput) codeOutput.value = code;
          if (codeInput) codeInput.value = code;
          duelToast('DUEL CODE READY', 'Share it. Both of you get the same trap word.', '#00ffcc');
          refreshDuelLeaderboard(code).catch(() => {});
        } catch (e) {
          duelToast('CREATE FAILED', String(e && e.message ? e.message : 'Backend error'), '#ff3333');
        }

        if (typeof playSfx === 'function') playSfx('click');
      });
    }

    if (rndBtn) {
      rndBtn.addEventListener('click', async () => {
        try {
          const data = await createDuelCode({ user_id: currentUserId || null, random: true, difficulty: 'MEDIUM' });
          const code = normalizeDuelCode(data.code || '');
          if (codeOutput) codeOutput.value = code;
          if (codeInput) codeInput.value = code;
          duelToast('RANDOM DUEL CODE', 'Generated. Share it to challenge a friend.', '#00ffcc');
          refreshDuelLeaderboard(code).catch(() => {});
        } catch (e) {
          duelToast('CREATE FAILED', String(e && e.message ? e.message : 'Backend error'), '#ff3333');
        }

        if (typeof playSfx === 'function') playSfx('click');
      });
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const code = normalizeDuelCode(codeOutput && codeOutput.value ? codeOutput.value : (codeInput ? codeInput.value : ''));
        if (!code) return;
        try {
          await navigator.clipboard.writeText(code);
          duelToast('COPIED', 'Duel code copied to clipboard.', '#00ffcc');
        } catch {
          // ignore
        }
        if (typeof playSfx === 'function') playSfx('click');
      });
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        const code = normalizeDuelCode(codeOutput && codeOutput.value ? codeOutput.value : (codeInput ? codeInput.value : ''));
        if (!code) return;

        const url = window.location.origin + window.location.pathname + '?duel=' + encodeURIComponent(code);

        if (navigator.share) {
          try {
            await navigator.share({ title: 'Tech Hangman Duel', text: 'Join my duel code and crack the same target.', url: url });
          } catch {
            // ignore
          }
        } else {
          try {
            await navigator.clipboard.writeText(url);
            duelToast('LINK COPIED', 'Duel link copied to clipboard.', '#00ffcc');
          } catch {
            // ignore
          }
        }

        if (typeof playSfx === 'function') playSfx('click');
      });
    }

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const code = normalizeDuelCode(codeOutput && codeOutput.value ? codeOutput.value : (codeInput ? codeInput.value : ''));
        if (!code) return;
        startDuelFromCode(code).catch((e) => {
          duelToast('DUEL START FAILED', String(e && e.message ? e.message : 'Invalid code'), '#ff3333');
        });
        if (typeof playSfx === 'function') playSfx('click');
      });
    }
  }

  // Hook results for code-based duels
  if (typeof checkWin === 'function' && !checkWin.__novel_duel__) {
    const prev = checkWin;
    const wrapped = function () {
      const wasOver = isGameOver;
      prev();

      if (!wasOver && isGameOver) {
        // Escape sfx slightly after the win sweep
        setTimeout(() => {
          if (typeof playSfx === 'function') playSfx('escape');
        }, 500);

        if (activeDuel && activeDuel.code) {
          submitDuelRun(true).catch(() => {});
        }
      }
    };
    wrapped.__novel_duel__ = true;
    checkWin = wrapped;
  }

  // Loss sound + duel submit lives in the checkLoss wrapper above; add a second hook for duel submit if needed
  if (typeof checkLoss === 'function' && !checkLoss.__novel_duel__) {
    const prevLoss = checkLoss;
    const wrappedLoss = function () {
      const wasOver = isGameOver;
      prevLoss();

      if (!wasOver && isGameOver && wrongGuesses >= MAX_MISTAKES) {
        // Death sfx near the red overlay flash
        setTimeout(() => {
          if (typeof playSfx === 'function') playSfx('death');
        }, 260);

        if (activeDuel && activeDuel.code) {
          submitDuelRun(false).catch(() => {});
        }
      }
    };
    wrappedLoss.__novel_duel__ = true;
    checkLoss = wrappedLoss;
  }


  // After a code-duel ends, let NEXT open the duel overlay instead of starting a random round.
  const nextBtnDuelEl = document.getElementById('next-btn');
  if (nextBtnDuelEl) {
    nextBtnDuelEl.addEventListener(
      'click',
      (e) => {
        if (!activeDuel || !activeDuel.code || !isGameOver) return;
        if (activeMission) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        if (duelOverlayEl) duelOverlayEl.classList.remove('hidden');
        ensureDuelCodePanel();

        const out = document.getElementById('duel-code-output');
        const inp = document.getElementById('duel-code-input');
        if (out) out.value = activeDuel.code;
        if (inp) inp.value = activeDuel.code;

        refreshDuelLeaderboard(activeDuel.code).catch(() => {});
        duelToast('VIEW DUEL BOARD', 'Compare runs and share the code again.', '#00ffcc');
      },
      true
    );
  }

  // -----------------------------
  // Tech Districts
  // -----------------------------
  const districtsOverlay = document.getElementById('districts-overlay');
  const districtsMap = document.getElementById('districts-map');
  const districtsDetail = document.getElementById('districts-detail');
  const closeDistrictsBtn = document.getElementById('close-districts-btn');

  const DISTRICT_POS = {
    DATABASE: { x: 14, y: 18 },
    DATA_STRUCTURE: { x: 32, y: 12 },
    PYTHON: { x: 52, y: 16 },
    DATASCIENCE: { x: 70, y: 22 },
    ARTIFICIAL_INTELLIGENCE: { x: 86, y: 34 },

    WEBDEVELOPMENT: { x: 66, y: 44 },
    SOFTWAREENGINEERING: { x: 46, y: 44 },
    CODE_OUTPUT: { x: 26, y: 44 },

    GENERAL_KNOWLEDGE: { x: 12, y: 54 },
    C: { x: 24, y: 66 },
    CPP: { x: 36, y: 70 },
    JAVA: { x: 52, y: 72 },

    OPERATING_SYSTEM: { x: 42, y: 58 },
    LINUX: { x: 60, y: 58 },
    NETWORKING: { x: 82, y: 50 },
    CYBERSECURITY: { x: 88, y: 62 },
    CLOUD: { x: 72, y: 72 },
  };

  const DISTRICT_LINES = [
    ['DATABASE', 'DATA_STRUCTURE'],
    ['DATA_STRUCTURE', 'PYTHON'],
    ['PYTHON', 'DATASCIENCE'],
    ['DATASCIENCE', 'ARTIFICIAL_INTELLIGENCE'],

    ['CODE_OUTPUT', 'SOFTWAREENGINEERING'],
    ['SOFTWAREENGINEERING', 'WEBDEVELOPMENT'],
    ['WEBDEVELOPMENT', 'NETWORKING'],
    ['NETWORKING', 'CYBERSECURITY'],
    ['CYBERSECURITY', 'CLOUD'],

    ['OPERATING_SYSTEM', 'LINUX'],
    ['LINUX', 'NETWORKING'],
    ['GENERAL_KNOWLEDGE', 'C'],
    ['C', 'CPP'],
    ['CPP', 'JAVA'],
    ['JAVA', 'CLOUD'],
  ];

  let cachedUserProgress = null;
  let cachedUserProgressAt = 0;

  function safePct(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.max(0, Math.min(100, Math.round(x)));
  }

  const CAT_LABELS = {
    SOFTWAREENGINEERING: 'SOFTWARE ENGINEERING',
    WEBDEVELOPMENT: 'WEB DEVELOPMENT',
    DATASCIENCE: 'DATA SCIENCE',
    GENERAL_KNOWLEDGE: 'GENERAL KNOWLEDGE',
  };

  function prettyCat(cat) {
    const key = String(cat || '').toUpperCase();
    if (CAT_LABELS[key]) return CAT_LABELS[key];
    return key.replace(/_/g, ' ');
  }

  function applyProgressPerks(progress) {
    if (!progress || typeof progress.total_percentage === 'undefined') return;

    const pct = safePct(progress.total_percentage);
    const prev = SETTINGS.maxModules;
    const next = pct >= 25 ? 3 : 2;

    SETTINGS.maxModules = next;

    if (next > prev && typeof showToast === 'function') {
      showToast('PERK UNLOCKED', 'CYBERDECK EXPANDED: You can now equip 3 modules.', '#00ffcc');
    }
  }

  async function primeUserProgress(opts) {
    const force = !!(opts && opts.force);
    if (!currentUserId) return null;

    const now = Date.now();
    if (!force && cachedUserProgress && now - cachedUserProgressAt < 20000) {
      return cachedUserProgress;
    }

    try {
      const res = await fetch(API_URL + '/user/progress?user_id=' + encodeURIComponent(String(currentUserId)));
      if (!res.ok) throw new Error('progress fetch failed');
      const data = await res.json();
      cachedUserProgress = data;
      cachedUserProgressAt = now;
      applyProgressPerks(data);
      return data;
    } catch {
      return cachedUserProgress;
    }
  }

  function renderDistrictsLoading() {
    if (!districtsMap) return;
    districtsMap.innerHTML =
      '<div class="districts-hud">' +
      '<div class="districts-hud-title">SCANNING DISTRICTS</div>' +
      '<div class="districts-hud-sub">Pulling progress telemetry from HQ...</div>' +
      '</div>';
  }

  function ensureDetailVisible() {
    if (!districtsDetail) return;
    districtsDetail.classList.remove('hidden');
  }

  function renderDistrictDetail(domain, progress) {
    if (!districtsDetail) return;

    const cat = String(domain.category || 'UNKNOWN');
    const solved = Math.max(0, parseInt(domain.solved || 0, 10) || 0);
    const total = Math.max(0, parseInt(domain.total || 0, 10) || 0);
    const pct = safePct(domain.percentage || (total ? (solved / total) * 100 : 0));

    const nodes = [];
    const cappedTotal = total > 220 ? 220 : total;
    for (let i = 0; i < cappedTotal; i++) {
      const cls = i < solved ? 'district-node solved' : 'district-node';
      nodes.push('<span class="' + cls + '" title="NODE ' + (i + 1) + '"></span>');
    }

    const overallPct = safePct(progress && progress.total_percentage);
    const slotPerk = overallPct >= 25;

    const story = [
      { at: 25, title: 'FOOTHOLD', text: 'Local services mapped. ICE begins adaptive throttling.' },
      { at: 50, title: 'SIDE CHANNEL', text: 'You recover partial routing tables and stale credentials.' },
      { at: 75, title: 'ICE SIGNATURE', text: 'Defensive heuristics identified. Countermeasures staged.' },
      { at: 100, title: 'DISTRICT CLEARED', text: 'Full node ownership achieved. New mission routes unlocked.' },
    ];

    const storyHtml = story
      .map((s) => {
        const unlocked = pct >= s.at;
        return (
          '<div class="district-story-entry ' + (unlocked ? 'unlocked' : 'locked') + '">' +
          '<div class="district-story-head">' +
          '<span class="tag">' + s.at + '%</span>' +
          '<span class="t">' + escapeHtml(s.title) + '</span>' +
          '</div>' +
          '<div class="district-story-body">' + escapeHtml(unlocked ? s.text : 'Encrypted. Clear more nodes to decrypt.') + '</div>' +
          '</div>'
        );
      })
      .join('');

    districtsDetail.innerHTML =
      '<div class="district-detail-title">' + escapeHtml(prettyCat(cat)) + '</div>' +
      '<div class="district-detail-sub">' +
      escapeHtml(String(solved)) +
      ' / ' +
      escapeHtml(String(total)) +
      ' nodes (' +
      escapeHtml(String(pct)) +
      '%)</div>' +
      (total > 220 ? '<div class="district-detail-warn">Showing 220 nodes. (District is large.)</div>' : '') +
      '<div class="district-nodes">' + nodes.join('') + '</div>' +
      '<div class="district-perks">' +
      '<div class="district-perk ' + (slotPerk ? 'unlocked' : 'locked') + '">' +
      '<span class="k">CYBERDECK SLOT</span>' +
      '<span class="v">' + (slotPerk ? '3 MODULES AVAILABLE' : 'Unlock at 25% OVERALL') + '</span>' +
      '</div>' +
      '<div class="district-perk unlocked">' +
      '<span class="k">MISSION CODES</span>' +
      '<span class="v">Seeded runs + leaderboards</span>' +
      '</div>' +
      '</div>' +
      '<div class="district-story">' +
      '<div class="district-story-title">DISTRICT INTEL</div>' +
      storyHtml +
      '</div>';

    ensureDetailVisible();
  }

  function renderDistrictMap(progress) {
    if (!districtsMap) return;

    const domains = progress && Array.isArray(progress.domains) ? progress.domains : [];

    districtsMap.innerHTML = '';

    // Decorative network lines (static backdrop)
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'districts-lines');
      svg.setAttribute('viewBox', '0 0 100 100');

      DISTRICT_LINES.forEach(([a, b]) => {
        const pa = DISTRICT_POS[a];
        const pb = DISTRICT_POS[b];
        if (!pa || !pb) return;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(pa.x));
        line.setAttribute('y1', String(pa.y));
        line.setAttribute('x2', String(pb.x));
        line.setAttribute('y2', String(pb.y));
        line.setAttribute('class', 'district-line');
        svg.appendChild(line);
      });

      districtsMap.appendChild(svg);
    } catch {
      // ignore
    }

    const grid = document.createElement('div');
    grid.className = 'districts-grid';

    const overallPct = safePct(progress && progress.total_percentage);
    const hud = document.createElement('div');
    hud.className = 'districts-hud';
    hud.innerHTML =
      '<div class="districts-hud-title">MISSION TERRITORY</div>' +
      '<div class="districts-hud-sub">OVERALL COMPLETION: ' +
      escapeHtml(String(overallPct)) +
      '% | CYBERDECK SLOTS: ' +
      escapeHtml(String(SETTINGS.maxModules)) +
      '</div>';
    grid.appendChild(hud);

    if (!domains.length) {
      const empty = document.createElement('div');
      empty.className = 'districts-empty';
      empty.innerText = currentUserId ? 'No progress telemetry yet. Win rounds to light up districts.' : 'Login required.';
      grid.appendChild(empty);
      districtsMap.appendChild(grid);
      return;
    }

    const DISTRICT_ORDER = [
      'GENERAL_KNOWLEDGE',
      'DATABASE',
      'DATA_STRUCTURE',
      'PYTHON',
      'DATASCIENCE',
      'ARTIFICIAL_INTELLIGENCE',
      'CODE_OUTPUT',
      'SOFTWAREENGINEERING',
      'WEBDEVELOPMENT',
      'OPERATING_SYSTEM',
      'LINUX',
      'NETWORKING',
      'CYBERSECURITY',
      'CLOUD',
      'C',
      'CPP',
      'JAVA',
    ];

    function orderIndex(cat) {
      const idx = DISTRICT_ORDER.indexOf(cat);
      return idx >= 0 ? idx : 9999;
    }

    const sorted = domains
      .slice()
      .sort((a, b) => orderIndex(String(a.category || '').toUpperCase()) - orderIndex(String(b.category || '').toUpperCase()));

    sorted.forEach((d) => {
      const cat = String(d.category || 'UNKNOWN').toUpperCase();

      const pill = document.createElement('div');
      pill.className = 'district-pill';
      pill.dataset.cat = cat;

      const pct = safePct(d.percentage);
      if (pct >= 100) pill.classList.add('complete');
      else if (pct >= 75) pill.classList.add('hot');

      pill.innerHTML =
        '<div class="name">' +
        escapeHtml(prettyCat(cat)) +
        '</div>' +
        '<div class="meta">' +
        escapeHtml(String(d.solved || 0)) +
        '/' +
        escapeHtml(String(d.total || 0)) +
        ' nodes | ' +
        escapeHtml(String(pct)) +
        '%</div>';

      pill.title = prettyCat(cat) + ' - ' + String(d.solved || 0) + '/' + String(d.total || 0) + ' nodes';

      pill.addEventListener('click', () => {
        renderDistrictDetail(d, progress);
        if (typeof playSfx === 'function') playSfx('click');
      });

      grid.appendChild(pill);
    });

    districtsMap.appendChild(grid);

    // Default: open first district detail
    renderDistrictDetail(sorted[0], progress);
  }

  function openDistrictsOverlay() {
    if (!districtsOverlay) return;

    districtsOverlay.classList.remove('hidden');
    if (districtsDetail) districtsDetail.classList.add('hidden');

    renderDistrictsLoading();
    primeUserProgress({ force: true }).then((data) => {
      renderDistrictMap(data || { domains: [] });
    });
  }

  function closeDistrictsOverlay() {
    if (!districtsOverlay) return;
    districtsOverlay.classList.add('hidden');
  }

  if (openDistrictsBtn) {
    openDistrictsBtn.addEventListener('click', () => {
      openDistrictsOverlay();
      if (typeof playSfx === 'function') playSfx('click');
    });
  }

  if (districtsBtn) {
    districtsBtn.addEventListener('click', () => {
      openDistrictsOverlay();
      if (typeof playSfx === 'function') playSfx('click');
    });
  }

  if (closeDistrictsBtn) {
    closeDistrictsBtn.addEventListener('click', () => {
      closeDistrictsOverlay();
      if (typeof playSfx === 'function') playSfx('click');
    });
  }

  if (districtsOverlay) {
    districtsOverlay.addEventListener('click', (e) => {
      if (e.target === districtsOverlay) closeDistrictsOverlay();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDistrictsOverlay();
  });


  // -----------------------------
  // Cyber Cursor (Neon Reticle)
  // -----------------------------
  function setupCyberCursor() {
    try {
      if (!window.matchMedia) return;
      const fine =
        window.matchMedia('(pointer: fine)').matches &&
        window.matchMedia('(hover: hover)').matches;
      if (!fine) return;

      if (!document.body) return;
      if (document.getElementById('cyber-cursor')) return;

      const cursor = document.createElement('div');
      cursor.id = 'cyber-cursor';
      cursor.className = 'is-hidden';
      cursor.innerHTML = '<div class="cyber-cursor-ring"></div><div class="cyber-cursor-dot"></div>';
      document.body.appendChild(cursor);

      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      let x = window.innerWidth / 2;
      let y = window.innerHeight / 2;
      let tx = x;
      let ty = y;

      function isTextTarget(t) {
        if (!t || !t.closest) return false;
        return !!t.closest('input,textarea,select');
      }

      function isInteractiveTarget(t) {
        if (!t || !t.closest) return false;
        return !!t.closest('button,a,[role="button"],.pointer,.cat-btn,.diff-btn,.mode-btn,.text-btn,.multi-btn,.icon-btn,.key');
      }

      function updateClasses(t) {
        const isText = isTextTarget(t);
        const isLink = !isText && isInteractiveTarget(t);
        cursor.classList.toggle('is-text', isText);
        cursor.classList.toggle('is-link', isLink);
      }

      function frame() {
        if (reduce) {
          x = tx;
          y = ty;
        } else {
          x += (tx - x) * 0.18;
          y += (ty - y) * 0.18;
        }

        cursor.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
        window.requestAnimationFrame(frame);
      }

      function onMove(e) {
        tx = e.clientX;
        ty = e.clientY;
        cursor.classList.remove('is-hidden');
        updateClasses(e.target);
      }

      window.addEventListener('mousemove', onMove, { passive: true });
      document.addEventListener('mouseover', (e) => updateClasses(e.target), { passive: true });
      window.addEventListener('mousedown', () => cursor.classList.add('is-down'));
      window.addEventListener('mouseup', () => cursor.classList.remove('is-down'));
      window.addEventListener('mouseenter', () => cursor.classList.remove('is-hidden'));
      window.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));

      window.requestAnimationFrame(frame);
    } catch {
      // Non-fatal
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupCyberCursor);
  } else {
    setupCyberCursor();
  }
})();
