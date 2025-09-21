// Mesh Creation Module
// Last edit date: 2025-09-11

import * as THREE from 'three';
import * as config from '../config.js';

/**
 * Create mesh from geometry with appropriate materials
 * @param {THREE.BufferGeometry} geom - The geometry to create mesh from
 * @param {Object} state - Current application state
 * @returns {THREE.Mesh|THREE.Group} Mesh or group of meshes
 */
export function createMesh(geom, state) {
    let materials;
    
    if (config.USE_SVG_COLORS && geom.userData.colorMaterials) {
        // Create materials based on SVG colors
        materials = geom.userData.colorMaterials.map(matInfo => {
            const isPlate = matInfo.type === 'plate';
            const isGuiPlate = matInfo.type === 'gui-plate';
            
            if (isGuiPlate) {
                // GUI-controlled plate (for nodes with fill="none")
                const mat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(state.nodeFillColor || '#ffffff'),
                    roughness: 0.95,
                    metalness: 0.0,
                    side: THREE.DoubleSide,
                    transparent: state.currentNodeFillOpacity < 1,
                    opacity: state.currentNodeFillOpacity,
                    depthWrite: config.DEFAULT_FORCE_DEPTH_WRITE ? true : (state.currentNodeFillOpacity >= 1),
                    alphaTest: state.currentNodeFillOpacity < 1 ? config.DEFAULT_ALPHA_TEST : 0,
                    emissive: new THREE.Color(state.nodeFillColor || '#ffffff'),
                    emissiveIntensity: config.DEFAULT_PLATE_EMISSIVE_INTENSITY,
                    toneMapped: !config.DEFAULT_PLATE_TONEMAP_DISABLED
                });
                // Apply polygon offset if enabled (plates benefit most from this)
                if (config.DEFAULT_POLYGON_OFFSET_ENABLED) {
                    mat.polygonOffset = true;
                    mat.polygonOffsetFactor = config.DEFAULT_POLYGON_OFFSET_FACTOR;
                    mat.polygonOffsetUnits = config.DEFAULT_POLYGON_OFFSET_UNITS;
                }
                return mat;
            } else {
                // SVG-colored geometry
                const mat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(matInfo.color),
                    roughness: isPlate ? 0.95 : 0.4,
                    metalness: isPlate ? 0.0 : 0.05,
                    side: THREE.DoubleSide,
                    transparent: isPlate && state.currentNodeFillOpacity < 1,
                    opacity: isPlate ? state.currentNodeFillOpacity : 1.0,
                    depthWrite: isPlate ? (config.DEFAULT_FORCE_DEPTH_WRITE ? true : (state.currentNodeFillOpacity >= 1)) : true,
                    alphaTest: (isPlate && state.currentNodeFillOpacity < 1) ? config.DEFAULT_ALPHA_TEST : 0,
                    emissive: isPlate ? new THREE.Color(matInfo.color) : new THREE.Color(0x000000),
                    emissiveIntensity: isPlate ? config.DEFAULT_PLATE_EMISSIVE_INTENSITY : 0,
                    toneMapped: isPlate ? !config.DEFAULT_PLATE_TONEMAP_DISABLED : true
                });
                // Apply polygon offset if enabled and it's a plate
                if (config.DEFAULT_POLYGON_OFFSET_ENABLED && isPlate) {
                    mat.polygonOffset = true;
                    mat.polygonOffsetFactor = config.DEFAULT_POLYGON_OFFSET_FACTOR;
                    mat.polygonOffsetUnits = config.DEFAULT_POLYGON_OFFSET_UNITS;
                }
                return mat;
            }
        });
    } else {
        // Use GUI colors
        const inkMat = new THREE.MeshStandardMaterial({
            color: config.DEFAULT_MESH_COLOR,
            roughness: 0.4,
            metalness: 0.05,
            side: THREE.DoubleSide
        });
        
        const plateMat = new THREE.MeshStandardMaterial({
            color: config.DEFAULT_NODE_FILL_COLOR,
            roughness: 0.95,
            metalness: 0.0,
            side: THREE.DoubleSide,
            transparent: state.currentNodeFillOpacity < 1,
            opacity: state.currentNodeFillOpacity,
            depthWrite: config.DEFAULT_FORCE_DEPTH_WRITE ? true : (state.currentNodeFillOpacity >= 1),
            alphaTest: state.currentNodeFillOpacity < 1 ? config.DEFAULT_ALPHA_TEST : 0,
            emissive: new THREE.Color(config.DEFAULT_NODE_FILL_COLOR),
            emissiveIntensity: config.DEFAULT_PLATE_EMISSIVE_INTENSITY,
            toneMapped: !config.DEFAULT_PLATE_TONEMAP_DISABLED
        });
        
        // Apply polygon offset to plate material if enabled
        if (config.DEFAULT_POLYGON_OFFSET_ENABLED) {
            plateMat.polygonOffset = true;
            plateMat.polygonOffsetFactor = config.DEFAULT_POLYGON_OFFSET_FACTOR;
            plateMat.polygonOffsetUnits = config.DEFAULT_POLYGON_OFFSET_UNITS;
        }
        
        materials = [inkMat, plateMat];
    }
    
    // Build two meshes: one for ink (opaque) and one for plates (may be transparent)
    // This prevents blending instability by letting Three.js sort two separate draw calls.
    if (config.USE_SVG_COLORS && geom.userData.colorMaterials) {
        // Split geometry into two meshes by material groups WITHOUT cloning
        const inkIndices = new Set(geom.userData.colorMaterials.filter(m => m.type === 'ink').map(m => m.index));
        const plateIndices = new Set(geom.userData.colorMaterials.filter(m => m.type !== 'ink').map(m => m.index));

        const inkGroups = [];
        const plateGroups = [];
        const originalGroups = geom.groups || [];
        for (const g of originalGroups) {
            if (inkIndices.has(g.materialIndex)) inkGroups.push({...g});
            if (plateIndices.has(g.materialIndex)) plateGroups.push({...g});
        }

        const group = new THREE.Group();

        if (inkGroups.length > 0) {
            // Create new geometry that SHARES the same attribute buffers
            const inkGeom = new THREE.BufferGeometry();
            // Share all attributes from original geometry (no copying!)
            for (const key in geom.attributes) {
                inkGeom.setAttribute(key, geom.attributes[key]);
            }
            if (geom.index) inkGeom.setIndex(geom.index);
            // Set only the ink groups
            inkGroups.forEach(g => inkGeom.addGroup(g.start, g.count, g.materialIndex));
            
            const inkMesh = new THREE.Mesh(inkGeom, materials);
            inkMesh.castShadow = true;
            inkMesh.renderOrder = 0;
            group.add(inkMesh);
        }
        if (plateGroups.length > 0) {
            // Create new geometry that SHARES the same attribute buffers
            const plateGeom = new THREE.BufferGeometry();
            // Share all attributes from original geometry (no copying!)
            for (const key in geom.attributes) {
                plateGeom.setAttribute(key, geom.attributes[key]);
            }
            if (geom.index) plateGeom.setIndex(geom.index);
            // Set only the plate groups
            plateGroups.forEach(g => plateGeom.addGroup(g.start, g.count, g.materialIndex));
            
            const plateMesh = new THREE.Mesh(plateGeom, materials);
            plateMesh.castShadow = !!config.DEFAULT_PLATE_CASTS_SHADOWS && (state.currentNodeFillOpacity > config.DEFAULT_PLATE_SHADOW_OPACITY_THRESHOLD);
            plateMesh.userData.isPlateMesh = true;
            plateMesh.renderOrder = 1;
            group.add(plateMesh);
        }
        return group;
    } else {
        // GUI colors use two materials [ink, plate]; split by materialIndex 0 and 1
        const hasPlate = Array.isArray(materials) && materials.length > 1;
        if (!hasPlate) {
            const mesh = new THREE.Mesh(geom, materials);
            mesh.castShadow = true;
            return mesh;
        }
        
        // Create geometries that SHARE buffers instead of cloning
        const group = new THREE.Group();
        const originalGroups = geom.groups || [];
        
        // Check if we have ink groups (material index 0)
        const inkGroups = originalGroups.filter(g => g.materialIndex === 0);
        if (inkGroups.length > 0) {
            const inkGeom = new THREE.BufferGeometry();
            // Share all attributes from original geometry (no copying!)
            for (const key in geom.attributes) {
                inkGeom.setAttribute(key, geom.attributes[key]);
            }
            if (geom.index) inkGeom.setIndex(geom.index);
            // Set only the ink groups
            inkGroups.forEach(g => inkGeom.addGroup(g.start, g.count, 0));
            
            const inkMesh = new THREE.Mesh(inkGeom, materials);
            inkMesh.castShadow = true;
            inkMesh.renderOrder = 0;
            group.add(inkMesh);
        }
        
        // Check if we have plate groups (material index 1)
        const plateGroups = originalGroups.filter(g => g.materialIndex === 1);
        if (plateGroups.length > 0) {
            const plateGeom = new THREE.BufferGeometry();
            // Share all attributes from original geometry (no copying!)
            for (const key in geom.attributes) {
                plateGeom.setAttribute(key, geom.attributes[key]);
            }
            if (geom.index) plateGeom.setIndex(geom.index);
            // Set only the plate groups
            plateGroups.forEach(g => plateGeom.addGroup(g.start, g.count, 1));
            
            const plateMesh = new THREE.Mesh(plateGeom, materials);
            plateMesh.castShadow = !!config.DEFAULT_PLATE_CASTS_SHADOWS && (state.currentNodeFillOpacity > config.DEFAULT_PLATE_SHADOW_OPACITY_THRESHOLD);
            plateMesh.userData.isPlateMesh = true;
            plateMesh.renderOrder = 1;
            group.add(plateMesh);
        }
        
        return group;
    }
}

