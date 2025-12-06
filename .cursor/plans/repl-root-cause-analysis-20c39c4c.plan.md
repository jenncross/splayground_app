<!-- 20c39c4c-2166-459f-99ba-179d8cd44b6e fae22326-dad1-4a13-8164-2548f7fd4d2a -->
# Root Cause Analysis Plan

## Semantic Mistakes Identified

### 1. **Inconsistent REPL Entry Pattern**

**Problem**: `get_board_info()` reimplements its own REPL entry logic instead of using existing helper functions.

**Evidence**:

- `upload_firmware()` (main.py:833-839) properly calls: `enter_repl_mode()` → `enter_raw_repl_mode()`
- `get_board_info()` (webSerial.py:331-387) has its own sequence: Ctrl-B → Ctrl-C → read
- This duplication leads to inconsistent behavior

**Location**: `webapp/mpy/webSerial.py:331-387`

```python
# Current get_board_info() - inconsistent approach
async def get_board_info(self):
    # Step 1: Exit raw REPL if we're in it (Ctrl-B)
    await self.send_raw('\x02')  # Doesn't use exit_raw_repl_mode()
    
    # Step 2: Interrupt running code (Ctrl-C)  
    await self.send_raw('\x03')  # Doesn't use enter_repl_mode()
```

**Expected**: Should use `enter_repl_mode()` like other functions do.

---

### 2. **Misleading Function Name: `enter_repl_mode()`**

**Problem**: The function name implies entering REPL, but the device is already in REPL - it just interrupts running code.

**Evidence**: Function comment (line 185-188) says:

```python
"""Interrupt running code and get to normal REPL (>>> prompt)

Stops JSON read loop and sends Ctrl-C to interrupt any running code
(typically main.py), which brings up the normal REPL prompt (>>>).
"""
```

**Better name**: `interrupt_to_repl()` or `reset_to_repl()` would be more accurate.

**Impact**: Creates confusion about device state and what the function actually does.

---

### 3. **Missing Operation Interlock (Busy Flag)**

**Problem**: No mechanism prevents concurrent operations from interfering with each other.

**Evidence**:

- micro-repl uses `evaluating` flag (complete-repl-comparison.md:79-80)
- Your code has no such protection
- Multiple functions can call `send_raw()` / `read_raw()` simultaneously

**Consequence**: If `queryDeviceInfo()` is called while an upload is happening, operations will corrupt each other's state.

**Location**: All async functions in webSerial.py lack this protection.

---

### 4. **Async Cleanup Not Awaited**

**Problem**: `_stop_json_read_loop()` triggers async cleanup but doesn't wait for it.

**Evidence**:

```python
# webSerial.py:114-120 - synchronous function
def _stop_json_read_loop(self):
    if self.read_loop_stop:
        self.read_loop_stop()  # This returns immediately
        self.read_loop_stop = None
```

But the stop function triggers async cleanup:

```javascript
// serialAdapter.js:349-355
return () => {
    running = false;
    if (currentReader) {
        currentReader.cancel().catch(() => {});  // Async!
    }
};
```

**Consequence**: Next operation starts before reader is fully released, causing lock conflicts.

**Root Cause Analysis document** confirms this (line 234-283).

---

### 5. **Lenient State Verification**

**Problem**: Functions verify state transitions but continue anyway on failure.

**Evidence**: `enter_raw_repl_mode()` (line 241-251):

```python
result = await self.adapter.readUntil('raw REPL', 5000)
if result.found:
    print("✅ Entered raw REPL mode")
else:
    # Be lenient - continue anyway
    print("⚠️ May not have entered raw REPL properly")
    print("⚠️ This might work anyway - continuing...")
    # NO EXCEPTION RAISED!
```

**Consequence**: Uncertain device state propagates through subsequent operations, causing unpredictable failures.

---

### 6. **get_board_info() Doesn't Match Working Implementation**

**Problem**: Your approach differs significantly from the working micro-repl implementation.

**Your approach** (webSerial.py:331-387):

