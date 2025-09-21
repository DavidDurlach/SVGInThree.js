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



// ---- Per-axis integrator (Patch G: pre-apex, outside-recover, capped brake) ----
function kill20250920839PMstepAxisBackAndForth(axisName, axis, dt, params) {
  const {
    limit, tauSec, epsPos, epsVel,
    leadMult = (config.PREDICTIVE_LEAD_MULT ?? 1.0),
    fallbackMult = (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10)
  } = params;

  const sgn = (x) => (x>0) - (x<0);
  const abs = Math.abs;
  const tau = Math.max(1e-6, tauSec);

  if (!Number.isFinite(axis.offset)) axis.offset = 0;
  if (!Number.isFinite(axis.v))      axis.v      = 0;

  const oldOffset = axis.offset;
  const oldV      = axis.v;

  // Inward runway (negative if we are already outside)
  const dInward = limit - abs(axis.offset);
  const outside = dInward < 0;

  // Auto-recover if we are outside but command would push us further out (or we're stalled)
  if (outside) {
    const sOff = sgn(axis.offset) || 1;
    if (sgn(axis.dir || 0) === sOff || Math.abs(axis.v) <= (epsVel || 0)) {
      axis.dir = -sOff; // always aim inward when outside
    }
  }

  // Commanded speed
  const speedMag = Math.max(0, axis.speedTarget || 0);
  let   vCmd     = (axis.dir || 1) * speedMag;

  // Symmetric envelope: distance to nearest boundary works both inside and outside
  const a_env = Math.max(1e-6, speedMag / tau);
  const dNear = Math.abs(limit - Math.abs(axis.offset)); // >= 0 everywhere
  const vEnv  = Math.sqrt(2 * a_env * dNear);
  let   vStar = sgn(vCmd) * Math.min(Math.abs(vCmd), vEnv);

  const outwardVel = (axis.v !== 0) && (sgn(axis.v) === sgn(axis.offset));
  const outwardCmd = (sgn(vCmd) !== 0) && (sgn(vCmd) === sgn(axis.offset));

  // ---- PRE-APEX LATCH: avoid impulses from the braking floor when we're at the boundary
  const nearBoundary = (limit - Math.abs(axis.offset)) <= (epsPos || 0);
  const nearVStar    = Math.abs(vStar) <= (epsVel || 0);
  if ((outwardVel || outwardCmd) && (nearBoundary || nearVStar)) {
    const s = sgn(axis.offset) || (sgn(oldOffset) || 1);
    axis.offset = s * limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-env`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(env) newDir=${axis.dir}`));
    diag(`${axisName}-diag`, () => {
      console.log(
        `[${axisName.toUpperCase()} DIAG] offset=${axis.offset}, v=${axis.v}, ` +
        `v*=${vStar}, dir=${axis.dir}, dNear=${dNear}, limit=${limit}`
      );
    });
    return;
  }

  // Time-form accel toward v*, with braking floor (capped)
  let a = (vStar - axis.v) / tau;
  const braking = (axis.v !== 0) && ( (vStar === 0) || ((axis.v>0)!==(vStar>0)) );
  if (braking) {
    const dOutNow = Math.max(0, limit - Math.abs(axis.offset));
    const aTime   = Math.abs(axis.v) / tau;
    // Avoid huge aRun when dOutNow ~ 0
    let aRun      = (dOutNow > (epsPos || 0)) ? ((axis.v*axis.v)/(2*dOutNow)) : (aTime * fallbackMult);
    const aCap    = (config.BRAKE_ACCEL_CAP_MULT ?? 4) * a_env; // soft cap
    aRun = Math.min(aRun, aCap);
    a    = -sgn(axis.v) * Math.max(Math.abs(a), aRun);
  }

  // Integrate
  axis.v      += a * dt;
  axis.offset += axis.v * dt;

  // ---- POST-APEX: true crossing this frame
  const wasInside = Math.abs(oldOffset) <= limit + (epsPos || 0);
  const isOutside = Math.abs(axis.offset) >  limit + (epsPos || 0);
  if (isOutside && wasInside) {
    const s = sgn(axis.offset);
    axis.offset = s * limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-cross`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(cross) newDir=${axis.dir}`));
    return;
  }

  // POST-APEX: envelope says we're at apex while still moving outward
  const outward_after = (axis.v !== 0) && (sgn(axis.v) === sgn(axis.offset));
  const nearBoundary2 = (limit - Math.abs(axis.offset)) <= (epsPos || 0);
  const nearVStar2    = Math.abs(vStar) <= (epsVel || 0);
  if (outward_after && (nearBoundary2 || nearVStar2)) {
    const s = sgn(axis.offset) || (sgn(oldOffset) || 1);
    axis.offset = s * limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-env`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(env) newDir=${axis.dir}`));
    return;
  }

  // Diagnostics
  diag(`${axisName}-diag`, () => {
    console.log(
      `[${axisName.toUpperCase()} DIAG] offset=${axis.offset}, v=${axis.v}, ` +
      `v*=${vStar}, dir=${axis.dir}, dNear=${dNear}, limit=${limit}`
    );
  });
}



