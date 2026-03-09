const API_URL = "/api";

// Game State Storage
let currentWord = "";
let guessedLetters = [];
let wrongGuesses = 0;
let MAX_MISTAKES = 10;
const MISTAKE_MAPPINGS = {
  // 12 mistakes: Some misses do not draw any new limbs
  EASY: [[0], [1], [], [2], [3], [], [4], [5], [6], [7], [8], [9]],
  // 9 mistakes: Left and Right Arm drawn simultaneously on mistake 7
  MEDIUM: [[0], [1], [2], [3], [4], [5], [6], [7, 8], [9]],
  // 6 mistakes: Multi-limb rendering
  HARD: [[0, 1], [2, 3], [4], [5], [6, 7], [8, 9]]
};
let isGameOver = false;
let hintsUsed = 0;

// User & Score State
let currentUser = null;
let currentUserId = null;
let currentScore = 0;
let highestScore = 0;
let currentXp = 0;
let currentRank = "Beginner";
let currentLevel = 1;

// Timing State
let gameStartTime = 0;

// Random Event & Daily Challenge State
let scoreMultiplier = 1;
let isDailyChallenge = false;
let activeEvent = null;


// Game Config State
let selectedCategory = null;
let selectedDifficulty = null;
let currentMode = "classic"; // classic, story, multiplayer
let isSoundEnabled = localStorage.getItem("hangman_sound") !== "false";
let currentWordData = null;
let storyProgress = 1;
let currentStoryLevel = null;
let WORDS_TOTAL = 0;
let WORDS_REMAINING = 0;
let OBJECTIVE_REVEALED = true;

// DOM Elements
const loginOverlay = document.getElementById("login-overlay");
const loginBtn = document.getElementById("login-btn");
const usernameInput = document.getElementById("username-input");

const gameContainer = document.getElementById("game-container");
const currentUserSpan = document.getElementById("current-user");
const currentRankSpan = document.getElementById("current-rank");
const currentXpSpan = document.getElementById("current-xp");
const currentScoreSpan = document.getElementById("current-score");
const highScoreSpan = document.getElementById("high-score");
const logoutBtn = document.getElementById("logout-btn");
const leaderboardBtn = document.getElementById("leaderboard-btn");

const wordDisplay = document.getElementById("word-display");
const clueText = document.getElementById("clue-text");
const clueDisplay = document.getElementById("clue-display");
const hintBtn = document.getElementById("hint-btn");
const keyboardDiv = document.getElementById("keyboard");
const hangmanParts = document.querySelectorAll(".draw-part");
const redOverlay = document.getElementById("red-overlay");
const popup = document.getElementById("popup");
const popupMessage = document.getElementById("popup-message");
const nextBtn = document.getElementById("next-btn");

const leaderboardPopup = document.getElementById("leaderboard-popup");
const leaderboardBody = document.getElementById("leaderboard-body");
const closeLeaderboardBtn = document.getElementById("close-leaderboard-btn");
const lbTabs = document.querySelectorAll(".lb-tab");
const lbValHeader = document.getElementById("lb-val-header");
let currentLeaderboardData = null;

// Selection Screen Elements
const selectionScreen = document.getElementById("selection-screen");
const categorySelection = document.getElementById("category-selection");
const difficultySelection = document.getElementById("difficulty-selection");
const chosenCategoryTitle = document.getElementById("chosen-category-title");
const backToCatBtn = document.getElementById("back-to-cat-btn");
const catBtns = document.querySelectorAll(".cat-btn");
const diffBtns = document.querySelectorAll(".diff-btn");
const changeProtocolBtn = document.getElementById("change-protocol-btn");

// Intro Sequence Elements
const introOverlay = document.getElementById("intro-overlay");
const introLine1 = document.getElementById("intro-line-1");
const introLine2 = document.getElementById("intro-line-2");
const introLine3 = document.getElementById("intro-line-3");
const introLine4 = document.getElementById("intro-line-4");
const introLogo = document.getElementById("intro-logo");

// === Initialization, Intro & Login ===

setTimeout(playIntroSequence, 100);

function playIntroSequence() {
  // Line 1: 0.3s
  setTimeout(() => { introLine1.classList.add("animate-text-in"); }, 300);

  // Line 2: 1.8s
  setTimeout(() => { introLine2.classList.add("animate-text-in"); }, 1800);

  // Line 3: 3.2s
  setTimeout(() => { introLine3.classList.add("animate-text-in"); }, 3200);

  // Line 4: 4.6s
  setTimeout(() => { introLine4.classList.add("animate-text-in"); }, 4600);

  // Logo Reveal: 6.0s (Animation takes 4s, finishes at 10.0s)
  setTimeout(() => { introLogo.classList.add("animate-logo-in"); }, 6000);

  // Fade out Intro & Show Login: wait for logo animation to finish (10.0s)
  setTimeout(() => {
    introOverlay.classList.add("fade-out-overlay");
    loginOverlay.classList.remove("hidden");

    // Remove intro entirely after transition to clean DOM
    setTimeout(() => { introOverlay.remove(); }, 1000);
  }, 10000);
}

// === Tab Switching ===
document.getElementById('tab-returning').addEventListener('click', () => {
  document.getElementById('tab-returning').classList.add('active');
  document.getElementById('tab-new').classList.remove('active');
  document.getElementById('panel-returning').classList.remove('hidden');
  document.getElementById('panel-new').classList.add('hidden');
});
document.getElementById('tab-new').addEventListener('click', () => {
  document.getElementById('tab-new').classList.add('active');
  document.getElementById('tab-returning').classList.remove('active');
  document.getElementById('panel-new').classList.remove('hidden');
  document.getElementById('panel-returning').classList.add('hidden');
});

// Shared function to apply login data to the game state
function applyUserSession(data) {
  currentUser = data.username;
  currentUserId = data.user_id;
  highestScore = data.highest_score;
  currentXp = data.xp || 0;
  currentRank = data.rank || "Beginner";
  currentLevel = data.level || 1;
  storyProgress = data.story_progress || 1;
  currentScore = 0;

  currentUserSpan.innerText = `AGENT: ${currentUser.toUpperCase()}`;
  if (currentRankSpan) currentRankSpan.innerText = `RANK: ${currentRank.toUpperCase()}`;
  currentXpSpan.innerText = `EXP: ${currentXp}`;
  highScoreSpan.innerText = `${highestScore}`;
  updateScoreUI();
  updateStoryUI();

  document.getElementById("selection-title").innerHTML = `Welcome back, <span style="color: #fff">${currentUser.toUpperCase()}</span><br><br>Select Category`;

  loginOverlay.classList.add("hidden");
  selectionScreen.classList.remove("hidden");
  categorySelection.classList.remove("hidden");
  difficultySelection.classList.add("hidden");

  updateAgentHUD();
  refreshProgressHUD();
}

