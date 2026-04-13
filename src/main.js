import * as THREE from 'three';
import config from './config.js';
import { eventBus } from './core/EventBus.js';
import { input } from './core/InputManager.js';
import { City } from './world/City.js';
import { Skybox } from './world/Skybox.js';
import { Runway } from './world/Runway.js';
import { CoinSpawner } from './world/CoinSpawner.js';
import { PlayerCar } from './vehicles/PlayerCar.js';
import { AICarManager } from './vehicles/AICarManager.js';
import { HUD } from './ui/HUD.js';
import { loadGame, saveGame } from './utils/storage.js';
import { sphereIntersectsBox, sphereIntersectsSphere, distanceToBox } from './utils/collision.js';
import { BuilderScene } from './scenes/BuilderScene.js';
import { buildCarMesh, getDefaultConfig, getStatsFromConfig } from './vehicles/CarParts.js';
import { buildGroundCarMesh } from './vehicles/GroundCar.js';
import { preloadModels } from './utils/ModelLoader.js';

// ---- State ----
let state = 'MENU'; // MENU | TAKEOFF | PLAYING | LANDING | GARAGE | BUILDER
let scene, camera, renderer;
let city, skybox, runway, coinSpawner, playerCar, aiCarManager, hud;
let saveData;
let clock;

// Screen shake
let shakeIntensity = 0;
let shakeDecay = 5;

// Takeoff state
let takeoffSpeed = 0;
let takeoffPhase = 'accelerate'; // accelerate | liftoff

// Landing state
let landingPhase = 'approach'; // approach | touchdown | decelerate
let sessionCoins = 0; // coins earned this session

// ---- Init Renderer ----
function initRenderer() {
  const canvas = document.getElementById('game-canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.6;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });
}

// ---- Init Game Scene ----
function initGameScene() {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x87ceeb, 200, 500); // Bright daytime fog, not dark

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 600);

  // Bright sunny daytime lighting
  const ambient = new THREE.AmbientLight(0x99aabb, 1.5);
  scene.add(ambient);

  // Strong sunlight
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(60, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 300;
  sun.shadow.camera.left = -150;
  sun.shadow.camera.right = 150;
  sun.shadow.camera.top = 150;
  sun.shadow.camera.bottom = -150;
  scene.add(sun);

  // Fill light from front-below so cars are never silhouettes
  const fillLight = new THREE.DirectionalLight(0x8899cc, 0.6);
  fillLight.position.set(-30, -20, -50);
  scene.add(fillLight);

  // Warm rim light from behind
  const rimLight = new THREE.DirectionalLight(0xffaa66, 0.4);
  rimLight.position.set(0, 30, 80);
  scene.add(rimLight);

  // Hemisphere light — bright sky, green ground bounce
  const hemiLight = new THREE.HemisphereLight(0x99ddff, 0x88aa66, 0.8);
  scene.add(hemiLight);

  // Point light that follows the player
  const playerLight = new THREE.PointLight(0x00ccff, 0.8, 40);
  playerLight.name = 'playerLight';
  scene.add(playerLight);

  // World
  skybox = new Skybox(scene);
  city = new City(scene);
  runway = new Runway(scene);
  coinSpawner = new CoinSpawner(scene);

  // Player
  playerCar = new PlayerCar(scene);

  // AI cars
  aiCarManager = new AICarManager(scene);

  // HUD
  hud = new HUD();
  hud.setCoins(saveData.coins);
}

// ---- Camera Follow ----
function updateCamera(dt) {
  const carPos = playerCar.mesh.position;
  const carRot = playerCar.mesh.rotation;

  // Compute ideal camera position: behind and above the car
  const offset = new THREE.Vector3(0, config.CAMERA_HEIGHT, config.CAMERA_DISTANCE);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), carRot.y);
  const targetPos = carPos.clone().add(offset);

  camera.position.lerp(targetPos, config.CAMERA_LERP * dt);

  // Look at a point slightly ahead of the car
  const lookTarget = carPos.clone();
  const forward = new THREE.Vector3(0, 0, -5);
  forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), carRot.y);
  lookTarget.add(forward);
  lookTarget.y += 1;
  camera.lookAt(lookTarget);

  // Screen shake
  if (shakeIntensity > 0) {
    camera.position.x += (Math.random() - 0.5) * shakeIntensity;
    camera.position.y += (Math.random() - 0.5) * shakeIntensity;
    shakeIntensity -= shakeDecay * dt;
    if (shakeIntensity < 0) shakeIntensity = 0;
  }
}

