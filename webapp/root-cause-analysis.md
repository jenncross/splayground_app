# Root Cause Analysis: REPL Command Failures

## Executive Summary

Analysis of console logs and code flow reveals that REPL commands are failing due to board state mismatches. The board enters raw REPL mode when normal REPL mode is expected, causing `get_board_info()` to receive "OK" responses instead of version information.

---

## Observed Failure Pattern

### Console Log Analysis

```
📤 [SerialAdapter] Writing 1 bytes: <CTRL-D>
📥 [SerialAdapter] Read 49 bytes: OK\r\nMPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>
⏱️ [SerialAdapter] Read timeout after 500ms
⏱️ [SerialAdapter] Read timeout after 500ms
...
```

### What This Indicates

1. **Ctrl-D was sent**: `<CTRL-D>` written successfully
2. **Board executed something**: Response contains "OK" 
3. **Board entered raw REPL**: Message `raw REPL; CTRL-B to exit` displayed
4. **No version info**: Expected MicroPython version line not present
5. **No further output**: Subsequent reads timeout

### Expected vs Actual Behavior

| Expected | Actual |
|----------|--------|
| Send Ctrl-D at `>>>` prompt | Send Ctrl-D at unknown state |
| Board performs soft reset | Board executes command (shows "OK") |
| Version info displayed | "raw REPL; CTRL-B to exit" displayed |
| Return to `>>>` prompt | Stuck at `>` prompt |

---

## Root Cause Identification

### Primary Issue: Board State Unknown

**Problem:** `get_board_info()` assumes the board is in normal REPL mode (`>>>`) when Ctrl-D is sent.

**Reality:** The board may be in raw REPL mode (`>`) or transitional state from previous operations.

**Code Location:** `webSerial.py` line 339-346

```python
async def get_board_info(self, timeout_ms=5000):
    print("🔍 Getting board info from normal REPL...")
    # ...
    
    # Send Ctrl-D to trigger soft reset
    print("🔍 Sending Ctrl-D to trigger soft reset...")
    await self.send_raw('\x04')  # Assumes board is in normal REPL
    await asyncio.sleep(0.5)
```

### Why Board State is Wrong

#### Theory 1: Previous Operation Left Board in Raw REPL

**Sequence:**
1. Previous upload or REPL operation enters raw REPL mode (Ctrl-A sent)
2. Operation completes but Ctrl-B (exit raw REPL) not sent
3. Board remains in raw REPL mode (`>` prompt)
4. `get_board_info()` sends Ctrl-D
5. In raw REPL, Ctrl-D means "execute buffered command", not "soft reset"
6. Board executes (empty command → "OK"), then soft reboots
7. After reboot, board is in raw REPL mode by default

**Evidence from code:** `enter_raw_repl_mode()` (line 220) sends Ctrl-A but there's no guarantee corresponding `exit_raw_repl_mode()` is always called.

#### Theory 2: Soft Reset Enters Raw REPL

**Sequence:**
1. Board is in normal REPL mode
2. Ctrl-D triggers soft reset
3. During reset, some configuration causes boot into raw REPL mode
4. Board displays "raw REPL; CTRL-B to exit" after reset
5. No version info displayed because raw REPL doesn't show it

**Evidence from logs:** The message "MPY: soft reboot" followed by "raw REPL; CTRL-B to exit" suggests a reset occurred, but landed in wrong mode.

#### Theory 3: Modal Sequence Error

Looking at the call chain from `hubSetupModal.js`:

```javascript
// Line 102: Stop JSON read loop
const stopResult = await PyBridge.queryDeviceInfoForSetup();

// Line 114: Get board info
const infoResult = await PyBridge.getDeviceBoardInfo();
```

The `queryDeviceInfoForSetup()` function may be putting the board in an unexpected state before `get_board_info()` is called.

---

## Control Flow Analysis

### Execution Path to Failure

#### Step 1: Connection Established
```python
# webSerial.py line 56-72
async def connect(self):
    success = await self.adapter.connect()
    if success:
        self._start_json_read_loop()  # Starts reading JSON
```

**State after:** JSON read loop active, board likely running main.py

#### Step 2: Query Device Info Preparation
```javascript
// hubSetupModal.js line 102
const stopResult = await PyBridge.queryDeviceInfoForSetup();
```

This calls Python function that stops JSON read loop:

```python
# Hypothesized function (not in uploaded code)
async def query_device_info_for_setup(self):
    self._stop_json_read_loop()
    # What else happens here?
```

**State after:** JSON read loop stopped, board state unclear

#### Step 3: Get Board Info Called
```python
# webSerial.py line 331-383
async def get_board_info(self, timeout_ms=5000):
    # Sends Ctrl-D immediately
    await self.send_raw('\x04')
```

**Problem:** No state verification before sending Ctrl-D

