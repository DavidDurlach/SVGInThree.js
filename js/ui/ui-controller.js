// UI Controller Module - Simplified version
// Last edit date: 2025-09-11

import * as THREE from 'three';
import * as config from '../config.js';
import { updateColorsDeep, updatePlateShadows } from '../rendering/mesh-creator.js';

export class UIController {
    constructor(app) {
        this.app = app;
        this.elements = {};
        this.state = {
            camX: config.DEFAULT_CAMERA_X,
            camY: config.DEFAULT_CAMERA_Y,
            camZ: config.DEFAULT_CAMERA_Z,
            yawSpeedDeg: config.DEFAULT_YAW_SPEED_DEG,
            pitchSpeedDeg: config.DEFAULT_PITCH_SPEED_DEG,
            lightIntensity: config.DEFAULT_LIGHT_INTENSITY,
            lightX: config.DEFAULT_LIGHT_X,
            lightY: config.DEFAULT_LIGHT_Y,
            lightZ: config.DEFAULT_LIGHT_Z,
            fillNodes: config.DEFAULT_FILL_NODES,
            smartFill: config.DEFAULT_SMART_FILL,
            nodeFillColor: config.DEFAULT_NODE_FILL_COLOR,
            nodeFillOpacity: config.DEFAULT_NODE_FILL_OPACITY,
            meshColor: config.DEFAULT_MESH_COLOR,
            shadowType: config.DEFAULT_SHADOW_TYPE,
            shadowRadius: config.DEFAULT_SHADOW_RADIUS,
            shadowBlurSamples: config.DEFAULT_SHADOW_BLUR_SAMPLES,
            shadowOpacity: config.DEFAULT_SHADOW_OPACITY,
            shadowColor: config.DEFAULT_SHADOW_COLOR,
            wallColor: config.DEFAULT_WALL_COLOR,
            wallFlat: config.DEFAULT_WALL_FLAT,
            backgroundColor: config.DEFAULT_BACKGROUND_COLOR
        };
    }

    init() {
        this.initElements();
        this.attachEventListeners();
        this.updateUI();
        this.updateColorModeUI();
    }
    
    updateColorModeUI() {
        const indicator = document.getElementById('color-mode-indicator');
        const colorDisabledSpans = document.querySelectorAll('.color-control-disabled');
        
        if (config.USE_SVG_COLORS) {
            if (indicator) indicator.style.display = 'block';
            colorDisabledSpans.forEach(span => span.style.display = 'inline');
            if (this.elements.meshColor) this.elements.meshColor.disabled = true;
        } else {
            if (indicator) indicator.style.display = 'none';
            colorDisabledSpans.forEach(span => span.style.display = 'none');
            if (this.elements.meshColor) this.elements.meshColor.disabled = false;
            if (this.elements.nodeFillColor) this.elements.nodeFillColor.disabled = false;
        }
    }

