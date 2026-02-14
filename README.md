# SKY-SPY-Aware

**Live Drone Detection Dashboard** for the [OUI-SPY](https://github.com/colonelpanichacks/oui-spy-unified-blue) Sky Spy mode.

SKY-SPY-Aware is a real-time web-based map interface that visualizes drone detections from an ESP32-S3 running Sky Spy firmware. It plots drone positions, pilot positions, and connecting lines on an interactive OpenLayers map — like FlightAware's SkyAware, but for drones detected via Open Drone ID (ASTM F3411).

## Features

- **Live drone tracking** — Plots drone and pilot positions on an interactive map in real-time
- **Drone-to-pilot lines** — Dashed teal lines connect each drone to its operator's reported position
- **Altitude coloring** — Drone icons shift from green (ground) to yellow (50m) to orange (150m) to red (400m)
- **Quadcopter icons** — Custom SVG drone markers and pilot location pins
- **Multiple base maps** — OpenStreetMap, ESRI Satellite, ESRI Street, CARTO Dark/Light
- **Session logging** — Automatically saves serial data to timestamped log files for later replay
- **Replay mode** — Replay saved detection logs with realistic timing or instant load
- **Auto-detection** — Finds the ESP32 serial port automatically (CP210x/CH340/JTAG)
- **Detail panel** — Shows Remote ID, MAC address, RSSI, altitude, pilot distance, message count
- **Auto-centering** — Map centers on the first detected drone automatically

## Architecture

```
ESP32-S3 (Sky Spy)  --serial-->  server.py  --HTTP JSON-->  Browser
                                    |
                                    +-- Serves static web files (public_html/)
                                    +-- GET /data/receiver.json  (config)
                                    +-- GET /data/aircraft.json  (drone + pilot data)
```

The Python server reads Sky Spy's JSON detection output from the ESP32 serial port, maintains an in-memory state of active drones, and serves both a JSON API and the web dashboard on a single HTTP port.

## Requirements

- **Python 3.7+**
- **pyserial** (`pip install pyserial`)
- An ESP32-S3 running [OUI-SPY](https://github.com/colonelpanichacks/oui-spy-unified-blue) in Sky Spy mode (Mode 5), or a saved detection log file

## Installation

```bash
git clone https://github.com/suteny0r/SKY-SPY-Aware.git
cd SKY-SPY-Aware
pip install -r requirements.txt
```

## Usage

### Live Mode (ESP32 connected via USB)

```bash
# Auto-detect serial port
python server.py

# Specify port manually
python server.py --port COM5          # Windows
python server.py --port /dev/ttyUSB0  # Linux
python server.py --port /dev/tty.usbserial-*  # macOS
```

Then open **http://localhost:8888** in your browser.

Serial data is automatically logged to `logs/skyspy_YYYYMMDD_HHMMSS.txt` for later replay. Use `--no-log` to disable.

### Replay Mode (from saved log file)

```bash
# Timed replay (simulates real-time pacing)
python server.py --replay logs/skyspy_20260213_173500.txt

# Instant replay (loads all detections immediately)
python server.py --replay logs/skyspy_20260213_173500.txt --fast
```

### All Options

| Flag | Description |
|------|-------------|
| `--port PORT` | Serial port (e.g., COM5, /dev/ttyUSB0) |
| `--baud RATE` | Serial baud rate (default: 115200) |
| `--replay FILE` | Replay a saved serial log file |
| `--fast` | Instant replay, no timing delays |
| `--http-port PORT` | HTTP server port (default: 8888) |
| `--no-log` | Disable automatic serial logging |

## Sky Spy JSON Format

SKY-SPY-Aware expects JSON lines from Sky Spy in this format:

```json
{
  "mac": "8c:1e:d9:c8:c9:f7",
  "rssi": -81,
  "drone_lat": 25.784279,
  "drone_long": -80.149010,
  "drone_altitude": 118,
  "pilot_lat": 25.767196,
  "pilot_long": -80.137115,
  "basic_id": "1581F8LQC255L00227P5"
}
```

These are FAA Remote ID / Open Drone ID (ASTM F3411) broadcasts captured by the ESP32-S3 in WiFi promiscuous mode.

## Dashboard Controls

| Control | Action |
|---------|--------|
| Click drone on map | Select drone, show detail panel |
| Double-click drone | Select and follow drone |
| Click table row | Select drone |
| Reset Map | Return to default view |
| Show All Tracks | Display trail history for all drones |
| Hide All Tracks | Clear all trail history |
| Settings cog | Toggle overlay and display options |

## Table Columns

| Column | Description |
|--------|-------------|
| MAC | Last 3 bytes of drone's WiFi MAC address |
| Remote ID | FAA Remote ID / Basic ID string |
| Alt (m) | Drone altitude in meters (from Open Drone ID) |
| RSSI | Signal strength in dBm |
| Age | Seconds since last detection |
| Lat / Lon | Drone GPS coordinates |
| Type | Detection source type |

## Project Structure

```
SKY-SPY-Aware/
├── server.py              # Python serial bridge + HTTP server
├── requirements.txt       # Python dependencies (pyserial)
├── logs/                  # Auto-generated session logs (gitignored)
└── public_html/           # Web dashboard
    ├── index.html         # Main page
    ├── script.js          # Application logic, map, data polling
    ├── planeObject.js     # Drone/pilot data model and marker management
    ├── markers.js         # SVG icons (quadcopter, pilot pin)
    ├── config.js          # Map defaults, altitude color scale
    ├── style.css          # Dashboard styling
    ├── layers.js          # Base map layer definitions
    ├── formatter.js       # Unit conversion and formatting
    ├── dbloader.js        # Stub (no aircraft DB needed)
    ├── registrations.js   # Stub (no registration lookup)
    ├── flags.js           # Stub (no country flags)
    ├── ol/                # OpenLayers 6.3.1 + layer switcher
    └── jquery/            # jQuery 3.0.0 + jQuery UI 1.11.4
```

## How It Works

1. **Sky Spy** on the ESP32-S3 captures Open Drone ID broadcasts from nearby drones using WiFi promiscuous mode
2. **server.py** reads the JSON detection lines from serial, parses drone/pilot positions, and maintains a dict of active drones keyed by MAC address
3. Drones not seen for **60 seconds** are automatically aged out
4. The web dashboard polls `/data/aircraft.json` every second
5. Each drone gets a **quadcopter marker** colored by altitude and a paired **pilot pin marker**
6. A **dashed teal line** connects each drone to its pilot's reported position
7. All serial data is saved to timestamped log files for later replay

## Derived From

The web frontend is adapted from [dump1090-fa's SkyAware](https://github.com/flightaware/dump1090) interface, rewritten for drone detection. Aircraft-specific features (squawk codes, ADS-B/MLAT, flight databases, FAA charts) have been removed and replaced with drone-specific functionality (Remote ID, pilot positions, RSSI, drone-to-pilot distance).

## Related Projects

- [OUI-SPY Unified Blue](https://github.com/colonelpanichacks/oui-spy-unified-blue) — Multi-mode ESP32-S3 firmware including Sky Spy drone detection
- [dump1090-fa](https://github.com/flightaware/dump1090) — ADS-B aircraft tracking (original SkyAware source)

## License

MIT License. See [LICENSE](LICENSE).