**State after:** Board in raw REPL mode, no version info received

### Missing State Transitions

**Your code flow:**
```
[Unknown State] → Ctrl-D → [Raw REPL Mode]
```

**Expected flow:**
```
[Unknown State] → Ctrl-B → [Normal REPL] → Ctrl-D → [Soft Reset] → [Normal REPL with Version]
```

---

## Comparison with Working Implementation

### How micro-repl Gets Board Info

From `serial.js` lines 317-336:

```javascript
if (named) {
  // Step 1: Interrupt any running code
  await writer.write(CONTROL_C);
  terminal.clear();
  await sleep(options.baudRate * 50 / baudRate);
  
  // Step 2: Enter paste mode (NOT raw REPL)
  waitForMachine = true;
  await writer.write(CONTROL_E);  // Ctrl-E for paste mode
  
  // Step 3: Execute Python code to get name
  await writer.write(MACHINE);
  await writer.write(CONTROL_D);  // In paste mode, Ctrl-D means execute
  
  // Step 4: Wait for result
  name = await machine.promise;
  waitForMachine = false;
}
```

**Key differences:**

1. **Sends Ctrl-C first**: Interrupts running code, ensures clean state
2. **Uses paste mode**: Ctrl-E instead of relying on soft reset
3. **Executes specific code**: Runs Python to get board name
4. **Waits for accumulator**: Uses promise that resolves when output complete

**Your approach:**
1. ~~No interrupt sent~~
2. ~~No state verification~~
3. **Sends Ctrl-D directly**: Assumes normal REPL mode
4. **Expects boot message**: Relies on soft reset displaying version

---

## Secondary Issues

### Issue 1: No Operation Interlock

**Problem:** No mechanism prevents concurrent operations.

**Code Evidence:**
```python
# webSerial.py has no 'busy' or 'evaluating' flag
async def get_board_info(self):
    # Can be called while upload in progress
    # Can be called while another get_board_info running
```

**Comparison with micro-repl:**
```javascript
eval: async (code, options) => {
  if (port && !evaluating) {  // Check if busy
    evaluating = 1;
    // ... do work ...
    evaluating = 0;
  }
  else onerror(reason('eval', evaluating));
}
```

**Consequence:** Operations can overlap, corrupting board state.

### Issue 2: Read Loop Stop/Start Timing

**Problem:** Stopping read loop doesn't guarantee immediate cleanup.

**Code Location:** `webSerial.py` lines 114-120

```python
def _stop_json_read_loop(self):
    if self.read_loop_stop:
        print("🛑 Stopping JSON read loop...")
        self.read_loop_stop()  # Triggers stop
        self.read_loop_stop = None
        print("✅ JSON read loop stopped")
```

**Issue:** The stop function only sets `running = false`. The actual reader cleanup is asynchronous:

```javascript
// serialAdapter.js line 327-339
return () => {
  console.log('⏹️ [SerialAdapter] Stopping read loop');
  running = false;  // Set flag
  if (currentReader) {
    currentReader.cancel().catch(() => {});  // Async cleanup
  }
};
```

**Timing sequence:**
```
Python: _stop_json_read_loop() called
  ↓
JS: running = false set
  ↓ (no await here)
Python: immediately calls get_board_info()
  ↓
Python: sends Ctrl-D
  ↓ (meanwhile...)
JS: currentReader.cancel() executing
  ↓
JS: reader cleanup in finally block
```

**Consequence:** Operations proceed before reader fully released.

**Evidence from logs:**
```
🛑 Stopping JSON read loop...
✅ JSON read loop stopped         ← Printed immediately
⏸️ Waiting for read loop to stop... ← JavaScript adds delay
📡 Getting device information...   ← But continues anyway
```

### Issue 3: Buffer Draining Strategy

**Problem:** `enter_repl_mode()` drains buffer by reading with timeouts.

**Code Location:** `webSerial.py` lines 216-220

```python
print("🧹 Draining buffer...")
for i in range(5):
    chunk = await self.read_raw(200)
    if not chunk:
        break
```

**Issue:** Each `read_raw()` call acquires and releases reader lock:

```javascript
// serialAdapter.js line 220-251
async read(timeoutMs = 2000) {
  const reader = await this.getReader();  // Acquire lock
  try {
    // ... read with timeout ...
  } finally {
    await this.releaseReader();  // Release lock
  }
}
```

If data is flowing, this creates lock contention. If reader from `startReadLoop` hasn't fully released, `getReader()` may fail or delay.

**Comparison with micro-repl:** No explicit draining needed because stream processor always consumes data. State change (`evaluating`, `waitForMachine`) simply routes it differently.

### Issue 4: No Verification of State Transitions

**Problem:** Functions assume state transitions succeed without verification.

**Example:** `enter_raw_repl_mode()` (line 220-238)

