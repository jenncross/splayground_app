# Simple Hub Implementation Guide
## Critical Priority: USB Serial Hub for Smart Playground

**Document Purpose**: Actionable guide for implementing Single-Processor Simple Hub with WebUSB Serial communication to webapp and ESP-NOW communication to playground modules.

**Status**: Planning Document  
**Priority**: Critical (Phase 1)  
**Date**: December 4, 2025

---

## Executive Summary

**Goal**: Create a working Simple Hub that connects webapp to playground modules using:
- **WebUSB Serial** for webapp communication (USB cable required)
- **ESP-NOW** for module communication (2.4GHz wireless)
- **Single ESP32-C6** with dedicated antenna for ESP-NOW (no BLE conflicts)

**Why Simple Hub First**: Lower complexity, faster to implement, reusable code for Hub V2, good for testing and classroom deployment.

**Critical Path**:
1. Get modules responding to PING with device info (currently missing)
2. Implement Simple Hub with Serial + ESP-NOW
3. Add WebUSB Serial support to webapp
4. Update webapp UI for new games
5. Test full system integration

---

## Critical Issues Analysis

### Issue 1: Game Command Misalignment (CRITICAL)

**Current State**:
- Webapp UI shows 7 current games: Notes, Shake, Hot_cold, Jump, Clap, Rainbow, Off
- Plushie modules implement these games with corresponding game numbers (0-6)
- ESP-NOW Protocol V2 defines the message format
- No mapping between old UI and new games

**Impact**: Webapp sends commands modules don't understand. Functionality is broken.

**User Requirement**: Add all new games to webapp UI.

**Recommended Solution**:
1. Update webapp `constants.js` with new game names and appropriate icons
2. Update command mapping for new game names
3. Consider keeping old commands as aliases during transition (optional)

**Files Affected**:
- `webapp/js/utils/constants.js` - Command definitions
- `webapp/js/components/icons.js` - Command icons
- ESP-NOW protocol mapping (hub side)

---

### Issue 2: Device Scanning Not Implemented in Modules (CRITICAL)

**Current State**:
- Hub V1 code expects modules to respond to PING with deviceScan messages
- Plushie modules (`utilities/now.py`) only have basic message callback
- No code to send device info back to hub
- No battery reporting implementation

**Impact**: Hub cannot discover modules. Device list will always be empty.

**Recommended Solution**:

Add device scan response to plushie modules' ESP-NOW callback.

**Pattern to Follow**:
```
When PING received:
  1. Check if topic == '/ping'
  2. Read battery level from LC709203F sensor
  3. Build deviceScan response with: id, battery, type, mac
  4. Publish response via ESP-NOW
```

**Reference Files**:
- **Template**: `plushie_modules/main.py` - See `now_callback()` for callback pattern
- **Battery Reading**: `plushie_modules/utilities/i2c_bus.py` - `Battery.read()` method exists
- **ESP-NOW Protocol**: `ESPNOW_PROTOCOL_V2.md` - See /deviceScan message format

**Files to Modify**:
- `plushie_modules/utilities/now.py` OR `plushie_modules/main.py` (developer choice)
- Add response logic to existing callback
- Integrate `Battery()` class from i2c_bus.py

---

### Issue 3: WebUSB Serial Not Implemented in Webapp (CRITICAL)

**Current State**:
- Webapp only supports BLE connection via `webBluetooth.py`
- No WebUSB Serial support exists
- Simple Hub will use Serial, not BLE

**Impact**: Cannot connect webapp to Simple Hub.

**User Requirement**: Add USB serial connection support to webapp.

**Recommended Solution**:
1. Create `webapp/mpy/webSerial.py` wrapper for Web Serial API
2. Add `connect_hub_serial()` method to `main.py`
3. Create connection type selector UI
4. Use same protocol over Serial as over BLE (line-delimited JSON)

**Files to Create**:
- `webapp/mpy/webSerial.py` - Web Serial API wrapper
- `webapp/js/components/connectionModal.js` - Connection type selector

**Files to Modify**:
- `webapp/main.py` - Add Serial connection methods
- `webapp/js/utils/pyBridge.js` - Add Serial bridge methods
- `webapp/js/components/connectionStatusButton.js` - Show connection type
- `webapp/js/state/store.js` - Track connection mode ("ble" or "serial")

---

### Issue 4: No Simple Hub Implementation Exists (CRITICAL)

**Current State**:
- Hub V1 exists (ESP32-C3, BLE + ESP-NOW, deprecated due to radio conflicts)
- Hub V2 planned (dual processor, future work)
- No Simple Hub implementation