    initElements() {
        // Camera controls
        this.elements.camX = document.getElementById('cam-x');
        this.elements.camY = document.getElementById('cam-y');
        this.elements.camZ = document.getElementById('cam-z');
        
        // Configure camera distance slider
        if (this.elements.camZ) {
            if (config.DEFAULT_ZOOM_SLIDER_LOG) {
                this.elements.camZ.min = '0';
                this.elements.camZ.max = '1';
                this.elements.camZ.step = String(config.DEFAULT_ZOOM_SLIDER_STEP);
            } else {
                this.elements.camZ.min = String(config.DEFAULT_CONTROLS_MIN_DISTANCE);
                this.elements.camZ.max = String(config.DEFAULT_CONTROLS_MAX_DISTANCE);
            }
        }
        
        // Value displays
        this.elements.camXValue = document.getElementById('cam-x-value');
        this.elements.camYValue = document.getElementById('cam-y-value');
        this.elements.camZValue = document.getElementById('cam-z-value');
        
        // Auto-spin controls
        this.elements.yawSpeed = document.getElementById('yaw-speed');
        this.elements.pitchSpeed = document.getElementById('pitch-speed');
        this.elements.yawSpeedValue = document.getElementById('yaw-speed-value');
        this.elements.pitchSpeedValue = document.getElementById('pitch-speed-value');
        
        // Light controls
        this.elements.lightIntensity = document.getElementById('light-intensity');
        this.elements.lightX = document.getElementById('light-x');
        this.elements.lightY = document.getElementById('light-y');
        this.elements.lightZ = document.getElementById('light-z');
        this.elements.lightIntensityValue = document.getElementById('light-intensity-value');
        this.elements.lightXValue = document.getElementById('light-x-value');
        this.elements.lightYValue = document.getElementById('light-y-value');
        this.elements.lightZValue = document.getElementById('light-z-value');
        
        // Node fill controls
        this.elements.fillNodes = document.getElementById('fill-nodes');
        this.elements.smartFill = document.getElementById('smart-fill');
        this.elements.nodeFillColor = document.getElementById('node-fill-color');
        this.elements.nodeOpacity = document.getElementById('node-opacity');
        this.elements.nodeOpacityValue = document.getElementById('node-opacity-value');
        
        // Mesh & shadows controls
        this.elements.meshColor = document.getElementById('mesh-color');
        this.elements.shadowType = document.getElementById('shadow-type');
        this.elements.shadowRadius = document.getElementById('shadow-radius');
        this.elements.shadowBlur = document.getElementById('shadow-blur');
        this.elements.shadowOpacity = document.getElementById('shadow-opacity');
        this.elements.shadowColor = document.getElementById('shadow-color');
        this.elements.shadowRadiusValue = document.getElementById('shadow-radius-value');
        this.elements.shadowBlurValue = document.getElementById('shadow-blur-value');
        this.elements.shadowOpacityValue = document.getElementById('shadow-opacity-value');
        this.elements.vsmControls = document.getElementById('vsm-controls');
        
        // Wall & scene controls
        this.elements.wallColor = document.getElementById('wall-color');
        this.elements.wallFlat = document.getElementById('wall-flat');
        this.elements.backgroundColor = document.getElementById('background-color');
        
        // Running state displays
        this.elements.runYaw = document.getElementById('run-yaw');
        this.elements.runPitch = document.getElementById('run-pitch');
        this.elements.runPanX = document.getElementById('run-panx');
        this.elements.runPanY = document.getElementById('run-pany');
        this.elements.runZoom = document.getElementById('run-zoom');
        
        // Set slider ranges
        this.setSliderRanges();
    }
    
    setSliderRanges() {
        const setRange = (id, min, max) => {
            const el = document.getElementById(id);
            if (el) {
                el.min = String(min);
                el.max = String(max);
            }
        };
        
        setRange('yaw-speed', config.DEFAULT_YAW_SPEED_DEG_MIN, config.DEFAULT_YAW_SPEED_DEG_MAX);
        setRange('pitch-speed', config.DEFAULT_PITCH_SPEED_DEG_MIN, config.DEFAULT_PITCH_SPEED_DEG_MAX);
        setRange('light-intensity', config.DEFAULT_LIGHT_INTENSITY_MIN, config.DEFAULT_LIGHT_INTENSITY_MAX);
        setRange('light-x', config.DEFAULT_LIGHT_X_MIN, config.DEFAULT_LIGHT_X_MAX);
        setRange('light-y', config.DEFAULT_LIGHT_Y_MIN, config.DEFAULT_LIGHT_Y_MAX);
        setRange('light-z', config.DEFAULT_LIGHT_Z_MIN, config.DEFAULT_LIGHT_Z_MAX);
        setRange('node-opacity', config.DEFAULT_NODE_FILL_OPACITY_MIN, config.DEFAULT_NODE_FILL_OPACITY_MAX);
        setRange('shadow-radius', config.DEFAULT_SHADOW_RADIUS_MIN, config.DEFAULT_SHADOW_RADIUS_MAX);
        setRange('shadow-blur', config.DEFAULT_SHADOW_BLUR_SAMPLES_MIN, config.DEFAULT_SHADOW_BLUR_SAMPLES_MAX);
        setRange('shadow-opacity', config.DEFAULT_SHADOW_OPACITY_MIN, config.DEFAULT_SHADOW_OPACITY_MAX);
        setRange('pan-x-speed', config.DEFAULT_PAN_SPEED_X_MIN, config.DEFAULT_PAN_SPEED_X_MAX);
        setRange('pan-y-speed', config.DEFAULT_PAN_SPEED_Y_MIN, config.DEFAULT_PAN_SPEED_Y_MAX);
        setRange('zoom-speed', config.DEFAULT_ZOOM_SPEED_MIN, config.DEFAULT_ZOOM_SPEED_MAX);
    }

