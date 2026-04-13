import { AICar } from './AICar.js';
import { LLMClient } from '../ai/LLMClient.js';
import config from '../config.js';
import { eventBus } from '../core/EventBus.js';

export class AICarManager {
  constructor(scene) {
    this.scene = scene;
    this.cars = [];
    this.llmClient = new LLMClient();
    this.decisionTimer = config.AI_DECISION_INTERVAL;
    this.useLLM = true; // Will fallback to scripted if LLM unavailable

    for (let i = 0; i < config.AI_CAR_COUNT; i++) {
      this.cars.push(new AICar(scene, i));
    }
  }

  async requestLLMDecisions(playerPosition) {
    try {
      const gameState = {
        player: {
          position: [playerPosition.x, playerPosition.y, playerPosition.z],
          health: 100, // Will be connected later
        },
        aiCars: this.cars.map(car => ({
          id: car.name,
          personality: car.personality,
          position: [car.position.x, car.position.y, car.position.z],
        })),
      };

      const decisions = await this.llmClient.getDecisions(gameState);
      if (decisions && decisions.length > 0) {
        for (const decision of decisions) {
          const car = this.cars.find(c => c.name === decision.carId);
          if (car) car.applyLLMDecision(decision);
        }
      }
    } catch (err) {
      // Silently fallback to scripted behavior
      this.useLLM = false;
      console.warn('LLM unavailable, using scripted AI:', err.message);
    }
  }

  update(dt, playerPosition) {
    // Decision timer
    this.decisionTimer -= dt;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = config.AI_DECISION_INTERVAL;
      if (this.useLLM) {
        this.requestLLMDecisions(playerPosition);
      }
    }

    // Update each car
    for (const car of this.cars) {
      // Always run scripted behavior as baseline; LLM overrides targets
      car.updateScriptedBehavior(dt, playerPosition);
      car.update(dt);
    }
  }
}
