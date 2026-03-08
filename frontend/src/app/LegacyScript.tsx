"use client";

import Script from 'next/script';

export default function LegacyScript() {
    return (
        <Script
            src="/script.js"
            strategy="afterInteractive"
        />
    );
}
