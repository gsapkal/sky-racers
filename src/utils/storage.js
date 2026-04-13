const STORAGE_KEY = 'sky-racers-save';

export function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    return JSON.parse(raw);
  } catch {
    return defaultSave();
  }
}

export function saveGame(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function defaultSave() {
  return {
    coins: 0,
    totalCoinsEarned: 0,
    carConfig: null,
  };
}
