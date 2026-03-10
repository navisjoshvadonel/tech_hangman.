import random
import json
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import words
try:
    import mysql.connector
    from urllib.parse import urlparse
except ImportError:
    mysql = None

app = Flask(__name__, static_folder='.')
CORS(app)

# === Config ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, 'hangman.db')
DB_PATH = os.environ.get('DB_PATH', DEFAULT_DB_PATH)
MYSQL_URL = os.environ.get('DATABASE_URL') or os.environ.get('MYSQL_URL')

# Global toggle for placeholder style
# MySQL uses %s, SQLite uses ?
DB_TYPE = 'sqlite'
if MYSQL_URL and MYSQL_URL.startswith('mysql'):
    DB_TYPE = 'mysql'

print(f"DATABASE IDENTITY INITIALIZED: {DB_TYPE}")

def get_db_connection():
    """Returns a connection based on the available configuration."""
    if DB_TYPE == 'mysql':
        try:
            url = urlparse(MYSQL_URL)
            conn = mysql.connector.connect(
                host=url.hostname,
                port=url.port or 3306,
                user=url.username,
                password=url.password,
                database=url.path.lstrip('/'),
                auth_plugin='mysql_native_password'
            )
            return conn
        except Exception as e:
            print(f"FAILED TO CONNECT TO MYSQL: {e}")
            # Fallback to SQLite if MySQL fails
            import sqlite3
            conn = sqlite3.connect(DEFAULT_DB_PATH, timeout=20)
            conn.row_factory = sqlite3.Row
            return conn
    else:
        import sqlite3
        conn = sqlite3.connect(DB_PATH, timeout=20)
        conn.execute('PRAGMA journal_mode=WAL')
        conn.row_factory = sqlite3.Row
        return conn

def get_cursor(conn):
    """Returns a cursor that behaves similarly across DBs."""
    if DB_TYPE == 'mysql':
        return conn.cursor(buffered=True)
    return conn.cursor()

def execute_query(cursor, query, params=None):
    """Abstraction layer to handle SQLite vs MySQL differences."""
    if DB_TYPE == 'mysql':
        query = query.replace('?', '%s')
        # MySQL doesn't like AUTOINCREMENT (needs AUTO_INCREMENT)
        query = query.replace('AUTOINCREMENT', 'AUTO_INCREMENT')
        # MySQL DATE is a reserved word sometimes, but usually fine. 
        # But our table used 'date' as a column name. I changed it to 'date_col' in init_db.
    cursor.execute(query, params or ())
    return cursor

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/api/ping')
def ping():
    return jsonify({"status": "active", "timestamp": datetime.now().isoformat()}), 200