// ---- Per-axis integrator (fixed) ----
function kill20250920827PMstepAxisBackAndForth(axisName, axis, dt, params) {
  const {
    limit, tauSec, epsPos, epsVel,
    leadMult = (config.PREDICTIVE_LEAD_MULT ?? 1.0),
    fallbackMult = (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10)
  } = params;

  const sgn = (x) => (x>0)-(x<0);
  const abs = Math.abs;
  const tau = Math.max(1e-6, tauSec);

  if (!Number.isFinite(axis.offset)) axis.offset = 0;
  if (!Number.isFinite(axis.v))      axis.v      = 0;

  const oldOffset = axis.offset;
  const oldV      = axis.v;

  const speedMag = Math.max(0, axis.speedTarget || 0);
  const vCmd     = (axis.dir || 1) * speedMag;
  const sOff     = sgn(axis.offset);

  // Distance to the boundary when inside (0 when at/over the limit)
  const dOut = Math.max(0, limit - abs(axis.offset));

  // Decide "outward" from the *command*, not the instantaneous velocity.
  // Also: never apply the outward envelope while we're already outside.
  const inside      = abs(axis.offset) <= limit + (epsPos || 0);
  const outwardCmd  = (vCmd !== 0) && (sgn(vCmd) === sOff) && inside;

  // Envelope accel capacity
  const a_env = Math.max(1e-6, speedMag / tau);

  // Target speed toward which we ease this frame
  let vStar = vCmd;
  if (outwardCmd) {
    const vEnv = Math.sqrt(2 * a_env * dOut);
    vStar = sgn(vCmd) * Math.min(Math.abs(vCmd), vEnv);
  }

  // Log (pre-integration)
  dbg(`${axisName}-sample`, () => {
    console.log(
      `[${axisName.toUpperCase()} DBG] off=${axis.offset.toFixed(5)} ` +
      `v=${axis.v.toFixed(5)} dir=${axis.dir} dOut=${dOut.toFixed(5)} ` +
      `v*=${vStar.toFixed(5)} τ=${tau.toFixed(3)} outwardCmd=${outwardCmd}`
    );
  });

  // Time-form accel toward v*, with bounded braking floor
  let a = (vStar - axis.v) / tau;
  const braking =
    (axis.v !== 0) && ( (vStar === 0) || ((axis.v > 0) !== (vStar > 0)) );

  if (braking) {
    const dIn    = Math.max(0, limit - abs(axis.offset)); // runway if still inside
    const aTime  = Math.abs(axis.v) / tau;
    const aRun   = (dIn > 0) ? ((axis.v * axis.v) / (2 * dIn)) : aTime;
    const aCap   = Math.max(a_env, fallbackMult * a_env); // e.g. 10× envelope
    const aFloor = Math.min(Math.max(aTime, aRun), aCap);
    a = -Math.sign(axis.v) * Math.max(Math.abs(a), aFloor);
  }

  // Integrate
  axis.v      += a * dt;
  axis.offset += axis.v * dt;

  // Boundary checks
  const wasInside = Math.abs(oldOffset) <= limit + (epsPos || 0);
  const isOutside = Math.abs(axis.offset) >  limit + (epsPos || 0);

  // (A) Crossed boundary this frame → snap to apex and flip
  if (isOutside && wasInside) {
    const s = Math.sign(axis.offset);
    axis.offset = s * limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-cross`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(cross) newDir=${axis.dir}`));
    return;
  }

  // (B) Started outside and stayed outside → gently recover inward (no snapping)
  if (isOutside && !wasInside) {
    const s = sOff || (sgn(oldOffset) || 1);
    axis.dir = -s;                          // ensure command points inward
    axis.v   = s * Math.min(Math.abs(axis.v), speedMag); // no explosion
    diag(`${axisName}-diag`, () => {
      console.log(`[${axisName.toUpperCase()} DIAG] outside->recover offset=${axis.offset}, v=${axis.v}, v*=${vStar}, dir=${axis.dir}`);
    });
    return;
  }

  // (C) Envelope apex while still commanded outward
  const outward_after = (axis.v !== 0) && (Math.sign(axis.v) === Math.sign(axis.offset));
  const nearBoundary  = (limit - Math.abs(axis.offset)) <= (epsPos || 0);
  const nearVStar     = Math.abs(vStar) <= (epsVel || 0);
  if (outward_after && outwardCmd && (nearBoundary || nearVStar)) {
    const s = Math.sign(axis.offset) || (Math.sign(oldOffset) || 1);
    axis.offset = s * limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-env`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(env) newDir=${axis.dir}`));
    return;
  }

  // Periodic diag
  diag(`${axisName}-diag`, () => {
    console.log(
      `[${axisName.toUpperCase()} DIAG] offset=${axis.offset}, v=${axis.v}, v*=${vStar}, dir=${axis.dir}, dOut=${dOut}, limit=${limit}`
    );
  });
}



