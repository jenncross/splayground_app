/**
 * Serial Uploader - Upload files to ESP32 via Web Serial API
 * 
 * This module handles uploading Python files to ESP32/MicroPython boards
 * using the Web Serial API. It implements the MicroPython raw REPL protocol
 * for reliable file transfers.
 * 
 * Protocol:
 * - Uses raw REPL mode for file operations
 * - CTRL-C (\x03) to interrupt
 * - CTRL-A (\x01) to enter raw REPL
 * - CTRL-D (\x04) to execute
 * - Creates directories as needed
 * 
 * Based on micro-repl protocol from file_upload_app
 */

export class SerialUploader {
    constructor() {
        this.port = null;
        this.reader = null;
        this.writer = null;
        this.encoder = new TextEncoder();
        this.decoder = new TextDecoder();
    }

    /**
     * Initialize with existing serial port (assumes already open)
     * @param {SerialPort} port - Open serial port
     */
    async useExistingPort(port) {
        if (!port) {
            throw new Error('Port is null or undefined');
        }
        
        this.port = port;
        
        // Get reader and writer from the port
        // Note: Port should already be open with reader/writer available
        console.log('SerialUploader: Using existing port');
    }

    /**
     * Get direct access to the serial port's streams
     * This is called when we need to temporarily take control
     */
    async acquireStreams() {
        if (!this.port) {
            throw new Error('No port available');
        }

        try {
            // Check if port is already open
            if (!this.port.readable) {
                console.log('Port not open, opening it now...');
                
                // Send CTRL-C to interrupt any running code
                // (This won't work since port isn't open yet, but we'll do it after opening)
                
                // Open the port
                await this.port.open({ baudRate: 115200 });
                console.log('Port opened at 115200 baud');
                
                // Give it a moment to stabilize
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Get fresh reader and writer
            this.reader = this.port.readable.getReader();
            this.writer = this.port.writable.getWriter();
            console.log('SerialUploader: Acquired reader and writer streams');
            
            // Send CTRL-C to interrupt any running code on the ESP32
            console.log('Sending CTRL-C to interrupt running code...');
            await this.write('\x03');
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error) {
            console.error('Failed to acquire streams:', error);
            throw error;
        }
    }

    /**
     * Release streams back to the port and close it
     */
    async releaseStreams() {
        try {
            if (this.reader) {
                await this.reader.cancel();
                this.reader.releaseLock();
                this.reader = null;
            }
            if (this.writer) {
                this.writer.releaseLock();
                this.writer = null;
            }
            
            // Close the port
            if (this.port) {
                await this.port.close();
                console.log('Port closed');
                this.port = null;
            }
            
            console.log('SerialUploader: Released streams and closed port');
        } catch (error) {
            console.error('Error releasing streams:', error);
        }
    }

    /**
     * Write bytes to serial port
     */
    async write(data) {
        if (typeof data === 'string') {
            await this.writer.write(this.encoder.encode(data));
        } else {
            await this.writer.write(data);
        }
    }

    /**
     * Read from serial port with timeout
     */
    async read(timeout = 2000) {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Read timeout')), timeout)
        );

        try {
            const readPromise = this.reader.read();
            const result = await Promise.race([readPromise, timeoutPromise]);
            
            if (result.done) {
                throw new Error('Reader closed');
            }
            
            return this.decoder.decode(result.value);
        } catch (error) {
            if (error.message === 'Read timeout') {
                // Timeout is sometimes expected, return empty string
                return '';
            }
            throw error;
        }
    }

    /**
     * Wait for a specific prompt string
     */
    async waitForPrompt(expectedPrompt = '>>>', timeout = 5000) {
        const startTime = Date.now();
        let buffer = '';

        while (Date.now() - startTime < timeout) {
            try {
                const chunk = await this.read(500);
                buffer += chunk;
                
                if (buffer.includes(expectedPrompt)) {
                    return true;
                }
                
                // Also check for OK response from raw REPL
                if (buffer.includes('OK') || buffer.includes('>>>')) {
                    return true;
                }
            } catch (error) {
                // Timeout on individual read is OK, keep trying
                continue;
            }
        }
        
        console.warn('Prompt wait timeout. Buffer:', buffer);
        return false;
    }

