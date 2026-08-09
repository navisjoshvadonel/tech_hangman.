import os
import sys
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, 'hangman.db')
DB_PATH = os.environ.get('DB_PATH', DEFAULT_DB_PATH)

def reset_user_data():
    """Wipes all users, scores, progress, and achievements while preserving game words."""
    if not os.path.exists(DB_PATH):
        print(f"Database file not found at '{DB_PATH}'. Nothing to reset.")
        return

    print(f"Connecting to database at '{DB_PATH}'...")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    user_tables = [
        'Users',
        'Achievements',
        'UserWordProgress',
        'MissionRuns',
        'DuelInvites',
        'DomainScores',
        'DuelRuns',
        'LiveDuelQueue',
        'LiveDuels',
        'FriendRooms',
        'FriendRoomPlayers'
    ]

    print("Wiping existing user data and history...")
    for table in user_tables:
        try:
            c.execute(f"DELETE FROM {table}")
            print(f"  - Cleared table: {table}")
        except sqlite3.OperationalError as e:
            print(f"  - Table {table} skipped or not found ({e})")

    # Reset sqlite_sequence for auto-increment counters
    try:
        c.execute("DELETE FROM sqlite_sequence WHERE name IN ('Users', 'Achievements', 'UserWordProgress', 'MissionRuns', 'DuelInvites', 'DomainScores', 'DuelRuns')")
    except Exception:
        pass

    conn.commit()
    
    # Run VACUUM to reclaim space
    try:
        c.execute("VACUUM")
    except Exception:
        pass

    c.execute("SELECT COUNT(*) FROM Users")
    user_count = c.fetchone()[0]

    c.execute("SELECT COUNT(*) FROM Words")
    word_count = c.fetchone()[0]

    conn.close()

    print("\nDATABASE RESET COMPLETE!")
    print(f"  - Total Users remaining: {user_count}")
    print(f"  - Total Words preserved: {word_count}")

if __name__ == '__main__':
    reset_user_data()
