"""
Simple Hub - USB Serial to ESP-NOW Bridge
==========================================

This hub connects the webapp (via USB Serial/WebUSB) to playground modules (via ESP-NOW).
Based on the headless_controller.py pattern with added Serial communication.

Hardware: ESP32-C6 with external antenna
"""

import sys
import select
import json
import time
import asyncio
import utilities.now as now

# Game command mapping (matching headless_controller)
GAME_MAP = {
    "Notes": 0,
    "Play": 0,
    "Shake": 1,
    "Hot_cold": 2,
    "Jump": 3,
    "Rainbow": 5,
    "Clap": 4,
    "Pause": -1,
    "Off": -1
}

class SimpleHub:
    """Simple USB Serial to ESP-NOW bridge hub"""
    
    def __init__(self, scanning_mode=False):
        """
        Initialize hub
        
        Args:
            scanning_mode: If True, handle PING responses for device scanning.
                          If False, transmit-only mode (like headless controller).
        """
        self.scanning_mode = scanning_mode
        self.n = None
        self.running = False
        
        # Device scanning state (only used if scanning_mode=True)
        self.scanning = False
        self.scan_start_time = 0
        self.scan_timeout = 5.0  # 5 seconds
        self.discovered_devices = {}  # MAC -> device info
        self.scan_rssi_threshold = "all"
        
        # Serial input buffer
        self.serial_buffer = ""
        
        self._debug(f"Simple Hub initialized (scanning_mode={scanning_mode})")
    
    def _debug(self, msg):
        """Print debug message to stderr (not interfering with JSON on stdout)"""
        print(msg, file=sys.stderr)
    
    def connect(self):
        """Initialize ESP-NOW connection (same pattern as headless_controller)"""
        self._debug("Connecting ESP-NOW...")
        
        def my_callback(msg, mac, rssi):
            """ESP-NOW message callback"""
            if self.scanning_mode and self.scanning:
                # Only process messages if we're in scanning mode and currently scanning
                try:
                    msg_str = msg.decode('utf-8') if isinstance(msg, bytes) else msg
                    if '/deviceScan' in msg_str:
                        data = json.loads(msg_str)
                        self._handle_device_response(mac, data, rssi)
                    elif '/ping' in msg_str:
                        # Debug: show ping responses
                        mac_str = ':'.join(f'{b:02x}' for b in mac)
                        self._debug(f"PING response from {mac_str}, RSSI: {rssi}")
                except Exception as e:
                    self._debug(f"Callback error: {e}")
        
        # Initialize ESP-NOW with callback
        if self.scanning_mode:
            self.n = now.Now(my_callback)
        else:
            # Transmit-only: use default callback
            self.n = now.Now()
        
        self.n.connect(antenna=True)  # Use external antenna
        self.mac = self.n.wifi.config('mac')
        mac_str = ':'.join(f'{b:02x}' for b in self.mac)
        self._debug(f"ESP-NOW connected. MAC: {mac_str}")
        
        # Send ready message to webapp via Serial
        self._send_serial({
            "type": "ready", 
            "mode": "scanning" if self.scanning_mode else "transmit_only",
            "mac": mac_str
        })
    
    def shutdown(self):
        """Send shutdown command (same as headless_controller)"""
        stop = json.dumps({'topic':'/game', 'value':-1})
        self.n.publish(stop)
        self._debug("Shutdown command sent")
    
    def ping(self):
        """Send PING command (same as headless_controller)"""
        ping = json.dumps({'topic':'/ping', 'value':1})
        self.n.publish(ping)
        self._debug("PING sent")
    
    def notify(self):
        """Send notify command (same as headless_controller)"""
        note = json.dumps({'topic':'/notify', 'value':1})
        self.n.publish(note)
        self._debug("Notify sent")
    
    def choose(self, game):
        """Send game command (same as headless_controller)"""
        setup = json.dumps({'topic':'/game', 'value':game})
        self.n.publish(setup)
        self._debug(f"Game command sent: {game}")
    
    def _handle_device_response(self, mac, data, rssi):
        """Process device scan response (only used in scanning mode)"""
        # Convert MAC to string
        mac_str = ':'.join(f'{b:02x}' for b in mac)
        
        # Apply RSSI filtering if needed
        if self.scan_rssi_threshold != "all":
            if rssi < self.scan_rssi_threshold:
                return  # Too weak, ignore
        
        # Extract device info
        device_info = {
            "id": data.get('id', mac_str),
            "mac": mac_str,
            "rssi": rssi,
            "battery": data.get('battery', 0),
            "type": data.get('type', 'unknown')
        }
        
        # Deduplicate by MAC (keep strongest signal)
        if mac_str in self.discovered_devices:
            if rssi > self.discovered_devices[mac_str]['rssi']:
                self.discovered_devices[mac_str] = device_info
        else:
            self.discovered_devices[mac_str] = device_info
        
        self._debug(f"Device found: {device_info['id']} (RSSI: {rssi})")
    
    def _send_serial(self, data):
        """Send JSON message to webapp via Serial"""
        try:
            msg = json.dumps(data)
            print(msg)  # Print to stdout (USB Serial) - JSON only!
            # Note: MicroPython's sys.stdout doesn't have flush(), but print() auto-flushes
        except Exception as e:
            self._debug(f"Serial send error: {e}")
    
    def _check_serial_input(self):
        """Check for incoming Serial data (non-blocking)"""
        # Use select to check if stdin has data
        rlist, _, _ = select.select([sys.stdin], [], [], 0)
        
        if rlist:
            try:
                # Read available data
                chunk = sys.stdin.read(1)
                if chunk:
                    self.serial_buffer += chunk
                    
                    # Check for complete lines
                    while '\n' in self.serial_buffer:
                        line, self.serial_buffer = self.serial_buffer.split('\n', 1)
                        line = line.strip()
                        
                        if line:
                            self._process_serial_command(line)
            except Exception as e:
                self._debug(f"Serial read error: {e}")
    
    def _process_serial_command(self, line):
        """Process command from webapp"""
        try:
            cmd = json.loads(line)
            cmd_type = cmd.get("cmd")
            
            if cmd_type == "PING" and self.scanning_mode:
                # Start device scan
                rssi = cmd.get("rssi", "all")
                self._start_scan(rssi)
            
            elif cmd_type in GAME_MAP:
                # Send game command using choose() method
                game_num = GAME_MAP[cmd_type]
                self.choose(game_num)
                
                # Send acknowledgment to webapp
                self._send_serial({
                    "type": "ack",
                    "command": cmd_type,
                    "status": "sent"
                })
            
            elif cmd_type == "Off":
                # Use shutdown() method
                self.shutdown()
                self._send_serial({
                    "type": "ack",
                    "command": "Off",
                    "status": "sent"
                })
            
            else:
                self._debug(f"Unknown command: {cmd_type}")
        
        except Exception as e:
            self._debug(f"Command processing error: {e}")
    
    def _start_scan(self, rssi_threshold):
        """Start device scan (only works in scanning_mode)"""
        if not self.scanning_mode:
            self._debug("Scanning disabled in transmit-only mode")
            return
        
        self._debug(f"Starting device scan (RSSI: {rssi_threshold})")
        
        self.scanning = True
        self.scan_start_time = time.time()
        self.discovered_devices = {}
        self.scan_rssi_threshold = rssi_threshold
        
        # Send PING using ping() method
        self.ping()
    
    def _check_scan_timeout(self):
        """Check if scan has timed out and send results"""
        if not self.scanning:
            return
        
        elapsed = time.time() - self.scan_start_time
        
        if elapsed >= self.scan_timeout:
            # Scan complete
            self.scanning = False
            
            # Format device list
            device_list = list(self.discovered_devices.values())
            
            # Send to webapp
            self._send_serial({
                "type": "devices",
                "list": device_list
            })
            
            self._debug(f"Scan complete: {len(device_list)} devices found")
    
    async def run(self):
        """Main event loop"""
        self.connect()
        self.running = True
        
        self._debug("Hub running. Press Ctrl+C to stop.")
        self._debug("Waiting for commands from webapp via Serial...")
        
        try:
            while self.running:
                # Check for Serial commands
                self._check_serial_input()
                
                # Check scan timeout (scanning mode only)
                if self.scanning_mode:
                    self._check_scan_timeout()
                
                # Small delay for responsiveness
                await asyncio.sleep(0.01)
        
        except KeyboardInterrupt:
            self._debug("\nShutting down...")
        
        finally:
            self.close()
    
    def close(self):
        """Cleanup resources"""
        if self.n:
            self.n.close()
        self._debug("Hub stopped")

# Run hub
# Set scanning_mode=True for full device scanning support
# Set scanning_mode=False for transmit-only mode (like headless controller)
hub = SimpleHub(scanning_mode=True)
asyncio.run(hub.run())
