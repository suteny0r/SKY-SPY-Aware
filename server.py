#!/usr/bin/env python3
"""
SKY-SPY-Aware Server
Serial bridge + HTTP server for live drone detection visualization.

Reads Sky Spy drone detection JSON from ESP32 serial output and serves
SkyAware-compatible aircraft.json for the web dashboard.

Usage:
    python server.py                          # Auto-detect ESP32 serial port
    python server.py --port COM5              # Specify serial port
    python server.py --replay logfile.txt     # Replay a saved serial log
    python server.py --replay logfile.txt --fast  # Instant replay
"""

import argparse
import collections
import datetime
import hashlib
import json
import os
import sys
import threading
import time
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

try:
    import serial
    import serial.tools.list_ports
except ImportError:
    serial = None

from oui_database import oui_lookup

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
HTTP_PORT = 8888
SERIAL_BAUD = 115200
DRONE_TIMEOUT_S = 60          # Remove drones not seen for this many seconds
REPLAY_LINE_DELAY = 0.1       # Seconds between lines in replay mode
REPLAY_BURST_PAUSE = 2.0      # Pause between detection bursts

# ---------------------------------------------------------------------------
# Global state
# ---------------------------------------------------------------------------
drones = {}          # keyed by basic_id (Remote ID) or MAC fallback
drones_lock = threading.Lock()
activity_lines = collections.deque(maxlen=200)  # recent raw serial lines with seq
activity_seq = 0        # monotonic sequence counter
activity_lock = threading.Lock()
active_reader = None    # reference to SerialReader for restart
start_time = time.time()
server_start = time.time()

# ---------------------------------------------------------------------------
# Serial auto-detection
# ---------------------------------------------------------------------------
def serial_autodetect():
    """Scan COM ports for ESP32/CP210x/CH340 USB descriptors."""
    if serial is None:
        return None
    ports = serial.tools.list_ports.comports()
    keywords = ['cp210', 'ch340', 'esp32', 'usb serial', 'silicon labs',
                'usb-serial', 'jtag', 'uart']
    for port in ports:
        desc = (port.description or '').lower()
        hwid = (port.hwid or '').lower()
        combined = desc + ' ' + hwid
        if any(kw in combined for kw in keywords):
            return port.device
    # Fallback: return first port if only one exists
    if len(ports) == 1:
        return ports[0].device
    return None


# ---------------------------------------------------------------------------
# Drone data processing
# ---------------------------------------------------------------------------
def parse_drone_json(line):
    """Parse a Sky Spy JSON detection line. Returns dict or None."""
    line = line.strip()
    if not line.startswith('{"mac"'):
        return None
    try:
        data = json.loads(line)
        if 'mac' in data and 'drone_lat' in data:
            return data
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def get_drone_key(data):
    """Get the unique key for a drone — basic_id (Remote ID) or MAC fallback."""
    basic_id = data.get('basic_id', '').strip()
    if basic_id:
        return basic_id
    return data.get('mac', 'unknown')


def update_drone(data):
    """Update the in-memory drone dict with a new detection."""
    key = get_drone_key(data)
    mac = data.get('mac', '')
    now = time.time()
    new_lat = data.get('drone_lat', 0.0)
    new_lon = data.get('drone_long', 0.0)
    with drones_lock:
        if key not in drones:
            drones[key] = {'_mac_pos': {}}
        d = drones[key]
        d['key'] = key
        d['mac'] = mac
        d['rssi'] = data.get('rssi', 0)

        # Only update position when this MAC reports a CHANGED position.
        # The spoofer transmits on two MACs (AP beacon + NAN frames).
        # The AP beacon vendor IE can carry stale/frozen position data
        # while NAN frames carry the correct live position.  Without
        # this check the stale AP beacon data (which fires ~10x more
        # often) overwrites the fresh NAN position every cycle.
        mac_pos = d.get('_mac_pos', {})
        prev = mac_pos.get(mac)
        if prev is None or prev[0] != new_lat or prev[1] != new_lon:
            d['drone_lat'] = new_lat
            d['drone_long'] = new_lon
            mac_pos[mac] = (new_lat, new_lon)
            d['_mac_pos'] = mac_pos

        d['drone_altitude'] = data.get('drone_altitude', 0)
        d['pilot_lat'] = data.get('pilot_lat', 0.0)
        d['pilot_long'] = data.get('pilot_long', 0.0)
        d['basic_id'] = data.get('basic_id', '')
        d['last_seen'] = now
        d['detections'] = d.get('detections', 0) + 1


def age_drones():
    """Remove drones not seen for DRONE_TIMEOUT_S seconds."""
    now = time.time()
    with drones_lock:
        stale = [key for key, d in drones.items()
                 if now - d.get('last_seen', 0) > DRONE_TIMEOUT_S]
        for key in stale:
            del drones[key]


