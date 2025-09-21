# No-GUI Configuration Guide

## Quick Start - Running Without GUI

To run the application without the GUI control panel:

1. Open `js/app-module.js`
2. Find the configuration section at the top (lines 17-101)
3. Set `ENABLE_UI = false` (line 27)
4. Configure all DEFAULT_* values to your desired settings
5. Save and reload the application

## Configuration Overview

All configuration values are located in a single place at the top of `js/app-module.js`. These constants serve as:
- **Single source of truth** for all initial values
- **Startup defaults** when the application loads
- **Reset values** when the "Defaults" button is clicked (if GUI is enabled)

## Configuration Constants Reference

### Core Settings

```javascript
// UI Control
const ENABLE_UI = false;  // Disable GUI completely

// SVG Source
const DEFAULT_SVG_URL = "data/ButterflyMain-NoUnresolved.svg";  // SVG file to load
const USE_SVG_COLORS = true;  // Use colors from SVG vs GUI colors
```

### Camera & View Settings

```javascript
const DEFAULT_CAMERA_X = 0;     // Camera X position
const DEFAULT_CAMERA_Y = 0;     // Camera Y position  
const DEFAULT_CAMERA_Z = 30;    // Camera distance from origin
```

### Auto-Spin Animation

```javascript
const DEFAULT_SPIN_ENABLED = true;   // Enable auto-rotation
const DEFAULT_YAW_SPEED_DEG = 6;     // Horizontal spin (degrees/sec)
const DEFAULT_PITCH_SPEED_DEG = 2;   // Vertical spin (degrees/sec)
const DEFAULT_YAW_LIMIT_DEG = 100;   // Max horizontal angle
const DEFAULT_PITCH_LIMIT_DEG = 90;  // Max vertical angle
```

### Lighting

```javascript
const DEFAULT_LIGHT_INTENSITY = 3;    // Light brightness (0-6 range, typical 1-3)
const DEFAULT_LIGHT_X = 15;           // Light X position
const DEFAULT_LIGHT_Y = 20;           // Light Y position
const DEFAULT_LIGHT_Z = 35;           // Light Z position
const DEFAULT_AMBIENT_INTENSITY = 0.25; // Ambient light level
```

### Node Fill (Backing Plates)

```javascript
const DEFAULT_FILL_NODES = true;        // Create backing plates
const DEFAULT_SMART_FILL = true;        // Auto-fill closed shapes
const DEFAULT_NODE_FILL_COLOR = '#ffffff';  // Backing plate color
const DEFAULT_NODE_FILL_OPACITY = 0.5;      // Opacity (0-1)
const DEFAULT_NODE_PLATE_DEPTH = 0.3;       // Plate thickness
const DEFAULT_NODE_Z_OFFSET = -0.9;         // Plate Z offset
```

### Mesh/Ink Appearance

```javascript
const DEFAULT_MESH_COLOR = '#1b4f72';  // SVG stroke/text color
const DEFAULT_MESH_DEPTH = 0.6;        // Extrusion depth
const DEFAULT_TEXT_DEPTH = 0.6;        // Text extrusion depth
```

### Z-Fighting Mitigation (Flicker Prevention)

Z-fighting causes flickering when two surfaces are too close in 3D space. If you see flickering, adjust these values:

```javascript
// Text elevation above surface
const DEFAULT_TEXT_Z_OFFSET_FACTOR = 0.52;  // Higher = text floats more (0.2-0.8)

// Stroke depth relative to fills  
const DEFAULT_STROKE_Z_OFFSET_FACTOR = -0.5; // Negative = behind, Positive = in front

// Wall/shadow plane separation
const DEFAULT_WALL_SEPARATION = 0.01;        // Higher = less flicker (0.01-0.5)

// Node backing plate distance (already defined above)
const DEFAULT_NODE_Z_OFFSET = -0.9;          // More negative = further back
```

**Troubleshooting Z-Fighting:**
- **Text flickering with background**: Increase `DEFAULT_TEXT_Z_OFFSET_FACTOR` (try 0.6-0.7)
- **Strokes flickering with fills**: Adjust `DEFAULT_STROKE_Z_OFFSET_FACTOR` (try -0.3 or 0.3)
- **Wall/shadow flickering**: Increase `DEFAULT_WALL_SEPARATION` (try 0.05-0.1)
- **Node plates flickering**: Make `DEFAULT_NODE_Z_OFFSET` more negative (try -1.2)

### Shadows