```python
async def enter_raw_repl_mode(self):
    # Send Ctrl-A
    await self.send_raw('\x01')
    await asyncio.sleep(0.3)
    
    # Verify
    result = await self.adapter.readUntil('raw REPL; CTRL-B to exit', 2000)
    if result.found:
        print("✅ Entered raw REPL mode")
    else:
        print("⚠️ May not be in raw REPL mode")
        # BUT CONTINUES ANYWAY - no exception raised
```

**Issue:** Function prints warning but doesn't prevent subsequent operations that assume raw REPL mode.

**Example:** `exit_raw_repl_mode()` (line 255-270)

```python
async def exit_raw_repl_mode(self):
    # Send Ctrl-B
    await self.send_raw('\x02')
    
    # Verify
    result = await self.adapter.readUntil('>>>', 1000)
    if result.found:
        print("✓ Exited to normal REPL mode")
    else:
        print("⚠️ Exit may not have completed")
        # Again, no exception - continues with uncertain state
```

**Consequence:** State uncertainty propagates through operation sequence.

---

## Specific Fix Requirements

### Fix 1: Add Board State Reset to get_board_info()

**Current code:**
```python
async def get_board_info(self, timeout_ms=5000):
    # Sends Ctrl-D immediately
    await self.send_raw('\x04')
```

**Proposed fix:**
```python
async def get_board_info(self, timeout_ms=5000):
    print("Getting board info...")
    
    # Reset to known state
    # Step 1: Exit raw REPL if present
    await self.send_raw('\x02')  # Ctrl-B
    await asyncio.sleep(0.3)
    
    # Step 2: Interrupt any running code
    await self.send_raw('\x03\x03')  # Ctrl-C twice
    await asyncio.sleep(0.3)
    
    # Step 3: Drain any pending output
    for i in range(5):
        await self.read_raw(200)
    
    # Step 4: Now send Ctrl-D for soft reset
    await self.send_raw('\x04')
    await asyncio.sleep(1.0)  # Longer wait for boot
    
    # Step 5: Collect response
    info = ''
    for i in range(15):  # More attempts
        chunk = await self.read_raw(500)
        info += chunk
        if 'MicroPython' in info:
            break
        if not chunk:  # No more data
            break
    
    # Step 6: Parse version
    if 'MicroPython' in info:
        lines = info.split('\n')
        for line in lines:
            if 'MicroPython' in line:
                return line.strip()
    
    raise Exception(f"MicroPython version not found. Response: {info[:300]}")
```

**Rationale:**
- Ctrl-B ensures exit from raw REPL mode
- Ctrl-C ensures clean interrupt of running code
- Draining removes stale output
- Longer sleep allows boot to complete
- More read attempts capture slow output
- Extended response in exception aids debugging

### Fix 2: Add Operation Interlock

**Add to class:**
```python
class WebSerial:
    def __init__(self):
        # Existing code...
        self.busy = False
        self.current_operation = None
```

**Add to each major operation:**
```python
async def get_board_info(self, timeout_ms=5000):
    if self.busy:
        raise Exception(f"Cannot get board info: {self.current_operation} in progress")
    
    self.busy = True
    self.current_operation = 'get_board_info'
    try:
        # ... existing code ...
    finally:
        self.busy = False
        self.current_operation = None
```

**Rationale:** Prevents concurrent operations from corrupting board state.

### Fix 3: Add Explicit Wait After Stopping Read Loop

**Current code:**
```python
def _stop_json_read_loop(self):
    if self.read_loop_stop:
        self.read_loop_stop()
        self.read_loop_stop = None
```

**Proposed fix:**
```python
async def _stop_json_read_loop(self):
    if self.read_loop_stop:
        print("Stopping JSON read loop...")
        self.read_loop_stop()
        self.read_loop_stop = None
        
        # Wait for reader to fully release
        await asyncio.sleep(0.5)
        
        print("JSON read loop stopped")
```

**Rationale:** Gives asynchronous cleanup time to complete before next operation.

### Fix 4: Raise Exceptions on State Verification Failures

**Current code:**
```python
result = await self.adapter.readUntil('raw REPL; CTRL-B to exit', 2000)
if result.found:
    print("✅ Entered raw REPL mode")
else:
    print("⚠️ May not be in raw REPL mode")
    # Continues anyway
```

**Proposed fix:**
```python
result = await self.adapter.readUntil('raw REPL; CTRL-B to exit', 2000)
if result.found:
    print("✅ Entered raw REPL mode")
else:
    raise Exception(
        f"Failed to enter raw REPL mode. "
        f"Expected 'raw REPL; CTRL-B to exit', "
        f"got: {result.buffer[:200]}"
    )
```

**Rationale:** Fail fast rather than continuing with uncertain state.

---

## Alternative Approach: Use Paste Mode

