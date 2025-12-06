/**
 * Smart Playground Control - Python-JavaScript Communication Bridge
 * 
 * This module provides a clean interface for JavaScript to communicate with the
 * Python backend running in PyScript. It handles async function calls, error
 * handling, initialization checks, and event listening for Python callbacks.
 * 
 * Key Features:
 * - Direct function calls to Python backend via window object
 * - Async/await support for Python function calls
 * - Automatic Python readiness detection and waiting
 * - Better error handling with proper error propagation
 * - Event system for Python-initiated callbacks
 * - Timeout handling for initialization
 * 
 * Python Integration:
 * - Python functions are exposed to JavaScript via window object
 * - PyBridge provides a consistent interface regardless of Python readiness
 * - Handles connection between JavaScript frontend and Python BLE backend
 * - Manages device data flow and command transmission
 * 
 * Available Functions:
 * - getDevices(): Retrieve current device list
 * - getConnectionStatus(): Check BLE hub connection status
 * - connectHub(): Initiate BLE connection to ESP32 hub
 * - disconnectHub(): Disconnect from BLE hub
 * - sendCommandToHub(): Send command via BLE to hub for ESP-NOW broadcast
 * - refreshDevices(): Request fresh device scan from hub
 * 
 * Error Handling:
 * - Throws PythonNotReadyError if Python backend not initialized
 * - Errors propagate to caller for proper UI handling
 * - Logging of all errors for debugging
 * - Enhanced error context with function name and arguments
 * 
 */

/**
 * Custom error for Python readiness issues
 */
class PythonNotReadyError extends Error {
  constructor(functionName) {
    super(`Python function '${functionName}' not available. PyScript may still be initializing.`);
    this.name = 'PythonNotReadyError';
    this.functionName = functionName;
  }
}

/**
 * Call Python function with better error context
 * @param {string} fnName - Name of the Python function on window object
 * @param  {...any} args - Arguments to pass to the function
 * @returns {Promise<any>} Result from Python function
 * @throws {PythonNotReadyError} If function not available
 * @throws {Error} If function call fails
 */
async function callPython(fnName, ...args) {
  const fn = window[fnName];
  if (typeof fn !== 'function') {
    throw new PythonNotReadyError(fnName);
  }
  
  try {
    return await fn(...args);
  } catch (error) {
    // Add context to error for better debugging
    error.pythonFunction = fnName;
    error.pythonArgs = args;
    console.error(`Python call failed: ${fnName}`, error);
    throw error;
  }
}

const PyBridge = {
  // Check if Python is ready
  isPythonReady() {
    return typeof window.get_devices === 'function' && 
           typeof window.get_connection_status === 'function';
  },

  // Wait for Python to be ready
  async waitForPython(timeout = 5000) {
    const start = Date.now();
    while (!this.isPythonReady() && (Date.now() - start) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.isPythonReady();
  },

  // Direct function calls with simplified error handling
  async getDevices() {
    return await callPython('get_devices');
  },

  async getConnectionStatus() {
    return await callPython('get_connection_status');
  },

  async connectHub() {
    return await callPython('connect_hub');
  },

  async disconnectHub() {
    return await callPython('disconnect_hub');
  },

  async connectHubSerial() {
    return await callPython('connect_hub_serial');
  },

  async disconnectHubSerial() {
    return await callPython('disconnect_hub_serial');
  },

  async sendCommandToHub(command, rssiThreshold) {
    return await callPython('send_command_to_hub', command, rssiThreshold);
  },

  async refreshDevices(rssiThreshold = "all") {
    try {
      return await callPython('refresh_devices_from_hub', rssiThreshold);
    } catch (e) {
      // Check if it's a GATT error (transient, should retry)
      const isGattError = e.message && (
        e.message.includes("GATT") || 
        e.message.includes("Bluetooth") ||
        e.message.includes("NetworkError")
      );
      
      if (isGattError) {
        // GATT error - log and throw for retry handling
        console.warn("⚠️ GATT operation failed (will retry):", e.message);
        const gattError = new Error(`GATT Error: ${e.message}`);
        gattError.isGattError = true;
        throw gattError;
      } else {
        // Re-throw other errors for caller to handle
        throw e;
      }
    }
  },

  // Firmware upload functions
  async uploadFirmware(files) {
    return await callPython('upload_firmware', files);
  },

  async getBoardInfo() {
    return await callPython('get_board_info');
  },

  async queryDeviceInfoForSetup() {
    return await callPython('query_device_info_for_setup');
  },

  async getDeviceBoardInfo() {
    return await callPython('get_device_board_info');
  },

  async executeFileOnDevice(filePath) {
    return await callPython('execute_file_on_device', filePath);
  },

  /**
   * Soft reset the connected device (MicroPython re-initialization)
   * @returns {Promise<{status: string, message?: string, error?: string}>}
   */
  async softResetDevice() {
    return await callPython('soft_reset_device');
  },

  /**
   * Hard reset the connected device (full hardware reboot)
   * @returns {Promise<{status: string, message?: string, error?: string}>}
   */
  async hardResetDevice() {
    return await callPython('hard_reset_device');
  },

  // Direct function calls only - no event system needed
};

// Make PyBridge and error class available globally and as exports
window.PyBridge = PyBridge;
window.PythonNotReadyError = PythonNotReadyError;
export { PyBridge, PythonNotReadyError };