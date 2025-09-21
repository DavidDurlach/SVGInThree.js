// Geometry Utility Functions
// Last edit date: 2025-09-11

import * as THREE from 'three';

/**
 * Calculate the shortest angle difference between two angles
 * @param {number} a - First angle in radians
 * @param {number} b - Second angle in radians
 * @returns {number} Shortest angle difference in radians
 */
export function shortestAngleDiff(a, b) { 
    let d = a - b; 
    while (d > Math.PI) d -= 2 * Math.PI; 
    while (d < -Math.PI) d += 2 * Math.PI; 
    return d; 
}

/**
 * Create a right triangle shape
 * @param {number} w - Width
 * @param {number} h - Height
 * @returns {THREE.Shape} Triangle shape
 */
export function makeRightTriangleShape(w, h) { 
    const s = new THREE.Shape(); 
    s.moveTo(0, -h/2); 
    s.lineTo(w, 0); 
    s.lineTo(0, h/2); 
    s.closePath(); 
    return s; 
}

/**
 * Create a hollow right triangle shape with stroke
 * @param {number} w - Width
 * @param {number} h - Height
 * @param {number} stroke - Stroke width
 * @returns {THREE.Shape} Hollow triangle shape
 */
export function makeHollowRightTriangleShape(w, h, stroke) { 
    const outer = makeRightTriangleShape(w, h); 
    const ih = Math.max(0.001, h - 2 * stroke); 
    const inner = new THREE.Path(); 
    inner.moveTo(stroke, -ih/2); 
    inner.lineTo(w - stroke, 0); 
    inner.lineTo(stroke, ih/2); 
    inner.closePath(); 
    outer.holes.push(inner); 
    return outer; 
}

/**
 * Parse points string from SVG
 * @param {string} str - Points string
 * @returns {Array} Array of point arrays
 */
export function parsePoints(str) { 
    return (str || "").trim().split(/\s+/).map(p => p.split(',').map(n => parseFloat(n))); 
}

/**
 * Check if points form an axis-aligned rectangle
 * @param {Array} pts - Array of points
 * @returns {boolean} True if axis-aligned rectangle
 */
export function isAxisAlignedRect(pts) { 
    const xs = [...new Set(pts.map(p => p[0]))]; 
    const ys = [...new Set(pts.map(p => p[1]))]; 
    if (xs.length !== 2 || ys.length !== 2) return false; 
    const set = new Set(pts.map(p => `${p[0]},${p[1]}`)); 
    const combos = [[xs[0], ys[0]], [xs[1], ys[0]], [xs[1], ys[1]], [xs[0], ys[1]]]; 
    return combos.every(c => set.has(`${c[0]},${c[1]}`)); 
}

/**
 * Create a rectangle shape
 * @param {number} minX - Minimum X coordinate
 * @param {number} minY - Minimum Y coordinate
 * @param {number} maxX - Maximum X coordinate
 * @param {number} maxY - Maximum Y coordinate
 * @returns {THREE.Shape} Rectangle shape
 */
export function rectShape(minX, minY, maxX, maxY) { 
    const s = new THREE.Shape(); 
    s.moveTo(minX, minY); 
    s.lineTo(maxX, minY); 
    s.lineTo(maxX, maxY); 
    s.lineTo(minX, maxY); 
    s.closePath(); 
    return s; 
}

/**
 * Calculate approximate area of a shape
 * @param {THREE.Shape} shape - Shape to calculate area for
 * @returns {number} Approximate area
 */
export function approxShapeArea(shape) { 
    const pts = shape.getPoints(32); 
    if (pts.length < 3) return 0; 
    let sum = 0; 
    for (let i = 0; i < pts.length; i++) { 
        const a = pts[i], b = pts[(i + 1) % pts.length]; 
        sum += a.x * b.y - b.x * a.y; 
    } 
    return Math.abs(sum) * 0.5; 
}

/**
 * Check if a subpath is closed
 * @param {Object} sub - Subpath object
 * @returns {boolean} True if closed
 */
export function isClosedSubPath(sub) { 
    const pts = sub.getPoints(2); 
    if (pts.length < 2) return false; 
    return pts[0].distanceTo(pts[pts.length - 1]) < 1e-6; 
}