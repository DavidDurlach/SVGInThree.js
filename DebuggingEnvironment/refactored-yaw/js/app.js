import { YawSimulation } from './sim/simulation.js';

// ---------- Logging capture ----------
const LOG_CAPTURE_ENABLED = true;
const LOG_BUFFER_MAX = 1200;
const logBuffer = [];

const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

function pushLog(level, args) {
  if (!LOG_CAPTURE_ENABLED) return;
  const ts = new Date().toISOString().split('T')[1].replace('Z', '');
  const flat = Array.from(args).map(v => {
    try {
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
    } catch (err) {
      return String(v);
    }
  }).join(' ');
  logBuffer.push(`[${ts}] ${level.toUpperCase()}: ${flat}`);
  if (logBuffer.length > LOG_BUFFER_MAX) logBuffer.shift();
}

console.log = (...args) => { originalConsole.log.apply(console, args); pushLog('log', args); };
console.warn = (...args) => { originalConsole.warn.apply(console, args); pushLog('warn', args); };
console.error = (...args) => { originalConsole.error.apply(console, args); pushLog('error', args); };

// ---------- DOM helpers ----------
const el = id => document.getElementById(id);

const $ = {
  play: el('play'),
  step: el('step'),
  reset: el('reset'),
  limit: el('limit'),
  limitV: el('limitV'),
  vmax: el('vmax'),
  vmaxV: el('vmaxV'),
  dt: el('dt'),
  acap: el('acap'),
  acapV: el('acapV'),
  subframe: el('subframe'),
  velScaled: el('velScaled'),
  outsideRecover: el('outsideRecover'),
  pauseOnAnom: el('pauseOnAnom'),
  dragPauses: el('dragPauses'),
  xV: el('xV'), vV: el('vV'), aV: el('aV'), dremV: el('dremV'),
  phaseV: el('phaseV'), dirV: el('dirV'),
  tV: el('tV'), anomV: el('anomV'), evtV: el('evtV'),
  modeV: el('modeV'), apexV: el('apexV'), sStopV: el('sStopV'),
  simState: el('simState'),
  dial: el('dial'),
  plot1: el('plot1'),
  plot2: el('plot2'),
  anomsBox: el('anomsBox'),
  logsBox: el('logsBox'),
  copyAnoms: el('copyAnoms'),
  clearAnoms: el('clearAnoms'),
  copyLogs: el('copyLogs'),
  clearLogs: el('clearLogs'),
};

const ctxDial = $.dial.getContext('2d');
const ctxPlot1 = $.plot1.getContext('2d');
const ctxPlot2 = $.plot2.getContext('2d');

const rad = deg => deg * Math.PI / 180;

// ---------- Simulation ----------
const sim = new YawSimulation({
  L: Number($.limit.value),
  vmax: Number($.vmax.value),
  aCap: Number($.acap.value),
  dt: Number($.dt.value) / 1000,
});

sim.setOptions({
  subframe: $.subframe.checked,
  velScaled: $.velScaled.checked,
  outsideRecover: $.outsideRecover.checked,
});

const uiState = {
  running: false,
  drag: { active: false, wasRunning: false },
  trails: [],
  dots: [],
  anomalies: [],
  aEffHistory: [],
  frameIndex: 0,
  resumePolicy: document.querySelector('input[name="resume"]:checked').value,
  lastSnapshot: sim.getSnapshot(),
  lastStep: sim.getLastStep(),
};

const DETECT = {
  jerkLimit: 3500,
  startupIgnoreFrames: 3,
  cmdDeltaFactorIgnore: 0.85,
  lateAccelMarginDeg: 0.5,
  oscWindow: 40,
  oscFlips: 10,
  oscAmpMin: 80,
  oscStartAfterFrames: 12,
};

// ---------- Helpers ----------
function updateParamsFromUI() {
  sim.setParams({
    L: Number($.limit.value),
    vmax: Number($.vmax.value),
    aCap: Number($.acap.value),
    dt: Number($.dt.value) / 1000,
  });
}