// ---- Collision ----
function checkCollisions() {
  const playerSphere = playerCar.boundingSphere;
  const forward = playerCar.velocity;

  // Player vs buildings — only collide when flying INTO the building
  for (const box of city.buildingBoxes) {
    if (sphereIntersectsBox(playerSphere, box)) {
      const boxCenter = new THREE.Vector3();
      box.getCenter(boxCenter);
      const toBuilding = new THREE.Vector3().subVectors(boxCenter, playerCar.position);
      toBuilding.y = 0;
      toBuilding.normalize();

      // Dot product: positive = flying toward building, negative = flying away/past it
      const dot = forward.dot(toBuilding);

      if (dot > 0.3) {
        // Head-on or near head-on collision — take damage
        playerCar.takeDamage(config.DAMAGE_BUILDING_COLLISION);
        shakeIntensity = 1.5;
      }

      // Always push away from building (gentle redirect, even for scrapes)
      const pushDir = playerCar.position.clone().sub(boxCenter).normalize();
      playerCar.position.add(pushDir.multiplyScalar(1.5));
      break;
    }
  }

  // Player vs AI cars
  for (const aiCar of aiCarManager.cars) {
    const aiSphere = aiCar.boundingSphere;
    if (sphereIntersectsSphere(playerSphere, aiSphere)) {
      playerCar.takeDamage(config.DAMAGE_AI_COLLISION);
      shakeIntensity = 3;

      const pushDir = playerCar.position.clone().sub(aiCar.position).normalize();
      playerCar.position.add(pushDir.multiplyScalar(3));
      aiCar.mesh.position.add(pushDir.multiplyScalar(-3));
    }
  }

  // Auto-tilt wings for narrow gaps
  playerCar.updateAutoTilt(city.buildingBoxes);

  // Update boundary warning
  updateBoundaryWarning();
}

function updateBoundaryWarning() {
  const warning = document.getElementById('boundary-warning');
  if (!warning) return;

  // Don't show during landing or takeoff
  if (state !== 'PLAYING') {
    warning.classList.remove('active');
    return;
  }

  if (playerCar.isOutOfBounds) {
    warning.classList.add('active');
  } else {
    warning.classList.remove('active');
  }
}

// ---- TAKEOFF ----
function startTakeoff() {
  state = 'TAKEOFF';
  takeoffSpeed = 0;
  takeoffPhase = 'accelerate';
  sessionCoins = 0;

  // Position car at south end of runway, facing north (toward city at Z=0)
  const startPos = runway.getTakeoffPosition();
  playerCar.mesh.position.copy(startPos);
  playerCar.mesh.rotation.set(0, 0, 0); // rotation.y=0 → forward is (0,0,-1) → toward city
  playerCar.health = config.HEALTH_MAX;
  playerCar.invulnerable = 0;
  playerCar.climbRate = 0;

  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('takeoff-overlay').classList.add('active');
  hud.show();
}

