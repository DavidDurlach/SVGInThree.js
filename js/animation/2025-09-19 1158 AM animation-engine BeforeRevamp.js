// Animation Engine Module - Handles all animation logic
// Last edit date: 2025-09-11

import * as THREE from 'three';
import * as config from '../config.js';
import { shortestAngleDiff } from '../utils/geometry-utils.js';

// Runtime debug flag
let DEBUG_ANIM_ENABLED = config.DEFAULT_DEBUG_ANIM;
let DEBUG_SAMPLE_EVERY = config.DEFAULT_DEBUG_SAMPLE_EVERY;

// Diagnostics sampled logging helper (per-tag)
const _diagnosticsLastLogTimeByTag = Object.create(null);
function diagSampledLog(tag, logFn, force = false) {
    if (!config.DEFAULT_DIAGNOSTICS_ENABLED) return;
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const interval = Math.max(0, config.DEFAULT_DIAGNOSTICS_SAMPLE_MS || 0);
    const last = _diagnosticsLastLogTimeByTag[tag] || 0;
    if (force || now - last >= interval) {
        _diagnosticsLastLogTimeByTag[tag] = now;
        logFn();
    }
}

/**
 * Set debug mode
 * @param {boolean} enabled - Enable or disable debug logging
 */
export function setDebugMode(enabled) {
    DEBUG_ANIM_ENABLED = enabled;
}

/**
 * Initialize animation state
 * @returns {Object} Animation state object
 */
export function createAnimationState() {
    return {
        enabled: config.DEFAULT_SPIN_ENABLED,
        paused: false,
        startTime: 0,
        delayTimer: null,
        resumeTimer: null,
        resumeDelay: 2000,
        _debug_just_resumed: false,
        
        // Base references (center position for oscillation)
        baseAz: 0,
        basePol: Math.PI / 2,
        baseTarget: new THREE.Vector3(0, 0, 0),
        baseDistance: 100,
        
        // Current velocities
        curYawVel: 0,
        curPitchVel: 0,
        curPanXVel: 0,
        curPanYVel: 0,
        curZoomVel: 0,
        
        // Speeds (magnitudes)
        yawSpeed: THREE.MathUtils.degToRad(config.DEFAULT_YAW_SPEED_DEG),
        pitchSpeed: THREE.MathUtils.degToRad(config.DEFAULT_PITCH_SPEED_DEG),
        panSpeedX: config.DEFAULT_PAN_SPEED_X,
        panSpeedY: config.DEFAULT_PAN_SPEED_Y,
        zoomSpeed: config.DEFAULT_ZOOM_SPEED,
        
        // Limits
        yawLimit: THREE.MathUtils.degToRad(config.DEFAULT_YAW_LIMIT_DEG),
        pitchLimit: THREE.MathUtils.degToRad(config.DEFAULT_PITCH_LIMIT_DEG),
        panLimitX: config.DEFAULT_PAN_LIMIT_X,
        panLimitY: config.DEFAULT_PAN_LIMIT_Y,
        zoomMin: config.DEFAULT_ZOOM_MIN,
        zoomMax: config.DEFAULT_ZOOM_MAX,
        
        // Directions
        yawDir: config.DEFAULT_START_YAW_DIR,
        pitchDir: config.DEFAULT_START_PITCH_DIR,
        panDirX: config.DEFAULT_START_PAN_DIR_X,
        panDirY: config.DEFAULT_START_PAN_DIR_Y,
        zoomDir: config.DEFAULT_START_ZOOM_DIR,
        
        // FSM States
        yawState: 'eYaw_SteadyStateZero',
        pitchState: 'ePitch_SteadyStateZero',
        panXState: 'ePanX_SteadyStateZero',
        panYState: 'ePanY_SteadyStateZero',
        zoomState: 'eZoom_SteadyStateZero',
        
        // FSM Desired Running Flags
        yawDesiredRunning: false,
        pitchDesiredRunning: false,
        panXDesiredRunning: false,
        panYDesiredRunning: false,
        zoomDesiredRunning: false,
        
        // FSM Transition Variables
        yawTransitionVel: 0,
        yawA: 0,
        yawStartSign: 0,
        pitchTransitionVel: 0,
        pitchA: 0,
        pitchStartSign: 0,
        panXTransitionVel: 0,
        panXA: 0,
        panXStartSign: 0,
        panYTransitionVel: 0,
        panYA: 0,
        panYStartSign: 0,
        zoomTransitionVel: 0,
        zoomA: 0,
        zoomStartSign: 0,

        // Step 1: 2025-09-16 10:27 AM --- Runtime replan helpers (yaw only) ---
        yawPlanCapPerMs: 0,          // per-ms magnitude cap captured at segment entry
        _yawSpeedSeen: undefined,    // last raw yawSpeed observed by the engine
        _yawSpeedVer: 0,             // bumps when yawSpeed changes
        _yawSpeedAppliedVer: 0,      // last version we reacted to

        // Bounce counters
        yawBounceCount: 0,
        pitchBounceCount: 0
    };
}

/**
 * Step the animation for one frame
 * @param {Object} spin - Animation state
 * @param {number} dt - Delta time in seconds
 * @param {THREE.Camera} camera - Camera to animate
 * @param {OrbitControls} controls - Orbit controls
 */
export function stepSpin(spin, dt, camera, controls) {
    if (!spin.enabled || spin.paused) return;

    // NEW: stash dt so predictive can anticipate the next integration step
    spin._lastDt = dt;

    const tmpOffset = new THREE.Vector3();
    const tmpSpherical = new THREE.Spherical();

    tmpOffset.copy(camera.position).sub(controls.target);
    tmpSpherical.setFromVector3(tmpOffset);

    const s = tmpSpherical.clone();

    // Process FSM states for each animation parameter
    processYawFSM(spin, s, dt);
    processPitchFSM(spin, s, dt);
    processPanXFSM(spin, dt);
    processPanYFSM(spin, dt);
    processZoomFSM(spin, dt);

    // Integrate velocities
    s.theta += spin.curYawVel * dt;
    s.phi   += spin.curPitchVel * dt;

    // Handle boundary bounces
    handleYawBounce(spin, s);
    handlePitchBounce(spin, s, dt);

    // Clamp phi to valid range
    s.phi = Math.max(0.01, Math.min(Math.PI - 0.01, s.phi));

    // Update camera position from spherical coordinates
    tmpOffset.setFromSpherical(s);
    camera.position.copy(controls.target).add(tmpOffset);

    // Apply pan
    const targetOffset = new THREE.Vector3(
        spin.curPanXVel * dt,
        spin.curPanYVel * dt,
        0
    );
    controls.target.add(targetOffset);
    camera.position.add(targetOffset);

    // Handle pan bounces
    handlePanBounce(spin, controls.target);

    // Apply zoom
    const zoomDelta = spin.curZoomVel * dt;
    const newDist = Math.max(spin.zoomMin, Math.min(spin.zoomMax, tmpOffset.length() + zoomDelta));
    tmpOffset.normalize().multiplyScalar(newDist);
    camera.position.copy(controls.target).add(tmpOffset);

    // Handle zoom bounces
    handleZoomBounce(spin, newDist);

    // Update camera look-at
    camera.lookAt(controls.target);
}




/**
 * Process Yaw FSM state transitions
 * @private
 */
