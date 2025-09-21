// Color Utility Functions
// Last edit date: 2025-09-11

import * as THREE from 'three';

/**
 * Normalize a color to hex format
 * @param {string} c - Color string (any format)
 * @returns {string|null} Normalized hex color or null if invalid
 */
export function normalizeHex(c) { 
    try { 
        const col = new THREE.Color(c); 
        return `#${col.getHexString()}`; 
    } catch { 
        return null; 
    } 
}

/**
 * Convert RGB to hex
 * @param {number} r - Red value (0-255)
 * @param {number} g - Green value (0-255)
 * @param {number} b - Blue value (0-255)
 * @returns {string} Hex color string
 */
export function rgbToHex(r, g, b) {
    const toHex = (n) => {
        const hex = Math.round(Math.min(255, Math.max(0, n))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Parse hex color to RGB
 * @param {string} hex - Hex color string
 * @returns {Object} RGB values {r, g, b}
 */
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}