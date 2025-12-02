# ESP-NOW Communication Protocol - Version 2
## Plushie Interactive System

**Document Version:** 1.0  
**Date:** December 2, 2025  
**Hub Version:** ESP32C6/C6 MicroPython (v2 - New Module Implementation)  
**Status:** Deprecated (To Be Replaced, Works with Hub to Plushie Module v2 not WebApp)

---

## Overview

The Plushie Interactive System uses ESP-NOW for wireless communication between a **Controller Hub** and multiple **Plushie Modules**. ESP-NOW provides low-latency, connectionless communication without requiring a WiFi access point, making it ideal for interactive toy systems.

### System Components

- **Controller Hub** (`controller.py`): Central control unit with OLED display and button interface
- **Plushie Modules** (`main.py`): Individual interactive plushies running games
- **ESP-NOW Layer** (`utilities/now.py`): Low-level communication wrapper

---

## Communication Architecture

### Network Topology

```
Controller Hub (Broadcast)
      |
      |  ESP-NOW Messages
      |  (JSON over ESP-NOW)
      |
      +---> Plushie 1
      +---> Plushie 2
      +---> Plushie N
```

### Message Flow

1. **Controller** broadcasts messages to all plushies using broadcast MAC address
2. **Plushies** listen for messages and respond to specific topics
3. **Automatic peer discovery**: Devices auto-add peers when receiving messages
4. **RSSI tracking**: Signal strength tracked for proximity detection

---

## Message Format

### JSON Structure

All messages are JSON-encoded strings with the following structure:

```json
{
  "topic": "/topic_name",
  "value": <varies by topic>
}
```

### Protocol Details

- **Encoding**: UTF-8 JSON strings
- **Transport**: ESP-NOW raw packets
- **Max size**: 250 bytes (ESP-NOW limit)
- **Callback signature**: `callback(msg: bytes, mac: bytes, rssi: dict)`

---

## Topic Definitions

### `/game` - Game Selection

**Purpose**: Start, stop, or switch games on plushie modules

**Direction**: Controller → Plushie

**Value Type**: `int`

**Valid Values**:
- `-1`: Stop current game and shutdown
- `0`: Notes/Music game
- `1`: Shake game
- `2`: Hot/Cold game
- `3`: Jump game
- `4`: Clap game (future)
- `5`: Rainbow game

**Example**:
```json
{"topic": "/game", "value": 2}
```

**Behavior**:
- Plushie checks if value differs from current game
- If different, stops current game task gracefully
- Starts new game with appropriate response time
- Maintains game state in `self.game` variable

---

### `/ping` - Keep-Alive Signal

**Purpose**: Maintain communication and verify connectivity

**Direction**: Controller → Plushie

**Value Type**: `int`

**Valid Values**: `1` (ping active)

**Example**:
```json
{"topic": "/ping", "value": 1}
```

**Behavior**:
- Sent every 0.5 seconds by controller
- Can be used for presence detection
- No explicit response required from plushies
- Keeps ESP-NOW channel active

---

### `/gem` - Hidden Gem / Controller Identification

**Purpose**: Identify the controlling device's MAC address for special features

**Direction**: Controller → Plushie

**Value Type**: `bytes` (MAC address)

**Example**:
```json
{"topic": "/gem", "value": [0x24, 0x6f, 0x28, 0xab, 0xcd, 0xef]}
```

**Behavior**:
- Controller publishes its MAC address before game selection
- Plushie stores MAC in `self.hidden_gem`
- Can be used for:
  - Hot/Cold proximity detection
  - Controller-specific interactions
  - Multi-plushie coordination
- **Critical**: Handled immediately in callback to prevent missing

---

## Implementation Details

### ESP-NOW Layer (`utilities/now.py`)

#### Initialization

```python
class Now():
    def __init__(self, callback = None):
        self.connected = False
        self.everyone = b'\xff\xff\xff\xff\xff\xff'  # Broadcast MAC
        self.callback = callback
        self.peers = []
```

#### Key Features

1. **Broadcast Communication**
   - Uses `b'\xff\xff\xff\xff\xff\xff'` for broadcast
   - All devices receive broadcast messages

