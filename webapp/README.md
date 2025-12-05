# Smart Playground Control - Web Application

A mobile-first web application for controlling smart playground modules via ESP32 hub using Web Serial/USB communication.


## Overview

This web app provides a messaging-style interface to send commands to ESP32-based playground modules. It runs entirely in the browser using PyScript (Python in browser) for backend logic and vanilla JavaScript for the UI. The app connects to an ESP32-C6 hub via USB Serial (Web Serial API), which then broadcasts commands to playground modules using ESP-NOW wireless protocol.

## Core Features

### 🔌 Hub Connection
- **USB Serial Connection**: Connect to ESP32-C6 hub using Web Serial API (Chrome/Edge)
- **Auto-reconnect Detection**: Monitors connection status and handles unexpected disconnections
- **Connection State Management**: Visual indicators for hub connection status

### 📡 Module Communication
- **Command Broadcasting**: Send game commands (Notes, Shake, Hot_cold, Jump, Clap, Rainbow, Off) to playground modules
- **ESP-NOW Protocol**: Hub relays commands via ESP-NOW for low-power wireless communication
- **Optional Device Scanning**: PING modules to discover available devices (disabled by default for command-only mode)
- **RSSI-Based Filtering**: When scanning enabled, filter modules by signal strength using proximity slider

### 💬 Message Interface
- **Chat-Style UI**: Familiar messaging interface for sending commands
- **Command Palette**: Quick-select drawer for available game commands
- **Message History**: View past commands with timestamps and module lists
- **Command Details**: Tap messages to view full command details

### 📱 Mobile-First Design
- **Touch-Optimized**: Designed for tablets and mobile devices
- **Responsive Layout**: Adapts to various screen sizes
- **Safe Area Support**: Handles device notches and navigation bars
- **PWA-Ready**: Progressive Web App manifest for install-to-homescreen

### ⚙️ Settings & Configuration
- **Device Scanning Toggle**: Enable/disable module discovery (default: off for command-only mode)
- **Module Nicknames**: Assign custom names to modules (when scanning enabled)
- **Browser Compatibility Checking**: Warns if Web Serial API not supported


## Team
Smart Playground Project at Tufts CEEO
Supported by NSF Award #2301249
Front-end/backend and Hub main.py by J. Cross
Hub utilities by C. Rogers, M. Dahal

## Architecture

### Technology Stack

```
┌─────────────────────────────────────────────────┐
│           Web Browser (Chrome/Edge)             │
├─────────────────────────────────────────────────┤
│  JavaScript Frontend (main.js + components)     │
│  - State management (store.js)                  │
│  - Component-based UI                           │
│  - Event handling                               │
├─────────────────────────────────────────────────┤
│  Python Backend (main.py via PyScript)          │
│  - Web Serial API wrapper (webSerial.py)        │
│  - Message framing & protocol                   │
│  - Connection management                        │
├─────────────────────────────────────────────────┤
│         Web Serial API (Browser)                │
└─────────────────────────────────────────────────┘
                    ↕ USB Serial
┌─────────────────────────────────────────────────┐
│        ESP32-C6 Hub (new_simple_hub)            │
│  - USB Serial to ESP-NOW bridge                 │
│  - Command relay                                │
│  - Optional module discovery                    │
└─────────────────────────────────────────────────┘
                    ↕ ESP-NOW
┌─────────────────────────────────────────────────┐
│         Playground Modules (ESP32-C3)           │
│  - Game execution                               │
│  - Sensor responses                             │
│  - Status reporting                             │
└─────────────────────────────────────────────────┘
```

### Frontend Architecture (JavaScript)

**Component-Based Structure:**
```
js/
├── main.js                    # Main app controller & initialization
├── state/
│   └── store.js              # Centralized state management
├── utils/
│   ├── pyBridge.js           # Python-JS communication bridge
│   ├── helpers.js            # Utility functions
│   └── constants.js          # App constants
└── components/
    ├── recipientBar.js       # Top bar with hub connection & range
    ├── messageHistory.js     # Chat-style message display
    ├── messageInput.js       # Command input with palette
    ├── deviceListOverlay.js  # Module discovery overlay
    ├── settingsOverlay.js    # Settings panel
    └── [other UI components]
```

**State Management:**
- Reactive state updates using observer pattern
- Batched rendering with `requestAnimationFrame`
- Computed values for derived state (device filtering, RSSI calculations)
- Component registration for automatic re-rendering on state changes

### Backend Architecture (Python)

**PyScript Backend (`main.py`):**
- Runs Python in the browser using PyScript/Pyodide
- Handles all USB Serial communication via Web Serial API
- Message framing protocol for reliable data transmission
- JSON-based command/response format
- Direct function exposure to JavaScript via window object

**Key Functions:**
```python
connect_hub_serial()          # Connect to hub via USB Serial
disconnect_hub_serial()       # Disconnect from hub
send_command_to_hub(cmd, rssi) # Send command to modules
refresh_devices_from_hub(rssi) # PING modules (optional)
get_connection_status()       # Check connection state
```

**Message Framing Protocol:**
```
Format: MSG:<length>|<payload>
Example: MSG:330|{"type":"devices","list":[...]}

States:
1. waiting_header: Look for "MSG:<length>|"
2. receiving_payload: Accumulate <length> bytes
3. Process complete JSON message
```

### Communication Flow

**Command Transmission:**
```
1. User selects command in UI
2. JavaScript calls PyBridge.sendCommandToHub(cmd, rssi)
3. Python formats JSON: {"cmd": "Rainbow", "rssi": "all"}
4. Send via USB Serial to hub
5. Hub broadcasts via ESP-NOW to modules
6. Modules execute command
7. Hub sends ACK back via Serial
8. Python parses response and updates UI
```

