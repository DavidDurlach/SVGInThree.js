

Here is the **single, integrated spec (v1.1)** that consolidates the selector, stages, orchestrator rules, and tolerances into one coherent document. I’ve pinned behaviors to the versions you shared (v8 for clamp/inward‑recovery/diagnostics; v9.1 for apex‑aligned planning and the `toV0` stop‑short) so each choice has a clear provenance you can verify.

yaw-2d-sim-v8-GeminiDeepThink

yaw-2d-sim-v9.1 (1)

  
(An external review concurred with this direction and emphasized orchestrator precision and well‑defined tolerances; those points are captured here.

2025-09-21 722 PM GeminiThought…

)

* * *

Yaw One‑Axis Controller — **Spec v1.1** (Selector + Stages + Orchestrator + Tolerances)
=======================================================================================

0) Definitions & Symbols (apex‑aligned)
---------------------------------------

Given snapshot  $S=\{t,x,v,\mathrm{dir},L,V_{\max},a_{\cap},dt\}$ :

*   **apex**  $=\begin{cases}+L,&\mathrm{dir}=+1\\-L,&\mathrm{dir}=-1\end{cases}$ 
    
*   **Runway**  $d = |\,\mathrm{apex}-x\,|$ 
    
*   **Velocity toward apex**  $v_{\rightarrow} = v\cdot \mathrm{dir}$   
    ( $>0$  moving **toward** apex;  $<0$  **away**)
    
*   **Shape accel**  $a_{\text{shape}}=\dfrac{2V_{\max}^{2}-v_{\rightarrow}^{2}}{2d}$ 
    
*   **Capped accel**  $\hat a = \min(a_{\cap}, \max(\varepsilon, a_{\text{shape}}))$ 
    
*   **Decel distance need**  $D_{\text{need}}(\hat a)=\dfrac{V_{\max}^{2}}{2\hat a}$ 
    
*   **Stop distance**  $s_{\text{stop}}=\dfrac{v_{\rightarrow}^{2}}{2|a|}$ 
    
*   **Stop time**  $t_{\text{stop}}=\dfrac{v_{\rightarrow}}{|a|}$  (only if  $v_{\rightarrow}>0$ )
    

> Apex‑aligned frame & `toV0` stop‑short derive from your v9.1 planner; clamp & inward outside‑recovery come from v8.
> 
> yaw-2d-sim-v9.1 (1)
> 
> yaw-2d-sim-v8-GeminiDeepThink

* * *

1) Snapshot (the only data that flows)
--------------------------------------

    type Snapshot = {
      // state
      t: number;        // s
      x: number;        // deg (from UP, CCW+)
      v: number;        // deg/s
      dir: +1 | -1;     // target apex (+L or -L)
      phase: 'accel' | 'decel';
      mode:  'inside' | 'outside';
    
      // configuration
      L: number;        // deg
      vmax: number;     // deg/s
      acap: number;     // deg/s^2
      dt: number;       // s (budget for this call)
    
      // optional diagnostics data (pass‑through)
      tick?: number;
    };
    

**Rule:** Stages are pure; they read _only_ the incoming `Snapshot` and return a new one (no globals).

* * *

2) Global tolerances (single source of truth)
---------------------------------------------

    EPS = {
      x:   max(1e-4, 1e-6 * L),     // deg  — positional epsilon
      v:   max(1e-3, 1e-4 * vmax),  // deg/s— velocity epsilon
      t:   1e-8,                    // s    — time epsilon
      sel: 0.10                     // deg  — selector runway margin (anti-chatter)
    }
    

All comparisons in selector & stages use the same EPS; only `EPS.sel` is selector‑only “stickiness” to avoid flip‑flop at the accel/decel boundary, per the external review.

2025-09-21 722 PM GeminiThought…

* * *

3) Selector (declarative; no physics inside)
--------------------------------------------

Evaluate once per sub‑slice, _before_ calling any stage:

1.  If  $|x| > L + EPS.x$  → **Outside→Inside · Recover**
    
2.  Else if  $v_{\rightarrow} \le EPS.v$  → **Inside→Apex · Accel** _(I1: never decelerate away from apex)_
    
3.  Else if  $v_{\rightarrow} \ge V_{\max}-EPS.v$  → **Inside→Apex · Decel**
    