2. **Automatic Peer Discovery**
   - When message received from new MAC, auto-adds peer
   - Maintains `self.peers` list of known devices

3. **External Antenna Support**
   - Pin 3: WiFi Enable
   - Pin 14: Antenna Config
   - Switches to external antenna for better range

4. **IRQ-Based Reception**
   - Non-blocking message reception
   - Callback triggered on message arrival
   - Includes RSSI (signal strength) data

#### Connection Setup

```python
def connect(self):
    self.wifi = network.WLAN(network.STA_IF)
    self.wifi.active(True)
    self.antenna()
    self.now_network = espnow.ESPNow()
    self.now_network.active(True)
    self.now_network.add_peer(self.everyone)
    self.now_network.irq(self.irq_receive)
    self.connected = True
```

#### Message Publishing

```python
def publish(self, msg, mac = None):
    if not mac:
        mac = self.everyone  # Default to broadcast
    if self.connected:
        self.now_network.send(mac, msg)
```

---

## Controller Hub Implementation

### Initialization (`controller.py`)

```python
class Controller:
    def __init__(self):
        self.display = Display()  # SSD1306 OLED
        self.button = Button()    # Pin 19 with IRQ
        # Display menu items...
```

### Game Selection Menu

- **Display**: 128x64 OLED showing 6 game options
- **Navigation**: Short button press moves selection box
- **Selection**: Long button press (>1 second) confirms choice

### Message Publishing Flow

1. **Continuous Ping**
   ```python
   ping = json.dumps({'topic':'/ping', 'value':1})
   self.n.publish(ping)  # Every 0.5 seconds
   ```

2. **Game Selection**
   ```python
   # Step 1: Identify controller
   mac = json.dumps({'topic':'/gem', 'value':self.mac})
   self.n.publish(mac)
   
   # Step 2: Select game
   setup = json.dumps({'topic':'/game', 'value':game})
   self.n.publish(setup)
   ```

3. **Shutdown**
   ```python
   stop = json.dumps({'topic':'/game', 'value':-1})
   self.n.publish(stop)
   ```

---

## Plushie Module Implementation

### Initialization (`main.py`)

```python
class Stuffie:
    def __init__(self):
        self.game = -1        # Current game number
        self.running = False  # Game running flag
        self.topic = ''       # Last received topic
        self.value = -1       # Last received value
        self.hidden_gem = None  # Controller MAC
        self.game_names = [Notes(), Shake(), Hot_cold(), ...]
        self.response_times = [0.1, 0.1, 0.1, ...]
```

### Message Reception Callback

```python
def now_callback(self, msg, mac, rssi):
    try:
        payload = json.loads(msg)
        self.topic = payload['topic']
        self.value = payload['value']
        self.rssi = rssi
        
        # Critical: Handle /gem immediately
        if self.topic == "/gem":
            self.hidden_gem = mac
    except Exception as e:
        print(e)
```

### Main Event Loop

```python
async def main(self):
    self.startup()
    self.start_game(0)  # Default game
    
    while self.game >= 0:
        if self.topic == '/game':
            if self.value != self.game:
                # Switch games
                await self.stop_game(self.game)
                self.game = self.value
                if self.value >= 0:
                    self.start_game(self.value)
        
        await asyncio.sleep(1)
```

### Game Task Management

```python
def start_game(self, number):
    self.running = True
    self.game = number
    self.task = asyncio.create_task(
        self.game_names[number].run(self.response_times[number])
    )

async def stop_game(self, number):
    self.running = False
    await self.task  # Wait for graceful shutdown
```

---

## Startup Sequence

### Controller Hub Startup

1. Initialize display and show menu
2. Connect to ESP-NOW (`self.n.connect()`)
3. Get and store MAC address
4. Begin ping loop (0.5s intervals)
5. Wait for button interactions

### Plushie Module Startup

1. **Light 0 ON**: Starting initialization
2. Connect to ESP-NOW with callback
3. **Light 1 ON**: ESP-NOW connected
4. Get and store MAC address
5. Switch to external antenna
6. **Light 2 ON**: Antenna configured
7. Start default game (Notes/Music)
8. **Light 3 ON**: Game running

---