function updateOptionsFromUI() {
  sim.setOptions({
    subframe: $.subframe.checked,
    velScaled: $.velScaled.checked,
    outsideRecover: $.outsideRecover.checked,
  });
}

function cloneSnapshot(snapshot) {
  return snapshot ? { ...snapshot } : null;
}

function cloneStep(step) {
  if (!step) return null;
  return {
    aEff: step.aEff ?? 0,
    dt: step.dt ?? 0,
    sStop: step.sStop ?? 0,
    stage: step.stage ? { ...step.stage } : null,
    firstStage: step.firstStage ? { ...step.firstStage } : null,
    pieces: step.pieces ? step.pieces.map(p => ({ ...p })) : [],
    events: step.events ? [...step.events] : [],
  };
}

function updateHeaderLabels() {
  $.limitV.textContent = Number($.limit.value).toFixed(0);
  $.vmaxV.textContent = Number($.vmax.value).toFixed(0);
  $.acapV.textContent = Number($.acap.value).toFixed(0);
}

function computeDerived() {
  const snapshot = uiState.lastSnapshot;
  const params = sim.getParams();
  const eps = sim.getEps();
  const step = uiState.lastStep;
  const stage = step.stage;
  const target = stage && Number.isFinite(stage.target)
    ? stage.target
    : (snapshot.phase === 'toLimit' ? snapshot.side * params.L : 0);
  const dRem = target - snapshot.x;
  const dir = snapshot.phase === 'toLimit'
    ? (snapshot.side >= 0 ? +1 : -1)
    : (snapshot.x >= 0 ? -1 : 1);
  const mode = Math.abs(snapshot.x) <= params.L + eps.x ? 'inside' : 'outside';
  return { snapshot, params, eps, step, stage, target, dRem, dir, mode };
}

function renderTextBoxes() {
  $.logsBox.value = logBuffer.slice(-LOG_BUFFER_MAX).join('\n');
  $.logsBox.scrollTop = $.logsBox.scrollHeight;
  $.anomsBox.value = uiState.anomalies.join('\n\n');
}

function updateReadouts() {
  const { snapshot, params, step, dRem, dir, mode, target } = computeDerived();
  $.xV.textContent = snapshot.x.toFixed(2);
  $.vV.textContent = snapshot.v.toFixed(2);
  $.aV.textContent = (step ? step.aEff : 0).toFixed(2);
  $.dremV.textContent = dRem.toFixed(2);
  $.phaseV.textContent = snapshot.phase;
  $.dirV.textContent = dir > 0 ? '+1' : '-1';
  $.tV.textContent = snapshot.t.toFixed(3);
  $.modeV.textContent = mode;
  $.apexV.textContent = snapshot.phase === 'toLimit' ? (snapshot.side >= 0 ? '+L' : '-L') : '0°';
  $.sStopV.textContent = step ? step.sStop.toFixed(2) : '0.00';
  $.evtV.textContent = (step && step.events.length) ? step.events.join('|') : '—';
  $.anomV.textContent = '—';
  $.anomV.className = 'v';
  $.simState.textContent = uiState.running ? 'running' : 'paused';
  if (target !== undefined) {
    // no additional UI update needed; target helps logs
  }
}

