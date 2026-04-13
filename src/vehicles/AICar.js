import * as THREE from 'three';
import config from '../config.js';

const AI_COLORS = [
  { body: 0x6c5ce7, neon: 0x9933ff, name: 'Purple Phantom' },
  { body: 0x00b894, neon: 0x00ff66, name: 'Green Machine' },
  { body: 0xfdcb6e, neon: 0xffcc00, name: 'Golden Streak' },
  { body: 0xe17055, neon: 0xff6600, name: 'Orange Thunder' },
  { body: 0x00cec9, neon: 0x00ffff, name: 'Teal Tornado' },
];

const PERSONALITIES = ['aggressive', 'cautious', 'silly', 'show-off'];

export class AICar {
  constructor(scene, index) {
    this.scene = scene;
    this.index = index;
    const colorData = AI_COLORS[index % AI_COLORS.length];
    this.name = colorData.name;
    this.personality = PERSONALITIES[index % PERSONALITIES.length];
    this.color = colorData.body;

    this.mesh = this.createMesh(colorData);
    const halfCity = (config.CITY_GRID_SIZE * config.CITY_CELL_SIZE) / 2;
    this.mesh.position.set(
      (Math.random() - 0.5) * halfCity,
      15 + Math.random() * 30,
      (Math.random() - 0.5) * halfCity
    );
    scene.add(this.mesh);

    this.speed = config.AI_SPEED_MIN + Math.random() * (config.AI_SPEED_MAX - config.AI_SPEED_MIN);
    this.targetDirection = new THREE.Vector3(
      Math.random() - 0.5,
      0,
      Math.random() - 0.5
    ).normalize();
    this.currentDirection = this.targetDirection.clone();
    this.targetAltitude = this.mesh.position.y;

    this.taunt = '';
    this.tauntTimer = 0;

    // For scripted fallback behavior
    this.scriptedTimer = 0;
    this.scriptedAction = 'wander';
  }