4.  Else compute  $\hat a$  and  $D_{\text{need}}(\hat a)$ :
    
    *   If  $d \ge D_{\text{need}}(\hat a)+EPS.sel$  → **Inside→Apex · Accel**
        
    *   If  $d \le D_{\text{need}}(\hat a)-EPS.sel$  → **Inside→Apex · Decel**
        
    *   Otherwise (neutral band): **keep previous `phase`** for this frame.
        

**Invariants enforced by selector**

*   **I1 — No‑brake‑away:**  $v_{\rightarrow}\le EPS.v\Rightarrow$  pick **Accel** (this prevents the v9.1 “post‑toV0 decel‑away” regression).
    
    yaw-2d-sim-v9.1 (1)
    
*   **I2 — Clamp+Flip safety:** if any _full_ piece would cross  $\pm L$  without an explicit `land`, perform **ApexFlip** immediately (zero time), exactly as in v8.
    
    yaw-2d-sim-v8-GeminiDeepThink
    

* * *

4) Stage API (sealed solvers)
-----------------------------

    type Piece = { note:'full'|'toVmax'|'toV0'|'land'; dt:number; a:number; x0:number; v0:number; x1:number; v1:number };
    
    type StageOutcome =
      | { kind:'consumed', snap: Snapshot, pieces: Piece[] }                  // used exactly dt
      | { kind:'event',    snap: Snapshot, pieces: Piece[], event: Ev };      // ended early
    
    type Ev = 'toVmax'|'toV0'|'land'|'reenterBand'|'crossedApexClamp';
    type StageFn = (snap: Snapshot) => StageOutcome;
    

**Integrator (inside stages):** closed‑form kinematics  
 $x_1=x_0+v_0\Delta t+\tfrac12 a\Delta t^2,\quad v_1=v_0+a\Delta t$ .  
Pieces carry exact end states for diagnostics (as in v8).

yaw-2d-sim-v8-GeminiDeepThink

* * *

5) Stage contracts (pre · law · events · post)
----------------------------------------------

### 5.1 Inside→Apex · **Accel**

**Pre**:  $|x|\le L+EPS.x$  and  $(v_{\rightarrow}\le EPS.v\ \lor\ d \ge D_{\text{need}}(\hat a)+EPS.sel)$ .  
**Law**:  $a=+\mathrm{dir}\cdot \hat a$  with  $\hat a=\min(a_{\cap},\max(\varepsilon,a_{\text{shape}}))$ .  
**Events**:

*   **toVmax** if  $v$  reaches  $\mathrm{dir}\cdot V_{\max}$  within this slice; split and return `event:'toVmax'`.  
    **Post**: Return updated  $x,v$ ; `phase='accel'`.
    

_(Apex‑aligned shaping from v9.1.)_

yaw-2d-sim-v9.1 (1)

* * *

### 5.2 Inside→Apex · **Decel**

**Pre**:  $|x|\le L+EPS.x$  and  $v_{\rightarrow}>EPS.v$  and  
 $(d \le D_{\text{need}}(\hat a)-EPS.sel\ \lor\ v_{\rightarrow}\ge V_{\max}-EPS.v)$ .  
**Law**:  $a=-\mathrm{dir}\cdot \min\!\big(a_{\cap},\max(\varepsilon,\dfrac{v_{\rightarrow}^2}{2d})\big)$ .  
**Events (order matters):**

1.  **land** if  $s_{\text{stop}}\ge d-EPS.x$ : split exactly at apex, set  $x=\pm L, v=0$ , return `event:'land'`.
    
2.  **toV0** if  $s_{\text{stop}}< d-EPS.x$  **and**  $t_{\text{stop}}\le \Delta t + EPS.t$ : split at  $v_{\rightarrow}\to 0$ , set  $v=0$ , return `event:'toV0'`.  
    **Post**: If neither event triggers, return updated  $x,v$ ; `phase='decel'`.
    

_(Stop‑short `toV0` from v9.1; exact landing from both.)_

yaw-2d-sim-v9.1 (1)

* * *

### 5.3 **Outside**→Inside · Recover

