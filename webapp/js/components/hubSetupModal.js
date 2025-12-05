/**
 * Hub Setup Modal Component
 * 
 * Modal overlay for uploading hub firmware to ESP32 via serial.
 * Handles the entire upload process with progress tracking.
 * 
 * States:
 * - initial: Confirmation screen
 * - uploading: Progress bar and file list
 * - success: Success message with next steps
 * - error: Error message with retry option
 */

import { loadHubFiles } from '../../hubCode/manifest.js';
import SerialUploader from '../utils/serialUploader.js';

export class HubSetupModal {
    constructor() {
        this.modal = null;
        this.uploader = null;
        this.state = 'initial'; // initial, uploading, success, error
        this.hasExternalAntenna = false; // Track antenna configuration
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
    async show(serialPort) {
        this.serialPort = serialPort;
        this.uploader = new SerialUploader();
        await this.uploader.useExistingPort(serialPort);
        
        this.createModal();
        this.render();
        document.body.appendChild(this.modal);
        
        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
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
     * Render initial confirmation state
     */
    renderInitial() {
        return `
            <div class="p-6">
                <div class="flex items-center gap-3 mb-4">
                    <i data-lucide="upload-cloud" class="w-6 h-6 text-blue-500"></i>
                    <h2 class="text-xl font-bold text-gray-800">Setup ESP32 as Simple Hub</h2>
                </div>
                
                <div class="space-y-4 text-gray-700">
                    <p>
                        This will upload hub firmware to your ESP32, transforming it into 
                        a fully functional Simple Hub that can communicate with playground modules.
                    </p>
                    
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div class="flex items-start gap-3">
                            <i data-lucide="info" class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"></i>
                            <div class="text-sm">
                                <p class="font-medium text-blue-900 mb-1">What will be uploaded:</p>
                                <ul class="list-disc list-inside space-y-1 text-blue-800">
                                    <li>Hub communication firmware</li>
                                    <li>ESP-NOW protocol support</li>
                                    <li>Serial communication handler</li>
                                    <li>Hardware utilities</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div class="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <span class="text-gray-600">Files to upload:</span>
                                <span class="font-semibold text-gray-900 ml-2">12 files</span>
                            </div>
                            <div>
                                <span class="text-gray-600">Estimated time:</span>
                                <span class="font-semibold text-gray-900 ml-2">~30 seconds</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <div class="flex items-start gap-3">
                            <i data-lucide="alert-triangle" class="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5"></i>
                            <div class="text-sm text-yellow-800">
                                <p class="font-medium mb-1">Important:</p>
                                <p>This will overwrite any existing code on your ESP32. Make sure you have backups if needed.</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div class="flex items-start gap-3">
                            <input type="checkbox" id="externalAntennaCheckbox" class="mt-1 w-4 h-4 text-blue-600 rounded">
                            <div class="flex-1">
                                <label for="externalAntennaCheckbox" class="text-sm font-medium text-blue-900 cursor-pointer">
                                    I'm using an external antenna (ESP32-C6 only)
                                </label>
                                <p class="text-xs text-blue-700 mt-1">
                                    Check this if your ESP32-C6 has an external antenna physically connected. Leave unchecked for internal antenna or other ESP32 models.
                                </p>
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
                    <h2 class="text-xl font-bold text-gray-800">Uploading Hub Firmware...</h2>
                </div>
                
                <div class="mb-6">
                    <div class="flex justify-between text-sm text-gray-600 mb-2">
                        <span>Progress: ${progress.current} / ${progress.total} files</span>
                        <span>${percentComplete}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div class="bg-blue-500 h-full transition-all duration-300 rounded-full" style="width: ${percentComplete}%"></div>
                    </div>
                    <p class="text-xs text-gray-500 mt-2">Current: ${progress.currentFile || 'Preparing...'}</p>
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
                
                <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
                    <div class="flex items-start gap-3">
                        <i data-lucide="info" class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"></i>
                        <div class="text-sm text-blue-800">
                            <p>Please keep this window open and do not disconnect your ESP32...</p>
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
                    <h2 class="text-xl font-bold text-gray-800">Hub Firmware Uploaded Successfully!</h2>
                </div>
                
                <div class="space-y-4">
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div class="flex items-start gap-3">
                            <i data-lucide="thumbs-up" class="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5"></i>
                            <div class="text-sm text-green-800">
                                <p class="font-medium mb-2">All files uploaded successfully!</p>
                                <p>Your ESP32 is now configured as a Simple Hub.</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p class="font-medium text-gray-900 mb-3">Next steps:</p>
                        <ol class="list-decimal list-inside space-y-2 text-sm text-gray-700">
                            <li>Press the <strong>reset button</strong> on your ESP32</li>
                            <li>Wait for the hub to boot up (~2 seconds)</li>
                            <li>Reconnect to start using your hub</li>
                        </ol>
                    </div>
                    
                    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div class="flex items-start gap-3">
                            <i data-lucide="info" class="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5"></i>
                            <div class="text-sm text-blue-800">
                                <p>The hub will now respond to commands and communicate with playground modules via ESP-NOW.</p>
                            </div>
                        </div>
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
                    <div class="bg-red-50 border border-red-200 rounded-lg p-4">
                        <div class="text-sm text-red-800">
                            <p class="font-medium mb-1">An error occurred during upload:</p>
                            <p class="font-mono text-xs mt-2 bg-red-100 p-2 rounded">${this.errorMessage || 'Unknown error'}</p>
                        </div>
                    </div>
                    
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <p class="font-medium text-gray-900 mb-2">Common solutions:</p>
                        <ul class="list-disc list-inside space-y-1 text-sm text-gray-700">
                            <li>Check USB cable connection</li>
                            <li>Make sure ESP32 is powered on</li>
                            <li>Try pressing the reset button on your ESP32</li>
                            <li>Close other applications using the serial port (Thonny, Arduino IDE)</li>
                            <li>Try disconnecting and reconnecting</li>
                        </ul>
                    </div>
                </div>
                
                <div class="flex gap-3 mt-6">
                    <button id="cancel-btn" class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                        Cancel
                    </button>
                    <button id="retry-btn" class="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                        <span>Retry Upload</span>
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
            retryBtn.onclick = () => {
                this.state = 'initial';
                this.render();
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

            // Acquire serial streams
            console.log('Acquiring serial streams...');
            await this.uploader.acquireStreams();

            // Enter raw REPL mode
            console.log('Entering raw REPL mode...');
            await this.uploader.enterRawRepl();

            // Upload each file
            const results = await this.uploader.uploadMultipleFiles(files, (progress) => {
                if (progress.type === 'overall') {
                    this.uploadProgress.current = progress.current;
                    this.uploadProgress.currentFile = progress.currentFile;
                } else if (progress.type === 'file') {
                    const fileIndex = this.uploadProgress.files.findIndex(f => f.path === progress.file);
                    if (fileIndex >= 0) {
                        this.uploadProgress.files[fileIndex].status = progress.status;
                    }
                } else if (progress.type === 'complete') {
                    this.uploadProgress.current = this.uploadProgress.total;
                }
                this.render();
            });

            // Exit raw REPL mode
            console.log('Exiting raw REPL mode...');
            await this.uploader.exitRawRepl();

            // Reset the board
            console.log('Resetting board...');
            await this.uploader.resetBoard();

            // Release streams
            await this.uploader.releaseStreams();

            // Check if any files failed
            const failedFiles = results.filter(r => r.status === 'error');
            if (failedFiles.length > 0) {
                throw new Error(`Failed to upload ${failedFiles.length} file(s): ${failedFiles.map(f => f.path).join(', ')}`);
            }

            // Success!
            this.state = 'success';
            this.render();

        } catch (error) {
            console.error('Upload error:', error);
            this.errorMessage = error.message || 'Unknown error occurred';
            this.state = 'error';
            this.render();

            // Make sure to release streams on error
            try {
                await this.uploader.releaseStreams();
            } catch (e) {
                console.error('Error releasing streams:', e);
            }
        }
    }
}

export default HubSetupModal;

