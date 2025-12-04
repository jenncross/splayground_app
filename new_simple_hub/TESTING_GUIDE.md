# Simple Hub Testing Guide

## Quick Start Testing

### 1. Hardware Setup
1. Connect ESP32-C6 to computer via USB
2. Ensure external antenna is connected (if using antenna=True)
3. Power on at least one playground module for testing

### 2. Upload Hub Code
```bash
# Upload utilities (if not already uploaded)
ampy --port /dev/ttyUSB0 put utilities/

# Upload main.py
ampy --port /dev/ttyUSB0 put main.py

# Reset board
ampy --port /dev/ttyUSB0 reset
```

### 3. Test Serial Communication
Open serial monitor (115200 baud):
```bash
screen /dev/ttyUSB0 115200
# or
minicom -D /dev/ttyUSB0 -b 115200
```

You should see:
```
Simple Hub initialized (scanning_mode=True)
Connecting ESP-NOW...
ESP-NOW connected. MAC: aa:bb:cc:dd:ee:ff
{"type":"ready","mode":"scanning","mac":"aa:bb:cc:dd:ee:ff"}
Hub running. Press Ctrl+C to stop.
```

### 4. Test Commands Manually
Type these JSON commands (press Enter after each):

```json
{"cmd": "Notes"}
```
Expected response:
```json
{"type":"ack","command":"Notes","status":"sent"}
```

```json
{"cmd": "PING", "rssi": "all"}
```
Expected response (after 5 seconds):
```json
{"type":"devices","list":[...]}
```

### 5. Test Webapp Integration

#### Step 1: Serve Webapp
```bash
cd webapp
python3 -m http.server 8000
```

#### Step 2: Open in Browser
- Open Chrome or Edge (NOT Firefox/Safari)
- Navigate to `http://localhost:8000` or `https://your-server.com`
- Wait for Python backend to initialize

#### Step 3: Connect Hub
1. Click "Connect Hub" button (or "Disconnected" status)
2. Select "USB Serial Hub (Cable)" from modal
3. Browser shows serial port picker
4. Select ESP32-C6 port (usually labeled "USB JTAG/Serial")
5. Should see "Connected" status

#### Step 4: Test Device Scanning
1. Click refresh icon (circular arrow)
2. Wait ~5 seconds
3. Device list should populate with modules
4. Each device shows: name, signal strength, battery level

#### Step 5: Send Commands
1. Type a message (optional)
2. Select a game from command palette:
   - Notes (music notes)
   - Shake (motion game)
   - Hot/Cold (proximity game)
   - Jump (jumping game)
   - Rainbow (light show)
   - Off (stop all)
3. Click send button
4. All modules in range should execute the command

## Test Checklist

### Serial Communication Tests
- [ ] Hub starts and prints ready message
- [ ] Can send JSON commands manually
- [ ] Receives acknowledgments for game commands
- [ ] PING command triggers device scan (scanning mode)
- [ ] Device list received after scan timeout

### ESP-NOW Communication Tests
- [ ] Modules receive game commands
- [ ] Modules respond to PING (if implemented in modules)
- [ ] Commands work at various distances
- [ ] Multiple modules receive broadcast

### Webapp Integration Tests
- [ ] Connection modal appears on connect button click
- [ ] Serial option visible in modal
- [ ] Browser serial port picker appears
- [ ] Connection established successfully
- [ ] Status shows "Connected" with device name
- [ ] Can disconnect and reconnect
- [ ] Device scanning works from webapp
- [ ] Game commands work from webapp
- [ ] New game names appear in command palette:
  - Notes ✅
  - Shake ✅
  - Hot/Cold ✅
  - Jump ✅
  - Rainbow ✅
  - Off ✅

### Edge Cases
- [ ] Reconnect after unplug/replug USB
- [ ] Handle no modules found (empty device list)
- [ ] Handle scan timeout gracefully
- [ ] Multiple rapid commands don't crash hub
- [ ] Large device lists don't overflow buffers
- [ ] Connection failure shows helpful error

## Expected Behavior

### Transmit-Only Mode (scanning_mode=False)
- ✅ Game commands broadcast immediately
- ✅ Acknowledgments sent to webapp
- ❌ PING commands ignored/rejected
- ❌ No device scanning capability
- ✅ Faster, simpler operation

### Full Scanning Mode (scanning_mode=True)
- ✅ Game commands broadcast immediately
- ✅ Acknowledgments sent to webapp
- ✅ PING commands trigger device scan
- ✅ Device responses collected for 5 seconds
- ✅ Device list sent to webapp after timeout
- ⚠️  Requires modules to implement deviceScan response

## Common Issues

