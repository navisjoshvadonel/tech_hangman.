import time
import requests
import os

# CONFIGURATION
# Set this to your Render service URL (e.g., https://your-app.onrender.com)
RENDER_URL = os.environ.get("RENDER_URL", "http://localhost:5000")
PING_INTERVAL = 600 # 10 minutes

def keep_alive():
    print(f"Starting Keep-Alive ping for: {RENDER_URL}")
    while True:
        try:
            response = requests.get(f"{RENDER_URL}/api/ping")
            if response.status_code == 200:
                print(f"[{time.strftime('%H:%M:%S')}] Ping Successful: {response.json().get('status')}")
            else:
                print(f"[{time.strftime('%H:%M:%S')}] Ping Failed with status: {response.status_code}")
        except Exception as e:
            print(f"[{time.strftime('%H:%M:%S')}] Ping Error: {e}")
            
        time.sleep(PING_INTERVAL)

if __name__ == "__main__":
    keep_alive()
