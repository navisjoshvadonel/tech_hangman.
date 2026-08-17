import random
import json
import sqlite3
import time
import threading
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import os
import words

# =============================================
# In-Memory Rate Limiter (no extra deps)
# =============================================
_rate_lock = threading.Lock()
_rate_store: dict = {}  # ip -> [timestamps]

RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX = 30     # max requests per window per IP

def _get_client_ip():
    """Best-effort client IP extraction."""
    # Render / nginx forwards the real IP in X-Forwarded-For
    forwarded = request.headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return request.remote_addr or 'unknown'

def rate_limited(max_per_window: int = RATE_LIMIT_MAX, window: int = RATE_LIMIT_WINDOW):
    """Returns True if the current request should be blocked (rate limited)."""
    ip = _get_client_ip()
    now = time.time()
    with _rate_lock:
        hits = _rate_store.get(ip, [])
        # Purge old entries outside window
        hits = [t for t in hits if now - t < window]
        if len(hits) >= max_per_window:
            _rate_store[ip] = hits
            return True
        hits.append(now)
        _rate_store[ip] = hits
    return False

def _cleanup_rate_store():
    """Background thread: purge stale IPs from rate store every 5 minutes."""
    while True:
        time.sleep(300)
        now = time.time()
        with _rate_lock:
            stale = [ip for ip, hits in _rate_store.items()
                     if all(now - t >= RATE_LIMIT_WINDOW for t in hits)]
            for ip in stale:
                del _rate_store[ip]

_cleanup_thread = threading.Thread(target=_cleanup_rate_store, daemon=True)
_cleanup_thread.start()
DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError,)
try:
    import mysql.connector
    from urllib.parse import urlparse, unquote, parse_qs
    try:
        DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError, mysql.connector.errors.IntegrityError)
    except AttributeError:
        DB_INTEGRITY_ERRORS = (sqlite3.IntegrityError, mysql.connector.Error)
except ImportError:
    mysql = None


app = Flask(__name__)
FRONTEND_URL = os.environ.get('FRONTEND_URL')
if FRONTEND_URL:
    CORS(app, origins=[FRONTEND_URL])
else:
    CORS(app)

# === Config ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DB_PATH = os.path.join(BASE_DIR, 'hangman.db')
DB_PATH = os.environ.get('DB_PATH', DEFAULT_DB_PATH)
try:
    db_dir = os.path.dirname(DB_PATH)
    if db_dir and not os.path.exists(db_dir):
        os.makedirs(db_dir, exist_ok=True)
except Exception as _dir_err:
    print(f"WARNING: Unable to create DB directory '{DB_PATH}': {_dir_err}. Falling back to default.")
    DB_PATH = DEFAULT_DB_PATH

MYSQL_URL = os.environ.get('DATABASE_URL') or os.environ.get('MYSQL_URL')

# Global toggle for placeholder style
# MySQL uses %s, SQLite uses ?
DB_TYPE = 'sqlite'
if MYSQL_URL and MYSQL_URL.startswith('mysql'):
    DB_TYPE = 'mysql'

print(f"DATABASE IDENTITY INITIALIZED: {DB_TYPE}")

# === Admin auth ===
# Set ADMIN_KEY as an environment variable on Render (Dashboard -> Environment).
# Never hardcode this value in source control.
ADMIN_KEY = os.environ.get('ADMIN_KEY')
if not ADMIN_KEY:
    print("WARNING: ADMIN_KEY is not set. All /api/admin/* routes will refuse requests until it is configured.")

def require_admin():
    """Returns an error Response if the request is not authorized, else None."""
    key = request.headers.get('X-Admin-Reset-Key')
    if not ADMIN_KEY or key != ADMIN_KEY:
        return jsonify({"error": "Unauthorized"}), 401
    return None

def get_db_connection():
    """Returns a connection based on the available configuration."""
    if MYSQL_URL and MYSQL_URL.startswith('mysql'):
        try:
            url = urlparse(MYSQL_URL)
            db_user = unquote(url.username) if url.username else None
            db_password = unquote(url.password) if url.password else None
            
            query_params = parse_qs(url.query) if url.query else {}
            ssl_mode_val = None
            for k, v in query_params.items():
                if k.lower() in ('ssl_mode', 'ssl-mode') and v:
                    ssl_mode_val = v[0]
                    break
            
            ssl_disabled = False
            if ssl_mode_val and ssl_mode_val.upper() == 'DISABLED':
                ssl_disabled = True
            
            connect_kwargs = {
                'host': url.hostname,
                'port': url.port or 3306,
                'user': db_user,
                'password': db_password,
                'database': url.path.lstrip('/'),
                'auth_plugin': 'mysql_native_password',
                'connect_timeout': 20,
                'ssl_disabled': ssl_disabled
            }
            
            conn = mysql.connector.connect(**connect_kwargs)
            return conn
        except Exception as e:
            try:
                err_msg = str(e)
            except Exception:
                err_msg = "Unknown MySQL connection error (string representation failed)"
            print(f"!!! CRITICAL MYSQL ERROR !!!: {err_msg}")
            # Fallback to local SQLite using the persistent DB_PATH so the site doesn't stay "Dead"
            import sqlite3
            conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
            conn.execute('PRAGMA journal_mode=WAL')
            conn.execute('PRAGMA synchronous=NORMAL')
            conn.execute('PRAGMA cache_size=-32000')
            conn.execute('PRAGMA temp_store=MEMORY')
            conn.execute('PRAGMA busy_timeout=10000')
            conn.row_factory = sqlite3.Row
            return conn
    else:
        import sqlite3
        conn = sqlite3.connect(DB_PATH, timeout=30, check_same_thread=False)
        conn.execute('PRAGMA journal_mode=WAL')
        conn.execute('PRAGMA synchronous=NORMAL')      # Safe + fast (WAL makes this safe)
        conn.execute('PRAGMA cache_size=-32000')       # 32 MB page cache
        conn.execute('PRAGMA temp_store=MEMORY')       # Keep temp tables in RAM
        conn.execute('PRAGMA mmap_size=134217728')     # 128 MB memory-mapped I/O
        conn.execute('PRAGMA busy_timeout=10000')      # Wait 10s before giving up on a lock
        conn.row_factory = sqlite3.Row
        return conn

def get_cursor(conn):
    """Returns a cursor that behaves similarly across DBs."""
    conn_class_name = conn.__class__.__name__
    if 'mysql' in conn_class_name.lower() or 'CMySQL' in conn_class_name:
        return conn.cursor(buffered=True)
    return conn.cursor()

def execute_query(cursor, query, params=None):
    """Abstraction layer to handle SQLite vs MySQL differences."""
    cursor_class_name = cursor.__class__.__name__
    is_mysql = 'mysql' in cursor_class_name.lower() or 'CMySQL' in cursor_class_name

    import re
    if is_mysql:
        query = query.replace('?', '%s')
        # MySQL doesn't like AUTOINCREMENT (needs AUTO_INCREMENT)
        query = re.sub(r'\bAUTOINCREMENT\b', 'AUTO_INCREMENT', query, flags=re.IGNORECASE)
        # MySQL reserved keywords: rank, groups, etc.
        # We wrap them in backticks to avoid syntax errors.
        keywords = ['rank', 'groups']
        for kw in keywords:
            query = re.sub(rf'\b{kw}\b', f'`{kw}`', query, flags=re.IGNORECASE)
    else:
        query = re.sub(r'\bINT\s+PRIMARY\s+KEY\s+AUTO_INCREMENT\b', 'INTEGER PRIMARY KEY AUTOINCREMENT', query, flags=re.IGNORECASE)
        query = re.sub(r'\bINT\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b', 'INTEGER PRIMARY KEY AUTOINCREMENT', query, flags=re.IGNORECASE)
        query = re.sub(r'\bAUTO_INCREMENT\b', 'AUTOINCREMENT', query, flags=re.IGNORECASE)
    cursor.execute(query, params or ())
    return cursor

def row_to_tuple(row):
    """Converts a database row (sqlite3.Row, dict, or tuple) into a standard Python tuple of values."""
    if row is None:
        return None
    if isinstance(row, dict):
        return tuple(row.values())
    return tuple(row)

def row_to_dict(row, cursor=None):
    """Converts a database row (sqlite3.Row, dict, or tuple) into a standard Python dictionary."""
    if row is None:
        return None
    if isinstance(row, dict):
        return row
    if hasattr(row, 'keys'): # sqlite3.Row
        return dict(row)
    if cursor and hasattr(cursor, 'description') and cursor.description:
        cols = [col[0] for col in cursor.description]
        return dict(zip(cols, row))
    return {}


@app.route('/', methods=['GET'])
@app.route('/health', methods=['GET'])
@app.route('/api/health', methods=['GET'])
@app.route('/api/ping', methods=['GET'])
@app.route('/ping', methods=['GET'])
def root_health_check():
    return jsonify({"status": "ok", "message": "Hangman API is running"}), 200