function updateTakeoff(dt) {
  const forward = new THREE.Vector3(0, 0, -1);
  forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerCar.mesh.rotation.y);

  if (takeoffPhase === 'accelerate') {
    // Car sits still on runway until player presses UP
    playerCar.mesh.position.y = 0.5;

    if (input.isDown('KeyT')) {
      takeoffPhase = 'roll';
    }

    // Takeoff camera — behind and above, showing city skyline ahead
    const carPos = playerCar.mesh.position;
    const camTarget = carPos.clone().add(new THREE.Vector3(0, 6, 16)); // behind (+Z is behind when facing -Z)
    camera.position.lerp(camTarget, dt * 3);
    const lookAhead = carPos.clone().add(new THREE.Vector3(0, 2, -30)); // look toward city
    camera.lookAt(lookAhead);
    skybox.update(camera.position);
    hud.update(playerCar);
    return;
  } else if (takeoffPhase === 'roll') {
    // Accelerate along runway toward city
    takeoffSpeed = Math.min(takeoffSpeed + 20 * dt, config.PLAYER_BASE_SPEED * 1.3);
    playerCar.mesh.position.x += forward.x * takeoffSpeed * dt;
    playerCar.mesh.position.z += forward.z * takeoffSpeed * dt;
    playerCar.mesh.position.y = 0.5;

    // Auto-liftoff when fast enough (after short runway roll)
    if (takeoffSpeed > config.PLAYER_BASE_SPEED * 0.8) {
      takeoffPhase = 'liftoff';
    }
  } else if (takeoffPhase === 'liftoff') {
    // Lift off — climb into the city
    takeoffSpeed = Math.min(takeoffSpeed + 5 * dt, config.PLAYER_BASE_SPEED);
    playerCar.mesh.position.x += forward.x * takeoffSpeed * dt;
    playerCar.mesh.position.z += forward.z * takeoffSpeed * dt;
    playerCar.mesh.position.y += takeoffSpeed * 0.4 * dt;

    // Nose up
    playerCar.mesh.rotation.x = THREE.MathUtils.lerp(playerCar.mesh.rotation.x, 0.3, dt * 3);

    // Transition to PLAYING when high enough
    if (playerCar.mesh.position.y > 25) {
      state = 'PLAYING';
      document.getElementById('takeoff-overlay').classList.remove('active');
    }
  }

  updateCamera(dt);
  skybox.update(camera.position);
  hud.update(playerCar);
}

// ---- Transform between flying car and ground car ----
let savedFlyingMesh = null;

function transformToGroundCar() {
  const pos = playerCar.mesh.position.clone();
  const rotY = playerCar.mesh.rotation.y;

  // Save the flying mesh
  savedFlyingMesh = playerCar.mesh;
  scene.remove(savedFlyingMesh);

  // Build ground car with same color config
  const carConfig = saveData.carConfig || getDefaultConfig();
  playerCar.mesh = buildGroundCarMesh(carConfig);
  playerCar.mesh.position.copy(pos);
  playerCar.mesh.rotation.y = rotY;
  scene.add(playerCar.mesh);
}

function transformToFlyingCar() {
  const pos = playerCar.mesh.position.clone();
  const rotY = playerCar.mesh.rotation.y;

  scene.remove(playerCar.mesh);

  if (savedFlyingMesh) {
    playerCar.mesh = savedFlyingMesh;
    savedFlyingMesh = null;
  } else {
    const carConfig = saveData.carConfig || getDefaultConfig();
    playerCar.mesh = buildCarMesh(carConfig);
  }
  playerCar.mesh.position.copy(pos);
  playerCar.mesh.rotation.set(0, rotY, 0);
  scene.add(playerCar.mesh);
}

// ---- LANDING (spectacular auto-pilot + drive back) ----
let landingTimer = 0;
// circleAngle tracks the car's orbit around city center
let circleAngle = 0;

function startLanding() {
  state = 'LANDING';
  // Phases: climb → circle → position → approach → touchdown → drive
  landingPhase = 'climb';
  landingTimer = 0;
  circleAngle = Math.atan2(playerCar.position.x, playerCar.position.z);
  document.getElementById('landing-overlay').classList.add('active');
  document.getElementById('landing-overlay').querySelector('h3').textContent = 'Climbing...';
  document.getElementById('boundary-warning').classList.remove('active');
}

// Helper: rotation.y so the car faces targetPos from fromPos
function faceTarget(fromPos, targetPos) {
  return Math.atan2(-(targetPos.x - fromPos.x), -(targetPos.z - fromPos.z));
}

