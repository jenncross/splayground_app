/**
 * Hub Setup Modal Component
 * 
 * Modal overlay for uploading hub firmware to ESP32 via serial.
 * Handles the entire upload process with progress tracking.
 * 
 * States:
 * - connecting: Prompting user to connect device and detecting board type
 * - initial: Confirmation screen with device info
 * - uploading: Progress bar and file list
 * - success: Success message with next steps
 * - error: Error message with retry option
 */

import { loadHubFiles } from '../../hubCode/manifest.js';
import { PyBridge } from '../utils/pyBridge.js';

export class HubSetupModal {
    constructor() {
        this.modal = null;
        this.state = 'connecting'; // connecting, initial, uploading, success, error
        this.hasExternalAntenna = false; // Track antenna configuration
        this.deviceInfo = ''; // Device information string
        this.deviceType = ''; // 'C6', 'C3', or 'unknown'
        this.uploadProgress = {
            current: 0,
            total: 0,
            currentFile: '',
            files: []
        };
    }

    /**
     * Show the modal
     */
    async show(serialPort = null, deviceInfo = '') {
        this.serialPort = serialPort;
        
        this.createModal();
        this.render();
        document.body.appendChild(this.modal);
        
        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
        
        // If no device info provided, start connection process
        if (!deviceInfo) {
            await this.connectAndGetDeviceInfo();
        } else {
            this.setDeviceInfo(deviceInfo);
            this.state = 'initial';
            this.render();
        }
    }
    
    /**
     * Set device info and parse device type
     */
    setDeviceInfo(deviceInfo) {
        this.deviceInfo = deviceInfo;
        
        // Parse device type from info string
        if (deviceInfo.includes('C6')) {
            this.deviceType = 'C6';
        } else if (deviceInfo.includes('C3')) {
            this.deviceType = 'C3';
            // C3 always uses external antenna, but we don't call now.antenna() due to crashes
            this.hasExternalAntenna = false; // Keep false to avoid the antenna() call
        } else {
            this.deviceType = 'unknown';
        }
    }
    
    /**
     * Connect to device and get board info
     */
    async connectAndGetDeviceInfo() {
        try {
            console.log('Connecting to device...');
            
            // Connect via Python (this will prompt user for port selection)
            const connectResult = await PyBridge.connectHubSerial();
            
            if (connectResult.status !== 'success') {
                throw new Error('Failed to connect: ' + (connectResult.error || 'Unknown error'));
            }
            
            console.log('Connected! Getting device info...');
            
            // Give it a moment to stabilize
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Get device information
            const deviceInfo = await PyBridge.getBoardInfo();
            
            if (deviceInfo.status !== 'success') {
                throw new Error('Failed to get device info: ' + (deviceInfo.error || 'Unknown error'));
            }
            
            console.log('Device info:', deviceInfo.info);
            
            // Set device info and move to confirmation screen
            this.setDeviceInfo(deviceInfo.info);
            this.state = 'initial';
            this.render();
            
        } catch (error) {
            console.error('Connection/info error:', error);
            this.errorMessage = error.message || 'Unknown error occurred';
            this.state = 'error';
            this.render();
        }
    }

    /**
     * Hide and destroy the modal
     */
    hide() {
        if (this.modal && this.modal.parentNode) {
            this.modal.parentNode.removeChild(this.modal);
        }
        this.modal = null;
    }

