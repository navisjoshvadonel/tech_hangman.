import React from 'react';

interface WordDisplayProps {
    word: string;
    guessedLetters: Set<string>;
}

export const WordDisplay: React.FC<WordDisplayProps> = ({ word, guessedLetters }) => {
    return (
        <div className="flex flex-wrap justify-center gap-2 md:gap-4 my-8 min-h-[4rem]">
            {word.split("").map((char, index) => {
                const isGuessed = guessedLetters.has(char);

                // Don't hide spaces if the word has them (though our list is all single strings)
                if (char === " ") {
                    return <div key={index} className="w-4 md:w-8"></div>;
                }

                return (
                    <div
                        key={index}
                        className={`
              w-10 h-10 md:w-14 md:h-14 
              flex items-center justify-center 
              text-2xl md:text-3xl font-bold uppercase
              border-b-4 
              ${isGuessed ? 'border-cyan-400 text-cyan-50 drop-shadow-[0_0_10px_var(--neon-cyan)]' : 'border-zinc-700 text-transparent'}
              transition-all duration-300
            `}
                    >
                        {isGuessed ? char : "_"}
                    </div>
                );
            })}
        </div>
    );
};
