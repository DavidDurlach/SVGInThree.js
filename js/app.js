// Main Application Class - Orchestrates all modules
// Last edit date: 2025-09-11

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';

import * as config from './config.js';
import { setupRenderer, createScene, createCamera, setupWall, handleResize } from './scene/scene-setup.js';
import { setupLights } from './scene/lighting.js';
import { buildMergedFromSVG, setDebugMode as setSVGDebugMode } from './svg/svg-processor.js';
import { createMesh } from './rendering/mesh-creator.js';
import { createAnimationState, stepSpin, resumeAnimationAfterInteraction, setDebugMode as setAnimDebugMode } from './animation/animation-engine.js';
import { UIController } from './ui/ui-controller.js';

// Runtime debug flag
let DEBUG_ANIM_ENABLED = config.DEFAULT_DEBUG_ANIM;

export class SVG3DApp {
    constructor() {
        this.container = document.getElementById('threejs-mount');
        this.renderer = null;
        this.scene = null;
        this.camera = null;
        this.controls = null;
        this.directionalLight = null;
        this.ambientLight = null;
        this.svgMesh = null;
        this.wallGroup = null;
        this.shadowPlane = null;
        this.wallMesh = null;
        this.loadedFont = null;
        this.svgData = null;
        this.ui = null;
        
        // Animation state
        this.spin = createAnimationState();
        
        // Application state
        this.state = {
            fillNodes: config.DEFAULT_FILL_NODES,
            smartFill: config.DEFAULT_SMART_FILL,
            currentNodeFillOpacity: config.DEFAULT_NODE_FILL_OPACITY,
            nodeFillColor: config.DEFAULT_NODE_FILL_COLOR,
            meshColor: config.DEFAULT_MESH_COLOR
        };
        
        // Performance tracking
        this.frameCount = 0;
        this.lastDiagTime = 0;
        
        this.init();
    }
    