function processYawFSM(spin, s, dt) {
    let targetYawVel = spin.yawDir * spin.yawSpeed;
    
    // Step 2: 2025-09-16 10:30 AM Detect yaw slider changes (engine-local; no UI wiring required)
    if (spin._yawSpeedSeen !== spin.yawSpeed) {
        spin._yawSpeedSeen = spin.yawSpeed;
        spin._yawSpeedVer = (spin._yawSpeedVer | 0) + 1;
    }

    // DEBUG: Log yaw state on first few frames  
    if (!spin._yawDebugCount) spin._yawDebugCount = 0;
    if (spin._yawDebugCount < 5 || (spin._yawDebugCount > 100 && spin._yawDebugCount < 105)) {
        let theta = s.theta;
        while (theta > Math.PI) theta -= 2 * Math.PI;
        while (theta < -Math.PI) theta += 2 * Math.PI;
        const dAz = theta - spin.baseAz;
        console.log(`[YAW DEBUG ${spin._yawDebugCount}] state=${spin.yawState}, dir=${spin.yawDir}, ` +
            `dAz=${dAz.toFixed(4)}, limit=${spin.yawLimit.toFixed(4)}, ` +
            `curVel=${spin.curYawVel?.toFixed(4)}, transVel=${spin.yawTransitionVel?.toFixed(4)}, ` +
            `theta=${theta.toFixed(4)}, baseAz=${spin.baseAz.toFixed(4)}`);
    }
    spin._yawDebugCount++;
    
    // State transitions based on desired running state
    if (spin.yawDesiredRunning) {
        if (spin.yawState === 'eYaw_SteadyStateZero') {
            const desiredCandidate = spin.yawDir * spin.yawSpeed;
            if (Math.abs(desiredCandidate) > config.YAW_EPS_VEL) {
                transitionToSteadyVel(spin, 'yaw');
            } else {
                // Stay at zero without triggering accel when desired is effectively zero
                spin.yawTransitionVel = 0;
                targetYawVel = 0;
            }
        }
    } else {
        if (spin.yawState === 'eYaw_SteadyStateVel') {
            transitionToZero(spin, 'yaw');
        }
    }
    
    // Process current state
    switch (spin.yawState) {
        case 'eYaw_SteadyStateVel': {
            const desired = targetYawVel;
            const eps = config.YAW_EPS_VEL;
            if (Math.abs(desired) <= eps) {
                transitionToZero(spin, 'yaw');
                targetYawVel = spin.yawTransitionVel;
                break;
            }
            // Immediate magnitude change while steady
            spin.yawTransitionVel = desired;
            spin.yawPlanCapPerMs = 0;   // Step 4A: 2025-09-16 10:54 AM
            targetYawVel = desired;
            break;
        }
        case 'eYaw_SteadyStateZero':
            targetYawVel = 0;
            spin.yawTransitionVel = 0;
            break;
        case 'eYaw_DecreaseVelToZero':
            // Step 6A: 2025-09-16 11:28 AM Allow immediate response to slider change while decelerating
            if (retargetYawOnSpeedChange(spin, s)) {
                // State may have switched to IncreaseVel; let next frame handle it
                targetYawVel = spin.yawTransitionVel;
                break;
            }
            processDecelToZero(spin, 'yaw', dt);
            targetYawVel = spin.yawTransitionVel;
            break;
        case 'eYaw_IncreaseVelToSteadyState':
            // If desired is ~0, skip accel and go to zero
            if (Math.abs(spin.yawDir * spin.yawSpeed) <= config.YAW_EPS_VEL) {
                transitionToZero(spin, 'yaw');
            } else {
                // Runway-aware symmetric acceleration (mirror pitch behavior)
                const easeSec = Math.max(0, config.DEFAULT_EASE_TIME_MS) / 1000;
                const dOut = computeOutwardRunway(spin, s, 'yaw');
                const aTime = Math.abs(spin.yawSpeed) / Math.max(easeSec, 1e-6);
                const aSym = Number.isFinite(dOut) && dOut > 0 ? ((Math.abs(spin.yawSpeed) * Math.abs(spin.yawSpeed)) / Math.max(dOut, 1e-9)) : 0;
                const aUse = Math.max(aTime, aSym);
                const desired = spin.yawDir * spin.yawSpeed;
                const oldVel = spin.yawTransitionVel;
                diagSampledLog('yaw-accel-aUsed', () => {
                    console.log(`[DIAG] YAW aUsed(accel) dOut=${dOut.toFixed(4)} aTime=${aTime.toFixed(6)} aSym=${aSym.toFixed(6)} aUse=${aUse.toFixed(6)} desired=${desired.toFixed(4)} oldVel=${oldVel.toFixed(4)} state=${spin.yawState}`);
                });
                const aPerMs = Math.sign(desired - oldVel) * (aUse / 1000);
                spin.yawA = aPerMs;
                spin.yawTransitionVel = oldVel + spin.yawA * 1000 * dt;
                // Completion check to avoid overshoot of desired
                const incSign = Math.sign(desired) || 1;
                const curDiffSign = Math.sign(desired - spin.yawTransitionVel);
                if (curDiffSign === 0 || curDiffSign !== incSign) {
                    spin.yawTransitionVel = desired;
                    spin.yawA = 0;
                    spin.yawState = 'eYaw_SteadyStateVel';
                }
            }
            targetYawVel = spin.yawTransitionVel;
            break;
        case 'eYaw_ReverseDirection':
            // Step 6B: 2025-09-16 11:28 AM Allow immediate response to slider change while reversing
            retargetYawOnSpeedChange(spin, s);
            processReversal(spin, 'yaw', dt);
            targetYawVel = spin.yawTransitionVel;
            break;
    }
    
    spin.curYawVel = targetYawVel;
}

/**
 * Process Pitch FSM state transitions
 * @private
 */
function processPitchFSM(spin, s, dt) {
    let targetPitchVel = -spin.pitchDir * spin.pitchSpeed;
    
    // DEBUG: Log pitch state on first few frames
    if (!spin._pitchDebugCount) spin._pitchDebugCount = 0;
    if (spin._pitchDebugCount < 5 || (spin._pitchDebugCount > 100 && spin._pitchDebugCount < 105)) {
        const dPol = s.phi - spin.basePol;
        console.log(`[PITCH DEBUG ${spin._pitchDebugCount}] state=${spin.pitchState}, dir=${spin.pitchDir}, ` +
            `dPol=${dPol.toFixed(4)}, limit=${spin.pitchLimit.toFixed(4)}, ` +
            `curVel=${spin.curPitchVel?.toFixed(4)}, transVel=${spin.pitchTransitionVel?.toFixed(4)}, ` +
            `phi=${s.phi.toFixed(4)}, basePol=${spin.basePol.toFixed(4)}`);
    }
    spin._pitchDebugCount++;
    
    if (spin.pitchDesiredRunning) {
        if (spin.pitchState === 'ePitch_SteadyStateZero') {
            const desiredCandidate = -spin.pitchDir * spin.pitchSpeed;
            if (Math.abs(desiredCandidate) > config.PITCH_EPS_VEL) {
                transitionToSteadyVel(spin, 'pitch');
            } else {
                // Stay at zero without triggering accel when desired is effectively zero
                spin.pitchTransitionVel = 0;
                targetPitchVel = 0;
            }
        }
    } else {
        if (spin.pitchState === 'ePitch_SteadyStateVel') {
            transitionToZero(spin, 'pitch');
        }
    }
    
    switch (spin.pitchState) {
        case 'ePitch_SteadyStateVel': {
            const desired = targetPitchVel;
            const eps = config.PITCH_EPS_VEL;
            if (Math.abs(desired) <= eps) {
                transitionToZero(spin, 'pitch');
                targetPitchVel = spin.pitchTransitionVel;
                break;
            }
            // Immediate magnitude change while steady
            spin.pitchTransitionVel = desired;
            targetPitchVel = desired;
            break;
        }
        case 'ePitch_SteadyStateZero':
            targetPitchVel = 0;
            spin.pitchTransitionVel = 0;
            break;
        case 'ePitch_DecreaseVelToZero':
            processDecelToZero(spin, 'pitch', dt);
            targetPitchVel = spin.pitchTransitionVel;
            break;
        case 'ePitch_IncreaseVelToSteadyState': {
            // If desired is ~0, skip accel and go to zero
            if (Math.abs(-spin.pitchDir * spin.pitchSpeed) <= config.PITCH_EPS_VEL) {
                transitionToZero(spin, 'pitch');
            } else {
                // Use runway-aware symmetric accel when runway is limiting
                const easeSec = Math.max(0, config.DEFAULT_EASE_TIME_MS) / 1000;
                const dOut = computeOutwardRunway(spin, s, 'pitch');
                const aTime = Math.abs(spin.pitchSpeed) / Math.max(easeSec, 1e-6);
                const aSym = Number.isFinite(dOut) && dOut > 0 ? ((Math.abs(spin.pitchSpeed) * Math.abs(spin.pitchSpeed)) / Math.max(dOut, 1e-9)) : 0;
                const aUse = Math.max(aTime, aSym);
                const desired = -spin.pitchDir * spin.pitchSpeed;
                const oldVel = spin.pitchTransitionVel;
                const forceAccelLog = ((spin.pitchBounceCount|0) === 0) && !spin._pitchAccelAUsedLogged;
                diagSampledLog('pitch-accel-aUsed', () => {
                    console.log(`[DIAG] PITCH aUsed(accel) bounce#${spin.pitchBounceCount} dOut=${dOut.toFixed(4)} aTime=${aTime.toFixed(6)} aSym=${aSym.toFixed(6)} aUse=${aUse.toFixed(6)} desired=${desired.toFixed(4)} oldVel=${oldVel.toFixed(4)} state=${spin.pitchState}`);
                    if (forceAccelLog) spin._pitchAccelAUsedLogged = true;
                }, forceAccelLog);
                // Convert rad/s^2 to per-ms for our integrator
                const aPerMs = Math.sign(desired - oldVel) * (aUse / 1000);
                spin.pitchA = aPerMs;
                spin.pitchTransitionVel = oldVel + spin.pitchA * 1000 * dt;
                // Completion check to avoid overshoot of desired
                const incSign = Math.sign(desired) || 1;
                const curDiffSign = Math.sign(desired - spin.pitchTransitionVel);
                if (curDiffSign === 0 || curDiffSign !== incSign) {
                    spin.pitchTransitionVel = desired;
                    spin.pitchA = 0;
                    spin.pitchState = 'ePitch_SteadyStateVel';
                }
            }
            targetPitchVel = spin.pitchTransitionVel;
            break;
        }
        case 'ePitch_ReverseDirection':
            processReversal(spin, 'pitch', dt);
            targetPitchVel = spin.pitchTransitionVel;
            break;
    }
    
    spin.curPitchVel = targetPitchVel;
}

/**
 * Process Pan X FSM
 * @private
 */