// ---- Per-axis integrator (PATCH G: braking-above-envelope + env-apex-inside-only) ----
function kill20250920810PMstepAxisBackAndForth(axisName, axis, dt, params) {
  const {
    limit, tauSec, epsPos, epsVel,
    // fallback used only when we're outside (no dOut runway)
    fallbackMult = (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10)
  } = params;

  const tau = Math.max(1e-6, tauSec);
  const sgn = (x) => (x > 0) - (x < 0);

  if (!Number.isFinite(axis.offset)) axis.offset = 0;
  if (!Number.isFinite(axis.v))      axis.v      = 0;

  const oldOffset = axis.offset;

  // Distance to boundary on the outward side (0 if outside)
  const dOut = Math.max(0, limit - Math.abs(axis.offset));

  // Commanded speed from FSM direction
  const speedMag = Math.max(0, axis.speedTarget || 0);
  const vCmd     = (axis.dir || 1) * speedMag;

  // Outward if velocity increases |offset|
  const outward_now = (axis.v !== 0) && (sgn(axis.v) === sgn(axis.offset));

  // Velocity envelope (derived from τ and slider)
  const a_env = Math.max(1e-6, speedMag / tau);
  let vStar   = vCmd;
  if (outward_now) {
    const vEnv = Math.sqrt(2 * a_env * dOut);
    vStar = sgn(vCmd || axis.dir || 1) * Math.min(Math.abs(vCmd), vEnv);
  }

  dbg(`${axisName}-sample`, () => {
    console.log(`[${axisName.toUpperCase()} DBG] off=${axis.offset.toFixed(5)} v=${axis.v.toFixed(5)} dir=${axis.dir} ` +
                `dOut=${dOut.toFixed(5)} v*=${vStar.toFixed(5)} τ=${tau.toFixed(3)} outward=${outward_now}`);
  });

  // Time-form acceleration toward v*, with a braking floor
  let a = (vStar - axis.v) / tau;

  // *** FIX #1: treat "above envelope while outward" as braking, too ***
  const aboveEnvelope = outward_now && (Math.abs(axis.v) > Math.abs(vStar) + (epsVel || 0));
  const braking = (axis.v !== 0) && ( (vStar === 0) || (sgn(axis.v) !== sgn(vStar)) || aboveEnvelope );

  if (braking) {
    const dOutNow = Math.max(0, limit - Math.abs(axis.offset));
    const aTime   = Math.abs(axis.v) / tau;
    const aRun    = (dOutNow > 0) ? ((axis.v * axis.v) / (2 * dOutNow)) : (aTime * fallbackMult);
    const aFloor  = Math.max(aTime, aRun);
    a = -sgn(axis.v) * Math.max(Math.abs(a), aFloor);
  }

  // Integrate
  axis.v      += a * dt;
  axis.offset += axis.v * dt;

  // Boundary tests
  const wasInside = Math.abs(oldOffset) <= limit + (epsPos || 0);
  const isOutside = Math.abs(axis.offset) >  limit + (epsPos || 0);

  // Crossed boundary this frame → land exactly at limit, v=0, flip dir
  if (isOutside && wasInside) {
    const s = sgn(axis.offset);
    axis.offset = s * limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-cross`, () => console.log(`[${axisName.toUpperCase()} EVT] APEX(cross) newDir=${axis.dir}`));
    return;
  }

  // *** FIX #2: env apex only when INSIDE ***
  const dOutNow        = Math.max(0, limit - Math.abs(axis.offset));
  const outward_after  = (axis.v !== 0) && (sgn(axis.v) === sgn(axis.offset));
  const nearBoundary   = dOutNow <= (epsPos || 0);
  const nearVStar      = Math.abs(vStar) <= (epsVel || 0);

  if (!isOutside && outward_after && (nearBoundary || nearVStar)) {
    const s = sgn(axis.offset) || (sgn(oldOffset) || 1);
    axis.offset = s * limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-env`, () => console.log(`[${axisName.toUpperCase()} EVT] APEX(env) newDir=${axis.dir}`));
    return;
  }

  diag(`${axisName}-diag`, () => {
    console.log(`[${axisName.toUpperCase()} DIAG] offset=${axis.offset}, v=${axis.v}, v*=${vStar}, dir=${axis.dir}, dOut=${dOut}, limit=${limit}`);
  });
}