    async init() {
        this.setupScene();
        this.setupLighting();
        this.setupWall();
        this.setupControls();
        this.setupUI();
        
        // Load default SVG
        await this.loadSVG(config.DEFAULT_SVG_URL);
        
        // Load font for text rendering
        this.loadFont();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            handleResize(this.camera, this.renderer, this.container);
        });
        
        // Start animation
        this.startAnimation();
        
        // Start diagnostics if enabled
        if (config.DEFAULT_DIAGNOSTICS_ENABLED) {
            this.startDiagnostics();
        }
        
        console.log('SVG3D application initialized successfully');
    }
    
    setupScene() {
        this.renderer = setupRenderer(this.container);
        this.scene = createScene();
        this.camera = createCamera(this.container);
    }
    
    setupLighting() {
        const lights = setupLights(this.scene);
        this.ambientLight = lights.ambientLight;
        this.directionalLight = lights.directionalLight;
    }
    
    setupWall() {
        const wall = setupWall();
        this.wallGroup = wall.wallGroup;
        this.shadowPlane = wall.shadowPlane;
        this.wallMesh = wall.wallMesh;
        this.scene.add(this.wallGroup);
    }
    
    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = config.DEFAULT_CONTROLS_DAMPING;
        this.controls.dampingFactor = config.DEFAULT_DAMPING_FACTOR;
        this.controls.enablePan = config.DEFAULT_CONTROLS_ENABLE_PAN;
        this.controls.minDistance = config.DEFAULT_CONTROLS_MIN_DISTANCE;
        this.controls.maxDistance = config.DEFAULT_CONTROLS_MAX_DISTANCE;
        
        // Set up spin base
        const tmpOffset = new THREE.Vector3();
        const tmpSpherical = new THREE.Spherical();
        tmpOffset.copy(this.camera.position).sub(this.controls.target);
        tmpSpherical.setFromVector3(tmpOffset);
        this.spin.baseAz = tmpSpherical.theta;
        this.spin.basePol = tmpSpherical.phi;
        this.spin.baseTarget.copy(this.controls.target);
        this.spin.baseDistance = tmpOffset.length();
        
        // Apply animation start offsets
        this.spin.baseAz += THREE.MathUtils.degToRad(config.DEFAULT_START_YAW_DEG);
        this.spin.basePol += THREE.MathUtils.degToRad(config.DEFAULT_START_PITCH_DEG);
        this.spin.baseTarget.x += config.DEFAULT_START_PAN_X;
        this.spin.baseTarget.y += config.DEFAULT_START_PAN_Y;
        this.controls.target.copy(this.spin.baseTarget);
        this.spin.baseDistance = Math.max(0.1, this.spin.baseDistance + config.DEFAULT_START_ZOOM);
        
        // Recompute camera from offsets
        const s = new THREE.Spherical(this.spin.baseDistance, this.spin.basePol, this.spin.baseAz);
        const off = new THREE.Vector3().setFromSpherical(s);
        this.camera.position.copy(this.controls.target).add(off);
        this.camera.lookAt(this.controls.target);
        
        // Pointer events
        this.controls.addEventListener('start', () => {
            this.spin.paused = true;
            if (this.spin.resumeTimer) {
                clearTimeout(this.spin.resumeTimer);
                this.spin.resumeTimer = null;
            }
        });
        
        this.controls.addEventListener('end', () => {
            clearTimeout(this.spin.resumeTimer);
            this.spin.resumeTimer = setTimeout(() => {
                resumeAnimationAfterInteraction(this.spin, this.camera, this.controls);
            }, this.spin.resumeDelay);
        });
    }
    
    setupUI() {
        if (!config.ENABLE_UI) {
            if (DEBUG_ANIM_ENABLED) {
                console.log('UI disabled by configuration');
            }
            return;
        }
        
        this.ui = new UIController(this);
        this.ui.init();
        
        // Global key handlers
        window.addEventListener('keydown', (e) => {
            if (e.key === 'd' || e.key === 'D') {
                DEBUG_ANIM_ENABLED = !DEBUG_ANIM_ENABLED;
                setSVGDebugMode(DEBUG_ANIM_ENABLED);
                setAnimDebugMode(DEBUG_ANIM_ENABLED);
                console.log(`[debug] animation logs ${DEBUG_ANIM_ENABLED ? 'ENABLED' : 'DISABLED'}`);
            } else if (e.key === 'y' || e.key === 'Y') {
                this.spin.yawDesiredRunning = !this.spin.yawDesiredRunning;
                if (DEBUG_ANIM_ENABLED) {
                    console.log(`[yaw FSM] requested ${this.spin.yawDesiredRunning ? 'RUN' : 'STOP'}`);
                }
            }
        });
    }
    
    async loadSVG(url) {
        try {
            const response = await fetch(url);
            this.svgData = await response.text();
            this.setupContent(this.svgData);
        } catch (error) {
            console.error('Failed to load SVG:', error);
        }
    }
    
    setupContent(svgText) {
        if (!svgText) {
            console.error('No SVG content provided');
            return;
        }
        
        // Remove existing mesh
        if (this.svgMesh) {
            this.scene.remove(this.svgMesh);
            this.disposeMesh(this.svgMesh);
            this.svgMesh = null;
        }
        
        // Build geometry from SVG
        const geom = buildMergedFromSVG(svgText, {
            includeText: !!this.loadedFont,
            font: this.loadedFont,
            fillNodes: this.state.fillNodes,
            smartFill: this.state.smartFill,
            nodeFillColor: this.state.nodeFillColor
        });
        
        if (!geom) {
            console.warn('No geometry created from SVG');
            return;
        }
        
        // Create mesh
        this.svgMesh = createMesh(geom, this.state);
        this.scene.add(this.svgMesh);
        
        // Dispose original geometry
        geom.dispose();
        
        // Start animation after delay
        if (config.DEFAULT_ANIMATION_START_DELAY_MS > 0) {
            if (this.spin.delayTimer) {
                clearTimeout(this.spin.delayTimer);
            }
            this.spin.delayTimer = setTimeout(() => {
                this.spin.startTime = performance.now();
                this.spin.yawDesiredRunning = true;
                this.spin.pitchDesiredRunning = true;
                this.spin.panXDesiredRunning = true;
                this.spin.panYDesiredRunning = true;
                this.spin.zoomDesiredRunning = true;
                this.spin.delayTimer = null;
            }, config.DEFAULT_ANIMATION_START_DELAY_MS);
        } else {
            this.spin.startTime = performance.now();
            this.spin.yawDesiredRunning = true;
            this.spin.pitchDesiredRunning = true;
            this.spin.panXDesiredRunning = true;
            this.spin.panYDesiredRunning = true;
            this.spin.zoomDesiredRunning = true;
        }
    }
    
    loadFont() {
        const fontURL = 'https://unpkg.com/three@0.165.0/examples/fonts/helvetiker_regular.typeface.json';
        if (DEBUG_ANIM_ENABLED) {
            console.log('Loading font from:', fontURL);
        }
        
        const fl = new FontLoader();
        fl.load(fontURL, (font) => {
            if (DEBUG_ANIM_ENABLED) {
                console.log('Font loaded successfully, rebuilding with text');
            }
            this.loadedFont = font;
            this.rebuild(font);
        }, undefined, (err) => console.warn('Font load failed; continuing without text:', err));
    }
    
    rebuild(font) {
        if (this.svgData) {
            this.setupContent(this.svgData);
        }
    }
    
    startAnimation() {
        const animate = () => {
            requestAnimationFrame(animate);
            
            const now = performance.now();
            const dt = Math.min(0.1, (now - (this.lastTime || now)) / 1000);
            this.lastTime = now;
            
            // Update animation
            stepSpin(this.spin, dt, this.camera, this.controls);
            
            // Update controls
            this.controls.update();
            
            // Update UI
            if (this.ui && this.frameCount % 10 === 0) {
                this.ui.updateRunningStateDisplay();
            }
            
            // Render
            this.renderer.render(this.scene, this.camera);
            
            this.frameCount++;
        };
        
        animate();
    }
    
    startDiagnostics() {
        setInterval(() => {
            const now = performance.now();
            if (now - this.lastDiagTime < config.DEFAULT_DIAGNOSTICS_SAMPLE_MS) return;
            this.lastDiagTime = now;
            
            const info = this.renderer.info;
            console.log('[DIAG]', {
                frame: this.frameCount,
                memory: {
                    geometries: info.memory.geometries,
                    textures: info.memory.textures
                },
                render: {
                    calls: info.render.calls,
                    triangles: info.render.triangles,
                    points: info.render.points,
                    lines: info.render.lines
                }
            });
        }, config.DEFAULT_DIAGNOSTICS_SAMPLE_MS);
    }
    
    disposeMesh(obj) {
        if (!obj) return;
        
        if (obj.geometry) obj.geometry.dispose();
        
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(mat => mat.dispose());
            } else {
                obj.material.dispose();
            }
        }
        
        if (obj.children) {
            obj.children.forEach(child => this.disposeMesh(child));
        }
    }
}