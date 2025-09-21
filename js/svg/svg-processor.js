// SVG Processing Module
// Last edit date: 2025-09-11

import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import * as config from '../config.js';
import { 
    makeRightTriangleShape, 
    makeHollowRightTriangleShape,
    parsePoints,
    isAxisAlignedRect,
    rectShape,
    approxShapeArea,
    isClosedSubPath
} from '../utils/geometry-utils.js';
import { normalizeHex } from '../utils/color-utils.js';

// Runtime debug flag
let DEBUG_ANIM_ENABLED = config.DEFAULT_DEBUG_ANIM;

/**
 * Set debug mode
 * @param {boolean} enabled - Enable or disable debug logging
 */
export function setDebugMode(enabled) {
    DEBUG_ANIM_ENABLED = enabled;
}

/**
 * Convert SVG stroke to geometry
 * @private
 */
function strokeToGeom(subPath, style) {
    const pts = subPath.getPoints();
    if (pts.length < 2) return null;
    const s = {...style};
    if (!s.strokeWidth || s.strokeWidth === 0) s.strokeWidth = 1.5;
    try {
        return SVGLoader.pointsToStroke(pts, s);
    } catch {
        return null;
    }
}

/**
 * Build merged geometry from SVG text
 * @param {string} svgText - SVG content as text
 * @param {Object} options - Processing options
 * @returns {THREE.BufferGeometry|null} Merged geometry or null
 */
export function buildMergedFromSVG(svgText, options = {}) {
    const {
        scale = config.DEFAULT_SCALE,
        depth = config.DEFAULT_MESH_DEPTH,
        includeText = true,
        font = null,
        textDepth = config.DEFAULT_TEXT_DEPTH,
        fillNodes = config.DEFAULT_FILL_NODES,
        nodePlateDepth = config.DEFAULT_NODE_PLATE_DEPTH,
        nodeZOffset = config.DEFAULT_NODE_Z_OFFSET,
        nodeFillColor = config.DEFAULT_NODE_FILL_COLOR,
        smartFill = config.DEFAULT_SMART_FILL,
        minPlateArea = config.DEFAULT_MIN_PLATE_AREA,
        plateFillRule = config.DEFAULT_PLATE_FILL_RULE,
        plateStrokeColorFilter = null
    } = options;

    if (DEBUG_ANIM_ENABLED) {
        console.log('Building geometry from SVG, length:', svgText ? svgText.length : 0);
        console.log('USE_SVG_COLORS:', config.USE_SVG_COLORS);
    }
    
    if (!svgText) {
        console.error('No SVG text provided');
        return null;
    }

    const loader = new SVGLoader();
    const data = loader.parse(svgText);
    if (DEBUG_ANIM_ENABLED) {
        console.log('SVG parsed, found paths:', data.paths.length);
    }
    
    // When using SVG colors, we group geometries by color
    const geometriesByColor = config.USE_SVG_COLORS ? new Map() : null;
    const inkGeoms = [];
    const plateGeoms = [];
    const guiPlateGeoms = [];  // Plates that use GUI color (fill="none" nodes)

    // Helper to add geometry to appropriate collection
    const addGeometry = (geom, color, isPlate = false) => {
        if (!geom) return;
        
        if (config.USE_SVG_COLORS) {
            const key = color || '#000000';
            if (!geometriesByColor.has(key)) {
                geometriesByColor.set(key, { ink: [], plates: [] });
            }
            if (isPlate) {
                geometriesByColor.get(key).plates.push(geom);
            } else {
                geometriesByColor.get(key).ink.push(geom);
            }
        } else {
            if (isPlate) {
                plateGeoms.push(geom);
            } else {
                inkGeoms.push(geom);
            }
        }
    };

    // Process SVG paths
    for (const path of data.paths) {
        const style = path.userData.style || {};
        const fo = style.fillOpacity ?? 1;
        const so = style.strokeOpacity ?? 1;
        const transparent = (style.fill === 'none' || fo < 0.01) && (style.stroke === 'none' || so < 0.01);
        if (transparent) continue;

        if (style.fill !== 'none' && fo > 0.01) {
            for (const sh of SVGLoader.createShapes(path)) {
                const geom = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
                addGeometry(geom, style.fill);
            }
        }

        if (style.stroke !== 'none' && so > 0.01) {
            for (const sub of path.subPaths) {
                const g = strokeToGeom(sub, style);
                if (g) {
                    g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, depth * config.DEFAULT_STROKE_Z_OFFSET_FACTOR));
                    addGeometry(g, style.stroke);
                }
            }
        }
    }

    // Process text elements
    if (includeText && font) {
        processTextElements(svgText, font, textDepth, depth, addGeometry);
    }

    // Process node fills
    if (fillNodes) {
        processNodeFills(svgText, nodePlateDepth, nodeZOffset, guiPlateGeoms, plateGeoms);
    }

    // Smart fill for closed outlines
    if (fillNodes && smartFill) {
        processSmartFill(data.paths, {
            nodePlateDepth,
            nodeZOffset,
            minPlateArea,
            plateFillRule,
            plateStrokeColorFilter,
            guiPlateGeoms,
            plateGeoms
        });
    }

    // Merge geometries and return
    return mergeAndFinalize({
        geometriesByColor,
        inkGeoms,
        plateGeoms,
        guiPlateGeoms,
        scale
    });
}