function drawDial() {
  const { snapshot, params } = computeDerived();
  const w = $.dial.width;
  const h = $.dial.height;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.32;
  ctxDial.clearRect(0, 0, w, h);

  ctxDial.save();
  ctxDial.translate(cx, cy);
  ctxDial.strokeStyle = '#273041';
  ctxDial.lineWidth = 10;
  ctxDial.beginPath();
  ctxDial.arc(0, 0, R, 0, Math.PI * 2);
  ctxDial.stroke();
  ctxDial.restore();

  ctxDial.fillStyle = '#cbd5e1';
  ctxDial.beginPath();
  ctxDial.arc(cx, cy - R - 14, 6, 0, Math.PI * 2);
  ctxDial.fill();
  ctxDial.font = '12px system-ui';
  ctxDial.textAlign = 'center';
  ctxDial.fillText('UP', cx, cy - R - 22);

  const ray = (angleFromUp, color, dash) => {
    const a = rad(angleFromUp - 90);
    const dx = Math.cos(a) * R;
    const dy = Math.sin(a) * R;
    ctxDial.save();
    ctxDial.setLineDash(dash || []);
    ctxDial.strokeStyle = color;
    ctxDial.lineWidth = 2;
    ctxDial.beginPath();
    ctxDial.moveTo(cx, cy);
    ctxDial.lineTo(cx + dx, cy + dy);
    ctxDial.stroke();
    ctxDial.restore();
  };

  ray(+params.L, '#3b475a', [6, 6]);
  ray(-params.L, '#3b475a', [6, 6]);

  const a = rad(snapshot.x - 90);
  const dx = Math.cos(a) * R;
  const dy = Math.sin(a) * R;
  ctxDial.strokeStyle = '#6cf09a';
  ctxDial.lineWidth = 4;
  ctxDial.beginPath();
  ctxDial.moveTo(cx, cy);
  ctxDial.lineTo(cx + dx, cy + dy);
  ctxDial.stroke();
}

function drawPlots(clear) {
  const { snapshot, params } = computeDerived();
  const w1 = $.plot1.width;
  const h1 = $.plot1.height;
  const w2 = $.plot2.width;
  const h2 = $.plot2.height;

  if (clear) {
    ctxPlot1.clearRect(0, 0, w1, h1);
    ctxPlot2.clearRect(0, 0, w2, h2);
  } else {
    ctxPlot1.fillStyle = 'rgba(11,13,16,0.20)';
    ctxPlot1.fillRect(0, 0, w1, h1);
    ctxPlot2.fillStyle = 'rgba(11,13,16,0.20)';
    ctxPlot2.fillRect(0, 0, w2, h2);
  }

  const T = 5.0;
  const t0 = Math.max(0, snapshot.t - T);
  const tX = (t, w) => ((t - t0) / T) * w;
  const maxAbsX = params.L * 1.2 + 10;
  const maxAbsV = Math.max(30, params.vmax * 1.5);
  const maxAbsA = Math.max(100, params.aCap * 1.2);
  const yX = (x, h) => h * 0.5 - (x / maxAbsX) * h * 0.45;
  const yV = (v, h) => h * 0.5 - (v / maxAbsV) * h * 0.45;
  const yA = (a, h) => h * 0.5 - (a / maxAbsA) * h * 0.45;

  ctxPlot1.strokeStyle = '#3b475a';
  ctxPlot1.lineWidth = 1;
  ctxPlot1.beginPath();
  ctxPlot1.moveTo(0, yX(+params.L, h1));
  ctxPlot1.lineTo(w1, yX(+params.L, h1));
  ctxPlot1.moveTo(0, yX(-params.L, h1));
  ctxPlot1.lineTo(w1, yX(-params.L, h1));
  ctxPlot1.stroke();

  ctxPlot1.strokeStyle = '#705b2a';
  ctxPlot1.beginPath();
  ctxPlot1.moveTo(0, yV(+params.vmax, h1));
  ctxPlot1.lineTo(w1, yV(+params.vmax, h1));
  ctxPlot1.moveTo(0, yV(-params.vmax, h1));
  ctxPlot1.lineTo(w1, yV(-params.vmax, h1));
  ctxPlot1.stroke();

  const lastTrail = uiState.trails[uiState.trails.length - 1];
  if (clear || !lastTrail || Math.abs(lastTrail.t - snapshot.t) > 1e-9) {
    uiState.trails.push({ t: snapshot.t, x: snapshot.x, v: snapshot.v, a: uiState.lastStep.aEff });
  } else {
    lastTrail.x = snapshot.x;
    lastTrail.v = snapshot.v;
    lastTrail.a = uiState.lastStep.aEff;
  }
  while (uiState.trails.length && uiState.trails[0].t < t0) uiState.trails.shift();

  ctxPlot1.strokeStyle = '#9ab5ff';
  ctxPlot1.beginPath();
  uiState.trails.forEach((p, i) => {
    const X = tX(p.t, w1);
    const Y = yX(p.x, h1);
    if (i === 0) ctxPlot1.moveTo(X, Y); else ctxPlot1.lineTo(X, Y);
  });
  ctxPlot1.stroke();

  ctxPlot1.strokeStyle = '#f9d67a';
  ctxPlot1.beginPath();
  uiState.trails.forEach((p, i) => {
    const X = tX(p.t, w1);
    const Y = yV(p.v, h1);
    if (i === 0) ctxPlot1.moveTo(X, Y); else ctxPlot1.lineTo(X, Y);
  });
  ctxPlot1.stroke();

  ctxPlot2.strokeStyle = '#c0ffee';
  ctxPlot2.beginPath();
  uiState.trails.forEach((p, i) => {
    const X = tX(p.t, w2);
    const Y = yA(p.a, h2);
    if (i === 0) ctxPlot2.moveTo(X, Y); else ctxPlot2.lineTo(X, Y);
  });
  ctxPlot2.stroke();

  ctxPlot2.strokeStyle = '#8b949e';
  ctxPlot2.beginPath();
  uiState.trails.forEach((p, i) => {
    const s = (p.v * p.v) / (2 * Math.max(1e-6, params.aCap));
    const X = tX(p.t, w2);
    const Y = yA(s, h2);
    if (i === 0) ctxPlot2.moveTo(X, Y); else ctxPlot2.lineTo(X, Y);
  });
  ctxPlot2.stroke();

  uiState.dots = uiState.dots.filter(d => d.t >= t0);
  ctxPlot1.fillStyle = '#7ee787';
  uiState.dots.forEach(d => {
    const X = tX(d.t, w1);
    const Y = yX(d.x, h1);
    ctxPlot1.beginPath();
    ctxPlot1.arc(X, Y, 3, 0, Math.PI * 2);
    ctxPlot1.fill();
  });
}

