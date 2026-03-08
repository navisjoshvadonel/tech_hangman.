import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HANG MAN: Anti-Gravity Agent",
  description: "A cyberpunk-themed technical Hangman game for software engineers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
