---@meta
-- Tessera High-Res Fantasy Console API definitions for LuaLS / EmmyLua
-- Screen: 768x432 (3x HUD overlay, 256x144 raymarched volume)
-- Volume: 256x256x128 voxels (0 <= x < 256, 0 <= y < 256, 0 <= z < 128)
-- Palette: 256 indexed colours (1-255; 0 is empty)
-- Logic rate: 30 Hz (_update) | Presentation rate: up to 60 Hz (_draw)

---@class Voxel
---@field x integer Voxel X coordinate (0-255)
---@field y integer Voxel Y coordinate (0-255)
---@field z integer Voxel Z coordinate (0-127)
---@field c integer Palette colour index (1-255)

---@alias WaveType
---| '"square"'   # Pulse / square wave (50% duty)
---| '"sq50"'     # Pulse / square wave (50% duty)
---| '"sq25"'     # Pulse wave (25% duty)
---| '"sq12"'     # Pulse wave (12.5% duty)
---| '"triangle"' # Smooth triangle wave
---| '"tri"'      # Smooth triangle wave
---| '"saw"'      # Sawtooth wave
---| '"sawtooth"' # Sawtooth wave
---| '"noise"'    # Pseudo-random noise
---| '"nse"'      # Pseudo-random noise
---| '"pns"'      # Periodic LFSR noise
---| '"pnoise"'   # Periodic LFSR noise

---@alias CollisionLayer
---| 0 # Map layer only (persistent voxels)
---| 1 # Draw layer only (dynamic frame voxels)
---| 2 # Both map and draw layers combined (default)

--------------------------------------------------------------------------------
-- Lifecycle Callbacks
--------------------------------------------------------------------------------

---Called once when the cartridge boots or is reset.
---Initialize game state, spawn entities, build the persistent map, or load saved scores here.
function _init() end

---Called 30 times per second for game logic and physics simulation.
---Read input with `btn()`, update positions, check collisions, and queue sounds here.
function _update() end

---Called every presentation frame (up to 60 Hz) to render dynamic voxels and 2D HUD.
---Clear the frame with `cls()`, draw models with `model()`, and draw HUD with `print()`.
function _draw() end

--------------------------------------------------------------------------------
-- Map Layer (Persists between frames, 256x256x128)
--------------------------------------------------------------------------------

---Set a single voxel colour in the persistent map layer.
---@param x number Voxel X coordinate (0-255)
---@param y number Voxel Y coordinate (0-255)
---@param z number Voxel Z coordinate (0-127)
---@param c number Palette colour index (1-255; 0 to erase)
function mset(x, y, z, c) end

---Read a voxel colour from the persistent map layer. Returns 0 if outside the volume.
---@param x number Voxel X coordinate
---@param y number Voxel Y coordinate
---@param z number Voxel Z coordinate
---@return integer c Palette colour index (1-255), or 0 if empty/outside
---@nodiscard
function mget(x, y, z) end

---Clear or fill the entire persistent map volume (uploads all 8 MiB to GPU).
---@param c? number Palette colour index (0-255, default 0 = empty)
function mclear(c) end

---Fill a solid axis-aligned box in the persistent map layer with inclusive corner coordinates.
---@param x0 number Start voxel X
---@param y0 number Start voxel Y
---@param z0 number Start voxel Z
---@param x1 number End voxel X
---@param y1 number End voxel Y
---@param z1 number End voxel Z
---@param c number Palette colour index (1-255)
function mbox(x0, y0, z0, x1, y1, z1, c) end

---Stamp a voxel model into the persistent map layer.
---@param id string Model identifier defined in __models__ or via newmodel()
---@param x number World voxel X target
---@param y number World voxel Y target
---@param z number World voxel Z target
---@param rot? number Rotation (quarter-turns 0-3 or angle in radians)
---@param flip? boolean True to mirror horizontally along the X-axis
function mmodel(id, x, y, z, rot, flip) end

---Find the highest solid voxel Z coordinate in a map column.
---@param x number Voxel X coordinate
---@param y number Voxel Y coordinate
---@return integer z Highest occupied Z coordinate (0-127), or -1 if the column is empty
---@nodiscard
function mheight(x, y) end