function paint(clearPlots) {
  uiState.lastSnapshot = sim.getSnapshot();
  drawDial();
  drawPlots(clearPlots);
  updateReadouts();
  updateHeaderLabels();
}

function logFrame(result) {
  if (!result) return;
  if ((uiState.frameIndex % 1) !== 0) return;
  const { snapshot, params, stage, dRem, dir } = computeDerived();
  const events = result.pieces.map(p => p.note).join('|') || '-';
  console.log(`[FRAME] t=${snapshot.t.toFixed(3)} x=${snapshot.x.toFixed(2)} v=${snapshot.v.toFixed(2)} aEff=${result.aEff.toFixed(2)} L=${params.L} dir=${dir} phase=${snapshot.phase} dRem=${dRem.toFixed(2)} events=${events}`);
  renderTextBoxes();
}

function handleEvents(result) {
  if (!result) return;
  if (result.events.includes('land')) {
    const snap = uiState.lastSnapshot;
    uiState.dots.push({ t: snap.t, x: snap.x });
  }
}

function checkAnomaly(prevSnapshot, prevStep, result, dt) {
  if (!result || !prevSnapshot) {
    $.anomV.textContent = '—';
    $.anomV.className = 'v';
    return;
  }

  const { snapshot, params } = computeDerived();
  const aEff = result.aEff;
  const dv = snapshot.v - prevSnapshot.v;
  const multiPhase = !!result.multiPhase;

  const epsV = Math.max(0.5, 0.02 * Math.max(10, Math.abs(params.vmax)));
  const epsT = 0.004;

  const A_fail = !multiPhase && Math.abs(dv - aEff * dt) > epsV;
  const B_fail = !multiPhase && (Math.abs(aEff) > 1e-4 ? Math.abs((dv / aEff) - dt) > epsT : false);

  const predicted = result.predicted || { x: snapshot.x, v: snapshot.v };
  const rV = Math.abs(snapshot.v - predicted.v);
  const rX = Math.abs(snapshot.x - predicted.x);
  const C_fail = rV > epsV || rX > Math.max(1.0, 0.01 * params.L);

  const vAbs = Math.abs(snapshot.v);
  const tooFast = vAbs > 3 * params.vmax + 15;

  const aMaxPiece = result.pieces && result.pieces.length
    ? result.pieces.reduce((m, p) => Math.max(m, Math.abs(p.aSigned || 0)), 0)
    : Math.abs(aEff);
  const tooAccel = aMaxPiece > (params.aCap + 1e-6);

  const dDecelNeedAtCap = (params.vmax * params.vmax) / (2 * Math.max(1e-6, params.aCap));
  const firstStage = result.firstStage;
  let dRem0 = Math.abs((prevSnapshot.phase === 'toLimit' ? prevSnapshot.side * params.L : 0) - prevSnapshot.x);
  let lateAccel = false;
  if (firstStage) {
    const dRemCandidate = Math.abs(firstStage.dRem ?? (firstStage.target - prevSnapshot.x));
    dRem0 = dRemCandidate;
    lateAccel = (firstStage.inside ?? true) && firstStage.stage === 'accel' && dRem0 <= dDecelNeedAtCap + DETECT.lateAccelMarginDeg;
  }

  const phaseChange = prevSnapshot.phase !== snapshot.phase;
  const prevACmd = prevStep && prevStep.stage ? (prevStep.stage.a ?? 0) : 0;
  const aCmd0 = firstStage ? firstStage.a : (result.stage ? result.stage.a : 0);
  const dCmd = Math.abs(aCmd0 - prevACmd);
  const prevAEff = prevStep ? (prevStep.aEff ?? 0) : 0;
  const jerk = Math.abs(aEff - prevAEff) / (dt || 1e-6);

  uiState.aEffHistory.push(aEff);
  if (uiState.aEffHistory.length > DETECT.oscWindow) uiState.aEffHistory.shift();

  let flips = 0;
  for (let i = 1; i < uiState.aEffHistory.length; i++) {
    const a0 = uiState.aEffHistory[i - 1];
    const a1 = uiState.aEffHistory[i];
    if (Math.sign(a0) !== Math.sign(a1) && Math.max(Math.abs(a0), Math.abs(a1)) > DETECT.oscAmpMin) {
      flips++;
    }
  }
  const oscillation = (uiState.frameIndex > DETECT.oscStartAfterFrames) && (flips >= DETECT.oscFlips);

  const jerkSpike =
    (uiState.frameIndex > DETECT.startupIgnoreFrames) &&
    !result.events.includes('land') &&
    !result.events.includes('toV0') &&
    !result.events.includes('toVmax') &&
    !phaseChange &&
    (!result.stage || result.stage.stage !== 'coast') &&
    dCmd < DETECT.cmdDeltaFactorIgnore * params.aCap &&
    jerk > DETECT.jerkLimit;

  const crazy = !Number.isFinite(snapshot.x) || !Number.isFinite(snapshot.v) || !Number.isFinite(aEff);

  const flag = A_fail || B_fail || C_fail || tooFast || tooAccel || lateAccel || jerkSpike || oscillation || crazy;

  if (!flag) {
    $.anomV.textContent = '—';
    $.anomV.className = 'v';
    return;
  }

  const dir = snapshot.phase === 'toLimit' ? (snapshot.side >= 0 ? +1 : -1) : (snapshot.x >= 0 ? -1 : 1);
  const apexTarget = snapshot.phase === 'toLimit' ? snapshot.side * params.L : 0;
  const dRem = apexTarget - snapshot.x;
  const sStop = result.sStop;
  const reasons = [];
  if (A_fail) reasons.push('dv≠a·dt');
  if (B_fail) reasons.push('(dv/a)≠dt');
  if (C_fail) reasons.push('predictor-residual');
  if (tooFast) reasons.push('tooFast');
  if (tooAccel) reasons.push('tooAccel');
  if (lateAccel) reasons.push('late-accel-near-apex');
  if (jerkSpike) reasons.push('jerk-spike');
  if (oscillation) reasons.push('oscillation');
  if (crazy) reasons.push('NaN/Inf');

  const pieceLines = (result.pieces || []).map((p, i) =>
    `  piece[${i}] note=${p.note} dt=${p.dt.toFixed(6)} a=${(p.aSigned ?? 0).toFixed(3)} x0=${p.x0.toFixed(3)} v0=${p.v0.toFixed(3)} -> x1=${p.x1.toFixed(3)} v1=${p.v1.toFixed(3)}`
  ).join('\\n');

  const planInfo = firstStage
    ? `plan0: stage=${firstStage.stage} a=${(firstStage.a ?? 0).toFixed(3)} dTow=${(firstStage.dTow ?? 0).toFixed(3)} dBrake=${(firstStage.dBrake ?? 0).toFixed(3)} inside=${firstStage.inside ? 'true' : 'false'} dRem=${(firstStage.dRem ?? 0).toFixed(3)}`
    : 'plan0: n/a';

  const line = `[ANOM] t=${snapshot.t.toFixed(6)} x=${snapshot.x.toFixed(3)} v=${snapshot.v.toFixed(3)} aEff=${aEff.toFixed(3)} aMax=${aMaxPiece.toFixed(3)} L=${params.L}` +
    ` dir=${dir} phase=${snapshot.phase} dRem=${dRem.toFixed(3)} sStop=${sStop.toFixed(3)} reasons=${reasons.join('|')}\\n${planInfo}` +
    (pieceLines ? `\\n${pieceLines}` : '');

  console.warn(line);
  uiState.anomalies.unshift(line);
  if (uiState.anomalies.length > 500) uiState.anomalies.pop();
  $.anomV.textContent = reasons.join(', ');
  $.anomV.className = 'v warn';
  renderTextBoxes();
  if ($.pauseOnAnom.checked) pause();
}