/**
 * Process text elements from SVG
 * @private
 */
function processTextElements(svgText, font, textDepth, depth, addGeometry) {
    try {
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        const texts = Array.from(doc.querySelectorAll('text'));
        
        for (const t of texts) {
            const raw = t.textContent || '';
            if (!raw.trim()) continue;
            
            const textColor = t.getAttribute('fill') || '#000000';
            
            const arrow = raw.match(/\s*([▶▷])\s*$/u);
            const arrowChar = arrow ? arrow[1] : null;
            const content = arrow ? raw.slice(0, raw.length - arrow[0].length).trimEnd() : raw;
            
            const x = parseFloat(t.getAttribute('x') || '0');
            const y = parseFloat(t.getAttribute('y') || '0');
            const fontSize = parseFloat(t.getAttribute('font-size') || '12');
            
            let width = 0;
            let centerYLocal = 0;
            
            if (content) {
                let tg = null;
                try {
                    tg = new TextGeometry(content, {
                        font,
                        size: fontSize,
                        depth: textDepth,
                        curveSegments: 4,
                        bevelEnabled: false
                    });
                } catch {
                    tg = null;
                }
                
                if (tg) {
                    tg.applyMatrix4(new THREE.Matrix4().makeScale(1, -1, 1));
                    tg.computeBoundingBox();
                    const bb = tg.boundingBox;
                    if (bb) {
                        width = bb.max.x - bb.min.x;
                        centerYLocal = (bb.max.y + bb.min.y) / 2;
                    }
                    tg.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, depth * config.DEFAULT_TEXT_Z_OFFSET_FACTOR));
                    addGeometry(tg, textColor);
                }
            }
            
            if (arrowChar) {
                const arrowW = fontSize * 0.9;
                const arrowH = fontSize * 0.9;
                const margin = fontSize * 0.25;
                const stroke = Math.max(1, fontSize * 0.18);
                const hollow = arrowChar === '▷';
                const shape = hollow ? makeHollowRightTriangleShape(arrowW, arrowH, stroke) : makeRightTriangleShape(arrowW, arrowH);
                const tri = new THREE.ExtrudeGeometry(shape, { depth: textDepth, bevelEnabled: false });
                tri.applyMatrix4(new THREE.Matrix4().makeScale(1, -1, 1));
                tri.applyMatrix4(new THREE.Matrix4().makeTranslation(x + width + margin, y + centerYLocal, depth * config.DEFAULT_TEXT_Z_OFFSET_FACTOR));
                addGeometry(tri, textColor);
            }
        }
    } catch (e) {
        console.warn('SVG <text> parse failed:', e);
    }
}

/**
 * Process node fills (rectangles and polygons)
 * @private
 */
