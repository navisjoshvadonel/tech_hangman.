const API_URL = "/api";

// Game State Storage
let currentWord = "";
let guessedLetters = [];
let wrongGuesses = 0;
let MAX_MISTAKES = 10;
const MISTAKE_MAPPINGS = {
  // 10 mistakes: One part per mistake
  EASY: [[0], [1], [2], [3], [4], [5], [6], [7], [8], [9]],
  // 7 mistakes: Accelerated drawing
  MEDIUM: [[0, 1], [2], [3], [4], [5], [6, 7], [8, 9]],
  // 5 mistakes: Fast punishment
  HARD: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]]
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
let currentStoryProgress = 1;

// Timing State
let gameStartTime = 0;

// Random Event & Daily Challenge State
let scoreMultiplier = 1;
let isDailyChallenge = false;
let activeEvent = null;
let WORDS_TOTAL = 0;
let WORDS_REMAINING = 0;


// Game Config State
let selectedCategory = null;
let selectedDifficulty = null;

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

document.addEventListener("DOMContentLoaded", () => {
  playIntroSequence();
  startHeartbeat();
});

function startHeartbeat() {
  // Ping the backend every 10 minutes (600,000 ms) to prevent Render sleep
  setInterval(async () => {
    try {
      console.log("[KeepAlive] Pinging backend...");
      await fetch(`${API_URL}/ping`);
    } catch (err) {
      console.warn("[KeepAlive] Heartbeat failed:", err);
    }
  }, 600000);
}

function playIntroSequence() {
  // Line 1: 0ms
  setTimeout(() => { introLine1?.classList.add("animate-text-in"); }, 500);

  // Line 2: 2.5s
  setTimeout(() => { introLine2?.classList.add("animate-text-in"); }, 2500);

  // Line 3: 4.5s
  setTimeout(() => { introLine3?.classList.add("animate-text-in"); }, 4500);

  // Line 4: 6.5s
  setTimeout(() => { introLine4?.classList.add("animate-text-in"); }, 6500);

  // Logo Reveal: 8.5s
  setTimeout(() => { introLogo?.classList.add("animate-logo-in"); }, 8500);

  // Fade out Intro & Show Login: 12.5s
  setTimeout(() => {
    introOverlay?.classList.add("fade-out-overlay");
    loginOverlay?.classList.remove("hidden");

    // Remove intro entirely after transition to clean DOM
    setTimeout(() => { introOverlay.remove(); }, 1000);
  }, 12500);
}

// === Tab Switching ===
document.getElementById('tab-returning').addEventListener('click', () => {
  document.getElementById()?.classList.add('active');
  document.getElementById()?.classList.remove('active');
  document.getElementById()?.classList.remove('hidden');
  document.getElementById()?.classList.add('hidden');
});
document.getElementById('tab-new').addEventListener('click', () => {
  document.getElementById()?.classList.add('active');
  document.getElementById()?.classList.remove('active');
  document.getElementById()?.classList.remove('hidden');
  document.getElementById()?.classList.add('hidden');
});

// Shared function to apply login data to the game state
function applyUserSession(data) {
  currentUser = data.username;
  currentUserId = data.user_id;
  highestScore = data.highest_score;
  currentXp = data.xp || 0;
  currentRank = data.rank || "Beginner";
  currentLevel = data.level || 1;
  currentStoryProgress = data.story_progress || 1;
  currentScore = 0;

  currentUserSpan.innerText = `USER: ${currentUser.toUpperCase().replace(/_/g, " ")}`;
  if (currentRankSpan) currentRankSpan.innerText = `RANK: ${currentRank.toUpperCase().replace(/_/g, " ")}`;
  currentXpSpan.innerText = `EXP: ${currentXp}`;
  highScoreSpan.innerText = `${highestScore}`;
  updateScoreUI();

  document.getElementById("selection-title").innerHTML = `Welcome back, <span style="color: #fff">${currentUser.toUpperCase()}</span><br><br>Select Category`;

  loginOverlay?.classList.add("hidden");
  selectionScreen?.classList.remove("hidden");
  categorySelection?.classList.remove("hidden");
  difficultySelection?.classList.add("hidden");

  updateAgentHUD();
}