function updateAgentHUD() {
  const hud = document.getElementById("agent-hud");
  if (!hud) return;

  hud.classList.remove("hidden");

  const userEl = document.getElementById("hud-user");
  const rankEl = document.getElementById("hud-rank");
  const levelEl = document.getElementById("hud-level");
  const xpBar = document.getElementById("hud-xp-bar");
  const xpText = document.getElementById("hud-xp-text");
  const storyEl = document.getElementById("hud-story");

  if (userEl) userEl.innerText = currentUser.toUpperCase();
  if (rankEl) rankEl.innerText = currentRank.toUpperCase();
  if (levelEl) levelEl.innerText = currentLevel;
  if (storyEl) storyEl.innerText = `LVL ${storyProgress}`;

  // XP Progress Calculation
  const nextLevelXP = currentLevel * 100;
  const prevLevelXP = (currentLevel - 1) * 100;
  const progressInLevel = currentXp - prevLevelXP;
  const range = nextLevelXP - prevLevelXP;
  const pct = Math.min(100, Math.max(0, (progressInLevel / range) * 100));

  if (xpBar) xpBar.style.width = `${pct}%`;
  if (xpText) xpText.innerText = `${currentXp} / ${nextLevelXP} XP`;

  // Objective Progress
  const objectiveEl = document.getElementById("hud-objective");
  const objBar = document.getElementById("hud-obj-bar");
  if (objectiveEl && WORDS_TOTAL > 0) {
    const completed = WORDS_TOTAL - WORDS_REMAINING;
    // Cap completion at 100% just in case of stale data
    const safeCompleted = Math.min(completed, WORDS_TOTAL);
    objectiveEl.innerText = `${safeCompleted} / ${WORDS_TOTAL} UNITS`;
    if (objBar) {
      const objPct = (safeCompleted / WORDS_TOTAL) * 100;
      objBar.style.width = `${objPct}%`;
    }
  }
}

// Returning Player Login
loginBtn.addEventListener("click", handleLogin);
usernameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });

async function handleLogin() {
  const username = usernameInput.value.trim();
  const errorMsg = document.getElementById("login-error-msg");
  errorMsg.innerText = "AUTHENTICATING...";
  errorMsg.classList.remove("success");
  if (!username) {
    errorMsg.innerText = "";
    return;
  }

  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();

    if (res.ok) {
      applyUserSession(data);
    } else {
      errorMsg.innerText = data.error || "LOGIN FAILED.";
    }
  } catch (err) {
    console.error("Login Error:", err);
    errorMsg.innerText = "BACKEND UNREACHABLE.";
  }
}

// New Recruit Registration
const registerBtn = document.getElementById("register-btn");
const registerInput = document.getElementById("register-username-input");
registerBtn.addEventListener("click", handleRegister);
registerInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleRegister(); });

async function handleRegister() {
  const username = registerInput.value.trim();
  const errorMsg = document.getElementById("register-error-msg");
  errorMsg.innerText = "ENLISTING...";
  errorMsg.classList.remove("success");
  if (!username) {
    errorMsg.innerText = "";
    return;
  }

  try {
    const res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();

    if (res.ok) {
      errorMsg.classList.add("success");
      errorMsg.innerText = "ENLISTED! Logging in...";
      setTimeout(() => applyUserSession(data), 1200);
    } else {
      errorMsg.innerText = data.error || "REGISTRATION FAILED.";
    }
  } catch (err) {
    console.error("Register Error:", err);
    errorMsg.innerText = "BACKEND UNREACHABLE.";
  }
}

logoutBtn.addEventListener("click", () => {
  currentUser = null;
  currentUserId = null;
  // Clear both login panels
  usernameInput.value = "";
  registerInput.value = "";
  document.getElementById("login-error-msg").innerText = "";
  document.getElementById("register-error-msg").innerText = "";
  // Reset tabs back to Returning Player
  document.getElementById("tab-returning").classList.add("active");
  document.getElementById("tab-new").classList.remove("active");
  document.getElementById("panel-returning").classList.remove("hidden");
  document.getElementById("panel-new").classList.add("hidden");
  gameContainer.classList.add("hidden");
  selectionScreen.classList.add("hidden");
  loginOverlay.classList.remove("hidden");
});

// === Sound Toggle ===
const soundToggle = document.getElementById("sound-toggle");
if (soundToggle) {
  soundToggle.innerText = isSoundEnabled ? "🔊" : "🔈";
  soundToggle.addEventListener("click", () => {
    isSoundEnabled = !isSoundEnabled;
    localStorage.setItem("hangman_sound", isSoundEnabled);
    soundToggle.innerText = isSoundEnabled ? "🔊" : "🔈";
    playSfx("click");
  });
}

function playSfx(type) {
  if (!isSoundEnabled) return;
  // Synthesized sounds for now since no assets exist
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  if (type === "correct") {
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
  } else if (type === "wrong") {
    osc.frequency.setValueAtTime(220, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.2);
  } else if (type === "click") {
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.05);
  } else if (type === "win") {
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.5);
  }

  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

// === Mode Selector ===
const modeBtns = {
  classic: document.getElementById("mode-classic"),
  story: document.getElementById("mode-story"),
  multiplayer: document.getElementById("mode-multiplayer")
};

const grids = {
  classic: document.getElementById("classic-categories"),
  story: document.getElementById("story-levels"),
  multiplayer: document.getElementById("multiplayer-options")
};

Object.keys(modeBtns).forEach(mode => {
  if (modeBtns[mode]) {
    modeBtns[mode].addEventListener("click", () => {
      currentMode = mode;
      Object.keys(modeBtns).forEach(m => modeBtns[m].classList.remove("active"));
      modeBtns[mode].classList.add("active");

      Object.keys(grids).forEach(g => grids[g].classList.add("hidden"));
      grids[mode].classList.remove("hidden");
      playSfx("click");
    });
  }
});

// === Hint System V2 ===
const hintRevealCat = document.getElementById("hint-reveal-cat");
const hintRevealDesc = document.getElementById("hint-reveal-desc");
const hintRevealLetter = document.getElementById("hint-reveal-letter");
const hintDisplayArea = document.getElementById("hint-display-area");
const clueDisplayV2 = document.getElementById("clue-display-v2");

if (hintRevealCat) {
  hintRevealCat.addEventListener("click", () => {
    if (isGameOver) return;
    clueDisplayV2.innerText = `CATEGORY: ${currentWordData.category}`;
    hintDisplayArea.classList.remove("hidden");
    hintRevealCat.classList.add("disabled");
    hintRevealCat.disabled = true;
    playSfx("click");
  });
}

if (hintRevealDesc) {
  hintRevealDesc.addEventListener("click", async () => {
    if (isGameOver || currentXp < 20) return;
    clueDisplayV2.innerText = `INTEL: ${currentWordData.description || currentWordData.clue}`;
    hintDisplayArea.classList.remove("hidden");
    hintRevealDesc.classList.add("disabled");
    hintRevealDesc.disabled = true;

    // Deduct XP via API
    await fetch(`${API_URL}/hints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: currentUserId, type: 'description', word: currentWord })
    });
    currentXp -= 20;
    currentXpSpan.innerText = `EXP: ${currentXp}`;
    playSfx("click");
  });
}

if (hintRevealLetter) {
  hintRevealLetter.addEventListener("click", async () => {
    if (isGameOver || currentXp < 50) return;
    const unGuessed = currentWord.split("").filter(l => !guessedLetters.includes(l));
    if (unGuessed.length > 0) {
      const randLetter = unGuessed[Math.floor(Math.random() * unGuessed.length)];
      handleGuess(randLetter);

      // Deduct XP via API
      await fetch(`${API_URL}/hints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId, type: 'letter', word: currentWord })
      });
      currentXp -= 50;
      currentXpSpan.innerText = `EXP: ${currentXp}`;
    }
  });
}

