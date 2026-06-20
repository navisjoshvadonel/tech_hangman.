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
        word TEXT UNIQUE,
        hint TEXT,
        category TEXT,
        difficulty TEXT,
        description TEXT
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
                try:
                    c.execute('INSERT INTO Words (word, hint, category, difficulty, description) VALUES (?, ?, ?, ?, ?)',
                              (item["word"].upper(), item["clue"], category, diff, item.get("description", "")))
                    count += 1
                except sqlite3.IntegrityError:
                    pass

    conn.commit()
    conn.close()
    print(f"Migration completed successfully. Migrated {count} words.")

if __name__ == "__main__":
    migrate()
