/**
 * Smart Playground Control - Command Info Overlay Component
 * 
 * This component displays helpful information about each command when the user
 * presses the info icon next to a command button.
 * 
 * Key Features:
 * - Centered modal overlay with command description
 * - Shows command icon for visual reference
 * - Closes via X button or clicking outside
 * - Smooth fade-in/fade-out animations
 * - Mobile-optimized for small viewport (max-w-md)
 * 
 * Props:
 * - commandLabel: The display name of the command
 * - commandDescription: The description text to show
 * - commandIcon: The icon element to display
 * - onClose: Callback when overlay should be closed
 */

export function createCommandInfoOverlay(commandLabel, commandDescription, commandIcon, onClose) {
    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-50 flex items-center justify-center px-4";
    overlay.style.backgroundColor = "rgba(0, 0, 0, 0.4)";
    
    // Close on background click
    overlay.onclick = (e) => {
        if (e.target === overlay) {
            onClose();
        }
    };

    const popup = document.createElement("div");
    popup.className = "bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm animate-fade-in relative";
    
    // Stop clicks/touches on popup from bubbling
    popup.onclick = (e) => e.stopPropagation();

    // Add close button (X)
    const closeBtn = document.createElement("button");
    closeBtn.className = "absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors";
    closeBtn.innerHTML = '<i data-lucide="x" class="w-5 h-5"></i>';
    closeBtn.onclick = onClose;
    popup.appendChild(closeBtn);

    // Create container for content
    const content = document.createElement("div");
    content.className = "flex flex-col items-center gap-4 text-center";

    // Add command icon (clone it so we don't move the original)
    const iconContainer = document.createElement("div");
    iconContainer.appendChild(commandIcon.cloneNode(true));
    content.appendChild(iconContainer);

    // Add command label
    const title = document.createElement("h3");
    title.className = "text-lg font-semibold text-gray-900";
    title.textContent = commandLabel;
    content.appendChild(title);

    // Add description
    const description = document.createElement("p");
    description.className = "text-sm text-gray-600 leading-relaxed";
    description.textContent = commandDescription;
    content.appendChild(description);

    popup.appendChild(content);
    overlay.appendChild(popup);

    return overlay;
}
