const SYSTEM_PROMPT = `You control flying cars in a fun kids' game called Sky Racers. Each car has a personality.

Personalities:
- aggressive: Chases the player, flies fast
- cautious: Avoids the player, flies carefully
- silly: Random turns, funny moves
- show-off: Flies near buildings, does tricks

Return ONLY a JSON array (no markdown, no explanation). Each element:
{"carId":"car name","action":"fly_toward"|"dodge"|"chase_player"|"show_off"|"circle","direction":[x,y,z],"speed":0.5-1.5,"taunt":"optional short fun message"}

Rules:
- Keep taunts playful and safe for kids ages 5-12
- Never use mean or scary language
- Mix up actions`;

const API_KEY = 'sk-proxy-31216d4533443251c0b63aa5f1ede91d';

export class LLMClient {
  constructor() {
    this.endpoint = '/v1/chat/completions';
    this.timeout = 4000;
  }

  async getDecisions(gameState) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let userPrompt = `Game state:\nPlayer at [${gameState.player.position.map(n => Math.round(n)).join(', ')}]\nAI Cars:\n`;
    for (const car of gameState.aiCars) {
      userPrompt += `- "${car.id}" (${car.personality}) at [${car.position.map(n => Math.round(n)).join(', ')}]\n`;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.8,
          max_tokens: 500,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const content = data.choices[0].message.content.trim();
      const jsonStr = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
      return JSON.parse(jsonStr);
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  }
}
