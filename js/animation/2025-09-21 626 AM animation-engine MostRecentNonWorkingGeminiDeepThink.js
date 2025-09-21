/*
Filename: animation-engine.js
Patch: N (Method 2: Internal State, Predictive Overshoot Check, and Sub-Frame Stop)
*/

import * as THREE from 'three';
import * as config from '../config.js';
import { shortestAngleDiff } from '../utils/geometry-utils.js';

// --- Utility Functions (No changes) ---
let DEBUG_ANIM_ENABLED = config.DEFAULT_DEBUG_ANIM;
let DEBUG_SAMPLE_EVERY = Math.max(1, config.DEFAULT_DEBUG_SAMPLE_EVERY || 500);
const _diagLast = Object.create(null);

function diag(tag, fn, force=false) {
  if (!config.DEFAULT_DIAGNOSTICS_ENABLED) return;
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const interval = Math.max(0, config.DEFAULT_DIAGNOSTICS_SAMPLE_MS || 0);
  const last = _diagLast[tag] || 0;
  if (force || now - last >= interval) {
    _diagLast[tag] = now;
    try { fn(); } catch {}
  }
}

let __frameCount = 0;
function dbg(tag, fn) {
  if (!DEBUG_ANIM_ENABLED) return;
  if ((__frameCount % DEBUG_SAMPLE_EVERY) !== 0) return;
  try { fn(); } catch {}
}

export function setDebugMode(enabled) { DEBUG_ANIM_ENABLED = !!enabled; }


// --- createAnimationState (Patch N: Added internal offset storage) ---
export function createAnimationState() {
  const state = {
    enabled: config.DEFAULT_SPIN_ENABLED,
    paused: false,
    startTime: 0,

    // Base position (Center of animation)
    baseAz: 0,
    basePol: Math.PI / 2,
    baseTarget: new THREE.Vector3(0, 0, 0),
    baseDistance: 100, // Assuming this is the initial radius

    // PATCH N: Internal state for offsets (Source of truth for physics)
    // Convention: These store the "axis state".
    currentYawOffset: THREE.MathUtils.degToRad(config.DEFAULT_START_YAW_DEG || 0),
    // Positive pitch offset means moving "up" (decreasing phi).
    currentPitchOffset: THREE.MathUtils.degToRad(config.DEFAULT_START_PITCH_DEG || 0),
    // (Pan and Zoom internal state would also be added here if implemented)

    // Velocities (Internal state)
    curYawVel: 0,
    curPitchVel: 0,
    curPanXVel: 0,
    curPanYVel: 0,
    curZoomVel: 0,

    // Speeds (V_Max)
    yawSpeed:   THREE.MathUtils.degToRad(config.DEFAULT_YAW_SPEED_DEG),
    pitchSpeed: THREE.MathUtils.degToRad(config.DEFAULT_PITCH_SPEED_DEG),
    // ... (other speeds omitted for brevity)

    // Limits
    yawLimit:   THREE.MathUtils.degToRad(config.DEFAULT_YAW_LIMIT_DEG),
    pitchLimit: THREE.MathUtils.degToRad(config.DEFAULT_PITCH_LIMIT_DEG),
    // ... (other limits omitted)

    // Directions
    yawDir:   config.DEFAULT_START_YAW_DIR,
    pitchDir: config.DEFAULT_START_PITCH_DIR,
    // ... (other directions omitted)

    // Running flags
    yawDesiredRunning:   true,
    pitchDesiredRunning: true,
    panXDesiredRunning:  false,
    panYDesiredRunning:  false,
    zoomDesiredRunning:  false
  };

  return state;
}