    attachEventListeners() {
        // Stop button
        const stopButton = document.getElementById('stop-button');
        stopButton?.addEventListener('click', () => {
            this.app.spin.enabled = !this.app.spin.enabled;
            stopButton.setAttribute('aria-pressed', !this.app.spin.enabled);
            if (this.app.spin.enabled) {
                stopButton.textContent = 'stop';
                stopButton.title = 'freeze animation';
            } else {
                stopButton.textContent = 'start';
                stopButton.title = 'enable animation';
            }
        });

        // Camera controls
        this.elements.camX?.addEventListener('input', (e) => {
            this.state.camX = parseFloat(e.target.value);
            this.elements.camXValue.textContent = this.state.camX.toFixed(2);
            this.app.camera.position.x = this.state.camX;
            this.app.camera.lookAt(this.app.controls.target);
        });

        this.elements.camY?.addEventListener('input', (e) => {
            this.state.camY = parseFloat(e.target.value);
            this.elements.camYValue.textContent = this.state.camY.toFixed(2);
            this.app.camera.position.y = this.state.camY;
            this.app.camera.lookAt(this.app.controls.target);
        });

        this.elements.camZ?.addEventListener('input', (e) => {
            let val = parseFloat(e.target.value);
            let distance;
            if (config.DEFAULT_ZOOM_SLIDER_LOG) {
                const minD = config.DEFAULT_CONTROLS_MIN_DISTANCE;
                const maxD = config.DEFAULT_CONTROLS_MAX_DISTANCE;
                const logMin = Math.log(minD);
                const logMax = Math.log(maxD);
                const logVal = logMin + val * (logMax - logMin);
                distance = Math.exp(logVal);
            } else {
                distance = val;
            }
            this.state.camZ = distance;
            this.elements.camZValue.textContent = this.state.camZ.toFixed(2);
            const dir = new THREE.Vector3();
            dir.copy(this.app.camera.position).sub(this.app.controls.target).normalize();
            this.app.camera.position.copy(this.app.controls.target).addScaledVector(dir, distance);
            this.app.camera.lookAt(this.app.controls.target);
        });

        // Sync camera button
        document.getElementById('sync-camera')?.addEventListener('click', () => {
            this.state.camX = this.app.camera.position.x;
            this.state.camY = this.app.camera.position.y;
            this.state.camZ = this.app.camera.position.z;
            this.updateCameraUI();
        });

        // Apply camera button
        document.getElementById('apply-camera')?.addEventListener('click', () => {
            this.app.camera.position.set(this.state.camX, this.state.camY, this.state.camZ);
            this.app.camera.lookAt(this.app.controls.target);
        });

        // Reset view buttons
        document.getElementById('reset-view')?.addEventListener('click', () => {
            this.resetView();
        });
        document.getElementById('reset-view-2')?.addEventListener('click', () => {
            this.resetView();
        });

        // Auto-spin controls
        this.elements.yawSpeed?.addEventListener('input', (e) => {
            this.state.yawSpeedDeg = parseFloat(e.target.value);
            this.elements.yawSpeedValue.textContent = this.state.yawSpeedDeg;
            this.app.spin.yawSpeed = THREE.MathUtils.degToRad(this.state.yawSpeedDeg);

            const reversing = this.app.spin.yawState === 'eYaw_ReverseDirection';
            const defer = !!config.DEFER_YAW_UI_WHILE_REVERSING && reversing;

            if (defer) {
                // Defer until reversal completes if policy enabled
                this.app.spin._pendingYawSpeed = this.app.spin.yawSpeed;
                if (config.DEFAULT_DIAGNOSTICS_ENABLED) {
                    console.log(`[DIAG] YAW SPEED UI change cued until reversal complete: ${this.state.yawSpeedDeg} deg/s (${this.app.spin.yawSpeed.toFixed(4)} rad/s), state=${this.app.spin.yawState}`);
                }
            } else {
                // Apply immediately in all other states (including reversing when policy disabled)
                this.app.spin._pendingYawSpeed = undefined;
                if (config.DEFAULT_DIAGNOSTICS_ENABLED) {
                    console.log(`[DIAG] YAW SPEED UI change applied immediately: ${this.state.yawSpeedDeg} deg/s (${this.app.spin.yawSpeed.toFixed(4)} rad/s), state=${this.app.spin.yawState}`);
                }
            }
        });

        this.elements.pitchSpeed?.addEventListener('input', (e) => {
            this.state.pitchSpeedDeg = parseFloat(e.target.value);
            this.elements.pitchSpeedValue.textContent = this.state.pitchSpeedDeg;
            this.app.spin.pitchSpeed = THREE.MathUtils.degToRad(this.state.pitchSpeedDeg);
            // If not in steady state, cue the change to apply upon reaching steady
            if (this.app.spin.pitchState !== 'ePitch_SteadyStateVel') {
                this.app.spin._pendingPitchSpeed = this.app.spin.pitchSpeed;
                if (config.DEFAULT_DIAGNOSTICS_ENABLED) {
                    console.log(`[DIAG] PITCH SPEED UI change cued until steady: ${this.state.pitchSpeedDeg} deg/s (${this.app.spin.pitchSpeed.toFixed(4)} rad/s), state=${this.app.spin.pitchState}`);
                }
            } else {
                this.app.spin._pendingPitchSpeed = undefined;
                if (config.DEFAULT_DIAGNOSTICS_ENABLED) {
                    console.log(`[DIAG] PITCH SPEED UI change applied immediately in steady: ${this.state.pitchSpeedDeg} deg/s (${this.app.spin.pitchSpeed.toFixed(4)} rad/s)`);
                }
            }
        });

        // Light controls
        this.elements.lightIntensity?.addEventListener('input', (e) => {
            this.state.lightIntensity = parseFloat(e.target.value);
            this.elements.lightIntensityValue.textContent = this.state.lightIntensity.toFixed(2);
            this.app.directionalLight.intensity = this.state.lightIntensity;
        });

        this.elements.lightX?.addEventListener('input', (e) => {
            this.state.lightX = parseFloat(e.target.value);
            this.elements.lightXValue.textContent = this.state.lightX.toFixed(1);
            this.updateLightPosition();
        });

        this.elements.lightY?.addEventListener('input', (e) => {
            this.state.lightY = parseFloat(e.target.value);
            this.elements.lightYValue.textContent = this.state.lightY.toFixed(1);
            this.updateLightPosition();
        });

        this.elements.lightZ?.addEventListener('input', (e) => {
            this.state.lightZ = parseFloat(e.target.value);
            this.elements.lightZValue.textContent = this.state.lightZ.toFixed(1);
            this.updateLightPosition();
        });

        // Node fill controls
        this.elements.fillNodes?.addEventListener('change', (e) => {
            this.state.fillNodes = e.target.checked;
            this.app.state.fillNodes = this.state.fillNodes;
            this.app.rebuild(this.app.loadedFont);
        });

        this.elements.smartFill?.addEventListener('change', (e) => {
            this.state.smartFill = e.target.checked;
            this.app.state.smartFill = this.state.smartFill;
            this.app.rebuild(this.app.loadedFont);
        });

        this.elements.nodeFillColor?.addEventListener('input', (e) => {
            this.state.nodeFillColor = e.target.value;
            this.app.state.nodeFillColor = this.state.nodeFillColor;
            updateColorsDeep(this.app.svgMesh, this.app.state);
        });

        this.elements.nodeOpacity?.addEventListener('input', (e) => {
            this.state.nodeFillOpacity = parseFloat(e.target.value);
            this.elements.nodeOpacityValue.textContent = this.state.nodeFillOpacity.toFixed(2);
            this.app.state.currentNodeFillOpacity = this.state.nodeFillOpacity;
            this.app.rebuild(this.app.loadedFont);
        });

        // Mesh color
        this.elements.meshColor?.addEventListener('input', (e) => {
            this.state.meshColor = e.target.value;
            this.app.state.meshColor = this.state.meshColor;
            updateColorsDeep(this.app.svgMesh, this.app.state);
        });

        // Shadow controls
        this.elements.shadowType?.addEventListener('change', (e) => {
            this.state.shadowType = e.target.value;
            this.updateShadowTypeUI();
            this.app.renderer.shadowMap.type = this.state.shadowType === 'VSM' ? 
                THREE.VSMShadowMap : THREE.PCFSoftShadowMap;
            this.app.renderer.shadowMap.needsUpdate = true;
        });

        this.elements.shadowRadius?.addEventListener('input', (e) => {
            this.state.shadowRadius = parseFloat(e.target.value);
            this.elements.shadowRadiusValue.textContent = this.state.shadowRadius.toFixed(1);
            this.app.directionalLight.shadow.radius = this.state.shadowRadius;
        });

        this.elements.shadowBlur?.addEventListener('input', (e) => {
            this.state.shadowBlurSamples = parseInt(e.target.value);
            this.elements.shadowBlurValue.textContent = this.state.shadowBlurSamples;
            this.app.directionalLight.shadow.blurSamples = this.state.shadowBlurSamples;
        });

        this.elements.shadowOpacity?.addEventListener('input', (e) => {
            this.state.shadowOpacity = parseFloat(e.target.value);
            this.elements.shadowOpacityValue.textContent = this.state.shadowOpacity.toFixed(2);
            this.app.shadowPlane.material.opacity = this.state.shadowOpacity;
            this.app.shadowPlane.visible = this.state.shadowOpacity > 0;
        });

        this.elements.shadowColor?.addEventListener('input', (e) => {
            this.state.shadowColor = e.target.value;
            this.app.shadowPlane.material.color = new THREE.Color(this.state.shadowColor);
        });

        // Wall controls
        this.elements.wallColor?.addEventListener('input', (e) => {
            this.state.wallColor = e.target.value;
            this.app.wallMesh.material.color = new THREE.Color(this.state.wallColor);
        });

        this.elements.wallFlat?.addEventListener('change', (e) => {
            this.state.wallFlat = e.target.checked;
            const newMat = this.state.wallFlat ?
                new THREE.MeshBasicMaterial({ 
                    color: this.state.wallColor, 
                    toneMapped: !config.DEFAULT_WALL_FLAT_TONEMAP_DISABLED 
                }) :
                new THREE.MeshStandardMaterial({ 
                    color: this.state.wallColor, 
                    roughness: 0.85, 
                    metalness: 0 
                });
            this.app.wallMesh.material.dispose();
            this.app.wallMesh.material = newMat;
        });

        this.elements.backgroundColor?.addEventListener('input', (e) => {
            this.state.backgroundColor = e.target.value;
            this.app.scene.background = new THREE.Color(this.state.backgroundColor);
        });

        // Add more event listeners for pan/zoom speeds
        this.attachPanZoomListeners();
    }