// ---- Per-axis integrator (Patch F) ----
function KILL20250920750PMstepAxisBackAndForth(axisName, axis, dt, params) {
  const {
    limit, tauSec, epsPos, epsVel,
    leadMult = (config.PREDICTIVE_LEAD_MULT ?? 1.0),
    fallbackMult = (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10)
  } = params;

  const sgn = (x) => (x>0)-(x<0);
  const abs = Math.abs;
  const tau = Math.max(1e-6, tauSec);

  if (!Number.isFinite(axis.offset)) axis.offset = 0;
  if (!Number.isFinite(axis.v))      axis.v      = 0;

  const oldOffset = axis.offset;
  const oldV      = axis.v;

  // Distances
  const dOut = Math.max(0, limit - abs(axis.offset)); // outward runway

  // Commanded target speed
  const speedMag = Math.max(0, axis.speedTarget || 0);
  const vCmd     = (axis.dir || 1) * speedMag;

  // 'Outward' defined by current velocity increasing |offset|
  const outward = (axis.v !== 0) && (sgn(axis.v) === sgn(axis.offset));

  // Envelope accel from τ and slider
  const a_env = Math.max(1e-6, speedMag / tau);

  // Approach-only envelope
  let vStar = vCmd;
  if (outward) {
    const vEnv = Math.sqrt(2 * a_env * Math.max(0, dOut));
    vStar = sgn(vCmd) * Math.min(Math.abs(vCmd), vEnv);
  }

  dbg(`${axisName}-sample`, () => {
    console.log(`[${axisName.toUpperCase()} DBG] off=${axis.offset.toFixed(5)} v=${axis.v.toFixed(5)} dir=${axis.dir} ` +
      `dOut=${dOut.toFixed(5)} v*=${vStar.toFixed(5)} τ=${tau.toFixed(3)} outward=${outward}`);
  });

  // Applied acceleration (time-form) + braking floor
  let a = (vStar - axis.v) / tau;
  const braking = (axis.v !== 0) && ( (vStar === 0) || ((axis.v>0)!==(vStar>0)) );
  if (braking) {
    const dOutNow = Math.max(0, limit - abs(axis.offset));
    const aTime   = Math.abs(axis.v) / tau;
    const aRun    = (dOutNow > 0) ? ((axis.v*axis.v)/(2*dOutNow)) : (aTime * fallbackMult);
    const aFloor  = Math.max(aTime, aRun);
    a = -Math.sign(axis.v) * Math.max(Math.abs(a), aFloor);
  }

  // Integrate
  axis.v      += a * dt;
  axis.offset += axis.v * dt;

  // Apex / bounce
  const wasInside = Math.abs(oldOffset) <= limit + (epsPos || 0);
  const isOutside = Math.abs(axis.offset) >  limit + (epsPos || 0);

  if (isOutside && wasInside) {
    const s = Math.sign(axis.offset);
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-cross`, () => console.log(`[${axisName.toUpperCase()} EVT] APEX(cross) newDir=${axis.dir}`));
    return;
  }

  const outward_after = (axis.v !== 0) && (Math.sign(axis.v) === Math.sign(axis.offset));
  const nearBoundary  = (limit - Math.abs(axis.offset)) <= (epsPos || 0);
  const nearVStar     = Math.abs(vStar) <= (epsVel || 0);
  if (outward_after && (nearBoundary || nearVStar)) {
    const s = Math.sign(axis.offset) || (Math.sign(oldOffset) || 1);
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-env`, () => console.log(`[${axisName.toUpperCase()} EVT] APEX(env) newDir=${axis.dir}`));
    return;
  }

  diag(`${axisName}-diag`, () => {
    console.log(`[${axisName.toUpperCase()} DIAG] offset=${axis.offset}, v=${axis.v}, v*=${vStar}, dir=${axis.dir}, dOut=${dOut}, limit=${limit}`);
  });
}


// --- Patch D stepAxisBackAndForth (drop-in) ---
// Fix: no "lock at boundary". Bounce when commanded outward and either
// (1) we cross the boundary (as before), or
// (2) the envelope has reduced v* to ~0 near the boundary (dOut <= epsPos or |v*| <= epsVel).
// No new knobs, uses existing epsPos/epsVel. Keep time-form + runway braking.