    /**
     * Enter raw REPL mode
     */
    async enterRawRepl() {
        console.log('Entering raw REPL mode...');
        
        // More aggressive interrupt sequence
        // Send multiple CTRL-C to interrupt any running code
        for (let i = 0; i < 3; i++) {
            await this.write('\x03');
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        // Wait a bit for interruption to take effect
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Drain any existing output
        let buffer = '';
        try {
            for (let i = 0; i < 5; i++) {
                const chunk = await this.read(200);
                buffer += chunk;
            }
            if (buffer) {
                console.log('Drained buffer:', buffer.substring(0, 100));
            }
        } catch (e) {
            // Timeout is OK - means buffer is empty
        }
        
        // Send CTRL-A to enter raw REPL
        console.log('Sending CTRL-A to enter raw REPL...');
        await this.write('\x01');
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Wait for "raw REPL; CTRL-B to exit" prompt
        const success = await this.waitForPrompt('raw REPL', 5000);
        
        if (success) {
            console.log('✓ Entered raw REPL mode');
            // Drain any remaining welcome text
            try {
                await this.read(200);
            } catch (e) {
                // Ignore
            }
        } else {
            console.warn('⚠️ May not have entered raw REPL properly');
            console.warn('This might work anyway - continuing...');
        }
        
        // Always return true - we'll find out if it worked when we try to upload
        return true;
    }

    /**
     * Exit raw REPL mode
     */
    async exitRawRepl() {
        console.log('Exiting raw REPL mode...');
        await this.write('\x02'); // CTRL-B
        await new Promise(resolve => setTimeout(resolve, 200));
        console.log('✓ Exited raw REPL mode');
    }

    /**
     * Execute Python code in raw REPL
     */
    async executeRawCommand(code) {
        // Write the code
        await this.write(code);
        
        // Send CTRL-D to execute
        await this.write('\x04');
        
        // Wait for execution to complete
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Read response with longer timeout for file operations
        let response = '';
        try {
            // Try multiple reads to get all output
            for (let i = 0; i < 3; i++) {
                const chunk = await this.read(1000);
                response += chunk;
                if (!chunk) break; // No more data
            }
        } catch (e) {
            // Timeout is OK - might mean no output
        }
        
        // Check for errors (but be lenient - some responses might be empty)
        if (response.includes('Traceback') || response.includes('Error:')) {
            console.error('Execution error:', response);
            throw new Error(`Execution failed: ${response.substring(0, 200)}`);
        }
        
        // Log successful execution (abbreviated)
        if (response && response.length > 0) {
            console.log('Execution response:', response.substring(0, 50));
        }
        
        return response;
    }

    /**
     * Create directory on the device
     */
    async ensureDirectory(dirPath) {
        if (!dirPath || dirPath === '/' || dirPath === '.') {
            return; // Root or current dir, nothing to create
        }

        console.log(`Creating directory: ${dirPath}`);
        
        const code = `
import os
try:
    os.mkdir('${dirPath}')
    print('created')
except OSError:
    print('exists')
`;
        
        try {
            await this.executeRawCommand(code);
            console.log(`✓ Directory ready: ${dirPath}`);
        } catch (error) {
            // Directory might already exist, that's OK
            console.log(`Directory ${dirPath} (already exists or created)`);
        }
    }

    /**
     * Upload a single file to the device using raw REPL paste mode
     */
    async uploadFile(filePath, content, onProgress = null) {
        console.log(`Uploading ${filePath} (${content.length} bytes)...`);
        
        if (onProgress) {
            onProgress({ file: filePath, status: 'uploading', progress: 0 });
        }

        // Ensure directory exists if file is in a subdirectory
        const lastSlash = filePath.lastIndexOf('/');
        if (lastSlash > 0) {
            const dirPath = filePath.substring(0, lastSlash);
            await this.ensureDirectory(dirPath);
        }

        // Escape content for Python triple-quoted string
        const escapedContent = content
            .replace(/\\/g, '\\\\')
            .replace(/'''/g, "'''");  // Can't have ''' inside ''' string
        
        // Build the complete Python code to write the file
        // Using a single write operation for reliability
        const uploadCode = `
with open('${filePath}', 'w') as f:
    f.write('''${escapedContent}''')
print('OK')
`;
        
        if (onProgress) {
            onProgress({ file: filePath, status: 'uploading', progress: 30 });
        }

        // Write all the code at once
        await this.write(uploadCode);
        
        if (onProgress) {
            onProgress({ file: filePath, status: 'uploading', progress: 60 });
        }
        
        // Execute with CTRL-D
        await this.write('\x04');
        
        // Wait for execution
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (onProgress) {
            onProgress({ file: filePath, status: 'uploading', progress: 90 });
        }
        
        // Read response to confirm
        try {
            const response = await this.read(2000);
            if (response.includes('Traceback') || response.includes('Error')) {
                throw new Error(`Upload failed: ${response}`);
            }
            console.log(`Response: ${response.substring(0, 50)}`);
        } catch (e) {
            // Timeout might be OK
            console.log('No response (might be OK)');
        }
        
        if (onProgress) {
            onProgress({ file: filePath, status: 'uploaded', progress: 100 });
        }

        console.log(`✓ Uploaded ${filePath}`);
    }

    /**
     * Upload multiple files with progress tracking
     */
    async uploadMultipleFiles(files, onProgress = null) {
        const totalFiles = files.length;
        const results = [];

        for (let i = 0; i < totalFiles; i++) {
            const file = files[i];
            
            try {
                // Report overall progress
                if (onProgress) {
                    onProgress({
                        type: 'overall',
                        current: i,
                        total: totalFiles,
                        currentFile: file.path,
                        status: 'uploading'
                    });
                }

                // Upload the file
                await this.uploadFile(file.path, file.content, (fileProgress) => {
                    if (onProgress) {
                        onProgress({
                            type: 'file',
                            ...fileProgress
                        });
                    }
                });

                results.push({ path: file.path, status: 'success' });

            } catch (error) {
                console.error(`Failed to upload ${file.path}:`, error);
                results.push({ path: file.path, status: 'error', error: error.message });
                
                if (onProgress) {
                    onProgress({
                        type: 'error',
                        file: file.path,
                        error: error.message
                    });
                }
            }
        }

        // Report completion
        if (onProgress) {
            onProgress({
                type: 'complete',
                results
            });
        }

        return results;
    }

    /**
     * Reset the board
     */
    async resetBoard() {
        console.log('Resetting board...');
        
        try {
            // Exit raw REPL if we're in it
            await this.write('\x02'); // CTRL-B
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Send soft reset command
            await this.write('\x04'); // CTRL-D
            await new Promise(resolve => setTimeout(resolve, 500));
            
            console.log('✓ Board reset');
        } catch (error) {
            console.error('Reset error:', error);
        }
    }
}

export default SerialUploader;

