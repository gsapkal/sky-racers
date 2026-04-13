import * as THREE from 'three';
import {
  BODY_COLORS, WING_STYLES, ENGINE_TYPES, DECALS,
  buildCarMesh, getDefaultConfig, getStatsFromConfig,
} from '../vehicles/CarParts.js';
import { loadGame, saveGame } from '../utils/storage.js';

export class BuilderScene {
  constructor(onDone) {
    this.onDone = onDone;
    this.config = loadGame().carConfig || getDefaultConfig();
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.carMesh = null;
    this.animFrame = null;

    this.initRenderer();
    this.initScene();
    this.buildUI();
    this.updatePreview();
    this.updateStats();
    this.animate();
  }

  initRenderer() {
    const canvas = document.getElementById('builder-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    const container = canvas.parentElement;
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0a0a2e);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    this.camera.position.set(5, 3, 5);
    this.camera.lookAt(0, 0, 0);

    const container = document.getElementById('builder-canvas').parentElement;
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();

    // Bright lighting for the builder — show off the car!
    const ambient = new THREE.AmbientLight(0x8899bb, 1.5);
    this.scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(5, 10, 5);
    this.scene.add(dirLight);
    const fillLight = new THREE.DirectionalLight(0x6688cc, 0.6);
    fillLight.position.set(-5, 3, -5);
    this.scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffaa66, 0.4);
    rimLight.position.set(0, -3, 5);
    this.scene.add(rimLight);

    // Turntable platform
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 0.2, 32),
      new THREE.MeshLambertMaterial({ color: 0x222244 })
    );
    platform.position.y = -1;
    this.scene.add(platform);
  }

  buildUI() {
    // Color options
    const colorRow = document.getElementById('color-options');
    colorRow.innerHTML = '';
    for (const c of BODY_COLORS) {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch' + (this.config.bodyColor === c.id ? ' selected' : '');
      swatch.style.backgroundColor = '#' + c.color.toString(16).padStart(6, '0');
      swatch.title = c.label;
      swatch.addEventListener('click', () => {
        this.config.bodyColor = c.id;
        this.refreshSelections();
      });
      colorRow.appendChild(swatch);
    }

    // Wing options
    const wingRow = document.getElementById('wing-options');
    wingRow.innerHTML = '';
    for (const w of WING_STYLES) {
      const btn = document.createElement('button');
      btn.className = 'option-btn' + (this.config.wingStyle === w.id ? ' selected' : '');
      btn.textContent = w.label;
      btn.addEventListener('click', () => {
        this.config.wingStyle = w.id;
        this.refreshSelections();
      });
      wingRow.appendChild(btn);
    }

    // Engine options
    const engineRow = document.getElementById('engine-options');
    engineRow.innerHTML = '';
    for (const e of ENGINE_TYPES) {
      const btn = document.createElement('button');
      btn.className = 'option-btn' + (this.config.engineType === e.id ? ' selected' : '');
      btn.textContent = e.label;
      btn.addEventListener('click', () => {
        this.config.engineType = e.id;
        this.refreshSelections();
      });
      engineRow.appendChild(btn);
    }

    // Decal options
    const decalRow = document.getElementById('decal-options');
    decalRow.innerHTML = '';
    for (const d of DECALS) {
      const btn = document.createElement('button');
      btn.className = 'option-btn' + (this.config.decal === d.id ? ' selected' : '');
      btn.textContent = d.symbol ? `${d.symbol} ${d.label}` : d.label;
      btn.addEventListener('click', () => {
        this.config.decal = d.id;
        this.refreshSelections();
      });
      decalRow.appendChild(btn);
    }

    // Done button
    document.getElementById('builder-done-btn').addEventListener('click', () => {
      this.save();
      this.dispose();
      this.onDone(this.config);
    });
  }

  refreshSelections() {
    // Update selected state on all options
    document.querySelectorAll('#color-options .color-swatch').forEach((el, i) => {
      el.classList.toggle('selected', BODY_COLORS[i].id === this.config.bodyColor);
    });
    document.querySelectorAll('#wing-options .option-btn').forEach((el, i) => {
      el.classList.toggle('selected', WING_STYLES[i].id === this.config.wingStyle);
    });
    document.querySelectorAll('#engine-options .option-btn').forEach((el, i) => {
      el.classList.toggle('selected', ENGINE_TYPES[i].id === this.config.engineType);
    });
    document.querySelectorAll('#decal-options .option-btn').forEach((el, i) => {
      el.classList.toggle('selected', DECALS[i].id === this.config.decal);
    });

    this.updatePreview();
    this.updateStats();
  }

  updatePreview() {
    if (this.carMesh) {
      this.scene.remove(this.carMesh);
    }
    this.carMesh = buildCarMesh(this.config);
    this.scene.add(this.carMesh);
  }

  updateStats() {
    const stats = getStatsFromConfig(this.config);
    // Speed: base 18 + bonus, max ~28
    const speedPct = Math.min(100, ((18 + stats.speedBonus) / 28) * 100);
    document.getElementById('stat-speed').style.width = speedPct + '%';

    // Turn: base 2 + bonus, range ~1.7 to 2.5
    const turnPct = Math.min(100, ((2 + stats.turnBonus) / 2.5) * 100);
    document.getElementById('stat-turn').style.width = turnPct + '%';
  }

  save() {
    const data = loadGame();
    data.carConfig = this.config;
    saveGame(data);
  }

  animate() {
    this.animFrame = requestAnimationFrame(() => this.animate());
    if (this.carMesh) {
      this.carMesh.rotation.y += 0.01;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.renderer.dispose();
  }
}