function processPanXFSM(spin, dt) {
    let targetPanXVel = spin.panDirX * spin.panSpeedX;
    
    if (spin.panXDesiredRunning) {
        if (spin.panXState === 'ePanX_SteadyStateZero') {
            transitionToSteadyVel(spin, 'panX');
        }
    } else {
        if (spin.panXState === 'ePanX_SteadyStateVel') {
            transitionToZero(spin, 'panX');
        }
    }
    
    switch (spin.panXState) {
        case 'ePanX_SteadyStateVel':
            spin.panXTransitionVel = targetPanXVel;
            break;
        case 'ePanX_SteadyStateZero':
            targetPanXVel = 0;
            spin.panXTransitionVel = 0;
            break;
        case 'ePanX_DecreaseVelToZero':
            processDecelToZero(spin, 'panX', dt);
            targetPanXVel = spin.panXTransitionVel;
            break;
        case 'ePanX_IncreaseVelToSteadyState':
            processAccelToSteady(spin, 'panX', dt);
            targetPanXVel = spin.panXTransitionVel;
            break;
        case 'ePanX_ReverseDirection':
            processReversal(spin, 'panX', dt);
            targetPanXVel = spin.panXTransitionVel;
            break;
    }
    
    spin.curPanXVel = targetPanXVel;
}

/**
 * Process Pan Y FSM
 * @private
 */
function processPanYFSM(spin, dt) {
    let targetPanYVel = spin.panDirY * spin.panSpeedY;
    
    if (spin.panYDesiredRunning) {
        if (spin.panYState === 'ePanY_SteadyStateZero') {
            transitionToSteadyVel(spin, 'panY');
        }
    } else {
        if (spin.panYState === 'ePanY_SteadyStateVel') {
            transitionToZero(spin, 'panY');
        }
    }
    
    switch (spin.panYState) {
        case 'ePanY_SteadyStateVel':
            spin.panYTransitionVel = targetPanYVel;
            break;
        case 'ePanY_SteadyStateZero':
            targetPanYVel = 0;
            spin.panYTransitionVel = 0;
            break;
        case 'ePanY_DecreaseVelToZero':
            processDecelToZero(spin, 'panY', dt);
            targetPanYVel = spin.panYTransitionVel;
            break;
        case 'ePanY_IncreaseVelToSteadyState':
            processAccelToSteady(spin, 'panY', dt);
            targetPanYVel = spin.panYTransitionVel;
            break;
        case 'ePanY_ReverseDirection':
            processReversal(spin, 'panY', dt);
            targetPanYVel = spin.panYTransitionVel;
            break;
    }
    
    spin.curPanYVel = targetPanYVel;
}

/**
 * Process Zoom FSM
 * @private
 */
function processZoomFSM(spin, dt) {
    let targetZoomVel = spin.zoomDir * spin.zoomSpeed;
    
    if (spin.zoomDesiredRunning) {
        if (spin.zoomState === 'eZoom_SteadyStateZero') {
            transitionToSteadyVel(spin, 'zoom');
        }
    } else {
        if (spin.zoomState === 'eZoom_SteadyStateVel') {
            transitionToZero(spin, 'zoom');
        }
    }
    
    switch (spin.zoomState) {
        case 'eZoom_SteadyStateVel':
            spin.zoomTransitionVel = targetZoomVel;
            break;
        case 'eZoom_SteadyStateZero':
            targetZoomVel = 0;
            spin.zoomTransitionVel = 0;
            break;
        case 'eZoom_DecreaseVelToZero':
            processDecelToZero(spin, 'zoom', dt);
            targetZoomVel = spin.zoomTransitionVel;
            break;
        case 'eZoom_IncreaseVelToSteadyState':
            processAccelToSteady(spin, 'zoom', dt);
            targetZoomVel = spin.zoomTransitionVel;
            break;
        case 'eZoom_ReverseDirection':
            processReversal(spin, 'zoom', dt);
            targetZoomVel = spin.zoomTransitionVel;
            break;
    }
    
    spin.curZoomVel = targetZoomVel;
}

// Helper functions for FSM transitions
function transitionToSteadyVel(spin, param) {
    const easeMs = Math.max(0, config.DEFAULT_EASE_TIME_MS);
    const paramMap = {
        yaw: { dir: spin.yawDir, speed: spin.yawSpeed, prefix: 'yaw' },
        pitch: { dir: -spin.pitchDir, speed: spin.pitchSpeed, prefix: 'pitch' },
        panX: { dir: spin.panDirX, speed: spin.panSpeedX, prefix: 'panX' },
        panY: { dir: spin.panDirY, speed: spin.panSpeedY, prefix: 'panY' },
        zoom: { dir: spin.zoomDir, speed: spin.zoomSpeed, prefix: 'zoom' }
    };
    
    const p = paramMap[param];
    const desired = p.dir * p.speed;
    const prefix = p.prefix;
    const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    
    spin[`${prefix}TransitionVel`] = 0;
    spin[`${prefix}StartSign`] = 0;
    
    if (easeMs === 0) {
        spin[`${prefix}TransitionVel`] = desired;
        spin[`${prefix}A`] = 0;
        spin[`${prefix}State`] = `e${capPrefix}_SteadyStateVel`;
    } else {
        spin[`${prefix}A`] = desired / easeMs;
        spin[`${prefix}State`] = `e${capPrefix}_IncreaseVelToSteadyState`;
    }
}

function transitionToZero(spin, param) {
    const easeMs = Math.max(0, config.DEFAULT_EASE_TIME_MS);
    const paramMap = {
        yaw: { curVel: spin.curYawVel, dir: spin.yawDir, speed: spin.yawSpeed, prefix: 'yaw' },
        pitch: { curVel: spin.curPitchVel, dir: -spin.pitchDir, speed: spin.pitchSpeed, prefix: 'pitch' },
        panX: { curVel: spin.curPanXVel, dir: spin.panDirX, speed: spin.panSpeedX, prefix: 'panX' },
        panY: { curVel: spin.curPanYVel, dir: spin.panDirY, speed: spin.panSpeedY, prefix: 'panY' },
        zoom: { curVel: spin.curZoomVel, dir: spin.zoomDir, speed: spin.zoomSpeed, prefix: 'zoom' }
    };
    
    const p = paramMap[param];
    const prefix = p.prefix;
    const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    
    spin[`${prefix}TransitionVel`] = p.curVel || (p.dir * p.speed);
    spin[`${prefix}StartSign`] = Math.sign(spin[`${prefix}TransitionVel`] || 1);
    
    if (easeMs === 0) {
        spin[`${prefix}TransitionVel`] = 0;
        spin[`${prefix}A`] = 0;
        spin[`${prefix}State`] = `e${capPrefix}_SteadyStateZero`;
    } else {
        spin[`${prefix}A`] = -spin[`${prefix}TransitionVel`] / easeMs;
        spin[`${prefix}State`] = `e${capPrefix}_DecreaseVelToZero`;
        if (param === 'yaw') spin.yawPlanCapPerMs = Math.abs(spin.yawA);    // Step 3A: 2025-09-16 10:35 AM
    }
}

function processDecelToZero(spin, param, dt) {
    const prefix = param === 'panX' ? 'panX' : param === 'panY' ? 'panY' : param;
    const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    
    spin[`${prefix}TransitionVel`] += spin[`${prefix}A`] * 1000 * dt;
    
    if (spin[`${prefix}StartSign`] === 0) {
        spin[`${prefix}StartSign`] = Math.sign(spin[`${prefix}TransitionVel`] || 1);
    }
    
    if (Math.sign(spin[`${prefix}TransitionVel`]) === 0 || 
        Math.sign(spin[`${prefix}TransitionVel`]) !== spin[`${prefix}StartSign`]) {
        spin[`${prefix}TransitionVel`] = 0;
        spin[`${prefix}A`] = 0;
        spin[`${prefix}StartSign`] = 0;
        spin[`${prefix}State`] = `e${capPrefix}_SteadyStateZero`;
        if (param === 'yaw') spin.yawPlanCapPerMs = 0;    // Step 4B: 2025-09-16 11:13 AM
    }
}