function updateLanding(dt) {
  landingTimer += dt;
  const pos = playerCar.mesh.position;
  const runwaySouth = runway.getTakeoffPosition(); // far end (south, high Z)
  const runwayCenter = runway.getRunwayCenter();
  const halfCity = (config.CITY_GRID_SIZE * config.CITY_CELL_SIZE) / 2;
  const speed = 20;

  if (landingPhase === 'climb') {
    // Phase 1: Climb to scenic altitude, turn toward city
    pos.y = THREE.MathUtils.lerp(pos.y, 60, dt * 2.5);
    playerCar.mesh.rotation.x = THREE.MathUtils.lerp(playerCar.mesh.rotation.x, 0.2, dt * 3);
    playerCar.mesh.rotation.z = THREE.MathUtils.lerp(playerCar.mesh.rotation.z, 0, dt * 3);

    // Fly toward city center while climbing
    const toCity = new THREE.Vector3(-pos.x, 0, -pos.z);
    if (toCity.length() > 5) {
      const dir = toCity.normalize();
      pos.x += dir.x * speed * 0.5 * dt;
      pos.z += dir.z * speed * 0.5 * dt;
    }
    const targetRot = faceTarget(pos, new THREE.Vector3(0, 0, 0));
    playerCar.mesh.rotation.y = THREE.MathUtils.lerp(playerCar.mesh.rotation.y, targetRot, dt * 1.5);

    if (landingTimer > 2.5) {
      landingPhase = 'circle';
      landingTimer = 0;
      circleAngle = Math.atan2(pos.x, pos.z);
      document.getElementById('landing-overlay').querySelector('h3').textContent = 'Circling the city...';
    }
  } else if (landingPhase === 'circle') {
    // Phase 2: Circle around the city — scenic panoramic view
    const circleRadius = halfCity * 0.8;
    const circleSpeed = 0.4; // radians per second
    circleAngle += circleSpeed * dt;

    // Target position on the circle
    const targetX = Math.sin(circleAngle) * circleRadius;
    const targetZ = Math.cos(circleAngle) * circleRadius;
    const circleTarget = new THREE.Vector3(targetX, 50, targetZ);

    // Move toward circle target
    const toTarget = new THREE.Vector3().subVectors(circleTarget, pos);
    toTarget.y = 0;
    if (toTarget.length() > 1) {
      const dir = toTarget.normalize();
      pos.x += dir.x * speed * dt;
      pos.z += dir.z * speed * dt;
    }
    pos.y = THREE.MathUtils.lerp(pos.y, 50, dt * 1.5);

    // Face movement direction (tangent to circle)
    const tangentAngle = circleAngle + Math.PI / 2;
    playerCar.mesh.rotation.y = THREE.MathUtils.lerp(playerCar.mesh.rotation.y, tangentAngle, dt * 2);
    playerCar.mesh.rotation.x = THREE.MathUtils.lerp(playerCar.mesh.rotation.x, 0, dt * 2);
    playerCar.mesh.rotation.z = THREE.MathUtils.lerp(playerCar.mesh.rotation.z, -0.25, dt * 2); // bank into turn

    // After ~270 degrees of circle (or time limit), position for approach
    if (landingTimer > 5) {
      landingPhase = 'position';
      landingTimer = 0;
      document.getElementById('landing-overlay').querySelector('h3').textContent = 'Lining up...';
    }
  } else if (landingPhase === 'position') {
    // Phase 3: Fly to a point far south of the runway (approach start)
    const approachStart = new THREE.Vector3(runway.runwayX, 30, runwaySouth.z + 25);
    const toStart = new THREE.Vector3().subVectors(approachStart, pos);
    toStart.y = 0;
    const dist = toStart.length();

    const targetRot = faceTarget(pos, approachStart);
    playerCar.mesh.rotation.y = THREE.MathUtils.lerp(playerCar.mesh.rotation.y, targetRot, dt * 2);
    playerCar.mesh.rotation.z = THREE.MathUtils.lerp(playerCar.mesh.rotation.z, 0, dt * 3);
    playerCar.mesh.rotation.x = THREE.MathUtils.lerp(playerCar.mesh.rotation.x, 0, dt * 2);

    if (dist > 2) {
      const dir = toStart.normalize();
      pos.x += dir.x * speed * dt;
      pos.z += dir.z * speed * dt;
    }
    pos.y = THREE.MathUtils.lerp(pos.y, 40, dt * 2);

    if (dist < 15 || landingTimer > 6) {
      landingPhase = 'approach';
      landingTimer = 0;
      // Now face north toward city for the approach
      playerCar.mesh.rotation.y = 0; // face -Z = toward city
      document.getElementById('landing-overlay').querySelector('h3').textContent = 'Final approach...';
    }
  } else if (landingPhase === 'approach') {
    // Phase 4: Descend toward city — city skyline visible ahead!
    // Face north (toward city, -Z)
    playerCar.mesh.rotation.y = THREE.MathUtils.lerp(playerCar.mesh.rotation.y, 0, dt * 3);
    playerCar.mesh.rotation.z = THREE.MathUtils.lerp(playerCar.mesh.rotation.z, 0, dt * 4);
    playerCar.mesh.rotation.x = THREE.MathUtils.lerp(playerCar.mesh.rotation.x, -0.08, dt * 3);

    // Fly north (forward = -Z when rotation.y = 0)
    const approachSpeed = 18;
    pos.z -= approachSpeed * dt; // directly toward city (-Z)

    // Steeper descent to reach runway
    const distToRunway = Math.abs(pos.z - runwayCenter.z);
    const targetAlt = Math.max(0.8, distToRunway * 0.1);
    pos.y = THREE.MathUtils.lerp(pos.y, targetAlt, dt * 3);

    // Keep aligned with runway center X
    pos.x = THREE.MathUtils.lerp(pos.x, runway.runwayX, dt * 3);

    if (pos.y < 2 && runway.isOnRunway(pos)) {
      landingPhase = 'touchdown';
      shakeIntensity = 0.8;
      takeoffSpeed = approachSpeed;
      document.getElementById('landing-overlay').querySelector('h3').textContent = 'Touchdown!';
    }
    if (landingTimer > 12) {
      landingPhase = 'touchdown';
      takeoffSpeed = 8;
      pos.y = 0.5;
      document.getElementById('landing-overlay').querySelector('h3').textContent = 'Touchdown!';
    }
  } else if (landingPhase === 'touchdown') {
    // Phase 5: Decelerate on runway
    pos.y = THREE.MathUtils.lerp(pos.y, 0.5, dt * 5);
    playerCar.mesh.rotation.x = THREE.MathUtils.lerp(playerCar.mesh.rotation.x, 0, dt * 5);
    playerCar.mesh.rotation.z = THREE.MathUtils.lerp(playerCar.mesh.rotation.z, 0, dt * 5);

    // Continue rolling north (-Z)
    takeoffSpeed = Math.max(takeoffSpeed - 15 * dt, 0);
    pos.z -= takeoffSpeed * dt;

    if (takeoffSpeed < 0.3) {
      // Transform into ground car and enter free driving mode
      state = 'DRIVING';
      driveCurrentSpeed = 0;
      transformToGroundCar();
      document.getElementById('landing-overlay').classList.remove('active');
      document.getElementById('drive-hud').classList.add('active');
      hud.show();

      // Save coins from the flight
      saveData.coins = hud.coins;
      saveGame(saveData);
    }
  }

  updateCamera(dt);
  skybox.update(camera.position);
  hud.update(playerCar);
}

