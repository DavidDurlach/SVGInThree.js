// Configuration Module - Single Source of Truth for all settings
// Last edit date: 2025-09-12

// ================================================================================
//                         MASTER CONFIGURATION
// ================================================================================
// To run without GUI:
// 1. Set ENABLE_UI = false
// 2. Configure all DEFAULT_* values below to your desired startup state
// 3. These values will be applied automatically when the app starts
// ================================================================================

// --------------------------------------------------------------------------------
//                           CORE APPLICATION SETTINGS
// --------------------------------------------------------------------------------

// UI Control
export const ENABLE_UI = true; // Set to false to disable GUI completely

// SVG Configuration
export const DEFAULT_SVG_URL = "data/ButterflyMain-NoUnresolved.svg"; // Default SVG file to load
export const USE_SVG_COLORS = true; // true = use colors from SVG; false = use GUI colors below

// Rendering Core
export const DEFAULT_SCALE = 0.08;             // SVG to 3D scale factor
export const DEFAULT_ANTIALIAS = true;         // Enable antialiasing
export const DEFAULT_PIXEL_RATIO_MAX = 2;      // Max device pixel ratio

// --------------------------------------------------------------------------------
//                           CAMERA & VIEW SETTINGS
// --------------------------------------------------------------------------------

// Initial Camera Position
export const DEFAULT_CAMERA_X = 0;        // Camera X position
export const DEFAULT_CAMERA_Y = 0;        // Camera Y position  
export const DEFAULT_CAMERA_Z = 120;      // Camera Z position (distance from origin)

// Camera Clipping Planes
export const DEFAULT_CAMERA_NEAR = 1;     // Near clipping plane (don't set to 0!)
export const DEFAULT_CAMERA_FAR = 2000;   // Far clipping plane

// --------------------------------------------------------------------------------
//                           ANIMATION SPEEDS
// --------------------------------------------------------------------------------

// Rotation Speeds
export const DEFAULT_YAW_SPEED_DEG = 500;        // Horizontal rotation speed (degrees/second)
export const DEFAULT_PITCH_SPEED_DEG = 0;    // Vertical rotation speed (degrees/second)

// Pan Speeds
export const DEFAULT_PAN_SPEED_X = 0;          // Pan speed along X (world units/sec)
export const DEFAULT_PAN_SPEED_Y = 0;          // Pan speed along Y (world units/sec)

// Zoom Speed
export const DEFAULT_ZOOM_SPEED = 0;           // Zoom speed (camera distance units/sec)

// --------------------------------------------------------------------------------
//                           ANIMATION LIMITS
// --------------------------------------------------------------------------------

// Rotation Limits
export const DEFAULT_YAW_LIMIT_DEG = 100;      // Max horizontal rotation angle from center
export const DEFAULT_PITCH_LIMIT_DEG = 90;     // Max vertical rotation angle from center

// Pan Limits
export const DEFAULT_PAN_LIMIT_X = 40;         // Max |target.x - base| before bounce
export const DEFAULT_PAN_LIMIT_Y = 20;         // Max |target.y - base| before bounce

// Zoom Limits
export const DEFAULT_ZOOM_MIN = 3;             // Min camera distance (must be >= DEFAULT_CONTROLS_MIN_DISTANCE)
export const DEFAULT_ZOOM_MAX = 160;           // Max camera distance

// --------------------------------------------------------------------------------
//                      ANIMATION TIMING & EASING
// --------------------------------------------------------------------------------

// Timing
export const DEFAULT_ANIMATION_START_DELAY_MS = 1500; // Delay before animation starts (0=disabled)
export const DEFAULT_EASE_TIME_MS = 500;              // Time constant for velocity easing (ms)

// Enable Flags
export const DEFAULT_SPIN_ENABLED = true;      // Whether auto-spin is enabled at startup
export const DEFAULT_EASE_ENABLED = true;       // Enable easing for all animated params

// Easing Epsilons (convergence thresholds)
export const YAW_EPS_ANG = 1e-4;               // Yaw angle epsilon (radians)
export const YAW_EPS_VEL = 1e-6;               // Yaw velocity epsilon (rad/s)
export const PITCH_EPS_ANG = 1e-4;             // Pitch angle epsilon
export const PITCH_EPS_VEL = 1e-6;             // Pitch velocity epsilon
export const PAN_EPS_POS = 1e-4;               // Pan position epsilon (world units)
export const PAN_EPS_VEL = 1e-6;               // Pan velocity epsilon (units/s)
export const ZOOM_EPS_DIST = 1e-4;             // Zoom distance epsilon
export const ZOOM_EPS_VEL = 1e-6;              // Zoom velocity epsilon

