import dotenv from 'dotenv';

dotenv.config();

const { default: express } = await import('express');
const path = await import('node:path');
const { fileURLToPath } = await import('node:url');

const {
  getFrequentPlaces,
  saveFrequentPlaces,
  getOutings,
  saveOuting,
  deleteOuting,
  getPreferences,
  savePreferences
} = await import('./lib/storage.js');

const {
  searchNearbyPlaces
} = await import('./lib/places.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = Number(
  process.env.PORT || 3000
);

app.use(
  express.json({
    limit: '1mb'
  })
);

const staticRoot = path.join(
  __dirname,
  'public'
);

app.use(
  express.static(staticRoot)
);

/* ---------------- HEALTH ---------------- */

app.get(
  '/api/health',
  (_req, res) => {
    res.json({
      ok: true,
      app: 'Merlin',
      status: 'ready',
      geoapifyConfigured:
        Boolean(
          process.env.GEOAPIFY_API_KEY
        )
    });
  }
);

/* ---------------- FREQUENT PLACES ---------------- */

app.get(
  '/api/frequent-places',
  async (_req, res) => {
    try {
      const places =
        await getFrequentPlaces();

      res.json({ places });
    } catch (error) {
      console.error(
        'Frequent places load error:',
        error
      );

      res.status(500).json({
        error:
          'Could not load frequent places.',
        details:
          error?.message ||
          'Unknown error.'
      });
    }
  }
);

app.post(
  '/api/frequent-places',
  async (req, res) => {
    try {
      const places =
        Array.isArray(
          req.body?.places
        )
          ? req.body.places
          : [];

      const saved =
        await saveFrequentPlaces(
          places
        );

      res.json({
        places: saved
      });
    } catch (error) {
      console.error(
        'Frequent places save error:',
        error
      );

      res.status(500).json({
        error:
          'Could not save frequent places.',
        details:
          error?.message ||
          'Unknown error.'
      });
    }
  }
);

/* ---------------- OUTINGS ---------------- */

app.get(
  '/api/outings',
  async (_req, res) => {
    try {
      const outings =
        await getOutings();

      res.json({ outings });
    } catch (error) {
      console.error(
        'Outings load error:',
        error
      );

      res.status(500).json({
        error:
          'Could not load outings.',
        details:
          error?.message ||
          'Unknown error.'
      });
    }
  }
);

app.post(
  '/api/outings',
  async (req, res) => {
    try {
      const saved =
        await saveOuting(
          req.body || {}
        );

      res.json({
        outing: saved
      });
    } catch (error) {
      console.error(
        'Outing save error:',
        error
      );

      res.status(500).json({
        error:
          'Could not save outing.',
        details:
          error?.message ||
          'Unknown error.'
      });
    }
  }
);

app.delete(
  '/api/outings/:id',
  async (req, res) => {
    try {
      const outings =
        await deleteOuting(
          req.params.id
        );

      res.json({ outings });
    } catch (error) {
      console.error(
        'Outing delete error:',
        error
      );

      res.status(500).json({
        error:
          'Could not delete outing.',
        details:
          error?.message ||
          'Unknown error.'
      });
    }
  }
);

/* ---------------- PREFERENCES ---------------- */

app.get(
  '/api/preferences',
  async (_req, res) => {
    try {
      const preferences =
        await getPreferences();

      res.json({
        preferences
      });
    } catch (error) {
      console.error(
        'Preferences load error:',
        error
      );

      res.status(500).json({
        error:
          'Could not load preferences.',
        details:
          error?.message ||
          'Unknown error.'
      });
    }
  }
);

app.post(
  '/api/preferences',
  async (req, res) => {
    try {
      const preferences =
        await savePreferences(
          req.body || {}
        );

      res.json({
        preferences
      });
    } catch (error) {
      console.error(
        'Preferences save error:',
        error
      );

      res.status(500).json({
        error:
          'Could not save preferences.',
        details:
          error?.message ||
          'Unknown error.'
      });
    }
  }
);

/* ---------------- PLACE SEARCH ---------------- */

async function sendPlaceSuggestions(
  preferences,
  res
) {
  try {
    console.log(
      'Merlin place search request:',
      JSON.stringify({
        activities:
          preferences?.activities,
        location:
          preferences?.location,
        radiusKm:
          preferences?.radiusKm,
        hasCoordinates:
          Boolean(
            preferences?.latitude &&
            preferences?.longitude
          ),
        geoapifyConfigured:
          Boolean(
            process.env.GEOAPIFY_API_KEY
          )
      })
    );

    const result =
      await searchNearbyPlaces(
        preferences
      );

    console.log(
      `Merlin search returned ${
        result?.suggestions?.length || 0
      } places.`
    );

    res.json(result);
  } catch (error) {
    console.error(
      'Merlin place search error:',
      error
    );

    res.status(
      error?.statusCode || 500
    ).json({
      error:
        error?.message ||
        'Merlin could not find nearby suggestions.'
    });
  }
}

app.get(
  '/api/places/search',
  async (req, res) => {
    const activities =
      String(
        req.query.activities ||
        req.query.activity ||
        req.query.type ||
        ''
      )
        .split(',')
        .map(
          (value) =>
            value.trim()
        )
        .filter(Boolean);

    await sendPlaceSuggestions(
      {
        ...req.query,
        activities
      },
      res
    );
  }
);

app.post(
  '/api/places/search',
  async (req, res) => {
    await sendPlaceSuggestions(
      req.body?.preferences ||
        req.body ||
        {},
      res
    );
  }
);

/* ---------------- CHAT ---------------- */

app.post(
  '/api/chat',
  async (req, res) => {
    const {
      message = '',
      history = [],
      context = {},
      preferences
    } = req.body || {};

    if (preferences) {
      try {
        const result =
          await searchNearbyPlaces(
            preferences
          );

        return res.json({
          ...result,
          message:
            `Merlin found ${
              result.suggestions.length
            } nearby ideas around ${
              result.location
            }.`,
          history,
          source: 'local'
        });
      } catch (error) {
        console.error(
          'Merlin chat search error:',
          error
        );

        return res.status(
          error?.statusCode || 500
        ).json({
          error:
            error?.message ||
            'Merlin could not find nearby suggestions.'
        });
      }
    }

    const cleanMessage =
      String(
        message || ''
      ).trim();

    if (!cleanMessage) {
      return res.status(400).json({
        error:
          'Tell Merlin what you would like to do, your budget, who is coming, and your area.'
      });
    }

    return res.json({
      message:
        'Merlin uses your activity, budget, group, distance, and area to rank nearby suggestions. Choose those preferences on the Talk with Merlin page to see places here.',
      history,
      source: 'local',
      context
    });
  }
);

/* ---------------- FRONTEND ---------------- */

app.get(
  '*',
  (_req, res) => {
    res.sendFile(
      path.join(
        staticRoot,
        'index.html'
      )
    );
  }
);

/* ---------------- START ---------------- */

app.listen(
  PORT,
  () => {
    console.log(
      `Merlin is running on port ${PORT}`
    );

    console.log(
      `Geoapify API key loaded: ${
        Boolean(
          process.env.GEOAPIFY_API_KEY
        )
      }`
    );
  }
);
