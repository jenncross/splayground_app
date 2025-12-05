# Hub Firmware Upload Feature

## Overview

This feature allows users to upload the Simple Hub firmware to their ESP32 directly through the web app via USB Serial connection. With just a few clicks, a blank ESP32 can be transformed into a fully functional Smart Playground hub.

## What Was Implemented

### 1. **Directory Structure**
```
webapp/
├── hubCode/                    # NEW - Hub firmware files
│   ├── manifest.js            # File manifest and loader
│   ├── main.py                # Hub main program
│   ├── controller.py          # ESP-NOW controller
│   ├── ssd1306.py            # Display driver
│   └── utilities/            # Utility modules
│       ├── utilities.py      # Button, Motor, Buzzer, Battery
│       ├── lights.py         # NeoPixel control
│       ├── i2c_bus.py        # I2C and accelerometer
│       ├── wifi.py           # WiFi connectivity
│       ├── now.py            # ESP-NOW protocol
│       ├── colors.py         # Color definitions
│       ├── base64.py         # Base64 encoding
│       ├── lc709203f.py      # Battery gauge
│       └── secrets.py        # WiFi credentials template
├── js/
│   ├── utils/
│   │   └── serialUploader.js  # NEW - Serial upload protocol handler
│   └── components/
│       ├── connectedEmptyState.js  # UPDATED - Added "Setup Hub" button
│       ├── hubSetupModal.js        # NEW - Upload modal with progress
│       └── messageHistory.js       # UPDATED - Integrated modal
```

### 2. **Key Components**

#### A. **SerialUploader** (`js/utils/serialUploader.js`)
- Handles MicroPython raw REPL protocol
- Implements file upload with progress tracking
- Creates directory structure on ESP32
- Handles large files with chunking
- Manages serial port reader/writer streams

#### B. **Hub Firmware Manifest** (`hubCode/manifest.js`)
- Lists all 12 files to upload
- Fetches files at runtime via `fetch()` API
- No need to embed Python code in JavaScript
- Easy to maintain - just edit the `.py` files directly

#### C. **Hub Setup Modal** (`js/components/hubSetupModal.js`)
- Beautiful modal interface with 4 states:
  1. **Initial**: Confirmation screen with info
  2. **Uploading**: Progress bar and file-by-file status
  3. **Success**: Instructions for next steps
  4. **Error**: Detailed error with retry option

#### D. **Connected Empty State** (`js/components/connectedEmptyState.js`)
- Shows "Setup as Hub" button for Serial connections
- Hidden for Bluetooth connections (not applicable)
- Opens modal when clicked

### 3. **Python Backend Integration** (`main.py`)
- `get_serial_port()`: Exposes serial port to JavaScript
- `release_serial_port()`: Returns control after upload
- Integrates with existing serial communication system

### 4. **Upload Protocol**
Uses MicroPython raw REPL mode:
```
1. Send CTRL-C (\x03) → Stop running code
2. Send CTRL-A (\x01) → Enter raw REPL mode
3. For each file:
   a. Create directory if needed
   b. Send file write commands
   c. Track progress
4. Send CTRL-D (\x04) → Execute & save
5. Reset board
```

## How to Use

### For End Users:

1. **Connect ESP32 via USB**
   - Open the web app
   - Click "Connect Hub"
   - Select "USB Serial"
   - Choose your ESP32's serial port

2. **Upload Firmware**
   - You'll see a "Setup as Hub" button
   - Click it to open the upload modal
   - Review the information
   - Click "Start Upload"
   - Wait ~30 seconds for upload to complete

3. **Finish Setup**
   - Press the reset button on your ESP32
   - Wait 2 seconds for hub to boot
   - Reconnect to start using your hub

### For Developers:

#### Updating Hub Firmware:
1. Edit files in `new_simple_hub/`
2. Copy updated files to `webapp/hubCode/`:
   ```bash
   cp new_simple_hub/*.py webapp/hubCode/
   cp new_simple_hub/utilities/*.py webapp/hubCode/utilities/
   ```
3. Changes are live immediately - no build step needed!

#### Adding New Files:
1. Add file to `webapp/hubCode/` (or `hubCode/utilities/`)
2. Update `webapp/hubCode/manifest.js`:
   ```javascript
   export const HUB_FILES = [
       // ... existing files
       { path: 'utilities/new_file.py', remotePath: 'utilities/new_file.py' },
   ];
   ```
