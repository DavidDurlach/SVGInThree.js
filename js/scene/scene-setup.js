// Scene Setup Module
// Last edit date: 2025-09-11

import * as THREE from 'three';
import * as config from '../config.js';

/**
 * Setup the Three.js renderer
 * @param {HTMLElement} container - Container element for the canvas
 * @returns {THREE.WebGLRenderer} Configured renderer
 */
export function setupRenderer(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: config.DEFAULT_ANTIALIAS });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, config.DEFAULT_PIXEL_RATIO_MAX));
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 560);
    renderer.sortObjects = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = config.DEFAULT_SHADOW_TYPE === 'VSM' ? THREE.VSMShadowMap : THREE.PCFSoftShadowMap;
    
    // Configure tone mapping (affects dark surface rendering)
    const toneMappingMap = {
        'None': THREE.NoToneMapping,
        'Linear': THREE.LinearToneMapping,
        'Reinhard': THREE.ReinhardToneMapping,
        'Cineon': THREE.CineonToneMapping,
        'ACESFilmic': THREE.ACESFilmicToneMapping
    };
    renderer.toneMapping = toneMappingMap[config.DEFAULT_TONE_MAPPING] || THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = config.DEFAULT_TONE_MAPPING_EXPOSURE;
    
    // Configure output encoding
    renderer.outputEncoding = config.DEFAULT_OUTPUT_ENCODING === 'Linear' ? THREE.LinearEncoding : THREE.sRGBEncoding;
    
    container.appendChild(renderer.domElement);
    
    return renderer;
}

/**
 * Create and configure the scene
 * @returns {THREE.Scene} Configured scene
 */
export function createScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(config.DEFAULT_BACKGROUND_COLOR);
    return scene;
}

/**
 * Create and configure the camera
 * @param {HTMLElement} container - Container for aspect ratio calculation
 * @returns {THREE.PerspectiveCamera} Configured camera
 */
export function createCamera(container) {
    const camera = new THREE.PerspectiveCamera(
        45,
        (container.clientWidth || 800) / (container.clientHeight || 560),
        config.DEFAULT_CAMERA_NEAR,
        config.DEFAULT_CAMERA_FAR
    );
    camera.position.set(config.DEFAULT_CAMERA_X, config.DEFAULT_CAMERA_Y, config.DEFAULT_CAMERA_Z);
    return camera;
}

/**
 * Setup the wall/backdrop
 * @returns {Object} Wall components { wallGroup, shadowPlane, wallMesh }
 */
export function setupWall() {
    const wallGroup = new THREE.Group();
    const wallGeo = new THREE.PlaneGeometry(400, 400);
    
    const shadowMat = new THREE.ShadowMaterial({ 
        color: new THREE.Color(config.DEFAULT_SHADOW_COLOR), 
        opacity: config.DEFAULT_SHADOW_OPACITY
    });
    shadowMat.transparent = true;
    
    const shadowPlane = new THREE.Mesh(wallGeo, shadowMat);
    shadowPlane.position.z = config.DEFAULT_WALL_Z_OFFSET;
    shadowPlane.receiveShadow = true;
    
    const wallMaterial = config.DEFAULT_WALL_FLAT ?
        new THREE.MeshBasicMaterial({ 
            color: config.DEFAULT_WALL_COLOR, 
            toneMapped: !config.DEFAULT_WALL_FLAT_TONEMAP_DISABLED 
        }) :
        new THREE.MeshStandardMaterial({ 
            color: config.DEFAULT_WALL_COLOR, 
            roughness: 0.85, 
            metalness: 0 
        });
    
    const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
    wallMesh.position.z = config.DEFAULT_WALL_Z_OFFSET - config.DEFAULT_WALL_SEPARATION;
    
    wallGroup.add(shadowPlane);
    wallGroup.add(wallMesh);
    
    return { wallGroup, shadowPlane, wallMesh };
}

/**
 * Handle window resize
 * @param {THREE.PerspectiveCamera} camera - Camera to update
 * @param {THREE.WebGLRenderer} renderer - Renderer to update
 * @param {HTMLElement} container - Container element
 */
export function handleResize(camera, renderer, container) {
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    
    renderer.setSize(width, height);
}