def mac_to_hex(mac_str):
    """Convert MAC address to 6-char hex ID (last 3 bytes)."""
    parts = mac_str.split(':')
    if len(parts) >= 6:
        return ''.join(parts[-3:]).upper()
    return mac_str.replace(':', '').upper()[-6:]


def drone_key_to_hex(key):
    """Convert a drone key (basic_id or MAC) to a 6-char hex display ID."""
    # If it looks like a MAC address, use last 3 bytes
    if ':' in key and len(key.split(':')) >= 6:
        return mac_to_hex(key)
    # Otherwise, hash the key to a stable 6-char hex ID
    return hashlib.md5(key.encode()).hexdigest()[:6].upper()


def build_aircraft_json():
    """Build SkyAware-compatible aircraft.json from drone state."""
    now = time.time()
    age_drones()

    aircraft = []
    total_messages = 0
    # Track pilot positions to avoid duplicate pilot markers for swarms
    seen_pilots = set()

    with drones_lock:
        for key, d in drones.items():
            hex_id = drone_key_to_hex(key)
            seen = now - d.get('last_seen', now)
            total_messages += d.get('detections', 0)

            # Drone entry
            drone_alt_m = d.get('drone_altitude', 0)
            drone_alt_ft = drone_alt_m * 3.28084

            drone_entry = {
                'hex': hex_id,
                'type': 'drone',
                'flight': d.get('basic_id', '') or hex_id,
                'alt_baro': drone_alt_ft,
                'alt_geom': drone_alt_ft,
                'lat': d.get('drone_lat', 0.0),
                'lon': d.get('drone_long', 0.0),
                'rssi': d.get('rssi', 0),
                'seen': round(seen, 1),
                'seen_pos': round(seen, 1),
                'messages': d.get('detections', 1),
                'mac': d.get('mac', ''),
                'manufacturer': oui_lookup(d.get('mac', '')),
                'altitude_m': drone_alt_m,
                'pilot_lat': d.get('pilot_lat', 0.0),
                'pilot_long': d.get('pilot_long', 0.0),
            }
            aircraft.append(drone_entry)

            # Pilot entry (only if pilot position is non-zero)
            # Deduplicate: swarm drones often share the same pilot position
            pilot_lat = d.get('pilot_lat', 0.0)
            pilot_lon = d.get('pilot_long', 0.0)
            if pilot_lat != 0.0 or pilot_lon != 0.0:
                pilot_key = (round(pilot_lat, 6), round(pilot_lon, 6))
                if pilot_key not in seen_pilots:
                    seen_pilots.add(pilot_key)
                    pilot_entry = {
                        'hex': hex_id + '_P',
                        'type': 'pilot',
                        'flight': 'PILOT',
                        'alt_baro': 0,
                        'alt_geom': 0,
                        'lat': pilot_lat,
                        'lon': pilot_lon,
                        'rssi': d.get('rssi', 0),
                        'seen': round(seen, 1),
                        'seen_pos': round(seen, 1),
                        'messages': d.get('detections', 1),
                        'drone_hex': hex_id,
                    }
                    aircraft.append(pilot_entry)

    return {
        'now': now,
        'messages': total_messages,
        'aircraft': aircraft,
    }


# ---------------------------------------------------------------------------
# Serial reader thread
# ---------------------------------------------------------------------------
RECONNECT_INTERVAL = 3        # Seconds between reconnection attempts