// ---- Per-axis integrator (Patch E: symmetric velocity envelope) ----
function KILL20250920716pmstepAxisBackAndForth(axisName, axis, dt, params) {
  const {
    limit, tauSec, epsPos, epsVel,
    // leadMult kept for compatibility; not used in the envelope now
    leadMult = (config.PREDICTIVE_LEAD_MULT ?? 1.0),
    fallbackMult = (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10)
  } = params;

  const sgn = (x) => (x>0)-(x<0);
  const abs = Math.abs;
  const tau = Math.max(1e-6, tauSec);

  // Guards
  if (!Number.isFinite(axis.offset)) axis.offset = 0;
  if (!Number.isFinite(axis.v))      axis.v      = 0;

  const oldOffset = axis.offset;
  const oldV      = axis.v;

  // Distance to nearest boundary (0 at the limit, grows toward mid-span or outside)
  const dNear = Math.abs(limit - Math.abs(axis.offset)); // symmetric, no predictive lead

  // Commanded target speed from FSM direction
  const speedMag = Math.max(0, axis.speedTarget || 0);
  const vCmd     = (axis.dir || 1) * speedMag;

  // Symmetric velocity envelope (applies in BOTH directions)
  const a_env = Math.max(1e-6, speedMag / tau);
  const vEnv  = Math.sqrt(2 * a_env * Math.max(0, dNear));
  let vStar   = sgn(vCmd) * Math.min(Math.abs(vCmd), vEnv);

  // ---- Applied physics: time-form toward v*, with braking floor when braking ----
  let a = (vStar - axis.v) / tau;
  const braking = (axis.v !== 0) && ( (vStar === 0) || ((axis.v>0)!==(vStar>0)) );
  if (braking) {
    const dOutNow = Math.max(0, limit - Math.abs(axis.offset)); // inward runway
    const aTime   = Math.abs(axis.v) / tau;
    const aRun    = (dOutNow > 0) ? ((axis.v*axis.v)/(2*dOutNow)) : (aTime * fallbackMult);
    const aFloor  = Math.max(aTime, aRun);
    a = -Math.sign(axis.v) * Math.max(Math.abs(a), aFloor);
  }

  // Integrate
  axis.v      += a * dt;
  axis.offset += axis.v * dt;

  // ---- Apex/bounce handling ----
  const wasInside = Math.abs(oldOffset) <= limit + (epsPos || 0);
  const isOutside = Math.abs(axis.offset) >  limit + (epsPos || 0);

  // (A) Crossed boundary this frame → apex + flip
  if (isOutside && wasInside) {
    const s = Math.sign(axis.offset);
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-cross`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(cross) newDir=${axis.dir}`));
    return;
  }

  // (B) Envelope implies we're at apex while MOVING OUTWARD (based on velocity) → apex + flip
  const outward = (axis.v !== 0) && (Math.sign(axis.v) === Math.sign(axis.offset));
  const nearBoundary = (limit - Math.abs(axis.offset)) <= (epsPos || 0);
  const nearVStar    = Math.abs(vStar) <= (epsVel || 0);
  if (outward && (nearBoundary || nearVStar)) {
    const s = Math.sign(axis.offset) || (Math.sign(oldOffset) || 1);
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-env`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(env) newDir=${axis.dir}`));
    return;
  }

  // Optional: time-sampled diagnostics
  diag(`${axisName}-diag`, () => {
    console.log(`[${axisName.toUpperCase()} DIAG] offset=${axis.offset}, v=${axis.v}, v*=${vStar}, dir=${axis.dir}, dNear=${dNear}, limit=${limit}`);
  });
}








function KILL20250920125pmstepAxisBackAndForth(axisName, axis, dt, params) {
  const {
    limit, tauSec, epsPos, epsVel,
    leadMult = (config.PREDICTIVE_LEAD_MULT ?? 1.0),
    fallbackMult = (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10)
  } = params;

  const sgn = (x) => (x>0)-(x<0);
  const abs = Math.abs;
  const tau = Math.max(1e-6, tauSec);

  if (!Number.isFinite(axis.offset)) axis.offset = 0;
  if (!Number.isFinite(axis.v))      axis.v      = 0;

  const oldOffset = axis.offset;

  // Outward runway with capped predictive lead
  const lead = Math.min(abs(axis.v) * dt * (Number.isFinite(leadMult) ? leadMult : 1.0), limit);
  const dOut = Math.max(0, limit - abs(axis.offset) - lead);

  // Commanded speed and envelope (only when command is outward)
  const speedMag = Math.max(0, axis.speedTarget || 0);
  const vCmd     = (axis.dir || 1) * speedMag;
  const a_env    = Math.max(1e-6, speedMag / tau);
  const outwardCmd = (Math.sign(vCmd) !== 0) && (Math.sign(vCmd) === Math.sign(axis.offset));

  let vStar = vCmd;
  if (outwardCmd) {
    const vEnv = Math.sqrt(2 * a_env * Math.max(0, dOut));
    vStar = Math.sign(vCmd) * Math.min(Math.abs(vCmd), vEnv);
  }

  // Applied acceleration: time-form toward v*, with braking floor
  let a = (vStar - axis.v) / tau;
  const braking = (axis.v !== 0) && ( (vStar === 0) || ((axis.v>0)!==(vStar>0)) );
  if (braking) {
    const dOutNow = Math.max(0, limit - abs(axis.offset));
    const aTime   = abs(axis.v) / tau;
    const aRun    = (dOutNow > 0) ? ((axis.v*axis.v)/(2*dOutNow)) : (aTime * fallbackMult);
    const aFloor  = Math.max(aTime, aRun);
    a = -Math.sign(axis.v) * Math.max(Math.abs(a), aFloor);
  }

  // Integrate
  axis.v      += a * dt;
  axis.offset += axis.v * dt;

  // Boundary handling
  const wasInside = abs(oldOffset) <= limit + (epsPos || 0);
  const isOutside = abs(axis.offset) >  limit + (epsPos || 0);

  // (A) Crossed boundary this frame → apex + flip
  if (isOutside && wasInside) {
    const s = Math.sign(axis.offset);
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-cross`, () => console.log(`[${axisName.toUpperCase()} EVT] APEX(cross) newDir=${axis.dir}`));
    return;
  }

  // (B) Envelope implies apex: at boundary or v* ~ 0 while commanded outward → apex + flip
  const nearBoundary = (limit - abs(axis.offset)) <= (epsPos || 0);
  const nearVStar    = Math.abs(vStar) <= (epsVel || 0);
  if (outwardCmd && (nearBoundary || nearVStar)) {
    const s = Math.sign(axis.offset) || (Math.sign(oldOffset) || 1);
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-env`, () => console.log(`[${axisName.toUpperCase()} EVT] APEX(env) newDir=${axis.dir}`));
    return;
  }

  // Time-sampled DIAG
  diag(`${axisName}-diag`, () => {
    console.log(`[${axisName.toUpperCase()} DIAG] offset=${axis.offset}, v=${axis.v}, v*=${vStar}, dir=${axis.dir}, dOut=${dOut}, limit=${limit}`);
  });
}



