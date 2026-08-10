import os
import sys
import sqlite3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, 'hangman.db')
DB_PATH = os.environ.get('DB_PATH', DEFAULT_DB_PATH)

def reset_user_data(keep_username='NAVIS'):
    """Wipes all users, scores, progress, and achievements while preserving game words, optionally keeping one user."""
    if not os.path.exists(DB_PATH):
        print(f"Database file not found at '{DB_PATH}'. Nothing to reset.")
        return

    print(f"Connecting to database at '{DB_PATH}'...")
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()

    keep_user_id = None
    if keep_username and keep_username.lower() not in ('none', 'all', 'null', 'false'):
        try:
            c.execute("SELECT id FROM Users WHERE LOWER(username) = LOWER(?)", (keep_username,))
            row = c.fetchone()
            if row:
                keep_user_id = row[0]
        except Exception as e:
            print(f"Could not retrieve user '{keep_username}': {e}")

    if keep_user_id is not None:
        print(f"Preserving user '{keep_username}' (ID: {keep_user_id}) and wiping all other user data...")
        tables_with_user_id = [
            ('Achievements', 'user_id'),
            ('UserWordProgress', 'user_id'),
            ('MissionRuns', 'user_id'),
            ('DuelInvites', 'creator_user_id'),
            ('DomainScores', 'user_id'),
            ('DuelRuns', 'user_id'),
            ('LiveDuelQueue', 'user_id'),
            ('FriendRoomPlayers', 'user_id')
        ]
        for table, col in tables_with_user_id:
            try:
                c.execute(f"DELETE FROM {table} WHERE {col} != ?", (keep_user_id,))
                print(f"  - Cleared non-matching data from table: {table}")
            except sqlite3.OperationalError as e:
                print(f"  - Table {table} skipped/failed: {e}")

        # Wipe tables with ephemeral duel details completely
        other_tables = ['LiveDuels', 'FriendRooms']
        for table in other_tables:
            try:
                c.execute(f"DELETE FROM {table}")
                print(f"  - Cleared table completely: {table}")
            except sqlite3.OperationalError as e:
                print(f"  - Table {table} skipped/failed: {e}")

        try:
            c.execute("DELETE FROM Users WHERE id != ?", (keep_user_id,))
            print("  - Cleared other user accounts")
        except sqlite3.OperationalError as e:
            print(f"  - Failed to delete other users: {e}")

    else:
        print("Wiping all user data and history completely...")
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
    keep = 'NAVIS'
    if len(sys.argv) > 1:
        keep = sys.argv[1]
    reset_user_data(keep)