function processAccelToSteady(spin, param, dt) {
    const paramMap = {
        yaw: { dir: spin.yawDir, speed: spin.yawSpeed, prefix: 'yaw' },
        pitch: { dir: -spin.pitchDir, speed: spin.pitchSpeed, prefix: 'pitch' },
        panX: { dir: spin.panDirX, speed: spin.panSpeedX, prefix: 'panX' },
        panY: { dir: spin.panDirY, speed: spin.panSpeedY, prefix: 'panY' },
        zoom: { dir: spin.zoomDir, speed: spin.zoomSpeed, prefix: 'zoom' }
    };
    
    const p = paramMap[param];
    const desired = p.dir * p.speed;
    const prefix = p.prefix;
    const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    
    const oldVel = spin[`${prefix}TransitionVel`];
    const easeMs = Math.max(0, config.DEFAULT_EASE_TIME_MS);
    if (easeMs === 0) {
        spin[`${prefix}TransitionVel`] = desired;
        spin[`${prefix}A`] = 0;
        spin[`${prefix}State`] = `e${capPrefix}_SteadyStateVel`;
    } else {
        // Adapt acceleration toward current desired each frame so UI changes mid-accel take effect
        spin[`${prefix}A`] = (desired - oldVel) / easeMs;
        spin[`${prefix}TransitionVel`] = oldVel + spin[`${prefix}A`] * 1000 * dt;
    }
    
    // DIAG: Acceleration progress
    if (param === 'pitch') {
        diagSampledLog('pitch-accel', () => {
            const progressPct = Math.abs(desired) > 1e-12 ? (spin[`${prefix}TransitionVel`]/desired * 100) : 100;
            console.log(`[DIAG] PITCH ACCEL desired=${desired.toFixed(4)}, oldVel=${oldVel.toFixed(4)}, ` +
                `newVel=${spin[`${prefix}TransitionVel`].toFixed(4)}, accel=${spin[`${prefix}A`].toFixed(6)}, ` +
                `dt=${dt.toFixed(4)}, progress=${progressPct.toFixed(1)}%`);
        });
    } else if (param === 'yaw') {
        diagSampledLog('yaw-accel', () => {
            const progressPct = Math.abs(desired) > 1e-12 ? (spin[`${prefix}TransitionVel`]/desired * 100) : 100;
            console.log(`[DIAG] YAW ACCEL desired=${desired.toFixed(4)}, oldVel=${oldVel.toFixed(4)}, ` +
                `newVel=${spin[`${prefix}TransitionVel`].toFixed(4)}, accel=${spin[`${prefix}A`].toFixed(6)}, ` +
                `dt=${dt.toFixed(4)}, progress=${progressPct.toFixed(1)}%`);
        });
    }
    
    const incSign = Math.sign(desired) || 1;
    const curDiffSign = Math.sign(desired - spin[`${prefix}TransitionVel`]);
    
    if (curDiffSign === 0 || curDiffSign !== incSign) {
        if (param === 'pitch') {
            diagSampledLog('pitch-accel-complete', () => {
                console.log(`[DIAG] PITCH ACCEL COMPLETE Reached steady state! Final vel=${spin[`${prefix}TransitionVel`].toFixed(4)}`);
            });
        } else if (param === 'yaw') {
            diagSampledLog('yaw-accel-complete', () => {
                console.log(`[DIAG] YAW ACCEL COMPLETE Reached steady state! Final vel=${spin[`${prefix}TransitionVel`].toFixed(4)}`);
            });
        }
        spin[`${prefix}TransitionVel`] = desired;
        spin[`${prefix}A`] = 0;
        spin[`${prefix}State`] = `e${capPrefix}_SteadyStateVel`;

        // Apply any pending slider cue for speed magnitude upon reaching steady
        if (param === 'yaw' && typeof spin._pendingYawSpeed === 'number') {
            spin.yawSpeed = spin._pendingYawSpeed;
            diagSampledLog('yaw-apply-pending-speed', () => {
                console.log(`[DIAG] YAW pending speed applied at steady: ${spin.yawSpeed.toFixed(4)} rad/s`);
            });
            delete spin._pendingYawSpeed;
        } else if (param === 'pitch' && typeof spin._pendingPitchSpeed === 'number') {
            spin.pitchSpeed = spin._pendingPitchSpeed;
            diagSampledLog('pitch-apply-pending-speed', () => {
                console.log(`[DIAG] PITCH pending speed applied at steady: ${spin.pitchSpeed.toFixed(4)} rad/s`);
            });
            delete spin._pendingPitchSpeed;
        }
    }
}

function processReversal(spin, param, dt) {
    const paramMap = {
        yaw: { dir: spin.yawDir, speed: spin.yawSpeed, prefix: 'yaw', eps: config.YAW_EPS_VEL },
        pitch: { dir: -spin.pitchDir, speed: spin.pitchSpeed, prefix: 'pitch', eps: config.PITCH_EPS_VEL },
        panX: { dir: spin.panDirX, speed: spin.panSpeedX, prefix: 'panX', eps: config.PAN_EPS_VEL },
        panY: { dir: spin.panDirY, speed: spin.panSpeedY, prefix: 'panY', eps: config.PAN_EPS_VEL },
        zoom: { dir: spin.zoomDir, speed: spin.zoomSpeed, prefix: 'zoom', eps: config.ZOOM_EPS_VEL }
    };
    
    const p = paramMap[param];
    const desired = p.dir * p.speed;
    const prefix = p.prefix;
    const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    
    // Handle speed going to zero during reversal
    if (Math.abs(desired) < p.eps && Math.abs(p.speed) < p.eps) {
        const easeMs = Math.max(0, config.DEFAULT_EASE_TIME_MS);
        spin[`${prefix}StartSign`] = Math.sign(spin[`${prefix}TransitionVel`] || 1);
        
        if (easeMs === 0 || Math.abs(spin[`${prefix}TransitionVel`]) < p.eps) {
            spin[`${prefix}TransitionVel`] = 0;
            spin[`${prefix}A`] = 0;
            spin[`${prefix}State`] = `e${capPrefix}_SteadyStateZero`;
        } else {
            spin[`${prefix}A`] = -spin[`${prefix}TransitionVel`] / easeMs;
            spin[`${prefix}State`] = `e${capPrefix}_DecreaseVelToZero`;
        }
        return;
    }
    
    // Normal reversal continuation
    spin[`${prefix}TransitionVel`] += spin[`${prefix}A`] * 1000 * dt;
    
    const done = (Math.sign(spin[`${prefix}TransitionVel`]) === Math.sign(desired)) &&
                 (Math.abs(spin[`${prefix}TransitionVel`]) >= Math.abs(desired) - p.eps);
    
    if (done) {
        spin[`${prefix}TransitionVel`] = desired;
        spin[`${prefix}A`] = 0;
        spin[`${prefix}State`] = `e${capPrefix}_SteadyStateVel`;
        if (param === 'pitch') {
            diagSampledLog('pitch-reversal-complete', () => {
                console.log(`[DIAG] PITCH REVERSAL COMPLETE (normal bounce); REACHED REV DIR STEADY STATE! Final vel=${spin[`${prefix}TransitionVel`].toFixed(4)}`);
            });
            // Apply any pending slider cue immediately on reversal completion
            if (typeof spin._pendingPitchSpeed === 'number') {
                spin.pitchSpeed = spin._pendingPitchSpeed;
                diagSampledLog('pitch-apply-pending-speed', () => {
                    console.log(`[DIAG] PITCH pending speed applied at reversal: ${spin.pitchSpeed.toFixed(4)} rad/s`);
                });
                delete spin._pendingPitchSpeed;
            }
        } else if (param === 'yaw') {
            diagSampledLog('yaw-reversal-complete', () => {
                console.log(`[DIAG] YAW REVERSAL COMPLETE (normal bounce); REACHED REV DIR STEADY STATE! Final vel=${spin[`${prefix}TransitionVel`].toFixed(4)}`);
            });
            spin.yawPlanCapPerMs = 0;   // Clear yaw plan cap on reversal completion

            // Apply any pending slider cue immediately on reversal completion (mirror pitch behavior)
            if (typeof spin._pendingYawSpeed === 'number') {
                spin.yawSpeed = spin._pendingYawSpeed;
                diagSampledLog('yaw-apply-pending-speed', () => {
                    console.log(`[DIAG] YAW pending speed applied at reversal: ${spin.yawSpeed.toFixed(4)} rad/s`);
                });
                delete spin._pendingYawSpeed;
            }
        }
    }
}

// Geometry-only helpers (no side effects)
/**
 * Compute available runway to the boundary along the current outward direction.
 * Returns a positive scalar distance (radians for yaw/pitch), or Infinity if not moving outward.
 * This is purely geometric: depends only on current pose and limits (plus velocity sign for direction).
 * @param {Object} spin - Animation state
 * @param {THREE.Spherical} s - Current spherical coordinates of camera relative to target
 * @param {('yaw'|'pitch'|'panX'|'panY'|'zoom')} param - Parameter to compute runway for
 * @param {number} velSign - Sign of current velocity for that param (+1, -1, or 0)
 * @returns {number} Available runway distance (Infinity if moving inward or undefined)
 */
function computeAvailableRunway(spin, s, param, velSign) {
    if (!Number.isFinite(velSign) || velSign === 0) return Infinity;
    switch (param) {
        case 'yaw': {
            let theta = s.theta;
            while (theta > Math.PI) theta -= 2 * Math.PI;
            while (theta < -Math.PI) theta += 2 * Math.PI;
            const dAz = shortestAngleDiff(theta, spin.baseAz);
            // Outward iff moving further away from base (same sign)
            if (Math.sign(dAz) !== Math.sign(velSign)) return Infinity;
            const runway = Math.max(0, spin.yawLimit - Math.abs(dAz));
            return runway;
        }
        case 'pitch': {
            const dPol = s.phi - spin.basePol;
            if (Math.sign(dPol) !== Math.sign(velSign)) return Infinity;
            const runway = Math.max(0, spin.pitchLimit - Math.abs(dPol));
            return runway;
        }
        case 'panX': {
            const dx = (s._dummyPanX ?? 0); // Placeholder: pan runway can be added during integration
            return Infinity; // Not implemented yet
        }
        case 'panY': {
            const dy = (s._dummyPanY ?? 0);
            return Infinity; // Not implemented yet
        }
        case 'zoom': {
            return Infinity; // Not implemented yet
        }
        default:
            return Infinity;
    }
}

