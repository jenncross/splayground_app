/**
 * Welcome State Component
 * 
 * Displays helpful onboarding instructions when the app first loads
 * and no hub is connected. Guides users through the first connection.
 * 
 * This replaces the empty "No messages sent yet" placeholder with
 * actionable guidance to help users get started quickly.
 */

export function createWelcomeState(onConnect) {
    const container = document.createElement('div');
    container.className = 'flex-1 flex items-center justify-center p-6 bg-gray-50';
    
    container.innerHTML = `
        <div class="max-w-sm mx-auto text-center">
            <!-- Icon -->
            <div class="mb-6 flex justify-center">
                <div class="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center">
                    <i data-lucide="cable" class="w-10 h-10 text-blue-600"></i>
                </div>
            </div>
            
            <!-- Heading -->
            <h2 class="text-lg font-semibold text-gray-900 mb-3">
                Welcome to Smart Playground Control
            </h2>
            
            <!-- Instructions -->
            <div class="space-y-4 mb-6">
                <div class="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                    <div class="flex items-start gap-3 text-left">
                        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span class="text-sm font-bold text-blue-600">1</span>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm font-medium text-gray-900 mb-1">
                                Connect your hub via USB
                            </p>
                            <p class="text-xs text-gray-600">
                                Use a USB cable to connect your ESP32 hub to this computer
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                    <div class="flex items-start gap-3 text-left">
                        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span class="text-sm font-bold text-blue-600">2</span>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm font-medium text-gray-900 mb-1">
                                Press the Connect button
                            </p>
                            <p class="text-xs text-gray-600">
                                Look for the orange "Disconnected" button at the top of the screen
                            </p>
                        </div>
                    </div>
                </div>
                
                <div class="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
                    <div class="flex items-start gap-3 text-left">
                        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span class="text-sm font-bold text-blue-600">3</span>
                        </div>
                        <div class="flex-1">
                            <p class="text-sm font-medium text-gray-900 mb-1">
                                Select your hub device
                            </p>
                            <p class="text-xs text-gray-600">
                                Choose your ESP32 device from the browser prompt
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- CTA Button -->
            <button id="welcomeConnectBtn" class="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shadow-md hover:shadow-lg flex items-center justify-center gap-2 mx-auto">
                <i data-lucide="plug" class="w-4 h-4"></i>
                Connect Hub
            </button>
            
            <!-- Help Text -->
            <p class="text-xs text-gray-500 mt-4">
                Once connected, you'll be able to send commands to playground modules
            </p>
        </div>
    `;
    
    // Attach click handler
    const connectBtn = container.querySelector('#welcomeConnectBtn');
    if (connectBtn) {
        connectBtn.onclick = onConnect;
    }
    
    return container;
}