    attachPanZoomListeners() {
        const panXEl = document.getElementById('pan-x-speed');
        const panYEl = document.getElementById('pan-y-speed');
        const zoomEl = document.getElementById('zoom-speed');
        const panXVal = document.getElementById('pan-x-speed-value');
        const panYVal = document.getElementById('pan-y-speed-value');
        const zoomVal = document.getElementById('zoom-speed-value');
        
        panXEl?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            panXVal.textContent = v;
            this.app.spin.panSpeedX = v;
        });
        
        panYEl?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            panYVal.textContent = v;
            this.app.spin.panSpeedY = v;
        });
        
        zoomEl?.addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            zoomVal.textContent = v;
            this.app.spin.zoomSpeed = v;
        });
    }

    updateUI() {
        this.updateCameraUI();
        this.updateAllUIValues();
    }

    updateCameraUI() {
        if (this.elements.camX) {
            this.elements.camX.value = this.state.camX;
            this.elements.camXValue.textContent = this.state.camX.toFixed(2);
        }
        if (this.elements.camY) {
            this.elements.camY.value = this.state.camY;
            this.elements.camYValue.textContent = this.state.camY.toFixed(2);
        }
        if (this.elements.camZ) {
            if (config.DEFAULT_ZOOM_SLIDER_LOG) {
                const minD = config.DEFAULT_CONTROLS_MIN_DISTANCE;
                const maxD = config.DEFAULT_CONTROLS_MAX_DISTANCE;
                const logMin = Math.log(minD);
                const logMax = Math.log(maxD);
                const logCur = Math.log(Math.max(minD, Math.min(maxD, this.state.camZ)));
                const normalized = (logCur - logMin) / (logMax - logMin);
                this.elements.camZ.value = normalized;
            } else {
                this.elements.camZ.value = this.state.camZ;
            }
            this.elements.camZValue.textContent = this.state.camZ.toFixed(2);
        }
    }

    updateLightPosition() {
        this.app.directionalLight.position.set(this.state.lightX, this.state.lightY, this.state.lightZ);
    }

    updateShadowTypeUI() {
        if (this.elements.vsmControls) {
            this.elements.vsmControls.style.display = 
                this.state.shadowType === 'VSM' ? 'block' : 'none';
        }
    }

    updateAllUIValues() {
        // Update all UI elements with current state
        // Camera controls
        if (this.elements.camX) {
            this.elements.camX.value = this.state.camX;
            this.elements.camXValue.textContent = this.state.camX.toFixed(2);
        }
        if (this.elements.camY) {
            this.elements.camY.value = this.state.camY;
            this.elements.camYValue.textContent = this.state.camY.toFixed(2);
        }
        // Handle cam-z with logarithmic scaling if enabled
        if (this.elements.camZ) {
            if (config.DEFAULT_ZOOM_SLIDER_LOG) {
                const minD = config.DEFAULT_CONTROLS_MIN_DISTANCE;
                const maxD = config.DEFAULT_CONTROLS_MAX_DISTANCE;
                const logMin = Math.log(minD);
                const logMax = Math.log(maxD);
                const logCur = Math.log(Math.max(minD, Math.min(maxD, this.state.camZ)));
                const normalized = (logCur - logMin) / (logMax - logMin);
                this.elements.camZ.value = normalized;
            } else {
                this.elements.camZ.value = this.state.camZ;
            }
            this.elements.camZValue.textContent = this.state.camZ.toFixed(2);
        }
        
        // Animation speeds
        if (this.elements.yawSpeed) {
            this.elements.yawSpeed.value = this.state.yawSpeedDeg;
            this.elements.yawSpeedValue.textContent = this.state.yawSpeedDeg;
        }
        if (this.elements.pitchSpeed) {
            this.elements.pitchSpeed.value = this.state.pitchSpeedDeg;
            this.elements.pitchSpeedValue.textContent = this.state.pitchSpeedDeg;
        }
        // Update pan/zoom speeds
        const panXEl = document.getElementById('pan-x-speed');
        const panYEl = document.getElementById('pan-y-speed');
        const zoomEl = document.getElementById('zoom-speed');
        const panXVal = document.getElementById('pan-x-speed-value');
        const panYVal = document.getElementById('pan-y-speed-value');
        const zoomVal = document.getElementById('zoom-speed-value');
        if (panXEl) {
            panXEl.value = config.DEFAULT_PAN_SPEED_X;
            panXVal.textContent = config.DEFAULT_PAN_SPEED_X;
        }
        if (panYEl) {
            panYEl.value = config.DEFAULT_PAN_SPEED_Y;
            panYVal.textContent = config.DEFAULT_PAN_SPEED_Y;
        }
        if (zoomEl) {
            zoomEl.value = config.DEFAULT_ZOOM_SPEED;
            zoomVal.textContent = config.DEFAULT_ZOOM_SPEED;
        }
        if (this.elements.lightIntensity) {
            this.elements.lightIntensity.value = this.state.lightIntensity;
            this.elements.lightIntensityValue.textContent = this.state.lightIntensity.toFixed(2);
        }
        if (this.elements.lightX) {
            this.elements.lightX.value = this.state.lightX;
            this.elements.lightXValue.textContent = this.state.lightX.toFixed(1);
        }
        if (this.elements.lightY) {
            this.elements.lightY.value = this.state.lightY;
            this.elements.lightYValue.textContent = this.state.lightY.toFixed(1);
        }
        if (this.elements.lightZ) {
            this.elements.lightZ.value = this.state.lightZ;
            this.elements.lightZValue.textContent = this.state.lightZ.toFixed(1);
        }
        if (this.elements.fillNodes) {
            this.elements.fillNodes.checked = this.state.fillNodes;
        }
        if (this.elements.smartFill) {
            this.elements.smartFill.checked = this.state.smartFill;
        }
        if (this.elements.nodeFillColor) {
            this.elements.nodeFillColor.value = this.state.nodeFillColor;
        }
        if (this.elements.nodeOpacity) {
            this.elements.nodeOpacity.value = this.state.nodeFillOpacity;
            this.elements.nodeOpacityValue.textContent = this.state.nodeFillOpacity.toFixed(2);
        }
        if (this.elements.meshColor) {
            this.elements.meshColor.value = this.state.meshColor;
        }
        if (this.elements.shadowType) {
            this.elements.shadowType.value = this.state.shadowType;
            this.updateShadowTypeUI();
        }
        if (this.elements.shadowRadius) {
            this.elements.shadowRadius.value = this.state.shadowRadius;
            this.elements.shadowRadiusValue.textContent = this.state.shadowRadius.toFixed(1);
        }
        if (this.elements.shadowBlur) {
            this.elements.shadowBlur.value = this.state.shadowBlurSamples;
            this.elements.shadowBlurValue.textContent = this.state.shadowBlurSamples;
        }
        if (this.elements.shadowOpacity) {
            this.elements.shadowOpacity.value = this.state.shadowOpacity;
            this.elements.shadowOpacityValue.textContent = this.state.shadowOpacity.toFixed(2);
        }
        if (this.elements.shadowColor) {
            this.elements.shadowColor.value = this.state.shadowColor;
        }
        if (this.elements.wallColor) {
            this.elements.wallColor.value = this.state.wallColor;
        }
        if (this.elements.wallFlat) {
            this.elements.wallFlat.checked = this.state.wallFlat;
        }
        if (this.elements.backgroundColor) {
            this.elements.backgroundColor.value = this.state.backgroundColor;
        }
    }

    resetView() {
        this.app.camera.position.set(
            config.DEFAULT_CAMERA_X, 
            config.DEFAULT_CAMERA_Y, 
            config.DEFAULT_CAMERA_Z
        );
        this.app.controls.target.set(0, 0, 0);
        this.app.controls.update();
        this.state.camX = config.DEFAULT_CAMERA_X;
        this.state.camY = config.DEFAULT_CAMERA_Y;
        this.state.camZ = config.DEFAULT_CAMERA_Z;
        this.updateCameraUI();
    }
    
    updateRunningStateDisplay() {
        // Calculate current angles and positions relative to base
        const tmpOffset = new THREE.Vector3();
        const tmpSpherical = new THREE.Spherical();
        tmpOffset.copy(this.app.camera.position).sub(this.app.controls.target);
        tmpSpherical.setFromVector3(tmpOffset);
        
        // Calculate yaw angle difference in degrees
        let theta = tmpSpherical.theta;
        while (theta > Math.PI) theta -= 2 * Math.PI;
        while (theta < -Math.PI) theta += 2 * Math.PI;
        const yawDelta = theta - this.app.spin.baseAz;
        const yawDeg = THREE.MathUtils.radToDeg(yawDelta);
        
        // Calculate pitch angle difference in degrees
        const pitchDelta = tmpSpherical.phi - this.app.spin.basePol;
        const pitchDeg = THREE.MathUtils.radToDeg(pitchDelta);
        
        // Calculate pan offsets
        const panX = this.app.controls.target.x - this.app.spin.baseTarget.x;
        const panY = this.app.controls.target.y - this.app.spin.baseTarget.y;
        
        // Calculate zoom distance
        const distance = tmpOffset.length();
        
        // Update display values
        if (this.elements.runYaw) {
            this.elements.runYaw.textContent = yawDeg.toFixed(1);
        }
        if (this.elements.runPitch) {
            this.elements.runPitch.textContent = pitchDeg.toFixed(1);
        }
        if (this.elements.runPanX) {
            this.elements.runPanX.textContent = panX.toFixed(2);
        }
        if (this.elements.runPanY) {
            this.elements.runPanY.textContent = panY.toFixed(2);
        }
        if (this.elements.runZoom) {
            this.elements.runZoom.textContent = distance.toFixed(2);
        }
    }
}
