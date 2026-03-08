import sqlite3
import random
import json
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os

app = Flask(__name__, static_folder='.')
CORS(app)

DB_PATH = 'hangman.db'

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)



# === Database Helpers ===
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
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
        ("last_daily_date", "TEXT DEFAULT ''")
    ]
    
    for col_name, col_type in new_columns:
        try:
            c.execute(f'ALTER TABLE Users ADD COLUMN {col_name} {col_type}')
        except sqlite3.OperationalError:
            pass # Column already exists
            
    # Achievements table
    c.execute('''
        CREATE TABLE IF NOT EXISTS Achievements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            achievement_name TEXT,
            FOREIGN KEY(user_id) REFERENCES Users(id)
        )
    ''')
    
    conn.commit()
    conn.close()

init_db()

# === API Endpoints ===

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    
    if not username:
        return jsonify({"error": "Username required"}), 400
        
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    # Case-insensitive checking
    c.execute('SELECT id, username, highest_score, xp, level, rank, total_wins, total_losses FROM Users WHERE LOWER(username) = LOWER(?)', (username,))
    user = c.fetchone()
    
    if not user:
        conn.close()
        return jsonify({"error": f'Callsign "{username}" not found. If you are new, use the NEW RECRUIT tab!'}), 404
    else:
        user_id, _, high_score, xp, level, rank, total_wins, total_losses = user
        
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
        "total_losses": total_losses
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
        
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT id FROM Users WHERE LOWER(username) = LOWER(?)', (username,))
    existing = c.fetchone()
    
    if existing:
        conn.close()
        return jsonify({"error": f'Callsign "{username}" is already taken! Choose another.'}), 409
        
    c.execute('INSERT INTO Users (username, highest_score, xp, level, rank, total_wins, total_losses) VALUES (?, 0, 0, 1, "Beginner", 0, 0)', (username,))
    conn.commit()
    user_id = c.lastrowid
    conn.close()
    
    return jsonify({
        "message": "Registration successful!",
        "user_id": user_id,
        "username": username,
        "highest_score": 0,
        "xp": 0, "level": 1, "rank": "Beginner",
        "total_wins": 0, "total_losses": 0
    })