function applyStep(result, prevSnapshot, prevStep, dt) {
  uiState.lastStep = result;
  uiState.lastSnapshot = sim.getSnapshot();
  handleEvents(result);
  checkAnomaly(prevSnapshot, prevStep, result, dt);
  paint(false);
  renderTextBoxes();
  uiState.frameIndex += 1;
  logFrame(result);
}

// ---------- Loop ----------
function frame() {
  if (!uiState.running) return;
  updateParamsFromUI();
  updateOptionsFromUI();
  const prevSnapshot = cloneSnapshot(uiState.lastSnapshot);
  const prevStep = cloneStep(uiState.lastStep);
  const dt = sim.getParams().dt;
  const result = sim.step(dt);
  applyStep(result, prevSnapshot, prevStep, dt);
  requestAnimationFrame(frame);
}

function play() {
  if (uiState.running) return;
  uiState.running = true;
  $.play.textContent = '❚❚ Pause';
  $.simState.textContent = 'running';
  requestAnimationFrame(frame);
}

function pause() {
  if (!uiState.running) return;
  uiState.running = false;
  $.play.textContent = '▶︎ Play';
  $.simState.textContent = 'paused';
}

// ---------- Event wiring ----------
$.play.addEventListener('click', () => {
  if (uiState.running) pause(); else play();
});

