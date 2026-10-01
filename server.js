import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getFrequentPlaces,
  saveFrequentPlaces,
  getOutings,
  saveOuting,
  deleteOuting,
  getPreferences,
  savePreferences
} from './lib/storage.js';
import { searchNearbyPlaces } from './lib/places.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '1mb' }));

const staticRoot = path.join(__dirname, 'public');
app.use(express.static(staticRoot));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, app: 'Merlin', status: 'ready' });
});

app.get('/api/frequent-places', async (_req, res) => {
  const places = await getFrequentPlaces();
  res.json({ places });
});

app.post('/api/frequent-places', async (req, res) => {
  const { places } = req.body || {};
  try {
    const saved = await saveFrequentPlaces(Array.isArray(places) ? places : []);
    res.json({ places: saved });
  } catch (error) {
    res.status(500).json({ error: 'Could not save frequent places.', details: error.message });
  }
});

app.get('/api/outings', async (_req, res) => {
  const outings = await getOutings();
  res.json({ outings });
});

app.post('/api/outings', async (req, res) => {
  try {
    const saved = await saveOuting(req.body || {});
    res.json({ outing: saved });
  } catch (error) {
    res.status(500).json({ error: 'Could not save outing.', details: error.message });
  }
});

app.delete('/api/outings/:id', async (req, res) => {
  try {
    const outings = await deleteOuting(req.params.id);
    res.json({ outings });
  } catch (error) {
    res.status(500).json({ error: 'Could not delete outing.', details: error.message });
  }
});

app.get('/api/preferences', async (_req, res) => {
  const preferences = await getPreferences();
  res.json({ preferences });
});

app.post('/api/preferences', async (req, res) => {
  try {
    const preferences = await savePreferences(req.body || {});
    res.json({ preferences });
  } catch (error) {
    res.status(500).json({ error: 'Could not save preferences.', details: error.message });
  }
});

async function sendPlaceSuggestions(preferences, res) {
  try {
    res.json(await searchNearbyPlaces(preferences));
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Merlin could not find nearby suggestions.' });
  }
}

app.get('/api/places/search', async (req, res) => {
  const activities = String(req.query.activities || req.query.activity || req.query.type || '').split(',').filter(Boolean);
  await sendPlaceSuggestions({ ...req.query, activities }, res);
});

app.post('/api/places/search', async (req, res) => {
  await sendPlaceSuggestions(req.body?.preferences || req.body || {}, res);
});

app.post('/api/chat', async (req, res) => {
  const { message = '', history = [], context = {}, preferences } = req.body || {};

  if (preferences) {
    try {
      const result = await searchNearbyPlaces(preferences);
      return res.json({ ...result, message: `Merlin found ${result.suggestions.length} nearby ideas around ${result.location}.`, history, source: 'local' });
    } catch (error) {
      return res.status(error.statusCode || 500).json({ error: error.message || 'Merlin could not find nearby suggestions.' });
    }
  }

  const cleanMessage = String(message || '').trim();
  if (!cleanMessage) {
    return res.status(400).json({
      error: 'Tell Merlin what you would like to do, your budget, who is coming, and your area.'
    });
  }

  try {
    return res.json({
      message: 'Merlin uses your activity, budget, group, distance, and area to rank nearby suggestions. Choose those preferences on the Talk with Merlin page to see places here.',
      history,
      source: 'local',
      context
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Merlin could not prepare that place search right now.',
      details: error?.message || 'Unknown planning error.'
    });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(staticRoot, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Merlin is running on http://localhost:${PORT}`);
});
