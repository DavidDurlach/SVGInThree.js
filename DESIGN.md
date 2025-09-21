## Animation Design Notes: Yaw vs Pitch (Direction, Limits, and Mouse Release)

### Overview
This document explains why yaw and pitch behave differently, especially regarding direction signs, reversal, and clamping, and comments on which design is preferable. It also notes what happens on mouse button release.

Context:
- Yaw angle is visually unbounded (continuous rotation; the underlying angle wraps/aliases), while pitch is inherently bounded in spherical coordinates (φ has a valid range), and the animation also sets a smaller, symmetric limit around a base orientation.

### 1) Pitch’s negative sign vs. yaw/zoom
- Pitch uses a negative sign when converting from the semantic direction to φ velocity, whereas yaw and zoom use their direction directly.
- Rationale: In spherical coordinates, increasing φ moves “down,” and decreasing φ moves “up.” The code keeps `pitchDir` as a semantic up (+1) / down (-1), then negates it to produce the correct sign for φ velocity so that “up” reduces φ.
- Conclusion: This is intentional and consistent. Removing the minus would force inverting every place that sets/uses `pitchDir` (e.g., bounces/resume), reducing clarity. Keeping the negative mapping is preferable.

Relevant snippet (from `js/animation/animation-engine.js`):

```js
function processPitchFSM(spin, s, dt) {
    let targetPitchVel = -spin.pitchDir * spin.pitchSpeed;
    // ...
}
```

### 2) Why pitch clamps and yaw does not; which design is better
There are two distinct clamps in play for pitch:

- Safety clamp of φ each frame (independent of animation limits), ensuring φ stays within a valid, non-singular range:

```js
// Clamp phi to valid range
s.phi = Math.max(0.01, Math.min(Math.PI - 0.01, s.phi));
```

- Animation-limit clamp at `basePol ± pitchLimit` inside the pitch bounce handler. If we overshoot the animation limit (e.g., due to easing, reversal thresholding, or user input), the code clamps φ to the animation boundary and flips direction:

```js
function handlePitchBounce(spin, s) {
    const dPol = s.phi - spin.basePol;
    if (Math.abs(dPol) > spin.pitchLimit) {
        spin.pitchDir = Math.sign(dPol);
        s.phi = spin.basePol + Math.sign(dPol) * spin.pitchLimit; // clamp to animation limit
    } else if (spin.pitchState === 'ePitch_SteadyStateVel' || 
               spin.pitchState === 'ePitch_IncreaseVelToSteadyState') {
        // predictive reversal similar to yaw (finishes accel-first)
        // ...
    }
}
```

Yaw, by contrast, has no inherent singularity and is visually unbounded. The animation employs a predictive reversal (runway-aware) near the yaw limit but does not hard-clamp yaw, preserving smoothness and avoiding discontinuities:

```js
function handleYawBounce(spin, s) {
    // dAz = shortest angular difference from baseAz
    if (Math.abs(dAz) > spin.yawLimit) {
        spin.yawDir = -Math.sign(dAz);
    } else if (spin.yawState === 'eYaw_SteadyStateVel' || 
               spin.yawState === 'eYaw_IncreaseVelToSteadyState') {
        // predictive early reversal near the limit; finish accel before reversing
        // ...
        initiateReversal(spin, 'yaw');
    }
}
```

Assessment of design quality:
- Pitch: Because φ is bounded, the safety clamp is essential, and the animation-limit clamp is a robust safety net if predictive reversal triggers late. Pitch also mirrors yaw’s predictive reversal behavior and completes acceleration before reversing, for smoothness.
- Yaw: Since yaw can be treated as unbounded, avoiding a hard clamp is preferred to prevent snapping/alias artifacts. Predictive reversal alone suffices for smooth oscillation about the base angle.

Conclusion: Pitch’s clamping is appropriate and robust for its bounded coordinate; yaw’s non-clamped, predictive reversal is appropriate for smooth horizontal rotation. The difference is justified by the underlying coordinate properties and yields better perceptual outcomes for each axis.

