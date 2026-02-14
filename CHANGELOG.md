# Changelog

## v1.0.0 — 2026-02-13

Initial release.

### Features

- Python serial bridge server with auto-detection of ESP32 serial ports
- Real-time web dashboard with OpenLayers map
- Drone markers (quadcopter SVG icons) with altitude-based coloring
- Pilot markers (location pin icons) with drone-to-pilot connecting lines
- Replay mode for saved serial logs (`--replay` with optional `--fast`)
- Automatic session logging to timestamped files in `logs/`
- Detail panel showing Remote ID, MAC, RSSI, altitude, pilot position/distance
- Multiple base map layers (OSM, ESRI Satellite/Street, CARTO Dark/Light)
- Auto-centering map on first detected drone
- Stale drone removal (60s server-side, 120s client-side)
- Table view with sortable columns (MAC, Remote ID, Alt, RSSI, Age, Lat, Lon, Type)