    /**
     * Create the modal DOM structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        this.modal.onclick = (e) => {
            // Allow closing during all states except uploading
            if (e.target === this.modal && this.state !== 'uploading') {
                this.hide();
            }
        };
    }

    /**
     * Render the modal content based on current state
     */
    render() {
        if (!this.modal) return;

        let content = '';
        switch (this.state) {
            case 'connecting':
                content = this.renderConnecting();
                break;
            case 'initial':
                content = this.renderInitial();
                break;
            case 'uploading':
                content = this.renderUploading();
                break;
            case 'success':
                content = this.renderSuccess();
                break;
            case 'error':
                content = this.renderError();
                break;
        }

        this.modal.innerHTML = `
            <div class="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                ${content}
            </div>
        `;

        // Re-attach event listeners
        this.attachEventListeners();
        
        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
    
    /**
     * Render connecting state
     */
    renderConnecting() {
        return `
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="animate-spin">
                        <i data-lucide="loader" class="w-6 h-6 text-blue-500"></i>
                    </div>
                    <h2 class="text-xl font-bold text-gray-800">Connecting to Device...</h2>
                </div>
                
                <div class="space-y-4 text-gray-700">
                    <p class="text-sm">
                        Please select your ESP32 from the serial port picker.
                    </p>
                    
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div class="flex items-start gap-2">
                            <i data-lucide="info" class="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5"></i>
                            <div class="text-sm text-blue-800">
                                Once connected, we'll automatically detect your device type.
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="flex gap-3 mt-6">
                    <button id="cancel-btn" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                        Cancel
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render initial confirmation state
     */
    renderInitial() {
        // Show antenna option only for C6 devices
        const showAntennaOption = this.deviceType === 'C6';
        
        const antennaOptionHtml = showAntennaOption ? `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div class="flex items-start gap-3">
                    <input type="checkbox" id="externalAntennaCheckbox" class="mt-1 w-4 h-4 text-blue-600 rounded">
                    <div class="flex-1">
                        <label for="externalAntennaCheckbox" class="text-sm font-medium text-blue-900 cursor-pointer">
                            I'm using an external antenna
                        </label>
                        <p class="text-xs text-blue-700 mt-1">
                            Check this if your ESP32-C6 has an external antenna physically connected.
                        </p>
                    </div>
                </div>
            </div>
        ` : '';
        
        return `
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <i data-lucide="upload-cloud" class="w-6 h-6 text-blue-500"></i>
                    <h2 class="text-xl font-bold text-gray-800">Setup ESP32 as Hub</h2>
                </div>
                
                <div class="space-y-4 text-gray-700">
                    ${this.deviceInfo ? `
                        <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <div class="text-sm">
                                <span class="text-gray-600">Connected Device:</span>
                                <p class="font-mono text-xs text-gray-900 mt-1">${this.deviceInfo}</p>
                            </div>
                        </div>
                    ` : ''}
                    
                    <p class="text-sm">
                        This will upload hub firmware to your ESP32, enabling it to communicate with playground modules via ESP-NOW.
                    </p>
                    
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <div class="flex items-start gap-2">
                            <i data-lucide="alert-triangle" class="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5"></i>
                            <div class="text-sm text-yellow-800">
                                <strong>Warning:</strong> This will overwrite any existing code on your ESP32.
                            </div>
                        </div>
                    </div>
                    
                    ${antennaOptionHtml}
                    
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Files:</span>
                                <span class="font-semibold text-gray-900 ml-2">12</span>
                            </div>
                            <div>
                                <span class="text-gray-600">Time:</span>
                                <span class="font-semibold text-gray-900 ml-2">~30 sec</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="flex gap-3 mt-6">
                    <button id="cancel-btn" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                        Cancel
                    </button>
                    <button id="start-upload-btn" class="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="play" class="w-4 h-4"></i>
                        <span>Start Upload</span>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render uploading progress state
     */
    renderUploading() {
        const progress = this.uploadProgress;
        const percentComplete = progress.total > 0 ? Math.floor((progress.current / progress.total) * 100) : 0;
        
        return `
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="animate-spin">
                        <i data-lucide="loader" class="w-6 h-6 text-blue-500"></i>
                    </div>
                    <h2 class="text-xl font-bold text-gray-800">Uploading...</h2>
                </div>
                
                <div class="mb-6">
                    <div class="flex justify-between text-sm text-gray-600 mb-2">
                        <span>${progress.current} / ${progress.total} files</span>
                        <span>${percentComplete}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div class="bg-blue-500 h-full transition-all duration-300 rounded-full" style="width: ${percentComplete}%"></div>
                    </div>
                    <p class="text-xs text-gray-500 mt-2">${progress.currentFile || 'Preparing...'}</p>
                </div>
                
                <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <div class="space-y-2 text-sm">
                        ${progress.files.map(file => `
                            <div class="flex items-center gap-2">
                                ${file.status === 'uploaded' ? 
                                    '<i data-lucide="check-circle" class="w-4 h-4 text-green-500"></i>' :
                                    file.status === 'uploading' ?
                                    '<i data-lucide="loader" class="w-4 h-4 text-blue-500 animate-spin"></i>' :
                                    file.status === 'error' ?
                                    '<i data-lucide="x-circle" class="w-4 h-4 text-red-500"></i>' :
                                    '<i data-lucide="circle" class="w-4 h-4 text-gray-300"></i>'
                                }
                                <span class="${file.status === 'uploaded' ? 'text-green-700' : file.status === 'error' ? 'text-red-700' : 'text-gray-600'}">${file.path}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-4">
                    <div class="flex items-start gap-2">
                        <i data-lucide="info" class="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5"></i>
                        <div class="text-sm text-blue-800">
                            Keep this window open and don't disconnect the ESP32.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render success state
     */
    renderSuccess() {
        return `
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <i data-lucide="check-circle" class="w-6 h-6 text-green-500"></i>
                    <h2 class="text-xl font-bold text-gray-800">Upload Complete!</h2>
                </div>
                
                <div class="space-y-4">
                    <div class="bg-green-50 border border-green-200 rounded-lg p-3">
                        <div class="text-sm text-green-800">
                            Your ESP32 is now configured as a hub.
                        </div>
                    </div>
                    
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p class="font-medium text-gray-900 mb-3">Next:</p>
                        <ol class="list-decimal list-inside space-y-2 text-sm text-gray-700">
                            <li>Press the <strong>reset button</strong> on your ESP32</li>
                            <li>Wait ~2 seconds for boot up</li>
                            <li>Reconnect to start using your hub</li>
                        </ol>
                    </div>
                </div>
                
                <div class="flex gap-3 mt-6">
                    <button id="done-btn" class="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors">
                        Done
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Render error state
     */
    renderError() {
        return `
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <i data-lucide="alert-circle" class="w-6 h-6 text-red-500"></i>
                    <h2 class="text-xl font-bold text-gray-800">Upload Failed</h2>
                </div>
                
                <div class="space-y-4">
                    <div class="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div class="text-sm text-red-800">
                            <p class="font-mono text-xs bg-red-100 p-2 rounded">${this.errorMessage || 'Unknown error'}</p>
                        </div>
                    </div>
                    
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p class="font-medium text-gray-900 mb-2">Try:</p>
                        <ul class="list-disc list-inside space-y-1 text-sm text-gray-700">
                            <li>Check USB cable</li>
                            <li>Press reset button on ESP32</li>
                            <li>Close other apps (Thonny, Arduino IDE)</li>
                            <li>Reconnect the device</li>
                        </ul>
                    </div>
                </div>
                
                <div class="flex gap-3 mt-6">
                    <button id="cancel-btn" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                        Cancel
                    </button>
                    <button id="retry-btn" class="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                        <span>Retry</span>
                    </button>
                </div>
            </div>
        `;
    }

    /**
     * Attach event listeners to buttons
     */
    attachEventListeners() {
        const cancelBtn = this.modal.querySelector('#cancel-btn');
        const startBtn = this.modal.querySelector('#start-upload-btn');
        const retryBtn = this.modal.querySelector('#retry-btn');
        const doneBtn = this.modal.querySelector('#done-btn');
        const antennaCheckbox = this.modal.querySelector('#externalAntennaCheckbox');

        if (cancelBtn) {
            cancelBtn.onclick = () => this.hide();
        }

        if (startBtn) {
            startBtn.onclick = () => {
                // Capture antenna checkbox state before starting upload
                if (antennaCheckbox) {
                    this.hasExternalAntenna = antennaCheckbox.checked;
                    console.log(`External antenna: ${this.hasExternalAntenna}`);
                }
                this.startUpload();
            };
        }

        if (retryBtn) {
            retryBtn.onclick = async () => {
                // Go back to connecting state and try again
                this.state = 'connecting';
                this.render();
                await this.connectAndGetDeviceInfo();
            };
        }

        if (doneBtn) {
            doneBtn.onclick = () => this.hide();
        }
    }

    /**
     * Start the upload process
     */
    async startUpload() {
        try {
            // Change to uploading state
            this.state = 'uploading';
            this.render();

            // Check if Python serial is connected
            // Python's WebSerial needs an active connection for upload
            console.log('Checking Python serial connection status...');
            const connectionStatus = await PyBridge.getConnectionStatus();
            
            if (!connectionStatus.connected || connectionStatus.mode !== 'serial') {
                // Not connected via serial - need to connect first
                console.log('Python serial not connected - connecting now...');
                
                // Connect via Python (this will prompt user for port selection)
                const connectResult = await PyBridge.connectHubSerial();
                
                if (connectResult.status !== 'success') {
                    throw new Error('Failed to connect to serial port: ' + (connectResult.error || 'Unknown error'));
                }
                
                console.log('Connected to serial port via Python');
                
                // Give it a moment to stabilize
                await new Promise(resolve => setTimeout(resolve, 500));
            } else {
                console.log('Python serial already connected, using existing connection');
            }

            // Load all hub files
            console.log('Loading hub files...');
            const files = await loadHubFiles();
            
            // Modify main.py based on antenna configuration
            const mainPyFile = files.find(f => f.path === 'main.py');
            if (mainPyFile) {
                console.log(`Configuring antenna: external=${this.hasExternalAntenna}`);
                if (!this.hasExternalAntenna) {
                    // Remove the antenna configuration line
                    mainPyFile.content = mainPyFile.content.replace(
                        /\s*# Add C6 external antenna configuration\s*\n\s*self\.n\.antenna\(\)\s*\n/,
                        '\n'
                    );
                    console.log('Removed external antenna configuration from main.py');
                } else {
                    console.log('Keeping external antenna configuration in main.py');
                }
            }
            
            // Initialize progress tracking
            this.uploadProgress = {
                current: 0,
                total: files.length,
                currentFile: '',
                files: files.map(f => ({ path: f.path, status: 'pending' }))
            };
            this.render();

            // Set up progress callback for Python to call
            window.onUploadProgress = (progress) => {
                    this.uploadProgress.current = progress.current;
                this.uploadProgress.currentFile = progress.file;
                
                // Update file status
                    const fileIndex = this.uploadProgress.files.findIndex(f => f.path === progress.file);
                    if (fileIndex >= 0) {
                        this.uploadProgress.files[fileIndex].status = progress.status;
                    }
                
                this.render();
            };

            // Call Python upload function (handles REPL mode internally)
            console.log('Starting Python upload...');
            const result = await PyBridge.uploadFirmware(files);

            // Clean up progress callback
            delete window.onUploadProgress;

            // Check result
            if (result.status === 'success') {
                console.log(`✅ Upload successful: ${result.files_uploaded} files`);
            this.state = 'success';
            this.render();
            } else {
                throw new Error(result.error || 'Upload failed');
            }

        } catch (error) {
            console.error('Upload error:', error);
            this.errorMessage = error.message || 'Unknown error occurred';
            this.state = 'error';
            this.render();

            // Clean up progress callback
            if (window.onUploadProgress) {
                delete window.onUploadProgress;
            }
        }
    }
}

export default HubSetupModal;