// === Game Logic ===

async function initGame() {
  // Reset Variables
  guessedLetters = [];
  wrongGuesses = 0;
  isGameOver = false;
  hintsUsed = 0;
  gameStartTime = Date.now();

  // Reset Hint UI
  if (hintRevealCat) {
    hintRevealCat.classList.remove("disabled");
    hintRevealCat.disabled = false;
  }
  if (hintRevealDesc) {
    hintRevealDesc.classList.add("locked");
    hintRevealDesc.disabled = true; // Initially locked until some progress or specific mode
    if (currentXp >= 200) { // Example: Unlocks after 200 total XP
      hintRevealDesc.classList.remove("locked");
      hintRevealDesc.disabled = false;
    }
  }
  if (hintRevealLetter) {
    hintRevealLetter.classList.remove("disabled");
    hintRevealLetter.disabled = false;
  }
  if (hintDisplayArea) {
    hintDisplayArea.classList.add("hidden");
    clueDisplayV2.innerText = "";
  }
  // Clue display should be visible immediately in new layout
  if (clueDisplay) {
    clueDisplay.classList.remove("hidden");
    clueText.innerText = "DECRYPTING...";
  }

  // Reset DOM Classes
  gameContainer.classList.remove("win-state", "loss-state", "game-loss", "game-container-shake");
  redOverlay.classList.remove("active");
  popup.classList.remove("show", "popup-win", "popup-loss");
  clueText.innerText = "FETCHING_DATA...";

  const progressBar = document.getElementById("game-progress-bar");
  if (progressBar) progressBar.style.width = "0%";

  // Hide Escape Container
  const escapeContainer = document.getElementById("escape-container");
  if (escapeContainer) {
    escapeContainer.classList.add("hidden");
    const portal = escapeContainer.querySelector('.escape-portal');
    const runner = escapeContainer.querySelector('.escape-runner-container');
    const particles = escapeContainer.querySelector('.particles');

    if (portal) portal.classList.remove("open");
    if (runner) runner.classList.remove("escaping");
    if (particles) particles.innerHTML = "";
  }

  // Clear hangman SVG & remove detachment classes
  hangmanParts.forEach(part => {
    part.classList.remove("drawn", "detach-head", "detach-body");
  });

  // Fetch Word from Python Backend (Smart Anti-Repetition)
  try {
    let url = `${API_URL}/word?user_id=${currentUserId}`;
    if (selectedCategory && selectedCategory !== "RANDOM") url += `&category=${selectedCategory}`;
    if (selectedDifficulty) url += `&difficulty=${selectedDifficulty}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("API Fetch Failed");
    const data = await res.json();

    // Check for exhaustion
    if (data.status === "exhausted") {
      isGameOver = true;

      setTimeout(() => {
        gameContainer.classList.add("win-state");
        popup.classList.add("show", "popup-win");
        popup.classList.remove("popup-loss");
        popupMessage.innerText = "You have saved all the men in this difficulty context!";
        nextBtn.innerText = "Return to Protocol Context";
      }, 500);

      return; // Halt game initialization here
    }

    currentWordData = data;
    currentWord = data.word.toUpperCase();
    clueText.innerText = data.clue || "DECRYPTED_SIGNAL_STABLE";

    // Track category progress
    WORDS_TOTAL = data.words_total || 0;
    WORDS_REMAINING = data.words_remaining || 0;
    updateAgentHUD();

    renderWord();
    renderKeyboard();

    // Roll a random event after word loads (15% chance, skip on daily)
    if (!isDailyChallenge) {
      scoreMultiplier = 1;
      rollRandomEvent();
    }
  } catch (err) {
    console.error("Word Fetch Error", err);
    clueText.innerText = "ERROR_FETCHING_DATA";
  }
}

function updateScoreUI() {
  currentScoreSpan.innerText = `${currentScore}`;
}

async function submitFinalScore(isWin = null, xpGained = 0, timeTaken = null) {
  // Always submit on win/loss for XP, streaks, and loss counts
  if (!currentUserId || isWin === null) return;
  try {
    const res = await fetch(`${API_URL}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUserId,
        score: currentScore,
        xp_added: xpGained * scoreMultiplier,
        is_win: isWin,
        time_taken: timeTaken,
        wrong_guesses: wrongGuesses,
        word: currentWord,
        category: selectedCategory,
        difficulty: selectedDifficulty,
        is_story: currentMode === "story",
        story_level: currentStoryLevel
      })
    });
    const data = await res.json();
    if (data.highest_score > highestScore) {
      highestScore = data.highest_score;
      highScoreSpan.innerText = `${highestScore}`;
    }
    if (data.xp !== undefined) {
      currentXp = data.xp;
      currentRank = data.rank;
      currentLevel = data.level;
      storyProgress = data.story_progress || storyProgress;
      currentXpSpan.innerText = `EXP: ${currentXp}`;
      currentRankSpan.innerText = `RANK: ${currentRank.toUpperCase()}`;
      updateStoryUI();
      updateAgentHUD();
    }
    // Show achievement unlock notifications
    if (data.new_achievements && data.new_achievements.length > 0) {
      data.new_achievements.forEach((ach, i) => {
        setTimeout(() => showAchievementToast(ach), i * 2000);
      });
    }
    refreshProgressHUD();
  } catch (err) {
    console.error("Score Submit Error:", err);
  }
}

function renderWord() {
  wordDisplay.innerHTML = "";
  const uniqueLetters = new Set(currentWord.split("")).size;
  const correctGuessed = currentWord.split("").filter(l => guessedLetters.includes(l));
  const uniqueCorrect = new Set(correctGuessed).size;

  const progressPercent = (uniqueCorrect / uniqueLetters) * 100;
  const progressBar = document.getElementById("game-progress-bar");
  if (progressBar) progressBar.style.width = `${progressPercent}%`;

  currentWord.split("").forEach(letter => {
    const box = document.createElement("div");
    box.className = "letter-box";
    if (guessedLetters.includes(letter)) {
      box.innerText = letter;
    } else {
      box.innerText = "";
    }
    wordDisplay.appendChild(box);
  });
}

function renderKeyboard() {
  keyboardDiv.innerHTML = "";
  const keyboardLayout = "QWERTYUIOPASDFGHJKLZXCVBNM".split("");

  keyboardLayout.forEach(letter => {
    const btn = document.createElement("button");
    btn.className = "key";
    btn.innerText = letter;
    btn.id = `key-${letter}`;

    if (guessedLetters.includes(letter)) {
      if (currentWord.includes(letter)) {
        btn.classList.add("correct", "disabled");
      } else {
        btn.classList.add("wrong", "disabled");
      }
    }

    btn.addEventListener("click", () => handleGuess(letter));
    keyboardDiv.appendChild(btn);
  });
}

