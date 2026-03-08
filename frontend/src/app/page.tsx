"use client";

import React, { useState, useEffect } from 'react';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { CategorySelector } from '@/components/CategorySelector';
import { WordDisplay } from '@/components/WordDisplay';
import { Keyboard } from '@/components/Keyboard';
import { HangmanFigure } from '@/components/HangmanFigure';
import { CustomCursor } from '@/components/CustomCursor';

type GameState = 'welcome' | 'categories' | 'playing' | 'won' | 'lost';

export default function Home() {
  const [gameState, setGameState] = useState<GameState>('welcome');
  const [category, setCategory] = useState<string>('');
  const [word, setWord] = useState<string>('');
  const [clue, setClue] = useState<string>('');
  const [guessedLetters, setGuessedLetters] = useState<Set<string>>(new Set());
  const [mistakes, setMistakes] = useState<number>(0);

  const MAX_MISTAKES = 10;

  // Derive win/loss state from current guesses
  useEffect(() => {
    if (gameState !== 'playing' || !word) return;

    // Check Win
    const wordLetters = word.replace(/ /g, '').split('');
    const hasWon = wordLetters.every(char => guessedLetters.has(char));

    if (hasWon) {
      setTimeout(() => setGameState('won'), 500);
    }
    // Check Loss
    else if (mistakes >= MAX_MISTAKES) {
      setTimeout(() => setGameState('lost'), 500);
    }
  }, [guessedLetters, mistakes, word, gameState]);

  const startGame = () => {
    setGameState('categories');
  };

  const selectCategory = async (selectedCategory: string) => {
    setCategory(selectedCategory);
    setGuessedLetters(new Set());
    setMistakes(0);

    // In a full implementation, this should call your Python backend or the Next.js API route
    try {
      const res = await fetch('/api/word');
      const data = await res.json();
      setWord(data.word.toUpperCase());
      setClue(data.hint || data.clue || "No clue available.");
      setGameState('playing');
    } catch (err) {
      console.error("Failed to fetch word. Falling back.", err);
      // Fallback if API is unreachable
      setWord("PROTOCOL");
      setClue("A standard set of rules.");
      setGameState('playing');
    }
  };

  const handleGuess = (letter: string) => {
    if (gameState !== 'playing') return;

    const newGuessed = new Set(guessedLetters);
    newGuessed.add(letter);
    setGuessedLetters(newGuessed);

    if (!word.includes(letter)) {
      setMistakes(prev => prev + 1);
    }
  };

  const resetGame = () => {
    setGameState('categories');
  };

  return (
    <main className="min-h-screen bg-[#050810] text-white font-mono overflow-x-hidden relative flex flex-col pt-12">
      <CustomCursor />

      {/* Persistent Header */}
      <h1 className="text-4xl text-center font-bold tracking-[10px] text-cyan-400 neon-text-cyan mb-8">
        HANG MAN
      </h1>

      {gameState === 'welcome' && (
        <WelcomeScreen onStart={startGame} />
      )}

      {gameState === 'categories' && (
        <CategorySelector onSelect={selectCategory} />
      )}

      {(gameState === 'playing' || gameState === 'won' || gameState === 'lost') && (
        <div className="flex flex-col items-center w-full max-w-4xl mx-auto px-4">

          <div className="flex justify-between w-full mb-4 px-4 text-cyan-400">
            <span>DOMAIN: {category}</span>
            <span className={mistakes >= 8 ? 'text-red-500 animate-pulse' : ''}>
              SYSTEM INTEGRITY: {MAX_MISTAKES - mistakes} / {MAX_MISTAKES}
            </span>
          </div>

          <HangmanFigure mistakes={mistakes} />
          <WordDisplay word={word} guessedLetters={guessedLetters} />

          {/* Clue Section */}
          <div className="my-6 p-4 border-l-4 border-cyan-400 bg-cyan-900/20 max-w-2xl text-center w-full">
            <span className="text-amber-400 italic text-lg drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]">
              CLUE: {clue}
            </span>
          </div>

          {(gameState === 'playing') ? (
            <Keyboard
              word={word}
              guessedLetters={guessedLetters}
              onGuess={handleGuess}
              disabled={false}
            />
          ) : (
            <div className="flex flex-col items-center mt-8 p-8 border border-cyan-400 bg-cyan-900/30 rounded-xl backdrop-blur-md shadow-[0_0_30px_rgba(0,255,204,0.2)]">
              <h2 className={`text-3xl font-bold mb-4 ${gameState === 'won' ? 'text-green-400 shadow-[0_0_15px_#22c55e]' : 'text-red-500 shadow-[0_0_15px_#ef4444]'}`}>
                {gameState === 'won' ? 'MISSION ACCOMPLISHED' : 'SYSTEM COMPROMISED'}
              </h2>
              {gameState === 'lost' && (
                <p className="text-xl mb-6 text-zinc-300">The correct sequence was: <span className="text-cyan-400 font-bold">{word}</span></p>
              )}
              <button
                onClick={resetGame}
                className="px-8 py-3 bg-cyan-950 border border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black transition-colors"
              >
                AWAITING NEW DIRECTIVE (PLAY AGAIN)
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