$.step.addEventListener('click', () => {
  if (uiState.running) return;
  updateParamsFromUI();
  updateOptionsFromUI();
  const prevSnapshot = cloneSnapshot(uiState.lastSnapshot);
  const prevStep = cloneStep(uiState.lastStep);
  const dt = sim.getParams().dt;
  const result = sim.step(dt);
  applyStep(result, prevSnapshot, prevStep, dt);
});

$.reset.addEventListener('click', () => {
  pause();
  sim.reset();
  updateParamsFromUI();
  updateOptionsFromUI();
  uiState.trails.length = 0;
  uiState.dots.length = 0;
  uiState.anomalies.length = 0;
  uiState.aEffHistory.length = 0;
  uiState.frameIndex = 0;
  uiState.lastStep = sim.getLastStep();
  uiState.lastSnapshot = sim.getSnapshot();
  $.evtV.textContent = '—';
  $.anomV.textContent = '—';
  $.anomV.className = 'v';
  paint(true);
  renderTextBoxes();
});

$.limit.addEventListener('input', () => { updateParamsFromUI(); paint(false); });
$.vmax.addEventListener('input', () => { updateParamsFromUI(); paint(false); });
$.acap.addEventListener('input', () => { updateParamsFromUI(); paint(false); });
$.dt.addEventListener('change', () => { updateParamsFromUI(); paint(false); });

