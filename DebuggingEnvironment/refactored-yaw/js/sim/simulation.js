const DEFAULT_PARAMS = {
  L: 45,
  vmax: 60,
  aCap: 600,
  dt: 1 / 60,
};

const DEFAULT_EPS = {
  x: 1e-6,
  v: 1e-6,
  t: 1e-9,
  sel: 0.5,
};

const DEBUG_STAGES = true;
const MIN_ACCEL = 1e-6;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const abs = Math.abs;

function newState() {
  return {
    t: 0,
    x: 0,
    v: 0,
    a: 0,
    phase: 'toLimit', // 'toLimit' | 'toMid'
    side: +1,          // which apex (+L or -L) we are targeting in toLimit
    stage: 'accel',    // last executed stage
    prevStage: 'accel',
  };
}

function stopDistance(v, aCap) {
  const denom = Math.max(1e-9, Math.abs(aCap));
  return (v * v) / (2 * denom);
}

// Solve 0.5 a t^2 + v0 t + (x0 - xT) = 0 for smallest positive t
function timeToX(x0, v0, a, xTarget, epsT) {
  const dx = x0 - xTarget;
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(v0) < 1e-12) return Infinity;
    const t = -dx / v0;
    return t > epsT ? t : Infinity;
  }
  const A = 0.5 * a;
  const B = v0;
  const C = dx;
  const D = B * B - 4 * A * C;
  if (D < 0) return Infinity;
  const r = Math.sqrt(D);
  let out = Infinity;
  const t1 = (-B - r) / (2 * A);
  const t2 = (-B + r) / (2 * A);
  if (t1 > epsT) out = Math.min(out, t1);
  if (t2 > epsT) out = Math.min(out, t2);
  return out;
}

function timeToV0(v0, a, epsT) {
  if (Math.abs(a) < 1e-12) return Infinity;
  if (v0 * a >= 0) return Infinity;
  const t = -v0 / a;
  return t > epsT ? t : Infinity;
}

function timeToVmax(v0, a, vmax, epsT) {
  if (Math.abs(a) < 1e-12) return Infinity;
  const target = a > 0 ? vmax : -vmax;
  if ((target - v0) * a <= 0) return Infinity;
  const t = (target - v0) / a;
  return t > epsT ? t : Infinity;
}

function selectStage(state, params, eps, options) {
  const { x, v, phase, side, prevStage } = state;
  const { L, aCap, vmax } = params;

  if (options.outsideRecover && Math.abs(x) > L + eps.x) {
    const inward = -Math.sign(x);
    return {
      stage: 'recover',
      target: Math.sign(x) * L,
      a: inward * aCap,
      dTow: Math.abs(Math.abs(x) - L),
      dBrake: stopDistance(v, aCap),
    };
  }

  const target = phase === 'toLimit' ? side * L : 0;
  const dTow = Math.abs(target - x);
  const towardSign = phase === 'toLimit'
    ? (side >= 0 ? 1 : -1)
    : (Math.sign(target - x) || (target >= x ? 1 : -1));
  const vToward = v * towardSign;
  const runway = Math.max(dTow, eps.x);

  const accelShape = (2 * vmax * vmax - vToward * vToward) / (2 * runway);
  const accelMag = Math.min(aCap, Math.max(MIN_ACCEL, accelShape));
  const decelShape = (vToward * vToward) / (2 * runway);
  const decelMag = Math.min(aCap, Math.max(MIN_ACCEL, decelShape));
  const dNeed = (vmax * vmax) / (2 * accelMag);
  const decelDist = stopDistance(vToward, decelMag);

  const baseStage = {
    target,
    dTow,
    dBrake: stopDistance(v, aCap),
    accelMag,
    decelMag,
    accelShape,
    decelShape,
    dNeed,
    decelDist,
  };

  if (vToward <= eps.v) {
    const accel = towardSign * accelMag;
    const stage = { ...baseStage, stage: 'accel', a: accel };
    if (DEBUG_STAGES && state.t < 0.4) {
      console.log('[STAGE]', {
        t: state.t.toFixed(4),
        x: state.x.toFixed(3),
        v: state.v.toFixed(3),
        phase,
        side,
        dTow: dTow.toFixed(3),
        dNeed: dNeed.toFixed(3),
        decelDist: decelDist.toFixed(3),
        vToward: vToward.toFixed(3),
        stage: stage.stage,
        a: stage.a.toFixed(3),
        prevStage,
        accelMag: accelMag.toFixed(3),
        decelMag: decelMag.toFixed(3),
      });
    }
    return stage;
  }

  const band = eps.sel;
  const preferAccel = dTow >= dNeed + band;
  const preferDecel = dTow <= dNeed - band;

  let stageKind;
  if (preferAccel) {
    stageKind = 'accel';
  } else if (preferDecel) {
    stageKind = 'decel';
  } else {
    const prevKind = prevStage === 'coast' ? 'accel' : prevStage;
    stageKind = prevKind === 'decel' ? 'decel' : 'accel';
  }

  let stage;
  if (stageKind === 'decel') {
    const against = -Math.sign(v) || -towardSign;
    stage = { ...baseStage, stage: 'decel', a: against * decelMag };
  } else {
    stage = { ...baseStage, stage: 'accel', a: towardSign * accelMag };
  }

  if (stage.stage === 'accel' && vToward >= vmax - eps.v) {
    stage = { ...stage, stage: 'coast', a: 0 };
  }

  if (DEBUG_STAGES && state.t < 0.4) {
    console.log('[STAGE]', {
      t: state.t.toFixed(4),
      x: state.x.toFixed(3),
      v: state.v.toFixed(3),
      phase,
      side,
      dTow: dTow.toFixed(3),
      dNeed: dNeed.toFixed(3),
      decelDist: decelDist.toFixed(3),
      vToward: vToward.toFixed(3),
      stage: stage.stage,
      a: stage.a.toFixed(3),
      prevStage,
      accelMag: accelMag.toFixed(3),
      decelMag: decelMag.toFixed(3),
    });
  }

  return stage;
}