/**
 * Compute maximum acceleration magnitude to honor both easing time and available runway.
 * a_time = |v| / easeSec; a_runway = v^2 / (2 * dRunway).
 * Uses RUNWAY_FALLBACK_ACCEL_MULT when dRunway is non-positive.
 * @param {number} easeSec - Easing time constant (seconds)
 * @param {number} v - Current velocity (units/s or rad/s)
 * @param {number} dRunway - Available runway distance (same units as position; radians for yaw/pitch)
 * @returns {number} Acceleration magnitude to use
 */
function computeAccelMax(easeSec, v, dRunway) {
    const absV = Math.abs(v);
    const aTime = absV / Math.max(easeSec, 1e-6);
    let aRunway = 0;
    if (Number.isFinite(dRunway)) {
        if (dRunway > 0) {
            aRunway = (absV * absV) / (2 * dRunway);
        } else {
            aRunway = aTime * (config.RUNWAY_FALLBACK_ACCEL_MULT || 10);
        }
    } else {
        aRunway = 0; // Infinite runway → runway constraint inactive
    }
    return Math.max(aTime, aRunway);
}

// Symmetric-plan helpers (geometry-only)
function computeOutwardRunway(spin, s, param) {
    switch (param) {
        case 'pitch': {
            const dPol = s.phi - spin.basePol;
            return Math.max(0, spin.pitchLimit - Math.abs(dPol));
        }
        case 'yaw': {
            let theta = s.theta;
            while (theta > Math.PI) theta -= 2 * Math.PI;
            while (theta < -Math.PI) theta += 2 * Math.PI;
            const dAz = shortestAngleDiff(theta, spin.baseAz);
            return Math.max(0, spin.yawLimit - Math.abs(dAz));
        }
        default:
            return Infinity;
    }
}

function computeRunwayToCenter(spin, s, param) {
    switch (param) {
        case 'pitch': {
            const dPol = s.phi - spin.basePol;
            return Math.max(0, Math.abs(dPol));
        }
        case 'yaw': {
            let theta = s.theta;
            while (theta > Math.PI) theta -= 2 * Math.PI;
            while (theta < -Math.PI) theta += 2 * Math.PI;
            const dAz = shortestAngleDiff(theta, spin.baseAz);
            return Math.max(0, Math.abs(dAz));
        }
        default:
            return Infinity;
    }
}

function computeSymmetricAccel(easeSec, vTarget, dTotal) {
    const aTime = Math.abs(vTarget) / Math.max(easeSec, 1e-6);
    const aRunway = Number.isFinite(dTotal) && dTotal > 0 ? ((Math.abs(vTarget) * Math.abs(vTarget)) / Math.max(dTotal, 1e-9)) : 0;
    return Math.max(aTime, aRunway);
}


// Step 5: 2025-09-16 11:19 AM --- Yaw-only: Retarget current segment when the slider value changes (safe & gated) ---
function retargetYawOnSpeedChange(spin, s) {
    // Gate: only if the yaw slider value changed since last application
    if ((spin._yawSpeedVer | 0) === (spin._yawSpeedAppliedVer | 0)) return false;

    const easeMs  = Math.max(0, config.DEFAULT_EASE_TIME_MS);
    const easeSec = easeMs / 1000;
    if (easeMs === 0) { // trivial easing → nothing to smooth; mark consumed
        spin._yawSpeedAppliedVer = spin._yawSpeedVer;
        return false;
    }

    spin.yawState = 'eYaw_SteadyStateVel';  // 2025-09-19 1:23 AM --- just a test

    const desired = spin.yawDir * spin.yawSpeed;
    const v       = spin.yawTransitionVel || 0;
    const epsV    = config.YAW_EPS_VEL || 0;
    const state   = spin.yawState;

    // Case 1: decel-to-zero → if desired is nonzero and same sign as v, hand off to accel
    if (state === 'eYaw_DecreaseVelToZero') {
        if (Math.abs(desired) > epsV && Math.sign(desired) === Math.sign(v || 0)) {
            // Hand-off to IncreaseVelToSteady WITHOUT zeroing transitionVel
            spin.yawState = 'eYaw_IncreaseVelToSteadyState';
            spin._yawSpeedAppliedVer = spin._yawSpeedVer;
            diagSampledLog('yaw-retarget-decel', () => {
                console.log(`[DIAG] YAW RETARGET (decel→accel) desired=${desired.toFixed(4)} v=${v.toFixed(4)}`);
            }, true);
            return true;
        } else {
            // Stay in decel; refresh A toward 0 (time form)
            spin.yawA = (-v) / easeMs;
            spin._yawSpeedAppliedVer = spin._yawSpeedVer;
            diagSampledLog('yaw-retarget-decel', () => {
                console.log(`[DIAG] YAW RETARGET (decel) reset A toward 0; v=${v.toFixed(4)}`);
            });
            return true;
        }
    }

    // Case 2: reversal → braking vs acceleration phases
    if (state !== 'eYaw_ReverseDirection') {
        // Not a state we retarget; consume version so we don't loop
        spin._yawSpeedAppliedVer = spin._yawSpeedVer;
        return false;
    }

    const vSign = Math.sign(v);
    const brakingPhase = vSign !== 0 && Math.sign(desired) !== vSign;

    if (brakingPhase) {
        // Braking: require a FLOOR so we can stop in time (safe if increased)
        const dOut = computeAvailableRunway(spin, s, 'yaw', vSign);
        const aFloorPerSec2 = computeAccelMax(easeSec, v, dOut);
        const aFloorPerMs   = aFloorPerSec2 / 1000;
        const aNomPerMs     = (desired - v) / easeMs; // usually opposite sign of v
        const aPerMs        = -Math.sign(v || 1) * Math.max(aFloorPerMs, Math.abs(aNomPerMs));
        spin.yawA = aPerMs;

        diagSampledLog('yaw-retarget-rev-brake', () => {
            console.log(`[DIAG] YAW RETARGET (rev-brake) dOut=${Number.isFinite(dOut)?dOut.toFixed(4):'âˆž'} `
                + `aFloor=${aFloorPerSec2.toFixed(6)}(/s^2) set A=${aPerMs.toFixed(6)}(/ms) v=${v.toFixed(4)} desired=${desired.toFixed(4)}`);
        });
    } else {
        // Accelerating in reversed direction: CEILING from geometry + plan (if any)
        const dToCenter        = computeRunwayToCenter(spin, s, 'yaw');
        const aSymPerSec2      = computeSymmetricAccel(easeSec, desired, dToCenter);
        const aSymPerMs        = aSymPerSec2 / 1000;
        const planCapPerMs     = (spin.yawPlanCapPerMs > 0) ? spin.yawPlanCapPerMs : Infinity;
        const aMaxPerMs        = Math.min(aSymPerMs, planCapPerMs);

        const aNomPerMs        = (desired - v) / easeMs;
        const aPerMs           = Math.sign(aNomPerMs) * Math.min(Math.abs(aNomPerMs), aMaxPerMs);
        spin.yawA = aPerMs;

        diagSampledLog('yaw-retarget-rev-accel', () => {
            console.log(`[DIAG] YAW RETARGET (rev-accel) dCenter=${Number.isFinite(dToCenter)?dToCenter.toFixed(4):'âˆž'} `
                + `aSym=${aSymPerSec2.toFixed(6)}(/s^2) planCap=${planCapPerMs.toFixed(6)}(/ms) set A=${aPerMs.toFixed(6)}(/ms) `
                + `v=${v.toFixed(4)} desired=${desired.toFixed(4)}`);
        });
    }

    spin._yawSpeedAppliedVer = spin._yawSpeedVer;
    return true;
}


