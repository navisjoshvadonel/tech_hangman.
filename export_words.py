import json
import os
import sys

# Add backend directory to sys path so we can import words.py
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

try:
    from words import CATEGORIZED_WORDS
except ImportError as e:
    print(f"Error importing words: {e}")
    sys.exit(1)

output_file = os.path.join(os.path.dirname(__file__), 'frontend', 'src', 'data', 'words.json')

# Create directory if it doesn't exist
os.makedirs(os.path.dirname(output_file), exist_ok=True)

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(CATEGORIZED_WORDS, f, indent=2)

print(f"Successfully exported {sum(len(words) for diffs in CATEGORIZED_WORDS.values() for words in diffs.values())} words to {output_file}")