**Impact**: Nothing to connect webapp to via Serial.

**Recommended Solution**:
Create Simple Hub as single-file MicroPython application reusing patterns from plushie modules.

**Architecture**:
```
simple_hub/
├── main.py              # Main hub class, event loop
├── espnow_handler.py    # ESP-NOW communication
├── device_scanner.py    # PING-based device discovery
├── serial_handler.py    # WebUSB Serial communication
└── README.md           # Setup and deployment guide
```

---

## Implementation Plan

### Phase 1: Module Device Scanning (Week 1)

**Objective**: Get modules responding to PING with device info.

**Tasks**:
1. Add device scan response to `utilities/now.py`
2. Integrate battery reading in `main.py`
3. Test PING/response with simple ESP-NOW test script
4. Verify battery sensor reading

**Deliverables**:
- Updated `plushie_modules/utilities/now.py`
- Updated `plushie_modules/main.py`
- Test script demonstrating PING/response

**Success Criteria**:
- Module receives PING message
- Module responds with device info including battery level
- Response includes MAC address and device type

---

### Phase 2: Simple Hub Core Implementation (Week 1-2)

**Objective**: Create working Simple Hub with Serial and ESP-NOW.

#### Task 2.1: ESP-NOW Handler
**File**: `simple_hub/espnow_handler.py`

**Class Outline**:
```
ESPNowHandler:
  State: connected, wifi, espnow, callback, broadcast_mac
  
  startup():
    - Init WiFi on channel 1
    - Init ESP-NOW
    - Add broadcast peer
    - Register IRQ callback
  
  send(message_dict):
    - Convert dict to JSON
    - Broadcast via ESP-NOW
  
  _irq_callback():
    - Read incoming messages
    - Parse JSON
    - Get RSSI from peers_table
    - Call message_callback
  
  close():
    - Cleanup ESP-NOW and WiFi
```

**Reference Files for Implementation**:
- **Pattern**: `plushie_modules/utilities/now.py` - ESP-NOW wrapper class
- **WiFi Setup**: `old_hub_code/main_c3.py` lines 236-243 - Channel configuration
- **Broadcast**: `plushie_modules/utilities/now.py` line 22 - Broadcast MAC pattern
- **IRQ Pattern**: `old_hub_code/main_c3.py` lines 62-75 - Interrupt handler structure