// Boundary handling functions
// Boundary handling functions â€” Yaw (with aApply/aTrigger + dt-swept runway; no lateMargin)
function handleYawBounce(spin, s) {
    // Normalize to [-Ï€, Ï€] and compute offset from base
    let theta = s.theta;
    while (theta > Math.PI)  theta -= 2 * Math.PI;
    while (theta < -Math.PI) theta += 2 * Math.PI;
    const dAz = shortestAngleDiff(theta, spin.baseAz);

    // 1) Already beyond the limit? (hard-limit branch)
    if (Math.abs(dAz) > spin.yawLimit) {
        const movingInward = (dAz * spin.curYawVel) < 0;
        if (movingInward) {
            diagSampledLog('yaw-bounce-inward', () => {
                console.log(`[DIAG] YAW BOUNCE beyond limit but moving inward; skip clamp. dAz=${dAz.toFixed(4)} curVel=${spin.curYawVel.toFixed(4)}`);
            });
            // Ensure desired direction aims inward toward base
            spin.yawDir = -Math.sign(dAz);
            return;
        }

        // --- SOFT OVERSHOOT: crossed the boundary this frame by <= v*dt*k ---
        const dtPrev = spin._lastDt || 0;  // stepSpin stores this before calling handleYawBounce
        const thetaPrev = s.theta - (spin.curYawVel * dtPrev);
        let thetaN = thetaPrev;
        while (thetaN > Math.PI)  thetaN -= 2 * Math.PI;
        while (thetaN < -Math.PI) thetaN += 2 * Math.PI;
        const dAzPrev = shortestAngleDiff(thetaN, spin.baseAz);

        const wasInside = Math.abs(dAzPrev) <= spin.yawLimit + (config.YAW_EPS_ANG || 0);
        const overshoot = Math.abs(dAz) - spin.yawLimit;
        const swept = Math.abs(spin.curYawVel) * dtPrev * (config.YAW_SOFT_OVERSHOOT_MULT ?? 1.0);
        const epsSoftLog = (config.YAW_SOFT_OVERSHOOT_EPS_LOGGING || 0);
        const isTieForLog = (epsSoftLog > 0) && (Math.abs(overshoot - swept) <= epsSoftLog);

        if (wasInside && overshoot <= swept + (config.YAW_EPS_ANG || 0)) {
            // Treat as a predictive reversal at the boundary (no hard slam)
            if (!isTieForLog) {
                diagSampledLog('yaw-soft-overshoot', () => {
                    console.log(`[DIAG] YAW SOFT OVERSHOOT: overshoot=${overshoot.toFixed(5)} <= swept=${swept.toFixed(5)}; ` +
                        `dt=${dtPrev.toFixed(5)} curVel=${spin.curYawVel.toFixed(4)} state=${spin.yawState}`);
                });
            }

            // Snap position to boundary, but preserve outward velocity profile
            s.theta = spin.baseAz + Math.sign(dAz) * spin.yawLimit;
            if (spin.yawState === 'eYaw_IncreaseVelToSteadyState') {
                // Keep current outward vel rather than jumping to full steady
                spin.yawTransitionVel = spin.curYawVel;
                spin.yawA = 0;
                spin.yawState = 'eYaw_SteadyStateVel';
            }

            // Plan reversal with the same center-runway sizing you use in hard clamp
            const easeSec = Math.max(0, config.DEFAULT_EASE_TIME_MS) / 1000;
            const dCenter = Math.max(0, spin.yawLimit);
            const aTime   = Math.abs(spin.yawSpeed) / Math.max(easeSec, 1e-6);
            const aSym    = (Math.abs(spin.yawSpeed) * Math.abs(spin.yawSpeed)) / Math.max(dCenter, 1e-9);
            const aApply  = Math.max(aTime, aSym);

            if (!isTieForLog) {
                diagSampledLog('yaw-soft-overshoot-plan', () => {
                    const stopping = (spin.yawState === 'eYaw_DecreaseVelToZero' || spin.yawState === 'eYaw_SteadyStateZero' || !spin.yawDesiredRunning || Math.abs(spin.yawSpeed) <= (config.YAW_EPS_VEL || 0));
                    const msg = (spin.yawState === 'eYaw_ReverseDirection')
                        ? 'reuse reversal plan (already reversing)'
                        : (stopping ? 'clamp-only (stopping)' : 'plan reversal');
                    console.log(`[DIAG] YAW SOFT OVERSHOOT -> ${msg}: dCenter=${dCenter.toFixed(4)} aTime=${aTime.toFixed(6)} aSym=${aSym.toFixed(6)} aApply=${aApply.toFixed(6)}`);
                });
            }

            const stopping = (spin.yawState === 'eYaw_DecreaseVelToZero' || spin.yawState === 'eYaw_SteadyStateZero' || !spin.yawDesiredRunning || Math.abs(spin.yawSpeed) <= (config.YAW_EPS_VEL || 0));
            if (stopping) {
                // Aim inward for later, keep decelerating via FSM; no reversal init here
                spin.yawDir = -Math.sign(dAz);
            } else if (spin.yawState === 'eYaw_ReverseDirection') {
                // Already reversing: preserve/raise plan cap, do not re-initiate
                const capMs = aApply / 1000;
                if (capMs > 0) spin.yawPlanCapPerMs = Math.max(spin.yawPlanCapPerMs || 0, capMs);

                // Ensure desired direction is inward while clamped at boundary
                // so that any snap/accel moves off the limit toward center.
                spin.yawDir = -Math.sign(dAz);

                // Near-zero completion snap at clamp: finalize reversal or zero
                const epsV = (config.YAW_EPS_VEL || 0);
                if (Math.abs(spin.curYawVel) <= epsV) {
                    if (Math.abs(spin.yawSpeed) > epsV) {
                        spin.yawTransitionVel = spin.yawDir * spin.yawSpeed;
                        spin.yawA = 0;
                        spin.yawState = 'eYaw_SteadyStateVel';
                        diagSampledLog('yaw-soft-overshoot-snap', () => {
                            console.log(`[DIAG] YAW SOFT OVERSHOOT snap: set reversed steady vel=${spin.yawTransitionVel.toFixed(4)}`);
                        });
                    } else {
                        spin.yawTransitionVel = 0;
                        spin.yawA = 0;
                        spin.yawState = 'eYaw_SteadyStateZero';
                        diagSampledLog('yaw-soft-overshoot-snap', () => {
                            console.log(`[DIAG] YAW SOFT OVERSHOOT snap: set zero at clamp`);
                        });
                    }
                    spin.yawPlanCapPerMs = 0;
                    return;
                }

                // While clamped and reversing, accelerate toward inward desired (fast departure)
                const easeSecB = Math.max(0, config.DEFAULT_EASE_TIME_MS) / 1000;
                const easeMsB  = Math.max(0, config.DEFAULT_EASE_TIME_MS);
                const easeMult = (config.YAW_CLAMP_EASE_MULT ?? 1.0);
                const easeMsEff= Math.max(1e-6, easeMsB * easeMult);
                const desired  = spin.yawDir * spin.yawSpeed;
                const vNow     = spin.curYawVel || 0;

                // CEILING from geometry + plan cap (mirror retarget-rev-accel)
                const dToCenter        = computeRunwayToCenter(spin, s, 'yaw');
                const aSymPerSec2      = computeSymmetricAccel(easeSecB, desired, dToCenter);
                const aSymPerMs        = aSymPerSec2 / 1000;
                const planCapPerMs     = (spin.yawPlanCapPerMs > 0) ? spin.yawPlanCapPerMs : Infinity;
                const capMult          = (config.YAW_CLAMP_PLAN_CAP_MULT ?? 1.0);
                const aMaxPerMs        = Math.min(aSymPerMs, planCapPerMs * capMult);

                const aNomPerMs        = (desired - vNow) / easeMsEff;
                const aPerMs           = Math.sign(aNomPerMs) * Math.min(Math.abs(aNomPerMs), aMaxPerMs);
                spin.yawA = aPerMs;

                diagSampledLog('yaw-soft-overshoot-accel', () => {
                    console.log(`[DIAG] YAW SOFT OVERSHOOT accel while clamped: capMult=${(config.YAW_CLAMP_PLAN_CAP_MULT ?? 1.0)} easeMult=${(config.YAW_CLAMP_EASE_MULT ?? 1.0)} dCenter=${Number.isFinite(dToCenter)?dToCenter.toFixed(4):'∞'} `
                        + `aSym=${aSymPerSec2.toFixed(6)}(/s^2) planCap=${planCapPerMs.toFixed(6)}(/ms) set A=${aPerMs.toFixed(6)}(/ms) `
                        + `v=${vNow.toFixed(4)} desired=${desired.toFixed(4)}`);
                });
            } else if (spin.yawState === 'eYaw_SteadyStateVel') {
                // At clamp while steady: retarget inward; avoid re-initiating reversal
                spin.yawDir = -Math.sign(dAz);
                diagSampledLog('yaw-soft-overshoot-steady-retarget', () => {
                    console.log(`[DIAG] YAW SOFT OVERSHOOT steady → retarget inward; no re-init`);
                });
            } else {
                // Normal case: initiate reversal with computed runway-aware accel
                initiateReversal(spin, 'yaw', aApply);
            }
            return; // handled softly; skip hard-limit branch
        }

        // --- HARD overshoot (fallback): existing behavior continues below ---
        // Hard clamp at boundary, zero outward vel, immediately plan a reversal using center-runway accel
        diagSampledLog('yaw-bounce-hard', () => {
            console.log(`[DIAG] YAW BOUNCE HARD LIMIT HIT! dAz=${dAz.toFixed(4)} limit=${spin.yawLimit.toFixed(4)} - clamping + immediate reversal`);
        });
        s.theta = spin.baseAz + Math.sign(dAz) * spin.yawLimit;
        spin.yawTransitionVel = 0;
        spin.curYawVel = 0;

        // Plan a reversal using center-runway + base distance (same as your baseline)
        const easeSec = Math.max(0, config.DEFAULT_EASE_TIME_MS) / 1000;
        const dCenter = Math.max(0, spin.yawLimit);
        const aTime   = Math.abs(spin.yawSpeed) / Math.max(easeSec, 1e-6);
        const aSym    = (Math.abs(spin.yawSpeed) * Math.abs(spin.yawSpeed)) / Math.max(dCenter, 1e-9);
        const aApply  = Math.max(aTime, aSym);

        diagSampledLog('yaw-overshoot-center-runway', () => {
            console.log(`[DIAG] YAW OVERSHOOT + reversal plan: dCenter=${dCenter.toFixed(4)} aTime=${aTime.toFixed(6)} aSym=${aSym.toFixed(6)} aApply=${aApply.toFixed(6)}`);
        }, true);

        initiateReversal(spin, 'yaw', aApply);
        return;
    }
    // 2) Predictive reversal: only when in steady or accelerating toward outward limit
    if (spin.yawState !== 'eYaw_SteadyStateVel' && spin.yawState !== 'eYaw_IncreaseVelToSteadyState') return;

    const easeSec = Math.max(0, config.DEFAULT_EASE_TIME_MS) / 1000;
    if (!(easeSec > 0 && spin.curYawVel !== 0)) return;

    // Geom + outward test
    const velSign      = Math.sign(spin.curYawVel);
    const dOut         = computeOutwardRunway(spin, s, 'yaw');
    const movingOutward= (velSign !== 0) && (Math.sign(dAz) === velSign);

    // dt-swept runway: anticipate one integration step so predictive can fire *before* a hop
    const dt        = spin._lastDt || 0;
    const leadMult  = (config.YAW_PREDICTIVE_LEAD_MULT ?? 1.0);
    const lead      = Math.abs(spin.curYawVel) * dt * leadMult;
    const dOutEff   = Math.max(0, dOut - lead);

    // aApply = the plan accel magnitude we will actually execute (unchanged profile)
    // keep your baseline: symmetric/target-based during accel (half-runway), braking while steady
    const aApply = (spin.yawState === 'eYaw_IncreaseVelToSteadyState')
        ? computeAccelMax(easeSec, Math.abs(spin.yawSpeed), dOut / 2)
        : computeAccelMax(easeSec, spin.curYawVel,            dOut);

    // aTrigger = decision-only accel for stop-distance; apply base/drag tweaks (if any)
    const T_base = (config.YAW_TRIGGER_TWEAK_BASE ?? config.YAW_PREDICTIVE_ACCEL_TWEAK ?? 0.95);
    const dragActive = !!(spin._yawDragActive || spin._dragActive); // optional UI flag; ignore if unused
    const T_drag = dragActive ? (config.YAW_TRIGGER_TWEAK_DRAG ?? 1.00) : 1.00;
    const aTrigger = aApply * T_base * T_drag;

    diagSampledLog('yaw-predictive', () => {
        console.log(`[DIAG] YAW predictive dOut=${dOut.toFixed(4)} dOutEff=${dOutEff.toFixed(4)} `
            + `aApply=${aApply.toFixed(6)} aTrigger=${aTrigger.toFixed(6)} `
            + `vCur=${spin.curYawVel.toFixed(4)} tweak=${(T_base*T_drag).toFixed(3)} state=${spin.yawState}`);
    });

    // Stop-distance with aTrigger; no lateMargin in yaw
    const stopDist = (spin.curYawVel * spin.curYawVel) / (2 * Math.max(aTrigger, config.YAW_EPS_VEL));

    if (movingOutward && dOutEff <= stopDist + config.YAW_EPS_ANG) {
        diagSampledLog('yaw-bounce-init-reversal', () => {
            console.log(`[DIAG] YAW predictive reversal: dOutEff=${dOutEff.toFixed(4)} stopDist=${stopDist.toFixed(4)} `
                + `aApply=${aApply.toFixed(6)} state=${spin.yawState}`);
        });

        // If accelerating state, preserve current outward vel by switching to steady first (your baseline pattern)
        if (spin.yawState === 'eYaw_IncreaseVelToSteadyState') {
            spin.yawTransitionVel = spin.curYawVel;
            spin.yawA = 0;
            spin.yawState = 'eYaw_SteadyStateVel';
        }
        // Execute reversal with the *plan* acceleration (aApply). Only the decision used aTrigger.
        initiateReversal(spin, 'yaw', aApply);
    }
}