**Pre**:  $|x|>L+EPS.x$ .  
**Law**: accelerate **inward** toward the nearest apex (sign chosen to reduce  $|x|-L$ ); magnitude  $\le a_{\cap}$ .  
**Event**: **reenterBand** when  $|x|\le L+EPS.x$ .  
**Post**: If still outside after consuming  $\Delta t$ , return; else emit `reenterBand`.

_(Matches v8’s inward recovery; avoids v9.1’s unconditional `+dir`.)_

yaw-2d-sim-v8-GeminiDeepThink

* * *

### 5.4 **ApexFlip** (system event, zero‑time)

**Triggers**: `land` **or** `crossedApexClamp`.  
**Action**: set  $x=\pm L$ ,  $v=0$ ; flip `dir`; set `phase='accel'`.  
**Then**: immediately re‑run selector on the remaining time (zero‑time event chain).  
_(This is the v8 clamp expressed as a first‑class event.)_

yaw-2d-sim-v8-GeminiDeepThink

* * *

6) Orchestrator (stitching semantics)
-------------------------------------

**B1. Time‑consumption invariant** — each loop does one of:

*   consume strictly positive time (`used ≥ EPS.t`), or
    
*   perform **exactly one** zero‑time event (ApexFlip), then immediately re‑select.
    

**B2. Progress guarantee**

    dtLeft := S.dt
    while dtLeft > EPS.t:
      stage := select(S)
      out   := stage(S with dt=dtLeft)
      S'    := out.snap
      used  := S'.t - S.t   // may be 0 only for ApexFlip
      if out.kind=='event' and out.event in {'land','crossedApexClamp'}:
          S' := ApexFlip(S')    // zero time
      dtLeft := dtLeft - used
      S := S'
    assert |dtLeft| ≤ EPS.t
    

**B3. Zero‑time chain bound** — track `zeroEventCount`; if `>3` within one visual frame, emit diagnostic and pause (guards against pathological inputs).

**B4. Event ordering** — when multiple events would occur within the same `dt`, realize the **earliest** first; ties within `EPS.t` break by:  
`land > toV0 > toVmax`.  
(You can’t skip a landing.)

**B5. Clamp safety (I2)** — if a **full** piece crosses ±L with no `land`, emit `crossedApexClamp` and perform ApexFlip immediately (zero time).  
(External review: orchestrator is the critical path; these rules protect correctness.)

2025-09-21 722 PM GeminiThought…

* * *

7) Diagnostics (observer, not in control path)
----------------------------------------------

A toggleable observer receives `(prevSnap, pieces, nextSnap)` and flags:

*   consistency (`Δv` vs `a·dt`),
    
*   accel cap breach by any piece,
    
*   oscillation (windowed sign flips & amplitude),
    
*   jerk spikes (gated; ignore planned multi‑phase boundaries),
    
*   zero‑time loop guard.
    

This matches your v8 anomaly + per‑piece logging approach, but remains **out of** the control loop.

yaw-2d-sim-v8-GeminiDeepThink

* * *

8) Acceptance checklist (to freeze v1.1)
----------------------------------------

1.  **Bounce correctness**: starting inside with  $v_{\rightarrow}>0$  near apex → `land` then ApexFlip in ≤ one frame; no decel‑away after `toV0`.
    
2.  **Mid‑travel**: accelerate to  $V_{\max}$  (emit `toVmax`), then decel; no selector chatter on the boundary (neutral band works).
    
3.  **Outside recovery**: from  $|x|>L$  with any  $v$  → motion strictly inward; `reenterBand` on entry; no outward push.
    
4.  **Zero‑time chains**: chained `land → flip → accel` consumes zero time for the flip; never exceeds the chain bound.
    
5.  **dt accounting**: after a visual frame,  $|\sum \Delta t_i - dt| \le EPS.t$ .
    

* * *

9) Mapping (for auditability)
-----------------------------

*   **From v9.1**: apex‑aligned  $v_{\rightarrow}, d$ ; `toV0` stop‑short; analytical per‑piece integration.
    
    yaw-2d-sim-v9.1 (1)
    
*   **From v8**: clamp‑and‑flip safety; inward sign for outside‑recovery; anomaly/per‑piece diagnostics.
    
    yaw-2d-sim-v8-GeminiDeepThink
    
*   **External review**: orchestrator precision; explicit EPS; selector‑only neutral band to prevent chatter.
    
    2025-09-21 722 PM GeminiThought…
    