### Mouse button release (resume behavior)
After pointer-up (OrbitControls 'end' event), the app pauses during interaction and then resumes animation after a delay. On resume:
- Yaw: Direction may flip if the current azimuth offset exceeds the yaw animation limit.
- Pitch: `pitchDir` is set by the sign of the polar offset; because velocity uses the negative sign, the resulting motion reduces the offset.
- Zoom: If outside [zoomMin, zoomMax], `zoomDir` is set toward the midpoint; otherwise unchanged.
- All axes: FSMs reset to `*_SteadyStateZero` and `*_DesiredRunning=true` to accelerate smoothly from zero.

```js
export function resumeAnimationAfterInteraction(spin, camera, controls) {
    spin.paused = false;
    // compute offsets; adjust dirs if beyond limits
    if (Math.abs(dAz) > spin.yawLimit) {
        spin.yawDir = -Math.sign(dAz);
    }
    if (Math.abs(dPol) > spin.pitchLimit) {
        spin.pitchDir = Math.sign(dPol);
    }
    if (dist > spin.zoomMax || dist < spin.zoomMin) {
        const mid = (spin.zoomMax + spin.zoomMin) / 2;
        spin.zoomDir = Math.sign(mid - dist);
    }
    // restart FSMs from zero, accelerate to steady state
    spin.yawState = 'eYaw_SteadyStateZero';
    spin.pitchState = 'ePitch_SteadyStateZero';
    spin.panXState = 'ePanX_SteadyStateZero';
    spin.panYState = 'ePanY_SteadyStateZero';
    spin.zoomState = 'eZoom_SteadyStateZero';
    spin.yawDesiredRunning = true;
    spin.pitchDesiredRunning = true;
    spin.panXDesiredRunning = true;
    spin.panYDesiredRunning = true;
    spin.zoomDesiredRunning = true;
}
```

### Bounce Reversal Timing Note
During animation bounces, the reversal may occur up to `V_current * dt` earlier than the set limit boundary. This is because:
- The animation uses discrete time steps (dt) for integration
- Position is updated by `position += velocity * dt` each frame
- The reversal trigger checks if the next step would exceed the boundary
- Therefore, the actual reversal point can be up to one frame's worth of motion (`V * dt`) before the theoretical limit

This early reversal is intentional and ensures smooth bouncing without overshooting the boundaries.

### Summary
- Pitch's negative sign in velocity calculation is deliberate and maps human "up" to decreasing φ; it should be kept for clarity and consistency.
- Pitch clamps at the animation limit (and also has a safety clamp for φ's valid range); yaw does not clamp but uses predictive reversal. Given φ's bounded nature and yaw's unbounded nature, this split is the right design.
- On mouse release, both axes reset to a clean accelerate-from-zero path with sensible direction choices to recover smoothly.

### Q&A: Direction Sign Convention (Pitch vs Yaw)

**Question:**
Thank you. I want to debate your comment that pitchDir sign has intrinsic difference between Yaw and Pitch:
1) Direction of motion is arbitrary.
2) If when you first reviewed it the sign had been the same, would you have flagged that as a problem/error?

**Answer (short):**
- Yes, direction is arbitrary; there’s no intrinsic need for pitch to negate where yaw doesn’t.
- I would only flag “same-sign as yaw” as a problem if it broke consistency with the rest of the pitch logic (bounce/resume/reversal). If all related spots were adjusted together, it would be fine.

**Answer (details):**
- Pitch currently uses a convention: `pitchDir = +1` means “move up” (reduce φ), so velocity is computed as `-pitchDir * pitchSpeed`. This keeps human semantics (up/down) decoupled from spherical φ’s sign.
- You could flip the convention to match yaw (no leading minus) if you simultaneously invert where `pitchDir` is set. Concretely:
  - Today: `pitchDir = Math.sign(dPol)` and velocity is `-pitchDir * speed` → moves back toward base.
  - Alternative: velocity = `+pitchDir * speed` would require `pitchDir = -Math.sign(dPol)` everywhere it’s set (e.g., bounce and resume), and removing the explicit negation in:
    - `processPitchFSM`
    - `transitionToSteadyVel` / `processAccelToSteady` / `processReversal` param maps (they currently use `-spin.pitchDir`).
- So, I wouldn’t flag “same-sign as yaw” as a bug by itself; I’d only flag it if the supporting code wasn’t updated, which would manifest as pitch accelerating away from the limit/base after bounce/resume.