# === Database Helpers ===
def init_db():
    # For SQLite: apply WAL at the file level immediately on startup
    # This ensures the WAL setting persists across all future connections
    if not (MYSQL_URL and MYSQL_URL.startswith('mysql')):
        import sqlite3 as _sq
        _bootstrap = _sq.connect(DB_PATH, timeout=30, check_same_thread=False)
        _bootstrap.execute('PRAGMA journal_mode=WAL')
        _bootstrap.execute('PRAGMA synchronous=NORMAL')
        _bootstrap.execute('PRAGMA cache_size=-32000')
        _bootstrap.execute('PRAGMA temp_store=MEMORY')
        _bootstrap.execute('PRAGMA mmap_size=134217728')
        _bootstrap.commit()
        _bootstrap.close()
        print("SQLITE WAL: Applied WAL mode and performance pragmas to DB file.")

    conn = None
    if MYSQL_URL and MYSQL_URL.startswith('mysql'):
        max_retries = 6
        for attempt in range(1, max_retries + 1):
            try:
                print(f"DATABASE INIT: Attempting to connect to MySQL (Attempt {attempt}/{max_retries})...")
                temp_conn = get_db_connection()
                # Check if it's actually MySQL and not SQLite fallback
                if 'mysql' in temp_conn.__class__.__name__.lower() or 'CMySQL' in temp_conn.__class__.__name__:
                    conn = temp_conn
                    print("DATABASE INIT: Successfully connected to MySQL.")
                    break
                else:
                    # It fell back to SQLite. Close it and try again.
                    temp_conn.close()
                    if attempt < max_retries:
                        time.sleep(3)
            except Exception as e:
                print(f"DATABASE INIT: Connection attempt {attempt} failed: {e}")
                if attempt < max_retries:
                    time.sleep(3)
        
        if conn is None:
            print("DATABASE INIT: Failed to connect to MySQL after retries. Raising error.")
            raise RuntimeError("Could not connect to MySQL database at startup.")
    else:
        conn = get_db_connection()

    c = get_cursor(conn)
    conn_class_name = conn.__class__.__name__
    is_mysql = 'mysql' in conn_class_name.lower() or 'CMySQL' in conn_class_name
    
    # User Table
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS Users (
            id INT PRIMARY KEY AUTO_INCREMENT,
            username VARCHAR(255) UNIQUE,
            highest_score INT DEFAULT 0
        )
    ''')
    
    # Safe Migrations for Phase 2: Add progression columns if they don't exist
    new_columns = [
        ("xp", "INT DEFAULT 0"),
        ("level", "INT DEFAULT 1"),
        ("rank", "VARCHAR(255) DEFAULT 'Beginner'"),
        ("total_wins", "INT DEFAULT 0"),
        ("total_losses", "INT DEFAULT 0"),
        ("fastest_win_seconds", "INT DEFAULT 999999"),
        ("current_streak", "INT DEFAULT 0"),
        ("longest_streak", "INT DEFAULT 0"),
        ("guessed_words", "VARCHAR(255) DEFAULT '[]'"),
        ("last_daily_date", "VARCHAR(255) DEFAULT ''"),
        ("hints_used", "INT DEFAULT 0"),
        ("total_games", "INT DEFAULT 0"),
        ("story_progress", "INT DEFAULT 1"),
        ("bosses_defeated", "INT DEFAULT 0")
    ]
    
    for col_name, col_type in new_columns:
        try:
            execute_query(c, f'ALTER TABLE Users ADD COLUMN {col_name} {col_type}')
        except Exception:
            # For MySQL, if column exists, we might need to MODIFY it to fix the VARCHAR type
            if is_mysql:
                try:
                    execute_query(c, f'ALTER TABLE Users MODIFY COLUMN {col_name} {col_type}')
                except:
                    pass
            pass 
            
    # Achievements table
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS Achievements (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT,
            achievement_name VARCHAR(255),
            FOREIGN KEY(user_id) REFERENCES Users(id)
        )
    ''')

    # NEW: Words table for massive database
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS Words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            word TEXT,
            hint TEXT,
            category TEXT,
            difficulty TEXT,
            description TEXT,
            UNIQUE(word, category, difficulty)
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
    
    # NEW: Seeded Mission leaderboards
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS MissionRuns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mission_key VARCHAR(255),
            seed VARCHAR(64),
            mode VARCHAR(32),
            category VARCHAR(64),
            difficulty VARCHAR(16),
            length INT,
            user_id INT,
            score INT,
            time_seconds INT,
            completed_at TEXT,
            UNIQUE(mission_key, user_id),
            FOREIGN KEY(user_id) REFERENCES Users(id)
        )
    ''')

    # NEW: Duel codes (shareable friend challenges)
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS DuelInvites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code VARCHAR(32) UNIQUE,
            creator_user_id INT,
            word VARCHAR(255),
            category VARCHAR(64),
            difficulty VARCHAR(16),
            created_at TEXT
        )
    ''')

    # NEW: Per domain & difficulty highscores table
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS DomainScores (
            id INT PRIMARY KEY AUTO_INCREMENT,
            user_id INT,
            category VARCHAR(255),
            difficulty VARCHAR(255),
            highest_score INT DEFAULT 0,
            fastest_win_seconds INT DEFAULT 999999,
            total_wins INT DEFAULT 0,
            updated_at TEXT,
            UNIQUE(user_id, category, difficulty),
            FOREIGN KEY(user_id) REFERENCES Users(id)
        )
    ''')


    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS DuelRuns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code VARCHAR(32),
            user_id INT,
            score INT,
            time_seconds INT,
            is_win INT,
            submitted_at TEXT,
            UNIQUE(code, user_id),
            FOREIGN KEY(user_id) REFERENCES Users(id)
        )
    ''')

    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS LiveDuelQueue (
            user_id INT PRIMARY KEY,
            joined_at TEXT
        )
    ''')

    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS LiveDuels (
            id VARCHAR(64) PRIMARY KEY,
            player1_id INT,
            player2_id INT,
            word VARCHAR(255),
            category VARCHAR(255),
            difficulty VARCHAR(255),
            player1_progress INT,
            player2_progress INT,
            player1_errors INT,
            player2_errors INT,
            player1_state VARCHAR(32),
            player2_state VARCHAR(32),
            winner_id INT,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY(player1_id) REFERENCES Users(id),
            FOREIGN KEY(player2_id) REFERENCES Users(id)
        )
    ''')

    # NEW: Friend Rooms (Play with Friends multi-round engine)
    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS FriendRooms (
            code VARCHAR(32) PRIMARY KEY,
            host_user_id INT,
            guest_user_id INT,
            round_number INT DEFAULT 1,
            current_word VARCHAR(255),
            current_clue TEXT,
            category VARCHAR(64) DEFAULT 'RANDOM',
            difficulty VARCHAR(32) DEFAULT 'MEDIUM',
            status VARCHAR(32) DEFAULT 'waiting',
            created_at TEXT,
            updated_at TEXT
        )
    ''')

    execute_query(c, '''
        CREATE TABLE IF NOT EXISTS FriendRoomPlayers (
            room_code VARCHAR(32),
            user_id INT,
            score INT DEFAULT 0,
            mistakes INT DEFAULT 0,
            wins INT DEFAULT 0,
            losses INT DEFAULT 0,
            round_progress INT DEFAULT 0,
            round_status VARCHAR(32) DEFAULT 'playing',
            last_seen TEXT,
            PRIMARY KEY (room_code, user_id)
        )
    ''')

    conn.commit()
    
    # NEW: Self-healing check for words (Always sync to guarantee all words are reflected)
    from words import CATEGORIZED_WORDS

    # Ensure schema is upgraded if old UNIQUE(word) constraint exists
    try:
        execute_query(c, "SELECT sql FROM sqlite_master WHERE type='table' AND name='Words'")
        w_schema = c.fetchone()
        w_sql = row_to_tuple(w_schema)[0] if w_schema else ""
        if "UNIQUE(word, category, difficulty)" not in w_sql and "UNIQUE (word, category, difficulty)" not in w_sql:
            print("MIGRATION: Upgrading Words table schema to UNIQUE(word, category, difficulty)...")
            execute_query(c, "PRAGMA foreign_keys=OFF")
            execute_query(c, '''
                CREATE TABLE IF NOT EXISTS Words_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    word TEXT,
                    hint TEXT,
                    category TEXT,
                    difficulty TEXT,
                    description TEXT,
                    UNIQUE(word, category, difficulty)
                )
            ''')
            execute_query(c, '''
                INSERT OR IGNORE INTO Words_new (id, word, hint, category, difficulty, description)
                SELECT id, word, hint, category, difficulty, description FROM Words
            ''')
            execute_query(c, "DROP TABLE Words")
            execute_query(c, "ALTER TABLE Words_new RENAME TO Words")
            execute_query(c, "PRAGMA foreign_keys=ON")
            conn.commit()
    except Exception as _schema_err:
        print(f"MIGRATION NOTICE: {_schema_err}")

    for category, difficulties in CATEGORIZED_WORDS.items():
        for difficulty, word_list in difficulties.items():
            for item in word_list:
                try:
                    if is_mysql:
                        execute_query(c, '''
                            INSERT INTO Words (word, hint, category, difficulty, description)
                            VALUES (?, ?, ?, ?, ?)
                            ON DUPLICATE KEY UPDATE
                                hint = VALUES(hint),
                                description = VALUES(description)
                        ''', (item['word'].upper(), item['clue'], category, difficulty, item.get('description', '')))
                    else:
                        execute_query(c, '''
                            INSERT INTO Words (word, hint, category, difficulty, description)
                            VALUES (?, ?, ?, ?, ?)
                            ON CONFLICT(word, category, difficulty) DO UPDATE SET
                                hint = excluded.hint,
                                description = excluded.description
                        ''', (item['word'].upper(), item['clue'], category, difficulty, item.get('description', '')))
                except Exception as e:
                    continue
    conn.commit()
    print("POPULATION COMPLETE: Words synced.")
        
    conn.close()

    # === CREATE PERFORMANCE INDEXES (idempotent — IF NOT EXISTS) ===
    # These dramatically speed up the most common queries under concurrent load
    _idx_conn = get_db_connection()
    _idx_c = get_cursor(_idx_conn)
    try:
        execute_query(_idx_c, 'CREATE INDEX IF NOT EXISTS idx_words_cat_diff ON Words(category, difficulty)')
        execute_query(_idx_c, 'CREATE INDEX IF NOT EXISTS idx_words_diff ON Words(difficulty)')
        execute_query(_idx_c, 'CREATE INDEX IF NOT EXISTS idx_uwp_user ON UserWordProgress(user_id)')
        execute_query(_idx_c, 'CREATE INDEX IF NOT EXISTS idx_uwp_user_word ON UserWordProgress(user_id, word_id)')
        execute_query(_idx_c, 'CREATE INDEX IF NOT EXISTS idx_users_username ON Users(username)')
        execute_query(_idx_c, 'CREATE INDEX IF NOT EXISTS idx_users_xp ON Users(xp DESC)')
        execute_query(_idx_c, 'CREATE INDEX IF NOT EXISTS idx_users_score ON Users(highest_score DESC)')
        execute_query(_idx_c, 'CREATE INDEX IF NOT EXISTS idx_missionruns_key ON MissionRuns(mission_key, score DESC)')
        _idx_conn.commit()
        print("INDEXES: Performance indexes applied.")
    except Exception as e:
        print(f"INDEXES: Warning during index creation: {e}")
    finally:
        _idx_conn.close()

try:
    init_db()
except Exception as _init_err:
    print(f"DATABASE INIT EXCEPTION: {_init_err}")

# === API Endpoints ===

@app.route('/api/login', methods=['POST'])


def login():
    if rate_limited(max_per_window=20, window=60):
        return jsonify({"error": "Too many requests. Wait a moment and try again."}), 429

    data = request.json or {}
    username = data.get('username', '')
    if not isinstance(username, str):
        return jsonify({"error": "Invalid input"}), 400
    username = username.strip()[:50]  # Hard cap at 50 chars
    
    if not username:
        return jsonify({"error": "Username required"}), 400
        
    conn = get_db_connection()
    c = get_cursor(conn)
    execute_query(c, 
'SELECT id, username, highest_score, xp, level, rank, total_wins, total_losses, story_progress, bosses_defeated FROM Users WHERE LOWER(username) = LOWER(?)', (username,))
    user = c.fetchone()
    
    if not user:
        conn.close()
        return jsonify({"error": f'Callsign "{username}" not found. If you are new, use the NEW RECRUIT tab!'}), 404

    # Handle both dictionary results (MySQL) and tuple results (SQLite)
    if isinstance(user, dict):
        user_id = user['id']
        high_score = user['highest_score']
        xp = user['xp']
        level = user['level']
        rank = user['rank']
        total_wins = user['total_wins']
        total_losses = user['total_losses']
        story_progress = user['story_progress']
        bosses_defeated = user.get('bosses_defeated') or 0
    else:
        # Tuple-based unpacking
        user_id, _, high_score, xp, level, rank, total_wins, total_losses, story_progress, bosses_defeated = user
        
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
        "story_progress": story_progress,
        "bosses_defeated": bosses_defeated or 0
    })

@app.route('/api/register', methods=['POST'])
def register():
    """Creates a brand new user. Fails if username already exists."""
    if rate_limited(max_per_window=10, window=60):
        return jsonify({"error": "Too many registration attempts. Wait a moment."}), 429

    data = request.json or {}
    username = data.get('username', '')
    if not isinstance(username, str):
        return jsonify({"error": "Invalid input"}), 400
    username = username.strip()[:50]  # Hard cap at 50 chars
    
    if not username:
        return jsonify({"error": "Username required"}), 400
    if len(username) < 3:
        return jsonify({"error": "Callsign too short (3+ chars)"}), 400
    if len(username) > 15:
        return jsonify({"error": "Callsign too long (max 15 chars)"}), 400
    if username.isdigit():
        return jsonify({"error": "Username cannot be numbers only"}), 400
    # Block special characters that can cause SQL issues even through parameterised queries
    import re as _re
    if not _re.match(r'^[A-Za-z0-9_\-\.]+$', username):
        return jsonify({"error": "Callsign: letters, numbers, _, -, . only"}), 400
        
    conn = get_db_connection()
    c = get_cursor(conn)
    execute_query(c, 
'SELECT id FROM Users WHERE LOWER(username) = LOWER(?)', (username,))
    existing = c.fetchone()
    
    if existing:
        conn.close()
        return jsonify({"error": f'Callsign "{username}" is already taken! Choose another.'}), 409
        
    execute_query(c, 
'INSERT INTO Users (username, highest_score, xp, level, rank, total_wins, total_losses) VALUES (?, 0, 0, 1, \'Beginner\', 0, 0)', (username,))
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
    solved_per_category = {}
    for row in c.fetchall():
        row_tup = row_to_tuple(row)
        solved_per_category[row_tup[0]] = row_tup[1]
    
    # Get total words per category
    execute_query(c, 
'SELECT category, COUNT(*) FROM Words GROUP BY category')
    total_per_category = {}
    for row in c.fetchall():
        row_tup = row_to_tuple(row)
        total_per_category[row_tup[0]] = row_tup[1]
    
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
    if rate_limited(max_per_window=60, window=60):
        return jsonify({"error": "Too many requests. Slow down."}), 429

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
            stats_tup = row_to_tuple(user_stats)
            xp, streak, wins, losses = stats_tup
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
    
    raw_rows = c.fetchall()
    all_words = []
    for row in raw_rows:
        row_d = row_to_dict(row, c)
        all_words.append({
            "id": row_d.get('id'),
            "word": row_d.get('word'),
            "hint": row_d.get('hint') or row_d.get('clue'),
            "category": row_d.get('category'),
            "description": row_d.get('description')
        })

    if not all_words:
        conn.close()
        return jsonify({"error": f"No words found for {category} / {difficulty}"}), 400

    # Get words already solved by this user (Accurate tracking)
    execute_query(c, 
'SELECT word_id FROM UserWordProgress WHERE user_id = ?', (user_id,))
    raw_solved = c.fetchall()
    solved_word_ids = set()
    for row in raw_solved:
        solved_word_ids.add(row_to_tuple(row)[0])
    
    # Filter words that have already been played
    available_words = [w for w in all_words if w["id"] not in solved_word_ids]
    
    # Fallback to legacy guessed_words column just in case (to avoid repetition for old users)
    try:
        execute_query(c, 
'SELECT guessed_words FROM Users WHERE id = ?', (user_id,))
        gu_row = c.fetchone()
        if gu_row:
            val = row_to_tuple(gu_row)[0]
            if val:
                legacy_guessed = set(json.loads(val))
                available_words = [w for w in available_words if w["word"] not in legacy_guessed]
    except:
        pass

    # Filter out words explicitly excluded via query param (e.g. from frontend local tracking)
    exclude_param = request.args.get('exclude', '')
    if exclude_param:
        excluded_set = set(w.strip().upper() for w in exclude_param.split(',') if w.strip())
        available_words = [w for w in available_words if w["word"].upper() not in excluded_set]

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
    if rate_limited(max_per_window=30, window=60):
        return jsonify({"error": "Too many score submissions. Slow down."}), 429

    data = request.json or {}
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
'SELECT highest_score, xp, level, rank, total_wins, total_losses, fastest_win_seconds, current_streak, longest_streak, story_progress, bosses_defeated FROM Users WHERE id = ?', (user_id,))
        row = c.fetchone()
    except Exception as e:
        print(f"DATABASE WARNING: submit_score read fallback triggered: {e}")
        execute_query(c, 
'SELECT highest_score, xp, level, rank, total_wins, total_losses FROM Users WHERE id = ?', (user_id,))
        row = c.fetchone()
    
    if not row:
        conn.close()
        return jsonify({"error": "User not found"}), 404
        
    row_d = row_to_dict(row, c)
    current_high = row_d.get('highest_score') or 0
    current_xp = row_d.get('xp') or 0
    current_level = row_d.get('level') or 1
    current_rank = row_d.get('rank') or 'Beginner'
    total_wins = row_d.get('total_wins') or 0
    total_losses = row_d.get('total_losses') or 0
    fastest_win_seconds = row_d.get('fastest_win_seconds') if row_d.get('fastest_win_seconds') is not None else 999999
    current_streak = row_d.get('current_streak') or 0
    longest_streak = row_d.get('longest_streak') or 0
    story_progress = row_d.get('story_progress') or 1
    bosses_defeated = row_d.get('bosses_defeated') or 0
    
    # --- MEANINGFUL SCORING SYSTEM ---
    # Multipliers based on difficulty
    difficulty = data.get('difficulty', 'MEDIUM').upper()
    multipliers = {"EASY": 1.0, "MEDIUM": 1.5, "HARD": 2.5}
    mult = multipliers.get(difficulty, 1.0)

    # Base XP calculation
    is_boss = data.get('is_boss', False)

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
        
        if is_boss:
            bosses_defeated += 1
            final_xp_added = int(final_xp_added * 2.0)
        
    elif is_win is False:
        total_losses += 1
        current_streak = 0
        final_xp_added = int(base_xp * mult) # Still get some XP for trying, based on difficulty
        if is_boss:
            final_xp_added = int(final_xp_added * 1.5)
    else:
        final_xp_added = 0

    # Apply to user
    new_high_score = score if score > current_high else current_high
    new_xp = current_xp + final_xp_added
    
    # Record word progress on win
    word_text = data.get('word')
    category_text = data.get('category')
    if is_win and word_text:
        # Resolve word ID precisely
        if category_text:
            execute_query(c, 
'SELECT id FROM Words WHERE word = ? AND category = ? AND difficulty = ?', (word_text.upper(), category_text.upper(), difficulty))
        else:
            execute_query(c, 
'SELECT id FROM Words WHERE word = ?', (word_text.upper(),))
        w_row = c.fetchone()
        if w_row:
            word_id = row_to_tuple(w_row)[0]
            try:
                execute_query(c, 
'INSERT INTO UserWordProgress (user_id, word_id, completed_at) VALUES (?, ?, ?)', (user_id, word_id, datetime.now().isoformat()))
            except DB_INTEGRITY_ERRORS:
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
            SET highest_score = ?, xp = ?, level = ?, rank = ?, total_wins = ?, total_losses = ?, fastest_win_seconds = ?, current_streak = ?, longest_streak = ?, story_progress = ?, bosses_defeated = ?, total_games = total_games + 1
            WHERE id = ?
        ''', (new_high_score, new_xp, new_level, new_rank, total_wins, total_losses, fastest_win_seconds, current_streak, longest_streak, new_story_progress, bosses_defeated, user_id))
    except Exception as e:
        print(f"DATABASE WARNING: submit_score write fallback triggered: {e}")
        # Fallback if fastest_win_seconds, current_streak, longest_streak, story_progress, total_games, bosses_defeated columns are missing
        execute_query(c, 
'''
            UPDATE Users 
            SET highest_score = ?, xp = ?, level = ?, rank = ?, total_wins = ?, total_losses = ?
            WHERE id = ?
        ''', (new_high_score, new_xp, new_level, new_rank, total_wins, total_losses, user_id))

    # --- Domain & Difficulty Score Record ---
    category = data.get('category')
    if category and category.upper() != 'ALL' and user_id:
        cat_clean = category.upper()
        diff_clean = difficulty.upper()
        try:
            execute_query(c, 'SELECT highest_score, fastest_win_seconds, total_wins FROM DomainScores WHERE user_id = ? AND category = ? AND difficulty = ?', (user_id, cat_clean, diff_clean))
            ds_row = c.fetchone()
            if ds_row:
                ds_tup = row_to_tuple(ds_row)
                ds_high = max(ds_tup[0] or 0, score)
                ds_fast = ds_tup[1] or 999999
                if is_win and time_taken and time_taken < ds_fast:
                    ds_fast = time_taken
                ds_wins = (ds_tup[2] or 0) + (1 if is_win else 0)
                execute_query(c, '''
                    UPDATE DomainScores
                    SET highest_score = ?, fastest_win_seconds = ?, total_wins = ?, updated_at = ?
                    WHERE user_id = ? AND category = ? AND difficulty = ?
                ''', (ds_high, ds_fast, ds_wins, datetime.now().isoformat(), user_id, cat_clean, diff_clean))
            else:
                ds_high = score
                ds_fast = time_taken if (is_win and time_taken) else 999999
                ds_wins = 1 if is_win else 0
                execute_query(c, '''
                    INSERT INTO DomainScores (user_id, category, difficulty, highest_score, fastest_win_seconds, total_wins, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (user_id, cat_clean, diff_clean, ds_high, ds_fast, ds_wins, datetime.now().isoformat()))
        except Exception as ds_err:
            print(f"DATABASE WARNING: DomainScores update failed: {ds_err}")
        
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
                
    # Boss-based achievements
    if bosses_defeated >= 1:
        if award_achievement(c, user_id, "Executioner's Bane"):
            new_achievements.append("Executioner's Bane")
    if bosses_defeated >= 5:
        if award_achievement(c, user_id, "Arch-Nemesis"):
            new_achievements.append("Arch-Nemesis")
        
    conn.commit()
    conn.close()
    
    return jsonify({
        "message": "Progress recorded", 
        "highest_score": new_high_score,
        "xp": new_xp,
        "level": new_level,
        "rank": new_rank,
        "current_streak": current_streak,
        "bosses_defeated": bosses_defeated,
        "new_achievements": new_achievements
    })

@app.route('/api/highscores', methods=['GET'])
def get_highscores():
    conn = get_db_connection()
    c = get_cursor(conn)
    
    category = request.args.get('category', 'ALL').upper()
    difficulty = request.args.get('difficulty', 'ALL').upper()

    score_rows = []
    speed_rows = []
    streak_rows = []

    if category != 'ALL' or difficulty != 'ALL':
        where_clauses = []
        params = []
        if category != 'ALL':
            where_clauses.append("DomainScores.category = ?")
            params.append(category)
        if difficulty != 'ALL':
            where_clauses.append("DomainScores.difficulty = ?")
            params.append(difficulty)
        
        where_str = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        # 1. Highest Score in Domain/Diff
        try:
            execute_query(c, f'''
                SELECT Users.username, DomainScores.highest_score 
                FROM DomainScores 
                JOIN Users ON DomainScores.user_id = Users.id 
                {where_str} 
                ORDER BY DomainScores.highest_score DESC LIMIT 10
            ''', tuple(params))
            score_rows = c.fetchall()
        except Exception as e:
            print(f"DATABASE WARNING: domain highest_score query failed: {e}")

        # 2. Fastest Win in Domain/Diff
        try:
            speed_where = (where_str + " AND " if where_str else " WHERE ") + "DomainScores.fastest_win_seconds < 999999"
            execute_query(c, f'''
                SELECT Users.username, DomainScores.fastest_win_seconds 
                FROM DomainScores 
                JOIN Users ON DomainScores.user_id = Users.id 
                {speed_where} 
                ORDER BY DomainScores.fastest_win_seconds ASC LIMIT 10
            ''', tuple(params))
            speed_rows = c.fetchall()
        except Exception as e:
            print(f"DATABASE WARNING: domain speed query failed: {e}")

        # 3. Total Wins in Domain/Diff
        try:
            execute_query(c, f'''
                SELECT Users.username, DomainScores.total_wins 
                FROM DomainScores 
                JOIN Users ON DomainScores.user_id = Users.id 
                {where_str} 
                ORDER BY DomainScores.total_wins DESC LIMIT 10
            ''', tuple(params))
            streak_rows = c.fetchall()
        except Exception as e:
            print(f"DATABASE WARNING: domain wins query failed: {e}")
    else:
        # 1. Highest Score Leaderboard (Global)
        execute_query(c, 'SELECT username, highest_score FROM Users ORDER BY highest_score DESC LIMIT 10')
        score_rows = c.fetchall()
        
        # 2. Fastest Win Leaderboard (Global)
        try:
            execute_query(c, 'SELECT username, fastest_win_seconds FROM Users WHERE fastest_win_seconds < 999999 ORDER BY fastest_win_seconds ASC LIMIT 10')
            speed_rows = c.fetchall()
        except Exception as e:
            print(f"DATABASE WARNING: fastest_win highscores failed: {e}")
            speed_rows = []
            
        # 3. Longest Streak Leaderboard (Global)
        try:
            execute_query(c, 'SELECT username, longest_streak FROM Users ORDER BY longest_streak DESC LIMIT 10')
            streak_rows = c.fetchall()
        except Exception as e:
            print(f"DATABASE WARNING: longest_streak highscores failed: {e}")
            streak_rows = []
        
    def fmt_rows(rows):
        res = []
        for r in rows:
            row_t = row_to_tuple(r)
            res.append({"username": row_t[0], "val": row_t[1]})
        return res

    conn.close()
    
    return jsonify({
        "score": fmt_rows(score_rows),
        "speed": fmt_rows(speed_rows),
        "streak": fmt_rows(streak_rows)
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
        word_id = row_to_tuple(row)[0]
        execute_query(c, 
'SELECT word, hint, category, difficulty, description FROM Words WHERE id = ?', (word_id,))
        word_data = c.fetchone()
    else:
        # Generate a new one from the database
        execute_query(c, 
'SELECT id FROM Words')
        all_ids = [row_to_tuple(r)[0] for r in c.fetchall()]
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
        if u_row:
            u_tup = row_to_tuple(u_row)
            if u_tup[0] == today:
                already_done = True
    
    word_tup = row_to_tuple(word_data)
    conn.close()
    
    return jsonify({
        "word": word_tup[0],
        "clue": word_tup[1],
        "category": word_tup[2],
        "difficulty": word_tup[3],
        "description": word_tup[4],
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
                   fastest_win_seconds, current_streak, longest_streak, hints_used, total_games, story_progress, bosses_defeated 
            FROM Users WHERE id = ?
''', (user_id,))
        row = c.fetchone()
    except Exception as e:
        print(f"DATABASE WARNING: get_profile read fallback triggered: {e}")
        execute_query(c, 
'SELECT username, highest_score, xp, level, rank, total_wins, total_losses FROM Users WHERE id = ?', (user_id,))
        row = c.fetchone()
        if row:
            row_d = row_to_dict(row, c)
            row_d.update({
                'fastest_win_seconds': 999999,
                'current_streak': 0,
                'longest_streak': 0,
                'hints_used': 0,
                'total_games': (row_d.get('total_wins') or 0) + (row_d.get('total_losses') or 0),
                'story_progress': 1,
                'bosses_defeated': 0
            })
            row = row_d

    if not row:
        conn.close()
        return jsonify({"error": "User not found"}), 404
        
    row_d = row_to_dict(row, c)
    profile = {
        "username": row_d.get('username'),
        "highest_score": row_d.get('highest_score') or 0,
        "xp": row_d.get('xp') or 0,
        "level": row_d.get('level') or 1,
        "rank": row_d.get('rank') or 'Beginner',
        "total_wins": row_d.get('total_wins') or 0,
        "total_losses": row_d.get('total_losses') or 0,
        "win_rate": round((row_d.get('total_wins') or 0) / ((row_d.get('total_wins') or 0) + (row_d.get('total_losses') or 0)) * 100, 1) if ((row_d.get('total_wins') or 0) + (row_d.get('total_losses') or 0)) > 0 else 0,
        "fastest_win": row_d.get('fastest_win_seconds') if (row_d.get('fastest_win_seconds') is not None and row_d.get('fastest_win_seconds') < 999999) else None,
        "current_streak": row_d.get('current_streak') or 0,
        "longest_streak": row_d.get('longest_streak') or 0,
        "hints_used": row_d.get('hints_used') or 0,
        "total_games": row_d.get('total_games') or 0,
        "story_progress": row_d.get('story_progress') or 1,
        "bosses_defeated": row_d.get('bosses_defeated') or 0
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
    except Exception as e:
        print(f"DATABASE WARNING: hints_used update failed: {e}")
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
    except Exception as e:
        print(f"DATABASE WARNING: daily_complete failed: {e}")
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
    return jsonify({"achievements": [row_to_tuple(r)[0] for r in rows]})

def award_achievement(c, user_id, name):
    """Awards an achievement if not already earned."""
    execute_query(c, 
'SELECT id FROM Achievements WHERE user_id = ? AND achievement_name = ?', (user_id, name))
    if not c.fetchone():
        execute_query(c, 
'INSERT INTO Achievements (user_id, achievement_name) VALUES (?, ?)', (user_id, name))
        return True
    return False



@app.route('/api/mission/submit', methods=['POST'])
def mission_submit():
    data = request.json or {}
    user_id = data.get('user_id')
    mission_key = data.get('mission_key')

    if not user_id or not mission_key:
        return jsonify({"error": "user_id and mission_key required"}), 400

    seed = data.get('seed', '')
    mode = data.get('mode', '')
    category = data.get('category', '')
    difficulty = data.get('difficulty', '')

    try:
        length = int(data.get('length') or 0)
        score = int(data.get('score') or 0)
        time_seconds = int(data.get('time_seconds') or 0)
    except Exception:
        return jsonify({"error": "Invalid numeric fields"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)

    try:
        execute_query(c, 'SELECT score, time_seconds FROM MissionRuns WHERE mission_key = ? AND user_id = ?', (mission_key, user_id))
        row = c.fetchone()

        now = datetime.now().isoformat()
        updated = False

        if not row:
            execute_query(c, '''
                INSERT INTO MissionRuns (mission_key, seed, mode, category, difficulty, length, user_id, score, time_seconds, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (mission_key, seed, mode, category, difficulty, length, user_id, score, time_seconds, now))
            updated = True
        else:
            row_d = row_to_dict(row, c)
            old_score = int(row_d.get('score') or 0)
            old_time = int(row_d.get('time_seconds') or 999999999)

            # Better run: higher score, or tie with faster time.
            if score > old_score or (score == old_score and time_seconds < old_time):
                execute_query(c, '''
                    UPDATE MissionRuns
                    SET seed = ?, mode = ?, category = ?, difficulty = ?, length = ?, score = ?, time_seconds = ?, completed_at = ?
                    WHERE mission_key = ? AND user_id = ?
                ''', (seed, mode, category, difficulty, length, score, time_seconds, now, mission_key, user_id))
                updated = True

        conn.commit()
        conn.close()
        return jsonify({"message": "Mission run recorded", "updated": updated})
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/mission/leaderboard', methods=['GET'])
def mission_leaderboard():
    mission_key = request.args.get('mission_key')
    if not mission_key:
        return jsonify({"error": "mission_key required"}), 400

    limit_raw = request.args.get('limit', 10)
    try:
        limit = int(limit_raw)
    except Exception:
        limit = 10
    limit = max(1, min(limit, 50))

    conn = get_db_connection()
    c = get_cursor(conn)

    try:
        execute_query(c, '''
            SELECT Users.username, MissionRuns.score, MissionRuns.time_seconds, MissionRuns.completed_at
            FROM MissionRuns
            JOIN Users ON MissionRuns.user_id = Users.id
            WHERE MissionRuns.mission_key = ?
            ORDER BY MissionRuns.score DESC, MissionRuns.time_seconds ASC
            LIMIT ?
        ''', (mission_key, limit))

        res = c.fetchall()
        rows = []

        for r in res:
            row_d = row_to_dict(r, c)
            rows.append({
                "username": row_d.get('username'),
                "score": row_d.get('score'),
                "time_seconds": row_d.get('time_seconds'),
                "completed_at": row_d.get('completed_at'),
            })

        conn.close()
        return jsonify({"rows": rows})
    except Exception as e:
        conn.close()
        # Leaderboards are non-critical; return empty data instead of failing the client.
        return jsonify({"rows": [], "error": str(e)}), 200


@app.route('/api/duel/create', methods=['POST'])
def duel_create():
    data = request.json or {}

    user_id = data.get('user_id')
    raw_word = (data.get('word') or '').strip().upper()
    random_pick = bool(data.get('random') or (not raw_word))

    category = (data.get('category') or 'RANDOM').strip().upper()
    difficulty = (data.get('difficulty') or 'MEDIUM').strip().upper()
    if difficulty not in ['EASY', 'MEDIUM', 'HARD']:
        difficulty = 'MEDIUM'

    # Word validation when explicitly provided
    if not random_pick:
        if len(raw_word) < 3 or len(raw_word) > 24:
            return jsonify({"error": "Word length must be 3-24"}), 400
        import re
        if not re.match(r'^[A-Z]+$', raw_word):
            return jsonify({"error": "Alphabet letters only"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)

    try:
        word = raw_word

        if random_pick:
            # Pull a reasonable pool and choose randomly (portable across SQLite/MySQL).
            if category and category != 'RANDOM':
                execute_query(c, 'SELECT word FROM Words WHERE category = ? AND difficulty = ? LIMIT 3000', (category, difficulty))
            else:
                execute_query(c, 'SELECT word FROM Words WHERE difficulty = ? LIMIT 3000', (difficulty,))

            rows = c.fetchall()
            pool = []
            for r in rows:
                if isinstance(r, dict):
                    pool.append(r.get('word'))
                else:
                    pool.append(r[0])

            pool = [w for w in pool if w]
            if not pool:
                execute_query(c, 'SELECT word FROM Words LIMIT 3000')
                rows = c.fetchall()
                for r in rows:
                    pool.append(r.get('word') if isinstance(r, dict) else r[0])
                pool = [w for w in pool if w]

            if not pool:
                conn.close()
                return jsonify({"error": "No words available"}), 500

            word = random.choice(pool).strip().upper()

        # Generate a duel code
        alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        code = None
        for _ in range(12):
            candidate = 'DUL-' + ''.join(random.choice(alphabet) for _ in range(8))
            execute_query(c, 'SELECT id FROM DuelInvites WHERE code = ?', (candidate,))
            if not c.fetchone():
                code = candidate
                break

        if not code:
            conn.close()
            return jsonify({"error": "Could not allocate duel code"}), 500

        now = datetime.now().isoformat()

        execute_query(c, '''
            INSERT INTO DuelInvites (code, creator_user_id, word, category, difficulty, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (code, user_id, word, category, difficulty, now))

        conn.commit()
        conn.close()

        return jsonify({
            "code": code,
            "category": category,
            "difficulty": difficulty,
            "created_at": now
        })
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/duel/get', methods=['GET'])
def duel_get():
    code = (request.args.get('code') or '').strip().upper()
    if not code:
        return jsonify({"error": "code required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)

    try:
        execute_query(c, 'SELECT code, creator_user_id, word, category, difficulty, created_at FROM DuelInvites WHERE code = ?', (code,))
        row = c.fetchone()
        conn.close()

        if not row:
            return jsonify({"error": "Invalid code"}), 404

        row_d = row_to_dict(row, c)
        return jsonify({
            "code": row_d.get('code'),
            "creator_user_id": row_d.get('creator_user_id'),
            "word": row_d.get('word'),
            "category": row_d.get('category'),
            "difficulty": row_d.get('difficulty'),
            "created_at": row_d.get('created_at')
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/duel/submit', methods=['POST'])
def duel_submit():
    data = request.json or {}
    user_id = data.get('user_id')
    code = (data.get('code') or '').strip().upper()

    if not user_id or not code:
        return jsonify({"error": "user_id and code required"}), 400

    try:
        score = int(data.get('score') or 0)
        time_seconds = int(data.get('time_seconds') or 0)
        is_win = 1 if bool(data.get('is_win')) else 0
    except Exception:
        return jsonify({"error": "Invalid numeric fields"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)

    try:
        execute_query(c, 'SELECT score, time_seconds, is_win FROM DuelRuns WHERE code = ? AND user_id = ?', (code, user_id))
        row = c.fetchone()

        now = datetime.now().isoformat()
        updated = False

        if not row:
            execute_query(c, '''
                INSERT INTO DuelRuns (code, user_id, score, time_seconds, is_win, submitted_at)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (code, user_id, score, time_seconds, is_win, now))
            updated = True
        else:
            row_d = row_to_dict(row, c)
            old_score = int(row_d.get('score') or 0)
            old_time = int(row_d.get('time_seconds') or 999999999)
            old_win = int(row_d.get('is_win') or 0)

            # Better run: higher score; tie-break by faster time; prefer wins over losses
            better = False
            if is_win > old_win and score >= old_score:
                better = True
            elif score > old_score:
                better = True
            elif score == old_score and time_seconds < old_time:
                better = True

            if better:
                execute_query(c, '''
                    UPDATE DuelRuns
                    SET score = ?, time_seconds = ?, is_win = ?, submitted_at = ?
                    WHERE code = ? AND user_id = ?
                ''', (score, time_seconds, is_win, now, code, user_id))
                updated = True

        conn.commit()
        conn.close()
        return jsonify({"message": "Duel run recorded", "updated": updated})
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500


# ==========================================
# NEW: Live Multiplayer Matchmaking & Duel
# ==========================================

import uuid

@app.route('/api/multiplayer/queue/join', methods=['POST'])
def join_matchmaking_queue():
    data = request.json or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)
    now_str = datetime.utcnow().isoformat()

    try:
        # Clean up entries older than 30 seconds
        execute_query(c, 'SELECT user_id, joined_at FROM LiveDuelQueue')
        queue_items = c.fetchall()
        for item in queue_items:
            item_d = row_to_dict(item, c)
            u_id = item_d.get('user_id')
            joined_at_str = item_d.get('joined_at')
            if joined_at_str:
                try:
                    joined_dt = datetime.fromisoformat(joined_at_str)
                    diff = (datetime.utcnow() - joined_dt).total_seconds()
                    if diff > 30:
                        execute_query(c, 'DELETE FROM LiveDuelQueue WHERE user_id = ?', (u_id,))
                except Exception:
                    pass

        # Add this user to queue (or update joined_at)
        try:
            execute_query(c, 'INSERT OR REPLACE INTO LiveDuelQueue (user_id, joined_at) VALUES (?, ?)', (user_id, now_str))
        except Exception:
            # Fallback for mysql
            execute_query(c, 'DELETE FROM LiveDuelQueue WHERE user_id = ?', (user_id,))
            execute_query(c, 'INSERT INTO LiveDuelQueue (user_id, joined_at) VALUES (?, ?)', (user_id, now_str))

        # Check if there is an opponent in the queue
        execute_query(c, 'SELECT user_id FROM LiveDuelQueue WHERE user_id != ? ORDER BY joined_at ASC LIMIT 1', (user_id,))
        opponent_row = c.fetchone()

        if opponent_row:
            opponent_tup = row_to_tuple(opponent_row)
            opponent_id = opponent_tup[0]

            # Remove both from queue
            execute_query(c, 'DELETE FROM LiveDuelQueue WHERE user_id IN (?, ?)', (user_id, opponent_id))

            # Select a random word
            execute_query(c, 'SELECT word, category, difficulty FROM Words')
            all_words = c.fetchall()
            if all_words:
                chosen = random.choice(all_words)
                chosen_d = row_to_dict(chosen, c)
                word = chosen_d.get('word')
                category = chosen_d.get('category')
                difficulty = chosen_d.get('difficulty')
            else:
                word = "MULTIPLAYER"
                category = "TEST"
                difficulty = "MEDIUM"

            # Create live duel
            duel_id = str(uuid.uuid4())
            execute_query(c, '''
                INSERT INTO LiveDuels (
                    id, player1_id, player2_id, word, category, difficulty, 
                    player1_progress, player2_progress, player1_errors, player2_errors, 
                    player1_state, player2_state, winner_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'playing', 'playing', NULL, ?, ?)
            ''', (duel_id, user_id, opponent_id, word, category, difficulty, now_str, now_str))

            conn.commit()
            conn.close()
            return jsonify({
                "status": "matched",
                "duel_id": duel_id,
                "opponent_id": opponent_id
            })

        conn.commit()
        conn.close()
        return jsonify({"status": "waiting"})
    except Exception as e:
        try:
            conn.rollback()
        except:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/multiplayer/queue/status', methods=['GET'])
def get_matchmaking_status():
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)

    try:
        # Check if matched in a fresh active duel (created in last 30 seconds)
        execute_query(c, '''
            SELECT id, player1_id, player2_id, created_at FROM LiveDuels 
            WHERE (player1_id = ? OR player2_id = ?) AND winner_id IS NULL
            ORDER BY created_at DESC LIMIT 1
        ''', (user_id, user_id))
        
        duel_row = c.fetchone()
        if duel_row:
            duel_d = row_to_dict(duel_row, c)
            duel_id = duel_d.get('id')
            created_at_str = duel_d.get('created_at')
            if created_at_str:
                try:
                    created_dt = datetime.fromisoformat(created_at_str)
                    diff = (datetime.utcnow() - created_dt).total_seconds()
                    if diff < 30:
                        opponent_id = duel_d.get('player2_id') if int(duel_d.get('player1_id')) == int(user_id) else duel_d.get('player1_id')
                        conn.close()
                        return jsonify({
                            "status": "matched",
                            "duel_id": duel_id,
                            "opponent_id": opponent_id
                        })
                except Exception:
                    pass

        # Check if still in queue
        execute_query(c, 'SELECT user_id FROM LiveDuelQueue WHERE user_id = ?', (user_id,))
        in_queue = c.fetchone()
        conn.close()

        if in_queue:
            return jsonify({"status": "waiting"})
        else:
            return jsonify({"status": "idle"})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/multiplayer/queue/leave', methods=['POST'])
def leave_matchmaking_queue():
    data = request.json or {}
    user_id = data.get('user_id')
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)
    try:
        execute_query(c, 'DELETE FROM LiveDuelQueue WHERE user_id = ?', (user_id,))
        conn.commit()
        conn.close()
        return jsonify({"status": "left"})
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/multiplayer/duel/<duel_id>', methods=['GET'])
def get_live_duel_status(duel_id):
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)

    try:
        execute_query(c, 'SELECT * FROM LiveDuels WHERE id = ?', (duel_id,))
        duel_row = c.fetchone()
        if not duel_row:
            conn.close()
            return jsonify({"error": "duel not found"}), 404

        duel_d = row_to_dict(duel_row, c)
        
        p1_id = duel_d.get('player1_id')
        p2_id = duel_d.get('player2_id')

        # Fetch usernames
        execute_query(c, 'SELECT id, username FROM Users WHERE id IN (?, ?)', (p1_id, p2_id))
        user_rows = c.fetchall()
        usernames = {}
        for r in user_rows:
            r_d = row_to_dict(r, c)
            usernames[int(r_d.get('id'))] = r_d.get('username')

        p1_name = usernames.get(int(p1_id), "Player 1")
        p2_name = usernames.get(int(p2_id), "Player 2")

        conn.close()

        # Build response
        role = "player1" if int(user_id) == int(p1_id) else "player2"
        opponent_name = p2_name if role == "player1" else p1_name
        
        return jsonify({
            "id": duel_d.get('id'),
            "role": role,
            "opponent_name": opponent_name,
            "word": duel_d.get('word'),
            "category": duel_d.get('category'),
            "difficulty": duel_d.get('difficulty'),
            "player1_progress": duel_d.get('player1_progress'),
            "player2_progress": duel_d.get('player2_progress'),
            "player1_errors": duel_d.get('player1_errors'),
            "player2_errors": duel_d.get('player2_errors'),
            "player1_state": duel_d.get('player1_state'),
            "player2_state": duel_d.get('player2_state'),
            "winner_id": duel_d.get('winner_id')
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/multiplayer/duel/<duel_id>/update', methods=['POST'])
def update_live_duel_status(duel_id):
    data = request.json or {}
    user_id = data.get('user_id')
    progress = data.get('progress', 0)
    errors = data.get('errors', 0)
    state = data.get('state', 'playing')

    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)
    now_str = datetime.utcnow().isoformat()

    try:
        execute_query(c, 'SELECT * FROM LiveDuels WHERE id = ?', (duel_id,))
        duel_row = c.fetchone()
        if not duel_row:
            conn.close()
            return jsonify({"error": "duel not found"}), 404

        duel_d = row_to_dict(duel_row, c)
        p1_id = int(duel_d.get('player1_id'))
        p2_id = int(duel_d.get('player2_id'))
        current_winner = duel_d.get('winner_id')

        # Determine which player we are updating
        if int(user_id) == p1_id:
            execute_query(c, '''
                UPDATE LiveDuels 
                SET player1_progress = ?, player1_errors = ?, player1_state = ?, updated_at = ?
                WHERE id = ?
            ''', (progress, errors, state, now_str, duel_id))
            p1_state = state
            p2_state = duel_d.get('player2_state')
        elif int(user_id) == p2_id:
            execute_query(c, '''
                UPDATE LiveDuels 
                SET player2_progress = ?, player2_errors = ?, player2_state = ?, updated_at = ?
                WHERE id = ?
            ''', (progress, errors, state, now_str, duel_id))
            p1_state = duel_d.get('player1_state')
            p2_state = state
        else:
            conn.close()
            return jsonify({"error": "user not participant in this duel"}), 403

        # Recalculate winner if not set
        winner_id = current_winner
        if winner_id is None:
            if state == 'solved':
                winner_id = int(user_id)
                execute_query(c, 'UPDATE LiveDuels SET winner_id = ? WHERE id = ?', (winner_id, duel_id))
            elif p1_state in ('solved', 'dead') and p2_state in ('solved', 'dead'):
                execute_query(c, 'SELECT * FROM LiveDuels WHERE id = ?', (duel_id,))
                fresh_d = row_to_dict(c.fetchone(), c)
                p1_prog = fresh_d.get('player1_progress', 0)
                p2_prog = fresh_d.get('player2_progress', 0)
                p1_err = fresh_d.get('player1_errors', 0)
                p2_err = fresh_d.get('player2_errors', 0)
                
                if p1_prog > p2_prog:
                    winner_id = p1_id
                elif p2_prog > p1_prog:
                    winner_id = p2_id
                else:
                    if p1_err < p2_err:
                        winner_id = p1_id
                    elif p2_err < p1_err:
                        winner_id = p2_id
                    else:
                        winner_id = -1

                execute_query(c, 'UPDATE LiveDuels SET winner_id = ? WHERE id = ?', (winner_id, duel_id))

        conn.commit()
        conn.close()
        return jsonify({"status": "updated", "winner_id": winner_id})
    except Exception as e:
        try:
            conn.rollback()
        except:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/duel/leaderboard', methods=['GET'])
def duel_leaderboard():
    code = (request.args.get('code') or '').strip().upper()
    if not code:
        return jsonify({"error": "code required"}), 400

    limit_raw = request.args.get('limit', 10)
    try:
        limit = int(limit_raw)
    except Exception:
        limit = 10
    limit = max(1, min(limit, 50))

    conn = get_db_connection()
    c = get_cursor(conn)

    try:
        execute_query(c, '''
            SELECT Users.username, DuelRuns.score, DuelRuns.time_seconds, DuelRuns.is_win, DuelRuns.submitted_at
            FROM DuelRuns
            JOIN Users ON DuelRuns.user_id = Users.id
            WHERE DuelRuns.code = ?
            ORDER BY DuelRuns.score DESC, DuelRuns.time_seconds ASC
            LIMIT ?
        ''', (code, limit))

        res = c.fetchall()
        rows = []

        for r in res:
            row_d = row_to_dict(r, c)
            rows.append({
                "username": row_d.get('username'),
                "score": row_d.get('score'),
                "time_seconds": row_d.get('time_seconds'),
                "is_win": row_d.get('is_win'),
                "submitted_at": row_d.get('submitted_at'),
            })

        conn.close()
        return jsonify({"rows": rows})
    except Exception as e:
        conn.close()
        return jsonify({"rows": [], "error": str(e)}), 200


@app.route('/api/admin/words', methods=['GET', 'POST'])
def admin_words():
    unauthorized = require_admin()
    if unauthorized:
        return unauthorized

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
        
        execute_query(c, query, params)
        rows = c.fetchall()
        conn.close()
        
        res_list = []
        for r in rows:
            row_d = row_to_dict(r, c)
            res_list.append({
                "id": row_d.get("id"),
                "word": row_d.get("word"),
                "hint": row_d.get("hint") or row_d.get("clue"),
                "category": row_d.get("category"),
                "difficulty": row_d.get("difficulty"),
                "description": row_d.get("description")
            })
        return jsonify(res_list)
        
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
        except DB_INTEGRITY_ERRORS:
            conn.close()
            return jsonify({"error": "Word already exists"}), 400

@app.route('/api/admin/words/<int:word_id>', methods=['DELETE', 'PUT'])
def admin_word_detail(word_id):
    unauthorized = require_admin()
    if unauthorized:
        return unauthorized

    conn = get_db_connection()
    c = get_cursor(conn)
    
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
    Requires header 'X-Admin-Reset-Key' matching the ADMIN_KEY environment variable.
    """
    unauthorized = require_admin()
    if unauthorized:
        return unauthorized

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
    unauthorized = require_admin()
    if unauthorized:
        return unauthorized

    conn = get_db_connection()
    c = get_cursor(conn)
    execute_query(c, '''
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

# ==========================================================
# PLAY WITH FRIENDS (Multi-Round Synchronized Duel Engine)
# ==========================================================

import string

def _generate_room_code(length=6):
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choice(chars) for _ in range(length))

@app.route('/api/friend_duel/create', methods=['POST'])
def friend_duel_create():
    data = request.json or {}
    user_id = data.get('user_id')
    category = data.get('category', 'RANDOM')
    difficulty = data.get('difficulty', 'MEDIUM')

    if not user_id:
        return jsonify({"error": "user_id required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)
    now_str = datetime.utcnow().isoformat()

    try:
        # Generate unique 6-character room code
        code = _generate_room_code()
        for _ in range(5):
            execute_query(c, 'SELECT code FROM FriendRooms WHERE code = ?', (code,))
            if not c.fetchone():
                break
            code = _generate_room_code()

        # Pick random word
        query = 'SELECT word, hint, category, difficulty FROM Words'
        params = []
        if category and category != 'RANDOM':
            query += ' WHERE category = ?'
            params.append(category)
            if difficulty and difficulty != 'RANDOM':
                query += ' AND difficulty = ?'
                params.append(difficulty)
        execute_query(c, query, params)
        all_words = c.fetchall()

        if not all_words:
            execute_query(c, 'SELECT word, hint, category, difficulty FROM Words')
            all_words = c.fetchall()

        chosen = random.choice(all_words) if all_words else None
        word = row_to_dict(chosen, c).get('word') if chosen else "FRIENDSHIP"
        clue = row_to_dict(chosen, c).get('hint') if chosen else "A bond between players"

        # Create room
        execute_query(c, '''
            INSERT INTO FriendRooms (code, host_user_id, guest_user_id, round_number, current_word, current_clue, category, difficulty, status, created_at, updated_at)
            VALUES (?, ?, NULL, 1, ?, ?, ?, ?, 'waiting', ?, ?)
        ''', (code, user_id, word, clue, category, difficulty, now_str, now_str))

        # Add Host player
        execute_query(c, '''
            INSERT INTO FriendRoomPlayers (room_code, user_id, score, mistakes, wins, losses, round_progress, round_status, last_seen)
            VALUES (?, ?, 0, 0, 0, 0, 0, 'playing', ?)
        ''', (code, user_id, now_str))

        conn.commit()
        conn.close()

        return jsonify({
            "code": code,
            "word": word,
            "clue": clue,
            "round_number": 1,
            "status": "waiting",
            "category": category,
            "difficulty": difficulty
        })
    except Exception as e:
        try:
            conn.rollback()
        except:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/friend_duel/join', methods=['POST'])
def friend_duel_join():
    data = request.json or {}
    code = (data.get('code') or '').strip().upper()
    user_id = data.get('user_id')

    if not code or not user_id:
        return jsonify({"error": "code and user_id required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)
    now_str = datetime.utcnow().isoformat()

    try:
        execute_query(c, 'SELECT * FROM FriendRooms WHERE code = ?', (code,))
        room = c.fetchone()
        if not room:
            conn.close()
            return jsonify({"error": "Room code not found"}), 404

        room_d = row_to_dict(room, c)
        if room_d.get('status') == 'ended':
            conn.close()
            return jsonify({"error": "Room session has ended"}), 400

        host_id = room_d.get('host_user_id')
        guest_id = room_d.get('guest_user_id')

        # If joining user is not host, update guest_user_id and status to active
        if str(user_id) != str(host_id):
            execute_query(c, '''
                UPDATE FriendRooms SET guest_user_id = ?, status = 'active', updated_at = ? WHERE code = ?
            ''', (user_id, now_str, code))
        else:
            execute_query(c, 'UPDATE FriendRooms SET updated_at = ? WHERE code = ?', (now_str, code))

        # Add or update Guest player in FriendRoomPlayers
        execute_query(c, 'SELECT * FROM FriendRoomPlayers WHERE room_code = ? AND user_id = ?', (code, user_id))
        existing_p = c.fetchone()
        if not existing_p:
            execute_query(c, '''
                INSERT INTO FriendRoomPlayers (room_code, user_id, score, mistakes, wins, losses, round_progress, round_status, last_seen)
                VALUES (?, ?, 0, 0, 0, 0, 0, 'playing', ?)
            ''', (code, user_id, now_str))
        else:
            execute_query(c, 'UPDATE FriendRoomPlayers SET last_seen = ? WHERE room_code = ? AND user_id = ?', (now_str, code, user_id))

        conn.commit()
        conn.close()

        return jsonify({
            "code": code,
            "word": room_d.get('current_word'),
            "clue": room_d.get('current_clue'),
            "round_number": room_d.get('round_number'),
            "status": "active",
            "category": room_d.get('category'),
            "difficulty": room_d.get('difficulty')
        })
    except Exception as e:
        try:
            conn.rollback()
        except:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/friend_duel/status', methods=['GET'])
def friend_duel_status():
    code = (request.args.get('code') or '').strip().upper()
    user_id = request.args.get('user_id')

    if not code:
        return jsonify({"error": "code required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)
    now_str = datetime.utcnow().isoformat()

    try:
        execute_query(c, 'SELECT * FROM FriendRooms WHERE code = ?', (code,))
        room = c.fetchone()
        if not room:
            conn.close()
            return jsonify({"error": "Room code not found"}), 404

        room_d = row_to_dict(room, c)

        # Update last seen for player
        if user_id:
            execute_query(c, 'UPDATE FriendRoomPlayers SET last_seen = ? WHERE room_code = ? AND user_id = ?', (now_str, code, user_id))
            conn.commit()

        # Fetch room players leaderboard (LEFT JOIN so offline/non-db users display cleanly)
        execute_query(c, '''
            SELECT FriendRoomPlayers.*, Users.username
            FROM FriendRoomPlayers
            LEFT JOIN Users ON FriendRoomPlayers.user_id = Users.id
            WHERE FriendRoomPlayers.room_code = ?
            ORDER BY FriendRoomPlayers.score DESC, FriendRoomPlayers.wins DESC
        ''', (code,))
        players_raw = c.fetchall()
        conn.close()

        players = []
        host_id = room_d.get('host_user_id')
        for p in players_raw:
            p_d = row_to_dict(p, c)
            u_id = p_d.get('user_id')
            uname = p_d.get('username') or f"Agent_{str(u_id)[:8]}"
            players.append({
                "user_id": u_id,
                "username": uname,
                "is_host": str(u_id) == str(host_id) if host_id else False,
                "score": p_d.get('score', 0),
                "mistakes": p_d.get('mistakes', 0),
                "wins": p_d.get('wins', 0),
                "losses": p_d.get('losses', 0),
                "round_progress": p_d.get('round_progress', 0),
                "round_status": p_d.get('round_status', 'playing')
            })

        return jsonify({
            "code": code,
            "round_number": room_d.get('round_number', 1),
            "current_word": room_d.get('current_word'),
            "current_clue": room_d.get('current_clue'),
            "category": room_d.get('category'),
            "difficulty": room_d.get('difficulty'),
            "status": room_d.get('status'),
            "players": players
        })
    except Exception as e:
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/friend_duel/action', methods=['POST'])
def friend_duel_action():
    data = request.json or {}
    code = (data.get('code') or '').strip().upper()
    user_id = data.get('user_id')
    mistakes = data.get('mistakes', 0)
    score_delta = data.get('score_delta', 0)
    round_status = data.get('round_status', 'playing')
    round_progress = data.get('round_progress', 0)

    if not code or not user_id:
        return jsonify({"error": "code and user_id required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)
    now_str = datetime.utcnow().isoformat()

    try:
        execute_query(c, 'SELECT * FROM FriendRoomPlayers WHERE room_code = ? AND user_id = ?', (code, user_id))
        row = c.fetchone()
        if not row:
            conn.close()
            return jsonify({"error": "Player not in room"}), 404

        row_d = row_to_dict(row, c)
        old_score = row_d.get('score', 0)
        old_wins = row_d.get('wins', 0)
        old_losses = row_d.get('losses', 0)
        prev_round_status = row_d.get('round_status', 'playing')

        new_wins = old_wins + 1 if (round_status == 'won' and prev_round_status != 'won') else old_wins
        new_losses = old_losses + 1 if (round_status == 'lost' and prev_round_status != 'lost') else old_losses
        new_score = max(0, old_score + int(score_delta or 0))

        execute_query(c, '''
            UPDATE FriendRoomPlayers
            SET score = ?, mistakes = ?, wins = ?, losses = ?, round_progress = ?, round_status = ?, last_seen = ?
            WHERE room_code = ? AND user_id = ?
        ''', (new_score, mistakes, new_wins, new_losses, round_progress, round_status, now_str, code, user_id))

        execute_query(c, 'SELECT highest_score, total_wins, total_losses FROM Users WHERE id = ?', (user_id,))
        user_row = c.fetchone()
        if user_row:
            user_d = row_to_dict(user_row, c)
            user_high = user_d.get('highest_score') or 0
            user_wins = user_d.get('total_wins') or 0
            user_losses = user_d.get('total_losses') or 0
            if round_status == 'won' and prev_round_status != 'won':
                user_wins += 1
            if round_status == 'lost' and prev_round_status != 'lost':
                user_losses += 1
            if new_score > user_high:
                user_high = new_score
            execute_query(c, '''
                UPDATE Users
                SET highest_score = ?, total_wins = ?, total_losses = ?
                WHERE id = ?
            ''', (user_high, user_wins, user_losses, user_id))

        conn.commit()
        conn.close()

        return jsonify({"status": "updated", "score": new_score, "wins": new_wins, "losses": new_losses})
    except Exception as e:
        try:
            conn.rollback()
        except:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/friend_duel/next_round', methods=['POST'])
def friend_duel_next_round():
    data = request.json or {}
    code = (data.get('code') or '').strip().upper()
    user_id = data.get('user_id')

    if not code or not user_id:
        return jsonify({"error": "code and user_id required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)
    now_str = datetime.utcnow().isoformat()

    try:
        execute_query(c, 'SELECT * FROM FriendRooms WHERE code = ?', (code,))
        room = c.fetchone()
        if not room:
            conn.close()
            return jsonify({"error": "Room code not found"}), 404

        room_d = row_to_dict(room, c)
        current_round = room_d.get('round_number', 1)
        next_round = current_round + 1
        category = room_d.get('category', 'RANDOM')
        difficulty = room_d.get('difficulty', 'MEDIUM')

        # Select new random word
        query = 'SELECT word, hint FROM Words'
        params = []
        if category and category != 'RANDOM':
            query += ' WHERE category = ?'
            params.append(category)
            if difficulty and difficulty != 'RANDOM':
                query += ' AND difficulty = ?'
                params.append(difficulty)

        execute_query(c, query, params)
        all_words = c.fetchall()

        if not all_words:
            execute_query(c, 'SELECT word, hint FROM Words')
            all_words = c.fetchall()

        chosen = random.choice(all_words) if all_words else None
        word = row_to_dict(chosen, c).get('word') if chosen else "NEXTROUND"
        clue = row_to_dict(chosen, c).get('hint') if chosen else "Advancing to next level"

        # Update room
        execute_query(c, '''
            UPDATE FriendRooms
            SET round_number = ?, current_word = ?, current_clue = ?, updated_at = ?
            WHERE code = ?
        ''', (next_round, word, clue, now_str, code))

        # Reset round status & mistakes for all players in room
        execute_query(c, '''
            UPDATE FriendRoomPlayers
            SET mistakes = 0, round_progress = 0, round_status = 'playing', last_seen = ?
            WHERE room_code = ?
        ''', (now_str, code))

        conn.commit()
        conn.close()

        return jsonify({
            "code": code,
            "word": word,
            "clue": clue,
            "round_number": next_round,
            "status": "active"
        })
    except Exception as e:
        try:
            conn.rollback()
        except:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/friend_duel/exit', methods=['POST'])
def friend_duel_exit():
    data = request.json or {}
    code = (data.get('code') or '').strip().upper()

    if not code:
        return jsonify({"error": "code required"}), 400

    conn = get_db_connection()
    c = get_cursor(conn)
    now_str = datetime.utcnow().isoformat()

    try:
        execute_query(c, 'UPDATE FriendRooms SET status = \'ended\', updated_at = ? WHERE code = ?', (now_str, code))
        conn.commit()
        conn.close()
        return jsonify({"status": "ended", "message": "Room session terminated."})
    except Exception as e:
        try:
            conn.rollback()
        except:
            pass
        conn.close()
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/reset_users', methods=['POST', 'GET'])
def admin_reset_users():
    """Admin endpoint to wipe user data, optionally preserving one user."""
    keep_username = request.args.get('keep_username', 'NAVIS').strip()
    
    conn = get_db_connection()
    c = get_cursor(conn)
    
    keep_user_id = None
    if keep_username and keep_username.lower() not in ('none', 'all', 'null', 'false'):
        try:
            execute_query(c, "SELECT id FROM Users WHERE LOWER(username) = LOWER(?)", (keep_username,))
            row = c.fetchone()
            if row:
                keep_user_id = row_to_dict(row, c).get('id') if isinstance(row, dict) else row[0]
        except Exception as e:
            print(f"DATABASE WARNING: could not retrieve user to keep: {e}")

    if keep_user_id is not None:
        # Preserve only this user and delete everyone else
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
                execute_query(c, f"DELETE FROM {table} WHERE {col} != ?", (keep_user_id,))
            except Exception as e:
                print(f"DATABASE WARNING: failed to clean table {table}: {e}")
                
        # Wipe other tables entirely as they contain ephemeral match/duel data
        other_tables = ['LiveDuels', 'FriendRooms']
        for table in other_tables:
            try:
                execute_query(c, f"DELETE FROM {table}")
            except Exception:
                pass
                
        # Finally delete other users from Users table
        try:
            execute_query(c, "DELETE FROM Users WHERE id != ?", (keep_user_id,))
        except Exception as e:
            print(f"DATABASE WARNING: failed to delete other users: {e}")
            
        message = f"Cleared all users and their progress/scores, except for user '{keep_username}' (ID: {keep_user_id})."
    else:
        # If no user is being preserved, wipe everything completely
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
                execute_query(c, f"DELETE FROM {table}")
            except Exception:
                pass
        try:
            execute_query(c, "DELETE FROM sqlite_sequence WHERE name IN ('Users', 'Achievements', 'UserWordProgress', 'MissionRuns', 'DuelInvites', 'DomainScores', 'DuelRuns')")
        except Exception:
            pass
        message = "All user data wiped successfully. Database is clean from scratch."

    conn.commit()
    conn.close()
    return jsonify({"status": "success", "message": message}), 200


if __name__ == '__main__':
    print("Agent Protocol Initialization Complete. Servicing APIs.")
    port = int(os.environ.get('PORT', 5005))
    app.run(host='0.0.0.0', port=port)