// Runway fallback
export const RUNWAY_FALLBACK_ACCEL_MULT = 10;   // Prevents a=v^2/(2d) blowups when distance too small.  In that case, uses time-based accel times this value at boundary/bounce

// YAW
// Yaw predictive look‑ahead multiplier
// - Purpose: Let predictive reversal look one frame ahead by subtracting v*dt*mult from outward runway.
// - Typical: 1.0–1.5. Higher triggers predictive a frame earlier at high speed.
// - Impact: Earlier reversal → fewer clamp touches; too high can over‑predict.
export const YAW_PREDICTIVE_LEAD_MULT = 1;

// Yaw predictive trigger tweaks (decision‑only, do not change executed accel)
// - BASE: Global scaling on the decision accel used for stop‑distance.
// - DRAG: Optional extra scaling when a UI “drag” flag is active (kept neutral here).
// - Keep both 1.0 unless you intentionally want earlier/later predictive decisions.
export const YAW_TRIGGER_TWEAK_BASE   = 1.0;    // 1.0 = neutral
export const YAW_TRIGGER_TWEAK_DRAG   = 1.0;    // 1.0 = neutral

// Clamp‑time plan‑cap multiplier (yaw only)
// - Purpose: While clamped at the limit, multiply the reversal plan cap so velocity leaves the boundary faster.
// - Interacts with: geometric ceiling aSym and ease cap; effective only if plan cap is the limiter.
// - Typical: 1.5–2.0. Very high values often have no effect because geometry (aSym) dominates.
export const YAW_CLAMP_PLAN_CAP_MULT  = 1.0;

// Clamp‑time ease multiplier (yaw only)
// - Purpose: Scale time‑form acceleration aNom = (desired − v)/easeMs while clamped.
// - <1 speeds departure (e.g., 0.5 doubles aNom), >1 slows; 1.0 means no change from global ease.
// - Effective only while clamped; does not affect free‑motion segments.
export const YAW_CLAMP_EASE_MULT      = 1;

// UI policy: whether to defer yaw speed slider changes while reversing (bounce)
// - false (default): apply immediately; engine safely retargets mid‑reversal.
// - true: write to _pendingYawSpeed and apply when reversal completes (for conservative UX).
export const DEFER_YAW_UI_WHILE_REVERSING = false;

// Logging‑only tie suppression around soft‑overshoot (NO behavior change)
// - Purpose: When overshoot ≈ swept (v*dt), numerical ties can spam logs.
// - Behavior: If > 0, ties within this epsilon will skip soft‑overshoot logs; motion is unaffected.
// - Default 0 keeps logging unchanged until you opt‑in.
export const YAW_SOFT_OVERSHOOT_EPS_LOGGING = 0;

// --------------------------------------------------------------------------------
//                      ANIMATION START CONDITIONS
// --------------------------------------------------------------------------------

// Initial Offsets
export const DEFAULT_START_YAW_DEG = 0;        // Yaw offset from base (deg)
export const DEFAULT_START_PITCH_DEG = 0;      // Pitch offset from base (deg)
export const DEFAULT_START_PAN_X = 0;          // Target.x offset from baseTarget
export const DEFAULT_START_PAN_Y = 0;          // Target.y offset from baseTarget
export const DEFAULT_START_ZOOM = 0;           // Distance offset from baseDistance

// Initial Directions (+1 or -1)
export const DEFAULT_START_YAW_DIR = -1;       // +1 rotates yaw forward, -1 reverses
export const DEFAULT_START_PITCH_DIR = 1;      // +1 moves up, -1 down
export const DEFAULT_START_PAN_DIR_X = -1;     // +1 pans +X first, -1 pans -X first
export const DEFAULT_START_PAN_DIR_Y = 1;      // +1 pans +Y first, -1 pans -Y first
export const DEFAULT_START_ZOOM_DIR = -1;      // +1 zooms out first, -1 zooms in

// --------------------------------------------------------------------------------
//                           LIGHTING SETTINGS
// --------------------------------------------------------------------------------

// Light Properties
export const DEFAULT_LIGHT_INTENSITY = 4;      // Light brightness (0-6 range, typical 1-3)
export const DEFAULT_LIGHT_X = 15;             // Light X position
export const DEFAULT_LIGHT_Y = 20;             // Light Y position
export const DEFAULT_LIGHT_Z = 35;             // Light Z position
export const DEFAULT_AMBIENT_INTENSITY = 0.25; // Ambient light intensity

// --------------------------------------------------------------------------------
//                        3D GEOMETRY & MATERIALS
// --------------------------------------------------------------------------------