1. Send Ctrl-B (exit raw REPL - but we may not be in raw REPL)
2. Send Ctrl-C (interrupt - but may interrupt version banner output)
3. Read and hope to find "MicroPython" string
4. Getting tracebacks from interrupted main.py instead

**micro-repl approach** (complete-repl-comparison.md:796-875):

1. Send Ctrl-C (interrupt to clean state)
2. Send Ctrl-E (enter paste mode - well-defined state)
3. Execute Python code: `import sys; print(sys.version)`
4. Send Ctrl-D (execute in paste mode)
5. Wait for accumulator to have output
6. Parse Python output

**Key difference**: micro-repl uses **paste mode** with **executed Python code**, not soft reset with boot message parsing.

---

### 7. **Duplicate Drainin Logic**

**Problem**: `enter_repl_mode()` drains buffer with repeated `read_raw()` calls, each acquiring/releasing reader lock.

**Evidence** (webSerial.py:217-221):

```python
for i in range(5):
    chunk = await self.read_raw(200)
    if chunk:
        print(f"Drained: {chunk[:100]}")
```

Each `read_raw()` call does (serialAdapter.js:220-251):

```javascript
async read(timeoutMs) {
    const reader = await this.getReader();  // Acquire lock
    try {
        // ... read ...
    } finally {
        await this.releaseReader();  // Release lock
    }
}
```

**micro-repl approach**: Stream processor always consumes data into accumulator. No explicit draining needed because stream never stops.

**Consequence**: Repeated lock acquisition creates timing windows for race conditions.

---

### 8. **State Tracking Missing**

**Problem**: No tracking of device mode (normal REPL vs raw REPL vs paste mode).

**Evidence**:

- micro-repl tracks state with `evaluating`, `resetting`, `waitForMachine` flags
- Your code has no such tracking
- Functions guess device state instead of knowing it

**Consequence**: Operations assume device state instead of verifying it, leading to failures like the one observed.

---

## Procedural Root Cause Discovery Plan

### Phase 1: State Verification (Highest Priority)

**Goal**: Understand what state the device is actually in when failures occur.

#### Test 1.1: Add State Logging Before get_board_info()

Add a debug function to check device state:

```python
async def check_device_state(self):
    """Send newline and see what prompt we get"""
    await self.send_raw('\r\n')
    await asyncio.sleep(0.3)
    response = await self.read_raw(1000)
    
    if '>>>' in response:
        return "normal_repl"
    elif '>' in response and 'raw REPL' not in response:
        return "raw_repl"  
    elif 'paste mode' in response:
        return "paste_mode"
    else:
        return f"unknown: {repr(response[:100])}"
```

Call this before get_board_info() to log actual state.

**Expected outcome**: Confirms device is in raw REPL when we expect normal REPL.

---

#### Test 1.2: Log Full Sequence of get_board_info()

Add extensive logging to every step:

```python
async def get_board_info(self, timeout_ms=3000):
    print("=" * 60)
    print("GET_BOARD_INFO START")
    print("=" * 60)
    
    # Check initial state
    print("1. Checking initial device state...")
    initial_state = await self.check_device_state()
    print(f"   Initial state: {initial_state}")
    
    # Step 1: Ctrl-B
    print("2. Sending Ctrl-B...")
    await self.send_raw('\x02')
    await asyncio.sleep(0.2)
    after_ctrl_b = await self.read_raw(500)
    print(f"   After Ctrl-B: {repr(after_ctrl_b[:100])}")
    
    # Step 2: Ctrl-C
    print("3. Sending Ctrl-C...")
    await self.send_raw('\x03')
    await asyncio.sleep(0.5)
    after_ctrl_c = await self.read_raw(500)
    print(f"   After Ctrl-C: {repr(after_ctrl_c[:100])}")
    
    # Continue with reads...
```

**Expected outcome**: See exactly what responses we get at each step, identify where version info should appear.

---

### Phase 2: Fix Async Timing Issues

**Goal**: Ensure cleanup completes before next operation starts.

#### Test 2.1: Make _stop_json_read_loop() Async and Add Wait