function handleGuess(letter) {
  if (isGameOver || guessedLetters.includes(letter)) return;

  guessedLetters.push(letter);

  if (currentWord.includes(letter)) {
    // Correct
    renderWord();
    document.getElementById(`key-${letter}`).classList.add("correct", "disabled");
    currentScore += 100; // Reward per correct letter
    updateScoreUI();
    playSfx("correct");
    checkWin();
  } else {
    // Incorrect
    document.getElementById(`key-${letter}`).classList.add("wrong", "disabled");
    currentScore = Math.max(0, currentScore - 50); // 50pt penalty per wrong guess
    updateScoreUI();
    playSfx("wrong");

    if (wrongGuesses < MAX_MISTAKES) {
      // BUG FIX: Guard against null difficulty (edge case on protocol change mid-game)
      const mapping = MISTAKE_MAPPINGS[selectedDifficulty];
      const partsToDraw = mapping ? mapping[wrongGuesses] : null;
      if (partsToDraw) {
        partsToDraw.forEach(partIdx => {
          const partEl = document.querySelector(`.part-${partIdx}`);
          if (partEl) partEl.classList.add("drawn");
        });
      }
      wrongGuesses++;
    }
    checkLoss();
  }
}

function checkWin() {
  const won = currentWord.split("").every(letter => guessedLetters.includes(letter));
  if (won) {
    isGameOver = true;
    currentScore += 1000;
    updateScoreUI();
    playSfx("win");
    const timeTaken = Math.floor((Date.now() - gameStartTime) / 1000);
    submitFinalScore(true, 150, timeTaken);

    // Mark daily complete if this was a daily challenge
    if (isDailyChallenge && currentUserId) {
      fetch(`${API_URL}/daily_complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: currentUserId })
      }).catch(() => { });
      isDailyChallenge = false;
    }
    // Cinematic Escape Sequence
    const escapeContainer = document.getElementById("escape-container");
    const portal = escapeContainer.querySelector('.escape-portal');
    const runner = escapeContainer.querySelector('.escape-runner-container');
    const particlesContainer = escapeContainer.querySelector('.particles');

    setTimeout(() => {
      // Hide standard hangman and shake screen
      const hangmanDisplay = document.querySelector('.hangman-display');
      if (hangmanDisplay) hangmanDisplay.style.opacity = '0';
      gameContainer.classList.add("game-container-shake");

      setTimeout(() => {
        // Screen stabilizes, tear open the portal
        gameContainer.classList.remove("game-container-shake");
        escapeContainer.classList.remove("hidden");
        portal.classList.add("open");

        // Spawn Particles
        for (let i = 0; i < 30; i++) {
          const p = document.createElement('div');
          p.classList.add('particle');
          p.style.left = `50%`;
          p.style.top = `50%`;

          // Random explosion trajectory
          const angle = Math.random() * Math.PI * 2;
          const distance = 50 + Math.random() * 150;
          const tx = Math.cos(angle) * distance;
          const ty = Math.sin(angle) * distance;

          p.animate([
            { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
            { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0)`, opacity: 0 }
          ], {
            duration: 1000 + Math.random() * 1000,
            easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
            fill: 'forwards'
          });
          particlesContainer.appendChild(p);
        }

        // Runner dashes in
        setTimeout(() => {
          runner.classList.add("escaping");

          // Glitch flash right as he enters portal
          setTimeout(() => {
            escapeContainer.classList.add('glitch-flash');

            // Show final victory popup
            setTimeout(() => {
              escapeContainer.classList.add("hidden");
              escapeContainer.classList.remove('glitch-flash');
              const hangmanDisplay = document.querySelector('.hangman-display');
              if (hangmanDisplay) hangmanDisplay.style.opacity = '1';

              gameContainer.classList.add("win-state");
              console.log("Adding classes");
              popup.classList.add("show", "popup-win");
              popup.classList.remove("popup-loss");
              popupMessage.innerText = "Protocol breached. Agent evacuated successfully.";
            }, 500);

          }, 2800); // Wait for runner animation near completion

        }, 500); // 0.5s after portal opens

      }, 500); // Earthquake duration
    }, 500); // Initial delay to show word completion
  }
}

function checkLoss() {
  if (wrongGuesses >= MAX_MISTAKES) {
    isGameOver = true;
    const timeTaken = Math.floor((Date.now() - gameStartTime) / 1000);
    submitFinalScore(false, 10, timeTaken); // Save score, small XP for trying
    currentScore = 0; // Reset for next sequence
    updateScoreUI();

    // Reveal word
    wordDisplay.innerHTML = "";
    currentWord.split("").forEach(letter => {
      const box = document.createElement("div");
      box.className = "letter-box";
      box.innerText = letter;
      wordDisplay.appendChild(box);
    });

    // Death Animation Sequence Let user see the final leg get drawn
    setTimeout(() => {
      redOverlay.classList.add("active");
      gameContainer.classList.add("loss-state", "game-loss");

      // Apply detachment to SVG elements
      const head = document.querySelector('.part-4');
      const body = [
        document.querySelector('.part-5'), // Torso
        document.querySelector('.part-6'), // L Arm
        document.querySelector('.part-7'), // R Arm
        document.querySelector('.part-8'), // L Leg
        document.querySelector('.part-9')  // R Leg
      ];

      if (head) head.classList.add('detach-head');
      body.forEach(p => { if (p) p.classList.add('detach-body'); });

      // Wait for the disintegration before showing the popup
      setTimeout(() => {
        popup.classList.add("show", "popup-loss");
        popup.classList.remove("popup-win");
        popupMessage.innerText = "your man is dead but dont give up he is immortal";
      }, 1500); // 1.5s delay fits the CSS animations

    }, 300); // Wait briefly after the leg is drawn to process the horror
  }
}

// === Leaderboard Logic ===