/**
 * Update colors for mesh recursively
 * @param {THREE.Object3D} obj - Object to update
 * @param {Object} state - Current application state
 */
export function updateColorsDeep(obj, state) {
    if (!obj) return;
    
    if (obj.isMesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        
        if (config.USE_SVG_COLORS && obj.geometry?.userData?.colorMaterials) {
            // Update GUI-controlled plates only
            const colorMats = obj.geometry.userData.colorMaterials;
            mats.forEach((mat, idx) => {
                if (idx < colorMats.length && colorMats[idx].type === 'gui-plate') {
                    mat.color.set(state.nodeFillColor);
                    mat.emissive.set(state.nodeFillColor);
                }
            });
        } else if (!config.USE_SVG_COLORS) {
            // Update all materials when not using SVG colors
            mats.forEach((mat, idx) => {
                if (idx === 0) {
                    // Ink material
                    mat.color.set(state.meshColor);
                } else if (idx === 1) {
                    // Plate material
                    mat.color.set(state.nodeFillColor);
                    mat.emissive.set(state.nodeFillColor);
                }
            });
        }
    }
    
    if (obj.children) {
        obj.children.forEach(child => updateColorsDeep(child, state));
    }
}

/**
 * Update plate shadows based on opacity
 * @param {THREE.Object3D} obj - Object to update
 * @param {number} opacity - Current opacity value
 */
export function updatePlateShadows(obj, opacity) {
    if (!obj) return;
    
    if (obj.isMesh && obj.userData.isPlateMesh) {
        obj.castShadow = !!config.DEFAULT_PLATE_CASTS_SHADOWS && (opacity > config.DEFAULT_PLATE_SHADOW_OPACITY_THRESHOLD);
    }
    
    if (obj.children) {
        obj.children.forEach(child => updatePlateShadows(child, opacity));
    }
}