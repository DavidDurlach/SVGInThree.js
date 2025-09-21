// Animation Engine (Patch B + logging restored)
// - Predictive test enters BRAKE (v*=0), does NOT flip dir; flip happens at apex.
// - Logging points reinstated and gated by config flags.
// - Drop-in replacement for the functions inside your current engine file.

import * as THREE from 'three';
import * as config from '../config.js';
import { shortestAngleDiff } from '../utils/geometry-utils.js';

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

export function createAnimationState() {
  return {
    enabled: config.DEFAULT_SPIN_ENABLED,
    paused: false,
    startTime: 0,

    baseAz: 0,
    basePol: Math.PI / 2,
    baseTarget: new THREE.Vector3(0, 0, 0),
    baseDistance: 100,

    curYawVel: 0,
    curPitchVel: 0,
    curPanXVel: 0,
    curPanYVel: 0,
    curZoomVel: 0,

    yawState: 'running',
    pitchState: 'running',

    yawSpeed:   THREE.MathUtils.degToRad(config.DEFAULT_YAW_SPEED_DEG),
    pitchSpeed: THREE.MathUtils.degToRad(config.DEFAULT_PITCH_SPEED_DEG),
    panSpeedX:  config.DEFAULT_PAN_SPEED_X,
    panSpeedY:  config.DEFAULT_PAN_SPEED_Y,
    zoomSpeed:  config.DEFAULT_ZOOM_SPEED,

    yawLimit:   THREE.MathUtils.degToRad(config.DEFAULT_YAW_LIMIT_DEG),
    pitchLimit: THREE.MathUtils.degToRad(config.DEFAULT_PITCH_LIMIT_DEG),
    panLimitX:  config.DEFAULT_PAN_LIMIT_X,
    panLimitY:  config.DEFAULT_PAN_LIMIT_Y,
    zoomMin:    config.DEFAULT_ZOOM_MIN,
    zoomMax:    config.DEFAULT_ZOOM_MAX,

    yawDir:   config.DEFAULT_START_YAW_DIR,
    pitchDir: config.DEFAULT_START_PITCH_DIR,
    panDirX:  config.DEFAULT_START_PAN_DIR_X,
    panDirY:  config.DEFAULT_START_PAN_DIR_Y,
    zoomDir:  config.DEFAULT_START_ZOOM_DIR,

    yawDesiredRunning:   true,
    pitchDesiredRunning: true,
    panXDesiredRunning:  false,
    panYDesiredRunning:  false,
    zoomDesiredRunning:  false
  };
}

