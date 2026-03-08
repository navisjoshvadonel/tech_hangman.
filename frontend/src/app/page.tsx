"use client";

import React from 'react';
import LegacyScript from './LegacyScript';

export default function Home() {
  return (
    <>
      {/* 
        This loads the entire vanilla JS logic from the legacy build.
        It runs after the DOM is rendered so document.getElementById works.
      */}
      <LegacyScript />

      {/* Global SVG Defs */}
      <svg width="0" height="0" style={{ position: 'absolute' }}>
        <defs>
          <filter id="neon-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
      </svg>

      {/* Cinematic Intro Overlay */}
      <div id="intro-overlay" className="overlay">
        <div className="intro-sequence">
          <div className="intro-text-line" id="intro-line-1">WELCOME AGENT...</div>
          <div className="intro-text-line" id="intro-line-2">ARRESTING THE MAN...</div>
          <div className="intro-text-line" id="intro-line-3">SETTING UP THE STAGE...</div>
          <div className="intro-text-line" id="intro-line-4">THE MAN NEEDS YOU...</div>
          <div className="intro-main-title" id="intro-logo">THE HANG MAN</div>
        </div>
      </div>

      {/* Domain Quote Transition Overlay */}
      <div id="quote-transition-overlay" className="overlay hidden">
        <div className="quote-content">
          <h3 id="domain-category-name">PROTOCOL</h3>
          <p id="domain-quote-text">"Quote"</p>
        </div>
      </div>

      {/* Login Overlay */}
      <div id="login-overlay" className="overlay hidden">
        <div className="login-content-wrapper">
          <div className="cyber-core-container">
            <svg className="cyber-core-svg" viewBox="0 0 300 150" xmlns="http://www.w3.org/2000/svg">
              {/* Base structural rings */}
              <circle cx="150" cy="75" r="50" className="core-ring core-ring-outer" />
              <circle cx="150" cy="75" r="35" className="core-ring core-ring-middle" />
              <circle cx="150" cy="75" r="20" className="core-ring core-ring-inner" />

              {/* Pulsing Data Core */}
              <circle cx="150" cy="75" r="8" className="core-node" />

              {/* Decorative HUD elements */}
              <path className="hud-bracket" d="M 90,45 L 80,45 L 80,105 L 90,105" />
              <path className="hud-bracket" d="M 210,45 L 220,45 L 220,105 L 210,105" />

              <line className="hud-line" x1="150" y1="10" x2="150" y2="20" />
              <line className="hud-line" x1="150" y1="130" x2="150" y2="140" />
              <line className="hud-line" x1="85" y1="75" x2="95" y2="75" />
              <line className="hud-line" x1="205" y1="75" x2="215" y2="75" />

              {/* Scanning Laser Beam */}
              <rect className="cyber-scanner-laser" x="70" y="20" width="160" height="2" />
            </svg>
          </div>

          <div className="login-box">
            <div className="login-tabs">
              <button className="login-tab active" id="tab-returning">RETURNING PLAYER</button>
              <button className="login-tab" id="tab-new">NEW RECRUIT</button>
            </div>

            {/* Returning Player Panel */}
            <div className="login-panel" id="panel-returning">
              <p className="login-subtitle">Welcome back, Agent.</p>
              <div className="input-row">
                <input type="text" id="username-input" placeholder="ENTER YOUR CALLSIGN" autoComplete="off"
                  maxLength={15} />
                <button id="login-btn">RESUME MISSION</button>
              </div>
              <p className="login-hint" id="login-error-msg"></p>
            </div>

            {/* New Player Panel */}
            <div className="login-panel hidden" id="panel-new">
              <p className="login-subtitle">Create your identity, Recruit.</p>
              <div className="input-row">
                <input type="text" id="register-username-input" placeholder="CHOOSE A CALLSIGN"
                  autoComplete="off" maxLength={15} />
                <button id="register-btn">ENLIST NOW</button>
              </div>
              <p className="login-hint" id="register-error-msg"></p>
            </div>
          </div>
        </div>
      </div>

      <div id="red-overlay"></div>

      <div id="selection-screen" className="overlay hidden">
        <div className="selection-content-wrapper">
          {/* Left Side: Cross & Quote */}
          <div className="selection-left">
            <div id="left-logo-container">
              <svg className="cross-svg" viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
                <line x1="50" y1="10" x2="50" y2="140" className="cross-line" />
                <line x1="20" y1="40" x2="80" y2="40" className="cross-line" />
              </svg>
            </div>
            <div id="left-quote-container" className="bible-quote">
              "For the Son of Man came to seek and to save the lost." <br /><span className="quote-ref">- Luke
                19:10</span>
            </div>
          </div>

          {/* Right Side: Categories & Difficulties */}
          <div className="selection-right">
            <div id="category-selection">
              <h2 id="selection-title">Select Category</h2>
              <div className="selection-grid">
                <button className="cat-btn" data-cat="DATABASE">DATABASE</button>
                <button className="cat-btn" data-cat="DATA_STRUCTURE">DATA STRUCTURE</button>
                <button className="cat-btn" data-cat="JAVA">JAVA</button>
                <button className="cat-btn" data-cat="PYTHON">PYTHON</button>
                <button className="cat-btn" data-cat="C">C</button>
                <button className="cat-btn" data-cat="CPP">C++</button>
                <button className="cat-btn" data-cat="ARTIFICIAL_INTELLIGENCE">ARTIFICIAL INTELLIGENCE</button>
                <button className="cat-btn" data-cat="OPERATING_SYSTEM">OPERATING SYSTEM</button>
                <button className="cat-btn" data-cat="CODE_OUTPUT">💻 CODE OUTPUT</button>
                <button className="cat-btn" data-cat="GENERAL_KNOWLEDGE">GENERAL KNOWLEDGE</button>
                <button className="cat-btn" data-cat="NETWORKING">NETWORKING</button>
                <button className="cat-btn" data-cat="CYBERSECURITY">CYBERSECURITY</button>
                <button className="cat-btn" data-cat="WEBDEVELOPMENT">WEB DEVELOPMENT</button>
                <button className="cat-btn" data-cat="SOFTWAREENGINEERING">SOFTWARE ENG.</button>
                <button className="cat-btn" data-cat="LINUX">LINUX</button>
                <button className="cat-btn" data-cat="CLOUD">CLOUD</button>
                <button className="cat-btn" data-cat="DATASCIENCE">DATA SCIENCE</button>
              </div>
            </div>

            <div id="difficulty-selection" className="hidden">
              <h2 id="chosen-category-title">CATEGORY</h2>
              <p className="subtitle" style={{ textAlign: "center", marginBottom: "15px" }}>SELECT THREAT LEVEL</p>
              <div className="selection-grid">
                <button className="diff-btn" data-diff="EASY">EASY</button>
                <button className="diff-btn" data-diff="MEDIUM">MEDIUM</button>
                <button className="diff-btn" data-diff="HARD">HARD</button>
              </div>
              <button id="back-to-cat-btn" className="text-btn" style={{ marginTop: "20px", width: "100%" }}>&lt; BACK</button>
            </div>
          </div>
        </div>
      </div>

      <div id="game-container" className="hidden">
        {/* Top Status Bar */}
        <div className="status-bar">
          <div className="user-info">
            <span id="current-user">AGENT: ---</span>
            <span id="current-rank" className="rank-badge">RANK: Beginner</span>
            <span id="current-xp" className="xp-badge">XP: 0</span>
            <button id="change-protocol-btn" className="text-btn">CHANGE LEVEL</button>
            <button id="logout-btn" className="text-btn">LOGOUT</button>
          </div>
          <div className="score-info">
            <div className="score-box">
              <span className="score-label">SCORE:</span>
              <span id="current-score">0</span>
            </div>
            <div className="score-box high-score-box">
              <span className="score-label">HIGH SCORE:</span>
              <span id="high-score">0</span>
            </div>
          </div>
          <button id="leaderboard-btn" className="text-btn">LEADERBOARD</button>
          <button id="daily-btn" className="text-btn daily-btn-pulse">📅 DAILY MISSION</button>
          <button id="trophies-btn" className="text-btn">🏆 TROPHIES</button>
        </div>
        <div className="header">
          <h1>HANG MAN</h1>
        </div>

        <div className="hangman-display">
          <svg className="hangman-svg" viewBox="0 0 200 250" xmlns="http://www.w3.org/2000/svg">
            {/* 0: Base */}
            <line className="draw-part part-0" pathLength={100} x1="20" y1="230" x2="180" y2="230" />
            {/* 1: Pole */}
            <line className="draw-part part-1" pathLength={100} x1="50" y1="230" x2="50" y2="20" />
            {/* 2: Top bar */}
            <line className="draw-part part-2" pathLength={100} x1="50" y1="20" x2="130" y2="20" />
            {/* 3: Rope */}
            <line className="draw-part part-3" pathLength={100} x1="130" y1="20" x2="130" y2="50" />
            {/* 4: Head */}
            <circle className="draw-part part-4" pathLength={100} cx="130" cy="70" r="20" />
            {/* 5: Body */}
            <line className="draw-part part-5" pathLength={100} x1="130" y1="90" x2="130" y2="150" />
            {/* 6: Left Arm */}
            <line className="draw-part part-6" pathLength={100} x1="130" y1="100" x2="100" y2="130" />
            {/* 7: Right Arm */}
            <line className="draw-part part-7" pathLength={100} x1="130" y1="100" x2="160" y2="130" />
            {/* 8: Left Leg */}
            <line className="draw-part part-8" pathLength={100} x1="130" y1="150" x2="100" y2="190" />
            {/* 9: Right Leg */}
            <line className="draw-part part-9" pathLength={100} x1="130" y1="150" x2="160" y2="190" />
          </svg>
        </div>

        <div id="word-display" className="word-display"></div>

        {/* Clue Section */}
        <div className="clue-container">
          <div className="hint-controls">
            <button id="hint-btn" className="text-btn hint-btn">GET HINT (FREE)</button>
          </div>
          <p id="clue-display" className="hidden">CLUE: <span id="clue-text">waiting for signal...</span></p>
        </div>

        <div id="keyboard" className="keyboard"></div>

        {/* Cinematic Escape Overlay */}
        <div id="escape-container" className="escape-container hidden">
          <div className="escape-portal"></div>
          <div className="escape-runner-container">
            <svg className="escape-runner" viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg">
              <g className="runner-group-escape">
                <circle className="runner-head" cx="50" cy="30" r="10" />
                <line className="runner-body" x1="50" y1="40" x2="50" y2="80" />
                {/* Arms */}
                <line className="runner-arm-l" x1="50" y1="50" x2="30" y2="70" />
                <line className="runner-arm-r" x1="50" y1="50" x2="70" y2="30" />
                {/* Legs */}
                <line className="runner-leg-l" x1="50" y1="80" x2="30" y2="120" />
                <line className="runner-leg-r" x1="50" y1="80" x2="70" y2="110" />
              </g>
            </svg>
          </div>
          <div className="particles" id="escape-particles"></div>
        </div>
      </div>

      <div id="popup">
        <div id="popup-message"></div>
        <button id="next-btn">are u ready to save another man</button>
      </div>

      {/* Leaderboard Popup */}
      <div id="leaderboard-popup" className="hidden">
        <h3>TOP PLAYERS</h3>
        <div className="lb-tabs">
          <button className="lb-tab active" data-leaderboard="score">HIGH SCORE</button>
          <button className="lb-tab" data-leaderboard="speed">FASTEST WIN</button>
          <button className="lb-tab" data-leaderboard="streak">LONG STREAK</button>
        </div>
        <table id="leaderboard-table">
          <thead>
            <tr>
              <th>RANK</th>
              <th>PLAYER</th>
              <th id="lb-val-header">SCORE</th>
            </tr>
          </thead>
          <tbody id="leaderboard-body">
          </tbody>
        </table>
        <button id="close-leaderboard-btn">CLOSE</button>
      </div>

      {/* Anomaly Event Popup */}
      <div id="anomaly-popup" className="hidden">
        <div className="anomaly-content">
          <div className="anomaly-title">⚠ ANOMALY DETECTED</div>
          <div id="anomaly-event-name" className="anomaly-event"></div>
          <div id="anomaly-event-desc" className="anomaly-desc"></div>
          <button id="anomaly-confirm-btn">ACKNOWLEDGE</button>
        </div>
      </div>

      {/* Achievements Modal */}
      <div id="achievements-popup" className="hidden">
        <div className="achievements-content">
          <h3>🏆 YOUR TROPHIES</h3>
          <div id="achievements-list"></div>
          <button id="close-achievements-btn">CLOSE</button>
        </div>
      </div>

      {/* Custom Cursor */}
      <div className="cursor-dot"></div>
      <div className="cursor-outline"></div>
    </>
  );
}