function handlePitchBounce(spin, s, dt) {
    const dPol = s.phi - spin.basePol;
    
    if (Math.abs(dPol) > spin.pitchLimit) {
        // Determine if motion is inward (back toward basePol) or outward
        // Inward when dPol and current velocity have opposite signs
        const movingInward = (dPol * spin.curPitchVel) < 0;
        if (movingInward) {
            diagSampledLog('pitch-bounce-inward', () => {
                console.log(`[DIAG] PITCH BOUNCE Beyond anim limit but moving inward; skipping clamp. dPol=${dPol.toFixed(4)}, curVel=${spin.curPitchVel.toFixed(4)}`);
            });
            // Ensure desired direction aims inward toward base
            spin.pitchDir = Math.sign(dPol);
            // Do not clamp phi; allow smooth return via FSM/easing
        } else {
            diagSampledLog('pitch-bounce-hard', () => {
                console.log(`[DIAG] PITCH BOUNCE HARD LIMIT HIT! dPol=${dPol.toFixed(4)}, limit=${spin.pitchLimit.toFixed(4)}, clamping phi + initiating immediate reversal`);
            });
            spin.pitchBounceCount = (spin.pitchBounceCount || 0) + 1;
            s.phi = spin.basePol + Math.sign(dPol) * spin.pitchLimit;
            // Reset velocity at the hard boundary to avoid sitting with outward velocity while clamped
            spin.pitchTransitionVel = 0;
            spin.curPitchVel = 0;
            // Immediately initiate reversal with runway-aware accel toward center of motion
            const easeSec = Math.max(0, config.DEFAULT_EASE_TIME_MS) / 1000;
            const dRunway = Math.max(0, spin.pitchLimit); // distance from boundary to center
            const aTime = Math.abs(spin.pitchSpeed) / Math.max(easeSec, 1e-6);
            const aSym = (Math.abs(spin.pitchSpeed) * Math.abs(spin.pitchSpeed)) / Math.max(dRunway, 1e-9);
            const aUsed = Math.max(aTime, aSym);
            diagSampledLog('pitch-overshoot-aUsed', () => {
                console.log(`[DIAG] PITCH aUsed(overshoot) bounce#${spin.pitchBounceCount} dCenter=${dRunway.toFixed(4)} aTime=${aTime.toFixed(6)} aSym=${aSym.toFixed(6)} aUse=${aUsed.toFixed(6)}`);
            }, true);
            diagSampledLog('pitch-overshoot-center-runway', () => {
                const aTime = Math.abs(spin.pitchSpeed) / Math.max(easeSec, 1e-6);
                console.log(`[DIAG] PITCH OVERSHOOT using center-runway: dRunway=${dRunway.toFixed(4)}, aTime=${aTime.toFixed(6)}, aUsed=${aUsed.toFixed(6)}`);
            }, true);
            initiateReversal(spin, 'pitch', aUsed);
        }
    } else if (spin.pitchState === 'ePitch_SteadyStateVel' || 
               spin.pitchState === 'ePitch_IncreaseVelToSteadyState') {
        // Predictive reversal trigger using runway accel based on CURRENT velocity
        const easeSec = Math.max(0, config.DEFAULT_EASE_TIME_MS) / 1000;
        if (easeSec > 0 && spin.curPitchVel !== 0) {
            const velSign = Math.sign(spin.curPitchVel);
            const dOut = computeOutwardRunway(spin, s, 'pitch');
            const movingOutward = velSign !== 0 && Math.sign(dPol) === velSign;
            // Use symmetric target-speed plan while accelerating; braking plan when steady
            const aUsed = (spin.pitchState === 'ePitch_IncreaseVelToSteadyState')
                ? computeAccelMax(easeSec, Math.abs(spin.pitchSpeed), dOut / 2)
                : computeAccelMax(easeSec, spin.curPitchVel, dOut);
            const forcePredLog = ((spin.pitchBounceCount|0) === 0) && !spin._pitchPredictiveAUsedLogged;
            diagSampledLog('pitch-predictive-aUsed', () => {
                if (spin.pitchState === 'ePitch_IncreaseVelToSteadyState') {
                    const aTimeT = (Math.abs(spin.pitchSpeed)/Math.max(easeSec,1e-6)).toFixed(6);
                    const aRunwaySym = ((Math.abs(spin.pitchSpeed)*Math.abs(spin.pitchSpeed))/Math.max(dOut,1e-9)).toFixed(6);
                    console.log(`[DIAG] PITCH aUsed(predictive SYM) bounce#${spin.pitchBounceCount} dOut=${dOut.toFixed(4)} vTarget=${Math.abs(spin.pitchSpeed).toFixed(4)} aTimeT=${aTimeT} aRunwaySym=${aRunwaySym} aUse=${aUsed.toFixed(6)} state=${spin.pitchState}`);
                } else {
                    console.log(`[DIAG] PITCH aUsed(predictive BRAKE) bounce#${spin.pitchBounceCount} dOut=${dOut.toFixed(4)} vCur=${spin.curPitchVel.toFixed(4)} aTime=${(Math.abs(spin.curPitchVel)/Math.max(easeSec,1e-6)).toFixed(6)} aRunway=${((Math.abs(spin.curPitchVel)*Math.abs(spin.curPitchVel))/(2*Math.max(dOut,1e-9))).toFixed(6)} aUse=${aUsed.toFixed(6)} state=${spin.pitchState}`);
                }
                if (forcePredLog) spin._pitchPredictiveAUsedLogged = true;
            }, forcePredLog);
            const lateMargin = (config.ENABLE_PITCH_LATE_MARGIN && spin.pitchState === 'ePitch_SteadyStateVel')
                ? Math.abs(spin.curPitchVel) * (dt || 0) * (config.PITCH_PREDICTIVE_LATE_MARGIN_MULT || 1)
                : 0;
            const stopDist = (spin.curPitchVel * spin.curPitchVel) / (2 * Math.max(aUsed, config.PITCH_EPS_VEL));
            if (movingOutward && dOut + lateMargin <= stopDist + config.PITCH_EPS_ANG) {
                const forceInitLog = ((spin.pitchBounceCount|0) === 0) && !spin._pitchInitRevLogged;
                diagSampledLog('pitch-bounce-init-reversal', () => {
                    console.log(`[DIAG] PITCH BOUNCE Initiating reversal: dPol=${dPol.toFixed(4)}, runway=${dOut.toFixed(4)}, stopDist=${stopDist.toFixed(4)}, aUsed=${aUsed.toFixed(6)}, lateMargin=${lateMargin.toFixed(4)}, state=${spin.pitchState}`);
                    if (forceInitLog) spin._pitchInitRevLogged = true;
                }, forceInitLog);
                if (spin.pitchState === 'ePitch_IncreaseVelToSteadyState') {
                    // Preserve current outward velocity instead of jumping to full steady
                    spin.pitchTransitionVel = spin.curPitchVel;
                    spin.pitchA = 0;
                    spin.pitchState = 'ePitch_SteadyStateVel';
                }
                initiateReversal(spin, 'pitch', aUsed);
            }
        }
    }
}