--------------------------------------------------------------------------------
-- Draw Layer (Rebuilt every frame by the cart)
--------------------------------------------------------------------------------

---Clear the dynamic draw layer. Must be called at the start of `_draw()`.
---Only resets the memory bricks dirtied since the previous `cls()`.
function cls() end

---Set a single voxel colour in the dynamic draw layer (remapped through `pswap()`).
---@param x number Voxel X coordinate (0-255)
---@param y number Voxel Y coordinate (0-255)
---@param z number Voxel Z coordinate (0-127)
---@param c number Palette colour index (1-255; 0 to erase)
function vset(x, y, z, c) end

---Read a voxel colour at x,y,z. Returns the draw layer voxel if solid, otherwise falls back to the map layer.
---@param x number Voxel X coordinate
---@param y number Voxel Y coordinate
---@param z number Voxel Z coordinate
---@return integer c Palette colour index (1-255), or 0 if empty/outside
---@nodiscard
function vget(x, y, z) end

---Draw a solid or hollow axis-aligned box in the dynamic draw layer.
---@param x0 number Start voxel X
---@param y0 number Start voxel Y
---@param z0 number Start voxel Z
---@param x1 number End voxel X
---@param y1 number End voxel Y
---@param z1 number End voxel Z
---@param c number Palette colour index (1-255)
---@param hollow? boolean True to draw hollow shell without filling interior (default false)
function box(x0, y0, z0, x1, y1, z1, c, hollow) end

---Draw a solid voxel sphere centered at (x, y, z) with radius `r`.
---@param x number Center voxel X
---@param y number Center voxel Y
---@param z number Center voxel Z
---@param r number Radius in voxels
---@param c number Palette colour index (1-255)
function sphere(x, y, z, r, c) end

---Draw a 3D Bresenham line of voxels between two points in the dynamic draw layer.
---@param x0 number Start voxel X
---@param y0 number Start voxel Y
---@param z0 number Start voxel Z
---@param x1 number End voxel X
---@param y1 number End voxel Y
---@param z1 number End voxel Z
---@param c number Palette colour index (1-255)
function line3d(x0, y0, z0, x1, y1, z1, c) end

---Draw a voxel model in the dynamic draw layer. Quarter-turn rotations (0, 1, 2, 3) are exact.
---@param id string Model identifier
---@param x number World voxel X target
---@param y number World voxel Y target
---@param z number World voxel Z target
---@param rot? number Rotation (quarter-turns 0-3 or angle in radians, default 0)
---@param flip? boolean True to mirror horizontally along the X-axis (default false)
---@param frame? number Animation frame index (0-based, default 0)
function model(id, x, y, z, rot, flip, frame) end

---Spawn a short-lived voxel particle in the dynamic draw layer that ages and disappears.
---@param x number Voxel X coordinate
---@param y number Voxel Y coordinate
---@param z number Voxel Z coordinate
---@param c number Palette colour index (1-255)
---@param life? number Lifetime in seconds (default 1.0; maximum 2048 active particles)
function particle(x, y, z, c, life) end

--------------------------------------------------------------------------------
-- Collision & Spatial Queries (Host-Side Native Physics)
--------------------------------------------------------------------------------

---Perform a fast 3D DDA grid raycast against solid voxels.
---@param x0 number Ray start voxel X
---@param y0 number Ray start voxel Y
---@param z0 number Ray start voxel Z
---@param dx number Ray direction vector X
---@param dy number Ray direction vector Y
---@param dz number Ray direction vector Z
---@param max_d? number Maximum travel distance in voxels (default 256)
---@param layer? CollisionLayer 0 = map only, 1 = draw only, 2 = both (default 2)
---@return boolean hit True if a solid voxel was struck
---@return integer x Hit voxel X coordinate
---@return integer y Hit voxel Y coordinate
---@return integer z Hit voxel Z coordinate
---@return integer nx Surface normal X (-1, 0, 1)
---@return integer ny Surface normal Y (-1, 0, 1)
---@return integer nz Surface normal Z (-1, 0, 1)
---@return integer c Hit voxel colour index
---@return number dist Distance traveled from origin to hit voxel
---@nodiscard
function raycast3d(x0, y0, z0, dx, dy, dz, max_d, layer) end