function KILL20250920109pmstepAxisBackAndForth(axisName, axis, dt, params) {
  const {
    limit, tauSec, epsPos, epsVel,
    leadMult = (config.PREDICTIVE_LEAD_MULT ?? 1.0),
    fallbackMult = (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10)
  } = params;

  const sgn = (x) => (x>0)-(x<0);
  const abs = Math.abs;
  const tau = Math.max(1e-6, tauSec);

  // Guards
  if (!Number.isFinite(axis.offset)) axis.offset = 0;
  if (!Number.isFinite(axis.v))      axis.v      = 0;

  const oldOffset = axis.offset;

  // Lead & remaining outward runway
  const lead = Math.min(abs(axis.v) * dt * (Number.isFinite(leadMult) ? leadMult : 1.0), limit);
  const dOut = Math.max(0, limit - abs(axis.offset) - lead);

  // Commanded target speed (signed) from the FSM dir
  const speedMag = Math.max(0, axis.speedTarget || 0);
  const vCmd     = (axis.dir || 1) * speedMag;

  // ----- Velocity envelope (no explicit "brake" flag) -----
  // Only applies when the command is outward (increasing |offset|).
  // a_env is our "planning" accel capacity; we use the natural time-form link speed/τ.
  const a_env = Math.max(1e-6, speedMag / tau);
  const outwardCmd = (sgn(vCmd) !== 0) && (sgn(vCmd) === sgn(axis.offset));

  let vStar = vCmd;
  if (outwardCmd) {
    const vEnv = Math.sqrt(2 * a_env * Math.max(0, dOut));
    vStar = sgn(vCmd) * Math.min(Math.abs(vCmd), vEnv);
  }

  // ----- Applied acceleration (physics): time-form toward v*, with braking floor -----
  let a = (vStar - axis.v) / tau;

  // If braking (v opposes v* OR v*≈0), guarantee enough decel to stop in time
  const braking = (axis.v !== 0) && ( (vStar === 0) || ((axis.v>0)!==(vStar>0)) );
  if (braking) {
    const dOutNow = Math.max(0, limit - abs(axis.offset));
    const aTime   = abs(axis.v) / tau;
    const aRun    = (dOutNow > 0) ? ((axis.v*axis.v)/(2*dOutNow)) : (aTime * fallbackMult);
    const aFloor  = Math.max(aTime, aRun);
    a = -sgn(axis.v) * Math.max(Math.abs(a), aFloor);
  }

  // Integrate
  axis.v      += a * dt;
  axis.offset += axis.v * dt;

  // ----- Boundary handling / bounce -----
  const wasInside = abs(oldOffset) <= limit + (epsPos || 0);
  const isOutside = abs(axis.offset) >  limit + (epsPos || 0);

  // A) Crossed outward across the boundary this frame → apex at boundary, flip, leave with v=0
  if (isOutside && wasInside) {
    const s = sgn(axis.offset);
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-cross`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(cross) newDir=${axis.dir}`));
    return;
  }

  // B) Nearly stopped at boundary → snap to apex and flip
  const nearBoundary = (limit - abs(axis.offset)) <= (epsPos || 0);
  const nearStop     = Math.abs(axis.v) <= (epsVel || 0);
  if (nearBoundary && nearStop) {
    const s = sgn(axis.offset) || (sgn(oldOffset) || 1);
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-near`, () =>
      console.log(`[${axisName.toUpperCase()} EVT] APEX(near) newDir=${axis.dir}`));
    return;
  }

  // NOTE: We intentionally DO NOT clamp when already outside.
  // If released outside, the chosen dir (set on resume) aims inward;
  // the envelope does not apply (since command is inward), so it eases smoothly back in.
  diag(`${axisName}-diag`, () => {
    console.log(`[${axisName.toUpperCase()} DIAG] offset=${axis.offset}, v=${axis.v}, dir=${axis.dir}, limit=${limit}`);
  });
}



function KILL20250920805AMStepAxisBackAndForth(axisName, axis, dt, params) {
  const {
    limit, tauSec, epsPos, epsVel,
    leadMult = (config.PREDICTIVE_LEAD_MULT ?? 1.0),
    fallbackMult = (config.RUNWAY_FALLBACK_ACCEL_MULT ?? 10)
  } = params;

  const sgn = (x) => (x>0)-(x<0);
  const abs = Math.abs;
  const tau = Math.max(1e-6, tauSec);

  if (!Number.isFinite(axis.offset)) axis.offset = 0;
  if (!Number.isFinite(axis.v))      axis.v      = 0;

  const oldOffset = axis.offset;
  const oldV      = axis.v;

  const lead = Math.min(abs(axis.v) * dt * (Number.isFinite(leadMult) ? leadMult : 1.0), limit);
  const dOut = Math.max(0, limit - abs(axis.offset) - lead);

  const outward = (axis.v !== 0) && (sgn(axis.v) === sgn(axis.offset));
  let vStar = (axis.dir || 1) * Math.max(0, axis.speedTarget || 0);

  // Decision: runway-only predictive brake
  let brakeNow = false, stopDist = Infinity, aRunway = 0;
  if (outward && dOut > 0) {
    aRunway  = (axis.v*axis.v) / (2 * dOut);
    stopDist = (aRunway > 0) ? (axis.v*axis.v) / Math.max(2*aRunway, epsVel || 1e-9) : Infinity;
    brakeNow = (stopDist + (epsPos || 0)) >= dOut;
  }
  if (brakeNow) vStar = 0;

  dbg(`${axisName}-sample`, () => {
    console.log(`[${axisName.toUpperCase()} DBG] off=${axis.offset.toFixed(5)} v=${axis.v.toFixed(5)} dir=${axis.dir} ` +
      `dOut=${dOut.toFixed(5)} v*=${vStar.toFixed(5)} τ=${tau.toFixed(3)} outward=${outward} ` +
      `aRunway=${aRunway.toFixed(6)} stopDist=${Number.isFinite(stopDist)?stopDist.toFixed(5):'∞'} brake=${brakeNow}`);
  });

  // Accel: time-form with braking floor when needed
  let a = (vStar - axis.v) / tau;
  const braking = (axis.v !== 0) && ( (vStar === 0) || ((axis.v>0)!==(vStar>0)) );
  if (braking) {
    const dOutNow = Math.max(0, limit - abs(axis.offset));
    const aTime   = abs(axis.v) / tau;
    const aRun    = (dOutNow > 0) ? ((axis.v*axis.v)/(2*dOutNow)) : (aTime * fallbackMult);
    const aFloor  = Math.max(aTime, aRun);
    a = -sgn(axis.v) * Math.max(Math.abs(a), aFloor);
  }

  axis.v      += a * dt;
  axis.offset += axis.v * dt;

  const wasInside = abs(oldOffset) <= limit + (epsPos || 0);
  const isOutside = abs(axis.offset) >  limit + (epsPos || 0);

  if (isOutside && wasInside) {
    const s = sgn(axis.offset);
    const overshoot = abs(axis.offset) - limit;
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-cross`, () => {
      console.log(`[${axisName.toUpperCase()} EVT] APEX(cross) over=${overshoot.toFixed(6)} newDir=${axis.dir}`);
    });
    return;
  }

  const nearBoundary = (limit - abs(axis.offset)) <= (epsPos || 0);
  const nearStop     = Math.abs(axis.v) <= (epsVel || 0);
  if (nearBoundary && nearStop) {
    const s = sgn(axis.offset) || (sgn(oldOffset) || 1);
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -axis.dir;
    dbg(`${axisName}-apex-near`, () => {
      console.log(`[${axisName.toUpperCase()} EVT] APEX(near) newDir=${axis.dir}`);
    });
    return;
  }

  if (isOutside && !wasInside) {
    const s = sgn(axis.offset);
    axis.offset = s*limit;
    axis.v      = 0;
    axis.dir    = -s;
    dbg(`${axisName}-clamp-outside`, () => {
      console.log(`[${axisName.toUpperCase()} EVT] CLAMP(outside) newDir=${axis.dir}`);
    });
    return;
  }

  diag(`${axisName}-diag`, () => {
    console.log(`[${axisName.toUpperCase()} DIAG] offset=${axis.offset}, v=${axis.v}, dir=${axis.dir}, limit=${limit}`);
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



export function kill20250920734PMStepSpin(spin, dt, camera, controls) {
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

  // PITCH
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

  tmpSpherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, tmpSpherical.phi));
  tmpOffset.setFromSpherical(tmpSpherical);
  camera.position.copy(controls.target).add(tmpOffset);

  // PAN
  const tauSec = Math.max(0, config.DEFAULT_EASE_TIME_MS)/1000;
  const ease = (val, target, tau, dt) => val + ((target - val)/Math.max(1e-6, tau)) * dt;

  let panVX = spin.curPanXVel;
  let panVY = spin.curPanYVel;
  const wantVX = spin.panXDesiredRunning ? (spin.panDirX * spin.panSpeedX) : 0;
  const wantVY = spin.panYDesiredRunning ? (spin.panDirY * spin.panSpeedY) : 0;
  panVX = ease(panVX, wantVX, tauSec, dt);
  panVY = ease(panVY, wantVY, tauSec, dt);
  spin.curPanXVel = panVX;
  spin.curPanYVel = panVY;

  const dTarget = new THREE.Vector3(panVX * dt, panVY * dt, 0);
  const oldTarget = controls.target.clone();
  controls.target.add(dTarget);
  camera.position.add(dTarget);

  const dx = controls.target.x - spin.baseTarget.x;
  const dy = controls.target.y - spin.baseTarget.y;
  if (Math.abs(dx) > spin.panLimitX + (config.PAN_EPS_POS ?? 1e-4)) {
    const s = Math.sign(dx);
    const over = Math.abs(dx) - spin.panLimitX;
    controls.target.x = spin.baseTarget.x + s*spin.panLimitX;
    camera.position.x += (controls.target.x - (oldTarget.x + dTarget.x));
    spin.curPanXVel = 0;
    spin.panDirX = -spin.panDirX;
    dbg('panX-apex', () => console.log(`[PANX EVT] APEX newDir=${spin.panDirX}`));
  }
  if (Math.abs(dy) > spin.panLimitY + (config.PAN_EPS_POS ?? 1e-4)) {
    const s = Math.sign(dy);
    const over = Math.abs(dy) - spin.panLimitY;
    controls.target.y = spin.baseTarget.y + s*spin.panLimitY;
    camera.position.y += (controls.target.y - (oldTarget.y + dTarget.y));
    spin.curPanYVel = 0;
    spin.panDirY = -spin.panDirY;
    dbg('panY-apex', () => console.log(`[PANY EVT] APEX newDir=${spin.panDirY}`));
  }

  // ZOOM
  let zoomV = spin.curZoomVel;
  const wantZ = spin.zoomDesiredRunning ? (spin.zoomDir * spin.zoomSpeed) : 0;
  zoomV = ease(zoomV, wantZ, tauSec, dt);
  spin.curZoomVel = zoomV;

  const zoomDelta = zoomV * dt;
  const dist = tmpOffset.length();
  const newDist = Math.max(spin.zoomMin, Math.min(spin.zoomMax, dist + zoomDelta));
  tmpOffset.normalize().multiplyScalar(newDist);
  camera.position.copy(controls.target).add(tmpOffset);

  if (newDist <= spin.zoomMin + (config.ZOOM_EPS_DIST ?? 1e-4) || newDist >= spin.zoomMax - (config.ZOOM_EPS_DIST ?? 1e-4)) {
    spin.curZoomVel = 0;
    const mid = (spin.zoomMax + spin.zoomMin) / 2;
    spin.zoomDir = Math.sign(mid - newDist) || spin.zoomDir;
    dbg('zoom-apex', () => console.log(`[ZOOM EVT] APEX newDir=${spin.zoomDir}`));
  }

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



// Resume (Patch B) with logging
export function kill20250920734PMResumeAnimationAfterInteraction(spin, camera, controls) {
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

  // Inside or outside: choose the direction that yields the most travel before first bounce,
  // which for symmetric ±limit is simply dir = -sign(offset).
  const sYaw = Math.sign(yawOffset || 0);
  spin.yawDir = (-sYaw) || (spin.yawDir || 1);

  const pitchAxisOff = -pitchOffsetRaw; // +dir means "up"
  const sPitch = Math.sign(pitchAxisOff || 0);
  spin.pitchDir = (-sPitch) || (spin.pitchDir || 1);

  spin.yawDesiredRunning   = true;
  spin.pitchDesiredRunning = true;

  dbg('resume', () => {
    console.log(`[RESUME] yawOff=${yawOffset.toFixed(5)} yawDir=${spin.yawDir} ` +
                `pitchOffRaw=${pitchOffsetRaw.toFixed(5)} pitchDir=${spin.pitchDir}`);
  });
}


export function KILL20250920805AMResumeAnimationAfterInteraction(spin, camera, controls) {
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