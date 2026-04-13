# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sky Racers is a browser-based 3D flying cars game for kids (ages 5-12), built with Three.js and Vite. Players build and customize futuristic flying cars, take off from a runway toward a neon-lit city, fly over the city collecting coins, dodge AI cars, then land via a spectacular auto-pilot sequence. After landing, the car transforms into a ground vehicle and kids can drive freely through city streets before heading back to the runway to fly again.

## Commands

```bash
npm run dev    # Vite dev server on http://localhost:5173 — only command needed
```

No build step needed. No test framework. No separate server — LLM calls go through Vite proxy to `localhost:4000/v1`.

## Architecture

### State Machine (src/main.js)
```
MENU → BUILDER → MENU
MENU → TAKEOFF → PLAYING → LANDING → DRIVING → (T at runway) → TAKEOFF
PLAYING → GARAGE → TAKEOFF
```
- **TAKEOFF**: Car sits still on runway facing city. Press T to roll and lift off toward city. 3 phases: wait → roll → liftoff.
- **PLAYING**: Free flight. UP/DOWN incrementally adjust climb rate (no holding needed). Left/Right steer. Space boost. L to land.
- **LANDING**: 6-phase auto-pilot: climb → circle city (panoramic) → position south → final approach toward city → touchdown → transition to DRIVING.
- **DRIVING**: Ground car free roam. UP/DOWN incrementally adjust speed (car coasts, no holding). Drive to runway start, press T to fly again.
- **GARAGE**: Health reaches 0. Repair for coins or free patch.

### Controls
- **Flying**: LEFT/RIGHT steer, UP/DOWN adjust climb rate (incremental, no holding), SPACE boost, L land, T takeoff
- **Driving**: LEFT/RIGHT steer, UP/DOWN adjust speed (incremental, coasts), T takeoff (at runway)
- **Key principle**: All controls are incremental — tap to adjust, car/plane maintains speed/altitude. No holding keys.

### Core Systems (src/)
- **main.js** — Game loop, state machine, collision, camera, takeoff/landing sequences, driving mode, wing fold/unfold car transformation. ~600 lines, central orchestrator.
- **config.js** — All tunable constants. Kid-friendly balance: HEALTH_MAX=150, low building damage (8), cheap repairs, 60 coins spawned.
- **core/EventBus.js** — Pub/sub for `coin-collected`, `player-destroyed`, `player-damaged`.
- **core/InputManager.js** — `input.left/right/up/down/boost` booleans, `input.isDown(code)` for T/L keys.

### World (src/world/)
- **City.js** — Procedural island city. Irregular coastline (sine wave shape), surrounded by ocean, sandy beach, green grass border. 3 building types: block (window textures), cylindrical (spiral neon), tapered/stepped. Street trees, streetlights, benches. Walking people (animated legs). Ground traffic cars. `update(dt)` animates people/cars.
- **Runway.js** — South of city. Dashed center line, threshold markings, edge lights, PAPI approach lights, terminal building, control tower with beacon. Key methods: `getTakeoffPosition()`, `isOnRunway()`, `distanceTo()`.
- **Skybox.js** — Bright daytime shader sky (blue→cyan). Follows camera via `update(cameraPosition)`. White puffy clouds.
- **CoinSpawner.js** — 60 big glowing coins (gold/silver/bronze) with outer glow sphere. Collection radius 5 units. Respawn after 2s.

### Vehicles (src/vehicles/)
- **PlayerCar.js** — Flying car with incremental `climbRate`. Auto-tilt wings for narrow gaps (`updateAutoTilt()`). Boundary push-back (not teleport). Exhaust particle trail. `isOutOfBounds` flag for "Turn Around!" warning.
- **AICar.js** — Futuristic AI car with personality-driven scripted behavior + LLM override. Neon glow colors per car.
- **AICarManager.js** — Batches LLM requests every 4s. Graceful fallback to scripted AI.
- **CarParts.js** — `buildCarMesh(config)` factory. Tapered fuselage (CylinderGeometry), ExtrudeGeometry swept wings, glass cockpit dome, engine nacelles, neon underglow racing stripes, wing tip lights. MeshStandardMaterial with emissive glow.
- **GroundCar.js** — `buildGroundCarMesh(config)` factory. Sedan with 4 wheels (named 'wheel' for spin animation), windshield, side windows, headlights, taillights, spoiler, neon underglow. Used after landing transformation.

### Car Transformation (main.js)
- `transformToGroundCar()` — Swaps flying mesh for GroundCar sedan mesh. Preserves position/rotation.
- `transformToFlyingCar()` — Swaps back. Restores saved flying mesh.
- Triggered on touchdown (to ground) and at runway start (back to flying).

### Collision (main.js + src/utils/collision.js)
- Buildings: sphere-vs-AABB. Only damages on **head-on** collision (dot product > 0.3). Side-scraping just pushes away, no damage.
- AI cars: sphere-vs-sphere. Always damages + pushes apart.
- Auto wing tilt: `playerCar.updateAutoTilt(buildingBoxes)` detects buildings on left/right, auto-rolls to squeeze through narrow gaps.

### AI Integration (src/ai/)
- **LLMClient.js** — Calls `/v1/chat/completions` directly (Vite proxies to `localhost:4000`). API key hardcoded. 4s timeout.
- **prompts.js** — System prompt for kid-safe AI car behavior. Returns JSON array of decisions.

### UI (src/ui/ + index.html)
- **HUD.js** — Coins, health bar (color-coded), speed, boost, altitude, runway distance indicator.
- **index.html** — All screens as HTML overlays: menu, builder, garage, takeoff overlay, landing overlay (phase text updates), drive HUD (explore hint / takeoff prompt), landing summary, boundary warning ("Turn Around!"), controls hint. CSS animations for pulsing/bouncing.

### Rendering
- WebGLRenderer: `powerPreference: 'high-performance'`, `logarithmicDepthBuffer: true`, PCF soft shadows, ACES tone mapping (exposure 1.6), SRGB color space.
- Lighting: strong sun (1.8) + ambient (1.5) + fill light from front-below + warm rim light + hemisphere light. Cars never silhouettes.
- Fog: `THREE.Fog(0x87ceeb, 200, 500)` — bright daytime.
- Environment: ocean (MeshStandard, turquoise), 12 mountains (ConeGeometry, some with snow caps), 6 small islands with palm trees.

### Key Design Decisions
- No model files — 100% procedural Three.js geometry. Keeps game < 3MB.
- MeshStandardMaterial with emissive on all cars/buildings — glows from all angles.
- Building gaps are wide (CITY_CELL_SIZE=18, buildings use 35-55% of cell) for kid-friendly flying.
- Incremental controls (not hold-to-move) for both flying and driving.
- Smart collision: only head-on crashes damage, side-scraping is free. Auto wing tilt.
- Ground Z-fighting fixed with polygonOffset + vertical layer separation + logarithmic depth buffer.

## LLM Integration

AI cars use GPT-4o via OpenAI-compatible API at `localhost:4000/v1`. Vite proxies `/v1/*` in `vite.config.js`. API key in `src/ai/LLMClient.js`. Batched calls every ~4s. Scripted fallback when LLM unavailable.