---Test if an axis-aligned bounding box contains any solid voxel.
---@param x0 number Min voxel X (inclusive)
---@param y0 number Min voxel Y (inclusive)
---@param z0 number Min voxel Z (inclusive)
---@param x1 number Max voxel X (inclusive)
---@param y1 number Max voxel Y (inclusive)
---@param z1 number Max voxel Z (inclusive)
---@param layer? CollisionLayer 0 = map only, 1 = draw only, 2 = both (default 2)
---@return boolean hit True if any solid voxel overlaps the box
---@return integer x First intersecting voxel X coordinate
---@return integer y First intersecting voxel Y coordinate
---@return integer z First intersecting voxel Z coordinate
---@return integer c Intersecting voxel colour index
---@nodiscard
function check_box(x0, y0, z0, x1, y1, z1, layer) end

---Sweep an axis-aligned bounding box along a velocity delta vector until it contacts geometry.
---@param x0 number Box min X
---@param y0 number Box min Y
---@param z0 number Box min Z
---@param x1 number Box max X
---@param y1 number Box max Y
---@param z1 number Box max Z
---@param dx number Delta motion X
---@param dy number Delta motion Y
---@param dz number Delta motion Z
---@param max_d? number Maximum travel distance limit (defaults to length of delta vector)
---@param layer? CollisionLayer 0 = map only, 1 = draw only, 2 = both (default 2)
---@return boolean hit True if the swept volume struck an obstacle
---@return number dist Unobstructed distance traveled before collision
---@return integer x Hit obstacle voxel X coordinate
---@return integer y Hit obstacle voxel Y coordinate
---@return integer z Hit obstacle voxel Z coordinate
---@return integer nx Collision impact normal X (-1, 0, 1)
---@return integer ny Collision impact normal Y (-1, 0, 1)
---@return integer nz Collision impact normal Z (-1, 0, 1)
---@return integer c Hit voxel colour index
---@nodiscard
function sweep_box(x0, y0, z0, x1, y1, z1, dx, dy, dz, max_d, layer) end

---Drop a rectangular footprint down along -Z from the given position to find ground height and clearance.
---@param x number Footprint center or min X
---@param y number Footprint center or min Y
---@param z number Starting bottom Z height
---@param w? number Footprint width along X (default 1)
---@param d? number Footprint depth along Y (default 1)
---@param max_drop? number Maximum drop distance downwards (default 128)
---@param layer? CollisionLayer 0 = map only, 1 = draw only, 2 = both (default 2)
---@return boolean hit True if ground was detected below
---@return integer ground_z Z coordinate of the highest solid ground voxel (-1 if none)
---@return number dist Vertical drop distance to ground
---@return integer x Ground hit voxel X coordinate
---@return integer y Ground hit voxel Y coordinate
---@return integer z Ground hit voxel Z coordinate
---@return integer c Ground hit voxel colour index
---@nodiscard
function sweep_down(x, y, z, w, d, max_drop, layer) end

---Query the highest solid voxel Z coordinate within an area footprint.
---@param x number Footprint X coordinate
---@param y number Footprint Y coordinate
---@param w? number Footprint width along X (default 1)
---@param d? number Footprint depth along Y (default 1)
---@param layer? CollisionLayer 0 = map only, 1 = draw only, 2 = both (default 2)
---@return integer z Highest solid Z coordinate in the area (0-127), or -1 if empty
---@nodiscard
function vheight(x, y, w, d, layer) end

--------------------------------------------------------------------------------
-- Models
--------------------------------------------------------------------------------

---Create an empty voxel model with specified dimensions and optional frame count.
---@param id string Unique identifier for the model
---@param w number Model width along X (w <= 256)
---@param d number Model depth along Y (d <= 256)
---@param h number Model height along Z (h <= 128)
---@param frames? number Number of animation frames (1-64, default 1)
function newmodel(id, w, d, h, frames) end

