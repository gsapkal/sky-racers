import * as THREE from 'three';
import config from '../config.js';
import { loadModel } from '../utils/ModelLoader.js';

const BUILDING_PALETTES = [
  // Glass towers — brighter, more visible
  { color: 0x5577aa, emissive: 0x223355, glass: true, neon: 0x00ccff },
  { color: 0x446688, emissive: 0x224433, glass: true, neon: 0x00ffcc },
  { color: 0x6655aa, emissive: 0x332255, glass: true, neon: 0xcc66ff },
  // Solid modern — colorful, fun
  { color: 0x778899, emissive: 0x111122, glass: false, neon: 0xff6600 },
  { color: 0x668877, emissive: 0x112211, glass: false, neon: 0x00ff88 },
  { color: 0x886677, emissive: 0x221122, glass: false, neon: 0xff3388 },
  { color: 0x7799aa, emissive: 0x112233, glass: false, neon: 0xffcc00 },
  { color: 0x8888aa, emissive: 0x111133, glass: false, neon: 0x00ccff },
];

// Generate a window texture procedurally
function createWindowTexture(width, height, neonColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Dark base
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, 64, 128);

  // Window grid
  const cols = 4;
  const rows = 10;
  const winW = 10;
  const winH = 8;
  const gapX = (64 - cols * winW) / (cols + 1);
  const gapY = (128 - rows * winH) / (rows + 1);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = Math.random() > 0.35;
      if (lit) {
        const warm = Math.random() > 0.3;
        ctx.fillStyle = warm ? '#ffeebb' : '#aaddff';
        ctx.globalAlpha = 0.6 + Math.random() * 0.4;
      } else {
        ctx.fillStyle = '#222233';
        ctx.globalAlpha = 0.8;
      }
      const x = gapX + c * (winW + gapX);
      const y = gapY + r * (winH + gapY);
      ctx.fillRect(x, y, winW, winH);
    }
  }
  ctx.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.ceil(width / 8), Math.ceil(height / 15));
  return texture;
}

export class City {
  constructor(scene) {
    this.scene = scene;
    this.buildings = [];
    this.buildingBoxes = [];
    this.generate();
  }

  generate() {
    const { CITY_GRID_SIZE, CITY_CELL_SIZE, BUILDING_MIN_HEIGHT, BUILDING_MAX_HEIGHT } = config;
    const halfCity = (CITY_GRID_SIZE * CITY_CELL_SIZE) / 2;

    // --- City island ground (irregular natural coastline) ---
    const islandRadius = halfCity * 1.2;
    const islandShape = new THREE.Shape();
    const numPoints = 24;
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      // Irregular coastline: vary radius with multiple sine waves
      const r = islandRadius * (0.85 +
        0.12 * Math.sin(angle * 3 + 1.5) +
        0.08 * Math.sin(angle * 5 + 0.7) +
        0.06 * Math.sin(angle * 7 + 3.2)
      );
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      if (i === 0) islandShape.moveTo(x, z);
      else islandShape.lineTo(x, z);
    }