```javascript
const DEFAULT_SHADOW_TYPE = 'VSM';          // 'VSM' or 'PCFSoft'
const DEFAULT_SHADOW_RADIUS = 2;            // Blur radius (VSM only)
const DEFAULT_SHADOW_BLUR_SAMPLES = 8;      // Blur samples (VSM only)
const DEFAULT_SHADOW_OPACITY = 0.25;        // Shadow darkness (0-1)
const DEFAULT_SHADOW_COLOR = '#000000';     // Shadow color
const DEFAULT_PLATE_CASTS_SHADOWS = false;  // Plates cast shadows when true
const DEFAULT_SHADOW_NORMAL_BIAS = 0.02;    // Adjust along normal to reduce acne
const DEFAULT_SHADOW_BIAS = -0.0005;        // Depth bias to reduce self-shadowing
```

### Wall & Background

```javascript
const DEFAULT_WALL_COLOR = '#ffffff';       // Wall color
const DEFAULT_WALL_FLAT = true;             // true=flat, false=shaded
const DEFAULT_WALL_Z_OFFSET = -10;          // Wall distance
const DEFAULT_BACKGROUND_COLOR = '#ffffff'; // Scene background
const DEFAULT_WALL_FLAT_TONEMAP_DISABLED = true; // Flat wall bypasses tone mapping for true white
```

### Advanced Settings

```javascript
// Rendering
const DEFAULT_SCALE = 0.08;             // SVG to 3D scale
const DEFAULT_ANTIALIAS = true;         // Enable antialiasing
const DEFAULT_PIXEL_RATIO_MAX = 2;      // Max pixel ratio

// Camera Depth Precision (affects z-fighting)
const DEFAULT_CAMERA_NEAR = 1;          // Near clipping plane
const DEFAULT_CAMERA_FAR = 2000;        // Far clipping plane

// Polygon Offset (advanced z-fighting fix)
const DEFAULT_POLYGON_OFFSET_ENABLED = false;  // Enable polygon offset
const DEFAULT_POLYGON_OFFSET_FACTOR = 1;       // Slope-based offset
const DEFAULT_POLYGON_OFFSET_UNITS = 1;        // Constant offset

// Mouse Controls
const DEFAULT_CONTROLS_DAMPING = true;  // Smooth camera movement
const DEFAULT_DAMPING_FACTOR = 0.08;    // Damping amount
const DEFAULT_CONTROLS_MIN_DISTANCE = 5;    // Min zoom
const DEFAULT_CONTROLS_MAX_DISTANCE = 400;  // Max zoom
const DEFAULT_CONTROLS_ENABLE_PAN = true;   // Allow panning

// Smart Fill
const DEFAULT_MIN_PLATE_AREA = 50;          // Min area for fill
const DEFAULT_PLATE_FILL_RULE = 'nonzero';  // Fill rule
```

### Animation Start (Offsets & Directions)

You can control where animation begins (offsets) and which way it moves first (directions), before bouncing within limits.

```javascript
// Start offsets
const DEFAULT_START_YAW_DEG = 0;        // Yaw offset from base (deg)
const DEFAULT_START_PITCH_DEG = 0;      // Pitch offset from base (deg)
const DEFAULT_START_PAN_X = 0;          // Target.x offset from baseTarget
const DEFAULT_START_PAN_Y = 0;          // Target.y offset from baseTarget
const DEFAULT_START_ZOOM = 0;           // Distance offset from baseDistance (positive = farther)

// Start directions (+1 or -1)
const DEFAULT_START_YAW_DIR = 1;        // +1 rotates yaw forward, -1 reverse
const DEFAULT_START_PITCH_DIR = 1;      // +1 moves up (decrease phi), -1 down
const DEFAULT_START_PAN_DIR_X = 1;      // +1 pans +X first, -1 pans -X
const DEFAULT_START_PAN_DIR_Y = 1;      // +1 pans +Y first, -1 pans -Y
const DEFAULT_START_ZOOM_DIR = 1;       // +1 zooms out first, -1 zooms in
```

Examples:
- Start from slightly right/front, panning left and zooming in first:
```javascript
const DEFAULT_START_YAW_DEG = 15;
const DEFAULT_START_PITCH_DEG = -5;
const DEFAULT_START_PAN_X = 10;
const DEFAULT_START_PAN_DIR_X = -1;
const DEFAULT_START_ZOOM = 20;
const DEFAULT_START_ZOOM_DIR = -1;
```

Note: Animation limits are controlled by the existing yaw/pitch limits and pan/zoom bounds. Directions only set the initial travel sense; bouncing behavior will reverse at the configured limits.

## Common Configurations

### Static Display (No Animation)
```javascript
const ENABLE_UI = false;
const DEFAULT_SPIN_ENABLED = false;
const DEFAULT_CAMERA_Z = 50;  // Further back for full view
```

