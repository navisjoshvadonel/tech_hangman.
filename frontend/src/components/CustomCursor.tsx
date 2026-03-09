"use client";

import React, { useEffect, useRef } from 'react';

export const CustomCursor: React.FC = () => {
    const dotRef = useRef<HTMLDivElement>(null);
    const outlineRef = useRef<HTMLDivElement>(null);
    const bracketsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let mouseX = window.innerWidth / 2;
        let mouseY = window.innerHeight / 2;
        let outlineX = mouseX;
        let outlineY = mouseY;
        let isClicking = false;

        const onMouseMove = (e: MouseEvent) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        };

        const onMouseDown = () => {
            isClicking = true;
            if (dotRef.current) dotRef.current.style.transform = `translate(-50%, -50%) scale(1.5)`;
            if (outlineRef.current) {
                outlineRef.current.style.transform = `translate(-50%, -50%) scale(0.8)`;
                outlineRef.current.style.backgroundColor = `rgba(0, 255, 204, 0.2)`;
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
            // Lerp for smooth outline follow
            outlineX += (mouseX - outlineX) * 0.15;
            outlineY += (mouseY - outlineY) * 0.15;

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
    }, []);

    return (
        <>
            <div
                ref={dotRef}
                className="pointer-events-none fixed z-[10000] w-2 h-2 rounded-full bg-cyan-400 drop-shadow-[0_0_10px_var(--neon-cyan)] transition-transform duration-100 ease-in-out hidden md:block mix-blend-screen"
                style={{ left: '-10px', top: '-10px', boxShadow: '0 0 10px #00ffcc, 0 0 20px #00ffcc' }}
            />
            <div
                ref={outlineRef}
                className="pointer-events-none fixed z-[9999] w-10 h-10 border border-cyan-400 rounded-full transition-[width,height,background-color,border-width,transform] duration-200 ease-out hidden md:block mix-blend-screen"
                style={{ left: '-20px', top: '-20px', boxShadow: '0 0 15px rgba(0, 255, 204, 0.4)' }}
            />
            {/* HUD Brackets */}
            <div
                ref={bracketsRef}
                className="pointer-events-none fixed z-[9998] w-14 h-14 hidden md:block"
                style={{ left: '-50px', top: '-50px' }}
            >
                <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-cyan-400 opacity-50"></div>
                <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-cyan-400 opacity-50"></div>
                <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-cyan-400 opacity-50"></div>
                <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-cyan-400 opacity-50"></div>
            </div>

            {/* 
        Tailwind global styles handle the pointer hiding.
        Interactive elements like buttons should apply the 'hover' classes
        globally or locally. In React, since we can't easily query all elements efficiently 
        every frame, we're building the base styles into the cursor and relying on standard CSS for hover if needed.
      */}
            <style dangerouslySetInnerHTML={{
                __html: `
        * { cursor: none !important; }
        
        button:hover ~ .cursor-outline,
        a:hover ~ .cursor-outline,
        input:hover ~ .cursor-outline {
            width: 60px !important;
            height: 60px !important;
            background-color: rgba(0, 255, 204, 0.1) !important;
            border-width: 3px !important;
            box-shadow: 0 0 25px rgba(0, 255, 204, 0.6) !important;
        }
        
        @media screen and (max-width: 768px) {
            * { cursor: auto !important; }
        }
      `}} />
        </>
    );
};
