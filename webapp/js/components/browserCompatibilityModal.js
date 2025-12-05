/**
 * Browser Compatibility Modal Component
 * 
 * Displays a blocking modal when the browser doesn't support required Web APIs.
 * This modal cannot be dismissed and guides users to use a compatible browser.
 * 
 * Required APIs:
 * - Web Serial API (for USB hub connection)
 * 
 * Compatible Browsers:
 * - Chrome/Chromium 89+
 * - Edge 89+
 * - Opera 75+
 * 
 * Incompatible Browsers:
 * - Firefox (no Web Serial support)
 * - Safari (no Web Serial support)
 * - Mobile browsers (limited support)
 */

export function createBrowserCompatibilityModal() {
    const modal = document.createElement('div');
    modal.className = 'absolute inset-0 bg-black bg-opacity-75 z-[100] flex items-center justify-center p-4';
    modal.style.backdropFilter = 'blur(4px)';
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-8 max-w-md mx-auto shadow-2xl" onclick="event.stopPropagation()">
            <div class="flex flex-col items-center text-center">
                <!-- Error Icon -->
                <div class="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <i data-lucide="alert-triangle" class="w-8 h-8 text-red-600"></i>
                </div>
                
                <!-- Heading -->
                <h2 class="text-xl font-semibold text-gray-900 mb-2">Browser Not Supported</h2>
                
                <!-- Description -->
                <p class="text-sm text-gray-600 mb-6 leading-relaxed">
                    This app requires <strong>Web Serial API</strong> to connect to the hub via USB. 
                    Your current browser doesn't support this feature.
                </p>
                
                <!-- Supported Browsers -->
                <div class="bg-gray-50 rounded-lg p-4 mb-6 w-full">
                    <p class="text-xs font-medium text-gray-700 mb-3">Please use one of these browsers:</p>
                    <div class="space-y-2">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                                <i data-lucide="chrome" class="w-5 h-5 text-blue-600"></i>
                            </div>
                            <span class="text-sm text-gray-900 font-medium">Google Chrome</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center shadow-sm">
                                <i data-lucide="square" class="w-5 h-5 text-blue-500"></i>
                            </div>
                            <span class="text-sm text-gray-900 font-medium">Microsoft Edge</span>
                        </div>
                    </div>
                </div>
                
                <!-- Current Browser Info -->
                <div class="text-xs text-gray-500 mb-4">
                    <span class="font-medium">Current browser:</span>
                    <span id="browserName" class="ml-1"></span>
                </div>
                
                <!-- Help Link -->
                <a href="https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API#browser_compatibility" 
                   target="_blank" 
                   class="text-xs text-blue-600 hover:text-blue-700 underline">
                    Learn more about browser compatibility
                </a>
            </div>
        </div>
    `;
    
    // Detect and display browser name
    const browserNameSpan = modal.querySelector('#browserName');
    if (browserNameSpan) {
        browserNameSpan.textContent = detectBrowserName();
    }
    
    return modal;
}

/**
 * Check if the browser supports Web Serial API
 * @returns {boolean} True if browser is compatible, false otherwise
 */
export function isBrowserCompatible() {
    return 'serial' in navigator;
}

/**
 * Detect browser name for display purposes
 * @returns {string} Browser name
 */
function detectBrowserName() {
    const userAgent = navigator.userAgent;
    
    if (userAgent.includes('Edg/')) {
        return 'Microsoft Edge';
    } else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
        return 'Google Chrome';
    } else if (userAgent.includes('Firefox/')) {
        return 'Mozilla Firefox';
    } else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
        return 'Safari';
    } else if (userAgent.includes('Opera/') || userAgent.includes('OPR/')) {
        return 'Opera';
    } else {
        return 'Unknown Browser';
    }
}