class SerialReader(threading.Thread):
    def __init__(self, port, baud=SERIAL_BAUD, log_dir=None):
        super().__init__(daemon=True)
        self.port = port
        self.baud = baud
        self.log_dir = log_dir
        self.ser = None
        self.log_file = None

    def restart_device(self):
        """Toggle DTR to reset the ESP32 via auto-reset circuit."""
        if self.ser is None or not self.ser.is_open:
            return False
        try:
            print("[SERIAL] Restarting sensor (DTR toggle)...")
            self.ser.setDTR(False)
            time.sleep(0.1)
            self.ser.setDTR(True)
            # Clear stale drone data so the map starts fresh
            with drones_lock:
                drones.clear()
            # Clear activity buffer so boot messages start from clean slate
            global activity_seq
            with activity_lock:
                activity_lines.clear()
                activity_seq = 0
            # Rotate log file — close current, open new one
            if self.log_dir:
                if self.log_file:
                    self.log_file.close()
                    self.log_file = None
                self.log_file = self._open_log()
            return True
        except Exception as e:
            print(f"[SERIAL] Restart failed: {e}")
            return False

    def _open_log(self):
        """Create a timestamped log file for this session."""
        if self.log_dir is None:
            return None
        os.makedirs(self.log_dir, exist_ok=True)
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        log_path = os.path.join(self.log_dir, f'skyspy_{timestamp}.txt')
        print(f"[LOG] Recording serial data to {log_path}")
        return open(log_path, 'w', encoding='utf-8')

    def _close_port(self):
        """Safely close the serial port."""
        if self.ser:
            try:
                self.ser.close()
            except Exception:
                pass
            self.ser = None

    def _connect(self):
        """Open the serial port. Returns True on success."""
        try:
            self.ser = serial.Serial(self.port, self.baud, timeout=1)
            print(f"[SERIAL] Connected to {self.port}")
            return True
        except serial.SerialException as e:
            print(f"[SERIAL] Cannot open {self.port}: {e}")
            self.ser = None
            return False

    def run(self):
        if serial is None:
            print("[ERROR] pyserial not installed. Run: pip install pyserial")
            return

        # Outer loop: handles reconnection after USB unplug/replug
        while True:
            # Connect (or reconnect)
            print(f"[SERIAL] Opening {self.port} at {self.baud} baud...")
            if not self._connect():
                print(f"[SERIAL] Retrying in {RECONNECT_INTERVAL}s...")
                time.sleep(RECONNECT_INTERVAL)
                continue

            # Start a new log file for each connection session
            if self.log_file:
                self.log_file.close()
            self.log_file = self._open_log()

            # Inner loop: reads lines until the port breaks
            consecutive_errors = 0
            while True:
                try:
                    line = self.ser.readline().decode('utf-8', errors='replace')
                    consecutive_errors = 0
                    if not line:
                        continue
                    # Store in activity buffer
                    stripped = line.strip()
                    if stripped:
                        global activity_seq
                        with activity_lock:
                            activity_seq += 1
                            activity_lines.append((activity_seq, stripped))
                    # Write every raw line to log
                    if self.log_file:
                        self.log_file.write(line)
                        self.log_file.flush()
                    data = parse_drone_json(line)
                    if data:
                        update_drone(data)
                        bid = data.get('basic_id', '') or mac_to_hex(data['mac'])
                        print(f"[DRONE] {bid} | "
                              f"lat={data.get('drone_lat', 0):.6f} "
                              f"lon={data.get('drone_long', 0):.6f} "
                              f"alt={data.get('drone_altitude', 0)}m "
                              f"rssi={data.get('rssi', 0)}")
                except Exception as e:
                    consecutive_errors += 1
                    if consecutive_errors >= 3:
                        # Port is dead (USB unplugged) — close and reconnect
                        print(f"[SERIAL] Port lost: {e}")
                        print(f"[SERIAL] Waiting for device to reconnect...")
                        self._close_port()
                        time.sleep(RECONNECT_INTERVAL)
                        break  # Back to outer reconnect loop
                    time.sleep(1)