function showLandingSummary() {
  document.getElementById('landing-overlay').classList.remove('active');
  const summary = document.getElementById('landing-summary');
  document.getElementById('summary-coins').textContent = sessionCoins;
  document.getElementById('summary-total').textContent = saveData.coins;
  summary.classList.add('active');
}

function finishLanding() {
  document.getElementById('landing-summary').classList.remove('active');
  document.getElementById('drive-hud').classList.remove('active');
  hud.hide();
  document.getElementById('menu-screen').classList.remove('hidden');
  state = 'MENU';

  saveData.coins = hud.coins;
  saveGame(saveData);
}

// ---- DRIVING (free roam ground car) ----
let driveCurrentSpeed = 0;

function updateDriving(dt) {
  const pos = playerCar.mesh.position;
  pos.y = 0.5;
  playerCar.mesh.rotation.x = 0;

  // UP increments speed, DOWN decrements — no need to hold
  const maxDriveSpeed = 20;
  if (input.up) driveCurrentSpeed = Math.min(driveCurrentSpeed + 12 * dt, maxDriveSpeed);
  if (input.down) driveCurrentSpeed = Math.max(driveCurrentSpeed - 15 * dt, -8); // reverse allowed but slower
  // Gentle friction when no input — car coasts
  if (!input.up && !input.down) {
    driveCurrentSpeed *= (1 - 1.5 * dt); // gradual slowdown
    if (Math.abs(driveCurrentSpeed) < 0.3) driveCurrentSpeed = 0;
  }

  const steerInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);

  // Steer (only when moving)
  if (Math.abs(driveCurrentSpeed) > 0.5) {
    playerCar.mesh.rotation.y += steerInput * 2.5 * dt * Math.sign(driveCurrentSpeed);
  }
  playerCar.mesh.rotation.z = THREE.MathUtils.lerp(playerCar.mesh.rotation.z, steerInput * 0.1, dt * 5);

  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), playerCar.mesh.rotation.y);
  pos.x += forward.x * driveCurrentSpeed * dt;
  pos.z += forward.z * driveCurrentSpeed * dt;

  // Building collision for ground driving — push car out of buildings
  const driveSphere = new THREE.Sphere(pos.clone(), 2.5);
  for (const box of city.buildingBoxes) {
    if (sphereIntersectsBox(driveSphere, box)) {
      const boxCenter = new THREE.Vector3();
      box.getCenter(boxCenter);
      boxCenter.y = pos.y;
      const pushDir = pos.clone().sub(boxCenter).normalize();
      pos.add(pushDir.multiplyScalar(1.5));
      driveCurrentSpeed *= 0.3; // Slow down on hit
      break;
    }
  }

  // Keep within city bounds (island boundary)
  const halfCity = (config.CITY_GRID_SIZE * config.CITY_CELL_SIZE) / 2;
  const boundary = halfCity * 1.1;
  pos.x = THREE.MathUtils.clamp(pos.x, -boundary, boundary);
  pos.z = THREE.MathUtils.clamp(pos.z, -boundary, boundary * 1.5);

  // Spin wheels
  playerCar.mesh.traverse(child => {
    if (child.name === 'wheel') {
      child.rotation.x += dt * Math.abs(driveCurrentSpeed) * 0.5;
    }
  });

  // Animate city life
  city.update(dt);

  // Check if near runway — show takeoff prompt
  const runwaySouth = runway.getTakeoffPosition();
  const distToRunway = pos.distanceTo(runwaySouth);
  const onRunway = runway.isOnRunway(pos);
  const driveHud = document.getElementById('drive-hud');

  if (onRunway || distToRunway < 25) {
    driveHud.innerHTML = '<div class="drive-hint takeoff-ready">Press T to take off!</div>';
    if (input.isDown('KeyT')) {
      // Transform back and take off!
      transformToFlyingCar();
      document.getElementById('drive-hud').classList.remove('active');
      startTakeoff();
    }
  } else {
    const distText = Math.round(distToRunway);
    driveHud.innerHTML = `<div class="drive-hint">Explore the city! Runway: ${distText}m</div>`;
  }

  // Collect coins while driving too
  coinSpawner.update(dt, pos);

  updateCamera(dt);
  skybox.update(camera.position);
  hud.update(playerCar);

  const pLight = scene.getObjectByName('playerLight');
  if (pLight) pLight.position.copy(pos);
}