function renderLeaderboard(type) {
  leaderboardBody.innerHTML = "";
  if (!currentLeaderboardData) return;

  const dataArr = currentLeaderboardData[type] || [];

  if (type === "score") lbValHeader.innerText = "SCORE";
  else if (type === "speed") lbValHeader.innerText = "SECONDS";
  else if (type === "streak") lbValHeader.innerText = "STREAK";

  dataArr.forEach((entry, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${index + 1}</td>
      <td>${entry.username.toUpperCase()}</td>
      <td>${entry.val}</td>
    `;
    leaderboardBody.appendChild(tr);
  });
}

lbTabs.forEach(tab => {
  tab.addEventListener("click", (e) => {
    lbTabs.forEach(t => t.classList.remove("active"));
    e.target.classList.add("active");
    const type = e.target.getAttribute("data-leaderboard");
    renderLeaderboard(type);
  });
});

leaderboardBtn.addEventListener("click", async () => {
  try {
    const res = await fetch(`${API_URL}/highscores`);
    currentLeaderboardData = await res.json();

    // Reset to default tab
    lbTabs.forEach(t => t.classList.remove("active"));
    document.querySelector('.lb-tab[data-leaderboard="score"]').classList.add("active");
    renderLeaderboard("score");

    leaderboardPopup.classList.remove("hidden");
  } catch (err) {
    console.error("Leaderboard Error", err);
  }
});

closeLeaderboardBtn.addEventListener("click", () => {
  leaderboardPopup.classList.add("hidden");
});

// === Keyboard Mapping ===
document.addEventListener("keydown", (e) => {
  if (!currentUser) return; // Ignore if playing login

  if (isGameOver) {
    if (e.key === "Enter" && popup.classList.contains("show")) {
      initGame();
    }
    return;
  }
  const key = e.key.toUpperCase();
  if (/^[A-Z]$/.test(key)) {
    handleGuess(key);
  }
});

// === Selection & Navigation Logic ===
const domainQuotes = {
  "DATABASE": '"Without data, you\'re just another person with an opinion."\n- W. Edwards Deming',
  "DATA_STRUCTURE": '"Bad programmers worry about the code. Good programmers worry about data structures."\n- Linus Torvalds',
  "JAVA": '"Java is C++ without the guns, clubs and knives."\n- James Gosling',
  "PYTHON": '"Readability counts. Beautiful is better than ugly."\n- The Zen of Python',
  "C": '"C is quirky, flawed, and an enormous success."\n- Dennis Ritchie',
  "CPP": '"In C++ it\'s harder to shoot yourself in the foot, but when you do, you blow off your whole leg."\n- Bjarne Stroustrup',
  "GENERAL_KNOWLEDGE": '"An investment in knowledge pays the best interest."\n- Benjamin Franklin',
  "ARTIFICIAL_INTELLIGENCE": '"Artificial intelligence is the new electricity."\n- Andrew Ng',
  "OPERATING_SYSTEM": '"The art of programming is the art of organizing complexity."\n- Edsger W. Dijkstra',
  "CODE_OUTPUT": '"First, solve the problem. Then, write the code."\n- John Johnson',
  "NETWORKING": '"Success is the result of preparation, hard work, and learning from failure."\n- Colin Powell',
  "CYBERSECURITY": '"The only truly secure system is one that is powered off, cast in a block of concrete and sealed in a lead-lined room."\n- Gene Spafford',
  "WEBDEVELOPMENT": '"Websites should look good from the inside and out."\n- Paul Cookson',
  "SOFTWAREENGINEERING": '"Software is a great combination between artistry and engineering."\n- Bill Gates',
  "LINUX": '"In a world without fences and walls, who needs Gates and Windows?"\n- Unknown',
  "CLOUD": '"There is no cloud, it\'s just someone else\'s computer."\n- Unknown',
  "DATASCIENCE": '"Data is the new oil."\n- Clive Humby'
};


const defaultLogo = `
<svg class="cross-svg" viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
    <line x1="50" y1="10" x2="50" y2="140" class="cross-line" />
    <line x1="20" y1="40" x2="80" y2="40" class="cross-line" />
</svg>
`;

const defaultQuote = `"For the Son of Man came to seek and to save the lost." <br><span class="quote-ref">- Luke 19:10</span>`;

const domainLogos = {
  "DATABASE": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="50" cy="25" rx="35" ry="12" class="logo-stroke" fill="none"/>
    <path d="M 15 25 L 15 50 A 35 12 0 0 0 85 50 L 85 25" class="logo-stroke" fill="none"/>
    <path d="M 15 50 L 15 75 A 35 12 0 0 0 85 75 L 85 50" class="logo-stroke" fill="none"/>
</svg>`,
  "DATA_STRUCTURE": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="20" r="10" class="logo-stroke" fill="none"/>
    <circle cx="20" cy="60" r="10" class="logo-stroke" fill="none"/>
    <circle cx="80" cy="60" r="10" class="logo-stroke" fill="none"/>
    <circle cx="50" cy="90" r="10" class="logo-stroke" fill="none"/>
    <line x1="42" y1="26" x2="28" y2="54" class="logo-stroke"/>
    <line x1="58" y1="26" x2="72" y2="54" class="logo-stroke"/>
    <line x1="28" y1="66" x2="42" y2="84" class="logo-stroke"/>
</svg>`,
  "JAVA": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M 25 40 L 25 70 A 25 15 0 0 0 75 70 L 75 40 Z" class="logo-stroke" fill="none"/>
    <path d="M 75 45 A 15 10 0 0 1 75 65" class="logo-stroke" fill="none"/>
    <path d="M 40 15 Q 50 25 40 35" class="logo-stroke" fill="none"/>
    <path d="M 60 15 Q 70 25 60 35" class="logo-stroke" fill="none"/>
    <line x1="15" y1="85" x2="85" y2="85" class="logo-stroke"/>
</svg>`,
  "PYTHON": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="25" y="20" width="35" height="35" rx="8" class="logo-stroke" fill="none"/>
    <rect x="40" y="45" width="35" height="35" rx="8" class="logo-stroke" fill="none"/>
    <circle cx="35" cy="30" r="4" fill="var(--neon-cyan)"/>
    <circle cx="65" cy="70" r="4" fill="var(--neon-cyan)"/>
</svg>`,
  "C": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M 75 30 A 35 35 0 1 0 75 70" class="logo-stroke" fill="none"/>
</svg>`,
  "CPP": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M 45 30 A 30 30 0 1 0 45 70" class="logo-stroke" fill="none"/>
    <line x1="55" y1="50" x2="75" y2="50" class="logo-stroke"/>
    <line x1="65" y1="40" x2="65" y2="60" class="logo-stroke"/>
    <line x1="80" y1="50" x2="100" y2="50" class="logo-stroke"/>
    <line x1="90" y1="40" x2="90" y2="60" class="logo-stroke"/>
</svg>`,
  "GENERAL_KNOWLEDGE": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="40" class="logo-stroke" fill="none"/>
    <ellipse cx="50" cy="50" rx="15" ry="40" class="logo-stroke" fill="none"/>
    <line x1="10" y1="50" x2="90" y2="50" class="logo-stroke"/>
</svg>`,
  "NETWORKING": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="8" class="logo-stroke" fill="none"/>
    <circle cx="80" cy="20" r="8" class="logo-stroke" fill="none"/>
    <circle cx="50" cy="50" r="8" class="logo-stroke" fill="none"/>
    <circle cx="20" cy="80" r="8" class="logo-stroke" fill="none"/>
    <circle cx="80" cy="80" r="8" class="logo-stroke" fill="none"/>
    <line x1="28" y1="20" x2="42" y2="42" class="logo-stroke"/>
    <line x1="72" y1="20" x2="58" y2="42" class="logo-stroke"/>
    <line x1="28" y1="80" x2="42" y2="58" class="logo-stroke"/>
    <line x1="72" y1="80" x2="58" y2="58" class="logo-stroke"/>
</svg>`,
  "CYBERSECURITY": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M 50 10 L 15 25 L 15 50 Q 15 80 50 90 Q 85 80 85 50 L 85 25 Z" class="logo-stroke" fill="none"/>
    <rect x="40" y="45" width="20" height="15" rx="2" class="logo-stroke" fill="none"/>
    <path d="M 45 45 L 45 35 A 5 5 0 0 1 55 35 L 55 45" class="logo-stroke" fill="none"/>
</svg>`,
  "WEBDEVELOPMENT": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M 30 40 L 15 50 L 30 60" class="logo-stroke" fill="none"/>
    <path d="M 70 40 L 85 50 L 70 60" class="logo-stroke" fill="none"/>
    <line x1="55" y1="35" x2="45" y2="65" class="logo-stroke"/>
</svg>`,
  "SOFTWAREENGINEERING": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="15" class="logo-stroke" fill="none"/>
    <circle cx="65" cy="65" r="15" class="logo-stroke" fill="none"/>
    <line x1="40" y1="25" x2="40" y2="55" class="logo-stroke"/>
    <line x1="25" y1="40" x2="55" y2="40" class="logo-stroke"/>
    <line x1="65" y1="50" x2="65" y2="80" class="logo-stroke"/>
    <line x1="50" y1="65" x2="80" y2="65" class="logo-stroke"/>
</svg>`,
  "LINUX": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="20" width="80" height="60" rx="5" class="logo-stroke" fill="none"/>
    <path d="M 25 45 L 35 50 L 25 55" class="logo-stroke" fill="none"/>
    <line x1="40" y1="60" x2="55" y2="60" class="logo-stroke"/>
</svg>`,
  "CLOUD": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <path d="M 25 70 A 15 15 0 0 1 25 40 A 20 20 0 0 1 60 30 A 20 20 0 0 1 85 50 A 15 15 0 0 1 75 80 Z" class="logo-stroke" fill="none"/>
</svg>`,
  "DATASCIENCE": `<svg class="domain-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
    <line x1="20" y1="80" x2="80" y2="80" class="logo-stroke"/>
    <line x1="20" y1="80" x2="20" y2="20" class="logo-stroke"/>
    <rect x="30" y="50" width="10" height="30" class="logo-stroke" fill="none"/>
    <rect x="45" y="35" width="10" height="45" class="logo-stroke" fill="none"/>
    <rect x="60" y="20" width="10" height="60" class="logo-stroke" fill="none"/>
</svg>`
};

function formatQuoteForLeftPanel(text) {
  const parts = text.split('\n');
  if (parts.length > 1) {
    return `${parts[0]} <br><span class="quote-ref">${parts[1]}</span>`;
  }
  return text;
}

const quoteTransitionOverlay = document.getElementById("quote-transition-overlay");
const domainCategoryName = document.getElementById("domain-category-name");
const domainQuoteText = document.getElementById("domain-quote-text");

catBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    selectedCategory = btn.getAttribute("data-cat");
    const displayCategory = selectedCategory.replace("_", " ");

    // Set text
    domainCategoryName.innerText = displayCategory;
    domainQuoteText.innerText = domainQuotes[selectedCategory] || '"Knowledge is power."';

    // Reset animation
    domainQuoteText.classList.remove("animate-quote-in");
    void domainQuoteText.offsetWidth; // trigger reflow

    // Show overlay and Animate
    quoteTransitionOverlay.classList.remove("hidden");
    domainQuoteText.classList.add("animate-quote-in");

    // Hide overlay after animation finishes (3.5s)
    setTimeout(() => {
      quoteTransitionOverlay.classList.add("hidden");
      chosenCategoryTitle.innerText = "TARGET SYSTEM: " + displayCategory;
      categorySelection.classList.add("hidden");
      difficultySelection.classList.remove("hidden");

      // Update Left Panel
      document.getElementById("left-logo-container").innerHTML = domainLogos[selectedCategory] || defaultLogo;
      document.getElementById("left-quote-container").innerHTML = formatQuoteForLeftPanel(domainQuotes[selectedCategory] || defaultQuote);
    }, 3500);
  });
});