# ---------------------------------------------------------------------------
# Replay reader thread
# ---------------------------------------------------------------------------
class ReplayReader(threading.Thread):
    def __init__(self, filepath, fast=False):
        super().__init__(daemon=True)
        self.filepath = filepath
        self.fast = fast

    def run(self):
        print(f"[REPLAY] Loading {self.filepath} "
              f"({'fast' if self.fast else 'timed'} mode)")
        try:
            with open(self.filepath, 'r', encoding='utf-8', errors='replace') as f:
                lines = f.readlines()
        except IOError as e:
            print(f"[ERROR] Cannot read {self.filepath}: {e}")
            return

        detection_count = 0
        lines_since_detection = 0

        for line in lines:
            stripped = line.strip()
            if stripped:
                global activity_seq
                with activity_lock:
                    activity_seq += 1
                    activity_lines.append((activity_seq, stripped))
            data = parse_drone_json(line)
            if data:
                update_drone(data)
                detection_count += 1
                bid = data.get('basic_id', '') or mac_to_hex(data['mac'])
                print(f"[REPLAY] #{detection_count} {bid} | "
                      f"lat={data.get('drone_lat', 0):.6f} "
                      f"lon={data.get('drone_long', 0):.6f} "
                      f"alt={data.get('drone_altitude', 0)}m")

                if not self.fast:
                    # Short delay between consecutive detections
                    time.sleep(REPLAY_LINE_DELAY)
                lines_since_detection = 0
            else:
                lines_since_detection += 1
                # If we see many non-detection lines, it's a gap between bursts
                if lines_since_detection > 3 and not self.fast:
                    time.sleep(REPLAY_BURST_PAUSE)
                    lines_since_detection = 0

        print(f"[REPLAY] Done. {detection_count} detections loaded from "
              f"{self.filepath}")
        print("[REPLAY] Drones will age out after 60s with no new data.")
        # Keep thread alive so drones remain visible
        while True:
            time.sleep(10)


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------
class SkySpyHandler(SimpleHTTPRequestHandler):
    """Serve static files from public_html/ and drone data API."""

    def __init__(self, *args, **kwargs):
        # Serve from public_html directory
        web_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                               'public_html')
        super().__init__(*args, directory=web_dir, **kwargs)

    def do_GET(self):
        # Strip query string for route matching
        path = self.path.split('?')[0]

        if path == '/data/receiver.json':
            self.send_json_response({
                'version': 'SKY-SPY-Aware v1.0',
                'refresh': 1000,
                'history': 0,
                'lat': 0,
                'lon': 0,
            })
        elif path == '/data/aircraft.json':
            self.send_json_response(build_aircraft_json())
        elif path == '/data/activity.json':
            # Support ?since=N to only return lines after seq N
            since = 0
            qs = self.path.split('?', 1)
            if len(qs) > 1:
                for param in qs[1].split('&'):
                    if param.startswith('since='):
                        try:
                            since = int(param[6:])
                        except ValueError:
                            pass
            with activity_lock:
                if since > 0:
                    new_lines = [(s, t) for s, t in activity_lines if s > since]
                else:
                    new_lines = list(activity_lines)
            self.send_json_response({
                'lines': [{'seq': s, 'text': t} for s, t in new_lines]
            })
        else:
            # Serve static files
            super().do_GET()

    def send_json_response(self, data):
        content = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(content))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        path = self.path.split('?')[0]

        if path == '/api/restart-sensor':
            if active_reader and hasattr(active_reader, 'restart_device'):
                ok = active_reader.restart_device()
                if ok:
                    self.send_json_response({'status': 'ok', 'message': 'Sensor restarting'})
                else:
                    self.send_json_response({'status': 'error', 'message': 'Serial port not available'})
            else:
                self.send_json_response({'status': 'error', 'message': 'No live serial connection (replay mode?)'})
        else:
            self.send_error(404)

    def log_message(self, format, *args):
        # Suppress routine GET logs, only log errors
        if '404' in str(args) or '500' in str(args):
            super().log_message(format, *args)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description='SKY-SPY-Aware: Live Drone Detection Dashboard Server')
    parser.add_argument('--port', type=str, default=None,
                        help='Serial port (e.g., COM5, /dev/ttyUSB0)')
    parser.add_argument('--baud', type=int, default=SERIAL_BAUD,
                        help=f'Serial baud rate (default: {SERIAL_BAUD})')
    parser.add_argument('--replay', type=str, default=None,
                        help='Replay a saved serial log file')
    parser.add_argument('--fast', action='store_true',
                        help='Instant replay (no timing delays)')
    parser.add_argument('--http-port', type=int, default=HTTP_PORT,
                        help=f'HTTP server port (default: {HTTP_PORT})')
    parser.add_argument('--no-log', action='store_true',
                        help='Disable automatic serial logging')
    args = parser.parse_args()

    print("=" * 60)
    print("  SKY-SPY-Aware - Live Drone Detection Dashboard")
    print("=" * 60)

    # Start data source
    if args.replay:
        replay_path = os.path.abspath(args.replay)
        if not os.path.exists(replay_path):
            print(f"[ERROR] File not found: {replay_path}")
            sys.exit(1)
        reader = ReplayReader(replay_path, fast=args.fast)
        reader.start()
    else:
        # Live serial mode
        if serial is None:
            print("[ERROR] pyserial not installed. Run: pip install pyserial")
            print("        Or use --replay mode with a log file.")
            sys.exit(1)

        port = args.port
        if port is None:
            print("[SERIAL] Auto-detecting ESP32 serial port...")
            port = serial_autodetect()
            if port is None:
                print("[ERROR] No ESP32 serial port found.")
                print("        Available ports:")
                for p in serial.tools.list_ports.comports():
                    print(f"          {p.device}: {p.description}")
                print("        Use --port to specify manually, or "
                      "--replay for log replay.")
                sys.exit(1)
            print(f"[SERIAL] Auto-detected: {port}")

        log_dir = None
        if not args.no_log:
            log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                   'logs')
        global active_reader
        reader = SerialReader(port, args.baud, log_dir=log_dir)
        active_reader = reader
        reader.start()

    # Start HTTP server
    print(f"\n[HTTP] Starting web server on http://localhost:{args.http_port}")
    print(f"[HTTP] Open http://localhost:{args.http_port} in your browser\n")

    httpd = HTTPServer(('0.0.0.0', args.http_port), SkySpyHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[SERVER] Shutting down...")
        httpd.shutdown()


if __name__ == '__main__':
    main()
