# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sky Racers is a browser-based 3D flying cars game for kids (ages 5-12), built with Three.js and Vite. Players build and customize futuristic flying cars, take off from a runway, fly over a neon-lit procedural city, collect coins, dodge obstacles, interact with LLM-controlled AI cars, and land back on the runway. Crashing sends the player to a virtual garage for repairs using earned coins.

## Commands

```bash
# Development (two terminals needed)
npm run dev          # Vite dev server on http://localhost:5173
node server/proxy.js # OpenAI proxy server on http://localhost:3001

# The Vite config proxies /api/* requests to the Express server
```

No build step is needed for development. No test framework is configured yet.

## Architecture

### State Machine
The game uses a top-level state machine in `src/main.js`:
```
MENU → BUILDER → MENU
MENU → TAKEOFF → PLAYING → LANDING → Summary → MENU
PLAYING → GARAGE → TAKEOFF → PLAYING
```
- **TAKEOFF**: Car starts on runway, auto-accelerates, player presses UP to lift off. Transitions to PLAYING when altitude > 25.
- **PLAYING**: Free flight over city. Press L within 150m of runway to initiate landing.
- **LANDING**: Auto-alignment to runway, descent, touchdown, deceleration. Shows flight summary screen.
- **GARAGE**: Triggered when health reaches 0. Repair options cost coins; free patch always available.

### Core Systems (src/)
- **main.js** — Bootstrap, game loop (requestAnimationFrame), state transitions, collision detection, camera follow, takeoff/landing sequences. Central orchestrator.
- **config.js** — All tunable game constants (speeds, damage values, costs, grid sizes). Change gameplay feel here.
- **core/EventBus.js** — Pub/sub (`on`/`off`/`emit`) for decoupled communication (e.g., `coin-collected`, `player-destroyed`).
- **core/InputManager.js** — Keyboard input tracking. Exposes `input.left`, `input.right`, `input.up`, `input.down`, `input.boost`, and `input.isDown(code)`.

### World Generation (src/world/)
- **City.js** — Futuristic procedural city with three building types: block (with window textures), cylindrical towers (with spiral neon), and stepped/tapered towers. All buildings have neon accent strips and edge glow lines. Landing pads on some rooftops.
- **Runway.js** — Runway at the south edge of the city with dashed center line, threshold markings, edge lights, approach lights, terminal building, and control tower. Provides `getTakeoffPosition()`, `isOnRunway()`, `distanceTo()`, and `directionTo()` methods.
- **Skybox.js** — Shader-based sky gradient sphere that follows the camera. Must call `update(cameraPosition)` each frame.
- **CoinSpawner.js** — Spawns collectible coins (gold/silver/bronze) at random positions. Handles collection and respawning.

### Vehicles (src/vehicles/)
- **PlayerCar.js** — Futuristic flying car with flight physics, exhaust particle trails, neon underglow animation, nacelle glow pulsing, health, boost, invulnerability, boundary wrapping.
- **AICar.js** — Futuristic AI car with scripted fallback behavior and LLM decision application. Each car has a personality (aggressive/cautious/silly/show-off) and a unique neon color.
- **AICarManager.js** — Manages all AI cars, batches LLM requests every N seconds via `LLMClient`, falls back to scripted behavior if LLM is unavailable.
- **CarParts.js** — Part catalog (colors with neon variants, swept wings with configurable span/chord/sweep, engines with glow colors, decals) and `buildCarMesh()` factory. Cars use tapered CylinderGeometry fuselage, ExtrudeGeometry swept wings, SphereGeometry cockpit dome, TorusGeometry engine rings, and neon underglow strips.

### AI Integration (src/ai/)
- **LLMClient.js** — Fetches AI decisions from `/api/ai-decision` with a 3-second timeout.
- **prompts.js** — System prompt and user prompt builder for GPT-4o. AI returns JSON array of decisions per car.
- **server/proxy.js** — Express server that proxies requests to OpenAI's API. Supports custom `OPENAI_BASE_URL`.

### UI (src/ui/)
- **HUD.js** — HTML overlay showing coins, health bar, speed, boost status, altitude, and runway distance indicator. Listens to EventBus for coin popups and crash flashes.
- **index.html** — All UI screens (menu, builder, garage, takeoff overlay, landing overlay, flight summary) are HTML/CSS overlays toggled via class names.

### Key Patterns
- All 3D entities are built from procedural Three.js primitives (no model files). Car meshes use MeshStandardMaterial with emissive properties so they glow and are visible from all angles (kid-friendly).
- Building window textures are generated dynamically via Canvas 2D (`createWindowTexture` in City.js).
- Collision uses sphere-vs-AABB (buildings) and sphere-vs-sphere (cars) in `src/utils/collision.js`.
- Game state (coins, car config) persists to localStorage via `src/utils/storage.js`.
- The car builder (`src/scenes/BuilderScene.js`) creates its own Three.js renderer on a separate canvas.
- Exponential fog (`FogExp2`) and ACES filmic tone mapping give the city a cinematic atmosphere.
- Renderer uses `powerPreference: 'high-performance'` to request GPU, PCF soft shadows, SRGB color space.
- Hemisphere light + fill light ensures cars/buildings are never dark silhouettes.

## LLM Integration Details

AI cars use GPT-4o via the OpenAI-compatible API at `localhost:4000/v1`. No separate proxy server is needed — Vite proxies `/v1/*` requests directly to the LLM endpoint. The API key is in `src/ai/LLMClient.js`. Calls are batched (all cars in one request) every ~4 seconds. Between calls, cars interpolate smoothly toward their last LLM-assigned target. If the LLM is unavailable, AI cars use scripted fallback behavior automatically.

The LLM endpoint is configured in `vite.config.js` (proxy) and `src/ai/LLMClient.js` (API key).