backToCatBtn.addEventListener("click", () => {
  difficultySelection.classList.add("hidden");
  categorySelection.classList.remove("hidden");
  selectedCategory = null;
  document.getElementById("left-logo-container").innerHTML = defaultLogo;
  document.getElementById("left-quote-container").innerHTML = defaultQuote;
});

diffBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    selectedDifficulty = btn.getAttribute("data-diff");
    MAX_MISTAKES = MISTAKE_MAPPINGS[selectedDifficulty].length;
    selectionScreen.classList.add("hidden");
    gameContainer.classList.remove("hidden");
    initGame();
  });
});

changeProtocolBtn.addEventListener("click", () => {
  isGameOver = true;
  gameContainer.classList.add("hidden");
  popup.classList.remove("show");
  redOverlay.classList.remove("active");
  selectionScreen.classList.remove("hidden");
  categorySelection.classList.remove("hidden");
  difficultySelection.classList.add("hidden");
  selectedCategory = null;
  selectedDifficulty = null;
  document.getElementById("left-logo-container").innerHTML = defaultLogo;
  document.getElementById("left-quote-container").innerHTML = defaultQuote;
});

// UI Event Mapping
nextBtn.addEventListener("click", () => {
  if (isGameOver && wrongGuesses < MAX_MISTAKES) {
    submitFinalScore(); // Save immediately if beat
  }

  if (nextBtn.innerText === "Return to Protocol Context") {
    nextBtn.innerText = "are u ready to save another man";
    // Manually trigger "change protocol" to reset state
    isGameOver = true;
    gameContainer.classList.add("hidden");
    popup.classList.remove("show");
    redOverlay.classList.remove("active");
    selectionScreen.classList.remove("hidden");
    categorySelection.classList.remove("hidden");
    difficultySelection.classList.add("hidden");
    selectedCategory = null;
    selectedDifficulty = null;
    document.getElementById("left-logo-container").innerHTML = defaultLogo;
    document.getElementById("left-quote-container").innerHTML = defaultQuote;
  } else {
    initGame();
  }
});

// =========================================================
// === PHASE 3: DAILY MISSION ==============================
// =========================================================

const dailyBtn = document.getElementById('daily-btn');

