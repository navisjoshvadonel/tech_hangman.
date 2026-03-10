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
                    ''', (word, hint, category, difficulty, description))
                    count += 1
                except Exception:
                    # Skip duplicate words
                    pass
    
    conn.commit()
    conn.close()
    print(f"Successfully migrated {count} words to the database.")

if __name__ == '__main__':
    populate()
