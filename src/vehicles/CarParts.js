import * as THREE from 'three';

export const BODY_COLORS = [
  { id: 'red', label: 'Racing Red', color: 0xff2244, neon: 0xff0044 },
  { id: 'blue', label: 'Ocean Blue', color: 0x2266ff, neon: 0x0088ff },
  { id: 'green', label: 'Jungle Green', color: 0x22dd66, neon: 0x00ff66 },
  { id: 'purple', label: 'Royal Purple', color: 0x8844ff, neon: 0xaa44ff },
  { id: 'orange', label: 'Sunset Orange', color: 0xff6622, neon: 0xff8800 },
  { id: 'pink', label: 'Bubblegum Pink', color: 0xff44aa, neon: 0xff66cc },
  { id: 'yellow', label: 'Lightning Yellow', color: 0xffcc00, neon: 0xffdd00 },
  { id: 'cyan', label: 'Sky Cyan', color: 0x00ccdd, neon: 0x00ffff },
];

export const WING_STYLES = [
  { id: 'small', label: 'Zippy Wings', speedBonus: 0, turnBonus: 0.5, wingSpan: 2.2, wingChord: 0.9, sweep: 0.3 },
  { id: 'medium', label: 'Cruiser Wings', speedBonus: 2, turnBonus: 0, wingSpan: 3.2, wingChord: 1.3, sweep: 0.5 },
  { id: 'large', label: 'Mega Wings', speedBonus: 4, turnBonus: -0.3, wingSpan: 4.2, wingChord: 1.6, sweep: 0.7 },
];

export const ENGINE_TYPES = [
  { id: 'basic', label: 'Starter Engine', speedBonus: 0, glowColor: 0x00ccff, glowSize: 0.35, trailCount: 1 },
  { id: 'turbo', label: 'Turbo Engine', speedBonus: 3, glowColor: 0x00ff88, glowSize: 0.45, trailCount: 2 },
  { id: 'rocket', label: 'Rocket Engine', speedBonus: 6, glowColor: 0xff6600, glowSize: 0.55, trailCount: 3 },
];

export const DECALS = [
  { id: 'none', label: 'No Decal' },
  { id: 'star', label: 'Star', symbol: '\u2605' },
  { id: 'lightning', label: 'Lightning', symbol: '\u26A1' },
  { id: 'heart', label: 'Heart', symbol: '\u2665' },
  { id: 'flame', label: 'Flame', symbol: '\uD83D\uDD25' },
];

function createWingShape(span, chord, sweep) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(span, -sweep);
  shape.lineTo(span, -sweep - chord * 0.3);
  shape.lineTo(0, -chord);
  shape.closePath();
  return shape;
}