dailyBtn.addEventListener('click', async () => {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_URL}/daily_challenge?user_id=${currentUserId}`);
    const data = await res.json();

    if (data.already_completed) {
      showToast('⭐ DAILY MISSION COMPLETE', 'You already conquered today\'s mission. Come back tomorrow!', '#00ffcc');
      return;
    }

    // Start the daily game with this word directly
    isDailyChallenge = true;
    scoreMultiplier = 5; // 5x XP and score for daily

    // Set game state and switch to game screen
    selectedCategory = data.category;
    selectedDifficulty = data.difficulty;
    MAX_MISTAKES = MISTAKE_MAPPINGS[selectedDifficulty]?.length || 9;

    selectionScreen.classList.add('hidden');
    gameContainer.classList.remove('hidden');

    // Init the game using the daily word directly
    guessedLetters = [];
    wrongGuesses = 0;
    isGameOver = false;
    hintsUsed = 0;
    gameStartTime = Date.now();
    currentWord = data.word.toUpperCase();

    // Reset Hint UI
    if (hintBtn) { hintBtn.innerText = 'GET HINT (FREE)'; hintBtn.classList.remove('disabled'); hintBtn.disabled = false; }
    if (clueDisplay) clueDisplay.classList.add('hidden');
    clueText.innerText = `[DAILY] ${data.clue}`;

    // Reset DOM state
    gameContainer.classList.remove('win-state', 'loss-state', 'game-loss', 'game-container-shake');
    redOverlay.classList.remove('active');
    popup.classList.remove('show', 'popup-win', 'popup-loss');
    hangmanParts.forEach(p => p.classList.remove('drawn', 'detach-head', 'detach-body'));
    const escEl = document.getElementById('escape-container');
    if (escEl) { escEl.classList.add('hidden'); }

    renderWord();
    renderKeyboard();

    showToast('📅 DAILY MISSION ACTIVE', `5x XP & SCORE ACTIVE! Category: ${data.category}`, '#ffd700');

    // Mark complete on win — hooked into checkWin via isDailyChallenge flag
  } catch (err) {
    console.error('Daily Challenge Error', err);
  }
});

// Daily complete is handled directly inside checkWin above


// =========================================================
// === PHASE 3: RANDOM EVENTS ==============================
// =========================================================

const RANDOM_EVENTS = [
  {
    id: 'double_score',
    name: '⚡ DOUBLE SCORE',
    desc: 'All points this round are doubled. Make it count.',
    apply: () => { scoreMultiplier = 2; }
  },
  {
    id: 'mystery_hint',
    name: '🔮 MYSTERY HINT',
    desc: 'A random letter has been revealed. Use it wisely.',
    apply: () => {
      // Reveal one random letter after word is loaded
      setTimeout(() => {
        const unguessed = currentWord.split('').filter(l => !guessedLetters.includes(l));
        if (unguessed.length > 0) {
          const lucky = unguessed[Math.floor(Math.random() * unguessed.length)];
          handleGuess(lucky);
        }
      }, 500);
    }
  },
  {
    id: 'critical_failure',
    name: '☠ CRITICAL FAILURE',
    desc: 'Max mistakes REDUCED by 2. But XP reward is tripled.',
    apply: () => { MAX_MISTAKES = Math.max(2, MAX_MISTAKES - 2); scoreMultiplier = 3; }
  }
];

function rollRandomEvent() {
  // Reset multiplier each new game
  scoreMultiplier = 1;
  activeEvent = null;

  if (isDailyChallenge) return; // Daily already has its own multiplier

  // 15% chance
  if (Math.random() > 0.15) return;

  const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
  activeEvent = event;

  // Apply the event effect
  event.apply();

  // Show the Anomaly popup
  const anomalyPopup = document.getElementById('anomaly-popup');
  document.getElementById('anomaly-event-name').innerText = event.name;
  document.getElementById('anomaly-event-desc').innerText = event.desc;
  anomalyPopup.classList.remove('hidden');

  document.getElementById('anomaly-confirm-btn').onclick = () => {
    anomalyPopup.classList.add('hidden');
  };
}

// rollRandomEvent is called inline inside initGame above

// =========================================================
// === PHASE 3: TROPHIES / ACHIEVEMENTS ====================
// =========================================================

const ACHIEVEMENT_DATA = {
  // ── Win Milestones ───────────────────────────────────────
  'First Blood': { icon: '🩸', desc: 'Win your first game.', tier: 'starter' },
  'Bronze': { icon: '🥉', desc: 'Win 10 games.', tier: 'bronze' },
  'Silver': { icon: '🥈', desc: 'Win 25 games.', tier: 'silver' },
  'Gold': { icon: '🥇', desc: 'Win 50 games.', tier: 'gold' },
  'Platinum': { icon: '💠', desc: 'Win 100 games. Unstoppable.', tier: 'platinum' },
  // ── Skill ────────────────────────────────────────────────
  'Flawless': { icon: '💎', desc: 'Win without a single wrong guess.', tier: 'gold' },
  // ── Level Milestones ─────────────────────────────────────
  'Guru': { icon: '🧠', desc: 'Reach Level 10.', tier: 'silver' },
  'Ace': { icon: '🎖️', desc: 'Reach Level 20.', tier: 'gold' },
  'Ace Master': { icon: '👑', desc: 'Reach Level 30.', tier: 'platinum' },
  // ── XP Milestones ────────────────────────────────────────
  'Conqueror': { icon: '⚔️', desc: 'Accumulate 10,000 XP.', tier: 'gold' },
  'Omnipotent': { icon: '⚡', desc: 'Accumulate 25,000 XP. A legend.', tier: 'cosmic' },
  // ── Loss Badges ──────────────────────────────────────────
  'Die Hard': { icon: '💀', desc: 'Accumulate 50 losses. Respect.', tier: 'bronze' },
  'One Below All': { icon: '🕳️', desc: '100 losses. You exist below defeat itself.', tier: 'dark' },
  // ── Ultimate ─────────────────────────────────────────────
  'One Above All': { icon: '🌟', desc: 'Win 200 games. You transcend the game.', tier: 'cosmic' },
};


const trophiesBtn = document.getElementById('trophies-btn');
const achievementsPopup = document.getElementById('achievements-popup');
const achievementsList = document.getElementById('achievements-list');
const closeAchievementsBtn = document.getElementById('close-achievements-btn');

trophiesBtn.addEventListener('click', async () => {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_URL}/achievements?user_id=${currentUserId}`);
    const data = await res.json();
    const earned = data.achievements || [];

    achievementsList.innerHTML = '';

    // Show all known achievements, greyed out if not earned
    Object.entries(ACHIEVEMENT_DATA).forEach(([name, info]) => {
      const div = document.createElement('div');
      const unlocked = earned.includes(name);
      const tierClass = unlocked ? `tier-${info.tier || 'default'}` : '';
      div.className = `achievement-badge ${unlocked ? 'unlocked' : 'locked'} ${tierClass}`;
      div.innerHTML = `
        <span class="ach-icon">${unlocked ? info.icon : '🔒'}</span>
        <div class="ach-info">
          <div class="ach-name">${name}</div>
          <div class="ach-desc">${unlocked ? info.desc : '???'}</div>
        </div>
      `;
      achievementsList.appendChild(div);
    });


    achievementsPopup.classList.remove('hidden');
  } catch (err) {
    console.error('Achievements Error', err);
  }
});

closeAchievementsBtn.addEventListener('click', () => {
  achievementsPopup.classList.add('hidden');
});

// =========================================================
// === SHARED: TOAST & ACHIEVEMENT NOTIFICATION ============
// =========================================================

function showToast(title, message, color = '#00ffcc') {
  const toast = document.createElement('div');
  toast.className = 'game-toast';
  toast.style.borderColor = color;
  toast.style.color = color;
  toast.innerHTML = `<strong>${title}</strong><br>${message}`;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('toast-visible'), 50);
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 500);
  }, 4000);
}

function showAchievementToast(name) {
  const info = ACHIEVEMENT_DATA[name];
  if (info) showToast(`${info.icon} ACHIEVEMENT UNLOCKED`, name, '#ffd700');
}

// =========================================================
// === PHASE 4: CUSTOM CURSOR ==============================
// =========================================================
const cursorDot = document.querySelector(".cursor-dot");
const cursorOutline = document.querySelector(".cursor-outline");