---Set a single voxel inside a model definition.
---@param id string Model identifier
---@param x number Model voxel X (0 <= x < w)
---@param y number Model voxel Y (0 <= y < d)
---@param z number Model voxel Z (0 <= z < h)
---@param c number Palette colour index (1-255; 0 to erase)
---@param frame? number Animation frame index (default 0)
function mpset(id, x, y, z, c, frame) end

---Query a model's width, depth, and height.
---@param id string Model identifier
---@return integer w Width along X
---@return integer d Depth along Y
---@return integer h Height along Z
---@nodiscard
function msize(id) end

---Retrieve all solid voxels in a model frame as a list of coordinate tables.
---@param id string Model identifier
---@param frame? number Animation frame index (default 0)
---@return Voxel[] voxels List of { x, y, z, c } voxel records
---@nodiscard
function mvox(id, frame) end

--------------------------------------------------------------------------------
-- Palette
--------------------------------------------------------------------------------

---Set the RGB colour values for a single palette index (0-255).
---@param i number Palette index (0-255)
---@param r number Red channel intensity (0-255)
---@param g number Green channel intensity (0-255)
---@param b number Blue channel intensity (0-255)
function pal(i, r, g, b) end

---Restore the active palette to the cartridge's initial `__pal__` configuration.
function palt() end

---Remap colour index `a` to colour index `b` for subsequent dynamic draw calls.
---Call `pswap()` with no arguments to reset all active color remappings.
---@param a? number Source colour index to replace (0-255)
---@param b? number Target replacement colour index (0-255)
function pswap(a, b) end

--------------------------------------------------------------------------------
-- Camera and Light
--------------------------------------------------------------------------------

---Position and orient the voxel raymarching camera.
---@param x number Target look-at position voxel X (default 128)
---@param y number Target look-at position voxel Y (default 128)
---@param z number Target look-at position voxel Z (default 0)
---@param zoom? number Camera zoom factor (1.0 = 384 voxels screen width, default 1.0)
---@param yaw? number Camera rotation around Z axis in radians (default 0.0)
function camera(x, y, z, zoom, yaw) end

---Configure the directional sun light vector for surface lighting and shadows.
---@param dx number Sun vector X (points towards the sun, default -0.4)
---@param dy number Sun vector Y (points towards the sun, default -0.6)
---@param dz number Sun vector Z (points towards the sun, default 0.7)
---@param strength? number Lighting intensity multiplier (default 1.0)
function sun(dx, dy, dz, strength) end

---Set the sky background gradient palette colours.
---@param top number Palette index for top of sky gradient (0 = default sky blue)
---@param bottom number Palette index for bottom of sky gradient (0 = default blue)
function sky(top, bottom) end

---Configure depth-based distance fog.
---@param c number Palette colour index for fog tint (0 = default black)
---@param density number Fog density factor (0.0 = fog disabled)
function fog(c, density) end

--------------------------------------------------------------------------------
-- HUD (2D Overlay Canvas, 768 × 432 pixels)
--------------------------------------------------------------------------------

---Print text on the 2D HUD using the built-in 5×7 pixel font (6px character advance).
---@param s any Text string or printable value
---@param x number Screen pixel X coordinate (0-767)
---@param y number Screen pixel Y coordinate (0-431)
---@param c? number Palette colour index (default 15 = white)
---@param outline? boolean True to render a 1px drop shadow/outline (default true)
---@param scale? number Integer text scale multiplier (default 1)
function print(s, x, y, c, outline, scale) end

---Draw an unfilled rectangle outline on the 2D HUD with inclusive coordinates.
---@param x0 number Top-left screen X (0-767)
---@param y0 number Top-left screen Y (0-431)
---@param x1 number Bottom-right screen X (inclusive)
---@param y1 number Bottom-right screen Y (inclusive)
---@param c? number Palette colour index (default 15)
function rect(x0, y0, x1, y1, c) end

