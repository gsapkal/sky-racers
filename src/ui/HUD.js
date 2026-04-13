import * as THREE from 'three';
import config from '../config.js';
import { eventBus } from '../core/EventBus.js';

export class HUD {
  constructor() {
    this.hud = document.getElementById('hud');
    this.coinDisplay = document.getElementById('coin-display');
    this.healthBar = document.getElementById('health-bar');
    this.speedDisplay = document.getElementById('speed-display');
    this.boostDisplay = document.getElementById('boost-display');
    this.altitudeDisplay = document.getElementById('altitude-display');
    this.controlsHint = document.getElementById('controls-hint');
    this.crashOverlay = document.getElementById('crash-overlay');
    this.runwayIndicator = document.getElementById('runway-indicator');

    this.coins = 0;

    eventBus.on('coin-collected', (data) => {
      this.coins += data.value;
      this.coinDisplay.textContent = this.coins;
      this.showCoinPopup(data.value);
    });

    eventBus.on('player-damaged', () => {
      this.flashCrash();
    });
  }

  show() {
    this.hud.classList.add('active');
    this.controlsHint.classList.add('active');
    setTimeout(() => this.controlsHint.classList.remove('active'), 5000);
  }

  hide() {
    this.hud.classList.remove('active');
    this.controlsHint.classList.remove('active');
  }

  update(playerCar) {
    const healthPct = (playerCar.health / config.HEALTH_MAX) * 100;
    this.healthBar.style.width = healthPct + '%';

    if (healthPct > 60) {
      this.healthBar.style.background = 'linear-gradient(90deg, #00ff88, #00cc66)';
    } else if (healthPct > 30) {
      this.healthBar.style.background = 'linear-gradient(90deg, #ffa502, #ff7f00)';
    } else {
      this.healthBar.style.background = 'linear-gradient(90deg, #ff4757, #ff0000)';
    }

    const speed = Math.round(playerCar.speed * (playerCar.isBoosting ? config.BOOST_MULTIPLIER : 1));
    this.speedDisplay.textContent = `Speed: ${speed}`;

    if (playerCar.isBoosting) {
      this.boostDisplay.textContent = 'BOOST!';
      this.boostDisplay.style.color = '#ff4400';
    } else if (playerCar.boostCooldown > 0) {
      this.boostDisplay.textContent = `Boost: ${Math.ceil(playerCar.boostCooldown)}s`;
      this.boostDisplay.style.color = '#888';
    } else {
      this.boostDisplay.textContent = 'Boost: Ready';
      this.boostDisplay.style.color = '#ff8800';
    }

    this.altitudeDisplay.textContent = `Alt: ${Math.round(playerCar.position.y)}`;
  }

  updateRunwayIndicator(distance, direction, camera) {
    if (!this.runwayIndicator) return;

    const dist = Math.round(distance);
    this.runwayIndicator.style.display = 'block';

    this.runwayIndicator.textContent = `Runway: ${dist}m - Press L to land`;
    this.runwayIndicator.style.color = dist < 150 ? '#00ff88' : '#88aacc';
  }

  showCoinPopup(value) {
    const popup = document.createElement('div');
    popup.className = 'coin-popup';
    popup.textContent = `+${value}`;
    popup.style.left = (window.innerWidth / 2 + (Math.random() - 0.5) * 100) + 'px';
    popup.style.top = (window.innerHeight / 2 - 50) + 'px';
    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 1000);
  }

  flashCrash() {
    this.crashOverlay.classList.add('active');
    setTimeout(() => this.crashOverlay.classList.remove('active'), 500);
  }

  setCoins(amount) {
    this.coins = amount;
    this.coinDisplay.textContent = this.coins;
  }
}
