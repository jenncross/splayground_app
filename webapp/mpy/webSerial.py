"""
Web Serial API Wrapper for USB Hub Communication
=================================================

This module provides a Python wrapper around the Web Serial API for USB communication
with the Simple Hub. It mirrors the webBluetooth.py interface for consistency.

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

code = '''
from pyscript import window
import asyncio

class WebSerial:
    """Web Serial API wrapper for USB communication with hub"""
    
    def __init__(self):
        """Initialize Serial wrapper"""
        self.port = None
        self.reader = None
        self.writer = None
        self.on_data_callback = None
        self.read_loop_task = None
        
    async def connect(self):
        """
        Request and connect to serial port
        
        Returns:
            bool: True if connected successfully, False otherwise
        """
        try:
            # Check API availability
            if not hasattr(window.navigator, 'serial'):
                print("ERROR: Web Serial API not available!")
                print("Please use Chrome or Edge browser")
                print("Note: HTTPS required (or localhost)")
                return False
            
            # Request port from user
            print("Requesting serial port...")
            self.port = await window.navigator.serial.requestPort()
            
            if not self.port:
                print("No port selected")
                return False
            
            print("Port selected")
            
            # Open port with 115200 baud (standard for ESP32)
            options = window.Object.new()
            options.baudRate = 115200
            await self.port.open(options)
            print("Port opened at 115200 baud")
            
            # Get reader and writer streams
            self.reader = self.port.readable.getReader()
            self.writer = self.port.writable.getWriter()
            
            # Start background read loop
            self.read_loop_task = asyncio.create_task(self._read_loop())
            
            print("Serial connected successfully")
            return True
            
        except Exception as e:
            error_msg = str(e)
            if "cancelled" in error_msg.lower() or "aborted" in error_msg.lower():
                print("User cancelled serial port selection")
                return False
            else:
                print(f"Serial connection error: {e}")
                import traceback
                traceback.print_exc()
                return False
    
    async def _read_loop(self):
        """
        Background task to continuously read serial data
        
        This runs in the background and calls the callback for each complete line
        """
        try:
            decoder = window.TextDecoder.new()
            line_buffer = ""
            
            while True:
                # Read chunk from serial port
                result = await self.reader.read()
                
                # Check if reader was closed
                if result.done:
                    print("Serial reader closed")
                    break
                
                # Decode bytes to text
                chunk = decoder.decode(result.value, window.Object.new(stream=True))
                
                if not chunk:
                    continue
                
                # Add to line buffer
                line_buffer += chunk
                
                # Process complete lines
                while "\\n" in line_buffer:
                    line, line_buffer = line_buffer.split("\\n", 1)
                    line = line.strip()
                    
                    if line and self.on_data_callback:
                        try:
                            self.on_data_callback(line)
                        except Exception as cb_error:
                            print(f"Callback error: {cb_error}")
        
        except Exception as e:
            error_msg = str(e)
            # Don't print error if connection was intentionally closed
            if "cancel" not in error_msg.lower() and "abort" not in error_msg.lower():
                print(f"Read loop error: {e}")
                import traceback
                traceback.print_exc()
    
    async def send(self, message):
        """
        Send data to serial port
        
        Args:
            message: String to send (newline will be added automatically)
        
        Returns:
            bool: True if sent successfully, False otherwise
        """
        if not self.writer:
            print("ERROR: Not connected to serial port!")
            return False
        
        try:
            # Encode message with newline
            encoder = window.TextEncoder.new()
            data = encoder.encode(message + "\\n")
            
            # Write to port
            await self.writer.write(data)
            
            print(f"Serial TX: {message}")
            return True
            
        except Exception as e:
            print(f"Serial send error: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    async def disconnect(self):
        """Disconnect from serial port and cleanup resources"""
        try:
            # Cancel read loop
            if self.read_loop_task:
                self.read_loop_task.cancel()
                try:
                    await self.read_loop_task
                except asyncio.CancelledError:
                    pass
                self.read_loop_task = None
            
            # Close reader
            if self.reader:
                try:
                    await self.reader.cancel()
                except:
                    pass
                self.reader = None
            
            # Release writer
            if self.writer:
                try:
                    self.writer.releaseLock()
                except:
                    pass
                self.writer = None
            
            # Close port
            if self.port:
                try:
                    await self.port.close()
                except:
                    pass
                self.port = None
            
            print("Serial disconnected")
            
        except Exception as e:
            print(f"Disconnect error: {e}")
    
    def is_connected(self):
        """
        Check if currently connected to serial port
        
        Returns:
            bool: True if connected, False otherwise
        """
        return self.port is not None and self.reader is not None
'''