Based on micro-repl's successful implementation, consider using paste mode instead of soft reset:

```python
async def get_board_info_via_paste(self):
    """Get board info using paste mode (more reliable)"""
    print("Getting board info via paste mode...")
    
    # Ensure clean state
    await self.send_raw('\x02\x03\x03')  # Ctrl-B, Ctrl-C, Ctrl-C
    await asyncio.sleep(0.5)
    
    # Drain buffer
    for i in range(5):
        await self.read_raw(200)
    
    # Enter paste mode
    await self.send_raw('\x05')  # Ctrl-E
    await asyncio.sleep(0.3)
    
    # Send code to get version
    code = """import sys
print(sys.version)
"""
    await self.send_raw(code)
    
    # Execute (Ctrl-D in paste mode)
    await self.send_raw('\x04')
    await asyncio.sleep(0.8)
    
    # Collect response
    response = ''
    for i in range(15):
        chunk = await self.read_raw(500)
        response += chunk
        if 'MicroPython' in response:
            break
        if not chunk:
            break
    
    # Parse version
    lines = response.split('\n')
    for line in lines:
        if 'MicroPython' in line and 'on' in line:
            return line.strip()
    
    raise Exception(f"No version found. Response: {response[:300]}")
```

**Advantages:**
- Paste mode has well-defined entry/exit
- Ctrl-E unambiguous regardless of current state
- Executing Python code more reliable than parsing boot message
- Similar to micro-repl's proven approach

---

## Testing Strategy

### Test 1: Verify Board State Before Operations

Add debug logging to understand board state:

```python
async def check_board_state(self):
    """Debug function to check what state board is in"""
    print("=== Checking board state ===")
    
    # Send newline
    await self.send_raw('\r\n')
    await asyncio.sleep(0.2)
    
    # Read response
    response = await self.read_raw(1000)
    print(f"Response: {repr(response)}")
    
    if '>>>' in response:
        return "normal_repl"
    elif '>' in response and 'raw REPL' not in response:
        return "raw_repl"
    elif 'paste mode' in response:
        return "paste_mode"
    else:
        return "unknown"
```

### Test 2: Implement Fixed get_board_info()

Replace current implementation with Fix 1 above and test:

```python
# In hubSetupModal.js or test script
try {
    const info = await PyBridge.getDeviceBoardInfo();
    console.log("Success:", info);
} catch (error) {
    console.error("Failed:", error);
}
```

### Test 3: Compare Paste Mode vs Soft Reset

Implement both approaches and compare success rates:

```python
# Test A: Original approach (soft reset)
try:
    info1 = await serial.get_board_info()
    print(f"Soft reset approach: {info1}")
except Exception as e:
    print(f"Soft reset failed: {e}")

# Test B: Paste mode approach
try:
    info2 = await serial.get_board_info_via_paste()
    print(f"Paste mode approach: {info2}")
except Exception as e:
    print(f"Paste mode failed: {e}")
```

---

## Recommended Implementation Order

1. **Immediate fix (highest priority):**
   - Implement Fix 1 (board state reset in `get_board_info()`)
   - Add Ctrl-B before Ctrl-D
   - Add longer waits and more read attempts

2. **Short-term improvements:**
   - Implement Fix 2 (operation interlock)
   - Implement Fix 4 (exceptions on verification failure)
   - Add `check_board_state()` debug function

3. **Medium-term improvements:**
   - Implement Fix 3 (explicit wait after stopping read loop)
   - Implement paste mode alternative
   - Add comprehensive state tracking

4. **Long-term refactoring:**
   - Consider stream-based architecture like micro-repl
   - Eliminate start/stop read loop pattern
   - Use state flags for data routing

---

## Summary of Findings

### Primary Root Cause

**Board state mismatch:** `get_board_info()` sends Ctrl-D assuming normal REPL mode, but board is in raw REPL mode. This causes execution of empty command ("OK") followed by reset into raw REPL, instead of displaying version information.

### Contributing Factors

1. **No state verification** before operations
2. **No operation interlock** to prevent overlaps
3. **Async cleanup timing** not accounted for
4. **State verification warnings** don't halt execution
5. **Buffer draining** causes lock contention

### Evidence Strength

| Finding | Evidence | Confidence |
|---------|----------|------------|
| Board in raw REPL | Console log shows "raw REPL; CTRL-B to exit" | High |
| Ctrl-D executed command | Console log shows "OK" response | High |
| No state reset before Ctrl-D | Code inspection of `get_board_info()` | High |
| Timing issues after stop | Async stop function returns immediately | Medium |
| Lock contention possible | Code inspection of `read_raw()` | Medium |

### Next Steps

1. Implement Fix 1 and test with actual hardware
2. Add debug logging to confirm board state before operations
3. Compare with paste mode alternative
4. Based on results, proceed with additional fixes in recommended order