---Draw a filled rectangle on the 2D HUD with inclusive coordinates.
---@param x0 number Top-left screen X (0-767)
---@param y0 number Top-left screen Y (0-431)
---@param x1 number Bottom-right screen X (inclusive)
---@param y1 number Bottom-right screen Y (inclusive)
---@param c? number Palette colour index (default 15)
function rectfill(x0, y0, x1, y1, c) end

---Draw a filled circle on the 2D HUD.
---@param x number Center screen X (0-767)
---@param y number Center screen Y (0-431)
---@param r number Circle radius in pixels (up to 512)
---@param c? number Palette colour index (default 15)
function circfill(x, y, r, c) end

---Draw a built-in 8×8 pixel icon sprite on the 2D HUD.
---@param n number Sprite icon index
---@param x number Screen X coordinate
---@param y number Screen Y coordinate
---@param scale? number Pixel scale multiplier (1-16, default 1)
function spr2d(n, x, y, scale) end

---Calculate the pixel width of string `s` rendered in the built-in font (6px per character).
---@param s any String or value
---@return integer width Width in screen pixels
---@nodiscard
function textw(s) end

---Project 3D world voxel coordinates into 2D HUD screen pixel coordinates based on the current camera view.
---@param x number|vec3 World voxel X coordinate or vec3
---@param y? number World voxel Y coordinate (if x is number)
---@param z? number World voxel Z coordinate (if x is number)
---@return number sx Screen pixel X (0-767)
---@return number sy Screen pixel Y (0-431)
---@return boolean visible True if the projected point is in front of the camera and within the 768x432 screen bounds
---@nodiscard
function project(x, y, z) end

--------------------------------------------------------------------------------
-- Input
--------------------------------------------------------------------------------

---Check if an input button is currently held down.
---Buttons: 0=Left, 1=Right, 2=Up, 3=Down, 4=A (Z/Space), 5=B (X/E), 6=M (Sound mute, player 0 only).
---@param b number Button index (0-6)
---@param p? number Player index (0-3, default 0)
---@return boolean held True if the button is currently held
---@nodiscard
function btn(b, p) end

---Check if an input button was pressed down during the current tick (just went down).
---@param b number Button index (0-6)
---@param p? number Player index (0-3, default 0)
---@return boolean pressed True if the button transition occurred this tick
---@nodiscard
function btnp(b, p) end

---Read an analog stick axis for player `p`. Up is reported as positive Y.
---@param n number Axis index: 0 = X axis (-1.0 to 1.0), 1 = Y axis (-1.0 to 1.0)
---@param p? number Player index (0-3, default 0)
---@return number value Deflection between -1.0 and 1.0
---@nodiscard
function axis(n, p) end

--------------------------------------------------------------------------------
-- Sound & Music
--------------------------------------------------------------------------------

---Play a synthesized tone slide.
---@param wave WaveType Waveform type ("square", "triangle", "saw", "noise")
---@param f0 number Starting frequency in Hz
---@param f1? number Ending frequency in Hz (defaults to f0 = steady pitch)
---@param dur number Duration in seconds
---@param vol? number Volume level from 0.0 to 1.0 (default 0.25)
---@param ch? number Channel index (0-3, or nil/other for any free channel)
function tone(wave, f0, f1, dur, vol, ch) end

---Trigger a sequenced sound effect defined in the cartridge `__sfx__` section.
---@param n number Sound effect index
---@param ch? number Channel index (0-3, default 0)
function sfx(n, ch) end

---Toggle global audio mute on the console. Returns true when muted.
---@return boolean muted True if audio is now muted
function mute() end

---Play a sequenced music song from the cartridge `__music__` section.
---@param id number Song index (0-15)
---@param fade_ms? number Fade duration in milliseconds (default 0)
---@param ch_mask? number Channel bitmask (0-15, default 15 = all 4 channels)
function music(id, fade_ms, ch_mask) end

---Stop currently playing music track.
---@param fade_ms? number Fade-out duration in milliseconds (default 0)
function music_stop(fade_ms) end

