import * as THREE from 'three';
import { input } from '../core/InputManager.js';
import { eventBus } from '../core/EventBus.js';
import config from '../config.js';
import { buildCarMesh } from './CarParts.js';

export class PlayerCar {
  constructor(scene) {
    this.scene = scene;
    this.health = config.HEALTH_MAX;
    this.speed = config.PLAYER_BASE_SPEED;
    this.boostTimer = 0;
    this.boostCooldown = 0;
    this.isBoosting = false;
    this.invulnerable = 0;
    this.isOutOfBounds = false;

    // Auto-tilt for narrow gaps
    this.autoTilt = 0;

    // Climb rate — UP/DOWN adjust this, it persists
    this.climbRate = 0;

    // Build the car mesh using futuristic builder
    this.mesh = buildCarMesh({
      bodyColor: 'red', wingStyle: 'medium', engineType: 'basic', decal: 'none',
    });
    this.mesh.position.set(0, 45, 0);
    scene.add(this.mesh);

    // Forward direction
    this.velocity = new THREE.Vector3(0, 0, -1);

    // Exhaust trail particles
    this.exhaustParticles = [];
    this.initExhaust();
  }

  initExhaust() {
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0x00b4ff,
      transparent: true,
      opacity: 0.6,
    });
    for (let i = 0; i < 12; i++) {
      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 + Math.random() * 0.08, 4, 4),
        trailMat.clone()
      );
      particle.visible = false;
      particle.userData = { life: 0, maxLife: 0.5 + Math.random() * 0.5, delay: i * 0.04 };
      this.scene.add(particle);
      this.exhaustParticles.push(particle);
    }
  }

  update(dt) {
    const turnInput = (input.left ? 1 : 0) - (input.right ? 1 : 0);

    // UP/DOWN adjust climb rate incrementally — no need to hold
    if (input.up) this.climbRate = Math.min(this.climbRate + 8 * dt, 10);
    if (input.down) this.climbRate = Math.max(this.climbRate - 8 * dt, -10);
    // Gently return to level flight when no input
    if (!input.up && !input.down) {
      this.climbRate *= (1 - 2 * dt);
      if (Math.abs(this.climbRate) < 0.2) this.climbRate = 0;
    }

    // Boost
    if (this.boostCooldown > 0) this.boostCooldown -= dt;
    if (input.boost && this.boostCooldown <= 0 && !this.isBoosting) {
      this.isBoosting = true;
      this.boostTimer = config.BOOST_DURATION;
    }
    if (this.isBoosting) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) {
        this.isBoosting = false;
        this.boostCooldown = config.BOOST_COOLDOWN;
      }
    }

    const currentSpeed = this.speed * (this.isBoosting ? config.BOOST_MULTIPLIER : 1);

    // Yaw (turn left/right)
    this.mesh.rotation.y += turnInput * config.PLAYER_TURN_SPEED * dt;

    // Pitch visual — show nose angle based on climb rate
    const targetPitchAngle = this.climbRate * 0.04;
    this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, targetPitchAngle, dt * 3);

    // Banking — combine player turn with auto-tilt for narrow gaps
    const playerRoll = turnInput * 0.5;
    const combinedRoll = Math.abs(this.autoTilt) > Math.abs(playerRoll) ? this.autoTilt : playerRoll;
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, combinedRoll, dt * 5);

    // Calculate forward direction from yaw
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mesh.rotation.y);

    // Always move forward at current speed (plane always flies)
    this.mesh.position.x += forward.x * currentSpeed * dt;
    this.mesh.position.z += forward.z * currentSpeed * dt;

    // Vertical movement based on climb rate
    this.mesh.position.y += this.climbRate * dt;

    // Clamp altitude
    this.mesh.position.y = THREE.MathUtils.clamp(
      this.mesh.position.y,
      config.MIN_ALTITUDE,
      config.MAX_ALTITUDE
    );

    // --- Boundary: gentle push-back instead of teleport ---
    const halfCity = (config.CITY_GRID_SIZE * config.CITY_CELL_SIZE) / 2;
    const softBoundary = halfCity * 1.1;
    const hardBoundary = halfCity * 1.4;
    const pos = this.mesh.position;

    // Check if out of bounds
    const distFromCenter = Math.max(Math.abs(pos.x), Math.abs(pos.z));
    this.isOutOfBounds = distFromCenter > softBoundary;

    if (distFromCenter > softBoundary) {
      // Gentle force pushing back toward center
      const pushStrength = THREE.MathUtils.clamp(
        (distFromCenter - softBoundary) / (hardBoundary - softBoundary),
        0, 1
      ) * 20;
      const toCenter = new THREE.Vector3(-pos.x, 0, -pos.z).normalize();
      pos.x += toCenter.x * pushStrength * dt;
      pos.z += toCenter.z * pushStrength * dt;
    }

    // Hard clamp so they can never fly infinitely far
    pos.x = THREE.MathUtils.clamp(pos.x, -hardBoundary, hardBoundary);
    pos.z = THREE.MathUtils.clamp(pos.z, -hardBoundary, hardBoundary);

    // Engine glow pulse
    const glow = this.mesh.getObjectByName('engineGlow');
    if (glow) {
      const scale = this.isBoosting ? 1.8 + Math.sin(Date.now() * 0.015) * 0.4 : 1.0;
      glow.scale.setScalar(scale);
    }

    // Neon underglow pulse
    const neon = this.mesh.getObjectByName('neonStrip');
    if (neon) {
      neon.material.opacity = 0.5 + Math.sin(Date.now() * 0.003) * 0.3;
    }

    // Nacelle glows pulse
    for (const side of [-1, 1]) {
      const nacGlow = this.mesh.getObjectByName(`nacelle_glow_${side}`);
      if (nacGlow) {
        const s = this.isBoosting ? 1.5 : 0.8 + Math.sin(Date.now() * 0.008 + side) * 0.2;
        nacGlow.scale.setScalar(s);
      }
    }

    // Exhaust trail
    this.updateExhaust(dt, forward);

    // Invulnerability timer
    if (this.invulnerable > 0) {
      this.invulnerable -= dt;
      this.mesh.visible = Math.sin(Date.now() * 0.02) > 0;
    } else {
      this.mesh.visible = true;
    }

    this.velocity.copy(forward);
  }

  // Called from main.js to detect nearby buildings and auto-tilt wings
  updateAutoTilt(buildingBoxes) {
    const pos = this.mesh.position;
    const forward = this.velocity;

    // Check for buildings on left and right sides
    const right = new THREE.Vector3(forward.z, 0, -forward.x); // perpendicular
    let leftDist = Infinity;
    let rightDist = Infinity;

    for (const box of buildingBoxes) {
      // Only check nearby buildings at similar altitude
      const center = new THREE.Vector3();
      box.getCenter(center);
      const horiz = new THREE.Vector2(pos.x - center.x, pos.z - center.z).length();

      if (horiz > 15) continue; // Too far
      if (pos.y > box.max.y || pos.y < box.min.y) continue; // Above or below

      // Which side is the building on?
      const toBuilding = new THREE.Vector3().subVectors(center, pos);
      toBuilding.y = 0;
      const dot = toBuilding.dot(right);

      const closestPoint = new THREE.Vector3();
      box.clampPoint(pos, closestPoint);
      const dist = pos.distanceTo(closestPoint);

      if (dot > 0 && dist < rightDist) rightDist = dist;
      if (dot < 0 && dist < leftDist) leftDist = dist;
    }

    // If buildings on both sides and close, tilt to fit through
    const tiltThreshold = 6;
    if (leftDist < tiltThreshold && rightDist < tiltThreshold) {
      // Narrow gap — tilt wings (roll 90 degrees to squeeze through!)
      const tiltAmount = 1.0 - Math.min(leftDist, rightDist) / tiltThreshold;
      this.autoTilt = tiltAmount * 1.2; // Roll toward the wider side
      if (leftDist < rightDist) {
        this.autoTilt = tiltAmount * 1.2; // Tilt right (roll clockwise)
      } else {
        this.autoTilt = -tiltAmount * 1.2; // Tilt left
      }
    } else if (leftDist < tiltThreshold * 0.6) {
      // Building close on left — tilt right
      const tiltAmount = 1.0 - leftDist / (tiltThreshold * 0.6);
      this.autoTilt = tiltAmount * 0.8;
    } else if (rightDist < tiltThreshold * 0.6) {
      // Building close on right — tilt left
      const tiltAmount = 1.0 - rightDist / (tiltThreshold * 0.6);
      this.autoTilt = -tiltAmount * 0.8;
    } else {
      this.autoTilt = 0;
    }
  }

  updateExhaust(dt, forward) {
    const enginePos = this.mesh.position.clone().add(
      forward.clone().multiplyScalar(2.5)
    );

    for (const p of this.exhaustParticles) {
      p.userData.life += dt;
      if (p.userData.life > p.userData.maxLife) {
        p.position.copy(enginePos);
        p.position.x += (Math.random() - 0.5) * 0.3;
        p.position.y += (Math.random() - 0.5) * 0.3;
        p.userData.life = 0;
        p.visible = true;
        p.material.opacity = 0.7;
        p.scale.setScalar(1);
      } else {
        const t = p.userData.life / p.userData.maxLife;
        p.position.add(forward.clone().multiplyScalar(dt * 3));
        p.position.y -= dt * 0.5;
        p.material.opacity = 0.7 * (1 - t);
        p.scale.setScalar(1 + t * 2);
      }
    }
  }

  takeDamage(amount) {
    if (this.invulnerable > 0) return;
    this.health = Math.max(0, this.health - amount);
    this.invulnerable = 1.5;
    eventBus.emit('player-damaged', { health: this.health });

    if (this.health <= 0) {
      eventBus.emit('player-destroyed');
    }
  }

  repair(amount) {
    this.health = Math.min(config.HEALTH_MAX, this.health + amount);
  }

  fullRepair() {
    this.health = config.HEALTH_MAX;
  }

  get position() {
    return this.mesh.position;
  }

  get boundingSphere() {
    return new THREE.Sphere(this.mesh.position.clone(), 2);
  }
}