# === Database Helpers ===
def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    
    # User Table
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username VARCHAR(255) UNIQUE,
            highest_score INTEGER DEFAULT 0
        )
    ''')
    
    # Safe Migrations for Phase 2: Add progression columns if they don't exist
    new_columns = [
        ("xp", "INTEGER DEFAULT 0"),
        ("level", "INTEGER DEFAULT 1"),
        ("rank", "TEXT DEFAULT 'Beginner'"),
        ("total_wins", "INTEGER DEFAULT 0"),
        ("total_losses", "INTEGER DEFAULT 0"),
        ("fastest_win_seconds", "INTEGER DEFAULT 999999"),
        ("current_streak", "INTEGER DEFAULT 0"),
        ("longest_streak", "INTEGER DEFAULT 0"),
        ("guessed_words", "TEXT DEFAULT '[]'"),
        ("last_daily_date", "TEXT DEFAULT ''"),
        ("hints_used", "INTEGER DEFAULT 0"),
        ("total_games", "INTEGER DEFAULT 0"),
        ("story_progress", "INTEGER DEFAULT 1")
    ]
    
    for col_name, col_type in new_columns:
        try:
            # MySQL uses different ALTER syntax if we want to be safe, but let's try common
            execute_query(c, f'ALTER TABLE Users ADD COLUMN {col_name} {col_type}')
        except Exception as e:
            pass # Column likely exists or error in syntax handled by pass
            
    # Achievements table
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS Achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            achievement_name VARCHAR(255),
            FOREIGN KEY(user_id) REFERENCES Users(id)
        )
    ''')

    # NEW: Words table for massive database
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS Words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word VARCHAR(255) UNIQUE,
            hint TEXT,
            category VARCHAR(255),
            difficulty VARCHAR(255),
            description TEXT
        )
    ''')

    # NEW: Daily Challenge History
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS DailyChallenges (
            date_col VARCHAR(10) PRIMARY KEY,
            word_id INTEGER,
            FOREIGN KEY(word_id) REFERENCES Words(id)
        )
    ''')

    # NEW: Accurate per-word progress tracking
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS UserWordProgress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            word_id INTEGER,
            completed_at TEXT,
            UNIQUE(user_id, word_id),
            FOREIGN KEY(user_id) REFERENCES Users(id),
            FOREIGN KEY(word_id) REFERENCES Words(id)
        )
    ''')
    
    conn.commit()
    
    # NEW: Self-healing check for words
    execute_query(c, 'SELECT COUNT(*) FROM Words')
    count = c.fetchone()[0]
    if count == 0:
        print("WORDS TABLE EMPTY: Automatically populating from words.py...")
        from words import CATEGORIZED_WORDS
        for category, difficulties in CATEGORIZED_WORDS.items():
            for difficulty, word_list in difficulties.items():
                for item in word_list:
                    try:
                        execute_query(c, '''
                            INSERT INTO Words (word, hint, category, difficulty, description)
                            VALUES (?, ?, ?, ?, ?)
                        ''', (item['word'].upper(), item['clue'], category, difficulty, item.get('description', '')))
                    except Exception:
                        continue # Skip duplicates
        conn.commit()
        print(f"POPULATION COMPLETE: Added initial words set.")
        
    conn.close()

init_db()

# === API Endpoints ===

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    
    if not username:
        return jsonify({"error": "Username required"}), 400
        
    conn = get_db_connection()
    c = get_cursor(conn)
    # Case-insensitive checking
    execute_query(c, 
'SELECT id, username, highest_score, xp, level, rank, total_wins, total_losses, story_progress FROM Users WHERE LOWER(username) = LOWER(?)', (username,))
    user = c.fetchone()
    
    if not user:
        conn.close()
        return jsonify({"error": f'Callsign "{username}" not found. If you are new, use the NEW RECRUIT tab!'}), 404
    else:
        user_id, _, high_score, xp, level, rank, total_wins, total_losses, story_progress = user
        
    conn.close()
    
    return jsonify({
        "message": "Login successful", 
        "user_id": user_id, 
        "username": username,
        "highest_score": high_score,
        "xp": xp,
        "level": level,
        "rank": rank,
        "total_wins": total_wins,
        "total_losses": total_losses,
        "story_progress": story_progress
    })

@app.route('/api/register', methods=['POST'])
def register():
    """Creates a brand new user. Fails if username already exists."""
    data = request.json
    username = data.get('username', '').strip()
    
    if not username:
        return jsonify({"error": "Username required"}), 400
    if len(username) < 3:
        return jsonify({"error": "Callsign too short (3+ chars)"}), 400
    if username.isdigit():
        return jsonify({"error": "Username cannot be numbers only"}), 400
        
    conn = get_db_connection()
    c = get_cursor(conn)
    execute_query(c, 
'SELECT id FROM Users WHERE LOWER(username) = LOWER(?)', (username,))
    existing = c.fetchone()
    
    if existing:
        conn.close()
        return jsonify({"error": f'Callsign "{username}" is already taken! Choose another.'}), 409
        
    execute_query(c, 
'INSERT INTO Users (username, highest_score, xp, level, rank, total_wins, total_losses) VALUES (?, 0, 0, 1, "Beginner", 0, 0)', (username,))
    conn.commit()
    user_id = c.lastrowid
    conn.close()
    
    return jsonify({
        "message": "Registration successful!",
        "user_id": user_id,
        "username": username,
        "highest_score": 0,
        "xp": 0, "level": 1, "rank": "Beginner",
        "total_wins": 0, "total_losses": 0,
        "story_progress": 1
    })

@app.route('/api/user/progress', methods=['GET'])
def get_user_progress():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
        
    conn = get_db_connection()
    c = get_cursor(conn)
    
    # Get counts per category
    execute_query(c, 
'''
        SELECT category, COUNT(*) as solved_count 
        FROM UserWordProgress 
        JOIN Words ON UserWordProgress.word_id = Words.id 
        WHERE user_id = ? 
        GROUP BY category
    ''', (user_id,))
    solved_per_category = {row[0]: row[1] for row in c.fetchall()}
    
    # Get total words per category
    execute_query(c, 
'SELECT category, COUNT(*) FROM Words GROUP BY category')
    total_per_category = {row[0]: row[1] for row in c.fetchall()}
    
    domains_progress = []
    total_solved = 0
    total_words = sum(total_per_category.values())
    
    all_categories = sorted(list(total_per_category.keys()))
    for category in all_categories:
        total = total_per_category[category]
        solved = solved_per_category.get(category, 0)
        total_solved += solved
        domains_progress.append({
            "category": category,
            "solved": solved,
            "total": total,
            "percentage": round((solved / total) * 100, 2) if total > 0 else 0
        })
        
    total_percentage = round((total_solved / total_words) * 100, 2) if total_words > 0 else 0
    
    conn.close()
    return jsonify({
        "domains": domains_progress,
        "total_solved": total_solved,
        "total_words": total_words,
        "total_percentage": total_percentage
    })

@app.route('/api/word', methods=['GET'])
def get_word():
    # Expect category and difficulty from the query
    category = request.args.get('category', '').upper()
    difficulty = request.args.get('difficulty', '').upper()
    user_id = request.args.get('user_id')
    
    conn = get_db_connection()
    c = get_cursor(conn)

    # Determine difficulty automatically if not provided (Adaptive Difficulty)
    if not difficulty and user_id:
        execute_query(c, 
'SELECT xp, current_streak, total_wins, total_losses FROM Users WHERE id = ?', (user_id,))
        user_stats = c.fetchone()
        if user_stats:
            xp, streak, wins, losses = user_stats
            # Simple adaptive logic:
            if xp > 5000 or streak > 5:
                difficulty = "HARD"
            elif xp > 1000 or streak > 2:
                difficulty = "MEDIUM"
            else:
                difficulty = "EASY"
        else:
            difficulty = "EASY"
    elif not difficulty:
        difficulty = "EASY"
    
    # Retrieve all words for this category and difficulty from the database
    if category == "RANDOM" or not category:
        execute_query(c, 
'SELECT id, word, hint, category, description FROM Words WHERE difficulty = ?', (difficulty,))
    else:
        execute_query(c, 
'SELECT id, word, hint, category, description FROM Words WHERE category = ? AND difficulty = ?', (category, difficulty))
    
    all_words = [{"id": row[0], "word": row[1], "hint": row[2], "category": row[3], "description": row[4]} for row in c.fetchall()]

    if not all_words:
        conn.close()
        return jsonify({"error": f"No words found for {category} / {difficulty}"}), 400

    # Get words already solved by this user (Accurate tracking)
    execute_query(c, 
'SELECT word_id FROM UserWordProgress WHERE user_id = ?', (user_id,))
    solved_word_ids = {row[0] for row in c.fetchall()}
    
    # Filter words that have already been played
    available_words = [w for w in all_words if w["id"] not in solved_word_ids]
    
    # Fallback to legacy guessed_words column just in case (to avoid repetition for old users)
    try:
        execute_query(c, 
'SELECT guessed_words FROM Users WHERE id = ?', (user_id,))
        gu_row = c.fetchone()
        if gu_row and gu_row[0]:
            legacy_guessed = set(json.loads(gu_row[0]))
            available_words = [w for w in available_words if w["word"] not in legacy_guessed]
    except:
        pass

    # If the stack completes a cycle (no available words left)
    if not available_words:
        conn.close()
        return jsonify({"status": "exhausted"}), 200

    # Pick a random word from the unplayed list
    word_data = random.choice(available_words)
    conn.close()
    
    return jsonify({
        "word": word_data["word"],
        "clue": word_data["hint"],
        "category": word_data["category"],
        "difficulty": difficulty,
        "description": word_data["description"],
        "words_total": len(all_words),
        "words_remaining": len(available_words)
    })

@app.route('/api/score', methods=['POST'])
def submit_score():
    data = request.json
    user_id = data.get('user_id')
    score = data.get('score', 0)
    xp_added = data.get('xp_added', 0)
    is_win = data.get('is_win', None)
    time_taken = data.get('time_taken', None)
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
        
    conn = get_db_connection()
    c = get_cursor(conn)
    
    try:
        execute_query(c, 
'SELECT highest_score, xp, level, rank, total_wins, total_losses, fastest_win_seconds, current_streak, longest_streak, story_progress FROM Users WHERE id = ?', (user_id,))
        row = c.fetchone()
    except sqlite3.OperationalError:
        execute_query(c, 
'SELECT highest_score, xp, level, rank, total_wins, total_losses FROM Users WHERE id = ?', (user_id,))
        row = c.fetchone()
        if row:
            row = list(row) + [999999, 0, 0] # Fallback if migration hasn't fully applied
    
    if not row:
        conn.close()
        return jsonify({"error": "User not found"}), 404
        
    current_high, current_xp, current_level, current_rank, total_wins, total_losses, fastest_win_seconds, current_streak, longest_streak, story_progress = row
    
    # --- MEANINGFUL SCORING SYSTEM ---
    # Multipliers based on difficulty
    difficulty = data.get('difficulty', 'MEDIUM').upper()
    multipliers = {"EASY": 1.0, "MEDIUM": 1.5, "HARD": 2.5}
    mult = multipliers.get(difficulty, 1.0)

    # Base XP calculation
    base_xp = xp_added # Use the value sent from frontend as base (usu 150 for win, 10 for loss)
    
    if is_win is True:
        total_wins += 1
        current_streak += 1
        if current_streak > longest_streak:
            longest_streak = current_streak
        if time_taken and time_taken < fastest_win_seconds:
            fastest_win_seconds = time_taken
            
        # Time Bonus: Max 500 XP, decreases with time
        time_bonus = max(0, 500 - (time_taken * 5)) if time_taken else 0
        
        # Flawless Bonus: 500 XP for 0 wrong guesses
        wrong_guesses_count = data.get('wrong_guesses', 99)
        flawless_bonus = 500 if wrong_guesses_count == 0 else 0
        
        # Streak Bonus: 10% extra per streak point, capped at 100%
        streak_mult = 1.0 + min(1.0, (current_streak - 1) * 0.1) if current_streak > 1 else 1.0
        
        # Calculate Final XP for the win
        # Formula: (Base * Difficulty + Bonuses) * Streak
        final_xp_added = int(((base_xp * mult) + time_bonus + flawless_bonus) * streak_mult)
        
    elif is_win is False:
        total_losses += 1
        current_streak = 0
        final_xp_added = int(base_xp * mult) # Still get some XP for trying, based on difficulty
    else:
        final_xp_added = 0

    # Apply to user
    new_high_score = score if score > current_high else current_high
    new_xp = current_xp + final_xp_added
    
    # Record word progress on win
    word_text = data.get('word')
    if is_win and word_text:
        # Resolve word ID
        execute_query(c, 
'SELECT id FROM Words WHERE word = ?', (word_text.upper(),))
        w_row = c.fetchone()
        if w_row:
            word_id = w_row[0]
            try:
                execute_query(c, 
'INSERT INTO UserWordProgress (user_id, word_id, completed_at) VALUES (?, ?, ?)', (user_id, word_id, datetime.now().isoformat()))
            except sqlite3.IntegrityError:
                pass # Already recorded
    
    # Calculate level and rank based on new XP
    new_level = (new_xp // 100) + 1 
    if new_xp >= 25000:
        new_rank = "Hangman Master"
    elif new_xp >= 10000:
        new_rank = "Expert"
    elif new_xp >= 5000:
        new_rank = "Coder"
    elif new_xp >= 1000:
        new_rank = "Learner"
    else:
        new_rank = "Beginner"
        
    # Story Mode logic
    is_story = data.get('is_story', False)
    story_level = data.get('story_level')
    new_story_progress = story_progress
    if is_win and is_story and story_level:
        if int(story_level) == story_progress:
            new_story_progress = story_progress + 1
            
    try:
        execute_query(c, 
'''
            UPDATE Users 
            SET highest_score = ?, xp = ?, level = ?, rank = ?, total_wins = ?, total_losses = ?, fastest_win_seconds = ?, current_streak = ?, longest_streak = ?, story_progress = ?, total_games = total_games + 1
            WHERE id = ?
        ''', (new_high_score, new_xp, new_level, new_rank, total_wins, total_losses, fastest_win_seconds, current_streak, longest_streak, new_story_progress, user_id))
    except sqlite3.OperationalError:
        # Fallback if fastest_win_seconds, current_streak, longest_streak, story_progress, total_games columns are missing
        execute_query(c, 
'''
            UPDATE Users 
            SET highest_score = ?, xp = ?, level = ?, rank = ?, total_wins = ?, total_losses = ?
            WHERE id = ?
        ''', (new_high_score, new_xp, new_level, new_rank, total_wins, total_losses, user_id))
        
    # === Achievement Engine ===
    new_achievements = []
    wrong_guesses_count = data.get('wrong_guesses', None)

    if is_win is True:
        # Win milestone badges (checked after incrementing total_wins)
        win_milestones = [
            (1,   "First Blood"),
            (10,  "Bronze"),
            (25,  "Silver"),
            (50,  "Gold"),
            (100, "Platinum"),
            (200, "One Above All"),
        ]
        for threshold, name in win_milestones:
            if total_wins >= threshold:
                if award_achievement(c, user_id, name):
                    new_achievements.append(name)

        # Flawless: win with zero wrong guesses
        if wrong_guesses_count == 0:
            if award_achievement(c, user_id, "Flawless"):
                new_achievements.append("Flawless")

    # Level-based achievements
    level_milestones = [(10, "Guru"), (20, "Ace"), (30, "Ace Master")]
    for threshold, name in level_milestones:
        if new_level >= threshold:
            if award_achievement(c, user_id, name):
                new_achievements.append(name)

    # XP-based achievements
    xp_milestones = [(10000, "Conqueror"), (25000, "Omnipotent")]
    for threshold, name in xp_milestones:
        if new_xp >= threshold:
            if award_achievement(c, user_id, name):
                new_achievements.append(name)

    # Loss-based achievements
    loss_milestones = [(50, "Die Hard"), (100, "One Below All")]
    for threshold, name in loss_milestones:
        if total_losses >= threshold:
            if award_achievement(c, user_id, name):
                new_achievements.append(name)
        
    conn.commit()
    conn.close()
    
    return jsonify({
        "message": "Progress recorded", 
        "highest_score": new_high_score,
        "xp": new_xp,
        "level": new_level,
        "rank": new_rank,
        "new_achievements": new_achievements
    })

@app.route('/api/highscores', methods=['GET'])
def get_highscores():
    conn = get_db_connection()
    c = get_cursor(conn)
    
    # 1. Highest Score Leaderboard
    execute_query(c, 
'SELECT username, highest_score FROM Users ORDER BY highest_score DESC LIMIT 10')
    score_rows = c.fetchall()
    
    # 2. Fastest Win Leaderboard
    try:
        execute_query(c, 
'SELECT username, fastest_win_seconds FROM Users WHERE fastest_win_seconds < 999999 ORDER BY fastest_win_seconds ASC LIMIT 10')
        speed_rows = c.fetchall()
    except sqlite3.OperationalError:
        speed_rows = []
        
    # 3. Longest Streak Leaderboard
    try:
        execute_query(c, 
'SELECT username, longest_streak FROM Users ORDER BY longest_streak DESC LIMIT 10')
        streak_rows = c.fetchall()
    except sqlite3.OperationalError:
        streak_rows = []
        
    conn.close()
    
    return jsonify({
        "score": [{"username": r[0], "val": r[1]} for r in score_rows],
        "speed": [{"username": r[0], "val": r[1]} for r in speed_rows],
        "streak": [{"username": r[0], "val": r[1]} for r in streak_rows]
    })


@app.route('/api/daily_challenge', methods=['GET'])
def daily_challenge():
    """Returns the same word for everyone today, seeded by date."""
    user_id = request.args.get('user_id')
    today = datetime.now().strftime('%Y-%m-%d')
    
    conn = get_db_connection()
    c = get_cursor(conn)

    # Check if a daily challenge already exists for today
    execute_query(c, 
'SELECT word_id FROM DailyChallenges WHERE date_col = ?', (today,))
    row = c.fetchone()
    
    if row:
        word_id = row[0]
        execute_query(c, 
'SELECT word, hint, category, difficulty, description FROM Words WHERE id = ?', (word_id,))
        word_data = c.fetchone()
    else:
        # Generate a new one from the database
        execute_query(c, 
'SELECT id FROM Words')
        all_ids = [r[0] for r in c.fetchall()]
        if not all_ids:
            conn.close()
            return jsonify({"error": "No words in database"}), 500
            
        # Seed random with today's date for deterministic selection
        date_seed = sum(ord(c) for c in today)
        rng = random.Random(date_seed)
        word_id = rng.choice(all_ids)
        
        execute_query(c, 
'INSERT INTO DailyChallenges (date_col, word_id) VALUES (?, ?)', (today, word_id))
        conn.commit()
        
        execute_query(c, 
'SELECT word, hint, category, difficulty, description FROM Words WHERE id = ?', (word_id,))
        word_data = c.fetchone()
    
    # Check if user already completed today's challenge
    already_done = False
    if user_id:
        execute_query(c, 
'SELECT last_daily_date FROM Users WHERE id = ?', (user_id,))
        u_row = c.fetchone()
        if u_row and u_row[0] == today:
            already_done = True
    
    conn.close()
    
    return jsonify({
        "word": word_data[0],
        "clue": word_data[1],
        "category": word_data[2],
        "difficulty": word_data[3],
        "description": word_data[4],
        "date": today,
        "already_completed": already_done
    })

@app.route('/api/profile', methods=['GET'])
def get_profile():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
        
    conn = get_db_connection()
    c = get_cursor(conn)
    try:
        execute_query(c, 
'''
            SELECT username, highest_score, xp, level, rank, total_wins, total_losses, 
                   fastest_win_seconds, current_streak, longest_streak, hints_used, total_games, story_progress 
            FROM Users WHERE id = ?
        ''', (user_id,))
        row = c.fetchone()
    except sqlite3.OperationalError:
        execute_query(c, 
'SELECT username, highest_score, xp, level, rank, total_wins, total_losses FROM Users WHERE id = ?', (user_id,))
        row = c.fetchone()
        if row:
            row = list(row) + [999999, 0, 0, 0, 0, 1]

    if not row:
        conn.close()
        return jsonify({"error": "User not found"}), 404
        
    profile = {
        "username": row[0],
        "highest_score": row[1],
        "xp": row[2],
        "level": row[3],
        "rank": row[4],
        "total_wins": row[5],
        "total_losses": row[6],
        "win_rate": round(row[5] / (row[5] + row[6]) * 100, 1) if (row[5] + row[6]) > 0 else 0,
        "fastest_win": row[7] if row[7] < 999999 else None,
        "current_streak": row[8],
        "longest_streak": row[9],
        "hints_used": row[10],
        "total_games": row[11],
        "story_progress": row[12]
    }
    
    conn.close()
    return jsonify(profile)

@app.route('/api/hints', methods=['POST'])
def use_hint():
    data = request.json
    user_id = data.get('user_id')
    hint_type = data.get('type') # 'letter', 'category', 'description'
    word = data.get('word')
    
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
        
    conn = get_db_connection()
    c = get_cursor(conn)
    try:
        execute_query(c, 
'UPDATE Users SET hints_used = hints_used + 1 WHERE id = ?', (user_id,))
        conn.commit()
    except sqlite3.OperationalError:
        pass # hints_used column might not exist yet
    conn.close()
    
    # Logic for hint generation can be complex, for now just acknowledge use
    return jsonify({"message": "Hint recorded", "type": hint_type})

@app.route('/api/daily_complete', methods=['POST'])
def complete_daily():
    """Marks today's daily challenge as done for this user."""
    data = request.json
    user_id = data.get('user_id')
    today = datetime.now().strftime('%Y-%m-%d')
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    conn = get_db_connection()
    c = get_cursor(conn)
    try:
        execute_query(c, 
'UPDATE Users SET last_daily_date = ? WHERE id = ?', (today, user_id))
        conn.commit()
    except sqlite3.OperationalError:
        pass
    conn.close()
    return jsonify({"message": "Daily challenge recorded!"})

@app.route('/api/achievements', methods=['GET'])
def get_achievements():
    """Returns achievements earned by a user."""
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    conn = get_db_connection()
    c = get_cursor(conn)
    execute_query(c, 
'SELECT achievement_name FROM Achievements WHERE user_id = ? ORDER BY id ASC', (user_id,))
    rows = c.fetchall()
    conn.close()
    return jsonify({"achievements": [r[0] for r in rows]})

def award_achievement(c, user_id, name):
    """Awards an achievement if not already earned."""
    execute_query(c, 
'SELECT id FROM Achievements WHERE user_id = ? AND achievement_name = ?', (user_id, name))
    if not c.fetchone():
        execute_query(c, 
'INSERT INTO Achievements (user_id, achievement_name) VALUES (?, ?)', (user_id, name))
        return True
    return False



@app.route('/api/admin/words', methods=['GET', 'POST'])
def admin_words():
    conn = get_db_connection()
    c = get_cursor(conn)
    
    if request.method == 'GET':
        category = request.args.get('category')
        difficulty = request.args.get('difficulty')
        query = 'SELECT * FROM Words'
        params = []
        if category or difficulty:
            query += ' WHERE'
            if category:
                query += ' category = ?'
                params.append(category)
            if difficulty:
                if category: query += ' AND'
                query += ' difficulty = ?'
                params.append(difficulty)
        
        execute_query(c, 
query, params)
        rows = c.fetchall()
        conn.close()
        return jsonify([{"id": r[0], "word": r[1], "hint": r[2], "category": r[3], "difficulty": r[4], "description": r[5]} for r in rows])
        
    elif request.method == 'POST':
        data = request.json
        word = data.get('word', '').upper()
        hint = data.get('hint')
        category = data.get('category')
        difficulty = data.get('difficulty')
        description = data.get('description')
        
        try:
            execute_query(c, 
'INSERT INTO Words (word, hint, category, difficulty, description) VALUES (?, ?, ?, ?, ?)',
                      (word, hint, category, difficulty, description))
            conn.commit()
            conn.close()
            return jsonify({"message": "Word added successfully"})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({"error": "Word already exists"}), 400

@app.route('/api/admin/words/<int:word_id>', methods=['DELETE', 'PUT'])
def admin_word_detail(word_id):
    conn = get_db_connection()
    c = conn.cursor()
    
    if request.method == 'DELETE':
        execute_query(c, 
'DELETE FROM Words WHERE id = ?', (word_id,))
        conn.commit()
        conn.close()
        return jsonify({"message": "Word deleted"})
        
    elif request.method == 'PUT':
        data = request.json
        execute_query(c, 
'''
            UPDATE Words SET word=?, hint=?, category=?, difficulty=?, description=? 
            WHERE id=?
        ''', (data.get('word').upper(), data.get('hint'), data.get('category'), data.get('difficulty'), data.get('description'), word_id))
        conn.commit()
        conn.close()
        return jsonify({"message": "Word updated"})

@app.route('/api/admin/nuclear-reset', methods=['POST'])
def nuclear_reset():
    """
    EMERGENCY: Clears ALL user data, achievements, and progress.
    Requires header 'X-Admin-Reset-Key': 'MISSION_RESTART_2026'
    """
    key = request.headers.get('X-Admin-Reset-Key')
    if key != 'MISSION_RESTART_2026':
        return jsonify({"error": "Unauthorized Reset Request"}), 401
        
    conn = get_db_connection()
    c = get_cursor(conn)
    try:
        execute_query(c, 'DELETE FROM UserWordProgress')
        execute_query(c, 'DELETE FROM Achievements')
        execute_query(c, 'DELETE FROM DailyChallenges')
        execute_query(c, 'DELETE FROM Users')
        conn.commit()
        conn.close()
        return jsonify({"message": "MISSION RESET: All user data has been purged. System is ready for fresh enlistment."})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/cleanup', methods=['POST'])
def cleanup_duplicates():
    """
    Admin cleanup: removes duplicate/ghost zero-score accounts.
    """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        DELETE FROM Users WHERE id IN (
            SELECT u1.id FROM Users u1
            INNER JOIN Users u2 ON LOWER(u1.username) = LOWER(u2.username)
            WHERE u1.id != u2.id 
            AND u1.highest_score <= u2.highest_score
            AND u1.total_wins = 0
        )
    ''')
    deleted = c.rowcount
    conn.commit()
    conn.close()
    return jsonify({"message": f"Removed {deleted} duplicate/ghost accounts."})

if __name__ == '__main__':
    print("Agent Protocol Initialization Complete. Servicing APIs.")
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