function processNodeFills(svgText, nodePlateDepth, nodeZOffset, guiPlateGeoms, plateGeoms) {
    try {
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        const rects = Array.from(doc.querySelectorAll('rect'));
        
        for (const r of rects) {
            const x = parseFloat(r.getAttribute('x') || '0');
            const y = parseFloat(r.getAttribute('y') || '0');
            const w = parseFloat(r.getAttribute('width') || '0');
            const h = parseFloat(r.getAttribute('height') || '0');
            if (w <= 0 || h <= 0) continue;
            
            const fillColor = r.getAttribute('fill');
            if (fillColor && fillColor !== 'none') continue;
            
            const s = rectShape(x, y, x + w, y + h);
            const g = new THREE.ExtrudeGeometry(s, { depth: nodePlateDepth, bevelEnabled: false });
            g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, nodeZOffset));
            
            if (config.USE_SVG_COLORS) {
                guiPlateGeoms.push(g);
            } else {
                plateGeoms.push(g);
            }
        }
        
        const polys = Array.from(doc.querySelectorAll('polygon'));
        for (const p of polys) {
            const pts = parsePoints(p.getAttribute('points'));
            if (pts.length < 4) continue;
            if (!isAxisAlignedRect(pts)) continue;
            
            const xs = pts.map(q => q[0]);
            const ys = pts.map(q => q[1]);
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            
            const so = p.getAttribute('stroke-opacity');
            const fo = p.getAttribute('fill-opacity');
            if ((so && parseFloat(so) < 0.01) && (fo && parseFloat(fo) < 0.01)) continue;
            
            const fillColor = p.getAttribute('fill');
            if (fillColor && fillColor !== 'none') continue;
            
            const s = rectShape(minX, minY, maxX, maxY);
            const g = new THREE.ExtrudeGeometry(s, { depth: nodePlateDepth, bevelEnabled: false });
            g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, nodeZOffset));
            
            if (config.USE_SVG_COLORS) {
                guiPlateGeoms.push(g);
            } else {
                plateGeoms.push(g);
            }
        }
    } catch (e) {
        console.warn('SVG node plate parse failed:', e);
    }
}

/**
 * Process smart fill for closed outlines
 * @private
 */
function processSmartFill(paths, options) {
    const {
        nodePlateDepth,
        nodeZOffset,
        minPlateArea,
        plateFillRule,
        plateStrokeColorFilter,
        guiPlateGeoms,
        plateGeoms
    } = options;

    if (DEBUG_ANIM_ENABLED) {
        console.log('Processing smart fill for closed outlines');
    }
    
    const normalizeFilter = plateStrokeColorFilter?.map(normalizeHex) || null;
    
    for (const path of paths) {
        const style = path.userData.style || {};
        const fo = style.fillOpacity ?? 1;
        const so = style.strokeOpacity ?? 1;
        const hasFill = (style.fill && style.fill !== 'none' && fo > 0);
        const hasStroke = (style.stroke && style.stroke !== 'none' && so > 0);
        
        const strokeHex = normalizeHex(style.stroke);
        const allowByColor = !normalizeFilter || (strokeHex && normalizeFilter.includes(strokeHex));
        const looksOutline = (!hasFill && hasStroke);
        const allClosed = path.subPaths.length > 0 && path.subPaths.every(isClosedSubPath);
        
        if (allowByColor && looksOutline && allClosed) {
            if (DEBUG_ANIM_ENABLED) {
                console.log('Found closed outline, creating fill plate');
            }
            
            const prevFill = style.fill;
            const prevRule = style.fillRule;
            path.userData.style.fill = '#000000';
            path.userData.style.fillRule = plateFillRule;
            
            const shapes = SVGLoader.createShapes(path);
            
            path.userData.style.fill = prevFill;
            path.userData.style.fillRule = prevRule;
            
            for (const sh of shapes) {
                const area = approxShapeArea(sh);
                if (area < minPlateArea) {
                    if (DEBUG_ANIM_ENABLED) {
                        console.log(`Skipping shape with area ${area} < ${minPlateArea}`);
                    }
                    continue;
                }
                
                const g = new THREE.ExtrudeGeometry(sh, { 
                    depth: nodePlateDepth, 
                    bevelEnabled: false 
                });
                g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, nodeZOffset));
                
                if (config.USE_SVG_COLORS) {
                    guiPlateGeoms.push(g);
                } else {
                    plateGeoms.push(g);
                }
            }
        }
    }
}

/**
 * Merge and finalize geometries
 * @private
 */
