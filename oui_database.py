"""
OUI (Organizationally Unique Identifier) database for drone manufacturer lookup.

Maps the first 3 bytes of a MAC address to the manufacturer name.
Focused on drone/UAV manufacturers and WiFi chipset vendors commonly
found in consumer and commercial drones.

To add entries: OUI_DATABASE['XX:XX:XX'] = 'Manufacturer Name'
"""

OUI_DATABASE = {
    # ----- DJI Technology -----
    '60:60:1F': 'DJI',
    '8C:1E:D9': 'DJI',
    '34:D2:62': 'DJI',
    '48:1C:B9': 'DJI',
    'D8:96:E0': 'DJI',
    'C8:5D:38': 'DJI',
    'F4:B8:5E': 'DJI',
    '68:3A:1E': 'DJI',
    '54:CE:86': 'DJI',
    'E0:DB:10': 'DJI',

    # ----- Parrot SA -----
    'A0:14:3D': 'Parrot',
    '90:03:B7': 'Parrot',
    '00:12:1C': 'Parrot',
    '00:26:7E': 'Parrot',

    # ----- Autel Robotics -----
    'A8:B8:6E': 'Autel Robotics',
    '60:AB:D2': 'Autel Robotics',

    # ----- Skydio -----
    '38:B1:9E': 'Skydio',
    '78:D4:F1': 'Skydio',

    # ----- Yuneec -----
    '58:D5:0A': 'Yuneec',
    'E4:CE:02': 'Yuneec',

    # ----- EHang -----
    '14:6B:9C': 'EHang',

    # ----- Holy Stone -----
    '40:F5:20': 'Holy Stone',

    # ----- Hubsan -----
    '00:1D:D5': 'Hubsan',

    # ----- Walkera -----
    '00:1A:79': 'Walkera',

    # ----- Freefly Systems -----
    '50:1A:C5': 'Freefly',

    # ----- 3DR (3D Robotics) -----
    '30:14:4A': '3D Robotics',

    # ----- senseFly / AgEagle -----
    '00:1E:42': 'senseFly',

    # ----- Xiaomi (budget drones) -----
    '18:F0:E4': 'Xiaomi',
    '64:CE:D1': 'Xiaomi',
    '78:11:DC': 'Xiaomi',

    # ----- Espressif Systems (ESP32/ESP8266 - DIY drones, custom builds) -----
    '24:6F:28': 'Espressif',
    '30:AE:A4': 'Espressif',
    'A4:CF:12': 'Espressif',
    'AC:67:B2': 'Espressif',
    '08:3A:F2': 'Espressif',
    '24:0A:C4': 'Espressif',
    '84:CC:A8': 'Espressif',
    'EC:94:CB': 'Espressif',
    '3C:61:05': 'Espressif',
    'C4:4F:33': 'Espressif',
    '24:62:AB': 'Espressif',
    'A0:A3:B3': 'Espressif',
    'DC:54:75': 'Espressif',
    'E8:68:E7': 'Espressif',
    'C8:F0:9E': 'Espressif',

    # ----- Qualcomm / Atheros (WiFi chipsets in some drones) -----
    '00:03:7F': 'Qualcomm',
    '1C:B7:2C': 'Qualcomm',
    '48:A4:72': 'Qualcomm',
    '9C:F3:87': 'Qualcomm',

    # ----- Intel (drone platform, RealSense) -----
    '00:1E:64': 'Intel',
    '68:05:CA': 'Intel',
    'F8:16:54': 'Intel',

    # ----- Raspberry Pi Foundation (companion computers) -----
    'B8:27:EB': 'Raspberry Pi',
    'DC:A6:32': 'Raspberry Pi',
    'E4:5F:01': 'Raspberry Pi',
    '28:CD:C1': 'Raspberry Pi',
    'D8:3A:DD': 'Raspberry Pi',
}


def oui_lookup(mac_address):
    """Look up the manufacturer from a MAC address OUI prefix.

    Args:
        mac_address: MAC address string (e.g. '60:60:1F:34:D7:F0')

    Returns:
        Manufacturer name string, 'Randomized' for locally-administered
        MACs, or empty string if not found in the database.
    """
    if not mac_address:
        return ''
    # Normalize: uppercase, strip separators, take first 6 hex chars
    clean = mac_address.upper().replace(':', '').replace('-', '').replace('.', '')
    if len(clean) < 6:
        return ''
    # Check locally-administered bit (bit 1 of first octet)
    first_byte = int(clean[:2], 16)
    if first_byte & 0x02:
        return 'Randomized'
    oui = clean[:2] + ':' + clean[2:4] + ':' + clean[4:6]
    return OUI_DATABASE.get(oui, '')
