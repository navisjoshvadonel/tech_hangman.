import os
import sqlite3
import words

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'hangman.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    print("Creating Words table...")
    c.execute('''
    CREATE TABLE IF NOT EXISTS Words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        difficulty TEXT,
        word TEXT,
        clue TEXT
    )
    ''')

    # Clear existing entries if any
    c.execute('DELETE FROM Words')

    print("Creating indexes...")
    c.execute('CREATE INDEX IF NOT EXISTS idx_cat_diff ON Words(category, difficulty)')
    c.execute('CREATE INDEX IF NOT EXISTS idx_word ON Words(word)')

    print("Migrating data from words.py...")
    count = 0
    for category, diffs in words.CATEGORIZED_WORDS.items():
        for diff, word_list in diffs.items():
            for item in word_list:
                c.execute('INSERT INTO Words (category, difficulty, word, clue) VALUES (?, ?, ?, ?)',
                          (category, diff, item["word"], item["clue"]))
                count += 1

    conn.commit()
    conn.close()
    print(f"Migration completed successfully. Migrated {count} words.")

if __name__ == "__main__":
    migrate()