---Get current song playback position for audio/visual synchronization.
---@return integer pattern Current pattern ID, or -1 if stopped
---@return integer row Current row in pattern (0-31), or -1 if stopped
---@nodiscard
function music_pos() end

---Query or set master music volume.
---@param vol? number New volume from 0.0 to 1.0 (nil to query current volume)
---@return number vol Current music volume
function music_vol(vol) end

--------------------------------------------------------------------------------
-- Math, Utilities & System
--------------------------------------------------------------------------------

---Return total elapsed cart running time in seconds (advances by +1/30 per tick).
---@return number seconds
---@nodiscard
function t() end

---Return a uniform pseudo-random number in the range `[0, n)`.
---@param n? number Upper bound (defaults to 1.0)
---@return number r Random float
---@nodiscard
function rnd(n) end

---Return the mathematical floor of `x`.
---@param x number
---@return integer
---@nodiscard
function flr(x) end

---Return the median (middle) value among three numbers.
---@param a number
---@param b number
---@param c number
---@return number
---@nodiscard
function mid(a, b, c) end

---Sample smooth 3D value noise at coordinate (x, y, z) in the range `[-1.0, 1.0]`.
---@param x number Noise coordinate X
---@param y number Noise coordinate Y
---@param z number Noise coordinate Z
---@return number noise Value in range -1.0 to 1.0
---@nodiscard
function noise3(x, y, z) end

---Query engine performance statistics.
---Indices: 0 = FPS, 1 = Update ms, 2 = Draw ms, 3 = Composite/render ms, 4 = Last input device (0=keyboard, 1=gamepad, 2=touch).
---@param n number Metric index (0-4)
---@return number stat Value of the requested metric
---@nodiscard
function stat(n) end

---Save a persistent numeric value under string key `k` for the current cartridge.
---@param k string Storage key
---@param v number Value to store
function dset(k, v) end

---Retrieve a persistent numeric value stored under string key `k` (returns 0 if unset).
---@param k string Storage key
---@return number value Stored number, or 0 if unset
---@nodiscard
function dget(k) end

---Ask for a render quality, or read the current one. "hq" ray marches at the screen's resolution with smooth corner
---shading and soft shadows; "standard" is the classic 768×432 look. A cart's `quality=` meta line sets the starting value.
---URL flags (`?hq`, `?scale=`, `?softao`, `?softshadow`) override the cart, and then quality() reports what is in use.
---@param q? "hq"|"standard" Quality to ask for; omit to only read it
---@return string quality Quality in use: "hq", "standard", or "custom" (set by URL flags)
function quality(q) end

---Log a string or value directly to the host developer console.
---@param s any Message to print
function printh(s) end

--------------------------------------------------------------------------------
-- 3D Math Module (vec3, quat, mat4)
--------------------------------------------------------------------------------

---@class vec3
---@field x number X coordinate
---@field y number Y coordinate
---@field z number Z coordinate
---@operator add(vec3): vec3
---@operator sub(vec3): vec3
---@operator mul(number|vec3): vec3
---@operator div(number|vec3): vec3
---@operator unm(): vec3
local vec3_cls = {}

---Set coordinates in-place.
---@param x number|vec3|table X coordinate, or vector/table to copy
---@param y? number Y coordinate
---@param z? number Z coordinate
---@return vec3 self
function vec3_cls:set(x, y, z) end

---Copy coordinates from another vector in-place.
---@param u vec3|table Source vector
---@return vec3 self
function vec3_cls:copy(u) end

---Clone this vector into a new instance.
---@return vec3
---@nodiscard
function vec3_cls:clone() end

---Unpack vector into (x, y, z).
---@return number x
---@return number y
---@return number z
---@nodiscard
function vec3_cls:unpack() end

---Dot product between this vector and u.
---@param u vec3|table
---@return number
---@nodiscard
function vec3_cls:dot(u) end

---Cross product between this vector and u.
---@param u vec3|table
---@param out? vec3 Optional destination vector
---@return vec3
function vec3_cls:cross(u, out) end

---Squared length (magnitude).
---@return number
---@nodiscard
function vec3_cls:sqrlen() end