// ---- Per-axis integrator (Patch H: predictive latch, outside-recover, velocity-scaled brake) ----
function stepAxisBackAndForth(axisName, axis, dt, params) {
  const {
    limit, tauSec, epsPos, epsVel,
    leadMult       = (config.PREDICTIVE_LEAD_MULT ?? 1.0),
    fallbackMult   = (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10),
    recoverAccelMin = (config.RECOVER_ACCEL_MIN ?? 0.75),  // rad/s^2 floor when outside/stalled
    recoverAccelMult= (config.RECOVER_ACCEL_MULT ?? 3.0)   // scales outside-recovery envelope
  } = params;

  const sgn = (x) => (x>0) - (x<0);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const abs = Math.abs;
  const tau = Math.max(1e-6, tauSec);

  if (!Number.isFinite(axis.offset)) axis.offset = 0;
  if (!Number.isFinite(axis.v))      axis.v      = 0;

  const oldOffset = axis.offset;
  const oldV      = axis.v;

  // Signed distance to boundary: >0 inside, <0 when outside
  const dIn = limit - abs(axis.offset);
  const outside = dIn < 0;
  const sOff = sgn(axis.offset) || (sgn(oldOffset) || 1);

  // Commanded speed and nominal accel scale (keep nonzero even if speedMag==0)
  const speedMag = Math.max(0, axis.speedTarget || 0);
  const vCmd     = (axis.dir || 1) * speedMag;
  const aNominal = Math.max(1e-6, speedMag / tau);

  // Envelope target
  let vStar;
  if (!outside) {
    const vEnv = Math.sqrt(2 * aNominal * dIn);
    vStar = clamp(vCmd, -vEnv, vEnv);
  } else {
    // Always drive inward when outside, even if command is zero
    const overshoot = -dIn; // >0
    const aRecover  = Math.max(aNominal, recoverAccelMin);
    const vRecover  = Math.sqrt(2 * recoverAccelMult * aRecover * overshoot);
    vStar = -sOff * Math.max(abs(vCmd), vRecover);
    axis.dir = -sOff; // keep subsequent commands inward while outside
  }

  // PRE-APEX: predictive latch (outward motion and close enough to boundary)
  const outwardVel = (axis.v !== 0) && (sgn(axis.v) === sOff);
  if (!outside && outwardVel) {
    // brake plan scales with both command (aNominal) and actual speed (aTime)
    const aTime      = abs(axis.v) / tau;
    const aBrakePlan = Math.max((config.BRAKE_ACCEL_CAP_MULT ?? 6) * aNominal,
                                (config.BRAKE_ACCEL_VFLOOR_MULT ?? 6) * aTime);
    const stopDist   = (axis.v * axis.v) / Math.max(2e-6, 2 * aBrakePlan);
    if (dIn <= leadMult * stopDist + (epsPos || 0)) {
      axis.offset = sOff * limit;
      axis.v = 0;
      axis.dir = -axis.dir;
      dbg(`${axisName}-apex-env`, () =>
        console.log(`[${axisName.toUpperCase()} EVT] APEX(env) newDir=${axis.dir}`));
      return;
    }
  }

  // Time-form accel toward v*, with an outward brake floor strong enough to stop
  let a = (vStar - axis.v) / tau;
  const braking = (axis.v !== 0) && ((vStar === 0) || ((axis.v>0)!==(vStar>0)));
  if (braking) {
    const dRem  = Math.max(0, dIn);             // remaining runway while still inside
    const aTime = abs(axis.v) / tau;            // accel equivalent of current speed
    let aRun    = (dRem > (epsPos || 0))
      ? ((axis.v*axis.v) / (2*dRem))            // enough to stop within dRem
      : (aTime * fallbackMult);                 // fallback when runway is ~0

    // Cap grows with BOTH aNominal and aTime (fixes under-braking when speedMag≈0)
    const aCap  = Math.max((config.BRAKE_ACCEL_CAP_MULT ?? 6) * aNominal,
                           (config.BRAKE_ACCEL_VFLOOR_MULT ?? 6) * aTime);
    const aRunC = Math.min(aRun, aCap);
    a = -sgn(axis.v) * Math.max(abs(a), aRunC);
  }

  // Integrate
  axis.v      += a * dt;
  axis.offset += axis.v * dt;

  // POST-APEX: true crossing this frame → clamp to boundary and flip
  const wasInside = Math.abs(oldOffset) <= limit + (epsPos || 0);
  const isOutside = Math.abs(axis.offset) >  limit + (epsPos || 0);
  if (isOutside && wasInside) {
    const s = sgn(axis.offset) || sOff;
    axis.offset = s * limit;
    axis.v = 0;
    axis.dir = -axis.dir;
    dbg(`${axisName}-apex-cross`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(cross) newDir=${axis.dir}`));
    return;
  }

  // POST-APEX: envelope apex while still moving outward — only when actually near boundary
  const outward_after = (axis.v !== 0) && (sgn(axis.v) === sOff);
  const nearBoundary2 = (limit - Math.abs(axis.offset)) <= (epsPos || 0);
  if (outward_after && nearBoundary2) { // (drop the nearVStar check)
    const s = sgn(axis.offset) || sOff;
    axis.offset = s * limit;
    axis.v = 0;
    axis.dir = -axis.dir;
    dbg(`${axisName}-apex-env`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(env) newDir=${axis.dir}`));
    return;
  }

  // Diagnostics (optional)
  diag(`${axisName}-diag`, () => {
    const dNear = Math.abs(limit - Math.abs(axis.offset));
    console.log(
      `[${axisName.toUpperCase()} DIAG] offset=${axis.offset}, v=${axis.v}, ` +
      `v*=${vStar}, dir=${axis.dir}, dNear=${dNear}, limit=${limit}`
    );
  });
}