```python
async def _stop_json_read_loop(self):
    if self.read_loop_stop:
        print("🛑 Stopping JSON read loop...")
        self.read_loop_stop()
        self.read_loop_stop = None
        
        # Wait for async cleanup to complete
        await asyncio.sleep(0.5)  # Give reader.cancel() time to finish
        
        print("✅ JSON read loop stopped and cleaned up")
```

Update all callers to `await self._stop_json_read_loop()`.

**Expected outcome**: Eliminates reader lock conflicts.

---

#### Test 2.2: Verify Reader Available Before Operations

Add check before any read operation:

```python
async def ensure_reader_available(self):
    """Wait for reader to be available"""
    max_attempts = 10
    for i in range(max_attempts):
        if not self.adapter.reader:  # Reader is available
            return True
        await asyncio.sleep(0.1)
    raise Exception("Reader still locked after waiting")
```

Call before `get_board_info()` starts reading.

**Expected outcome**: Ensures operations don't start while cleanup in progress.

---

### Phase 3: Implement Operation Interlock

**Goal**: Prevent concurrent operations.

#### Test 3.1: Add Busy Flag

```python
class WebSerial:
    def __init__(self):
        # ... existing code ...
        self.busy = False
        self.current_operation = None
```

#### Test 3.2: Add Lock Decorator

```python
def operation_lock(fn):
    async def wrapper(self, *args, **kwargs):
        if self.busy:
            raise Exception(
                f"Operation blocked: {self.current_operation} in progress"
            )
        
        self.busy = True
        self.current_operation = fn.__name__
        try:
            return await fn(self, *args, **kwargs)
        finally:
            self.busy = False
            self.current_operation = None
    
    return wrapper
```

Apply to all major operations:

```python
@operation_lock
async def get_board_info(self, timeout_ms=3000):
    # ... implementation ...

@operation_lock  
async def upload_file(self, file_path, content):
    # ... implementation ...
```

**Expected outcome**: Clear error message if operations overlap.

---

### Phase 4: Test Alternative Implementations

**Goal**: Compare different approaches to find most reliable method.

#### Test 4.1: Implement Paste Mode Approach (like micro-repl)

```python
async def get_board_info_paste_mode(self):
    """Get board info using paste mode - more reliable"""
    print("Getting board info via paste mode...")
    
    # 1. Reset to clean state
    await self.send_raw('\x02')  # Exit raw REPL
    await self.send_raw('\x03\x03')  # Double Ctrl-C to interrupt
    await asyncio.sleep(0.5)
    
    # 2. Drain buffer
    for _ in range(5):
        await self.read_raw(200)
    
    # 3. Enter paste mode
    await self.send_raw('\x05')  # Ctrl-E
    await asyncio.sleep(0.3)
    
    # 4. Send Python code to get version
    code = """import sys
print(sys.version)
"""
    await self.send_raw(code)
    
    # 5. Execute
    await self.send_raw('\x04')  # Ctrl-D
    await asyncio.sleep(0.8)
    
    # 6. Collect response
    response = ''
    for _ in range(15):
        chunk = await self.read_raw(500)
        response += chunk
        if 'MicroPython' in response:
            break
    
    # 7. Parse version
    lines = response.split('\n')
    for line in lines:
        if 'MicroPython' in line and 'on' in line:
            return line.strip()
    
    raise Exception(f"No version found: {response[:300]}")
```

**Expected outcome**: Compare success rate vs current implementation.

---

#### Test 4.2: Use enter_repl_mode() Consistently

Modify `get_board_info()` to use existing helper functions:

```python
async def get_board_info_consistent(self):
    """Get board info using existing helper functions"""
    # Use the same pattern as upload_firmware()
    await self.enter_repl_mode()  # Interrupt to normal REPL
    
    # Send newline to trigger prompt
    await self.send_raw('\r\n')
    await asyncio.sleep(0.3)
    
    # Now in normal REPL - send Ctrl-D for soft reset
    await self.send_raw('\x04')
    await asyncio.sleep(1.0)
    
    # Collect version from boot message
    info = ''
    for _ in range(20):
        chunk = await self.read_raw(500)
        info += chunk
        if 'MicroPython' in info and '>>>' in info:
            break
    
    # Parse version
    for line in info.split('\n'):
        if 'MicroPython' in line and 'on' in line:
            return line.strip()
    
    raise Exception(f"Version not found: {info[:300]}")
```