---Length (magnitude).
---@return number
---@nodiscard
function vec3_cls:len() end

---Normalized copy of this vector.
---@param out? vec3 Optional destination vector
---@return vec3
function vec3_cls:norm(out) end

---Normalize this vector in-place.
---@return vec3 self
function vec3_cls:norm_self() end

---Squared distance to vector u.
---@param u vec3|table
---@return number
---@nodiscard
function vec3_cls:sqrdist(u) end

---Distance to vector u.
---@param u vec3|table
---@return number
---@nodiscard
function vec3_cls:dist(u) end

---Linear interpolation between this vector and u.
---@param u vec3|table Target vector
---@param t number Interpolation factor (0.0 to 1.0)
---@param out? vec3 Optional destination vector
---@return vec3
function vec3_cls:lerp(u, t, out) end

---Add vector u in-place.
---@param u vec3|table
---@return vec3 self
function vec3_cls:add(u) end

---Subtract vector u in-place.
---@param u vec3|table
---@return vec3 self
function vec3_cls:sub(u) end

---Scale this vector in-place by factor s.
---@param s number
---@return vec3 self
function vec3_cls:scale(s) end

---@class vec3_lib
---@overload fun(x?: number|vec3|table, y?: number, z?: number): vec3
vec3 = vec3 or {}

---Construct a zero vector (0, 0, 0).
---@return vec3
---@nodiscard
function vec3.zero() end

---Construct unit X vector (1, 0, 0).
---@return vec3
---@nodiscard
function vec3.unit_x() end

---Construct unit Y vector (0, 1, 0).
---@return vec3
---@nodiscard
function vec3.unit_y() end

---Construct unit Z vector (0, 0, 1).
---@return vec3
---@nodiscard
function vec3.unit_z() end

---Dot product between a and b.
---@param a vec3|table
---@param b vec3|table
---@return number
---@nodiscard
function vec3.dot(a, b) end

---Cross product between a and b.
---@param a vec3|table
---@param b vec3|table
---@param out? vec3 Optional destination vector
---@return vec3
function vec3.cross(a, b, out) end

---Length of vector a.
---@param a vec3|table
---@return number
---@nodiscard
function vec3.len(a) end

---Squared length of vector a.
---@param a vec3|table
---@return number
---@nodiscard
function vec3.sqrlen(a) end

---Normalized vector from a.
---@param a vec3|table
---@param out? vec3 Optional destination vector
---@return vec3
function vec3.norm(a, out) end

---Distance between a and b.
---@param a vec3|table
---@param b vec3|table
---@return number
---@nodiscard
function vec3.dist(a, b) end

---Squared distance between a and b.
---@param a vec3|table
---@param b vec3|table
---@return number
---@nodiscard
function vec3.sqrdist(a, b) end

---Linear interpolation between a and b.
---@param a vec3|table
---@param b vec3|table
---@param t number
---@param out? vec3 Optional destination vector
---@return vec3
function vec3.lerp(a, b, t, out) end


---@class quat
---@field x number X component
---@field y number Y component
---@field z number Z component
---@field w number W scalar component
---@operator mul(quat): quat
local quat_cls = {}

---Set quaternion components in-place.
---@param x? number
---@param y? number
---@param z? number
---@param w? number
---@return quat self
function quat_cls:set(x, y, z, w) end

---Clone this quaternion into a new instance.
---@return quat
---@nodiscard
function quat_cls:clone() end

---Multiply with quaternion p (Hamilton product).
---@param p quat
---@param out? quat Optional destination quaternion
---@return quat
function quat_cls:mul(p, out) end

---Rotate 3D vector v by this quaternion.
---@param v vec3|table
---@param out? vec3 Optional destination vector
---@return vec3
function quat_cls:rotate_vec(v, out) end

---Rotate 3D vector v by this quaternion (alias for rotate_vec).
---@param v vec3|table
---@param out? vec3 Optional destination vector
---@return vec3
function quat_cls:rotate(v, out) end

---Invert this quaternion.
---@param out? quat Optional destination quaternion
---@return quat
function quat_cls:inv(out) end