### Issue: No serial port appears in browser
**Solution:**
- Use Chrome or Edge browser
- Serve webapp over HTTPS or localhost
- Check USB cable is data-capable (not charge-only)
- Try different USB port
- Restart browser

### Issue: Hub connects but commands don't work
**Solution:**
- Check ESP-NOW initialization succeeded
- Verify external antenna is connected
- Ensure modules are powered on
- Check modules are on same WiFi channel
- Look at hub serial output for errors

### Issue: Device scanning returns empty list
**Solution:**
- Modules must implement `/deviceScan` response (Phase 1 of plan.md)
- Check modules are responding to PING
- Verify scanning_mode=True in main.py
- Try RSSI threshold "all" instead of numeric value
- Increase scan timeout if needed

### Issue: Commands work but device list doesn't update
**Solution:**
- Check Python backend processed the response
- Look for JSON parsing errors in browser console
- Verify device list response format matches spec
- Check for RSSI/battery field issues

### Issue: Webapp shows "Python not ready"
**Solution:**
- Wait for PyScript initialization (can take 10-30 seconds on first load)
- Check browser console for PyScript errors
- Ensure pyscript.toml is correct
- Try hard refresh (Ctrl+Shift+R)

## Performance Benchmarks

### Expected Timings
- Hub startup: ~2 seconds
- Serial command processing: ~10-50ms
- ESP-NOW transmission: ~10-20ms
- Device scan duration: 5 seconds (configurable)
- Webapp connection: ~1-2 seconds
- PyScript initialization: 10-30 seconds (first load)

### Throughput
- Serial bandwidth: 115200 baud (~11 KB/s)
- Commands per second: ~20-50 (limited by asyncio loop)
- Max devices per scan: ~50-100 (depends on response timing)

## Debug Output

### Hub Serial Output (Normal Operation)
```
Simple Hub initialized (scanning_mode=True)
Connecting ESP-NOW...
ESP-NOW connected. MAC: aa:bb:cc:dd:ee:ff
{"type":"ready","mode":"scanning","mac":"aa:bb:cc:dd:ee:ff"}
Hub running. Press Ctrl+C to stop.
Waiting for commands from webapp via Serial...
Starting device scan (RSSI: all)
PING sent
Device found: M-aabbcc (RSSI: -45)
Device found: M-112233 (RSSI: -62)
Scan complete: 2 devices found
{"type":"devices","list":[...]}
Game command sent: 0
{"type":"ack","command":"Notes","status":"sent"}
```

### Browser Console (Normal Operation)
```
Python backend initialized!
PyScript ready
Serial TX: {"cmd":"PING","rssi":"all"}
Serial RX: {"type":"devices","list":[...]}
=== JavaScript onDevicesUpdated called ===
Received 2 devices from hub
Serial TX: {"cmd":"Notes"}
Serial RX: {"type":"ack","command":"Notes","status":"sent"}
```

## Next Steps After Testing

1. **If transmit-only mode works but scanning doesn't:**
   - Implement Phase 1 of plan.md (module device scan responses)
   - Add battery sensor reading to modules
   - Test PING/response with modules

2. **If everything works:**
   - Test with multiple classrooms
   - Measure real-world range and reliability
   - Deploy to production
   - Start Hub V2 development

3. **If Serial connection is unreliable:**
   - Add error recovery and reconnection logic
   - Implement connection health monitoring
   - Add manual reconnect button

## Test Script

Save as `test_hub.py` and run to automate Serial testing:

```python
#!/usr/bin/env python3
import serial
import json
import time

# Open serial port
ser = serial.Serial('/dev/ttyUSB0', 115200, timeout=1)
time.sleep(2)  # Wait for hub to boot

print("Testing Simple Hub...")

# Test 1: PING
print("\nTest 1: PING")
cmd = {"cmd": "PING", "rssi": "all"}
ser.write((json.dumps(cmd) + "\n").encode())
time.sleep(6)  # Wait for scan timeout
response = ser.read(ser.in_waiting).decode()
print(f"Response: {response}")

# Test 2: Game command
print("\nTest 2: Game command")
cmd = {"cmd": "Notes"}
ser.write((json.dumps(cmd) + "\n").encode())
time.sleep(0.5)
response = ser.read(ser.in_waiting).decode()
print(f"Response: {response}")

# Test 3: Off command
print("\nTest 3: Off command")
cmd = {"cmd": "Off"}
ser.write((json.dumps(cmd) + "\n").encode())
time.sleep(0.5)
response = ser.read(ser.in_waiting).decode()
print(f"Response: {response}")

print("\nTests complete!")
ser.close()
```

Run with:
```bash
chmod +x test_hub.py
./test_hub.py
```