// ---- Per-axis integrator (Patch N) ----
function stepAxisBackAndForth(axisName, axis, dt, params) {
  const {
    limit, tauSec, epsPos, epsVel,
    recoverAccelMin = 0.5
  } = params;

  const sgn = (x) => (x>0) - (x<0);
  const abs = Math.abs;
  const tau = Math.max(1e-6, tauSec);
  const _epsPos = epsPos || 1e-9;
  const _epsVel = epsVel || 1e-6;

  // 1. Initialization and State (Relies on internal state provided in 'axis')
  if (!Number.isFinite(axis.offset)) axis.offset = 0;
  if (!Number.isFinite(axis.v))      axis.v      = 0;

  const oldOffset = axis.offset;
  const oldV = axis.v;

  const dIn = limit - abs(axis.offset); // Physical distance remaining
  const outside = dIn < 0;
  const sOff = sgn(axis.offset) || (sgn(oldOffset) || 1);

  const V_Max = Math.max(0, axis.speedTarget || 0);
  const V_current_mag = Math.abs(oldV);
  // aNominal used for inward motion and recovery.
  const aNominal = Math.max(recoverAccelMin, V_Max / tau);

  let acceleration = 0;
  let status = "Idle";
  let isAcceleratingTowardsVMax = false;
  let isBrakingTowardsBoundary = false; // PATCH N
  let skipIntegration = false;          // PATCH N

  // 2. Determine Commanded Direction
  let commandingOutward;
  if (abs(axis.offset) < _epsPos) {
      commandingOutward = true;
  } else {
      commandingOutward = (axis.dir === sOff);
  }

  // --- 3. Control Strategy Implementation (Method 2 Logic) ---

  if (outside) {
    // 3.1. Recovery
    status = "Recovering";
    axis.dir = -sOff;
    acceleration = -sOff * aNominal;

  } else if (commandingOutward) {
    // 3.2. Outward Motion (Method 2 Kinematics)
    const D_remaining = Math.max(0, dIn);

    if (D_remaining < _epsPos) {
        acceleration = 0;
        status = "At Boundary";
    } else {
        let a_magnitude;

        if (V_current_mag < V_Max) {
            // Scenario 1: Accelerate then Decelerate
            a_magnitude = (2 * V_Max*V_Max - V_current_mag*V_current_mag) / (2 * D_remaining);

            if (a_magnitude < _epsVel) {
                acceleration = 0;
                status = "M2 Coasting";
            } else {
                const D_decel_needed = (V_Max*V_Max) / (2 * a_magnitude);

                if (D_remaining >= D_decel_needed - _epsPos) {
                    acceleration = sOff * a_magnitude; // Accelerate outward
                    status = "M2 Accel";
                    isAcceleratingTowardsVMax = true;
                } else {
                    acceleration = -sOff * a_magnitude; // Decelerate
                    status = "M2 Decel (V<VM)";
                    isBrakingTowardsBoundary = true; // PATCH N
                }
            }
        } else {
            // Scenario 2: Decelerate Only (V_current >= V_Max)
            a_magnitude = (V_current_mag*V_current_mag) / (2 * D_remaining);
            acceleration = -sOff * a_magnitude; // Decelerate
            status = "M2 Decel (V>=VM)";
            isBrakingTowardsBoundary = true; // PATCH N
        }
    }

  } else {
    // 3.3. Inward Motion (Constant Acceleration)
    status = "Inward (Constant A)";

    if (V_current_mag < V_Max - _epsVel) {
        // Accelerate inward.
        acceleration = -sOff * aNominal;
        isAcceleratingTowardsVMax = true;
    } else if (V_current_mag > V_Max + _epsVel) {
        // Decelerate if going faster than V_Max. (Acceleration opposes inward velocity)
        acceleration = sOff * aNominal;
    } else {
        // Maintain speed
        acceleration = 0;
    }
  }

  // --- 4. Stability Measures ---
  const ACCEL_SAFETY_CAP = 1e6;

  // 4.1. PATCH N: Predictive Overshoot Check (Handles Issue 2)
  // Check if the calculated acceleration leads to an overshoot within this dt.
  if (!outside && dt > 0) {
    const movingOutward = (oldV !== 0) && (sgn(oldV) === sOff);

    if (movingOutward) {
        // Predict the distance traveled in this frame using the calculated acceleration
        const predictedDistance = oldV * dt + 0.5 * acceleration * dt * dt;

        // Check if the magnitude of travel exceeds the physical remaining runway (dIn)
        if (Math.abs(predictedDistance) > dIn + _epsPos) {
            // Overshoot predicted. Override with emergency braking (Method 2, Scenario 2).
            dbg(`${axisName}-emergency-brake`, () =>
                console.log(`[${axisName.toUpperCase()} WARN] Emergency brake engaged. dt too large. Status: ${status}`));

            // Use physical distance (dIn) for the braking calculation.
            const D_remaining_safe = Math.max(_epsPos, dIn); // Safe denominator
            const a_brake_mag = (V_current_mag * V_current_mag) / (2 * D_remaining_safe);

            // Apply braking acceleration (opposite to the direction of motion/sOff)
            acceleration = -sOff * a_brake_mag;
            status = "M2 Emergency Brake (dt)";
            // Update flags for subsequent checks
            isBrakingTowardsBoundary = true;
            isAcceleratingTowardsVMax = false;
        }
    }
  }

  // 4.2. Acceleration Safety Cap (Applied after predictive check)
  if (Math.abs(acceleration) > ACCEL_SAFETY_CAP) {
      acceleration = sgn(acceleration) * ACCEL_SAFETY_CAP;
      status += " (A-Cap)";
  }

  // 4.3. Velocity Capping (Prevent V_Max overshoot)
  if (dt > 0 && isAcceleratingTowardsVMax && V_Max > 0) {
    const v_new_predicted = oldV + acceleration * dt;

    if (Math.abs(v_new_predicted) > V_Max) {
        const target_v = sgn(v_new_predicted) * V_Max;
        acceleration = (target_v - oldV) / Math.max(dt, 1e-6);
        status += " (V-Cap)";
    }
  }

  // 4.4. PATCH N: Sub-frame Stop Handling (Handles Issue 3)
  // Prevents velocity reversal during braking when dt_stop < dt.
  if (dt > 0 && isBrakingTowardsBoundary && Math.abs(acceleration) > _epsVel) {
    const V_mag = Math.abs(oldV);
    // Calculate time required to reach V=0.
    const dt_stop = V_mag / Math.abs(acceleration);

    // Check if the stop occurs within this frame (use tiny tolerance)
    if (dt_stop <= dt + 1e-9) {
        // Calculate the exact stop position using dt_stop (not dt)
        const dt_stop_sq = dt_stop * dt_stop;
        let stopOffset = oldOffset + oldV * dt_stop + 0.5 * acceleration * dt_stop_sq;

        // Determine the boundary sign (sOff is reliable here as we are moving outward)
        const s = sOff;

        // Clamp to the boundary (handles numerical inaccuracies)
        if (Math.abs(stopOffset) > limit) {
            stopOffset = s * limit;
        }

        axis.offset = stopOffset;
        axis.v = 0;
        axis.dir = -s; // Flip direction inward

        dbg(`${axisName}-apex-subframe`, () =>
          console.log(`[${axisName.toUpperCase()} EVT] APEX(subframe) newDir=${axis.dir}. dt_stop=${dt_stop.toFixed(5)}, dt=${dt.toFixed(5)}`));

        skipIntegration = true;
    }
  }


  if (!skipIntegration) {
      // 5. Integration (Analytical Integration for Constant Acceleration)
      if (dt > 0) {
        // x_new = x + v_old*dt + 0.5*a*dt^2
        // v_new = v_old + a*dt
        axis.offset += oldV * dt + 0.5 * acceleration * dt * dt;
        axis.v      += acceleration * dt;
      }

      // --- 6. POST-APEX: Bounce Handling (Safety Nets) ---

      // 6.1. True crossing (Overshoot detection - Safety Net)
      const wasInside = Math.abs(oldOffset) <= limit + _epsPos;
      const isOutside_post = Math.abs(axis.offset) >  limit + _epsPos;

      if (isOutside_post && wasInside) {
        const s = sgn(axis.offset) || sOff;
        axis.offset = s * limit;
        axis.v = 0;
        axis.dir = -s;
        dbg(`${axisName}-apex-cross`, () =>
          // This should be extremely rare now.
          console.log(`[${axisName.toUpperCase()} EVT] APEX(cross) newDir=${axis.dir}. Overshoot detected (Safety Net).`));
        return;
      }

      // 6.2. Stagnation
      const nearBoundary = (limit - Math.abs(axis.offset)) <= _epsPos;
      const verySlow = Math.abs(axis.v) < _epsVel;

      if (nearBoundary && verySlow) {
        const s = sgn(axis.offset) || sOff;
        axis.offset = s * limit;
        axis.v = 0;

        if (axis.dir === s && V_Max > 0) {
            axis.dir = -s;
            dbg(`${axisName}-apex-stagnation`, () =>
                console.log(`[${axisName.toUpperCase()} EVT] APEX(stagnation) newDir=${axis.dir}`));
        }
      }
  }

  // 7. Diagnostics
  diag(`${axisName}-diag`, () => {
    const dNear = Math.abs(limit - Math.abs(axis.offset));
    // Note: a_prev and status_prev reflect the calculation based on the start of the frame.
    console.log(
      `[${axisName.toUpperCase()} DIAG] offset=${axis.offset.toFixed(5)}, v=${axis.v.toFixed(5)}, ` +
      `a_prev=${acceleration.toFixed(5)}, dir=${axis.dir}, dNear=${dNear.toFixed(5)}, V_Max=${V_Max.toFixed(3)}, status_prev=${status}, dt=${(dt||0).toFixed(5)}`
    );
  });
}


