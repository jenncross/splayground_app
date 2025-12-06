"""
Web Serial API Wrapper for USB Hub Communication (Hybrid Architecture)
========================================================================

This module provides a Python wrapper around the JavaScript Serial Adapter,
keeping all business logic in Python while delegating browser API operations
to native JavaScript to avoid Pyodide async issues.

Architecture:
- JavaScript (serialAdapter.js): Handles all Web Serial API operations
- Python (this file): Contains all business logic, protocol handling, orchestration

Web Serial API:
- Supported in Chrome/Edge browsers
- Requires user gesture to request port
- Line-delimited JSON protocol (same as BLE)

Usage:
    serial = WebSerial()
    await serial.connect()
    serial.on_data_callback = handle_data
    await serial.send(message)
    await serial.disconnect()

Protocol:
- Messages are line-delimited JSON
- Each message ends with newline character
- Hub sends: {"type": "devices", "list": [...]} or {"type": "ack", ...}
- Webapp sends: {"cmd": "PING", "rssi": ...} or {"cmd": "Notes", ...}
"""

from pyscript import window
import asyncio
import json

class WebSerial:
    """Web Serial API wrapper for USB communication with hub (thin Python layer)"""
    
    def __init__(self):
        """Initialize Serial wrapper"""
        self.on_data_callback = None
        self.on_connection_lost_callback = None
        self.read_loop_stop = None
        print("🔌 WebSerial initialized [v2024.12.05-hybrid]")
        
        # Check if JS adapter is available
        if not hasattr(window, 'serialAdapter'):
            raise Exception("serialAdapter not found! Make sure js/adapters/serialAdapter.js is loaded.")
        
        self.adapter = window.serialAdapter
        
    def is_connected(self):
        """Check if serial port is connected"""
        return self.adapter.isConnected()
        
    async def connect(self):
        """
        Request and connect to serial port
        
        Returns:
            bool: True if connected successfully, False otherwise
        """
        try:
            # Use JS adapter for connection
            success = await self.adapter.connect()
            
            if success:
                # Start read loop for JSON messages
                self._start_json_read_loop()
                print("Serial connected successfully")
            
            return success
            
        except Exception as e:
            print(f"Serial connection error: {e}")
            return False
    
    def _start_json_read_loop(self):
        """Start background read loop for JSON messages using JS adapter"""
        if self.read_loop_stop:
            # Stop existing loop
            self.read_loop_stop()
        
        # Start read loop with JS adapter
        def on_data(data):
            """Handle incoming data from JS adapter"""
            if not data:
                return
                
            # Parse line-delimited JSON messages
            lines = data.split('\n')
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                try:
                    message = json.loads(line)
                    if self.on_data_callback:
                        self.on_data_callback(message)
                except json.JSONDecodeError:
                    # Not valid JSON, ignore
                    pass
        
        def on_error(error):
            """Handle read errors"""
            print(f"Serial read error: {error}")
            if self.on_connection_lost_callback:
                self.on_connection_lost_callback()
        
        # Start loop and store stop function
        self.read_loop_stop = self.adapter.startReadLoop(on_data, on_error)
    
    def _stop_json_read_loop(self):
        """Stop the JSON read loop"""
        if self.read_loop_stop:
            self.read_loop_stop()
            self.read_loop_stop = None
            print("Stopped JSON read loop")
    
    async def disconnect(self):
        """Disconnect from serial port"""
        try:
            # Stop read loop
            self._stop_json_read_loop()
            
            # Disconnect via JS adapter
            await self.adapter.disconnect()
            
            print("Serial disconnected")
            return True
            
        except Exception as e:
            print(f"Disconnect error: {e}")
            return False
    
    async def send(self, message):
        """
        Send JSON message to hub
        
        Args:
            message: JSON string or dict to send
            
        Returns:
            bool: True if sent successfully
        """
        try:
            # Convert dict to JSON string if needed
            if isinstance(message, dict):
                message = json.dumps(message)
            
            # Add newline terminator
            if not message.endswith('\n'):
                message += '\n'
            
            # Send via JS adapter
            await self.adapter.write(message)
            return True
            
        except Exception as e:
            print(f"Serial send error: {e}")
            return False
    
    # ============================================================================
    # REPL Mode Operations (Business Logic - stays in Python)
    # ============================================================================
    
    async def send_raw(self, data):
        """Send raw bytes without adding newline (for REPL commands)"""
        await self.adapter.write(data)
    
    async def read_raw(self, timeout_ms=2000):
        """Read raw data with timeout (delegates to JS adapter)"""
        return await self.adapter.read(timeout_ms)
    
    async def enter_repl_mode(self):
        """Switch from JSON mode to REPL mode for firmware upload
        
        REPL Control Commands:
        - Ctrl-C (\x03): Cancel input or interrupt running code
        - Ctrl-A (\x01): Enter raw REPL mode (permanent paste mode)
        - Ctrl-B (\x02): Exit to normal REPL mode
        - Ctrl-D (\x04): Soft reset on blank line
        
        Business logic: Orchestrates the REPL entry sequence
        """
        print("Entering REPL mode...")
        
        # Stop JSON read loop
        self._stop_json_read_loop()
        
        # Give it a moment to fully stop
        await asyncio.sleep(0.2)
        
        # More aggressive interrupt sequence (matching serialUploader.js)
        # Send multiple CTRL-C to interrupt any running code
        print("Interrupting any running code...")
        for i in range(3):
            await self.send_raw('\x03')
            await asyncio.sleep(0.05)  # 50ms delay between attempts
        
        # Wait for interruption to take effect
        await asyncio.sleep(0.2)
        
        # Drain any existing output
        print("Draining buffer...")
        for i in range(5):
            chunk = await self.read_raw(200)
            if chunk:
                print(f"Drained: {chunk[:100]}")
        
        # Send CTRL-A to enter raw REPL mode
        print("Sending CTRL-A to enter raw REPL...")
        await self.send_raw('\x01')
        await asyncio.sleep(0.3)  # 300ms delay
        
        # Wait for "raw REPL; CTRL-B to exit" prompt
        result = await self.adapter.readUntil('raw REPL', 5000)
        
        if result.found:
            print("✓ Entered raw REPL mode")
            # Drain any remaining welcome text
            for i in range(5):
                await self.read_raw(200)
        else:
            # Be lenient - continue anyway
            print("⚠️ May not have entered raw REPL properly")
            print("⚠️ This might work anyway - continuing...")
    
    async def exit_raw_repl_mode(self):
        """Exit raw REPL mode and return to normal REPL (>>>) prompt
        
        Sends CTRL-B to exit raw REPL mode.
        Does NOT return to JSON mode - for that, restart the device.
        """
        print("Exiting raw REPL mode...")
        # Send CTRL-B to exit raw REPL
        await self.send_raw('\x02')
        await asyncio.sleep(0.2)
        
        # Verify we got back to normal REPL
        result = await self.adapter.readUntil('>>>', 1000)
        if result.found:
            print("✓ Exited to normal REPL mode (>>>)")
        else:
            print("⚠️ Exit may not have completed (no >>> prompt), continuing anyway")
    
    async def exit_repl_mode(self):
        """DEPRECATED: Use exit_raw_repl_mode() instead for clarity
        
        This is an alias for backward compatibility with error handling code.
        """
        await self.exit_raw_repl_mode()
    
    async def execute_repl_command(self, code, timeout_ms=5000):
        """Execute Python code in raw REPL mode
        
        Protocol:
        1. Write code (not echoed back in raw REPL)
        2. Send CTRL-D (\x04) to execute
        3. Read response (with timeout to prevent hanging)
        4. Check for errors
        
        Args:
            code: Python code to execute
            timeout_ms: Maximum time to wait for response
        
        Raises:
            Exception if execution errors or timeout
        
        Business logic: REPL command protocol orchestration
        """
        start_time = window.Date.now()
        
        try:
            # Write the code
            await self.send_raw(code)
            
            # Send CTRL-D to execute
            await self.send_raw('\x04')
            await asyncio.sleep(0.2)
            
            # Read response (try multiple times to get all output)
            response = ''
            for i in range(5):
                if (window.Date.now() - start_time) > timeout_ms:
                    raise Exception(f"REPL command timeout after {timeout_ms}ms")
                
                chunk = await self.read_raw(1000)
                response += chunk
                if not chunk:
                    break
            
            # Check for errors
            if 'Traceback' in response or 'Error:' in response:
                error_snippet = response[:200] if response else "Unknown error"
                raise Exception(f"REPL execution error: {error_snippet}")
            
            return response
            
        except Exception as e:
            raise Exception(f"Failed to execute REPL command: {str(e)}")
    
    # ============================================================================
    # File Operations (Business Logic - stays in Python)
    # ============================================================================
    
    async def get_board_info(self, timeout_ms=3000):
        """Get MicroPython version and board info
        
        Sends Ctrl-D from normal REPL to trigger soft reset,
        which displays board information.
        
        Business logic: Parse and extract board information
        """
        print("Getting board info...")
        start_time = window.Date.now()
        
        try:
            # Send Ctrl-D to trigger soft reset and show version
            await self.send_raw('\x04')
            await asyncio.sleep(0.5)
            
            # Read the output (version info)
            info = ''
            for i in range(8):
                if (window.Date.now() - start_time) > timeout_ms:
                    raise Exception(f"Timeout waiting for board info ({timeout_ms}ms)")
                
                chunk = await self.read_raw(500)
                info += chunk
                
                # Stop early if we found MicroPython
                if 'MicroPython' in info:
                    break
            
            # Parse version and board from output
            if 'MicroPython' in info:
                lines = info.split('\n')
                for line in lines:
                    if 'MicroPython' in line:
                        board_info = line.strip()
                        print(f"Board: {board_info}")
                        return board_info
            
            # Didn't find MicroPython in output
            if info:
                raise Exception(f"Unexpected board response: {info[:100]}")
            else:
                raise Exception("No response from board")
                
        except Exception as e:
            raise Exception(f"Failed to get board info: {str(e)}")
    
    async def ensure_directory(self, dir_path):
        """Create directory on device via REPL
        
        Business logic: Directory creation command construction
        """
        if not dir_path or dir_path in ['/', '.']:
            return
        
        print(f"Creating directory: {dir_path}")
        
        code = f"""
import os
try:
    os.mkdir('{dir_path}')
except OSError:
    pass  # Already exists
"""
        await self.execute_repl_command(code, timeout_ms=3000)
    
    async def upload_file(self, file_path, content):
        """Upload single file to device using triple-quoted string
        
        Business logic: File content escaping and upload command construction
        """
        print(f"Uploading {file_path} ({len(content)} bytes)")
        
        # Escape content for triple-quoted Python string
        content_escaped = content.replace('\\', '\\\\').replace("'''", "\\'\\'\\'")
        
        # Build Python code to write the file
        upload_code = f"""
with open('{file_path}', 'w') as f:
    f.write('''{content_escaped}''')
print('OK')
"""
        
        try:
            # Execute the upload command
            timeout_ms = max(5000, len(content) // 100)  # ~10KB/sec minimum
            response = await self.execute_repl_command(upload_code, timeout_ms=timeout_ms)
            
            # Check for OK response
            if 'OK' in response or not response:
                print(f"✓ Uploaded {file_path}")
            else:
                print(f"⚠️ Upload completed but unexpected response: {response[:100]}")
            
        except Exception as e:
            raise Exception(f"Upload failed for {file_path}: {str(e)}")
    
    async def execute_file(self, file_path, timeout_ms=10000):
        """Execute/run a specific Python file on the device
        
        Business logic: File execution command construction
        """
        print(f"Executing {file_path}...")
        
        code = f"exec(open('{file_path}').read())"
        response = await self.execute_repl_command(code, timeout_ms=timeout_ms)
        
        print(f"✓ Executed {file_path}")
        return response
    
    async def soft_reset(self, wait_time_ms=1500):
        """Soft reset the device using Ctrl-D
        
        Business logic: Soft reset command and timing
        """
        print("Soft resetting device...")
        await self.send_raw('\x04')
        await asyncio.sleep(wait_time_ms / 1000.0)
        print(f"✓ Soft reset complete (waited {wait_time_ms}ms)")
    
    async def hard_reset(self, wait_time_ms=2000):
        """Hard reset the device (full hardware reboot)
        
        Business logic: Hard reset command construction using machine.reset()
        """
        print("Hard resetting device (hardware reboot)...")
        
        # Execute reset command in raw REPL
        reset_code = """
import machine
machine.reset()
"""
        try:
            await self.send_raw(reset_code)
            await self.send_raw('\x04')  # CTRL-D to execute
            
            # Wait for device to reset
            await asyncio.sleep(wait_time_ms / 1000.0)
            print(f"✓ Hard reset initiated (waited {wait_time_ms}ms for reboot)")
        except Exception as e:
            # Reset command may not return a response since device reboots
            print(f"Hard reset command sent (device is rebooting...)")