function applyVelocityScaling(stage, state, params, options) {
  if (!options.velScaled) return stage.a;
  if (stage.stage !== 'decel') return stage.a;
  const overs = Math.max(0, Math.abs(state.v) - params.vmax);
  if (overs <= 0) return stage.a;
  const baseMag = Math.max(MIN_ACCEL, Math.abs(stage.a) || stage.decelMag || params.aCap);
  const scale = clamp(1 + overs / (params.vmax + 1e-6), 1, 3);
  const magnitude = Math.min(baseMag * scale, params.aCap * 3);
  const sign = stage.a < 0 ? -1 : 1;
  return sign * magnitude;
}

function integratePiece(state, a, dt) {
  const x0 = state.x;
  const v0 = state.v;
  state.x = x0 + v0 * dt + 0.5 * a * dt * dt;
  state.v = v0 + a * dt;
  state.t += dt;
  return { x0, v0, x1: state.x, v1: state.v };
}

function stepWithEvents(state, params, eps, options, dt) {
  let dtLeft = dt;
  const pieces = [];
  const events = [];
  let guard = 0;
  let lastStage = null;
  let firstStage = null;
  let predicted = null;
  const vStart = state.v;

  while (dtLeft > eps.t && guard++ < 32) {
    const pick = selectStage(state, params, eps, options);
    const inside = Math.abs(state.x) <= params.L + eps.x;
    const dRemCurrent = pick.target - state.x;
    const a = applyVelocityScaling(pick, state, params, options);
    const stageInfo = { ...pick, a, inside, dRem: dRemCurrent };
    if (!firstStage) firstStage = stageInfo;
    lastStage = stageInfo;
    const hysteresisStage = pick.stage === 'coast' ? 'accel' : pick.stage;
    state.stage = pick.stage;
    state.a = a;

    const tTarget = Number.isFinite(pick.target) ? timeToX(state.x, state.v, a, pick.target, eps.t) : Infinity;
    const tStop = timeToV0(state.v, a, eps.t);
    const tVmax = timeToVmax(state.v, a, params.vmax, eps.t);
    const tLimitPlus = timeToX(state.x, state.v, a, +params.L, eps.t);
    const tLimitMinus = timeToX(state.x, state.v, a, -params.L, eps.t);
    const tLand = Math.min(tLimitPlus, tLimitMinus);

    let evtTime = Infinity;
    let evt = null;

    if (tLand < evtTime - eps.t / 2) { evtTime = tLand; evt = 'land'; }
    if (tStop < evtTime - eps.t / 2) { evtTime = tStop; evt = 'toV0'; }
    if (tVmax < evtTime - eps.t / 2) { evtTime = tVmax; evt = 'toVmax'; }
    if (tTarget < evtTime - eps.t / 2) { evtTime = tTarget; evt = 'target'; }

    const tPiece = Math.min(dtLeft, evtTime);
    const span = integratePiece(state, a, tPiece);
    predicted = { x: span.x1, v: span.v1 };
    dtLeft -= tPiece;

    let note = 'full';
    if (evt && evtTime - tPiece <= eps.t) {
      note = evt;
      if (evt === 'land') {
        state.x = clamp(state.x, -params.L, params.L);
        state.v = 0;
        state.phase = 'toMid';
        events.push('land');
      } else if (evt === 'toV0') {
        state.v = 0;
        events.push('toV0');
      } else if (evt === 'toVmax') {
        const sign = a >= 0 ? 1 : -1;
        state.v = sign * params.vmax;
        events.push('toVmax');
      } else if (evt === 'target') {
        state.x = pick.target;
        state.v = 0;
        if (state.phase === 'toLimit') {
          state.phase = 'toMid';
        } else {
          state.phase = 'toLimit';
          state.side = -state.side;
        }
        events.push('target');
      }
      state.prevStage = hysteresisStage;
      pieces.push({ note, dt: tPiece, aSigned: a, ...span, x1: state.x, v1: state.v });
      continue;
    }

    pieces.push({ note, dt: tPiece, aSigned: a, ...span });
    state.prevStage = hysteresisStage;
  }

  const dtUsed = dt - dtLeft;
  const aEff = dtUsed > eps.t ? (state.v - vStart) / dtUsed : 0;

  const multiPhase = pieces.length > 1 || pieces.some(p => p.note !== 'full');

  return {
    dt: dtUsed,
    pieces,
    events,
    stage: lastStage,
    firstStage,
    aEff,
    sStop: lastStage && lastStage.decelDist !== undefined
      ? lastStage.decelDist
      : stopDistance(Math.abs(state.v), params.aCap),
    exhausted: dtLeft <= eps.t,
    predicted: predicted || { x: state.x, v: state.v },
    multiPhase,
  };
}

