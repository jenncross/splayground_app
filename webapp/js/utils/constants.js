/**
 * Smart Playground Control - Application Constants
 * 
 * This module defines all constant values used throughout the application,
 * including command definitions, colors, icons, and configuration values.
 * Centralizing constants here makes the application easier to maintain
 * and allows for consistent theming and behavior.
 * 
 * Key Constants:
 * - COMMANDS: Available playground commands with styling and icons
 * - Command properties: id, label, background color, icon, text color
 * 
 * Command Types:
 * - Notes: Musical notes game
 * - Shake: Shake detection game
 * - Hot_cold: Hot/Cold proximity game
 * - Jump: Jump detection game
 * - Clap: Clap detection game
 * - Rainbow: Rainbow light animation
 * - Off: Hibernate mode (deep sleep)
 * 
 * Usage:
 * - Import COMMANDS array for command palette generation
 * - Use consistent command IDs throughout application
 * - Colors and icons are defined here for easy theming
 * 
 */

export const COMMANDS = [
    { id: "Notes", label: "Notes", bgColor: "#7eb09b", icon: "music", textColor: "white" },
    { id: "Shake", label: "Shake", bgColor: "#d4a574", icon: "zap", textColor: "white" },
    { id: "Hot_cold", label: "Hot/Cold", bgColor: "#b084cc", icon: "thermometer", textColor: "white" },
    { id: "Jump", label: "Jump", bgColor: "#658ea9", icon: "arrow-up", textColor: "white" },
    { id: "Clap", label: "Clap", bgColor: "#8fbc8f", icon: "hand", textColor: "white" },
    { id: "Rainbow", label: "Rainbow", bgColor: "#d7a449", icon: "rainbow", textColor: "white" },
    { id: "Off", label: "Off", bgColor: "#e98973", icon: "power-off", textColor: "white" },
];