### Fast Spinning Demo
```javascript
const ENABLE_UI = false;
const DEFAULT_SPIN_ENABLED = true;
const DEFAULT_YAW_SPEED_DEG = 20;
const DEFAULT_PITCH_SPEED_DEG = 10;
```

### High Contrast Display
```javascript
const ENABLE_UI = false;
const DEFAULT_MESH_COLOR = '#000000';       // Black ink
const DEFAULT_NODE_FILL_COLOR = '#ffff00';  // Yellow backing
const DEFAULT_WALL_COLOR = '#ffffff';       // White wall
const DEFAULT_SHADOW_OPACITY = 0.8;         // Darker shadows
```

### Minimal Shadows
```javascript
const ENABLE_UI = false;
const DEFAULT_SHADOW_OPACITY = 0.2;         // Very light shadows
const DEFAULT_SHADOW_RADIUS = 0.5;          // Sharp shadows
```

## Notes

1. **All constants are at the top of the file** (lines 17-101) for easy access
2. **Each constant has a clear comment** explaining its purpose
3. **Values are the single source of truth** - no need to search through code
4. **Changes take effect on page reload** - no compilation needed
5. **Mouse interaction still works** when GUI is disabled (drag to rotate, scroll to zoom)

## Troubleshooting
### Transparency Flicker (dark semi-transparent plates)

If you see full-surface flickering at partial opacity (worst near 0.5), this is typically transparency sorting/overdraw instability rather than z-fighting.

Fixes implemented in code (see header of `js/app-module.js`):
- Ink (opaque) and plates (semi-transparent) are drawn as separate meshes so the renderer can sort them.
- Transparent plates don’t write depth by default, improving blending stability.
- Plates render after ink. Plates can optionally cast shadows.

What to tweak:
```javascript
// Shadows
const DEFAULT_PLATE_CASTS_SHADOWS = true;   // Try true to include plate shadows
const DEFAULT_SHADOW_BLUR_SAMPLES = 8;      // Increase to 16/24 for smoother shadows
const DEFAULT_SHADOW_NORMAL_BIAS = 0.01;    // Try 0.005–0.05 to reduce acne/banding
const DEFAULT_SHADOW_BIAS = -0.0005;        // Try -0.001 to +0.0005 depending on scene

// Transparency depth behavior (in js/app-module.js)
const DEFAULT_FORCE_DEPTH_WRITE = false;    // Keep false for stable blending; true can reintroduce artifacts
```

Suggested experiments:
- Keep `DEFAULT_PLATE_CASTS_SHADOWS = true`, then test: `DEFAULT_SHADOW_BLUR_SAMPLES = 16`, `DEFAULT_SHADOW_NORMAL_BIAS = 0.015`.
- If banding appears, nudge `DEFAULT_SHADOW_BIAS` toward -0.001 or 0.0.
- If you must set `DEFAULT_FORCE_DEPTH_WRITE = true`, expect potential transparency instability; prefer leaving it false.

See also the “Rendering Stability Notes” at the top of `js/app-module.js` for a deeper explanation and cross-reference.

### Wall appears slightly off-white when "Wall flat color" is enabled

Cause:
- Tone mapping can compress highlights so pure white becomes slightly off-white.

Resolution:
- When the wall is flat, the app uses `MeshBasicMaterial` and, by default, disables tone mapping for that material with `DEFAULT_WALL_FLAT_TONEMAP_DISABLED = true` so the wall renders as pure `#ffffff`.
- Additionally, setting “Shadow opacity” to 0 hides the shadow receiver, guaranteeing a pure flat wall (no shadow overlay).

If you prefer tone mapping to still affect the wall, set `DEFAULT_WALL_FLAT_TONEMAP_DISABLED = false`.

### Plates look off-white over a pure white wall (at low/zero opacity)

Cause:
- Tone mapping and/or shadow influence on nearly transparent plates can cause slight tinting even over a pure white wall.

Controls and example values:
```javascript
// Disable tone mapping for plates so their appearance matches the wall and GUI color precisely
const DEFAULT_PLATE_TONEMAP_DISABLED = true; // default true for strict color fidelity

// Only let plates cast shadows above a minimum opacity (prevents ghost shadows)
const DEFAULT_PLATE_SHADOW_OPACITY_THRESHOLD = 0.01; // try 0.001–0.05

// Whether plates can cast shadows at all
const DEFAULT_PLATE_CASTS_SHADOWS = true; // set false to rule out plate shadows
```

Tips:
- For a strict visual match to the white wall at very low opacity, keep `DEFAULT_PLATE_TONEMAP_DISABLED = true` and raise `DEFAULT_PLATE_SHADOW_OPACITY_THRESHOLD` slightly (e.g., 0.01–0.03).
- If you need plate shadows, keep them enabled but only above a useful opacity range to avoid subtle shadow tinting when plates are nearly transparent.

