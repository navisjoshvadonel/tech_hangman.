import os
import sys

# Add the current directory to sys.path so we can import words.py and server.py
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from words import CATEGORIZED_WORDS
    from server import init_db, get_db_connection, get_cursor, execute_query
except ImportError as e:
    print(f"Error: {e}")
    sys.exit(1)

def populate():
    # Ensure tables are created first
    init_db()
    
    conn = get_db_connection()
    c = get_cursor(conn)
    
    print("Starting word migration...")
    
    count = 0
    for category, difficulties in CATEGORIZED_WORDS.items():
        for difficulty, word_list in difficulties.items():
            for word_obj in word_list:
                word = word_obj['word'].upper()
                hint = word_obj['clue']
                description = word_obj.get('description', '')
                
                try:
                    execute_query(c, '''
                        INSERT INTO Words (word, hint, category, difficulty, description)
                        VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(word, category, difficulty) DO UPDATE SET
                            hint = excluded.hint,
                            description = excluded.description
                    ''', (word, hint, category, difficulty, description))
                    count += 1
                except Exception:
                    pass
    
    conn.commit()
    # Final count check
    execute_query(c, 'SELECT COUNT(*) FROM Words')
    res = c.fetchone()
    final_count = 0
    if res:
        final_count = res[0] if not isinstance(res, dict) else list(res.values())[0]
    conn.close()
    print(f"Migration completed. Total words in DB: {final_count}")

if __name__ == '__main__':
    populate()