// (Patch N: stepSpin updated to use internal state)
export function stepSpin(spin, dt, camera, controls) {
  if (!spin.enabled) return;

  // If paused, we skip physics update (dt=0), but still update the camera
  // to match the internal state. This prevents drift if OrbitControls are active while paused.
  if (spin.paused) {
    dt = 0;
  }

  __frameCount++;

  // Setup target spherical coordinates based on the internal state after physics update.
  const tmpSpherical = new THREE.Spherical();
  tmpSpherical.radius = spin.baseDistance; // Placeholder for zoom
  tmpSpherical.phi = spin.basePol;
  tmpSpherical.theta = spin.baseAz;

  const easeTimeSec = Math.max(0, config.DEFAULT_EASE_TIME_MS)/1000;

  // YAW
  {
    // PATCH N: Use internal state as input for physics
    const axis = {
      offset: spin.currentYawOffset,
      v:      spin.curYawVel,
      dir:    spin.yawDir,
      speedTarget: spin.yawDesiredRunning ? spin.yawSpeed : 0
    };

    stepAxisBackAndForth('yaw', axis, dt, {
      limit:  spin.yawLimit,
      tauSec: easeTimeSec,
      epsPos: (config.YAW_EPS_ANG ?? 1e-4),
      epsVel: (config.YAW_EPS_VEL ?? 1e-6)
    });

    // PATCH N: Update internal state from physics output
    spin.currentYawOffset = axis.offset;
    spin.curYawVel = axis.v;
    spin.yawDir    = axis.dir;

    // Update spherical coordinates for rendering
    tmpSpherical.theta = spin.baseAz + axis.offset;
  }

  // PITCH
  const pitchSign = -1; // +dir (positive axis offset/velocity) means up (decreasing phi)
  {
    // PATCH N: Use internal state
    const axis = {
      offset: spin.currentPitchOffset,
      v:      spin.curPitchVel,
      dir:    spin.pitchDir,
      speedTarget: spin.pitchDesiredRunning ? spin.pitchSpeed : 0
    };

    stepAxisBackAndForth('pitch', axis, dt, {
      limit:  spin.pitchLimit,
      tauSec: easeTimeSec,
      epsPos: (config.PITCH_EPS_ANG ?? 1e-4),
      epsVel: (config.PITCH_EPS_VEL ?? 1e-6)
    });

    // PATCH N: Update internal state
    spin.currentPitchOffset = axis.offset;
    spin.curPitchVel = axis.v;
    spin.pitchDir    = axis.dir;

    // Update spherical coordinates for rendering
    // phi = basePol + pitchSign * offset
    tmpSpherical.phi = spin.basePol + pitchSign * axis.offset;
  }

  // Clamp phi
  tmpSpherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, tmpSpherical.phi));

  // Update camera position based on the final internal state
  const tmpOffset = new THREE.Vector3();
  tmpOffset.setFromSpherical(tmpSpherical);

  // Use controls.target as the center (allows user panning via OrbitControls to coexist)
  const centerTarget = controls.target;

  camera.position.copy(centerTarget).add(tmpOffset);

  // PAN & ZOOM sections omitted for brevity (They also require internal state management if implemented)

  camera.lookAt(centerTarget);
}


