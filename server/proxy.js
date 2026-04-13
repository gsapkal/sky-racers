import express from 'express';
import OpenAI from 'openai';
import { config } from 'dotenv';

config(); // Load .env

const app = express();
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});

const SYSTEM_PROMPT = `You control flying cars in a fun kids' game called Sky Racers. Each car has a personality that affects how they fly.

Personalities:
- aggressive: Likes to chase the player and fly fast
- cautious: Avoids the player, flies carefully
- silly: Does unexpected things, random turns
- show-off: Flies close to buildings, does tricks

Return ONLY a JSON array (no markdown, no explanation). Each element:
{
  "carId": "car name",
  "action": "fly_toward" | "dodge" | "chase_player" | "show_off" | "circle",
  "direction": [x, y, z],
  "speed": 0.5 to 1.5,
  "taunt": "optional short fun message"
}

Rules:
- Keep taunts playful and safe for children ages 5-12
- Never use mean, scary, or violent language
- Mix up actions - don't always chase the player`;

app.post('/api/ai-decision', async (req, res) => {
  try {
    const gameState = req.body;

    let userPrompt = `Game state:\nPlayer at [${gameState.player.position.map(n => Math.round(n)).join(', ')}]\nAI Cars:\n`;
    for (const car of gameState.aiCars) {
      userPrompt += `- "${car.id}" (${car.personality}) at [${car.position.map(n => Math.round(n)).join(', ')}]\n`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 500,
    });

    const content = completion.choices[0].message.content.trim();
    // Strip markdown code fences if present
    const jsonStr = content.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const decisions = JSON.parse(jsonStr);
    res.json({ decisions });
  } catch (err) {
    console.error('AI decision error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`AI proxy server running on http://localhost:${PORT}`);
});
