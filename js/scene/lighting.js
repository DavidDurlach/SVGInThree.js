// Lighting Module
// Last edit date: 2025-09-11

import * as THREE from 'three';
import * as config from '../config.js';

/**
 * Setup scene lighting
 * @param {THREE.Scene} scene - Scene to add lights to
 * @returns {Object} Lighting components { ambientLight, directionalLight }
 */
export function setupLights(scene) {
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, config.DEFAULT_AMBIENT_INTENSITY);
    scene.add(ambientLight);
    
    // Directional light for shadows and main lighting
    const directionalLight = new THREE.DirectionalLight(0xffffff, config.DEFAULT_LIGHT_INTENSITY);
    directionalLight.position.set(config.DEFAULT_LIGHT_X, config.DEFAULT_LIGHT_Y, config.DEFAULT_LIGHT_Z);
    directionalLight.castShadow = true;
    
    // Shadow map configuration
    directionalLight.shadow.mapSize.set(2048, 2048);
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 500;
    
    // Improve shadow stability with partial transparency
    directionalLight.shadow.normalBias = config.DEFAULT_SHADOW_NORMAL_BIAS;
    directionalLight.shadow.bias = config.DEFAULT_SHADOW_BIAS;
    
    // Shadow camera bounds
    directionalLight.shadow.camera.left = -250;
    directionalLight.shadow.camera.right = 250;
    directionalLight.shadow.camera.top = 250;
    directionalLight.shadow.camera.bottom = -250;
    
    // VSM shadow settings
    directionalLight.shadow.radius = config.DEFAULT_SHADOW_RADIUS;
    directionalLight.shadow.blurSamples = config.DEFAULT_SHADOW_BLUR_SAMPLES;
    
    scene.add(directionalLight);
    
    return { ambientLight, directionalLight };
}

/**
 * Update directional light position
 * @param {THREE.DirectionalLight} light - Light to update
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} z - Z position
 */
export function updateLightPosition(light, x, y, z) {
    if (light) {
        light.position.set(x, y, z);
    }
}

/**
 * Update light intensity
 * @param {THREE.Light} light - Light to update
 * @param {number} intensity - New intensity value
 */
export function updateLightIntensity(light, intensity) {
    if (light) {
        light.intensity = intensity;
    }
}

/**
 * Update shadow settings
 * @param {THREE.DirectionalLight} light - Light with shadows
 * @param {Object} settings - Shadow settings
 */
export function updateShadowSettings(light, settings) {
    if (!light || !light.shadow) return;
    
    if (settings.radius !== undefined) {
        light.shadow.radius = settings.radius;
    }
    if (settings.blurSamples !== undefined) {
        light.shadow.blurSamples = settings.blurSamples;
    }
    if (settings.normalBias !== undefined) {
        light.shadow.normalBias = settings.normalBias;
    }
    if (settings.bias !== undefined) {
        light.shadow.bias = settings.bias;
    }
}

/**
 * Update shadow opacity on a shadow material
 * @param {THREE.Material} shadowMaterial - Shadow material to update
 * @param {number} opacity - New opacity value
 */
export function updateShadowOpacity(shadowMaterial, opacity) {
    if (shadowMaterial && shadowMaterial.isShadowMaterial) {
        shadowMaterial.opacity = opacity;
    }
}