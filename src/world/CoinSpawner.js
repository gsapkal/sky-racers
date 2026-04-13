import * as THREE from 'three';
import config from '../config.js';
import { eventBus } from '../core/EventBus.js';

const COIN_TYPES = [
  { color: 0xFFD700, value: 5, emissive: 0xaa8800, label: 'gold' },
  { color: 0xC0C0C0, value: 3, emissive: 0x666666, label: 'silver' },
  { color: 0xCD7F32, value: 1, emissive: 0x664400, label: 'bronze' },
];

export class CoinSpawner {
  constructor(scene) {
    this.scene = scene;
    this.coins = [];
    this.spawnCoins();
  }

  spawnCoins() {
    const halfCity = (config.CITY_GRID_SIZE * config.CITY_CELL_SIZE) / 2;

    for (let i = 0; i < config.COIN_SPAWN_COUNT; i++) {
      // Pick coin type weighted toward bronze
      const roll = Math.random();
      const type = roll < 0.15 ? COIN_TYPES[0] : roll < 0.4 ? COIN_TYPES[1] : COIN_TYPES[2];

      const coin = this.createCoin(type);
      coin.position.set(
        (Math.random() - 0.5) * halfCity * 1.8,
        8 + Math.random() * 40,
        (Math.random() - 0.5) * halfCity * 1.8
      );
      coin.userData = { type, collected: false, rotSpeed: 1 + Math.random() * 2 };
      this.scene.add(coin);
      this.coins.push(coin);
    }
  }

  createCoin(type) {
    const group = new THREE.Group();

    // Bigger coin with bright glow — easy to spot for kids
    const coinGeo = new THREE.CylinderGeometry(1.0, 1.0, 0.2, 20);
    const coinMat = new THREE.MeshStandardMaterial({
      color: type.color,
      emissive: type.color,
      emissiveIntensity: 0.6,
      metalness: 0.8,
      roughness: 0.15,
    });
    const coinMesh = new THREE.Mesh(coinGeo, coinMat);
    coinMesh.rotation.z = Math.PI / 2;
    group.add(coinMesh);

    // Bright sparkle ring
    const ringGeo = new THREE.TorusGeometry(1.3, 0.06, 8, 20);
    const ringMat = new THREE.MeshBasicMaterial({
      color: type.color,
      transparent: true,
      opacity: 0.6,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.z = Math.PI / 2;
    group.add(ring);

    // Outer glow sphere (makes coins visible from far away)
    const glowMat = new THREE.MeshBasicMaterial({
      color: type.color,
      transparent: true,
      opacity: 0.2,
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), glowMat);
    group.add(glow);

    return group;
  }

  update(dt, playerPosition) {
    for (const coin of this.coins) {
      if (coin.userData.collected) continue;

      // Spin the coin
      coin.rotation.y += coin.userData.rotSpeed * dt;

      // Bob up and down
      coin.position.y += Math.sin(Date.now() * 0.002 + coin.id) * 0.01;

      // Check collection (generous radius for kids)
      const dist = coin.position.distanceTo(playerPosition);
      if (dist < 5) {
        this.collectCoin(coin);
      }
    }
  }

  collectCoin(coin) {
    coin.userData.collected = true;
    coin.visible = false;

    eventBus.emit('coin-collected', {
      value: coin.userData.type.value,
      position: coin.position.clone(),
    });

    // Respawn after delay
    setTimeout(() => {
      const halfCity = (config.CITY_GRID_SIZE * config.CITY_CELL_SIZE) / 2;
      coin.position.set(
        (Math.random() - 0.5) * halfCity * 1.8,
        8 + Math.random() * 40,
        (Math.random() - 0.5) * halfCity * 1.8
      );
      coin.userData.collected = false;
      coin.visible = true;
    }, config.COIN_RESPAWN_DELAY * 1000);
  }
}