// ---- State Transitions ----
function startPlaying() {
  startTakeoff();
}

function goToGarage() {
  state = 'GARAGE';
  hud.hide();

  saveData.coins = hud.coins;
  saveGame(saveData);

  const garageScreen = document.getElementById('garage-screen');
  garageScreen.classList.add('active');
  document.getElementById('garage-coins').textContent = `${saveData.coins} coins`;

  const fullBtn = document.getElementById('full-repair-btn');
  const quickBtn = document.getElementById('quick-repair-btn');

  fullBtn.disabled = saveData.coins < config.REPAIR_COST_FULL;
  quickBtn.disabled = saveData.coins < config.REPAIR_COST_QUICK;
}

function repairCar(type) {
  if (type === 'full' && saveData.coins >= config.REPAIR_COST_FULL) {
    saveData.coins -= config.REPAIR_COST_FULL;
    playerCar.fullRepair();
  } else if (type === 'quick' && saveData.coins >= config.REPAIR_COST_QUICK) {
    saveData.coins -= config.REPAIR_COST_QUICK;
    playerCar.repair(70);
  } else if (type === 'free') {
    playerCar.repair(config.FREE_REPAIR_HEALTH);
  }

  document.getElementById('garage-screen').classList.remove('active');

  saveGame(saveData);
  hud.setCoins(saveData.coins);

  // After repair, do a new takeoff
  startTakeoff();
}