Cross-reference: see the “Rendering Stability Notes” in `js/app-module.js` for the rationale behind these controls.


### General Issues
- **Nothing displays**: Check DEFAULT_SVG_URL points to valid SVG file
- **Too dark/bright**: Adjust DEFAULT_LIGHT_INTENSITY (0-6) and DEFAULT_AMBIENT_INTENSITY
- **No animation**: Ensure DEFAULT_SPIN_ENABLED = true
- **Can't see full model**: Increase DEFAULT_CAMERA_Z value
- **Colors wrong**: Toggle USE_SVG_COLORS to switch between SVG and configured colors

### Z-Fighting (Flickering) Issues

Z-fighting appears as flickering or "stitching" between overlapping surfaces. This happens when two surfaces are at nearly the same depth, causing the renderer to be uncertain which should be shown.

**Common Z-fighting scenarios and solutions:**

1. **Text flickering against shapes**
   ```javascript
   // Default value
   const DEFAULT_TEXT_Z_OFFSET_FACTOR = 0.52;
   
   // If flickering, try:
   const DEFAULT_TEXT_Z_OFFSET_FACTOR = 0.65;  // More separation
   // or
   const DEFAULT_TEXT_Z_OFFSET_FACTOR = 0.75;  // Maximum safe separation
   ```

2. **Strokes flickering with filled shapes**
   ```javascript
   // Default value
   const DEFAULT_STROKE_Z_OFFSET_FACTOR = -0.5;
   
   // If flickering, try:
   const DEFAULT_STROKE_Z_OFFSET_FACTOR = -0.7;  // Strokes further back
   // or
   const DEFAULT_STROKE_Z_OFFSET_FACTOR = 0.3;   // Strokes in front
   ```

3. **Shadow plane flickering with wall**
   ```javascript
   // Default value
   const DEFAULT_WALL_SEPARATION = 0.01;
   
   // If flickering, try:
   const DEFAULT_WALL_SEPARATION = 0.05;  // More separation
   // or
   const DEFAULT_WALL_SEPARATION = 0.1;   // Clear separation (may show gap at angles)
   ```

4. **Node backing plates flickering**
   ```javascript
   // Default value
   const DEFAULT_NODE_Z_OFFSET = -0.9;
   
   // If flickering, try:
   const DEFAULT_NODE_Z_OFFSET = -1.2;  // Further back
   // or
   const DEFAULT_NODE_Z_OFFSET = -1.5;  // Maximum separation
   ```

**Trade-offs to consider:**
- **Higher separation values**: Eliminate flicker but may make elements appear disconnected or "floating"
- **Lower separation values**: Keep elements visually connected but risk flickering
- **Sweet spot**: Usually between 0.4-0.6 for text offset, -0.8 to -1.2 for backing plates

### Rear-View Specific Flickering

If the model looks fine from the front but flickers when viewed from behind:

1. **Try Camera Depth Precision First**
   ```javascript
   // Tighter range for better precision
   const DEFAULT_CAMERA_NEAR = 10;   // Was 1
   const DEFAULT_CAMERA_FAR = 1000;  // Was 2000
   ```

2. **Enable Polygon Offset (Most Effective)**
   ```javascript
   const DEFAULT_POLYGON_OFFSET_ENABLED = true;
   const DEFAULT_POLYGON_OFFSET_FACTOR = 1;
   const DEFAULT_POLYGON_OFFSET_UNITS = 1;
   
   // If still flickering, try stronger values:
   const DEFAULT_POLYGON_OFFSET_FACTOR = 0;  // No slope-based offset
   const DEFAULT_POLYGON_OFFSET_UNITS = 4;   // Just constant offset
   ```

3. **Combination Approach**
   ```javascript
   // Use all techniques together for stubborn flickering:
   const DEFAULT_NODE_Z_OFFSET = -1.5;              // Increase separation
   const DEFAULT_CAMERA_NEAR = 5;                   // Tighter camera range
   const DEFAULT_CAMERA_FAR = 500;
   const DEFAULT_POLYGON_OFFSET_ENABLED = true;     // Enable offset
   const DEFAULT_POLYGON_OFFSET_FACTOR = 1;
   const DEFAULT_POLYGON_OFFSET_UNITS = 2;
   ```

**Why rear-view flickering happens:**
- Depth relationships are inverted when viewing from behind
- Dark backs of elements (ambient light only) make flickering more visible
- Polygon offset is particularly effective here as it adjusts depth buffer calculations