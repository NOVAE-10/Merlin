import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');
const FREQUENT_PLACES_FILE = path.join(DATA_DIR, 'frequent-places.json');
const OUTINGS_FILE = path.join(DATA_DIR, 'outings.json');
const PREFERENCES_FILE = path.join(DATA_DIR, 'preferences.json');

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    await ensureDataDir();
    if (!existsSync(filePath)) {
      await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), 'utf8');
      return fallback;
    }
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.trim()) {
      await fs.writeFile(filePath, JSON.stringify(fallback, null, 2), 'utf8');
      return fallback;
    }
    return JSON.parse(content);
  } catch (error) {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await ensureDataDir();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function getFrequentPlaces() {
  return readJson(FREQUENT_PLACES_FILE, []);
}

export async function saveFrequentPlaces(places) {
  await writeJson(FREQUENT_PLACES_FILE, Array.isArray(places) ? places.slice(0, 5) : []);
  return Array.isArray(places) ? places.slice(0, 5) : [];
}

export async function getOutings() {
  return readJson(OUTINGS_FILE, []);
}

export async function saveOuting(outing) {
  const outings = await getOutings();
  const draft = { ...outing, id: outing.id || cryptoId() };
  const index = outings.findIndex((item) => item.id === draft.id);
  if (index >= 0) {
    outings[index] = draft;
  } else {
    outings.unshift(draft);
  }
  await writeJson(OUTINGS_FILE, outings);
  return draft;
}

export async function deleteOuting(id) {
  const outings = await getOutings();
  const filtered = outings.filter((item) => item.id !== id);
  await writeJson(OUTINGS_FILE, filtered);
  return filtered;
}

export async function getPreferences() {
  return readJson(PREFERENCES_FILE, {
    preferredMood: 'balanced',
    foodBudget: 'medium',
    distance: 'nearby'
  });
}

export async function savePreferences(preferences) {
  const next = { ...(await getPreferences()), ...(preferences || {}) };
  await writeJson(PREFERENCES_FILE, next);
  return next;
}

function cryptoId() {
  return `id_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}