// Mesh/Ink Settings
export const DEFAULT_MESH_COLOR = '#1b4f72';   // Color for SVG strokes/text when not using SVG colors
export const DEFAULT_MESH_DEPTH = 0.6;         // Extrusion depth for main geometry
export const DEFAULT_TEXT_DEPTH = 0.6;         // Extrusion depth for text elements

// Node Fill Settings (backing plates)
export const DEFAULT_FILL_NODES = true;        // Whether to create backing plates for nodes
export const DEFAULT_SMART_FILL = true;        // Whether to auto-fill closed shapes
export const DEFAULT_NODE_FILL_COLOR = '#ffffff';   // Color for node backing plates
export const DEFAULT_NODE_FILL_OPACITY = 0.15;      // Opacity for node backing plates (0-1)
export const DEFAULT_NODE_PLATE_DEPTH = 0.3;        // Depth of node backing plates
export const DEFAULT_NODE_Z_OFFSET = -0.9;          // Z-offset for node backing plates
export const DEFAULT_MIN_PLATE_AREA = 50;           // Minimum area for smart fill shapes
export const DEFAULT_PLATE_FILL_RULE = 'nonzero';   // SVG fill rule: 'nonzero' or 'evenodd'

// Wall & Background
export const DEFAULT_WALL_COLOR = '#ffffff';        // Wall/backdrop color
export const DEFAULT_WALL_FLAT = true;              // true = flat color; false = shaded
export const DEFAULT_WALL_Z_OFFSET = -10;           // Wall distance behind origin
export const DEFAULT_BACKGROUND_COLOR = '#ffffff';  // Scene background color

// --------------------------------------------------------------------------------
//                           SHADOW SETTINGS
// --------------------------------------------------------------------------------

// Shadow Properties
export const DEFAULT_SHADOW_TYPE = 'VSM';           // 'VSM' or 'PCFSoft'
export const DEFAULT_SHADOW_RADIUS = 2;             // Shadow blur radius (VSM only)
export const DEFAULT_SHADOW_BLUR_SAMPLES = 8;       // Shadow blur sample count (VSM only)
export const DEFAULT_SHADOW_OPACITY = 0.15;         // Shadow darkness (0-1)
export const DEFAULT_SHADOW_COLOR = '#000000';      // Shadow color
export const DEFAULT_PLATE_CASTS_SHADOWS = true;    // Whether backing plates cast shadows

// Shadow Bias Settings
export const DEFAULT_SHADOW_NORMAL_BIAS = 0.02;     // Moves shadow lookup along normal
export const DEFAULT_SHADOW_BIAS = -0.0005;         // Depth bias to reduce self-shadowing

// Shadow Thresholds
export const DEFAULT_PLATE_SHADOW_OPACITY_THRESHOLD = 0.001; // Min opacity for plates to cast shadows

// --------------------------------------------------------------------------------
//                        Z-FIGHTING MITIGATION
// --------------------------------------------------------------------------------

// Z-Offset Factors
export const DEFAULT_TEXT_Z_OFFSET_FACTOR = 0.52;   // Multiplier of depth for text z-offset
export const DEFAULT_STROKE_Z_OFFSET_FACTOR = -0.5; // Multiplier of depth for stroke offset
export const DEFAULT_WALL_SEPARATION = 0.01;        // Gap between shadow plane and backdrop

// Polygon Offset (Advanced)
export const DEFAULT_POLYGON_OFFSET_ENABLED = false; // Enable polygon offset for materials
export const DEFAULT_POLYGON_OFFSET_FACTOR = 2;      // Multiplied by slope of polygon
export const DEFAULT_POLYGON_OFFSET_UNITS = 2;       // Constant offset in depth units

// Depth Write Control
export const DEFAULT_FORCE_DEPTH_WRITE = false;      // Force depthWrite=true for transparent materials

// --------------------------------------------------------------------------------
//                        RENDERING PIPELINE
// --------------------------------------------------------------------------------

// Tone Mapping
export const DEFAULT_TONE_MAPPING = 'ACESFilmic';    // Options: 'None', 'Linear', 'Reinhard', 'Cineon', 'ACESFilmic'
export const DEFAULT_OUTPUT_ENCODING = 'sRGB';       // Options: 'sRGB', 'Linear'
export const DEFAULT_TONE_MAPPING_EXPOSURE = 1.0;    // Exposure adjustment (0.5-2.0 typical)

// Tone Mapping Overrides
export const DEFAULT_WALL_FLAT_TONEMAP_DISABLED = true;  // Flat wall bypasses tone mapping
export const DEFAULT_PLATE_TONEMAP_DISABLED = true;      // Plates bypass tone mapping