**Device Discovery (Optional):**
```
1. User clicks refresh button (if scanning enabled)
2. JavaScript calls PyBridge.refreshDevices(rssi)
3. Python sends PING: {"cmd": "PING", "rssi": "-60"}
4. Hub broadcasts PING via ESP-NOW
5. Modules check RSSI and respond if strong enough
6. Hub collects responses (5 second window)
7. Hub sends device list: {"type":"devices","list":[...]}
8. Python updates JavaScript with device array
9. UI displays discovered modules
```

## Hub Integration

### Simple Hub (`new_simple_hub/main.py`)

The webapp works with the `simple_hub` firmware running on an ESP32-C6:

**Features:**
- USB Serial to ESP-NOW bridge
- JSON command parsing
- Game command mapping (0-6)
- Optional module discovery with RSSI filtering
- Display support (SSD1306) for status messages

**Command Format:**
```json
{"cmd": "Rainbow", "rssi": "all"}
{"cmd": "PING", "rssi": "-60"}
{"cmd": "Off"}
```

**Response Format:**
```json
{"type": "ack", "command": "Rainbow", "status": "sent"}
{"type": "devices", "list": [{"id": "Module_1", "rssi": -45, "battery": 85}]}
{"type": "error", "message": "Invalid command"}
```

### Game Commands

| Command | ID | Description |
|---------|-----|-------------|
| Notes   | 0   | Music/sound game |
| Shake   | 1   | Motion sensor game |
| Hot_cold | 2  | Temperature/proximity game |
| Jump    | 3   | Accelerometer game |
| Clap    | 4   | Audio detection game |
| Rainbow | 5   | LED light show |
| Off     | 6   | Deep sleep mode |

## Getting Started

### Prerequisites

1. **Browser**: Chrome or Edge (Web Serial API support)
2. **Hardware**: 
   - ESP32-C6 with `simple_hub` firmware loaded
   - ESP32-C3 playground modules with game firmware
3. **USB Connection**: USB cable to connect hub to computer/tablet

### Running the App

1. **Start HTTP Server:**
   ```bash
   cd webapp
   python -m http.server 8000
   ```

2. **Open in Browser:**
   ```
   http://localhost:8000
   ```

3. **Connect Hub:**
   - Click "Connect USB Hub" button
   - Select ESP32 device from browser's serial port picker
   - Wait for connection confirmation

4. **Send Commands:**
   - Click the command input area
   - Select a command from the drawer
   - Click send button (↑ arrow)
   - Commands broadcast to all modules

### Optional: Device Scanning

To enable module discovery:

1. Open Settings (gear icon)
2. Toggle "Device Scanning" on
3. Use refresh button to discover modules
4. Adjust proximity slider to filter by signal strength

## Development

### Project Structure

```
webapp/
├── index.html              # Main HTML entry point
├── main.py                 # Python backend (PyScript)
├── pyscript.toml          # PyScript configuration
├── manifest.json          # PWA manifest
├── js/                    # JavaScript frontend
│   ├── main.js           # App initialization & controller
│   ├── state/            # State management
│   ├── utils/            # Utilities & bridges
│   └── components/       # UI components
├── mpy/                   # Python modules
│   ├── webSerial.py      # Web Serial API wrapper
│   └── webBluetooth.py   # Legacy BLE support
└── hubCode/              # Hub firmware (for reference)
```

### Key Dependencies

- **PyScript 2024.1.1**: Python runtime in browser
- **Tailwind CSS**: Utility-first CSS framework
- **Lucide Icons**: Icon library
- **Web Serial API**: Browser API for USB communication

### State Management

The app uses a reactive state system in `js/state/store.js`:

```javascript
// Update state and trigger re-renders
setState({
  hubConnected: true,
  hubDeviceName: "USB Serial Hub"
});

// Register component for state changes
onStateChange(() => this.render());

// Get computed values
const devices = getAvailableDevices();
```

### Adding New Commands

1. **Add to Hub:** Update `GAME_MAP` in `new_simple_hub/main.py`
2. **Add to Constants:** Update command list in `js/utils/constants.js`
3. **Update Module Firmware:** Implement game logic in module code

### Browser Compatibility

**Supported:**
- Chrome/Edge 89+
- Opera 75+

**Not Supported:**
- Safari (no Web Serial API)
- Firefox (no Web Serial API)
- Mobile browsers (Web Serial API not available on mobile)

**Note:** For mobile use, requires Chrome/Edge on desktop with USB OTG adapter to tablet.

## Troubleshooting

### Connection Issues

**"Connection failed: Port in use"**
- Close any serial monitor (Arduino IDE, Thonny, etc.)
- Unplug and replug the USB cable
- Try again

**"Web Serial API not available"**
- Use Chrome or Edge browser
- Ensure you're on desktop/laptop (not mobile)
- Check browser version (89+)

**Connection drops unexpectedly**
- Check USB cable connection
- Verify hub is powered properly
- Look for hub firmware errors in browser console

### Device Scanning Issues (if enabled)

**No modules appear after PING**
- Ensure modules are powered on
- Check module firmware is running
- Try increasing proximity slider (wider range)
- Verify ESP-NOW is configured correctly on modules

**Duplicate modules in list**
- Normal - deduplication happens by MAC address
- Duplicates are automatically filtered

### Performance Issues

**Slow or unresponsive UI**
- Clear browser cache (Ctrl+Shift+R)
- Close unnecessary browser tabs
- Check browser console for errors
- Verify PyScript has finished loading

## Support

For issues and questions:
- Check browser console for error messages
- Verify hub firmware version matches webapp version
- Review troubleshooting section above
