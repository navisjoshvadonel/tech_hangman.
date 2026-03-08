import React from 'react';

interface KeyboardProps {
    guessedLetters: Set<string>;
    onGuess: (letter: string) => void;
    disabled: boolean;
    word: string;
}

const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export const Keyboard: React.FC<KeyboardProps> = ({ guessedLetters, onGuess, disabled, word }) => {
    return (
        <div className="flex flex-wrap justify-center gap-2 max-w-2xl mx-auto my-6">
            {KEYS.map((key) => {
                const isGuessed = guessedLetters.has(key);
                const isCorrect = isGuessed && word.includes(key);
                const isWrong = isGuessed && !word.includes(key);

                let buttonClass = "w-10 h-14 text-xl font-bold rounded shadow-md transition-all duration-200 uppercase duration-300 neon-border-cyan ";

                if (isCorrect) {
                    buttonClass += "bg-green-500/20 shadow-[0_0_15px_rgba(34,197,94,0.6)] text-green-400 border-green-500 opacity-80 cursor-not-allowed";
                } else if (isWrong) {
                    buttonClass += "bg-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.4)] text-red-500 border-red-500 opacity-50 cursor-not-allowed";
                } else {
                    buttonClass += "bg-black/40 text-cyan-400 border-cyan-500/50 hover:bg-cyan-900/40 hover:scale-105 hover:shadow-[0_0_15px_var(--neon-cyan)] cursor-none";
                }

                return (
                    <button
                        key={key}
                        onClick={() => onGuess(key)}
                        disabled={disabled || isGuessed}
                        className={`border ${buttonClass}`}
                    >
                        {key}
                    </button>
                );
            })}
        </div>
    );
};
