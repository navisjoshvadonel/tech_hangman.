import React from 'react';

interface HangmanFigureProps {
    mistakes: number;
}

export const HangmanFigure: React.FC<HangmanFigureProps> = ({ mistakes }) => {
    // We have 10 parts total (0 through 9)
    const showPart = (index: number) => mistakes > index;

    return (
        <div className="w-full max-w-[200px] flex justify-center items-center my-6">
            <svg
                className="hangman-svg w-[200px] h-[250px] drop-shadow-[0_0_10px_var(--neon-cyan)]"
                viewBox="0 0 200 250"
                xmlns="http://www.w3.org/2000/svg"
            >
                <style>
                    {`
            .draw-part {
              fill: none;
              stroke: #00ffcc;
              stroke-width: 4;
              stroke-linecap: round;
              stroke-linejoin: round;
              transition: stroke-dashoffset 0.5s ease-in-out;
            }
          `}
                </style>
                {/* 0: Base */}
                {showPart(0) && <line className="draw-part part-0" x1="20" y1="230" x2="180" y2="230" />}
                {/* 1: Pole */}
                {showPart(1) && <line className="draw-part part-1" x1="50" y1="230" x2="50" y2="20" />}
                {/* 2: Top bar */}
                {showPart(2) && <line className="draw-part part-2" x1="50" y1="20" x2="130" y2="20" />}
                {/* 3: Rope */}
                {showPart(3) && <line className="draw-part part-3" x1="130" y1="20" x2="130" y2="50" />}
                {/* 4: Head */}
                {showPart(4) && <circle className="draw-part part-4" cx="130" cy="70" r="20" />}
                {/* 5: Body */}
                {showPart(5) && <line className="draw-part part-5" x1="130" y1="90" x2="130" y2="150" />}
                {/* 6: Left Arm */}
                {showPart(6) && <line className="draw-part part-6" x1="130" y1="100" x2="100" y2="130" />}
                {/* 7: Right Arm */}
                {showPart(7) && <line className="draw-part part-7" x1="130" y1="100" x2="160" y2="130" />}
                {/* 8: Left Leg */}
                {showPart(8) && <line className="draw-part part-8" x1="130" y1="150" x2="100" y2="190" />}
                {/* 9: Right Leg */}
                {showPart(9) && <line className="draw-part part-9" x1="130" y1="150" x2="160" y2="190" />}
            </svg>
        </div>
    );
};