**Key Differences from Plushie Code**:
- Hub needs explicit WiFi channel setting (channel 1)
- Hub needs RSSI from peers_table (plushies don't track this)
- Hub needs broadcast-only (plushies use callback approach)

#### Task 2.2: Serial Handler
**File**: `simple_hub/serial_handler.py`

**Class Outline**:
```
SerialHandler:
  State: connected, rx_buffer, message_callback
  
  startup():
    - USB Serial already active (no init needed)
    - Set connected flag
  
  send(message_dict):
    - Convert dict to JSON
    - Print to stdout (USB Serial)
  
  check_incoming():
    - Read from stdin (non-blocking)
    - Accumulate in rx_buffer
    - Parse complete lines (newline-delimited)
    - Call message_callback with parsed JSON
  
  close():
    - Set connected = False
```

**Reference Files for Implementation**:
- **USB Serial Pattern**: Use Python's `sys.stdin` and `sys.stdout`
- **Line Buffering**: Similar to `old_hub_code/main_c3.py` lines 78-94 (BLE command buffering)
- **Non-blocking Read**: Use `select.select()` for stdin availability check

**Key Points**:
- No UART initialization needed (USB Serial active on boot)
- Use `print()` for sending (goes to USB)
- Use `sys.stdin.readline()` for receiving
- Line-delimited JSON (same format as BLE protocol)

#### Task 2.3: Device Scanner
**File**: `simple_hub/device_scanner.py`

**Class Outline**:
```
DeviceScanner:
  State: scanning, scan_start_time, discovered_devices, rssi_threshold
  
  start_scan(rssi_threshold):
    - Set scanning flag
    - Clear discovered_devices list
    - Send PING via ESP-NOW
  
  handle_device_response(mac, data, rssi):
    - Check if topic == '/deviceScan'
    - Apply RSSI filtering
    - Deduplicate by MAC (keep strongest RSSI)
    - Add to discovered_devices
  
  check_timeout():
    - Check if scan_timeout exceeded (5 seconds)
    - Return device list when complete
  
  get_device_list():
    - Format devices for webapp
```

**Reference Files for Implementation**:
- **Scan Pattern**: `old_hub_code/main_c3.py` lines 349-390 - Device scanning logic
- **Deduplication**: `old_hub_code/main_c3.py` lines 423-438 - MAC-based deduplication
- **RSSI Filtering**: `old_hub_code/main_c3.py` lines 421-422, 531-537 - Filter by threshold
- **Timeout Checking**: `old_hub_code/main_c3.py` lines 456-489 - Scan timeout management

**Key Concepts**:
- Scan window: 5 seconds from PING to completion
- Deduplication: One entry per MAC, keep strongest RSSI
- RSSI filter: If threshold != "all", compare rssi >= threshold
- Response format: `{"type": "devices", "list": [...]}`

#### Task 2.4: Main Hub Class
**File**: `simple_hub/main.py`

**Recommended Implementation Pattern**:
```python
class SimpleHub:
    """Single-processor hub with Serial and ESP-NOW"""
    
    def __init__(self):
        # Handlers
        self.serial = None
        self.espnow = None
        self.scanner = None
        
        # State
        self.running = False
        
        # Message buffers
        self.espnow_messages = []
        self.serial_commands = []
    
    def startup(self):
        """Initialize hub components"""
        print("Simple Hub starting...")
        
        # Initialize Serial
        self.serial = SerialHandler()
        self.serial.startup()
        self.serial.message_callback = self._on_serial_command
        
        # Initialize ESP-NOW
        self.espnow = ESPNowHandler()
        self.espnow.startup()
        self.espnow.message_callback = self._on_espnow_message
        
        # Initialize scanner
        self.scanner = DeviceScanner(self.espnow)
        
        print("Simple Hub ready")
    
    def _on_serial_command(self, cmd):
        """Serial command received - buffer for main loop"""
        self.serial_commands.append(cmd)
    
    def _on_espnow_message(self, mac, data, rssi):
        """ESP-NOW message received - buffer for main loop"""
        self.espnow_messages.append((mac, data, rssi))
    
    def _process_serial_command(self, cmd):
        """Process command from webapp"""
        cmd_type = cmd.get("cmd")
        rssi = cmd.get("rssi", "all")
        
        if cmd_type == "PING":
            # Start device scan
            self.scanner.start_scan(rssi)
        
        elif cmd_type in ["Play", "Pause", "Win", "Notes", "Shake", 
                          "Hot_cold", "Jump", "Rainbow", "Off"]:
            # Send command to modules
            self._send_game_command(cmd_type, rssi)
        
        else:
            print(f"Unknown command: {cmd_type}")
    
    def _send_game_command(self, command, rssi_threshold):
        """Send game command via ESP-NOW"""
        # Map command to game number
        game_map = {
            "Notes": 0,
            "Shake": 1,
            "Hot_cold": 2,
            "Jump": 3,
            "Clap": 4,
            "Rainbow": 5,
            "Off": 6  # Hibernate mode
        }
        
        game_num = game_map.get(command, 0)
        
        msg = {
            "topic": "/game",
            "value": game_num
        }
        
        success = self.espnow.send(msg)
        
        # Send acknowledgment to webapp
        ack = {
            "type": "ack",
            "command": command,
            "status": "sent" if success else "failed",
            "rssi": rssi_threshold
        }
        self.serial.send(ack)
    
    def _process_espnow_message(self, mac, data, rssi):
        """Process message from module"""
        # Pass to scanner if scanning
        if self.scanner.scanning:
            self.scanner.handle_device_response(mac, data, rssi)
    
    async def main(self):
        """Main event loop"""
        try:
            self.startup()
            self.running = True
            
            while self.running:
                # Process Serial commands
                if self.serial_commands:
                    cmd = self.serial_commands.pop(0)
                    self._process_serial_command(cmd)
                
                # Process ESP-NOW messages
                if self.espnow_messages:
                    mac, data, rssi = self.espnow_messages.pop(0)
                    self._process_espnow_message(mac, data, rssi)
                
                # Check for incoming Serial data
                self.serial.check_incoming()
                
                # Check scan timeout
                if self.scanner.scanning:
                    device_list = self.scanner.check_timeout()
                    if device_list:
                        self.serial.send(device_list)
                
                # Small delay for REPL interruption
                await asyncio.sleep(0.01)
        
        finally:
            print("Shutting down...")
            self.close()
    
    def close(self):
        """Cleanup resources"""
        if self.espnow:
            self.espnow.close()
        if self.serial:
            self.serial.close()

# Run hub
hub = SimpleHub()
asyncio.run(hub.main())
```

**Deliverables**:
- `simple_hub/main.py`
- `simple_hub/espnow_handler.py`
- `simple_hub/device_scanner.py`
- `simple_hub/serial_handler.py`

**Success Criteria**:
- Hub starts up successfully
- Can send PING via ESP-NOW
- Receives device responses
- Sends device list via Serial

---

### Phase 3: Webapp WebUSB Serial Support (Week 2)

**Objective**: Add Serial connection support to webapp.

#### Task 3.1: Web Serial API Wrapper
**File**: `webapp/mpy/webSerial.py`

**Recommended Implementation**:
```python
code = '''
from pyscript import window
import asyncio

class WebSerial:
    """Web Serial API wrapper for USB communication with hub"""
    
    def __init__(self):
        self.port = None
        self.reader = None
        self.writer = None
        self.on_data_callback = None
    
    async def connect(self):
        """Request and connect to serial port"""
        try:
            # Check API availability
            if not hasattr(window.navigator, 'serial'):
                print("ERROR: Web Serial API not available!")
                print("Use Chrome or Edge browser")
                return False
            
            # Request port
            self.port = await window.navigator.serial.requestPort()
            
            if not self.port:
                print("No port selected")
                return False
            
            print(f"Selected port")
            
            # Open port
            await self.port.open(window.Object.new(baudRate=115200))
            print("Port opened")
            
            # Get reader and writer
            self.reader = self.port.readable.getReader()
            self.writer = self.port.writable.getWriter()
            
            # Start reading in background
            asyncio.create_task(self._read_loop())
            
            print("Serial connected")
            return True
            
        except Exception as e:
            error_msg = str(e)
            if "cancelled" in error_msg.lower():
                print("User cancelled serial port selection")
                return False
            else:
                print(f"Serial connection error: {e}")
                import traceback
                traceback.print_exc()
                return False
    
    async def _read_loop(self):
        """Background task to read serial data"""
        try:
            decoder = window.TextDecoder.new()
            
            while True:
                result = await self.reader.read()
                
                if result.done:
                    print("Serial reader closed")
                    break
                
                text = decoder.decode(result.value)
                
                if text and self.on_data_callback:
                    # Split by newlines for line-delimited JSON
                    for line in text.split('\\n'):
                        line = line.strip()
                        if line:
                            self.on_data_callback(line)
        
        except Exception as e:
            print(f"Read loop error: {e}")
    
    async def send(self, message):
        """Send data to serial port"""
        if not self.writer:
            print("Not connected!")
            return False
        
        try:
            encoder = window.TextEncoder.new()
            data = encoder.encode(message + "\\n")
            await self.writer.write(data)
            print(f"Sent: {message}")
            return True
        except Exception as e:
            print(f"Send error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def disconnect(self):
        """Disconnect from serial port"""
        try:
            if self.reader:
                await self.reader.cancel()
                self.reader = None
            
            if self.writer:
                await self.writer.close()
                self.writer = None
            
            if self.port:
                await self.port.close()
                self.port = None
            
            print("Serial disconnected")
        except Exception as e:
            print(f"Disconnect error: {e}")
    
    def is_connected(self):
        """Check if connected"""
        return self.port is not None
'''
```

#### Task 3.2: Python Backend Integration
**File**: `webapp/main.py`

**Recommended Additions**:
```python
# Add to imports
from mpy.webSerial import code as serial_code
exec(serial_code)  # Creates WebSerial class
serial = WebSerial()

# Add connection functions
async def connect_hub_serial():
    """Connect to hub via USB Serial"""
    global hub_connected, hub_device_name, hub_connection_mode
    
    try:
        success = await serial.connect()
        
        if success:
            hub_connected = True
            hub_device_name = "USB Serial Hub"
            hub_connection_mode = "serial"
            
            # Set up data callback
            serial.on_data_callback = on_serial_data
            
            # Notify JavaScript
            if hasattr(window, 'onHubConnected'):
                js_data = Object.new()
                js_data.deviceName = hub_device_name
                js_data.mode = "serial"
                window.onHubConnected(js_data)
            
            return {"status": "success", "device": hub_device_name}
        else:
            return {"status": "cancelled"}
    
    except Exception as e:
        error_msg = str(e)
        if "cancelled" in error_msg.lower():
            return {"status": "cancelled"}
        else:
            return {"status": "error", "error": error_msg}

async def disconnect_hub_serial():
    """Disconnect from Serial hub"""
    global hub_connected, hub_device_name, hub_connection_mode
    
    await serial.disconnect()
    hub_connected = False
    hub_device_name = None
    hub_connection_mode = None
    
    # Notify JavaScript
    if hasattr(window, 'onHubDisconnected'):
        window.onHubDisconnected()
    
    return {"status": "disconnected"}

def on_serial_data(data):
    """Handle incoming Serial data (same format as BLE)"""
    # Reuse existing on_ble_data logic
    on_ble_data(data)

# Expose to JavaScript
window.connect_hub_serial = create_proxy(connect_hub_serial)
window.disconnect_hub_serial = create_proxy(disconnect_hub_serial)
```

#### Task 3.3: JavaScript Bridge
**File**: `webapp/js/utils/pyBridge.js`

**Recommended Additions**:
```javascript
const PyBridge = {
    // Existing methods...
    
    async connectHubSerial() {
        if (!this.isPythonReady()) {
            return { status: "error", error: "Python not ready" };
        }
        try {
            return await window.connect_hub_serial();
        } catch (e) {
            console.error("connect_hub_serial failed:", e);
            return { status: "error", error: e.message };
        }
    },
    
    async disconnectHubSerial() {
        if (!this.isPythonReady()) {
            return { status: "error", error: "Python not ready" };
        }
        try {
            return await window.disconnect_hub_serial();
        } catch (e) {
            console.error("disconnect_hub_serial failed:", e);
            return { status: "error", error: e.message };
        }
    }
};
```

#### Task 3.4: Connection Selection UI
**File**: `webapp/js/components/connectionModal.js` (NEW)

**Recommended Implementation**:
```javascript
export function createConnectionModal(onBLE, onSerial, onCancel) {
    const modal = document.createElement('div');
    modal.className = 'absolute inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center';
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 mx-4 max-w-sm" onclick="event.stopPropagation()">
            <div class="flex flex-col items-center">
                <div class="text-lg font-semibold text-gray-900 mb-6">Connect to Hub</div>
                
                <button class="w-full px-6 py-3 bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mb-3" id="bleBtn">
                    <i data-lucide="bluetooth" class="w-4 h-4"></i>
                    Bluetooth Hub (Wireless)
                </button>
                
                <button class="w-full px-6 py-3 bg-green-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mb-3" id="serialBtn">
                    <i data-lucide="usb" class="w-4 h-4"></i>
                    USB Serial Hub (Cable)
                </button>
                
                <button class="text-sm text-gray-500 transition-colors mt-2" id="cancelBtn">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    modal.querySelector('#bleBtn').onclick = (e) => {
        e.stopPropagation();
        onBLE();
    };
    
    modal.querySelector('#serialBtn').onclick = (e) => {
        e.stopPropagation();
        onSerial();
    };
    
    modal.querySelector('#cancelBtn').onclick = (e) => {
        e.stopPropagation();
        onCancel();
    };
    
    modal.onclick = (e) => {
        if (e.target === modal) {
            onCancel();
        }
    };
    
    return modal;
}
```

#### Task 3.5: State Management
**File**: `webapp/js/state/store.js`

**Recommended Additions**:
```javascript
export const state = {
    // Existing state...
    hubConnectionMode: null,  // "ble" or "serial"
};
```

**Deliverables**:
- `webapp/mpy/webSerial.py`
- Updated `webapp/main.py`
- Updated `webapp/js/utils/pyBridge.js`
- `webapp/js/components/connectionModal.js`
- Updated `webapp/js/state/store.js`
- Updated `webapp/js/main.js` (connection flow)

**Success Criteria**:
- Browser prompts for serial port selection
- Connects to Simple Hub via USB
- Receives device list from hub
- Can send commands to modules

---

### Phase 4: Game Command Updates (Week 2)

**Objective**: Update webapp UI for new games.

#### Task 4.1: Update Command Constants
**File**: `webapp/js/utils/constants.js`

**Recommended Changes**:
```javascript
export const COMMANDS = [
    { id: "Notes", label: "Notes", bgColor: "#7eb09b", icon: "music", textColor: "white" },
    { id: "Shake", label: "Shake", bgColor: "#d4a574", icon: "zap", textColor: "white" },
    { id: "Hot_cold", label: "Hot/Cold", bgColor: "#b084cc", icon: "thermometer", textColor: "white" },
    { id: "Jump", label: "Jump", bgColor: "#658ea9", icon: "arrow-up", textColor: "white" },
    { id: "Clap", label: "Clap", bgColor: "#8fbc8f", icon: "hand", textColor: "white" },
    { id: "Rainbow", label: "Rainbow", bgColor: "#d7a449", icon: "rainbow", textColor: "white" },
    { id: "Off", label: "Off", bgColor: "#e98973", icon: "power-off", textColor: "white" },
];
```

#### Task 4.2: Update Command Icons
**File**: `webapp/js/components/icons.js`

**Recommended Changes**:
```javascript
export function getCommandIcon(commandLabel, size = "small") {
    const commands = {
        Notes: { bgColor: "#7eb09b", icon: "music" },
        Shake: { bgColor: "#d4a574", icon: "zap" },
        "Hot/Cold": { bgColor: "#b084cc", icon: "thermometer" },
        Jump: { bgColor: "#658ea9", icon: "arrow-up" },
        Clap: { bgColor: "#8fbc8f", icon: "hand" },
        Rainbow: { bgColor: "#d7a449", icon: "rainbow" },
        Off: { bgColor: "#e98973", icon: "power-off" },
    };
    
    // Rest of implementation...
}
```

**Deliverables**:
- Updated `webapp/js/utils/constants.js`
- Updated `webapp/js/components/icons.js`

**Success Criteria**:
- Command palette shows new game names
- Icons match game types
- Commands send correct game numbers to modules

---

## Testing Strategy

### Unit Testing

**Module Device Scanning**:
1. Send PING from test ESP32
2. Verify module responds with deviceScan message
3. Check battery value is realistic (0-100%)
4. Verify MAC address in response

**Simple Hub ESP-NOW**:
1. Test ESP-NOW initialization
2. Send test PING
3. Receive device responses
4. Verify RSSI filtering

**Simple Hub Serial**:
1. Test Serial send/receive
2. Verify JSON parsing
3. Test command routing

### Integration Testing

**Hub + Modules**:
1. Start Simple Hub
2. Power on multiple modules
3. Send PING command
4. Verify device list received
5. Send game commands
6. Verify modules change games

**Webapp + Hub**:
1. Connect webapp to hub via Serial
2. Refresh device list
3. Select game command
4. Send to modules
5. Verify command reaches modules

### System Testing

**End-to-End Flow**:
1. User opens webapp in Chrome/Edge
2. Clicks "Connect Hub"
3. Selects "USB Serial Hub"
4. Browser prompts for serial port
5. Selects Simple Hub port
6. Webapp shows "Connected"
7. Clicks refresh icon
8. Device list populates with modules
9. Selects "Notes" game
10. Clicks send button
11. All modules in range start Notes game

**Success Criteria**:
- No errors in browser console
- Device list updates correctly
- Commands reach modules reliably
- RSSI filtering works as expected
- Battery levels display accurately

---

## Known Limitations

**Simple Hub Constraints**:
1. Requires USB cable (no wireless webapp connection)
2. Chrome/Edge browsers only (Web Serial API)
3. One hub per USB port
4. No concurrent BLE support (antenna dedicated to ESP-NOW)

**Recommended User Guidance**:
- Document browser requirements clearly
- Provide USB cable connection instructions
- Show connection type in UI prominently
- Handle reconnection gracefully (user unplugs/replugs)

---

## Next Steps After Simple Hub Complete

Once Simple Hub is solid and system is working end-to-end:

1. **Hub V2 Development** (separate document)
   - Dual processor architecture
   - UART inter-processor protocol
   - Concurrent BLE and ESP-NOW
   - No USB cable required

2. **Protocol Enhancements**
   - Additional game types
   - Module status reporting
   - Multi-hub coordination
   - Advanced RSSI features

3. **Production Hardening**
   - Error recovery
   - Connection reliability
   - Performance optimization
   - Deployment guides

---

## Questions for User/Team Lead

Before implementation begins, clarify:

1. **Module Naming**: How should modules identify themselves? MAC-based ("M-aabbcc") or user-assignable names?

2. **Battery Reporting**: Is LC709203F sensor present on all modules? What to report if sensor missing?

3. **Game Mapping**: Old command names (Play, Pause, Win) have been removed from UI. Current games are: Notes, Shake, Hot_cold, Jump, Clap, Rainbow, Off.

4. **Error Handling**: What should happen if device scan finds no modules? Show error or empty list?

5. **Connection Preference**: Should webapp remember last connection type (BLE vs Serial)?

---

**Document Status**: Ready for review and implementation
**Next Action**: Clarify questions above, then begin Phase 1 (Module Device Scanning)