// ---- Game Loop ----
function gameLoop() {
  requestAnimationFrame(gameLoop);

  const dt = Math.min(clock.getDelta(), 0.05);

  if (state === 'TAKEOFF') {
    updateTakeoff(dt);
  } else if (state === 'PLAYING') {
    playerCar.update(dt);
    aiCarManager.update(dt, playerCar.position);
    coinSpawner.update(dt, playerCar.position);
    city.update(dt);
    checkCollisions();
    updateCamera(dt);
    skybox.update(camera.position);
    hud.update(playerCar);

    // Move player light
    const pLight = scene.getObjectByName('playerLight');
    if (pLight) pLight.position.copy(playerCar.position);

    saveData.coins = hud.coins;

    // Check if player presses L to land — works from anywhere, checked reliably
    if (input.isDown('KeyL') || input.isDown('KeyP')) {
      takeoffSpeed = 12;
      playerCar.invulnerable = 30;
      startLanding();
    }

    // Update runway distance indicator on HUD
    hud.updateRunwayIndicator(runway.distanceTo(playerCar.position), runway.directionTo(playerCar.position), camera);
  } else if (state === 'LANDING') {
    updateLanding(dt);
  } else if (state === 'DRIVING') {
    updateDriving(dt);
  }

  renderer.render(scene, camera);
}

// ---- Events ----
eventBus.on('player-destroyed', () => {
  goToGarage();
});

eventBus.on('coin-collected', (data) => {
  sessionCoins += data.value;
});

// ---- Builder ----
function openBuilder() {
  state = 'BUILDER';
  document.getElementById('menu-screen').classList.add('hidden');
  document.getElementById('builder-screen').classList.add('active');

  new BuilderScene((carConfig) => {
    saveData.carConfig = carConfig;
    saveGame(saveData);
    applyCarConfig(carConfig);

    document.getElementById('builder-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.remove('hidden');
    state = 'MENU';
  });
}

function applyCarConfig(carConfig) {
  const oldPos = playerCar.mesh.position.clone();
  const oldRot = playerCar.mesh.rotation.clone();
  scene.remove(playerCar.mesh);

  playerCar.mesh = buildCarMesh(carConfig);
  playerCar.mesh.position.copy(oldPos);
  playerCar.mesh.rotation.copy(oldRot);
  scene.add(playerCar.mesh);

  const stats = getStatsFromConfig(carConfig);
  playerCar.speed = config.PLAYER_BASE_SPEED + stats.speedBonus;
}

// ---- Boot ----
async function init() {
  clock = new THREE.Clock();
  saveData = loadGame();
  initRenderer();
  initGameScene();

  // Preload 3D models (Ferrari car etc.)
  await preloadModels().catch(() => console.log('Some models failed to load, using procedural fallback'));

  // Apply saved car config if exists
  if (saveData.carConfig) {
    applyCarConfig(saveData.carConfig);
  }

  // Menu buttons
  document.getElementById('play-btn').addEventListener('click', startPlaying);
  document.getElementById('builder-btn').addEventListener('click', openBuilder);

  // Garage buttons
  document.getElementById('full-repair-btn').addEventListener('click', () => repairCar('full'));
  document.getElementById('quick-repair-btn').addEventListener('click', () => repairCar('quick'));
  document.getElementById('free-repair-btn').addEventListener('click', () => repairCar('free'));

  // Landing summary
  document.getElementById('summary-done-btn').addEventListener('click', finishLanding);

  // Start loop
  gameLoop();
}

init();