@app.route('/api/word', methods=['GET'])
def get_word():
    # Expect category and difficulty from the query
    category = request.args.get('category', '').upper()
    difficulty = request.args.get('difficulty', '').upper()
    user_id = request.args.get('user_id')
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Retrieve all words for this category and difficulty from the database
    c.execute('SELECT word, clue FROM Words WHERE category = ? AND difficulty = ?', (category, difficulty))
    all_words = [{"word": row[0], "clue": row[1]} for row in c.fetchall()]

    if not all_words:
        conn.close()
        return jsonify({"error": "Invalid Category or Difficulty"}), 400

    try:
        c.execute('SELECT guessed_words FROM Users WHERE id = ?', (user_id,))
        row = c.fetchone()
    except sqlite3.OperationalError:
        row = None
        
    if not row:
        conn.close()
        return jsonify({"error": "User not found"}), 404
        
    guessed_words_json = row[0]
    guessed_words = json.loads(guessed_words_json) if guessed_words_json else []
    
    # Filter words that have already been played
    available_words = [w for w in all_words if w["word"] not in guessed_words]
    
    # If the stack completes a cycle (no available words left)
    if not available_words:
        category_diff_words = [w["word"] for w in all_words]
        # Remove these from the user's history so they can replay
        guessed_words = [w for w in guessed_words if w not in category_diff_words]
        c.execute('UPDATE Users SET guessed_words = ? WHERE id = ?', (json.dumps(guessed_words), user_id))
        conn.commit()
        conn.close()
        # Return exhausted so the frontend knows the category was fully completed
        return jsonify({"status": "exhausted"}), 200

    # Pick a random word from the unplayed list
    word_data = random.choice(available_words)
    
    # Track it as played
    guessed_words.append(word_data["word"])
    c.execute('UPDATE Users SET guessed_words = ? WHERE id = ?', (json.dumps(guessed_words), user_id))
    conn.commit()
    conn.close()
    
    return jsonify({
        "word": word_data["word"],
        "clue": word_data["clue"]
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
        
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    try:
        c.execute('SELECT highest_score, xp, level, rank, total_wins, total_losses, fastest_win_seconds, current_streak, longest_streak FROM Users WHERE id = ?', (user_id,))
        row = c.fetchone()
    except sqlite3.OperationalError:
        c.execute('SELECT highest_score, xp, level, rank, total_wins, total_losses FROM Users WHERE id = ?', (user_id,))
        row = list(c.fetchone()) + [999999, 0, 0] # Fallback if migration hasn't fully applied
    
    if not row:
        conn.close()
        return jsonify({"error": "User not found"}), 404
        
    current_high, current_xp, current_level, current_rank, total_wins, total_losses, fastest_win_seconds, current_streak, longest_streak = row
    
    # Calculate new stats
    new_high_score = score if score > current_high else current_high
    new_xp = current_xp + xp_added
    
    if is_win is True:
        total_wins += 1
        current_streak += 1
        if current_streak > longest_streak:
            longest_streak = current_streak
        if time_taken and time_taken < fastest_win_seconds:
            fastest_win_seconds = time_taken
    elif is_win is False:
        total_losses += 1
        current_streak = 0
        
    # Calculate level and rank based on new XP
    new_level = (new_xp // 100) + 1 # Simple level formula (1 level per 100 xp roughly, or just driven by ranks)
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
        
    try:
        c.execute('''
            UPDATE Users 
            SET highest_score = ?, xp = ?, level = ?, rank = ?, total_wins = ?, total_losses = ?, fastest_win_seconds = ?, current_streak = ?, longest_streak = ?
            WHERE id = ?
        ''', (new_high_score, new_xp, new_level, new_rank, total_wins, total_losses, fastest_win_seconds, current_streak, longest_streak, user_id))
    except sqlite3.OperationalError:
        # Fallback if fastest_win variable column is messed up
        c.execute('''
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
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # 1. Highest Score Leaderboard
    c.execute('SELECT username, highest_score FROM Users ORDER BY highest_score DESC LIMIT 10')
    score_rows = c.fetchall()
    
    # 2. Fastest Win Leaderboard
    try:
        c.execute('SELECT username, fastest_win_seconds FROM Users WHERE fastest_win_seconds < 999999 ORDER BY fastest_win_seconds ASC LIMIT 10')
        speed_rows = c.fetchall()
    except sqlite3.OperationalError:
        speed_rows = []
        
    # 3. Longest Streak Leaderboard
    try:
        c.execute('SELECT username, longest_streak FROM Users ORDER BY longest_streak DESC LIMIT 10')
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
    
    # Flatten all words from all categories into one list
    all_words_flat = []
    for cat, difficulties in CATEGORIZED_WORDS.items():
        for diff, words in difficulties.items():
            for w in words:
                all_words_flat.append({**w, "category": cat, "difficulty": diff})
    
    # Seed random with today's date for deterministic selection
    date_seed = sum(ord(c) for c in today)
    rng = random.Random(date_seed)
    word_data = rng.choice(all_words_flat)
    
    # Check if user already completed today's challenge
    already_done = False
    if user_id:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        try:
            c.execute('SELECT last_daily_date FROM Users WHERE id = ?', (user_id,))
            row = c.fetchone()
            if row and row[0] == today:
                already_done = True
        except sqlite3.OperationalError:
            pass
        conn.close()
    
    return jsonify({
        "word": word_data["word"],
        "clue": word_data["clue"],
        "category": word_data["category"],
        "difficulty": word_data["difficulty"],
        "date": today,
        "already_completed": already_done
    })

@app.route('/api/daily_complete', methods=['POST'])
def complete_daily():
    """Marks today's daily challenge as done for this user."""
    data = request.json
    user_id = data.get('user_id')
    today = datetime.now().strftime('%Y-%m-%d')
    if not user_id:
        return jsonify({"error": "User ID required"}), 400
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    try:
        c.execute('UPDATE Users SET last_daily_date = ? WHERE id = ?', (today, user_id))
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
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT achievement_name FROM Achievements WHERE user_id = ? ORDER BY id ASC', (user_id,))
    rows = c.fetchall()
    conn.close()
    return jsonify({"achievements": [r[0] for r in rows]})

def award_achievement(c, user_id, name):
    """Awards an achievement if not already earned."""
    c.execute('SELECT id FROM Achievements WHERE user_id = ? AND achievement_name = ?', (user_id, name))
    if not c.fetchone():
        c.execute('INSERT INTO Achievements (user_id, achievement_name) VALUES (?, ?)', (user_id, name))
        return True
    return False



@app.route('/api/admin/cleanup', methods=['POST'])
def cleanup_duplicates():
    """
    Admin cleanup: removes duplicate/ghost zero-score accounts.
    """
    conn = sqlite3.connect(DB_PATH)
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
    app.run(port=5000, debug=True)