function mergeAndFinalize(options) {
    const {
        geometriesByColor,
        inkGeoms,
        plateGeoms,
        guiPlateGeoms,
        scale
    } = options;

    let merged;
    let colorMaterials = null;
    let hasGuiPlates = false;
    
    if (config.USE_SVG_COLORS) {
        const inkEntries = [];
        const plateEntries = [];
        let guiPlateEntry = null;
        
        if (DEBUG_ANIM_ENABLED) {
            console.log('Processing colors:', geometriesByColor ? Array.from(geometriesByColor.keys()) : []);
            console.log('GUI plate geometries:', guiPlateGeoms.length);
        }
        
        if (geometriesByColor) {
            for (const [color, geomSet] of geometriesByColor) {
                if (geomSet.ink.length > 0) {
                    const inkMerged = mergeGeometries(geomSet.ink, false);
                    if (inkMerged) {
                        inkMerged.clearGroups();
                        inkEntries.push({ color, geom: inkMerged });
                    }
                }
                if (geomSet.plates.length > 0) {
                    const plateMerged = mergeGeometries(geomSet.plates, false);
                    if (plateMerged) {
                        plateMerged.clearGroups();
                        plateEntries.push({ color, geom: plateMerged });
                    }
                }
            }
        }
        
        if (guiPlateGeoms.length > 0) {
            const guiPlateMerged = mergeGeometries(guiPlateGeoms, false);
            if (guiPlateMerged) {
                guiPlateMerged.clearGroups();
                guiPlateEntry = { color: 'GUI', geom: guiPlateMerged };
                hasGuiPlates = true;
            }
        }
        
        const allGeoms = [];
        colorMaterials = [];
        let materialIndex = 0;
        
        for (const entry of inkEntries) {
            entry.geom.addGroup(0, Infinity, materialIndex);
            allGeoms.push(entry.geom);
            colorMaterials.push({ color: entry.color, type: 'ink', index: materialIndex });
            materialIndex++;
        }
        for (const entry of plateEntries) {
            entry.geom.addGroup(0, Infinity, materialIndex);
            allGeoms.push(entry.geom);
            colorMaterials.push({ color: entry.color, type: 'plate', index: materialIndex });
            materialIndex++;
        }
        if (guiPlateEntry) {
            guiPlateEntry.geom.addGroup(0, Infinity, materialIndex);
            allGeoms.push(guiPlateEntry.geom);
            colorMaterials.push({ color: 'GUI', type: 'gui-plate', index: materialIndex });
            materialIndex++;
        }
        
        if (allGeoms.length === 0) {
            console.warn('No geometry created from SVG');
            return null;
        }
        
        merged = mergeGeometries(allGeoms, true);
        if (DEBUG_ANIM_ENABLED) {
            console.log(`Created ${colorMaterials.length} materials for ${geometriesByColor ? geometriesByColor.size : 0} colors + ${hasGuiPlates ? '1 GUI plate' : '0 GUI plates'}`);
        }
    } else {
        if (DEBUG_ANIM_ENABLED) {
            console.log('Ink geometries:', inkGeoms.length, 'Plate geometries:', plateGeoms.length);
        }
        const inkMerged = inkGeoms.length ? mergeGeometries(inkGeoms, true) : null;
        const plateMerged = plateGeoms.length ? mergeGeometries(plateGeoms, true) : null;
        
        if (!inkMerged && !plateMerged) {
            console.warn('No geometry created from SVG');
            return null;
        }
        
        if (inkMerged && plateMerged) {
            inkMerged.clearGroups();
            inkMerged.addGroup(0, Infinity, 0);
            plateMerged.clearGroups();
            plateMerged.addGroup(0, Infinity, 1);
            merged = mergeGeometries([inkMerged, plateMerged], true);
        } else if (inkMerged) {
            inkMerged.clearGroups();
            inkMerged.addGroup(0, Infinity, 0);
            merged = inkMerged;
        } else {
            plateMerged.clearGroups();
            plateMerged.addGroup(0, Infinity, 1);
            merged = plateMerged;
        }
        if (DEBUG_ANIM_ENABLED) {
            console.log('Merged geometry created successfully');
        }
    }
    
    // Apply transformations
    const flip = new THREE.Matrix4().makeScale(scale, -scale, scale);
    merged.applyMatrix4(flip);
    merged.computeBoundingBox();
    
    const bb = merged.boundingBox;
    const cx = (bb.max.x + bb.min.x) / 2;
    const cy = (bb.max.y + bb.min.y) / 2;
    const cz = (bb.max.z + bb.min.z) / 2;
    
    merged.applyMatrix4(new THREE.Matrix4().makeTranslation(-cx, -cy, -cz));
    merged.computeVertexNormals();
    
    // Store color materials info if using SVG colors
    if (config.USE_SVG_COLORS && colorMaterials) {
        merged.userData.colorMaterials = colorMaterials;
    }
    
    return merged;
}