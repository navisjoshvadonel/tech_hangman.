import sqlite3
import os
import sys

# Add the current directory to sys.path so we can import words.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from words import CATEGORIZED_WORDS
    from server import init_db
except ImportError:
    print("Error: Could not find words.py or server.py in the current directory.")
    sys.exit(1)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, 'hangman.db')
DB_PATH = os.environ.get('DB_PATH', DEFAULT_DB_PATH)

def populate():
    # Ensure tables are created first
    init_db()
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    print("Starting word migration...")
    
    count = 0
    for category, difficulties in CATEGORIZED_WORDS.items():
        for difficulty, words in difficulties.items():
            for word_obj in words:
                word = word_obj['word'].upper()
                hint = word_obj['clue']
                # Categorized words usually don't have descriptions, 
                # but we can use the hint as a base or leave description empty for now.
                description = word_obj.get('description', '')
                
                try:
                    c.execute('''
                        INSERT INTO Words (word, hint, category, difficulty, description)
                        VALUES (?, ?, ?, ?, ?)
                    ''', (word, hint, category, difficulty, description))
                    count += 1
                except sqlite3.IntegrityError:
                    # Skip duplicate words
                    pass
    
    conn.commit()
    conn.close()
    print(f"Successfully migrated {count} words to the database.")

if __name__ == '__main__':
    populate()