**Expected outcome**: More consistent behavior by reusing proven code paths.

---

### Phase 5: Add Proper State Tracking

**Goal**: Always know what mode device is in.

#### Test 5.1: Add Device State Enum

```python
from enum import Enum

class DeviceState(Enum):
    UNKNOWN = "unknown"
    RUNNING = "running"  # Running main.py or code
    NORMAL_REPL = "normal_repl"  # >>> prompt
    RAW_REPL = "raw_repl"  # > prompt  
    PASTE_MODE = "paste_mode"
    RESETTING = "resetting"

class WebSerial:
    def __init__(self):
        # ... existing ...
        self.device_state = DeviceState.UNKNOWN
```

#### Test 5.2: Update State in Each Function

```python
async def enter_repl_mode(self):
    # ... existing code ...
    self.device_state = DeviceState.NORMAL_REPL
    
async def enter_raw_repl_mode(self):
    # ... existing code ...
    if result.found:
        self.device_state = DeviceState.RAW_REPL
    else:
        raise Exception("Failed to enter raw REPL")
```

#### Test 5.3: Verify State Before Operations

```python
async def get_board_info(self):
    # Ensure we're in normal REPL before proceeding
    if self.device_state != DeviceState.NORMAL_REPL:
        print(f"Device in {self.device_state}, resetting to normal REPL...")
        await self.enter_repl_mode()
    
    # Now we KNOW we're in normal REPL
    # ... rest of implementation ...
```

**Expected outcome**: Eliminates state uncertainty.

---

### Phase 6: Fix State Verification to Fail Fast

**Goal**: Stop execution on state transition failures.

#### Test 6.1: Make enter_raw_repl_mode() Strict

```python
async def enter_raw_repl_mode(self):
    print("🔄 Entering raw REPL mode...")
    
    await self.send_raw('\x01')  # Ctrl-A
    await asyncio.sleep(0.3)
    
    result = await self.adapter.readUntil('raw REPL', 5000)
    
    if result.found:
        print("✅ Entered raw REPL mode")
        self.device_state = DeviceState.RAW_REPL
    else:
        # FAIL FAST - don't continue with uncertain state
        raise Exception(
            f"Failed to enter raw REPL mode. "
            f"Expected 'raw REPL; CTRL-B to exit', "
            f"got: {result.buffer[:200]}"
        )
```

Apply same pattern to `exit_raw_repl_mode()`.

**Expected outcome**: Clear error messages when state transitions fail, preventing cascading failures.

---

## CRITICAL MISSING INVESTIGATION

### Why Does Soft Reset Enter Raw REPL?

**Observation from console log**:

```
📤 Sending: <CTRL-D>
📥 Received: OK\r\nMPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>
```

**Key question**: Why is "raw REPL; CTRL-B to exit" appearing AFTER the soft reboot?

**Normal behavior**: Soft reset (Ctrl-D from normal REPL) should show:

```
MPY: soft reboot
MicroPython v1.xx.x on 2024-xx-xx; ESP32XX with ESP32XX
Type "help()" for more information.
>>>
```

**Observed behavior**: Device boots into raw REPL mode instead:

```
MPY: soft reboot
raw REPL; CTRL-B to exit
>
```

**Possible causes**:

1. Device wasn't in normal REPL when Ctrl-D sent (was in raw REPL already)
2. Device has configuration that defaults to raw REPL after reset
3. The "OK" before reboot indicates raw REPL command execution
4. Previous Ctrl-A left device in raw REPL, soft reset preserves mode

**Test to investigate**: Before implementing fixes, add logging to confirm device mode BEFORE Ctrl-D is sent.