export function buildCarMesh(carConfig) {
  const group = new THREE.Group();

  const bodyColor = BODY_COLORS.find(c => c.id === carConfig.bodyColor) || BODY_COLORS[0];
  const wingStyle = WING_STYLES.find(w => w.id === carConfig.wingStyle) || WING_STYLES[1];
  const engineType = ENGINE_TYPES.find(e => e.id === carConfig.engineType) || ENGINE_TYPES[0];

  // Bright, kid-friendly body material — emissive so it glows from all angles
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor.color,
    emissive: bodyColor.color,
    emissiveIntensity: 0.35,
    metalness: 0.6,
    roughness: 0.25,
  });

  // --- Fuselage ---
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.5, 12), bodyMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.1, -2.2);
  group.add(nose);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.75, 3, 12), bodyMat);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0.1, 0);
  group.add(body);

  const rear = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.2, 12), bodyMat);
  rear.rotation.x = -Math.PI / 2;
  rear.position.set(0, 0.1, 1.8);
  group.add(rear);

  // --- Cockpit (bright glass dome) ---
  const cockpit = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0xaaddff,
      emissive: 0x4488cc,
      emissiveIntensity: 0.3,
      transparent: true,
      opacity: 0.65,
      metalness: 0.9,
      roughness: 0.05,
    })
  );
  cockpit.position.set(0, 0.5, -0.8);
  group.add(cockpit);

  // Cockpit frame ring
  const frame = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.05, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.2 })
  );
  frame.position.set(0, 0.5, -0.8);
  frame.rotation.x = Math.PI / 2;
  group.add(frame);

  // --- Wings (bright colored, not dark gray) ---
  const { wingSpan, wingChord, sweep } = wingStyle;
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xddddee,
    emissive: bodyColor.color,
    emissiveIntensity: 0.15,
    metalness: 0.5,
    roughness: 0.3,
    side: THREE.DoubleSide,
  });

  const wingShape = createWingShape(wingSpan, wingChord, sweep);
  const extrudeSettings = { depth: 0.08, bevelEnabled: false };

  const leftWing = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, extrudeSettings), wingMat);
  leftWing.position.set(-0.5, 0.1, -0.3);
  leftWing.rotation.set(0, 0, -0.05);
  leftWing.scale.x = -1;
  group.add(leftWing);

  const rightWing = new THREE.Mesh(new THREE.ExtrudeGeometry(wingShape, extrudeSettings), wingMat);
  rightWing.position.set(0.5, 0.1, -0.3);
  rightWing.rotation.set(0, 0, 0.05);
  group.add(rightWing);

  // Wing tip lights (bigger, brighter)
  const tipGlowMat = new THREE.MeshBasicMaterial({ color: bodyColor.neon });
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), tipGlowMat);
    tip.position.set(side * (wingSpan + 0.5), 0.1, -0.3 - sweep);
    group.add(tip);
  }

  // --- Neon underglow (bright, wide) ---
  const neonMat = new THREE.MeshBasicMaterial({ color: bodyColor.neon, transparent: true, opacity: 0.9 });
  const neonStrip = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 4), neonMat);
  neonStrip.position.set(0, -0.35, 0);
  neonStrip.name = 'neonStrip';
  group.add(neonStrip);

  // Side neon racing stripes
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.15, 3.5),
      new THREE.MeshBasicMaterial({ color: bodyColor.neon, transparent: true, opacity: 0.8 })
    );
    stripe.position.set(side * 0.7, 0.15, 0);
    group.add(stripe);
  }

  // --- Engine nacelles ---
  const nacelleMat = new THREE.MeshStandardMaterial({ color: 0x666677, metalness: 0.7, roughness: 0.3 });
  for (const side of [-1, 1]) {
    const nacelleX = side * (wingSpan * 0.4 + 0.5);

    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.9, 10), nacelleMat);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(nacelleX, 0, 0.3);
    group.add(nacelle);

    // Intake ring (glowing)
    const intake = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.04, 8, 16),
      new THREE.MeshBasicMaterial({ color: engineType.glowColor })
    );
    intake.position.set(nacelleX, 0, -0.1);
    group.add(intake);

    // Exhaust glow
    const exhaust = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 8, 8),
      new THREE.MeshBasicMaterial({ color: engineType.glowColor })
    );
    exhaust.position.set(nacelleX, 0, 0.8);
    exhaust.name = `nacelle_glow_${side}`;
    group.add(exhaust);
  }

  // --- Main engine (rear, bright) ---
  const engineGlow = new THREE.Mesh(
    new THREE.SphereGeometry(engineType.glowSize, 12, 12),
    new THREE.MeshBasicMaterial({ color: engineType.glowColor, transparent: true, opacity: 0.95 })
  );
  engineGlow.position.set(0, 0.1, 2.4);
  engineGlow.name = 'engineGlow';
  group.add(engineGlow);

  // Engine outer ring
  const engineRing = new THREE.Mesh(
    new THREE.TorusGeometry(engineType.glowSize + 0.12, 0.06, 10, 20),
    new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.9, roughness: 0.1 })
  );
  engineRing.position.set(0, 0.1, 2.4);
  group.add(engineRing);

  // --- Dual vertical stabilizers ---
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.8, 0.7),
      bodyMat
    );
    fin.position.set(side * 0.35, 0.6, 1.6);
    fin.rotation.z = side * -0.2;
    group.add(fin);
  }

  return group;
}

export function getDefaultConfig() {
  return { bodyColor: 'red', wingStyle: 'medium', engineType: 'basic', decal: 'none' };
}

export function getStatsFromConfig(carConfig) {
  const wing = WING_STYLES.find(w => w.id === carConfig.wingStyle) || WING_STYLES[1];
  const engine = ENGINE_TYPES.find(e => e.id === carConfig.engineType) || ENGINE_TYPES[0];
  return { speedBonus: wing.speedBonus + engine.speedBonus, turnBonus: wing.turnBonus };
}
