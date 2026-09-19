const HEX = /^#[0-9a-f]{6}$/i;
export const LIST_COLOR_PRESETS = ['#b49ad3', '#e3a2b4', '#e8b184', '#d8c16f', '#8ac5ac', '#8fbddd', '#91a1d5', '#a4acbc'];
export function normalizeSavedColors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((color): color is string => typeof color === 'string' && HEX.test(color)).map(color => color.toLowerCase()))].filter(color => !LIST_COLOR_PRESETS.includes(color));
}
export function readSavedColors(key: string): string[] {
  try { return normalizeSavedColors(JSON.parse(localStorage.getItem(key) || '[]')); }
  catch { return []; }
}
export function saveListColor(key: string, color: string): string[] {
  const colors = normalizeSavedColors([...readSavedColors(key), color]);
  localStorage.setItem(key, JSON.stringify(colors));
  return colors;
}