function stepWithoutEvents(state, params, eps, options, dt) {
  const pick = selectStage(state, params, eps, options);
  const inside = Math.abs(state.x) <= params.L + eps.x;
  const dRemCurrent = pick.target - state.x;
  const hysteresisStage = pick.stage === 'coast' ? 'accel' : pick.stage;
  state.stage = pick.stage;
  const a = applyVelocityScaling(pick, state, params, options);
  state.a = a;
  const span = integratePiece(state, a, dt);
  state.prevStage = hysteresisStage;
  const aEff = dt > eps.t ? (state.v - span.v0) / dt : 0;
  return {
    dt,
    pieces: [{ note: 'full', dt, aSigned: a, ...span }],
    events: [],
    stage: { ...pick, a, inside, dRem: dRemCurrent },
    firstStage: { ...pick, a, inside, dRem: dRemCurrent },
    aEff,
    sStop: pick.decelDist !== undefined
      ? pick.decelDist
      : stopDistance(Math.abs(state.v), params.aCap),
    exhausted: true,
    predicted: { x: span.x1, v: span.v1 },
    multiPhase: false,
  };
}

export class YawSimulation {
  constructor(customParams = {}) {
    this.params = { ...DEFAULT_PARAMS, ...customParams };
    this.eps = { ...DEFAULT_EPS };
    this.options = {
      subframe: true,
      velScaled: false,
      outsideRecover: true,
    };
    this.state = newState();
    this.lastStep = {
      dt: 0,
      pieces: [],
      events: [],
      stage: null,
      aEff: 0,
      sStop: 0,
      exhausted: true,
    };
  }

  reset(overrides = {}) {
    this.state = { ...newState(), ...overrides };
    if (Object.prototype.hasOwnProperty.call(overrides, 'side')) {
      this.state.side = overrides.side;
    }
    this.lastStep = {
      dt: 0,
      pieces: [],
      events: [],
      stage: null,
      aEff: 0,
      sStop: 0,
      exhausted: true,
    };
  }

  setParams(updates = {}) {
    this.params = { ...this.params, ...updates };
  }

  setEps(overrides = {}) {
    this.eps = { ...this.eps, ...overrides };
  }

  setOptions(overrides = {}) {
    this.options = { ...this.options, ...overrides };
  }

  getSnapshot() {
    return { ...this.state };
  }

  getParams() {
    return { ...this.params };
  }

  getLastStep() {
    return { ...this.lastStep };
  }

  getEps() {
    return { ...this.eps };
  }

  getOptions() {
    return { ...this.options };
  }

  setPose(x, v = this.state.v) {
    this.state.x = x;
    this.state.v = v;
    this.state.prevStage = this.state.stage;
  }

  setPhase(phase, side = this.state.side) {
    this.state.phase = phase;
    this.state.side = side;
  }

  step(dtOverride) {
    const dt = typeof dtOverride === 'number' ? dtOverride : this.params.dt;
    if (!(dt > 0)) {
      this.lastStep = {
        dt: 0,
        pieces: [],
        events: [],
        stage: this.lastStep.stage,
        aEff: 0,
        sStop: stopDistance(this.state.v, this.params.aCap),
        exhausted: true,
      };
      return this.lastStep;
    }

    const runner = this.options.subframe ? stepWithEvents : stepWithoutEvents;
    const result = runner(this.state, this.params, this.eps, this.options, dt);
    this.lastStep = result;
    return result;
  }
}

export const EPS_DEFAULTS = { ...DEFAULT_EPS };
