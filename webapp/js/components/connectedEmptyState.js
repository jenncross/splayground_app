/**
 * Connected Empty State Component
 * 
 * Displays helpful instructions when the hub is connected but no messages
 * have been sent yet. Guides users to use the send command field.
 * 
 * This helps users understand how to start sending commands after
 * successfully connecting their hub.
 */

export function createConnectedEmptyState(onFocusCommandField) {
    const container = document.createElement('div');
    container.className = 'text-center py-8 text-sm';
    
    container.innerHTML = `
        <div class="max-w-md mx-auto">
            <!-- Success indicator -->
            <div class="flex items-center justify-center gap-2 mb-3">
                <i data-lucide="check-circle" class="w-4 h-4 text-green-600"></i>
                <span class="text-gray-700 font-medium">Hub Connected</span>
            </div>
            
            <!-- Main message -->
            <p class="text-gray-600 mb-3">
                Click the <strong>Send Command</strong> field below to get started
            </p>
            
            <!-- Visual indicator -->
            <div class="flex items-center justify-center gap-2 text-gray-400 animate-bounce">
                <i data-lucide="arrow-down" class="w-4 h-4"></i>
            </div>
        </div>
    `;
    
    // Optional: If you want to programmatically focus the command field
    // You can pass a callback function to do this
    if (onFocusCommandField) {
        container.style.cursor = 'pointer';
        container.onclick = onFocusCommandField;
    }
    
    return container;
}

