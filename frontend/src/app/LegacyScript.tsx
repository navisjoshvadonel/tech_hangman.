"use client";

import { useEffect } from 'react';

export default function LegacyScript() {
    useEffect(() => {
        // Inject the custom cursor HTML so the legacy script can find it
        if (!document.querySelector('.cursor-dot')) {
            const dot = document.createElement('div');
            dot.className = 'cursor-dot';
            document.body.appendChild(dot);
            const outline = document.createElement('div');
            outline.className = 'cursor-outline';
            document.body.appendChild(outline);
        }

        const script = document.createElement('script');
        // The script.js is served from the public folder
        script.src = '/script.js';
        script.async = false;
        document.body.appendChild(script);

        return () => {
            // Cleanup on unmount
            const existing = document.querySelector('script[src="/script.js"]');
            if (existing) existing.remove();
        };
    }, []);

    return null;
}