---Normalize this quaternion in-place.
---@return quat self
function quat_cls:norm_self() end

---Spherical linear interpolation between this quaternion and target.
---@param target quat
---@param t number Interpolation factor (0.0 to 1.0)
---@param out? quat Optional destination quaternion
---@return quat
function quat_cls:slerp(target, t, out) end

---Convert quaternion to Euler angles (in radians).
---@return number yaw Rotation around Z axis in radians
---@return number pitch Rotation around Y axis in radians
---@return number roll Rotation around X axis in radians
---@nodiscard
function quat_cls:to_euler() end

---@class quat_lib
---@overload fun(x?: number, y?: number, z?: number, w?: number): quat
quat = quat or {}

---Construct an identity quaternion (0, 0, 0, 1).
---@return quat
---@nodiscard
function quat.identity() end

---Construct a quaternion from an axis and rotation angle (in radians).
---@param axis vec3|table Axis of rotation
---@param angle number Angle in radians
---@return quat
---@nodiscard
function quat.from_axis_angle(axis, angle) end

---Construct a quaternion from Euler angles (in radians).
---@param yaw? number Yaw angle in radians (Z-axis)
---@param pitch? number Pitch angle in radians (Y-axis)
---@param roll? number Roll angle in radians (X-axis)
---@return quat
---@nodiscard
function quat.from_euler(yaw, pitch, roll) end

---Hamilton product of quaternions a and b.
---@param a quat
---@param b quat
---@param out? quat Optional destination quaternion
---@return quat
function quat.mul(a, b, out) end

---Rotate vector v by quaternion q.
---@param q quat
---@param v vec3|table
---@param out? vec3 Optional destination vector
---@return vec3
function quat.rotate_vec(q, v, out) end

---Rotate vector v by quaternion q (alias for rotate_vec).
---@param q quat
---@param v vec3|table
---@param out? vec3 Optional destination vector
---@return vec3
function quat.rotate(q, v, out) end

---Spherical linear interpolation between quaternions a and b.
---@param a quat
---@param b quat
---@param t number Interpolation factor (0.0 to 1.0)
---@param out? quat Optional destination quaternion
---@return quat
function quat.slerp(a, b, t, out) end


---@class mat4
---@field [integer] number Matrix element (1-16)
---@operator mul(mat4): mat4
local mat4_cls = {}

---Clone this matrix into a new instance.
---@return mat4
---@nodiscard
function mat4_cls:clone() end

---Multiply with another matrix.
---@param other mat4
---@param out? mat4 Optional destination matrix
---@return mat4
function mat4_cls:mul(other, out) end

---Transform 3D point (w = 1).
---@param v vec3|table
---@param out? vec3 Optional destination vector
---@return vec3
function mat4_cls:transform_point(v, out) end

---Transform 3D direction vector (w = 0).
---@param v vec3|table
---@param out? vec3 Optional destination vector
---@return vec3
function mat4_cls:transform_dir(v, out) end

---@class mat4_lib
mat4 = mat4 or {}

---Construct an identity 4x4 matrix.
---@return mat4
---@nodiscard
function mat4.identity() end

---Construct a translation 4x4 matrix.
---@param x number|vec3|table Translation X or vector
---@param y? number Translation Y
---@param z? number Translation Z
---@return mat4
---@nodiscard
function mat4.translate(x, y, z) end

---Construct a scaling 4x4 matrix.
---@param sx number Scale X
---@param sy? number Scale Y (defaults to sx)
---@param sz? number Scale Z (defaults to sx)
---@return mat4
---@nodiscard
function mat4.scale(sx, sy, sz) end

---Construct a rotation 4x4 matrix from a quaternion.
---@param q quat Rotation quaternion
---@return mat4
---@nodiscard
function mat4.rotate_quat(q) end

---Construct a LookAt view transform 4x4 matrix.
---@param eye vec3|table Eye position
---@param target vec3|table Target position
---@param up? vec3|table Up direction vector (defaults to 0, 0, 1)
---@return mat4
---@nodiscard
function mat4.look_at(eye, target, up) end