// Path F with logging
export function stepSpin(spin, dt, camera, controls) {
  if (!spin.enabled || spin.paused) return;
  __frameCount++;

  const tmpOffset = new THREE.Vector3();
  const tmpSpherical = new THREE.Spherical();
  tmpOffset.copy(camera.position).sub(controls.target);
  tmpSpherical.setFromVector3(tmpOffset);

  // YAW
  {
    let theta = tmpSpherical.theta;
    while (theta > Math.PI) theta -= 2*Math.PI;
    while (theta < -Math.PI) theta += 2*Math.PI;
    const yawOffset = shortestAngleDiff(theta, spin.baseAz);

    const axis = {
      offset: yawOffset,
      v:      spin.curYawVel,
      dir:    spin.yawDir,
      speedTarget: spin.yawDesiredRunning ? spin.yawSpeed : 0
    };

    stepAxisBackAndForth('yaw', axis, dt, {
      limit:  spin.yawLimit,
      tauSec: Math.max(0, config.DEFAULT_EASE_TIME_MS)/1000,
      epsPos: (config.YAW_EPS_ANG ?? 1e-4),
      epsVel: (config.YAW_EPS_VEL ?? 1e-6),
      leadMult: (config.PREDICTIVE_LEAD_MULT ?? config.YAW_PREDICTIVE_LEAD_MULT ?? 1.0),
      fallbackMult: (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10)
    });

    spin.curYawVel = axis.v;
    spin.yawDir    = axis.dir;
    tmpSpherical.theta = spin.baseAz + axis.offset;
  }

  // PITCH (unchanged physics, but same structure)
  {
    const pitchSign = -1; // +dir means up
    const rawOffset = tmpSpherical.phi - spin.basePol;
    const axis = {
      offset: pitchSign * rawOffset,
      v:      pitchSign * spin.curPitchVel,
      dir:    spin.pitchDir,
      speedTarget: spin.pitchDesiredRunning ? spin.pitchSpeed : 0
    };

    stepAxisBackAndForth('pitch', axis, dt, {
      limit:  spin.pitchLimit,
      tauSec: Math.max(0, config.DEFAULT_EASE_TIME_MS)/1000,
      epsPos: (config.PITCH_EPS_ANG ?? 1e-4),
      epsVel: (config.PITCH_EPS_VEL ?? 1e-6),
      leadMult: (config.PREDICTIVE_LEAD_MULT ?? 1.0),
      fallbackMult: (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10)
    });

    spin.curPitchVel = pitchSign * axis.v;
    spin.pitchDir    = axis.dir;
    tmpSpherical.phi = spin.basePol + pitchSign * axis.offset;
  }

  // Clamp phi to avoid singularities
  tmpSpherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, tmpSpherical.phi));

  // Update camera
  tmpOffset.setFromSpherical(tmpSpherical);
  camera.position.copy(controls.target).add(tmpOffset);

  // PAN & ZOOM sections omitted for brevity (unchanged from your current build)
  camera.lookAt(controls.target);
}




// Resume with far-limit policy
export function resumeAnimationAfterInteraction(spin, camera, controls) {
  spin.paused = false;

  const tmpOffset = new THREE.Vector3();
  const tmpSpherical = new THREE.Spherical();
  tmpOffset.copy(camera.position).sub(controls.target);
  tmpSpherical.setFromVector3(tmpOffset);

  let theta = tmpSpherical.theta;
  while (theta > Math.PI) theta -= 2*Math.PI;
  while (theta < -Math.PI) theta += 2*Math.PI;

  const yawOffset = shortestAngleDiff(theta, spin.baseAz);
  const pitchOffsetRaw = tmpSpherical.phi - spin.basePol;

  const sYaw = Math.sign(yawOffset || 0);
  spin.yawDir = (-sYaw) || (spin.yawDir || 1);

  const pitchAxisOff = -pitchOffsetRaw;
  const sPitch = Math.sign(pitchAxisOff || 0);
  spin.pitchDir = (-sPitch) || (spin.pitchDir || 1);

  spin.yawDesiredRunning   = true;
  spin.pitchDesiredRunning = true;

  dbg('resume', () => {
    console.log(`[RESUME] yawOff=${yawOffset.toFixed(5)} yawDir=${spin.yawDir} ` +
                `pitchOffRaw=${pitchOffsetRaw.toFixed(5)} pitchDir=${spin.pitchDir}`);
  });
}