function handlePanBounce(spin, target) {
    const dx = target.x - spin.baseTarget.x;
    const dy = target.y - spin.baseTarget.y;
    
    if (Math.abs(dx) > spin.panLimitX) {
        spin.panDirX = -Math.sign(dx);
        if (spin.panXState === 'ePanX_SteadyStateVel') {
            initiateReversal(spin, 'panX');
        }
    }
    
    if (Math.abs(dy) > spin.panLimitY) {
        spin.panDirY = -Math.sign(dy);
        if (spin.panYState === 'ePanY_SteadyStateVel') {
            initiateReversal(spin, 'panY');
        }
    }
}

function handleZoomBounce(spin, distance) {
    if (distance <= spin.zoomMin || distance >= spin.zoomMax) {
        const mid = (spin.zoomMax + spin.zoomMin) / 2;
        spin.zoomDir = Math.sign(mid - distance);
        if (spin.zoomState === 'eZoom_SteadyStateVel') {
            initiateReversal(spin, 'zoom');
        }
    }
}

function initiateReversal(spin, param, accelOverrideRadPerSec2) {
    const paramMap = {
        yaw: { prefix: 'yaw', dir: spin.yawDir, speed: spin.yawSpeed },
        pitch: { prefix: 'pitch', dir: -spin.pitchDir, speed: spin.pitchSpeed },
        panX: { prefix: 'panX', dir: spin.panDirX, speed: spin.panSpeedX },
        panY: { prefix: 'panY', dir: spin.panDirY, speed: spin.panSpeedY },
        zoom: { prefix: 'zoom', dir: spin.zoomDir, speed: spin.zoomSpeed }
    };
    
    const p = paramMap[param];
    const prefix = p.prefix;
    const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    
    spin[`${prefix}State`] = `e${capPrefix}_ReverseDirection`;
    spin[`${prefix}Dir`] = -spin[`${prefix}Dir`];
    
    const newDesired = p.dir * p.speed * -1; // Reversed direction
    const curVel = spin[`${prefix}TransitionVel`];
    const totalDeltaV = Math.abs(newDesired - curVel);
    const easeMs = Math.max(0, config.DEFAULT_EASE_TIME_MS);
    
    if (easeMs === 0) {
        spin[`${prefix}TransitionVel`] = newDesired;
        spin[`${prefix}A`] = 0;
        spin[`${prefix}State`] = `e${capPrefix}_SteadyStateVel`;
    } else {
        if (Number.isFinite(accelOverrideRadPerSec2) && accelOverrideRadPerSec2 > 0) {
            // Use runway-aware acceleration magnitude (convert from per-sec^2 to per-ms)
            spin[`${prefix}A`] = Math.sign(newDesired - curVel) * (accelOverrideRadPerSec2 / 1000);
        } else {
            spin[`${prefix}A`] = Math.sign(newDesired - curVel) * (totalDeltaV / easeMs);
        }
        if (param === 'yaw') {
            // Center-runway based entry cap for reversing segment (per-ms)
            const easeSec = Math.max(0, config.DEFAULT_EASE_TIME_MS) / 1000;
            const dCenter = Math.max(0, spin.yawLimit);
            const aTime   = Math.abs(spin.yawSpeed) / Math.max(easeSec, 1e-6);
            const aSym    = (Math.abs(spin.yawSpeed) * Math.abs(spin.yawSpeed)) / Math.max(dCenter, 1e-9);
            const entryCapMs = Math.max(aTime, aSym) / 1000;
            spin.yawPlanCapPerMs = Math.max(spin.yawPlanCapPerMs || 0, entryCapMs);
        }
    }
}

/**
 * Resume animation after user interaction
 * @param {Object} spin - Animation state
 * @param {THREE.Camera} camera - Camera
 * @param {OrbitControls} controls - Controls
 */
export function resumeAnimationAfterInteraction(spin, camera, controls) {
    spin.paused = false;
    spin._debug_just_resumed = true;
    
    // Determine recovery direction BEFORE resetting FSMs
    const tmpOffset = new THREE.Vector3();
    const tmpSpherical = new THREE.Spherical();
    tmpOffset.copy(camera.position).sub(controls.target);
    tmpSpherical.setFromVector3(tmpOffset);
    
    // Defensive: validate/fallback anchors and limits (rare misconfig cases)
    if (!Number.isFinite(spin.baseAz)) {
        spin.baseAz = tmpSpherical.theta;
    }
    if (!Number.isFinite(spin.yawLimit) || spin.yawLimit <= 0) {
        spin.yawLimit = THREE.MathUtils.degToRad(config.DEFAULT_YAW_LIMIT_DEG);
    }
    if (!Number.isFinite(spin.basePol) || spin.basePol <= 0 || spin.basePol >= Math.PI) {
        const safePhi = Math.max(0.01, Math.min(Math.PI - 0.01, tmpSpherical.phi));
        spin.basePol = Number.isFinite(safePhi) ? safePhi : Math.PI / 2;
    }
    if (!Number.isFinite(spin.pitchLimit) || spin.pitchLimit <= 0 || spin.pitchLimit >= Math.PI) {
        const defaultPitchLimit = THREE.MathUtils.degToRad(config.DEFAULT_PITCH_LIMIT_DEG);
        spin.pitchLimit = Math.max(0.01, Math.min(defaultPitchLimit, Math.PI - 0.02));
    }
    
    let theta = tmpSpherical.theta;
    while (theta > Math.PI) theta -= 2 * Math.PI;
    while (theta < -Math.PI) theta += 2 * Math.PI;
    const dAz = shortestAngleDiff(theta, spin.baseAz);

    // Diagnostics: log pitch center and deltas on resume
    diagSampledLog('pitch-resume', () => {
        const dPol = tmpSpherical.phi - spin.basePol;
        const toDeg = (r) => THREE.MathUtils.radToDeg(r);
        console.log(`[DIAG] PITCH RESUME basePol=${spin.basePol.toFixed(4)}rad (${toDeg(spin.basePol).toFixed(1)}Â°), ` +
            `curPhi=${tmpSpherical.phi.toFixed(4)}rad (${toDeg(tmpSpherical.phi).toFixed(1)}Â°), ` +
            `dPol=${dPol.toFixed(4)}rad (${toDeg(dPol).toFixed(1)}Â°), ` +
            `pitchLimit=${spin.pitchLimit.toFixed(4)}rad (${toDeg(spin.pitchLimit).toFixed(1)}Â°)`);
    });
    
    if (Math.abs(dAz) > spin.yawLimit) {
        spin.yawDir = -Math.sign(dAz);
    }
    
    const dPol = tmpSpherical.phi - spin.basePol;
    if (Math.abs(dPol) > spin.pitchLimit) {
        spin.pitchDir = Math.sign(dPol);
    }
    
    const dist = tmpOffset.length();
    if (dist > spin.zoomMax || dist < spin.zoomMin) {
        const mid = (spin.zoomMax + spin.zoomMin) / 2;
        spin.zoomDir = Math.sign(mid - dist);
    }
    
    // Restart FSMs to accelerate from zero
    spin.yawState = 'eYaw_SteadyStateZero';
    spin.pitchState = 'ePitch_SteadyStateZero';
    spin.panXState = 'ePanX_SteadyStateZero';
    spin.panYState = 'ePanY_SteadyStateZero';
    spin.zoomState = 'eZoom_SteadyStateZero';
    
    // Trigger acceleration from zero to steady
    spin.yawDesiredRunning = true;
    spin.pitchDesiredRunning = true;
    spin.panXDesiredRunning = true;
    spin.panYDesiredRunning = true;
    spin.zoomDesiredRunning = true;
}



