"use client";

import React, { useEffect, useRef, useState } from 'react';

export const CustomCursor: React.FC = () => {
    const dotRef = useRef<HTMLDivElement>(null);
    const outlineRef = useRef<HTMLDivElement>(null);
    const bracketsRef = useRef<HTMLDivElement>(null);

    const [cursorStyle, setCursorStyle] = useState<string>('CYBER_CYAN');

    useEffect(() => {
        const updateSettings = () => {
            const savedStyle = localStorage.getItem('hangman_cursorStyle') || 'CYBER_CYAN';
            setCursorStyle(savedStyle);
        };

        updateSettings();

        window.addEventListener('settingsChanged', updateSettings);
        return () => {
            window.removeEventListener('settingsChanged', updateSettings);
        };
    }, []);

    useEffect(() => {
        if (cursorStyle === 'SYSTEM') return;

        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let outlineX = mouseX;
        let outlineY = mouseY;
        let isClicking = false;

        const onMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        const getColorHex = () => {
            if (cursorStyle === 'MATRIX_GREEN') return '#00ff66';
            if (cursorStyle === 'SYNTHWAVE_PINK') return '#ff00ff';
            return '#00ffcc';
        };

        const onMouseDown = () => {
            isClicking = true;
            const color = getColorHex();
            if (dotRef.current) dotRef.current.style.transform = `translate(-50%, -50%) scale(1.5)`;
            if (outlineRef.current) {
                outlineRef.current.style.transform = `translate(-50%, -50%) scale(0.8)`;
                outlineRef.current.style.backgroundColor = color === '#ff00ff' ? 'rgba(255, 0, 255, 0.2)' : color === '#00ff66' ? 'rgba(0, 255, 102, 0.2)' : 'rgba(0, 255, 204, 0.2)';
            }
        };

        const onMouseUp = () => {
            isClicking = false;
            if (dotRef.current) dotRef.current.style.transform = `translate(-50%, -50%) scale(1)`;
            if (outlineRef.current) {
                outlineRef.current.style.transform = `translate(-50%, -50%) scale(1)`;
                outlineRef.current.style.backgroundColor = `transparent`;
            }
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mousedown', onMouseDown);
        window.addEventListener('mouseup', onMouseUp);

        let animationFrameId: number;

        const animate = () => {
            outlineX += (mouseX - outlineX) * 0.18;
            outlineY += (mouseY - outlineY) * 0.18;

            if (dotRef.current) {
                if (!isClicking) {
                    dotRef.current.style.transform = `translate(-50%, -50%)`;
                }
                dotRef.current.style.left = `${mouseX}px`;
                dotRef.current.style.top = `${mouseY}px`;
            }

            if (outlineRef.current) {
                outlineRef.current.style.left = `${outlineX}px`;
                outlineRef.current.style.top = `${outlineY}px`;
            }

            if (bracketsRef.current) {
                bracketsRef.current.style.left = `${mouseX}px`;
                bracketsRef.current.style.top = `${mouseY}px`;
                bracketsRef.current.style.transform = `translate(-50%, -50%) rotate(${Date.now() / 50}deg)`;
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mouseup', onMouseUp);
            cancelAnimationFrame(animationFrameId);
        };
    }, [cursorStyle]);

    if (cursorStyle === 'SYSTEM') {
        return (
            <style dangerouslySetInnerHTML={{
                __html: `* { cursor: auto !important; }`
            }} />
        );
    }

    const themeColor = cursorStyle === 'MATRIX_GREEN' ? '#00ff66' : cursorStyle === 'SYNTHWAVE_PINK' ? '#ff00ff' : '#00ffcc';
    const bgGlow = cursorStyle === 'MATRIX_GREEN' ? 'rgba(0, 255, 102, 0.4)' : cursorStyle === 'SYNTHWAVE_PINK' ? 'rgba(255, 0, 255, 0.4)' : 'rgba(0, 255, 204, 0.4)';

    return (
        <>
            <div
                ref={dotRef}
                className="pointer-events-none fixed z-[100000000] w-2 h-2 rounded-full transition-transform duration-100 ease-in-out hidden md:block mix-blend-screen"
                style={{
                    left: '-10px',
                    top: '-10px',
                    backgroundColor: themeColor,
                    boxShadow: `0 0 10px ${themeColor}, 0 0 20px ${themeColor}`
                }}
            />
            <div
                ref={outlineRef}
                className="pointer-events-none fixed z-[99999999] w-10 h-10 border rounded-full transition-[width,height,background-color,border-width,transform] duration-200 ease-out hidden md:block mix-blend-screen"
                style={{
                    left: '-20px',
                    top: '-20px',
                    borderColor: themeColor,
                    boxShadow: `0 0 15px ${bgGlow}`
                }}
            />
            {/* HUD Brackets */}
            <div
                ref={bracketsRef}
                className="pointer-events-none fixed z-[99999998] w-14 h-14 hidden md:block"
                style={{ left: '-50px', top: '-50px' }}
            >
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 opacity-50" style={{ borderColor: themeColor }}></div>
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 opacity-50" style={{ borderColor: themeColor }}></div>
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 opacity-50" style={{ borderColor: themeColor }}></div>
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 opacity-50" style={{ borderColor: themeColor }}></div>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        * { cursor: none !important; }
        
        button:hover ~ .cursor-outline,
        a:hover ~ .cursor-outline,
        input:hover ~ .cursor-outline {
            width: 60px !important;
            height: 60px !important;
            background-color: ${bgGlow} !important;
            border-width: 3px !important;
            box-shadow: 0 0 25px ${themeColor} !important;
        }
        
        @media screen and (max-width: 768px) {
            * { cursor: auto !important; }
        }
      `}} />
        </>
    );
};