    const islandGeo = new THREE.ShapeGeometry(islandShape);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x3a3a4e, roughness: 0.8, metalness: 0.1 });
    groundMat.polygonOffset = true;
    groundMat.polygonOffsetFactor = 1;
    groundMat.polygonOffsetUnits = 1;
    const ground = new THREE.Mesh(islandGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.1;
    this.scene.add(ground);

    // Green coastal ring (grass/parks around city edge)
    const coastShape = new THREE.Shape();
    const coastInner = new THREE.Path();
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const rOuter = islandRadius * (0.85 +
        0.12 * Math.sin(angle * 3 + 1.5) +
        0.08 * Math.sin(angle * 5 + 0.7) +
        0.06 * Math.sin(angle * 7 + 3.2)
      ) * 1.08;
      const rInner = islandRadius * (0.85 +
        0.12 * Math.sin(angle * 3 + 1.5) +
        0.08 * Math.sin(angle * 5 + 0.7) +
        0.06 * Math.sin(angle * 7 + 3.2)
      ) * 0.95;
      const xO = Math.cos(angle) * rOuter;
      const zO = Math.sin(angle) * rOuter;
      const xI = Math.cos(angle) * rInner;
      const zI = Math.sin(angle) * rInner;
      if (i === 0) {
        coastShape.moveTo(xO, zO);
        coastInner.moveTo(xI, zI);
      } else {
        coastShape.lineTo(xO, zO);
        coastInner.lineTo(xI, zI);
      }
    }
    coastShape.holes.push(coastInner);
    const coastGeo = new THREE.ShapeGeometry(coastShape);
    const coastMat = new THREE.MeshStandardMaterial({ color: 0x44aa44, roughness: 0.9 });
    coastMat.polygonOffset = true;
    coastMat.polygonOffsetFactor = -1;
    coastMat.polygonOffsetUnits = -1;
    const coast = new THREE.Mesh(coastGeo, coastMat);
    coast.rotation.x = -Math.PI / 2;
    coast.position.y = 0.08;
    this.scene.add(coast);

    // Beach ring (sand between grass and ocean)
    const beachShape = new THREE.Shape();
    const beachInner = new THREE.Path();
    for (let i = 0; i <= numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const rBase = islandRadius * (0.85 +
        0.12 * Math.sin(angle * 3 + 1.5) +
        0.08 * Math.sin(angle * 5 + 0.7) +
        0.06 * Math.sin(angle * 7 + 3.2)
      );
      const xO = Math.cos(angle) * rBase * 1.12;
      const zO = Math.sin(angle) * rBase * 1.12;
      const xI = Math.cos(angle) * rBase * 1.06;
      const zI = Math.sin(angle) * rBase * 1.06;
      if (i === 0) {
        beachShape.moveTo(xO, zO);
        beachInner.moveTo(xI, zI);
      } else {
        beachShape.lineTo(xO, zO);
        beachInner.lineTo(xI, zI);
      }
    }
    beachShape.holes.push(beachInner);
    const beachGeo = new THREE.ShapeGeometry(beachShape);
    const beachMat = new THREE.MeshStandardMaterial({ color: 0xddcc88, roughness: 0.95 });
    const beach = new THREE.Mesh(beachGeo, beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.y = 0.05;
    this.scene.add(beach);

    // --- Ocean surrounding the city ---
    const oceanGeo = new THREE.PlaneGeometry(800, 800);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1199cc,
      emissive: 0x0066aa,
      emissiveIntensity: 0.2,
      metalness: 0.3,
      roughness: 0.4,
      transparent: true,
      opacity: 0.85,
    });
    const ocean = new THREE.Mesh(oceanGeo, oceanMat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.5;
    this.scene.add(ocean);

    // --- Mountains in the distance (GLB model) ---
    this.loadMountains();

    // --- Pine trees along the coastline ---
    this.loadCoastalTrees(halfCity, islandRadius);

    // --- Small islands in the ocean ---
    const islandMat = new THREE.MeshStandardMaterial({ color: 0x66aa44, roughness: 0.8 });
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 180 + Math.random() * 60;
      const island = new THREE.Mesh(
        new THREE.CylinderGeometry(5 + Math.random() * 8, 8 + Math.random() * 10, 2, 8),
        islandMat
      );
      island.position.set(
        Math.cos(angle) * dist,
        0,
        Math.sin(angle) * dist
      );
      this.scene.add(island);

      // Palm tree on island
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 4, 6),
        new THREE.MeshStandardMaterial({ color: 0x8B6914 })
      );
      trunk.position.set(island.position.x, 3, island.position.z);
      trunk.rotation.z = 0.1;
      this.scene.add(trunk);

      const leaves = new THREE.Mesh(
        new THREE.SphereGeometry(2.5, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x33aa33 })
      );
      leaves.position.set(island.position.x, 5.5, island.position.z);
      leaves.scale.y = 0.5;
      this.scene.add(leaves);
    }

    // --- Road grid with lane markings ---
    for (let i = 0; i <= CITY_GRID_SIZE; i++) {
      const roadW = CITY_CELL_SIZE * 0.35;
      const roadMat = new THREE.MeshPhongMaterial({ color: 0x2d2d3d });

      // Horizontal road
      const hRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(CITY_GRID_SIZE * CITY_CELL_SIZE, roadW),
        roadMat
      );
      hRoad.rotation.x = -Math.PI / 2;
      hRoad.position.set(0, 0.12, -halfCity + i * CITY_CELL_SIZE);
      this.scene.add(hRoad);

      // Vertical road
      const vRoad = new THREE.Mesh(
        new THREE.PlaneGeometry(roadW, CITY_GRID_SIZE * CITY_CELL_SIZE),
        roadMat
      );
      vRoad.rotation.x = -Math.PI / 2;
      vRoad.position.set(-halfCity + i * CITY_CELL_SIZE, 0.12, 0);
      this.scene.add(vRoad);

      // Road center line (glowing dashes)
      if (i < CITY_GRID_SIZE) {
        const lineMat = new THREE.MeshBasicMaterial({ color: 0x444466 });
        for (let d = 0; d < CITY_GRID_SIZE * CITY_CELL_SIZE; d += 4) {
          const dash = new THREE.Mesh(
            new THREE.PlaneGeometry(0.15, 1.5),
            lineMat
          );
          dash.rotation.x = -Math.PI / 2;
          dash.position.set(-halfCity + i * CITY_CELL_SIZE, 0.13, -halfCity + d);
          this.scene.add(dash);
        }
      }
    }

    // --- Buildings ---
    for (let gx = 0; gx < CITY_GRID_SIZE; gx++) {
      for (let gz = 0; gz < CITY_GRID_SIZE; gz++) {
        if (Math.random() < 0.2) continue;

        const x = -halfCity + gx * CITY_CELL_SIZE + CITY_CELL_SIZE / 2;
        const z = -halfCity + gz * CITY_CELL_SIZE + CITY_CELL_SIZE / 2;

        const palette = BUILDING_PALETTES[Math.floor(Math.random() * BUILDING_PALETTES.length)];
        const height = BUILDING_MIN_HEIGHT + Math.random() * (BUILDING_MAX_HEIGHT - BUILDING_MIN_HEIGHT);
        const buildingType = Math.random();

        let building;

        if (buildingType < 0.15) {
          // Cylindrical tower
          building = this.createCylindricalTower(x, z, height, palette);
        } else if (buildingType < 0.3) {
          // Tapered/stepped tower
          building = this.createTaperedTower(x, z, height, palette);
        } else {
          // Standard block with windows
          building = this.createBlockBuilding(x, z, height, palette);
        }

        if (building) {
          this.scene.add(building);
          this.buildings.push(building);
          const box = new THREE.Box3().setFromObject(building);
          this.buildingBoxes.push(box);
        }
      }
    }

    // --- Rooftop details on some buildings ---
    this.addRooftopDetails();
    this.addStreetLife(halfCity);
  }

  createBlockBuilding(x, z, height, palette) {
    const width = config.CITY_CELL_SIZE * (0.35 + Math.random() * 0.2);
    const depth = config.CITY_CELL_SIZE * (0.35 + Math.random() * 0.2);

    const windowTex = createWindowTexture(width, height, palette.neon);
    const mat = new THREE.MeshStandardMaterial({
      color: palette.color,
      emissive: palette.emissive,
      emissiveIntensity: 0.3,
      map: windowTex,
      metalness: palette.glass ? 0.7 : 0.3,
      roughness: palette.glass ? 0.1 : 0.5,
      transparent: palette.glass,
      opacity: palette.glass ? 0.85 : 1,
    });

    const geo = new THREE.BoxGeometry(width, height, depth);
    const building = new THREE.Mesh(geo, mat);
    building.position.set(x, height / 2, z);

    // Neon accent strip at top
    const neonStrip = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.2, 0.15, depth + 0.2),
      new THREE.MeshBasicMaterial({ color: palette.neon, transparent: true, opacity: 0.7 })
    );
    neonStrip.position.set(x, height - 0.1, z);
    this.scene.add(neonStrip);

    // Neon vertical edge lines on tall buildings
    if (height > 20) {
      const edgeMat = new THREE.MeshBasicMaterial({ color: palette.neon, transparent: true, opacity: 0.4 });
      const corners = [
        [x - width / 2, z - depth / 2],
        [x + width / 2, z - depth / 2],
        [x - width / 2, z + depth / 2],
        [x + width / 2, z + depth / 2],
      ];
      for (const [cx, cz] of corners) {
        const edge = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, height, 0.08),
          edgeMat
        );
        edge.position.set(cx, height / 2, cz);
        this.scene.add(edge);
      }
    }

    return building;
  }

  createCylindricalTower(x, z, height, palette) {
    const radius = config.CITY_CELL_SIZE * (0.15 + Math.random() * 0.1);

    const mat = new THREE.MeshStandardMaterial({
      color: palette.color,
      emissive: palette.emissive,
      emissiveIntensity: 0.3,
      metalness: 0.6,
      roughness: 0.2,
      transparent: true,
      opacity: 0.9,
    });

    const geo = new THREE.CylinderGeometry(radius * 0.85, radius, height, 16);
    const building = new THREE.Mesh(geo, mat);
    building.position.set(x, height / 2, z);

    // Neon ring at top
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * 0.9, 0.08, 8, 24),
      new THREE.MeshBasicMaterial({ color: palette.neon })
    );
    ring.position.set(x, height, z);
    ring.rotation.x = Math.PI / 2;
    this.scene.add(ring);

    // Spiral neon strip
    if (height > 15) {
      const spiralMat = new THREE.MeshBasicMaterial({ color: palette.neon, transparent: true, opacity: 0.3 });
      const spiralTurns = Math.floor(height / 8);
      for (let i = 0; i < spiralTurns * 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const y = (i / (spiralTurns * 12)) * height;
        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.08, 4, 4),
          spiralMat
        );
        dot.position.set(
          x + Math.cos(angle) * radius * 0.95,
          y,
          z + Math.sin(angle) * radius * 0.95
        );
        this.scene.add(dot);
      }
    }

    return building;
  }

  createTaperedTower(x, z, height, palette) {
    const group = new THREE.Group();
    const baseWidth = config.CITY_CELL_SIZE * (0.35 + Math.random() * 0.15);
    const segments = 2 + Math.floor(Math.random() * 3);
    const segHeight = height / segments;

    const mat = new THREE.MeshStandardMaterial({
      color: palette.color,
      emissive: palette.emissive,
      emissiveIntensity: 0.3,
      metalness: 0.4,
      roughness: 0.4,
    });

    let currentY = 0;
    let currentWidth = baseWidth;

    for (let s = 0; s < segments; s++) {
      const nextWidth = currentWidth * (0.7 + Math.random() * 0.15);
      const geo = new THREE.BoxGeometry(currentWidth, segHeight, currentWidth);
      const seg = new THREE.Mesh(geo, mat);
      seg.position.set(x, currentY + segHeight / 2, z);
      group.add(seg);

      // Ledge between segments
      if (s < segments - 1) {
        const ledge = new THREE.Mesh(
          new THREE.BoxGeometry(currentWidth + 0.5, 0.2, currentWidth + 0.5),
          new THREE.MeshPhongMaterial({ color: 0x444444 })
        );
        ledge.position.set(x, currentY + segHeight, z);
        group.add(ledge);

        // Neon strip on ledge
        const neon = new THREE.Mesh(
          new THREE.BoxGeometry(currentWidth + 0.6, 0.1, currentWidth + 0.6),
          new THREE.MeshBasicMaterial({ color: palette.neon, transparent: true, opacity: 0.5 })
        );
        neon.position.set(x, currentY + segHeight + 0.1, z);
        group.add(neon);
      }

      currentY += segHeight;
      currentWidth = nextWidth;
    }

    this.scene.add(group);
    return group;
  }

  async loadCoastalTrees(halfCity, islandRadius) {
    try {
      const pineModel = await loadModel('/models/pinetrees.glb');
      // Place pine tree clusters along the coastal grass ring
      const numClusters = 20;
      for (let i = 0; i < numClusters; i++) {
        const angle = (i / numClusters) * Math.PI * 2 + Math.random() * 0.3;
        const dist = islandRadius * (0.88 + Math.random() * 0.12); // On the grass ring
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;

        const pine = pineModel.clone();
        const scale = 0.2 + Math.random() * 0.15;
        pine.scale.setScalar(scale);
        pine.position.set(x, 0, z);
        pine.rotation.y = Math.random() * Math.PI * 2;
        // Tint dark green
        pine.traverse(child => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.color.set(0x226633);
            child.material.emissive = new THREE.Color(0x112211);
            child.material.emissiveIntensity = 0.15;
          }
        });
        this.scene.add(pine);
      }
    } catch (e) {
      // Fallback: no coastal trees
      console.log('Pine tree model not available');
    }
  }

  async loadStreetTrees(halfCity, gridSize, cellSize, trunkMat, foliageMat) {
    // Collect tree positions
    const treePositions = [];
    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < 2; j++) {
        if (Math.random() > 0.6) continue;
        const roadZ = -halfCity + i * cellSize;
        const side = j === 0 ? -1 : 1;
        const treeX = -halfCity + Math.floor(Math.random() * gridSize) * cellSize + cellSize / 2;
        const offsetZ = side * cellSize * 0.22;
        treePositions.push({ x: treeX + (Math.random() - 0.5) * 2, z: roadZ + offsetZ });
      }
    }

    try {
      const treeModel = await loadModel('/models/animetree.glb');
      for (const pos of treePositions) {
        const tree = treeModel.clone();
        const scale = 0.3 + Math.random() * 0.3;
        tree.scale.setScalar(scale);
        tree.position.set(pos.x, 0, pos.z);
        tree.rotation.y = Math.random() * Math.PI * 2;
        // Tint: green leaves, brown trunk
        tree.traverse(child => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            if (child.name.toLowerCase().includes('trunk')) {
              child.material.color.set(0x6B4226);
            } else {
              child.material.color.set(0x33aa33);
              child.material.emissive = new THREE.Color(0x114411);
              child.material.emissiveIntensity = 0.2;
            }
          }
        });
        this.scene.add(tree);
      }
    } catch (e) {
      // Fallback to procedural trees
      for (const pos of treePositions) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 3, 6), trunkMat);
        trunk.position.set(pos.x, 1.5, pos.z);
        this.scene.add(trunk);
        const foliage = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), foliageMat);
        foliage.position.set(pos.x, 4, pos.z);
        foliage.scale.y = 0.7;
        this.scene.add(foliage);
      }
    }
  }

  async loadMountains() {
    try {
      const mountainModel = await loadModel('/models/mountain.glb');

      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const dist = 280 + Math.random() * 60;
        const scale = 15 + Math.random() * 25;

        const mountain = mountainModel.clone();
        mountain.scale.setScalar(scale);
        mountain.position.set(
          Math.cos(angle) * dist,
          -2,
          Math.sin(angle) * dist
        );
        mountain.rotation.y = Math.random() * Math.PI * 2;
        // Tint mountains green
        mountain.traverse(child => {
          if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.color.set(0x44aa55);
            child.material.emissive = new THREE.Color(0x224422);
            child.material.emissiveIntensity = 0.15;
          }
        });
        this.scene.add(mountain);
      }
    } catch (e) {
      // Fallback to procedural cone mountains
      console.log('Mountain model not available, using procedural');
      const mountainMat = new THREE.MeshStandardMaterial({ color: 0x556655, roughness: 0.9 });
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const dist = 280 + Math.random() * 60;
        const height = 30 + Math.random() * 50;
        const mountain = new THREE.Mesh(new THREE.ConeGeometry(20 + Math.random() * 25, height, 6), mountainMat);
        mountain.position.set(Math.cos(angle) * dist, height / 2 - 2, Math.sin(angle) * dist);
        mountain.rotation.y = Math.random() * Math.PI;
        this.scene.add(mountain);
      }
    }
  }

  addRooftopDetails() {
    for (const building of this.buildings) {
      if (Math.random() > 0.3) continue;

      const box = new THREE.Box3().setFromObject(building);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const roofY = box.max.y;

      if (Math.random() > 0.5) {
        // Antenna with blinking light
        const antenna = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.12, 3, 6),
          new THREE.MeshPhongMaterial({ color: 0x666666 })
        );
        antenna.position.set(center.x, roofY + 1.5, center.z);
        this.scene.add(antenna);

        const light = new THREE.Mesh(
          new THREE.SphereGeometry(0.15, 6, 6),
          new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        light.position.set(center.x, roofY + 3.2, center.z);
        this.scene.add(light);
      } else {
        // Landing pad (glowing circle on rooftop)
        const pad = new THREE.Mesh(
          new THREE.RingGeometry(0.8, 1.2, 16),
          new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
          })
        );
        pad.rotation.x = -Math.PI / 2;
        pad.position.set(center.x, roofY + 0.05, center.z);
        this.scene.add(pad);

        // H marking
        const hMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.4 });
        const hBar = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.8), hMat);
        hBar.rotation.x = -Math.PI / 2;
        hBar.position.set(center.x, roofY + 0.06, center.z);
        this.scene.add(hBar);
      }
    }
  }

  addStreetLife(halfCity) {
    const { CITY_GRID_SIZE, CITY_CELL_SIZE } = config;

    // Shared materials
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x33aa33, roughness: 0.7 });
    const lightPoleMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.3 });
    const benchMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.8 });
    const personColors = [0xff4444, 0x4444ff, 0x44aa44, 0xffaa00, 0xff44aa, 0x44ffff, 0xaa44ff];

    // --- Street trees along roads (GLB model or procedural fallback) ---
    this.loadStreetTrees(halfCity, CITY_GRID_SIZE, CITY_CELL_SIZE, trunkMat, foliageMat);

    // --- Streetlights along roads ---
    for (let i = 0; i < CITY_GRID_SIZE; i += 2) {
      for (let j = 0; j < CITY_GRID_SIZE; j += 3) {
        if (Math.random() > 0.5) continue;
        const x = -halfCity + i * CITY_CELL_SIZE;
        const z = -halfCity + j * CITY_CELL_SIZE + CITY_CELL_SIZE * 0.2;

        // Pole
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 6), lightPoleMat);
        pole.position.set(x + CITY_CELL_SIZE * 0.2, 2.5, z);
        this.scene.add(pole);

        // Light
        const lampLight = new THREE.Mesh(
          new THREE.SphereGeometry(0.25, 6, 6),
          new THREE.MeshBasicMaterial({ color: 0xffffaa })
        );
        lampLight.position.set(x + CITY_CELL_SIZE * 0.2, 5.2, z);
        this.scene.add(lampLight);

        // Arm
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 1.2, 4),
          lightPoleMat
        );
        arm.rotation.z = Math.PI / 2;
        arm.position.set(x + CITY_CELL_SIZE * 0.2 - 0.5, 5, z);
        this.scene.add(arm);
      }
    }

    // --- Benches ---
    for (let i = 0; i < 20; i++) {
      const x = -halfCity + Math.random() * halfCity * 2;
      const z = -halfCity + Math.random() * halfCity * 2;

      // Seat
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.4), benchMat);
      seat.position.set(x, 0.45, z);
      this.scene.add(seat);

      // Legs
      for (const lx of [-0.5, 0.5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.35), lightPoleMat);
        leg.position.set(x + lx, 0.2, z);
        this.scene.add(leg);
      }

      // Back
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.06), benchMat);
      back.position.set(x, 0.7, z - 0.17);
      this.scene.add(back);
    }

    // --- Walking people (animated in update) ---
    this.people = [];
    for (let i = 0; i < 30; i++) {
      const person = this.createPerson(personColors[i % personColors.length]);
      const roadIdx = Math.floor(Math.random() * CITY_GRID_SIZE);
      const onHorizontalRoad = Math.random() > 0.5;

      if (onHorizontalRoad) {
        person.position.set(
          -halfCity + Math.random() * halfCity * 2,
          0,
          -halfCity + roadIdx * CITY_CELL_SIZE + (Math.random() - 0.5) * 3
        );
        person.userData.walkDir = new THREE.Vector3(Math.random() > 0.5 ? 1 : -1, 0, 0);
      } else {
        person.position.set(
          -halfCity + roadIdx * CITY_CELL_SIZE + (Math.random() - 0.5) * 3,
          0,
          -halfCity + Math.random() * halfCity * 2
        );
        person.userData.walkDir = new THREE.Vector3(0, 0, Math.random() > 0.5 ? 1 : -1);
      }
      person.userData.walkSpeed = 1.5 + Math.random() * 1.5;
      person.userData.turnTimer = 3 + Math.random() * 5;
      this.scene.add(person);
      this.people.push(person);
    }

    // --- Ground cars driving on roads ---
    this.groundCars = [];
    const carColors = [0xff3333, 0x3333ff, 0xffff33, 0x33ff33, 0xff8800, 0xffffff, 0x222222];
    for (let i = 0; i < 12; i++) {
      const car = this.createGroundCar(carColors[i % carColors.length]);
      const roadIdx = Math.floor(Math.random() * CITY_GRID_SIZE);
      const onHorizontalRoad = Math.random() > 0.5;

      if (onHorizontalRoad) {
        car.position.set(
          -halfCity + Math.random() * halfCity * 2,
          0.3,
          -halfCity + roadIdx * CITY_CELL_SIZE
        );
        car.userData.driveDir = new THREE.Vector3(Math.random() > 0.5 ? 1 : -1, 0, 0);
        car.rotation.y = car.userData.driveDir.x > 0 ? -Math.PI / 2 : Math.PI / 2;
      } else {
        car.position.set(
          -halfCity + roadIdx * CITY_CELL_SIZE,
          0.3,
          -halfCity + Math.random() * halfCity * 2
        );
        car.userData.driveDir = new THREE.Vector3(0, 0, Math.random() > 0.5 ? 1 : -1);
        car.rotation.y = car.userData.driveDir.z > 0 ? Math.PI : 0;
      }
      car.userData.driveSpeed = 4 + Math.random() * 6;
      this.scene.add(car);
      this.groundCars.push(car);
    }
  }

  createPerson(shirtColor) {
    const group = new THREE.Group();

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.8 })
    );
    head.position.y = 1.5;
    group.add(head);

    // Body
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.2, 0.7, 8),
      new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.7 })
    );
    body.position.y = 1;
    group.add(body);

    // Legs
    const legMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.8 });
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.6, 6), legMat);
      leg.position.set(side * 0.1, 0.35, 0);
      leg.name = 'leg';
      group.add(leg);
    }

    return group;
  }

  createGroundCar(color) {
    const group = new THREE.Group();

    // Body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.5, 2.2),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.15, metalness: 0.5, roughness: 0.3 })
    );
    body.position.y = 0.25;
    group.add(body);

    // Cabin
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1, 0.4, 1),
      new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.5, metalness: 0.8, roughness: 0.1 })
    );
    cabin.position.set(0, 0.7, -0.1);
    group.add(cabin);

    // Wheels
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    for (const [wx, wz] of [[-0.6, -0.7], [0.6, -0.7], [-0.6, 0.7], [0.6, 0.7]]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 10), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.2, wz);
      wheel.name = 'carWheel';
      group.add(wheel);
    }

    // Headlights
    for (const side of [-1, 1]) {
      const hl = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffcc })
      );
      hl.position.set(side * 0.4, 0.35, -1.1);
      group.add(hl);
    }

    // Taillights
    for (const side of [-1, 1]) {
      const tl = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.08, 0.03),
        new THREE.MeshBasicMaterial({ color: 0xff2200 })
      );
      tl.position.set(side * 0.4, 0.35, 1.1);
      group.add(tl);
    }

    group.scale.setScalar(0.8);
    return group;
  }

  update(dt) {
    const halfCity = (config.CITY_GRID_SIZE * config.CITY_CELL_SIZE) / 2;

    // Animate walking people
    if (this.people) {
      for (const person of this.people) {
        const dir = person.userData.walkDir;
        const speed = person.userData.walkSpeed;
        person.position.x += dir.x * speed * dt;
        person.position.z += dir.z * speed * dt;

        // Walking animation — bob up and down
        person.position.y = Math.abs(Math.sin(Date.now() * 0.005 * speed)) * 0.1;

        // Leg animation
        let legIdx = 0;
        person.traverse(child => {
          if (child.name === 'leg') {
            child.rotation.x = Math.sin(Date.now() * 0.006 * speed + legIdx * Math.PI) * 0.3;
            legIdx++;
          }
        });

        // Face walking direction
        if (dir.x !== 0) person.rotation.y = dir.x > 0 ? -Math.PI / 2 : Math.PI / 2;
        else person.rotation.y = dir.z > 0 ? Math.PI : 0;

        // Turn around at city edges
        person.userData.turnTimer -= dt;
        if (person.userData.turnTimer <= 0 ||
            Math.abs(person.position.x) > halfCity * 0.9 ||
            Math.abs(person.position.z) > halfCity * 0.9) {
          dir.multiplyScalar(-1);
          person.userData.turnTimer = 3 + Math.random() * 5;
        }
      }
    }

    // Animate ground cars
    if (this.groundCars) {
      for (const car of this.groundCars) {
        const dir = car.userData.driveDir;
        const speed = car.userData.driveSpeed;
        car.position.x += dir.x * speed * dt;
        car.position.z += dir.z * speed * dt;

        // Spin wheels
        car.traverse(child => {
          if (child.name === 'carWheel') child.rotation.x += dt * speed * 2;
        });

        // Turn around at city edges
        if (Math.abs(car.position.x) > halfCity * 0.95 || Math.abs(car.position.z) > halfCity * 0.95) {
          dir.multiplyScalar(-1);
          car.rotation.y += Math.PI;
        }
      }
    }
  }
}
