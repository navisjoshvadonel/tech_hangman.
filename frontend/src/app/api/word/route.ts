import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    try {
        // Find the absolute path of the json directory
        const jsonDirectory = path.join(process.cwd(), 'src/data');

        // Read the json file
        const fileContents = await fs.readFile(jsonDirectory + '/words.json', 'utf8');

        // Parse the json data
        const wordsData = JSON.parse(fileContents);

        let availableWords: any[] = [];

        if (category && wordsData[category]) {
            // Flatten all difficulties for the selected category
            const diffs = wordsData[category];
            availableWords = [
                ...(diffs.EASY || []),
                ...(diffs.MEDIUM || []),
                ...(diffs.HARD || [])
            ];
        } else {
            // Flatten ALL words if no category provided (or invalid category)
            for (const cat of Object.keys(wordsData)) {
                const diffs = wordsData[cat];
                availableWords = [
                    ...availableWords,
                    ...(diffs.EASY || []),
                    ...(diffs.MEDIUM || []),
                    ...(diffs.HARD || [])
                ];
            }
        }

        if (availableWords.length === 0) {
            return NextResponse.json({ word: "ERROR", hint: "No words found for this category." }, { status: 404 });
        }

        // Select a random word
        const randomWordObj = availableWords[Math.floor(Math.random() * availableWords.length)];

        return NextResponse.json(randomWordObj);

    } catch (error) {
        console.error("Error reading words.json:", error);
        return NextResponse.json({ word: "PROTOCOL", hint: "Fallback: Database unreachable." }, { status: 500 });
    }
}