// (Patch N: resumeAnimationAfterInteraction updated to sync internal state from camera)
export function resumeAnimationAfterInteraction(spin, camera, controls) {
  spin.paused = false;

  // PATCH N: Read the current state from the camera (modified by OrbitControls)
  // and synchronize the internal physics state.

  const tmpOffset = new THREE.Vector3();
  const tmpSpherical = new THREE.Spherical();
  // Read position relative to the current controls target.
  tmpOffset.copy(camera.position).sub(controls.target);
  tmpSpherical.setFromVector3(tmpOffset);

  // YAW Synchronization
  let theta = tmpSpherical.theta;
  // Normalize theta
  while (theta > Math.PI) theta -= 2*Math.PI;
  while (theta < -Math.PI) theta += 2*Math.PI;

  const yawOffset = shortestAngleDiff(theta, spin.baseAz);
  spin.currentYawOffset = yawOffset; // Sync internal state

  // Determine new direction (inward)
  const sYaw = Math.sign(yawOffset || 0);
  spin.yawDir = (-sYaw) || (spin.yawDir || 1);

  // PITCH Synchronization
  const pitchOffsetRaw = tmpSpherical.phi - spin.basePol;
  const pitchSign = -1;
  const pitchAxisOff = pitchSign * pitchOffsetRaw;
  spin.currentPitchOffset = pitchAxisOff; // Sync internal state

  // Determine new direction (inward)
  const sPitch = Math.sign(pitchAxisOff || 0);
  spin.pitchDir = (-sPitch) || (spin.pitchDir || 1);

  // Reset velocities for robustness, as the velocity imparted by OrbitControls damping is unknown.
  spin.curYawVel = 0;
  spin.curPitchVel = 0;

  spin.yawDesiredRunning   = true;
  spin.pitchDesiredRunning = true;

  dbg('resume', () => {
    console.log(`[RESUME] yawOff=${yawOffset.toFixed(5)} yawDir=${spin.yawDir} ` +
                `pitchOff=${pitchAxisOff.toFixed(5)} pitchDir=${spin.pitchDir}`);
  });
}