function updateAgentHUD() {
  const hud = document.getElementById("agent-hud");
  if (!hud) return;

  hud?.classList.remove("hidden");

  const userEl = document.getElementById("hud-user");
  const rankEl = document.getElementById("hud-rank");
  const levelEl = document.getElementById("hud-level");
  const xpBar = document.getElementById("hud-xp-bar");
  const xpText = document.getElementById("hud-xp-text");
  const storyEl = document.getElementById("hud-story");

  if (userEl) userEl.innerText = currentUser.toUpperCase().replace(/_/g, " ");
  if (rankEl) rankEl.innerText = currentRank.toUpperCase().replace(/_/g, " ");
  if (levelEl) levelEl.innerText = currentLevel;
  if (storyEl) storyEl.innerText = `LVL ${currentStoryProgress}`;

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
    objectiveEl.innerText = `${completed} / ${WORDS_TOTAL} UNITS`;
    if (objBar) {
      const objPct = (completed / WORDS_TOTAL) * 100;
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
  errorMsg.innerText = "";
  errorMsg?.classList.remove("success");
  if (!username) return;

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
      if (data.hint) {
        errorMsg.innerText += ` (${data.hint})`;
      }
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
  errorMsg.innerText = "";
  errorMsg?.classList.remove("success");
  if (!username) return;

  try {
    const res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();

    if (res.ok) {
      errorMsg?.classList.add("success");
      errorMsg.innerText = "ENLISTED! Logging in...";
      setTimeout(() => applyUserSession(data), 1200);
    } else {
      errorMsg.innerText = data.error || "REGISTRATION FAILED.";
      if (data.hint) {
        errorMsg.innerText += ` (${data.hint})`;
      }
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
  document.getElementById()?.classList.add("active");
  document.getElementById()?.classList.remove("active");
  document.getElementById()?.classList.remove("hidden");
  document.getElementById()?.classList.add("hidden");
  gameContainer?.classList.add("hidden");
  selectionScreen?.classList.add("hidden");
  loginOverlay?.classList.remove("hidden");
});

if (hintBtn) {
  hintBtn.addEventListener("click", () => {
    if (isGameOver) return;

    if (hintsUsed === 0) {
      // First hint: Reveal text clue
      clueDisplay?.classList.remove("hidden");
      hintBtn.innerText = "REVEAL LETTER (-10 SCORE)";
      hintsUsed++;
    } else if (hintsUsed === 1) {
      // Second hint: Reveal a letter for 50 score
      if (currentScore < 10) {
        alert("INSUFFICIENT SCORE FOR DECRYPTION (Requires 10)");
        return;
      }

      const unGuessed = currentWord.split("").filter(l => !guessedLetters.includes(l));
      if (unGuessed.length > 0) {
        currentScore -= 10; // Hint costs 10 points
        updateScoreUI();

        const randLetter = unGuessed[Math.floor(Math.random() * unGuessed.length)];
        // Bypass the raw key listener wrapper and hit handleGuess directly
        handleGuess(randLetter);

        hintBtn.innerText = "MAX HINTS REACHED";
        hintBtn?.classList.add("disabled");
        hintBtn.disabled = true;
        hintsUsed++;
      }
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
  if (hintBtn) {
    hintBtn.innerText = "GET HINT (FREE)";
    hintBtn?.classList.remove("disabled");
    hintBtn.disabled = false;
  }
  if (clueDisplay) {
    clueDisplay?.classList.add("hidden");
  }

  // Reset DOM Classes
  gameContainer?.classList.remove("win-state", "loss-state", "game-loss", "game-container-shake");
  redOverlay?.classList.remove("active");
  popup?.classList.remove("show", "popup-win", "popup-loss");
  clueText.innerText = "GENERATING CLUE...";

  // Hide Escape Container
  const escapeContainer = document.getElementById("escape-container");
  if (escapeContainer) {
    escapeContainer?.classList.add("hidden");
    const portal = escapeContainer.querySelector('.escape-portal');
    const runner = escapeContainer.querySelector('.escape-runner-container');
    const particles = escapeContainer.querySelector('.particles');

    if (portal) portal?.classList.remove("open");
    if (runner) runner?.classList.remove("escaping");
    if (particles) particles.innerHTML = "";
  }

  // Clear hangman SVG & remove detachment classes
  hangmanParts.forEach(part => {
    part?.classList.remove("drawn", "detach-head", "detach-body");
  });

  if (isFriendModeActive) {
    if (clueDisplayV2) clueDisplayV2.innerText = currentClue || "DECRYPT THE ENCRYPTED NODE";
    clueText.innerText = currentClue || "DECRYPT THE ENCRYPTED NODE";
    renderWord();
    renderKeyboard();
    return;
  }

  // Fetch Word from Python Backend (Smart Anti-Repetition)
  try {
    const res = await fetch(`${API_URL}/word?category=${selectedCategory}&difficulty=${selectedDifficulty}&user_id=${currentUserId}`);
    if (!res.ok) throw new Error("API Fetch Failed");
    const data = await res.json();

    // Check for exhaustion
    if (data.status === "exhausted") {
      isGameOver = true;

      setTimeout(() => {
        gameContainer?.classList.add("win-state");
        popup?.classList.add("show", "popup-win");
        popup?.classList.remove("popup-loss");
        popupMessage.innerText = "You have saved all the men in this difficulty context!";
        nextBtn.innerText = "Return to Protocol Context";
      }, 500);

      return; // Halt game initialization here
    }

    currentWord = data.word.toUpperCase();
    clueText.innerText = data.clue;
    clueDisplay?.classList.remove("hidden"); // Show immediately

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
    clueText.innerText = "ERROR GENERATING CLUE";
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
        wrong_guesses: wrongGuesses,  // For Flawless achievement
        difficulty: selectedDifficulty
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
      currentStoryProgress = data.story_progress || currentStoryProgress;
      currentXpSpan.innerText = `EXP: ${currentXp}`;
      if (currentRankSpan) currentRankSpan.innerText = `RANK: ${currentRank.toUpperCase()}`;
      updateAgentHUD();
    }
    // Show achievement unlock notifications
    if (data.new_achievements && data.new_achievements.length > 0) {
      data.new_achievements.forEach((ach, i) => {
        setTimeout(() => showAchievementToast(ach), i * 2000);
      });
    }
  } catch (err) {
    console.error("Score Submit Error:", err);
  }
}

function renderWord() {
  wordDisplay.innerHTML = "";
  currentWord.split("").forEach(letter => {
    const box = document.createElement("div");
    box.className = "letter-box";
    if (guessedLetters.includes(letter)) {
      box.innerText = letter;
      box?.classList.add("revealed-anim");
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
        btn?.classList.add("correct", "disabled");
      } else {
        btn?.classList.add("wrong", "disabled");
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
    document.getElementById()?.classList.add("correct", "disabled");
    currentScore += 100; // Reward per correct letter
    updateScoreUI();
    checkWin();
  } else {
    // Incorrect
    document.getElementById()?.classList.add("wrong", "disabled");
    currentScore = Math.max(0, currentScore - 50); // 50pt penalty per wrong guess
    updateScoreUI();

    if (wrongGuesses < MAX_MISTAKES) {
      // BUG FIX: Guard against null difficulty (edge case on protocol change mid-game)
      const mapping = MISTAKE_MAPPINGS[selectedDifficulty];
      const partsToDraw = mapping ? mapping[wrongGuesses] : null;
      if (partsToDraw) {
        partsToDraw.forEach(partIdx => {
          const partEl = document.querySelector(`.part-${partIdx}`);
          if (partEl) partEl?.classList.add("drawn");
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
      gameContainer?.classList.add("game-container-shake");

      setTimeout(() => {
        // Screen stabilizes, tear open the portal
        gameContainer?.classList.remove("game-container-shake");
        escapeContainer?.classList.remove("hidden");
        portal?.classList.add("open");

        // Spawn Particles
        for (let i = 0; i < 30; i++) {
          const p = document.createElement('div');
          p?.classList.add('particle');
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
          runner?.classList.add("escaping");

          // Glitch flash right as he enters portal
          setTimeout(() => {
            escapeContainer?.classList.add('glitch-flash');

            // Show final victory popup
            setTimeout(() => {
              escapeContainer?.classList.add("hidden");
              escapeContainer?.classList.remove('glitch-flash');
              const hangmanDisplay = document.querySelector('.hangman-display');
              if (hangmanDisplay) hangmanDisplay.style.opacity = '1';

              gameContainer?.classList.add("win-state");
              console.log("Adding classes");
              popup?.classList.add("show", "popup-win");
              popup?.classList.remove("popup-loss");
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
      redOverlay?.classList.add("active");
      gameContainer?.classList.add("loss-state", "game-loss");

      // Apply detachment to SVG elements
      const head = document.querySelector('.part-4');
      const body = [
        document.querySelector('.part-5'), // Torso
        document.querySelector('.part-6'), // L Arm
        document.querySelector('.part-7'), // R Arm
        document.querySelector('.part-8'), // L Leg
        document.querySelector('.part-9')  // R Leg
      ];

      if (head) head?.classList.add('detach-head');
      body.forEach(p => { if (p) p?.classList.add('detach-body'); });

      // Wait for the disintegration before showing the popup
      setTimeout(() => {
        popup?.classList.add("show", "popup-loss");
        popup?.classList.remove("popup-win");
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
    lbTabs.forEach(t => t?.classList.remove("active"));
    e?.target?.classList.add("active");
    const type = e.target.getAttribute("data-leaderboard");
    renderLeaderboard(type);
  });
});

leaderboardBtn.addEventListener("click", async () => {
  try {
    const res = await fetch(`${API_URL}/highscores`);
    currentLeaderboardData = await res.json();

    // Reset to default tab
    lbTabs.forEach(t => t?.classList.remove("active"));
    document.querySelector()?.classList.add("active");
    renderLeaderboard("score");

    leaderboardPopup?.classList.remove("hidden");
  } catch (err) {
    console.error("Leaderboard Error", err);
  }
});

closeLeaderboardBtn.addEventListener("click", () => {
  leaderboardPopup?.classList.add("hidden");
});

// === Keyboard Mapping ===
document.addEventListener("keydown", (e) => {
  if (!currentUser) return; // Ignore if playing login

  if (isGameOver) {
    if (e.key === "Enter" && popup?.classList.contains("show")) {
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
  "DATABASE": '"Data is the new oil, and databases are the engines that refine it."\n- Clive Humby',
  "DATA_STRUCTURE": '"Bad programmers worry about the code. Good programmers worry about data structures."\n- Linus Torvalds',
  "JAVA": '"Java is to JavaScript what car is to carpet."\n- Chris Heilmann',
  "PYTHON": '"Beautiful is better than ugly. Explicit is better than implicit."\n- Tim Peters',
  "C": '"C is quirky, flawed, and an enormous success."\n- Dennis Ritchie',
  "CPP": '"C makes it easy to shoot yourself in the foot; C++ blows your whole leg off."\n- Bjarne Stroustrup',
  "GENERAL_KNOWLEDGE": '"The only true wisdom is in knowing you know nothing."\n- Socrates',
  "ARTIFICIAL_INTELLIGENCE": '"We can only see a short distance ahead, but we can see plenty to be done."\n- Alan Turing',
  "OPERATING_SYSTEM": '"The Unix philosophy is to design programs to do one thing and do it well."\n- Ken Thompson',
  "CODE_OUTPUT": '"Talk is cheap. Show me the code."\n- Linus Torvalds',
  "NETWORKING": '"The network is the computer."\n- John Gage',
  "CYBERSECURITY": '"If you think technology can solve your security problems, you don\'t understand them."\n- Bruce Schneier',
  "WEBDEVELOPMENT": '"The Web does not just connect machines, it connects people."\n- Tim Berners-Lee',
  "SOFTWAREENGINEERING": '"Simplicity is the soul of efficiency."\n- Austin Freeman',
  "LINUX": '"Linux is not about being better than anyone else, it is about being free."\n- Linus Torvalds',
  "CLOUD": '"Everything fails, all the time. Plan for it."\n- Werner Vogels',
  "DATASCIENCE": '"In God we trust. All others must bring data."\n- W. Edwards Deming',
  "RANDOM": '"The only way to do great work is to love what you do."\n- Steve Jobs'
};


const defaultLogo = `
<svg class="cross-svg" viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
    <line x1="50" y1="10" x2="50" y2="140" class="cross-line" />
    <line x1="20" y1="40" x2="80" y2="40" class="cross-line" />
</svg>
`;

const defaultQuote = `"Design is not just what it looks like and feels like. Design is how it works." <br><span class="quote-ref">- Steve Jobs</span>`;

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
  if (!text) return `"For the Son of Man came to seek and to save the lost." <br><span class="quote-ref">- Luke 19:10</span>`;
  const parts = text.split('\n');
  if (parts.length > 1) {
    return `${parts[0]} <br><span class="quote-ref">${parts[1]}</span>`;
  }
  return `${text} <br><span class="quote-ref">- Unknown</span>`;
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
    domainQuoteText?.classList.remove("animate-quote-in");
    void domainQuoteText.offsetWidth; // trigger reflow

    // Show overlay and Animate
    quoteTransitionOverlay?.classList.remove("hidden");
    domainQuoteText?.classList.add("animate-quote-in");

    // Hide overlay after animation finishes (3.5s)
    setTimeout(() => {
      quoteTransitionOverlay?.classList.add("hidden");
      chosenCategoryTitle.innerText = "TARGET SYSTEM: " + displayCategory;
      categorySelection?.classList.add("hidden");
      difficultySelection?.classList.remove("hidden");

      // Update Left Panel - Keep the Cross (defaultLogo) as the logo of the game application
      document.getElementById("left-logo-container").innerHTML = defaultLogo;
      document.getElementById("left-quote-container").innerHTML = formatQuoteForLeftPanel(domainQuotes[selectedCategory] || defaultQuote);
    }, 3500);
  });
});

backToCatBtn.addEventListener("click", () => {
  difficultySelection?.classList.add("hidden");
  categorySelection?.classList.remove("hidden");
  selectedCategory = null;
  document.getElementById("left-logo-container").innerHTML = defaultLogo;
  document.getElementById("left-quote-container").innerHTML = defaultQuote;
});

diffBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    selectedDifficulty = btn.getAttribute("data-diff");
    MAX_MISTAKES = MISTAKE_MAPPINGS[selectedDifficulty].length;
    selectionScreen?.classList.add("hidden");
    gameContainer?.classList.remove("hidden");
    initGame();
  });
});

changeProtocolBtn.addEventListener("click", () => {
  isGameOver = true;
  gameContainer?.classList.add("hidden");
  popup?.classList.remove("show");
  redOverlay?.classList.remove("active");
  selectionScreen?.classList.remove("hidden");
  categorySelection?.classList.remove("hidden");
  difficultySelection?.classList.add("hidden");
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
    gameContainer?.classList.add("hidden");
    popup?.classList.remove("show");
    redOverlay?.classList.remove("active");
    selectionScreen?.classList.remove("hidden");
    categorySelection?.classList.remove("hidden");
    difficultySelection?.classList.add("hidden");
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

    selectionScreen?.classList.add('hidden');
    gameContainer?.classList.remove('hidden');

    // Init the game using the daily word directly
    guessedLetters = [];
    wrongGuesses = 0;
    isGameOver = false;
    hintsUsed = 0;
    gameStartTime = Date.now();
    currentWord = data.word.toUpperCase();

    // Reset Hint UI
    if (hintBtn) { hintBtn.innerText = 'GET HINT (FREE)'; hintBtn?.classList.remove('disabled'); hintBtn.disabled = false; }
    if (clueDisplay) clueDisplay?.classList.add('hidden');
    clueText.innerText = `[DAILY] ${data.clue}`;

    // Reset DOM state
    gameContainer?.classList.remove('win-state', 'loss-state', 'game-loss', 'game-container-shake');
    redOverlay?.classList.remove('active');
    popup?.classList.remove('show', 'popup-win', 'popup-loss');
    hangmanParts.forEach(p => p?.classList.remove('drawn', 'detach-head', 'detach-body'));
    const escEl = document.getElementById('escape-container');
    if (escEl) { escEl?.classList.add('hidden'); }

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
  anomalyPopup?.classList.remove('hidden');

  document.getElementById('anomaly-confirm-btn').onclick = () => {
    anomalyPopup?.classList.add('hidden');
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


    achievementsPopup?.classList.remove('hidden');
  } catch (err) {
    console.error('Achievements Error', err);
  }
});

closeAchievementsBtn.addEventListener('click', () => {
  achievementsPopup?.classList.add('hidden');
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
  setTimeout(() => toast?.classList.add('toast-visible'), 50);
  setTimeout(() => {
    toast?.classList.remove('toast-visible');
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

window.addEventListener("mousemove", (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;

  if (cursorDot) {
    cursorDot.style.left = `${mouseX}px`;
    cursorDot.style.top = `${mouseY}px`;
  }
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
  if (e.target.tagName === "BUTTON" || e?.target?.classList.contains("key") || e.target.closest("a") || e?.target?.classList.contains("lb-tab")) {
    document.body.classList.add("cursor-hover");
  }
});

document.addEventListener("mouseout", (e) => {
  if (e.target.tagName === "BUTTON" || e?.target?.classList.contains("key") || e.target.closest("a") || e?.target?.classList.contains("lb-tab")) {
    document.body.classList.remove("cursor-hover");
  }
});

// ==========================================================
// PLAY WITH FRIENDS (Client Duel Engine)
// ==========================================================

let activeFriendRoomCode = null;
let friendPollInterval = null;
let isFriendModeActive = false;
let isHostPlayer = false;

const modeFriendsBtn = document.getElementById("mode-friends");
const friendsOverlay = document.getElementById("friends-room-overlay");
const closeFriendsBtn = document.getElementById("close-friends-modal-btn");
const createRoomBtn = document.getElementById("create-friend-room-btn");
const joinRoomBtn = document.getElementById("join-friend-room-btn");
const joinInput = document.getElementById("join-room-code-input");
const friendRoomError = document.getElementById("friend-room-error");
const friendsSetupView = document.getElementById("friends-setup-view");
const friendsActiveView = document.getElementById("friends-active-view");
const displayCode = document.getElementById("display-room-code");
const displayRound = document.getElementById("display-room-round");
const exitDuelBtn = document.getElementById("exit-friend-duel-btn");
const startGameBtn = document.getElementById("start-friend-game-btn");
const nextRoundBtn = document.getElementById("next-friend-round-btn");
const leaderboardContainer = document.getElementById("friend-room-leaderboard-container");

if (modeFriendsBtn) {
  modeFriendsBtn.addEventListener("click", () => {
    if (friendsOverlay) friendsOverlay?.classList.remove("hidden");
    if (friendsSetupView) friendsSetupView?.classList.remove("hidden");
    if (friendsActiveView) friendsActiveView?.classList.add("hidden");
    if (friendRoomError) friendRoomError.innerText = "";
  });
}

if (closeFriendsBtn) {
  closeFriendsBtn.addEventListener("click", () => {
    if (friendsOverlay) friendsOverlay?.classList.add("hidden");
  });
}

if (createRoomBtn) {
  createRoomBtn.addEventListener("click", async () => {
    try {
      createRoomBtn.disabled = true;
      createRoomBtn.innerText = "GENERATING CODE...";
      if (friendRoomError) friendRoomError.innerText = "";

      const res = await fetch('/api/friend_duel/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: window.currentUserId || 1,
          category: window.selectedCategory || 'DATABASE',
          difficulty: window.selectedDifficulty || 'MEDIUM'
        })
      });
      const data = await res.json();

      if (res.ok) {
        activeFriendRoomCode = data.code;
        isHostPlayer = true;
        isFriendModeActive = true;
        window.currentWord = data.word;
        window.currentClue = data.clue;

        setupActiveRoomUI(data);
        startFriendPolling();
      } else {
        if (friendRoomError) friendRoomError.innerText = data.error || "Failed to create room.";
      }
    } catch (err) {
      if (friendRoomError) friendRoomError.innerText = "Network connection error.";
    } finally {
      createRoomBtn.disabled = false;
      createRoomBtn.innerText = "🚀 CREATE ROOM (HOST)";
    }
  });
}

if (joinRoomBtn) {
  joinRoomBtn.addEventListener("click", handleJoinRoom);
}
if (joinInput) {
  joinInput.addEventListener("keydown", (e) => { if (e.key === "Enter") handleJoinRoom(); });
}

async function handleJoinRoom() {
  const code = (joinInput ? joinInput.value : "").trim().toUpperCase();
  if (!code) {
    if (friendRoomError) friendRoomError.innerText = "Please enter a 6-character room code.";
    return;
  }

  try {
    joinRoomBtn.disabled = true;
    joinRoomBtn.innerText = "JOINING...";
    if (friendRoomError) friendRoomError.innerText = "";

    const res = await fetch('/api/friend_duel/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, user_id: window.currentUserId || 2 })
    });
    const data = await res.json();

    if (res.ok) {
      activeFriendRoomCode = data.code;
      isHostPlayer = false;
      isFriendModeActive = true;
      window.currentWord = data.word;
      window.currentClue = data.clue;

      setupActiveRoomUI(data);
      startFriendPolling();
    } else {
      if (friendRoomError) friendRoomError.innerText = data.error || "Invalid or expired room code.";
    }
  } catch (err) {
    if (friendRoomError) friendRoomError.innerText = "Network connection error.";
  } finally {
    joinRoomBtn.disabled = false;
    joinRoomBtn.innerText = "JOIN";
  }
}

function setupActiveRoomUI(data) {
  if (friendsSetupView) friendsSetupView?.classList.add("hidden");
  if (friendsActiveView) friendsActiveView?.classList.remove("hidden");

  if (displayCode) displayCode.innerText = `${data.code} 📋`;
  if (displayRound) displayRound.innerText = data.round_number || 1;
}

if (displayCode) {
  displayCode.addEventListener("click", () => {
    if (activeFriendRoomCode) {
      navigator.clipboard.writeText(activeFriendRoomCode);
      displayCode.innerText = `${activeFriendRoomCode} COPIED!`;
      setTimeout(() => {
        if (displayCode) displayCode.innerText = `${activeFriendRoomCode} 📋`;
      }, 2000);
    }
  });
}

function startFriendPolling() {
  if (friendPollInterval) clearInterval(friendPollInterval);
  pollFriendRoomStatus();
  friendPollInterval = setInterval(pollFriendRoomStatus, 1500);
}

async function pollFriendRoomStatus() {
  if (!activeFriendRoomCode) return;

  try {
    const res = await fetch(`/api/friend_duel/status?code=${activeFriendRoomCode}&user_id=${window.currentUserId || 1}`);
    if (!res.ok) return;

    const data = await res.json();
    if (data.status === 'ended') {
      clearInterval(friendPollInterval);
      alert("The duel session has been ended by a player.");
      exitFriendDuel();
      return;
    }

    if (displayRound) displayRound.innerText = data.round_number;
    if (data.current_word && data.current_word !== window.currentWord) {
      window.currentWord = data.current_word;
      window.currentClue = data.current_clue;
    }

    const lobbyStatus = document.getElementById("friend-lobby-status");
    if (lobbyStatus) {
      if (data.players && data.players.length > 1) {
        lobbyStatus.style.background = "rgba(0, 255, 204, 0.15)";
        lobbyStatus.innerHTML = `<span style="color:#00ffcc; font-weight:bold;">🟢 DUEL READY: ${data.players.length} PLAYERS CONNECTED!</span>`;
      } else {
        lobbyStatus.style.background = "rgba(255, 0, 128, 0.1)";
        lobbyStatus.innerHTML = `<span style="color:#ff0080; font-weight:bold;">⏳ WAITING FOR FRIEND TO JOIN...</span><p style="color:#aaa; font-size:0.85rem; margin:4px 0 0 0">Share code ${data.code} to connect.</p>`;
      }
    }

    renderFriendLeaderboard(data.players || []);
  } catch (err) {
    console.error("Poll friend room error:", err);
  }
}

function renderFriendLeaderboard(players) {
  if (!leaderboardContainer) return;
  leaderboardContainer.innerHTML = "";

  players.forEach((p, idx) => {
    const row = document.createElement("div");
    row.className = `friend-leaderboard-row ${p.is_host ? 'host-row' : 'guest-row'}`;
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-weight:bold; color: ${p.is_host ? '#00ffcc' : '#ff0080'}">
          ${idx === 0 ? '👑' : '⚔️'} ${p.username.toUpperCase()} ${p.is_host ? '(HOST)' : ''}
        </span>
      </div>
      <div style="display:flex; gap:12px; font-size:0.85rem;">
        <span>PTS: <strong style="color:#00ffcc">${p.score}</strong></span>
        <span>ERR: <strong style="color:#ff3366">${p.mistakes}</strong></span>
        <span>W/L: <strong style="color:#ffaa00">${p.wins}/${p.losses}</strong></span>
      </div>
    `;
    leaderboardContainer.appendChild(row);
  });
}

if (startGameBtn) {
  startGameBtn.addEventListener("click", () => {
    if (friendsOverlay) friendsOverlay?.classList.add("hidden");
    const selScreen = document.getElementById("selection-screen");
    const gameCont = document.getElementById("game-container");
    if (selScreen) selScreen?.classList.add("hidden");
    if (gameCont) gameCont?.classList.remove("hidden");

    const wordDisp = document.getElementById("word-display");
    if (wordDisp) {
      wordDisp?.classList.remove("cyber-glitch-reveal-anim");
      void wordDisp.offsetWidth;
      wordDisp?.classList.add("cyber-glitch-reveal-anim");
    }

    const hangmanSvg = document.querySelector(".hangman-svg");
    if (hangmanSvg) {
      hangmanSvg?.classList.add("holo-duo-execution");
    }

    if (typeof window.resetGameVariables === 'function') window.resetGameVariables();
    if (typeof window.renderWord === 'function') window.renderWord();
    if (typeof window.renderKeyboard === 'function') window.renderKeyboard();
  });
}

if (nextRoundBtn) {
  nextRoundBtn.addEventListener("click", async () => {
    if (!activeFriendRoomCode) return;
    try {
      nextRoundBtn.disabled = true;
      nextRoundBtn.innerText = "LOADING NEXT ROUND...";

      const res = await fetch('/api/friend_duel/next_round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: activeFriendRoomCode, user_id: window.currentUserId || 1 })
      });
      const data = await res.json();
      if (res.ok) {
        window.currentWord = data.word;
        window.currentClue = data.clue;
        if (displayRound) displayRound.innerText = data.round_number;

        if (startGameBtn) startGameBtn.click();
      }
    } catch (err) {
      console.error("Next round error:", err);
    } finally {
      nextRoundBtn.disabled = false;
      nextRoundBtn.innerText = "NEXT ROUND ➔";
    }
  });
}

if (exitDuelBtn) {
  exitDuelBtn.addEventListener("click", exitFriendDuel);
}

function exitFriendDuel() {
  if (activeFriendRoomCode) {
    fetch('/api/friend_duel/exit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: activeFriendRoomCode })
    }).catch(() => {});
  }

  if (friendPollInterval) clearInterval(friendPollInterval);
  activeFriendRoomCode = null;
  isFriendModeActive = false;

  const hangmanSvg = document.querySelector(".hangman-svg");
  if (hangmanSvg) hangmanSvg?.classList.remove("holo-duo-execution");

  if (friendsOverlay) friendsOverlay?.classList.add("hidden");
  const gameCont = document.getElementById("game-container");
  const selScreen = document.getElementById("selection-screen");
  if (gameCont) gameCont?.classList.add("hidden");
  if (selScreen) selScreen?.classList.remove("hidden");
}