## Signal Strength (RSSI)

### Usage

RSSI (Received Signal Strength Indicator) is available in message callbacks:

```python
def now_callback(self, msg, mac, rssi):
    self.rssi = rssi  # Store for proximity detection
```

### Applications

- **Hot/Cold Game**: Use RSSI to determine proximity to controller
- **Multi-device coordination**: Strongest signal = closest device
- **Connection quality**: Monitor communication reliability

### Typical Values

- **Close range** (< 1m): -30 to -50 dBm
- **Medium range** (1-10m): -50 to -70 dBm
- **Far range** (10-30m): -70 to -90 dBm

---

## Error Handling

### Connection Errors

```python
try:
    self.espnow.connect()
except Exception as e:
    print(f"Connection failed: {e}")
```

### Message Parsing Errors

```python
try:
    payload = json.loads(msg)
except Exception as e:
    print(f"Parse error: {e}")
    # Ignore malformed messages
```

### Task Management Errors

- Games implement `try/finally` blocks
- `finally` ensures `close()` is called
- Lights turned off on error
- Cleanup prevents resource leaks

---

## Best Practices

### Message Design

1. **Keep messages small**: ESP-NOW has 250-byte limit
2. **Use simple JSON**: Minimize parsing overhead
3. **Validate input**: Check value ranges before using

### Timing

1. **Ping interval**: 0.5s prevents timeout
2. **Game loop**: 0.1-1.0s depending on game needs
3. **Async/await**: Prevents blocking on I/O

### Resource Management

1. **Close ESP-NOW**: Call `close()` on shutdown
2. **Cancel tasks**: Await running tasks before exit
3. **Turn off lights**: Prevent LED drain on exit

### Reliability

1. **Broadcast first**: Ensures all devices receive
2. **State checking**: Verify game number before switching
3. **Exception handling**: Catch and log all errors

---

## Protocol Extensions (Future)

### Potential Topics

- `/status`: Request plushie status report
- `/battery`: Battery level reporting
- `/sync`: Multi-plushie synchronization
- `/config`: Runtime configuration changes
- `/clap`: Clap detection for game #4

### Bidirectional Communication

Currently one-way (Controller → Plushie). Could extend to:

- Plushies report status back to controller
- Controller displays plushie states
- Multi-plushie games with coordination

### Security Considerations

- ESP-NOW supports encrypted communication
- Could add message authentication
- MAC filtering for trusted devices only

---

## Debugging

### Enable Verbose Logging

```python
def now_callback(self, msg, mac, rssi):
    mac_str = ':'.join(f'{b:02x}' for b in mac)
    print(f"Received: {msg} from {mac_str} (RSSI: {rssi})")
```

### Common Issues

1. **No messages received**
   - Check antenna configuration
   - Verify ESP-NOW is active on both sides
   - Confirm broadcast peer is added

2. **Messages dropped**
   - Check RSSI values (too weak?)
   - Reduce message rate
   - Verify JSON format

3. **Game won't switch**
   - Check `self.running` flag
   - Ensure task completes before new game
   - Verify `/game` topic spelling

---

## Hardware Requirements

### ESP32 Variants

- **Tested on**: ESP32-S3, ESP32-WROOM
- **Required**: ESP-NOW support in MicroPython firmware

### Pin Assignments

#### Plushie Module
- Pin 0: Button (with pull-up)
- Pin 19: Buzzer
- Pin 20: NeoPixel LEDs (12 pixels)
- Pin 21: Motor
- Pin 3: WiFi Enable
- Pin 14: Antenna Config

#### Controller Hub
- Pin 22: I2C SDA (OLED)
- Pin 23: I2C SCL (OLED)
- Pin 19: Button (with pull-up)
- Pin 17: LED indicator

---

## Version History

### Version 2.0 (Current)
- Broadcast-based communication
- Automatic peer discovery
- RSSI tracking for proximity
- Six game support
- Hidden gem feature
- Async game management

### Version 1.0 (Legacy)
- Direct peer-to-peer only
- Manual peer addition
- Limited game support

---

## Contact & Support

For questions about this protocol or to report issues, contact the development team.

**Last Updated**: December 2, 2025

