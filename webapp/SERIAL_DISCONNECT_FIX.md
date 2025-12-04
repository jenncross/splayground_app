# Serial Disconnect Detection Fix

## Problem
When the USB serial connection was lost (cable unplugged, hub reset, etc.), the webapp would:
- Show error messages only in the console (which users don't see)
- Keep showing "connected" status in the UI
- Not notify the user that the connection was lost

## Solution
Implemented automatic disconnect detection with user notifications:

### Changes Made

#### 1. webSerial.py - Added Disconnect Callback Support
- Added `on_disconnect_callback` property to WebSerial class
- Modified `_read_loop()` to call the disconnect callback when connection is lost
- Callback is triggered when errors contain "lost" or "disconnected" in the message

#### 2. main.py - Handle Disconnect Events
- Created `on_serial_disconnect()` function that:
  - Updates connection state variables (`serial_connected`, `hub_device_name`, `hub_connection_mode`)
  - Calls `window.onHubDisconnected()` to update JavaScript UI state
  - Shows user-visible toast notification with helpful message
- Connected the callback: `serial.on_disconnect_callback = on_serial_disconnect`

#### 3. main.js - Expose showToast to Python
- Added `window.showToast = showToast` to allow Python backend to show notifications

## How It Works Now

### Connection Loss Flow:
1. **USB disconnected** - Cable unplugged, hub crashes, or port taken by another app
2. **Serial read loop detects error** - `_read_loop()` catches exception with "lost" or "disconnected"
3. **Callback fired** - `on_disconnect_callback(error_msg)` is called
4. **Python state updated** - `on_serial_disconnect()` clears connection variables
5. **UI updated** - `window.onHubDisconnected()` updates connection bar to show disconnected
6. **User notified** - Toast appears: "⚠️ USB connection lost! Check cable and reconnect."

### User Experience:
- ✅ Connection status bar immediately shows "Hub Disconnected" (yellow)
- ✅ Toast notification appears with clear error message
- ✅ Device list is cleared (no stale devices shown)
- ✅ User knows exactly what happened and what to do

## Testing
To test this fix:
1. Connect to hub via USB Serial
2. Verify connection status shows "Hub: USB Serial Hub" (green)
3. Unplug USB cable or reset hub
4. **Expected behavior:**
   - Connection status changes to "Hub Disconnected" (yellow)
   - Toast notification appears: "⚠️ USB connection lost! Check cable and reconnect."
   - No stale devices shown in device list

## Related Files Modified
- `/webapp/mpy/webSerial.py` - Added disconnect callback support
- `/webapp/main.py` - Implemented disconnect handler and state management
- `/webapp/js/main.js` - Exposed showToast to Python backend

## Notes
- The existing `onHubDisconnected()` callback was already implemented in the JavaScript side
- This fix just ensures it gets called when serial connection is lost
- The same pattern could be applied to BLE disconnection if needed
- Toast appears for 5 seconds (longer than default 3s) since it's an important error

