import React, { useEffect, useState } from 'react';

interface WelcomeScreenProps {
    onStart: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onStart }) => {
    const [phase, setPhase] = useState<number>(0);

    useEffect(() => {
        // Cinematic timings matched to the legacy CSS animations
        const timers = [
            setTimeout(() => setPhase(1), 500),
            setTimeout(() => setPhase(2), 2500),
            setTimeout(() => setPhase(3), 4500),
            setTimeout(() => setPhase(4), 6500),
            setTimeout(() => setPhase(5), 9000), // Show main logo
        ];

        return () => timers.forEach(clearTimeout);
    }, []);

    return (
        <div className="fixed inset-0 bg-[#020306] z-50 flex flex-col items-center justify-center p-4">
            {/* Skip button for development/impatient users */}
            <button
                onClick={onStart}
                className="absolute top-4 right-4 text-cyan-400/50 hover:text-cyan-400 text-sm tracking-widest font-mono cursor-none"
            >
                SKIP_SEQUENCE
            </button>

            <div className="relative flex flex-col items-center justify-center w-full h-full">
                {phase === 1 && (
                    <div className="absolute text-cyan-400 text-2xl md:text-4xl tracking-[5px] neon-text-cyan animate-text-in font-mono text-center">
                        WELCOME USER...
                    </div>
                )}

                {phase === 2 && (
                    <div className="absolute text-cyan-400 text-2xl md:text-4xl tracking-[5px] neon-text-cyan animate-text-in font-mono text-center">
                        ARRESTING THE MAN...
                    </div>
                )}

                {phase === 3 && (
                    <div className="absolute text-cyan-400 text-2xl md:text-4xl tracking-[5px] neon-text-cyan animate-text-in font-mono text-center">
                        SETTING UP THE STAGE...
                    </div>
                )}

                {phase === 4 && (
                    <div className="absolute text-cyan-400 text-2xl md:text-4xl tracking-[5px] neon-text-cyan animate-text-in font-mono text-center">
                        THE MAN NEEDS YOU...
                    </div>
                )}

                {phase >= 5 && (
                    <div className="flex flex-col items-center animate-logo-in">
                        <h1 className="text-white text-5xl md:text-7xl font-bold tracking-[20px] uppercase text-center 
                         drop-shadow-[0_0_30px_rgba(0,255,204,0.9)] 
                         [text-shadow:0_0_60px_rgba(0,255,204,0.5)] mb-12">
                            THE HANG MAN
                        </h1>
                        <button
                            onClick={onStart}
                            className="mt-8 px-8 py-3 bg-cyan-900/40 border border-cyan-400 text-cyan-300 font-mono tracking-widest
                       hover:bg-cyan-400 hover:text-black transition-all duration-300 shadow-[0_0_15px_rgba(0,255,204,0.3)]
                       hover:shadow-[0_0_30px_rgba(0,255,204,0.8)] cursor-none"
                        >
                            INITIALIZE_PROTOCOL
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