  createMesh(colorData) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: colorData.body,
      emissive: colorData.body,
      emissiveIntensity: 0.35,
      metalness: 0.6,
      roughness: 0.25,
    });

    // Fuselage - tapered nose + body + rear
    const nose = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.2, 8),
      bodyMat
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.1, -1.8);
    group.add(nose);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.6, 2.5, 8),
      bodyMat
    );
    body.rotation.x = Math.PI / 2;
    body.position.set(0, 0.1, 0);
    group.add(body);

    const rear = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, 1, 8),
      bodyMat
    );
    rear.rotation.x = -Math.PI / 2;
    rear.position.set(0, 0.1, 1.5);
    group.add(rear);

    // Cockpit dome
    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color: 0xaaddff, emissive: 0x4488cc, emissiveIntensity: 0.3,
        transparent: true, opacity: 0.6, metalness: 0.9, roughness: 0.05,
      })
    );
    cockpit.position.set(0, 0.4, -0.6);
    group.add(cockpit);

    // Swept wings
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0xddddee, emissive: colorData.body, emissiveIntensity: 0.15,
      metalness: 0.5, roughness: 0.3,
    });
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 0.06, 1),
        wingMat
      );
      wing.position.set(side * 1.8, 0.1, 0.2);
      wing.rotation.y = side * 0.15;
      wing.rotation.z = side * 0.05;
      group.add(wing);

      // Wing tip neon
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshBasicMaterial({ color: colorData.neon })
      );
      tip.position.set(side * 3, 0.1, 0.2);
      group.add(tip);
    }

    // Neon underglow
    const neonStrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.02, 2.5),
      new THREE.MeshBasicMaterial({ color: colorData.neon, transparent: true, opacity: 0.7 })
    );
    neonStrip.position.set(0, -0.2, 0);
    group.add(neonStrip);

    // Engine glow
    const trail = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 8, 8),
      new THREE.MeshBasicMaterial({ color: colorData.neon, transparent: true, opacity: 0.8 })
    );
    trail.position.set(0, 0.1, 2);
    trail.name = 'trail';
    group.add(trail);

    // Engine ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.35, 0.04, 6, 12),
      new THREE.MeshPhongMaterial({ color: 0x333333 })
    );
    ring.position.set(0, 0.1, 2);
    group.add(ring);

    // Dual stabilizers
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.55, 0.5),
        bodyMat
      );
      fin.position.set(side * 0.25, 0.45, 1.3);
      fin.rotation.z = side * -0.2;
      group.add(fin);
    }

    return group;
  }

  updateScriptedBehavior(dt, playerPosition) {
    this.scriptedTimer -= dt;
    if (this.scriptedTimer <= 0) {
      this.scriptedTimer = 2 + Math.random() * 3;
      const actions = ['wander', 'circle', 'toward_player', 'away'];
      this.scriptedAction = actions[Math.floor(Math.random() * actions.length)];
    }

    const halfCity = (config.CITY_GRID_SIZE * config.CITY_CELL_SIZE) / 2;
    const pos = this.mesh.position;

    switch (this.scriptedAction) {
      case 'wander':
        if (this.scriptedTimer > 1.5) {
          this.targetDirection.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
          this.targetAltitude = 15 + Math.random() * 35;
        }
        break;
      case 'circle':
        // Circle around current position
        this.targetDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), dt * 1.5);
        break;
      case 'toward_player':
        if (playerPosition) {
          const toPlayer = new THREE.Vector3().subVectors(playerPosition, pos);
          toPlayer.y = 0;
          if (toPlayer.length() > 1) {
            this.targetDirection.copy(toPlayer.normalize());
            this.targetAltitude = playerPosition.y + (Math.random() - 0.5) * 10;
          }
        }
        break;
      case 'away':
        if (playerPosition) {
          const awayFromPlayer = new THREE.Vector3().subVectors(pos, playerPosition);
          awayFromPlayer.y = 0;
          if (awayFromPlayer.length() > 0.1) {
            this.targetDirection.copy(awayFromPlayer.normalize());
          }
        }
        break;
    }

    // Keep within city bounds
    if (Math.abs(pos.x) > halfCity * 0.8 || Math.abs(pos.z) > halfCity * 0.8) {
      this.targetDirection.set(-pos.x, 0, -pos.z).normalize();
    }
  }

  applyLLMDecision(decision) {
    if (decision.direction) {
      this.targetDirection.set(decision.direction[0], 0, decision.direction[2]).normalize();
      this.targetAltitude = this.mesh.position.y + (decision.direction[1] || 0) * 10;
    }
    if (decision.speed) {
      this.speed = THREE.MathUtils.clamp(
        decision.speed * config.AI_SPEED_MAX,
        config.AI_SPEED_MIN,
        config.AI_SPEED_MAX
      );
    }
    if (decision.taunt) {
      this.taunt = decision.taunt;
      this.tauntTimer = 3;
    }
  }

  update(dt) {
    // Smoothly interpolate direction
    this.currentDirection.lerp(this.targetDirection, dt * 2);
    this.currentDirection.normalize();

    // Move
    this.mesh.position.x += this.currentDirection.x * this.speed * dt;
    this.mesh.position.z += this.currentDirection.z * this.speed * dt;

    // Altitude interpolation
    this.mesh.position.y = THREE.MathUtils.lerp(
      this.mesh.position.y,
      this.targetAltitude,
      dt * 1.5
    );
    this.mesh.position.y = THREE.MathUtils.clamp(
      this.mesh.position.y,
      config.MIN_ALTITUDE + 2,
      config.MAX_ALTITUDE - 5
    );

    // Face movement direction
    const angle = Math.atan2(this.currentDirection.x, this.currentDirection.z);
    this.mesh.rotation.y = THREE.MathUtils.lerp(this.mesh.rotation.y, angle + Math.PI, dt * 3);

    // Banking
    const cross = new THREE.Vector3().crossVectors(this.currentDirection, this.targetDirection);
    this.mesh.rotation.z = THREE.MathUtils.lerp(this.mesh.rotation.z, cross.y * 0.5, dt * 3);

    // Trail pulse
    const trail = this.mesh.getObjectByName('trail');
    if (trail) {
      trail.scale.setScalar(0.8 + Math.sin(Date.now() * 0.005) * 0.2);
    }

    // Taunt timer
    if (this.tauntTimer > 0) this.tauntTimer -= dt;
  }

  get position() {
    return this.mesh.position;
  }

  get boundingSphere() {
    return new THREE.Sphere(this.mesh.position.clone(), 2);
  }
}