$.subframe.addEventListener('change', () => { updateOptionsFromUI(); paint(false); });
$.velScaled.addEventListener('change', () => { updateOptionsFromUI(); paint(false); });
$.outsideRecover.addEventListener('change', () => { updateOptionsFromUI(); paint(false); });

document.querySelectorAll('input[name="resume"]').forEach(r => {
  r.addEventListener('change', () => {
    uiState.resumePolicy = document.querySelector('input[name="resume"]:checked').value;
  });
});

function canvasToAngleFromUp(ev) {
  const rect = $.dial.getBoundingClientRect();
  const x = ev.clientX - rect.left;
  const y = ev.clientY - rect.top;
  const ax = x * ($.dial.width / rect.width);
  const ay = y * ($.dial.height / rect.height);
  const cx = $.dial.width / 2;
  const cy = $.dial.height / 2;
  const ang = Math.atan2(ay - cy, ax - cx) * 180 / Math.PI;
  return ((ang + 90 + 540) % 360) - 180;
}

$.dial.addEventListener('pointerdown', e => {
  $.dial.setPointerCapture(e.pointerId);
  uiState.drag.active = true;
  uiState.drag.wasRunning = uiState.running;
  if ($.dragPauses.checked) pause();
});

$.dial.addEventListener('pointermove', e => {
  if (!uiState.drag.active) return;
  const angle = canvasToAngleFromUp(e);
  sim.setPose(angle, 0);
  sim.setPhase('toLimit', angle >= 0 ? +1 : -1);
  uiState.lastSnapshot = sim.getSnapshot();
  paint(false);
});

$.dial.addEventListener('pointerup', e => {
  if (!uiState.drag.active) return;
  uiState.drag.active = false;
  $.dial.releasePointerCapture(e.pointerId);
  const snapshot = sim.getSnapshot();
  let side = snapshot.x >= 0 ? +1 : -1;
  if (uiState.resumePolicy === 'nearestApex') {
    const params = sim.getParams();
    const dPlus = Math.abs(params.L - snapshot.x);
    const dMinus = Math.abs(-params.L - snapshot.x);
    side = dPlus <= dMinus ? +1 : -1;
    sim.setPhase('toLimit', side);
  } else {
    side = snapshot.x >= 0 ? +1 : -1;
    sim.setPhase('toMid', side);
  }
  sim.setPose(snapshot.x, 0);
  uiState.lastSnapshot = sim.getSnapshot();
  paint(false);
  if (uiState.drag.wasRunning) play();
});

$.copyAnoms.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($.anomsBox.value); }
  catch (err) { console.warn('Clipboard failed', err); }
});

$.clearAnoms.addEventListener('click', () => {
  uiState.anomalies.length = 0;
  renderTextBoxes();
});

$.copyLogs.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($.logsBox.value); }
  catch (err) { console.warn('Clipboard failed', err); }
});

$.clearLogs.addEventListener('click', () => {
  logBuffer.length = 0;
  renderTextBoxes();
});

// ---------- Init ----------
console.log('[INIT] Refactored build loaded (GUI split from logic).');
updateParamsFromUI();
updateOptionsFromUI();
paint(true);
renderTextBoxes();
$.anomV.textContent = '—';
$.anomV.className = 'v';
$.simState.textContent = 'paused';