3. Update `webapp/pyscript.toml`:
   ```toml
   [files]
   "hubCode/utilities/new_file.py" = "./hubCode/utilities/new_file.py"
   ```

## Files Modified

### New Files:
- `webapp/hubCode/` - Entire directory (13 files)
- `webapp/js/utils/serialUploader.js`
- `webapp/js/components/hubSetupModal.js`

### Modified Files:
- `webapp/js/components/connectedEmptyState.js` - Added Setup Hub button
- `webapp/js/components/messageHistory.js` - Integrated modal
- `webapp/js/main.js` - Passed connection mode parameter
- `webapp/js/utils/pyBridge.js` - Added serial port access functions
- `webapp/main.py` - Added Python backend functions
- `webapp/pyscript.toml` - Added new files to manifest

## Technical Details

### Upload Process Flow:
```
User clicks "Setup Hub"
    ↓
JavaScript gets serial port from Python
    ↓
Modal opens, user confirms
    ↓
SerialUploader acquires reader/writer streams
    ↓
Enters MicroPython raw REPL mode
    ↓
Creates 'utilities' directory on ESP32
    ↓
Uploads 12 files one by one:
  - main.py (7.9KB)
  - controller.py (5.3KB)
  - ssd1306.py (4.6KB)
  - utilities/utilities.py (2KB)
  - utilities/lights.py (2KB)
  - utilities/i2c_bus.py (2.7KB)
  - utilities/wifi.py (615B)
  - utilities/now.py (2KB)
  - utilities/colors.py (264B)
  - utilities/base64.py (14KB)
  - utilities/lc709203f.py (7.2KB)
  - utilities/secrets.py (37B)
    ↓
Exits raw REPL mode
    ↓
Soft resets ESP32
    ↓
Releases streams back to Python
    ↓
Shows success screen
```

### Error Handling:
- Connection lost during upload
- File upload failures (with retry)
- Serial port busy (Thonny/Arduino IDE)
- Board not responding
- CRC errors (logged but non-fatal)
- Timeout handling at multiple levels

### Browser Compatibility:
- **Chrome/Edge**: ✅ Full support (Web Serial API)
- **Firefox**: ❌ No Web Serial API support
- **Safari**: ❌ No Web Serial API support

### Security:
- User must explicitly consent to upload
- No automatic firmware updates
- All code is visible and open source
- Requires physical USB connection

## Testing Checklist

- [ ] Upload to blank ESP32-C6
- [ ] Upload to ESP32 with existing code
- [ ] Cancel upload mid-way
- [ ] Disconnect during upload (error handling)
- [ ] Multiple uploads in sequence
- [ ] ESP32-S3 compatibility test
- [ ] Large file handling (base64.py - 14KB)
- [ ] Directory creation on first upload
- [ ] Serial port conflict detection
- [ ] Progress bar accuracy
- [ ] Success/error state UI

## Future Enhancements

1. **Compression**: Add gzip compression for faster uploads
2. **Verification**: Read back files to verify integrity
3. **Selective Upload**: Allow updating individual files
4. **Backup**: Download existing code before overwrite
5. **Version Detection**: Check hub firmware version
6. **OTA Updates**: Future wireless firmware updates
7. **Custom Configs**: Allow editing secrets.py before upload
8. **Multi-board Support**: Detect board type and adapt

## Troubleshooting

### "Could not get serial port"
- Make sure you're connected via USB Serial (not Bluetooth)
- Try disconnecting and reconnecting

### "Port is already in use"
- Close Thonny IDE
- Close Arduino IDE
- Close other browser tabs using the port
- Restart your browser

### "Upload failed"
- Check USB cable connection
- Press reset button on ESP32
- Try a different USB port
- Check ESP32 has enough storage

### "Hub not responding after upload"
- Press reset button on ESP32
- Check USB cable is connected
- Try unplugging and replugging USB
- Check for error messages in browser console

## Credits

Based on the file upload protocol from `file_upload_app` created by your team member, adapted for web app integration with improved UX and error handling.

---

**Status**: ✅ Fully Implemented and Ready for Testing
**Date**: December 5, 2024
**Total Lines Added**: ~900 lines of code
**Files Created**: 14 new files
**Files Modified**: 6 existing files

