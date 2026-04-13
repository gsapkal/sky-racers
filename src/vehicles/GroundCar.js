import * as THREE from 'three';
import { BODY_COLORS } from './CarParts.js';
import { getModelClone } from '../utils/ModelLoader.js';

// Try to use a real 3D model, fall back to procedural
export function buildGroundCarMesh(carConfig) {
  const bodyColor = BODY_COLORS.find(c => c.id === carConfig.bodyColor) || BODY_COLORS[0];

  // Try Ferrari model first
  const ferrariModel = getModelClone('/models/ferrari.glb', 4);
  if (ferrariModel) {
    // Tint the model with the player's chosen color
    ferrariModel.traverse(child => {
      if (child.isMesh && child.material) {
        const mat = child.material.clone();
        // Tint body panels (not glass/chrome)
        if (mat.color && mat.metalness < 0.9 && mat.opacity > 0.8) {
          mat.color.set(bodyColor.color);
          mat.emissive = new THREE.Color(bodyColor.color);
          mat.emissiveIntensity = 0.15;
        }
        child.material = mat;
      }
    });
    return ferrariModel;
  }

  // Fallback to procedural car
  return buildProceduralGroundCar(carConfig);
}

function buildProceduralGroundCar(carConfig) {
  const group = new THREE.Group();
  const bodyColor = BODY_COLORS.find(c => c.id === carConfig.bodyColor) || BODY_COLORS[0];

  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor.color,
    emissive: bodyColor.color,
    emissiveIntensity: 0.3,
    metalness: 0.6,
    roughness: 0.25,
  });

  // --- Car body (sedan shape) ---
  // Lower body
  const lowerBody = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.6, 4),
    bodyMat
  );
  lowerBody.position.set(0, 0.5, 0);
  group.add(lowerBody);

  // Upper cabin
  const cabinMat = new THREE.MeshStandardMaterial({
    color: bodyColor.color,
    emissive: bodyColor.color,
    emissiveIntensity: 0.2,
    metalness: 0.5,
    roughness: 0.3,
  });
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.6, 2),
    cabinMat
  );
  cabin.position.set(0, 1.1, -0.2);
  group.add(cabin);

  // --- Windshield (front) ---
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xaaddff,
    emissive: 0x4488cc,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.6,
    metalness: 0.9,
    roughness: 0.05,
  });
  const windshield = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.55),
    glassMat
  );
  windshield.position.set(0, 1.15, -1.2);
  windshield.rotation.x = -0.3;
  group.add(windshield);

  // Rear window
  const rearWindow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.5),
    glassMat
  );
  rearWindow.position.set(0, 1.15, 0.8);
  rearWindow.rotation.x = 0.3;
  rearWindow.rotation.y = Math.PI;
  group.add(rearWindow);

  // Side windows
  for (const side of [-1, 1]) {
    const sideWindow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.45),
      glassMat
    );
    sideWindow.position.set(side * 0.91, 1.15, -0.2);
    sideWindow.rotation.y = side * Math.PI / 2;
    group.add(sideWindow);
  }

  // --- Wheels (4 wheels with rubber tires) ---
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.1 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
  const hubGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.26, 8);

  const wheelPositions = [
    [-1.1, 0.35, -1.2],  // front-left
    [1.1, 0.35, -1.2],   // front-right
    [-1.1, 0.35, 1.2],   // rear-left
    [1.1, 0.35, 1.2],    // rear-right
  ];

  for (const [wx, wy, wz] of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    wheel.name = 'wheel';
    group.add(wheel);

    // Hub cap
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    hub.position.set(wx, wy, wz);
    group.add(hub);
  }

  // --- Headlights ---
  const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffcc });
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      headlightMat
    );
    light.position.set(side * 0.7, 0.6, -2);
    group.add(light);
  }

  // --- Taillights ---
  const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.15, 0.05),
      taillightMat
    );
    light.position.set(side * 0.8, 0.6, 2);
    group.add(light);
  }

  // --- Neon underglow (matches the flying car) ---
  const neonMat = new THREE.MeshBasicMaterial({
    color: bodyColor.neon,
    transparent: true,
    opacity: 0.7,
  });
  const neonStrip = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.03, 3.5),
    neonMat
  );
  neonStrip.position.set(0, 0.15, 0);
  group.add(neonStrip);

  // --- Front bumper ---
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.3 });
  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.25, 0.2),
    bumperMat
  );
  frontBumper.position.set(0, 0.3, -2.05);
  group.add(frontBumper);

  // Rear bumper
  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(2.3, 0.25, 0.2),
    bumperMat
  );
  rearBumper.position.set(0, 0.3, 2.05);
  group.add(rearBumper);

  // --- Roof spoiler (sporty touch kids love) ---
  const spoiler = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.08, 0.4),
    bodyMat
  );
  spoiler.position.set(0, 1.45, 0.7);
  group.add(spoiler);
  // Spoiler supports
  for (const side of [-1, 1]) {
    const support = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.2, 0.08),
      bumperMat
    );
    support.position.set(side * 0.7, 1.35, 0.7);
    group.add(support);
  }

  return group;
}