---

## Fast-Path Testing Sequence

Execute in this **prioritized** order:

### Priority 1: Paste Mode (PROVEN SOLUTION)

**Why first**: micro-repl proves this works reliably. Test proven approach before investigating further.

1. **Phase 4.1**: Implement paste mode approach

   - Uses Ctrl-E (paste mode) instead of Ctrl-D (soft reset)
   - Executes Python code: `import sys; print(sys.version)`
   - Avoids soft reset entirely
   - **Expected outcome**: Works immediately

### Priority 2: Async Timing (SIMPLE FIX)

**Why second**: Quick fix that may resolve reader lock issues.

2. **Phase 2.1**: Fix async cleanup timing

   - Make `_stop_json_read_loop()` async
   - Add explicit wait for cleanup
   - **Expected outcome**: Eliminates reader lock conflicts

### Priority 3: Test Combined Approach

3. **Test paste mode + async wait together**

   - Both fixes applied
   - Run multiple sequential calls
   - **Expected outcome**: Reliable, repeatable device detection

### Priority 4: Add Safety (IF NEEDED)

4. **Phase 3.1**: Add operation interlock

   - Only if concurrent operations are suspected
   - Prevents interference between operations
   - **Expected outcome**: Clear error if overlap occurs

### Priority 5: Investigation (IF PASTE MODE FAILS)

5. **Investigate soft reset behavior**

   - Add comprehensive logging (Phase 1.1 + 1.2)
   - Understand why soft reset enters raw REPL
   - Document device state before Ctrl-D
   - **Expected outcome**: Understand root cause if paste mode fails

### De-prioritized (Architectural Improvements)

- ❌ **Phase 5**: State enum tracking - architectural improvement, not fix
- ❌ **Phase 6**: Strict verification - hardening, not root cause
- ❌ **Point 2**: Function renaming - semantic clarity, not functionality
- ❌ **Point 7**: Duplicate draining optimization - not blocker

---

## Success Criteria

1. **get_board_info()** reliably returns device info on first call
2. **No tracebacks** from interrupted main.py in the response
3. **Consistent behavior** across 10+ sequential calls
4. **Works immediately after connection** (cold start)
5. **No reader lock conflicts** reported in logs

---

## Key Files to Modify

1. `webapp/mpy/webSerial.py` - Main implementation

   - Lines 331-387: get_board_info()
   - Lines 185-223: enter_repl_mode()
   - Lines 225-251: enter_raw_repl_mode()
   - Lines 114-120: _stop_json_read_loop()

2. `webapp/main.py` - Integration points  

   - Lines 970-1016: query_device_info_for_setup()
   - Lines 1018-1055: get_device_board_info()

3. `webapp/js/components/hubSetupModal.js` - JavaScript timing

   - Lines 79-134: queryDeviceInfo()

4. `webapp/js/utils/pyBridge.js` - Bridge functions

   - Lines 152-158: queryDeviceInfoForSetup(), getDeviceBoardInfo()

---

## Expected Root Cause

Based on analysis, the most likely root cause is:

**Primary**: Device in wrong state (raw REPL instead of normal REPL) when `get_board_info()` executes, causing Ctrl-C to interrupt code instead of reset, producing tracebacks instead of version info.

**Contributing factors**:

1. Async cleanup not completed before next operation (timing)
2. No state tracking to verify device mode
3. Inconsistent REPL entry pattern vs other functions
4. Lenient state verification that doesn't fail fast

**Solution**: Combination of paste mode approach (most reliable) + async timing fixes + operation interlock + state tracking.

### To-dos

- [ ] Add comprehensive logging to understand device state before and after each control character
- [ ] Fix async cleanup timing by making _stop_json_read_loop() async with explicit wait
- [ ] Implement operation interlock (busy flag) to prevent concurrent operations
- [ ] Implement and test paste mode approach for getting board info (like micro-repl)
- [ ] Add device state tracking (normal REPL, raw REPL, paste mode, etc.)
- [ ] Make state transition verification strict (fail fast on errors)