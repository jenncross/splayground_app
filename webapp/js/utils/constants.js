/**
 * Smart Playground Control - Application Constants
 * 
 * This module defines all constant values used throughout the application,
 * including command definitions, colors, icons, and configuration values.
 * Centralizing constants here makes the application easier to maintain
 * and allows for consistent theming and behavior.
 * 
 * Key Constants:
 * - COMMANDS: Available playground commands with styling, icons, and descriptions
 * - Command properties: id, label, background color, icon, text color, description
 * 
 * Command Configuration:
 * - All command data is loaded from commands.json
 * - To add/edit commands, simply update commands.json
 * - Each command includes a description for the info overlay
 * 
 * Usage:
 * - Import COMMANDS array for command palette generation
 * - Use consistent command IDs throughout application
 * - Colors, icons, and descriptions are defined in commands.json for easy updates
 * 
 */

// Load commands from JSON configuration file
let commandsData = [];

// Fetch commands synchronously using top-level await (ES2022)
try {
    const response = await fetch('./js/utils/commands.json');
    commandsData = await response.json();
    console.log('Commands loaded from JSON:', commandsData);
} catch (error) {
    console.error('Failed to load commands.json:', error);
    // Fallback to empty array - app will still work
    commandsData = [];
}

export const COMMANDS = commandsData;

/**
 * Get command label from command ID
 * @param {string} commandId - The command ID (e.g., "Hot_cold")
 * @returns {string} - The display label (e.g., "Hot/Cold")
 */
export function getCommandLabel(commandId) {
    const command = COMMANDS.find(cmd => cmd.id === commandId);
    return command ? command.label : commandId;
}

/**
 * Get command by ID
 * @param {string} commandId - The command ID
 * @returns {object|null} - The command object or null if not found
 */
export function getCommandById(commandId) {
    return COMMANDS.find(cmd => cmd.id === commandId) || null;
}