let mouseX = 0;
let mouseY = 0;
let outlineX = 0;
let outlineY = 0;

let cursorTimer;

window.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;

  if (cursorDot) {
    cursorDot.style.left = `${mouseX}px`;
    cursorDot.style.top = `${mouseY}px`;
  }

  // Handle inactivity auto-hide
  document.body.classList.remove("cursor-inactive");
  clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => {
    document.body.classList.add("cursor-inactive");
  }, 1000);
});

// Linear interpolation for smooth trailing effect
function animateCursor() {
  const speed = 0.15; // Lower = slower, smoother trail
  outlineX += (mouseX - outlineX) * speed;
  outlineY += (mouseY - outlineY) * speed;

  if (cursorOutline) {
    cursorOutline.style.left = `${outlineX}px`;
    cursorOutline.style.top = `${outlineY}px`;
  }

  requestAnimationFrame(animateCursor);
}

// Start animation loop
animateCursor();

window.addEventListener("mousedown", () => {
  document.body.classList.add("cursor-active");
});

window.addEventListener("mouseup", () => {
  document.body.classList.remove("cursor-active");
});

// Add hover effects for all buttons and interactive elements
document.addEventListener("mouseover", (e) => {
  if (e.target.tagName === "BUTTON" || e.target.classList.contains("key") || e.target.closest("a") || e.target.classList.contains("lb-tab")) {
    document.body.classList.add("cursor-hover");
  }
});

document.addEventListener("mouseout", (e) => {
  if (e.target.tagName === "BUTTON" || e.target.classList.contains("key") || e.target.closest("a") || e.target.classList.contains("lb-tab")) {
    document.body.classList.remove("cursor-hover");
  }
});

// ===// === Story Mode Selection Logic ===
const STORY_LEVELS = {
  1: { category: "DATABASE", difficulty: "MEDIUM", name: "PRISON BREAK" },
  2: { category: "NETWORKING", difficulty: "HARD", name: "LOST IN SPACE" },
  3: { category: "DATA_STRUCTURE", difficulty: "HARD", name: "THE CORE" },
  4: { category: "ARTIFICIAL_INTELLIGENCE", difficulty: "HARD", name: "AI OVERLORD" }
};

function updateStoryUI() {
  const lvlBtns = document.querySelectorAll(".lvl-btn");
  lvlBtns.forEach(btn => {
    const lvl = parseInt(btn.getAttribute("data-lvl"));
    if (lvl <= storyProgress) {
      btn.classList.remove("locked");
      btn.innerText = `LEVEL ${lvl}: ${STORY_LEVELS[lvl].name}`;
    } else {
      btn.classList.add("locked");
      btn.innerText = `LEVEL ${lvl}: LOCKED 🔒`;
    }
  });
}

document.querySelectorAll(".lvl-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const lvl = parseInt(btn.getAttribute("data-lvl"));
    if (lvl > storyProgress) {
      showToast("🔒 DATA ENCRYPTED", "Complete previous levels to unlock this sector.", "#ff3333");
      return;
    }

    selectedCategory = STORY_LEVELS[lvl].category;
    selectedDifficulty = STORY_LEVELS[lvl].difficulty;
    currentStoryLevel = lvl;

    MAX_MISTAKES = MISTAKE_MAPPINGS[selectedDifficulty].length;
    selectionScreen.classList.add("hidden");
    gameContainer.classList.remove("hidden");
    initGame();

    showToast("📜 MISSION BRIEF", `Objective: Escape ${STORY_LEVELS[lvl].name}. Difficulty: ${selectedDifficulty}`, "#00ffcc");
  });
});

// Word Duel and Cursor Logic... ===
const duelSetupOverlay = document.getElementById("duel-setup-overlay");
const duelWordInput = document.getElementById("duel-word-input");
const duelStartBtn = document.getElementById("duel-start-btn");
const duelCancelBtn = document.getElementById("duel-cancel-btn");
const btnWordDuel = document.getElementById("btn-word-duel");

if (btnWordDuel) {
  btnWordDuel.addEventListener("click", () => {
    duelSetupOverlay.classList.remove("hidden");
    playSfx("click");
  });
}

if (duelCancelBtn) {
  duelCancelBtn.addEventListener("click", () => {
    duelSetupOverlay.classList.add("hidden");
    playSfx("click");
  });
}

if (duelStartBtn) {
  duelStartBtn.addEventListener("click", () => {
    const word = duelWordInput.value.trim().toUpperCase();
    if (word.length < 3) {
      document.getElementById("duel-error-msg").innerText = "WORD TOO SHORT (MIN 3)";
      return;
    }
    if (!/^[A-Z]+$/.test(word)) {
      document.getElementById("duel-error-msg").innerText = "ALPHABET ONLY";
      return;
    }

    // Start the game
    currentWord = word;
    currentWordData = { word, clue: "DUEL_MODE_TARGET", category: "DUEL", description: "This word was set by another agent." };
    selectedCategory = "DUEL";
    selectedDifficulty = "MEDIUM"; // Default to medium mapping for duels
    MAX_MISTAKES = MISTAKE_MAPPINGS[selectedDifficulty].length;

    duelSetupOverlay.classList.add("hidden");
    selectionScreen.classList.add("hidden");
    gameContainer.classList.remove("hidden");

    // Reset state for new game
    guessedLetters = [];
    wrongGuesses = 0;
    isGameOver = false;
    hintsUsed = 0;
    gameStartTime = Date.now();

    renderWord();
    renderKeyboard();

    showToast("⚔ DUEL ENGAGED", "Agent 1 has set the trap. Agent 2, begin decryption.", "#ff3333");
  });
}


// === Social Sharing & Progress Dashboard ===

async function shareProgress() {
  try {
    const res = await fetch(`${API_URL}/user/progress?user_id=${currentUserId}`);
    const data = await res.json();

    const text = `🎮 Tech Hangman Progress: I've mastered ${data.total_percentage}% of the tech world! (${data.total_solved}/${data.total_words} units solved). Can you beat me? #TechHangman #Coding`;

    if (navigator.share) {
      await navigator.share({
        title: 'Tech Hangman Progress',
        text: text,
        url: window.location.href
      });
    } else {
      await navigator.clipboard.writeText(text);
      showAchievementToast("Stats Copied to Clipboard!");
    }
  } catch (err) {
    console.error("Share Error:", err);
  }
}

// Attach to a share button if it exists
const shareBtn = document.getElementById("share-stats-btn");
if (shareBtn) {
  shareBtn.addEventListener("click", shareProgress);
}

// Function to refresh the HUD with new detailed progress
async function refreshProgressHUD() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_URL}/user/progress?user_id=${currentUserId}`);
    const data = await res.json();

    // Update total progress bar if it exists
    const totalBar = document.getElementById("hud-total-progress-bar");
    const totalText = document.getElementById("hud-total-progress-text");
    if (totalBar) totalBar.style.width = `${data.total_percentage}%`;
    if (totalText) totalText.innerText = `OVERALL: ${data.total_percentage}%`;

  } catch (err) {
    console.error("Progress HUD Refresh Error:", err);
  }
}
