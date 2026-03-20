from flask import Flask, jsonify, render_template, request
import requests
from datetime import datetime
import json, os
import threading, time

app = Flask(__name__)

AAC_STREAM_URL = "https://kexp.streamguys1.com/kexp160.aac"

# --- Client tracking and server activity ---
connected_clients = 0
server_active = True
fetching_enabled = True  # Controls background API calls

# --- Fetch playlist with limit & offset ---
def fetch_playlist(limit=25, offset=0):
    global fetching_enabled
    if not fetching_enabled:
        return []
    try:
        url = f"https://api.kexp.org/v2/plays/?format=json&limit={limit}&offset={offset}"
        r = requests.get(url, timeout=5)
        data = r.json()
        songs = []
        for item in data.get('results', []):
            if item.get('play_type') == 'trackplay':
                release_year = item.get('release_date')[:4] if item.get('release_date') else ''
                song_obj = {
                    "track": item.get('song'),
                    "artist": item.get('artist'),
                    "album": item.get('album'),
                    "release_year": release_year,
                    "time": datetime.fromisoformat(item.get('airdate')).strftime("%I:%M:%S %p"),
                    "image": item.get('image_uri'),
                    "id": item.get('id'),
                    "uri": item.get('uri'),
                    "airdate": item.get('airdate'),
                    "song": item.get('song'),
                    "track_id": item.get('track_id'),
                    "recording_id": item.get('recording_id'),
                    "artist_ids": item.get('artist_ids'),
                    "release_id": item.get('release_id'),
                    "release_group_id": item.get('release_group_id'),
                    "release_date": item.get('release_date')
                }
                songs.append(song_obj)
        return songs
    except:
        return []


app = Flask(__name__)


@app.route("/playlist")
def playlist():
    if not server_active:
        return jsonify([])
    limit = int(request.args.get('limit', 25))
    offset = int(request.args.get('offset', 0))
    return jsonify(fetch_playlist(limit, offset))

@app.route("/current")
def current():
    if not server_active:
        return jsonify([])
    return jsonify(fetch_playlist(1))

@app.route("/stream")
def stream():
    global connected_clients
    connected_clients += 1
    update_server_status()

    def generate():
        with requests.get(AAC_STREAM_URL, stream=True) as r:
            for chunk in r.iter_content(chunk_size=1024):
                if chunk:
                    yield chunk
        global connected_clients
        connected_clients -= 1
        update_server_status()

    return app.response_class(generate(), content_type="audio/aac")

@app.route("/save_track", methods=["POST"])
def save_track():
    try:
        track = request.get_json()
        if not track:
            return jsonify({"status":"error","message":"No track data provided"}), 400

        saved_file = "saved.json"
        if os.path.exists(saved_file):
            with open(saved_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
        else:
            saved = []

        selected_fields = ["id","uri","airdate","song","track_id","recording_id","artist",
                           "artist_ids","album","release_id","release_group_id","release_date"]
        track_to_save = {k: track.get(k, None) for k in selected_fields}

        saved.append(track_to_save)

        with open(saved_file, "w", encoding="utf-8") as f:
            json.dump(saved, f, indent=2, ensure_ascii=False)

        return jsonify({"status":"ok"})
    except Exception as e:
        return jsonify({"status":"error","message":str(e)}), 500

# --- Update server active/inactive status ---
def update_server_status():
    global server_active, fetching_enabled
    if connected_clients == 0:
        server_active = False
        fetching_enabled = False
    else:
        server_active = True
        fetching_enabled = True

# Monitor clients periodically
def monitor_clients():
    while True:
        update_server_status()
        time.sleep(5)

threading.Thread(target=monitor_clients, daemon=True).start()

@app.route("/")
def index():
    return render_template("index.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True, threaded=True)