// Transparency & Render Order
export const DEFAULT_ALPHA_TEST = 0.01;              // Discard pixels below this alpha
export const DEFAULT_RENDER_ORDER_PLATES = -1;       // Render order for backing plates
export const DEFAULT_RENDER_ORDER_INK = 0;           // Render order for main geometry

// Material Properties
export const DEFAULT_PLATE_EMISSIVE_INTENSITY = 0.0; // Self-illumination for plates (0-0.1)

// --------------------------------------------------------------------------------
//                        MOUSE CONTROLS (OrbitControls)                         
// --------------------------------------------------------------------------------

export const DEFAULT_CONTROLS_DAMPING = true;        // Enable smooth camera movement
export const DEFAULT_DAMPING_FACTOR = 0.08;          // Damping smoothness (lower = smoother)
export const DEFAULT_CONTROLS_MIN_DISTANCE = 1;      // Minimum zoom distance
export const DEFAULT_CONTROLS_MAX_DISTANCE = 400;    // Maximum zoom distance
export const DEFAULT_CONTROLS_ENABLE_PAN = true;     // Allow panning with mouse

// --------------------------------------------------------------------------------
//                           GUI CONTROL RANGES
// --------------------------------------------------------------------------------

// Speed Ranges
export const DEFAULT_YAW_SPEED_DEG_MIN = 0;
export const DEFAULT_YAW_SPEED_DEG_MAX = 800;
export const DEFAULT_PITCH_SPEED_DEG_MIN = 0;
export const DEFAULT_PITCH_SPEED_DEG_MAX = 800;
export const DEFAULT_PAN_SPEED_X_MIN = 0;
export const DEFAULT_PAN_SPEED_X_MAX = 800;
export const DEFAULT_PAN_SPEED_Y_MIN = 0;
export const DEFAULT_PAN_SPEED_Y_MAX = 800;
export const DEFAULT_ZOOM_SPEED_MIN = 0;
export const DEFAULT_ZOOM_SPEED_MAX = 200;

// Light Ranges
export const DEFAULT_LIGHT_INTENSITY_MIN = 0;
export const DEFAULT_LIGHT_INTENSITY_MAX = 6;
export const DEFAULT_LIGHT_X_MIN = -100;
export const DEFAULT_LIGHT_X_MAX = 100;
export const DEFAULT_LIGHT_Y_MIN = -100;
export const DEFAULT_LIGHT_Y_MAX = 100;
export const DEFAULT_LIGHT_Z_MIN = -100;
export const DEFAULT_LIGHT_Z_MAX = 400;

// Shadow Ranges
export const DEFAULT_SHADOW_RADIUS_MIN = 0;
export const DEFAULT_SHADOW_RADIUS_MAX = 15;
export const DEFAULT_SHADOW_BLUR_SAMPLES_MIN = 1;
export const DEFAULT_SHADOW_BLUR_SAMPLES_MAX = 32;
export const DEFAULT_SHADOW_OPACITY_MIN = 0;
export const DEFAULT_SHADOW_OPACITY_MAX = 1;

// Opacity Ranges
export const DEFAULT_NODE_FILL_OPACITY_MIN = 0;
export const DEFAULT_NODE_FILL_OPACITY_MAX = 1;

// Zoom Slider
export const DEFAULT_ZOOM_SLIDER_LOG = true;         // Use log mapping for Camera Z slider
export const DEFAULT_ZOOM_SLIDER_STEP = 0.001;       // Slider step when using log mapping

// --------------------------------------------------------------------------------
//                        DEBUG & DIAGNOSTICS
// --------------------------------------------------------------------------------

// Debug Flags
export const DEFAULT_DEBUG_ANIM = true;              // Log animation internals
export const DEFAULT_DEBUG_SAMPLE_EVERY = 1;        // Log every N frames when debug is on

// Diagnostics
export const DEFAULT_DIAGNOSTICS_ENABLED = true;    // Toggle runtime diagnostics logging
export const DEFAULT_DIAGNOSTICS_SAMPLE_MS = 100;   // How often to sample (ms)
export const DEFAULT_GL_INSTRUMENTATION_ENABLED = true; // Intercept WebGL calls for GPU allocation estimates

// Predictive reversal late-trigger margin (Pitch only)
export const ENABLE_PITCH_LATE_MARGIN = false;      // If true, delay steady-state predictive by ~v*dt to test slight overshoot.  (Looks much worse than having stop short a bit early at high speeds.)
export const PITCH_PREDICTIVE_LATE_MARGIN_MULT = -5; // Multiplier on v*dt margin when ENABLE_PITCH_LATE_MARGIN is true.  (Small values are of no affect -- issue is discretized by animation frames.)







// --- v2 additions ---
export const PREDICTIVE_LEAD_MULT = 1; // Universal predictive lead (applies to all axes)
