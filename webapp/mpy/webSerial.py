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
    
    async def _stop_json_read_loop(self):
        """Stop the JSON read loop and wait for cleanup to complete"""
        if self.read_loop_stop:
            print("🛑 Stopping JSON read loop...")
            self.read_loop_stop()
            self.read_loop_stop = None
            
            # Wait for async cleanup to complete (reader.cancel() is async)
            # This prevents operations from starting before reader is fully released
            await asyncio.sleep(0.5)
            
            print("✅ JSON read loop stopped and cleaned up")
    
    async def disconnect(self):
        """Disconnect from serial port"""
        try:
            # Stop read loop
            await self._stop_json_read_loop()
            
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
        # Debug logging
        printable = data.replace('\x03', '<CTRL-C>').replace('\x04', '<CTRL-D>').replace('\x01', '<CTRL-A>').replace('\x02', '<CTRL-B>')
        print(f"📤 Sending: {repr(printable)}")
        await self.adapter.write(data)
    
    async def read_raw(self, timeout_ms=2000):
        """Read raw data with timeout (delegates to JS adapter)"""
        result = await self.adapter.read(timeout_ms)
        if result:
            # Debug logging
            printable = result.replace('\x03', '<CTRL-C>').replace('\x04', '<CTRL-D>').replace('\x01', '<CTRL-A>').replace('\x02', '<CTRL-B>')
            print(f"📥 Received ({len(result)} bytes): {repr(printable[:200])}")
        return result
    
    async def enter_repl_mode(self):
        """Interrupt running code and get to normal REPL (>>> prompt)
        
        Stops JSON read loop and sends Ctrl-C to interrupt any running code
        (typically main.py), which brings up the normal REPL prompt (>>>).
        
        Does NOT enter raw REPL mode - that's enter_raw_repl_mode().
        
        REPL Control Commands:
        - Ctrl-C (\x03): Cancel input or interrupt running code → normal REPL (>>>)
        - Ctrl-A (\x01): Enter raw REPL mode (permanent paste mode) → raw REPL (>)
        - Ctrl-B (\x02): Exit raw REPL mode → normal REPL (>>>)
        - Ctrl-D (\x04): Soft reset on blank line
        """
        print("🔄 Entering normal REPL mode...")
        
        # Stop JSON read loop (waits for cleanup to complete)
        await self._stop_json_read_loop()
        
        # Send multiple CTRL-C to interrupt any running code (main.py)
        print("🛑 Interrupting running code with Ctrl-C...")
        for i in range(3):
            await self.send_raw('\x03')  # Ctrl-C
            await asyncio.sleep(0.05)
        
        # Wait for interruption to take effect
        await asyncio.sleep(0.2)
        
        # Drain any existing output
        print("🧹 Draining buffer...")
        for i in range(5):
            chunk = await self.read_raw(200)
            if chunk:
                print(f"Drained: {chunk[:100]}")
        
        print("✅ Should now be at normal REPL (>>> prompt)")
    
    async def enter_raw_repl_mode(self):
        """Enter raw REPL mode from normal REPL
        
        Sends Ctrl-A to enter raw REPL mode (> prompt).
        Assumes we're already at normal REPL (>>> prompt).
        
        Raw REPL is like permanent paste mode - no echo, used for uploading files.
        """
        print("🔄 Entering raw REPL mode...")
        
        # Send CTRL-A to enter raw REPL mode
        print("📤 Sending Ctrl-A to enter raw REPL...")
        await self.send_raw('\x01')  # Ctrl-A
        await asyncio.sleep(0.3)
        
        # Wait for "raw REPL; CTRL-B to exit" prompt
        result = await self.adapter.readUntil('raw REPL', 5000)
        
        if result.found:
            print("✅ Entered raw REPL mode (> prompt)")
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
    
    async def execute_repl_command(self, code, timeout_ms=5000, chunk_size=None):
        """Execute Python code in raw REPL mode
        
        Protocol:
        1. Write code (not echoed back in raw REPL)
        2. Send CTRL-D (\x04) to execute
        3. Read response (with timeout to prevent hanging)
        4. Check for errors
        
        Args:
            code: Python code to execute
            timeout_ms: Maximum time to wait for response
            chunk_size: If set, send code in chunks with delays (for older MicroPython)
        
        Raises:
            Exception if execution errors or timeout
        
        Business logic: REPL command protocol orchestration
        """
        start_time = window.Date.now()
        
        try:
            # Write the code (chunked if requested for compatibility with older MicroPython)
            if chunk_size:
                # Send in chunks with pacing to avoid buffer overflow on C3/older devices
                print(f"Sending {len(code)} bytes in {chunk_size}-byte chunks...")
                for i in range(0, len(code), chunk_size):
                    chunk = code[i:i+chunk_size]
                    await self.send_raw(chunk)
                    # 10ms delay between chunks (micro-repl's proven approach)
                    await asyncio.sleep(0.01)
                print(f"✓ All chunks sent")
            else:
                # Send all at once (fast path for newer MicroPython)
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
    
    async def get_board_info(self, timeout_ms=5000):
        """Get MicroPython version and board info using PASTE MODE
        
        Uses paste mode (Ctrl-E) to execute Python code that prints os.uname().version.
        This returns the full version string including board type (e.g., ESP32C6).
        More reliable than parsing boot messages from soft reset.
        
        Approach based on micro-repl's proven implementation.
        
        Business logic: Parse and extract board information
        """
        print("🔍 Getting board info via paste mode...")
        start_time = window.Date.now()
        
        try:
            # Step 1: Reset to clean state
            print("🔍 Step 1: Resetting to clean state...")
            await self.send_raw('\x02')  # Ctrl-B (exit raw REPL if in it)
            await asyncio.sleep(0.2)
            await self.send_raw('\x03\x03')  # Double Ctrl-C (interrupt any running code)
            await asyncio.sleep(0.5)
            
            # Step 2: Drain buffer to clear any pending output
            print("🔍 Step 2: Draining buffer...")
            for i in range(5):
                chunk = await self.read_raw(200)
                if chunk:
                    print(f"   Drained: {repr(chunk[:60])}")
            
            # Step 3: Enter paste mode (Ctrl-E)
            print("🔍 Step 3: Entering paste mode (Ctrl-E)...")
            await self.send_raw('\x05')  # Ctrl-E
            await asyncio.sleep(0.3)
            
            # Step 4: Send Python code to get version and machine info
            print("🔍 Step 4: Sending Python code to get version...")
            code = """import os
u = os.uname()
print(f"MicroPython {u.version}; {u.machine}")
"""
            await self.send_raw(code)
            
            # Step 5: Execute the code (Ctrl-D in paste mode)
            print("🔍 Step 5: Executing code (Ctrl-D)...")
            await self.send_raw('\x04')  # Ctrl-D
            await asyncio.sleep(0.8)
            
            # Step 6: Collect response
            response = ''
            print("🔍 Step 6: Collecting response...")
            for i in range(15):
                if (window.Date.now() - start_time) > timeout_ms:
                    print(f"❌ Timeout after {timeout_ms}ms. Received so far: {repr(response[:200])}")
                    raise Exception(f"Timeout waiting for board info ({timeout_ms}ms)")
                
                chunk = await self.read_raw(500)
                if chunk:
                    print(f"   Got chunk ({len(chunk)} bytes): {repr(chunk[:80])}")
                    response += chunk
                
                # Stop if we found MicroPython version
                if 'MicroPython' in response:
                    print(f"✅ Found MicroPython version string!")
                    break
                
                # Stop if no more data
                if not chunk:
                    break
            
            # Step 7: Parse version from response
            print("🔍 Step 7: Parsing version from response...")
            if 'MicroPython' in response:
                lines = response.split('\n')
                for line in lines:
                    # Look for the actual output line (not echoed code)
                    # Valid lines start with "MicroPython " followed by version or git hash
                    # Skip lines that are paste mode echo (contain "===", "print(", etc.)
                    stripped = line.strip()
                    if (stripped.startswith('MicroPython ') and 
                        'on' in line and
                        '===' not in line and
                        'print(' not in line and
                        '{' not in line):  # Skip f-string template
                        board_info = stripped
                        print(f"✅ Board detected: {board_info}")
                        return board_info
            
            # Didn't find MicroPython version in output
            print(f"❌ No MicroPython version found in response")
            print(f"   Full response: {repr(response[:300])}")
            raise Exception(f"MicroPython version not found in response")
                
        except Exception as e:
            print(f"❌ get_board_info failed: {str(e)}")
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
            # Use chunked upload for large files (> 2KB) to support older MicroPython
            # Helps ESP32-C3 with limited RAM and older firmware versions
            # Doesn't hurt newer devices (C6) - just slightly slower
            timeout_ms = max(5000, len(content) // 100)  # ~10KB/sec minimum
            chunk_size = 256 if len(upload_code) > 2048 else None
            
            if chunk_size:
                print(f"Using chunked upload ({chunk_size} bytes/chunk) for compatibility")
            
            response = await self.execute_repl_command(
                upload_code, 
                timeout_ms=timeout_ms,
                chunk_size=chunk_size
            )
            
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
