const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  'MerlinOutingPlanner/1.0';

const GEOAPIFY_PLACES_URL =
  'https://api.geoapify.com/v2/places';

const GEOAPIFY_GEOCODING_URL =
  'https://api.geoapify.com/v1/geocode/search';

const ALLOWED_RADII = [1, 3, 5, 10, 25, 50];

const ACTIVITY_CONFIG = {
  food: {
    label: 'Food and drink',
    categories: [
      'catering.restaurant',
      'catering.cafe',
      'catering.fast_food',
      'catering.food_court',
      'catering.ice_cream'
    ]
  },

  nature: {
    label: 'Parks and gardens',
    categories: [
      'leisure.park',
      'leisure.park.garden',
      'leisure.park.nature_reserve',
      'leisure.picnic'
    ]
  },

  culture: {
    label: 'Arts and culture',
    categories: [
      'entertainment.museum',
      'entertainment.culture',
      'entertainment.culture.gallery',
      'entertainment.culture.theatre',
      'tourism.attraction',
      'tourism.sights'
    ]
  },

  shopping: {
    label: 'Shopping',
    categories: [
      'commercial.shopping_mall',
      'commercial.supermarket',
      'commercial.department_store'
    ]
  },

  family: {
    label: 'Family activities',
    categories: [
      'entertainment.zoo',
      'entertainment.aquarium',
      'entertainment.bowling_alley',
      'entertainment.cinema',
      'entertainment.activity_park',
      'entertainment.theme_park',
      'entertainment.water_park',
      'leisure.playground'
    ]
  },

  active: {
    label: 'Sports and activities',
    categories: [
      'activity',
      'activity.sport_club',
      'sport',
      'sport.fitness',
      'sport.sports_centre',
      'sport.swimming_pool',
      'entertainment.activity_park',
      'leisure.playground'
    ]
  },

  quiet: {
    label: 'Quiet places',
    categories: [
      'education.library',
      'leisure.park',
      'leisure.park.garden',
      'leisure.picnic'
    ]
  },

  beach: {
    label: 'Beaches and waterfront',
    categories: [
      'beach',
      'beach.beach_resort'
    ]
  },

  nightlife: {
    label: 'Nightlife',
    categories: [
      'catering.bar',
      'catering.pub',
      'adult.nightclub'
    ]
  },

  wellness: {
    label: 'Wellness',
    categories: [
      'service.beauty',
      'service.beauty.hairdresser',
      'service.beauty.spa',
      'leisure.spa',
      'leisure.spa.sauna',
      'leisure.spa.public_bath'
    ]
  },

  stay: {
    label: 'Hotels and stays',
    categories: [
      'accommodation.hotel',
      'accommodation.hostel',
      'accommodation.guest_house',
      'accommodation.motel',
      'accommodation.apartment'
    ]
  }
};

const ACTIVITY_ALIASES = {
  restaurant: 'food',
  restaurants: 'food',
  cafe: 'food',
  cafes: 'food',
  lunch: 'food',
  dinner: 'food',
  breakfast: 'food',
  food: 'food',

  park: 'nature',
  parks: 'nature',
  garden: 'nature',
  gardens: 'nature',
  nature: 'nature',

  culture: 'culture',
  museum: 'culture',
  museums: 'culture',
  heritage: 'culture',
  theatre: 'culture',
  theater: 'culture',
  gallery: 'culture',

  shopping: 'shopping',
  shop: 'shopping',
  shops: 'shopping',
  mall: 'shopping',
  malls: 'shopping',

  family: 'family',
  kids: 'family',
  amusement: 'family',
  zoo: 'family',
  aquarium: 'family',
  cinema: 'family',

  active: 'active',
  sport: 'active',
  sports: 'active',
  fitness: 'active',
  gym: 'active',

  quiet: 'quiet',
  library: 'quiet',
  libraries: 'quiet',
  reading: 'quiet',
  study: 'quiet',

  beach: 'beach',
  beaches: 'beach',
  waterfront: 'beach',

  nightlife: 'nightlife',
  nightclub: 'nightlife',
  nightclubs: 'nightlife',

  wellness: 'wellness',
  spa: 'wellness',
  salon: 'wellness',
  salons: 'wellness',
  beauty: 'wellness',

  stay: 'stay',
  hotel: 'stay',
  hotels: 'stay',
  hostel: 'stay'
};

const AVERAGE_SPEND_SHARES = {
  food: 0.55,
  nature: 0.20,
  culture: 0.30,
  shopping: 0.65,
  family: 0.40,
  active: 0.45,
  quiet: 0.10,
  beach: 0.25,
  nightlife: 0.70,
  wellness: 0.65,
  stay: 0.35
};

const geocodeCache = new Map();

function serviceError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getGeoapifyApiKey() {
  return String(
    process.env.GEOAPIFY_API_KEY || ''
  ).trim();
}

function normaliseActivity(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase();

  if (ACTIVITY_CONFIG[key]) {
    return key;
  }

  return ACTIVITY_ALIASES[key] || null;
}

function normaliseActivities(input = {}) {
  const raw = Array.isArray(input.activities)
    ? input.activities
    : [
        input.activity,
        input.category,
        input.type
      ];

  return [
    ...new Set(
      raw
        .flatMap((value) =>
          String(value || '').split(',')
        )
        .map(normaliseActivity)
        .filter(Boolean)
    )
  ].slice(0, 3);
}

function normaliseCoordinates(input = {}) {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const accuracy = Number(
    input.locationAccuracyMeters
  );

  return {
    latitude,
    longitude,
    accuracyMeters:
      Number.isFinite(accuracy) && accuracy >= 0
        ? accuracy
        : null
  };
}

function parseRadiusKm(input = {}) {
  const candidates = [
    input.radiusKm,
    input.radius,
    input.distanceKm,
    input.distance,
    input.radius_km
  ];

  for (const candidate of candidates) {
    if (
      candidate === null ||
      candidate === undefined ||
      candidate === ''
    ) {
      continue;
    }

    const text = String(candidate)
      .replace(/,/g, '.');

    const match = text.match(
      /\d+(?:\.\d+)?/
    );

    if (!match) {
      continue;
    }

    let value = Number(match[0]);

    if (
      /\bm\b|metre|meter/i.test(text) &&
      !/km|kilo/i.test(text)
    ) {
      value /= 1000;
    }

    if (
      !Number.isFinite(value) ||
      value <= 0
    ) {
      continue;
    }

    const nearest = ALLOWED_RADII.reduce(
      (best, radius) =>
        Math.abs(radius - value) <
        Math.abs(best - value)
          ? radius
          : best,
      ALLOWED_RADII[0]
    );

    console.log(
      `Merlin radius received: ${JSON.stringify(
        candidate
      )} -> using ${nearest} km`
    );

    return nearest;
  }

  console.warn(
    'Merlin radius WARNING: no usable distance was received. Using 50 km.'
  );

  return 50;
}

function normalisePreferences(input = {}) {
  const activities =
    normaliseActivities(input);

  const radiusKm =
    parseRadiusKm(input);

  const requestedBudget =
    Number(input.budgetRupees);

  const budgetRupees =
    Number.isFinite(requestedBudget)
      ? Math.max(
          300,
          Math.min(
            10000,
            Math.round(requestedBudget)
          )
        )
      : 3000;

  const partySize = Math.max(
    1,
    Math.min(
      50,
      Math.floor(
        Number(input.partySize) || 1
      )
    )
  );

  const tripDays = Math.max(
    1,
    Math.min(
      365,
      Math.floor(
        Number(input.tripDays) || 1
      )
    )
  );

  const budgetMode =
    input.budgetMode === 'trip'
      ? 'trip'
      : 'per-person';

  let totalBudgetRupees = null;

  if (budgetMode === 'trip') {
    totalBudgetRupees =
      Number.isFinite(requestedBudget)
        ? Math.max(
            0,
            Math.min(
              1000000000,
              requestedBudget
            )
          )
        : 50000;
  }

  const dailyPerPersonBudget =
    budgetMode === 'trip'
      ? totalBudgetRupees /
        partySize /
        tripDays
      : budgetRupees;

  const locationMode =
    input.locationMode === 'live'
      ? 'live'
      : 'manual';

  return {
    activities,

    location: String(
      input.location || ''
    )
      .trim()
      .slice(0, 160),

    origin: String(
      input.origin || ''
    )
      .trim()
      .slice(0, 160),

    locationMode,

    coordinates:
      normaliseCoordinates(input),

    radiusKm,

    budgetRupees: Math.max(
      0,
      Math.round(
        dailyPerPersonBudget
      )
    ),

    totalBudgetRupees,

    budgetMode,

    partySize,

    tripDays,

    companions: String(
      input.companions || 'friends'
    ).toLowerCase(),

    transport: [
      'walk',
      'transit',
      'drive',
      'any'
    ].includes(input.transport)
      ? input.transport
      : 'any',

    accommodation: String(
      input.accommodation || ''
    )
      .trim()
      .toLowerCase()
  };
}

export function normalizePlacePreferences(input = {}) {
  return normalisePreferences(input);
}

function buildGoogleMapsUrl(
  place,
  location = ''
) {
  const query = [
    place.name,
    place.address,
    location
  ]
    .filter(Boolean)
    .join(', ');

  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(query)
  );
}

export {
  buildGoogleMapsUrl
};

/*
 * ------------------------------------------------------------
 * GEOCODING
 * ------------------------------------------------------------
 *
 * IMPORTANT:
 *
 * Trip destination and trip origin are both geocoded
 * independently.
 *
 * Geoapify is used FIRST because the application already
 * uses Geoapify and its forward geocoder supports free-form
 * city/country searches.
 *
 * Nominatim and ArcGIS remain fallbacks.
 *
 * This prevents a destination such as:
 *
 *   London, United Kingdom
 *
 * from accidentally being resolved to an unrelated result.
 */

function cleanLocationQuery(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

function extractCountryCodeFromQuery(query) {
  const normalized =
    String(query || '')
      .trim()
      .toLowerCase();

  const countryMap = [
    {
      names: [
        'india',
        'bharat'
      ],
      code: 'in'
    },
    {
      names: [
        'united kingdom',
        'uk',
        'england',
        'scotland',
        'wales',
        'great britain'
      ],
      code: 'gb'
    },
    {
      names: [
        'france'
      ],
      code: 'fr'
    },
    {
      names: [
        'united states',
        'usa',
        'us',
        'america'
      ],
      code: 'us'
    },
    {
      names: [
        'canada'
      ],
      code: 'ca'
    },
    {
      names: [
        'australia'
      ],
      code: 'au'
    },
    {
      names: [
        'germany'
      ],
      code: 'de'
    },
    {
      names: [
        'italy'
      ],
      code: 'it'
    },
    {
      names: [
        'spain'
      ],
      code: 'es'
    },
    {
      names: [
        'portugal'
      ],
      code: 'pt'
    },
    {
      names: [
        'netherlands',
        'holland'
      ],
      code: 'nl'
    },
    {
      names: [
        'switzerland'
      ],
      code: 'ch'
    },
    {
      names: [
        'singapore'
      ],
      code: 'sg'
    },
    {
      names: [
        'japan'
      ],
      code: 'jp'
    },
    {
      names: [
        'uae',
        'united arab emirates'
      ],
      code: 'ae'
    }
  ];

  for (const country of countryMap) {
    if (
      country.names.some(
        (name) =>
          normalized === name ||
          normalized.endsWith(
            `, ${name}`
          ) ||
          normalized.includes(
            ` ${name}`
          )
      )
    ) {
      return country.code;
    }
  }

  return '';
}

async function geocodeWithGeoapify(query) {
  const apiKey =
    getGeoapifyApiKey();

  if (!apiKey) {
    throw new Error(
      'Geoapify API key is not available for geocoding.'
    );
  }

  const cleanQuery =
    cleanLocationQuery(query);

  if (!cleanQuery) {
    throw new Error(
      'Empty geocoding query.'
    );
  }

  const url = new URL(
    GEOAPIFY_GEOCODING_URL
  );

  url.searchParams.set(
    'text',
    cleanQuery
  );

  url.searchParams.set(
    'format',
    'json'
  );

  url.searchParams.set(
    'limit',
    '5'
  );

  url.searchParams.set(
    'lang',
    'en'
  );

  /*
   * If the user supplied a country,
   * restrict the geocoder to that country.
   *
   * Example:
   *
   * London, United Kingdom
   * -> filter=countrycode:gb
   *
   * This is much safer than accepting
   * an unrelated same-name location.
   */
  const countryCode =
    extractCountryCodeFromQuery(
      cleanQuery
    );

  if (countryCode) {
    url.searchParams.set(
      'filter',
      `countrycode:${countryCode}`
    );
  }

  const response =
    await fetch(
      url,
      {
        headers: {
          'User-Agent':
            NOMINATIM_USER_AGENT,
          Accept:
            'application/json'
        },
        signal:
          AbortSignal.timeout(
            15000
          )
      }
    );

  if (!response.ok) {
    throw new Error(
      `Geoapify geocoding failed with status ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !Array.isArray(
      data?.results
    ) ||
    !data.results.length
  ) {
    throw new Error(
      `Geoapify could not find "${cleanQuery}".`
    );
  }

  /*
   * Prefer a city-level result when the
   * user entered a simple destination.
   */
  const cityResult =
    data.results.find(
      (result) =>
        String(
          result?.result_type ||
            result?.type ||
            ''
        ).toLowerCase() ===
        'city'
    );

  const result =
    cityResult ||
    data.results[0];

  const latitude =
    Number(result.lat);

  const longitude =
    Number(result.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error(
      'Geoapify returned invalid coordinates.'
    );
  }

  const resultCountryCode =
    String(
      result.country_code ||
        result.countryCode ||
        ''
    ).toLowerCase();

  /*
   * If the query explicitly contained a
   * country and Geoapify returned another
   * country, reject it instead of silently
   * using the wrong destination.
   */
  if (
    countryCode &&
    resultCountryCode &&
    resultCountryCode !==
      countryCode
  ) {
    throw new Error(
      `Geoapify returned country "${resultCountryCode}" instead of "${countryCode}".`
    );
  }

  return {
    latitude,
    longitude,

    countryCode:
      resultCountryCode,

    displayName:
      result.formatted ||
      result.address_line1 ||
      cleanQuery,

    source:
      'Geoapify Geocoding'
  };
}

async function geocodeWithNominatim(query) {
  const cleanQuery =
    cleanLocationQuery(query);

  const url = new URL(
    'https://nominatim.openstreetmap.org/search'
  );

  url.searchParams.set(
    'format',
    'jsonv2'
  );

  url.searchParams.set(
    'limit',
    '5'
  );

  url.searchParams.set(
    'addressdetails',
    '1'
  );

  url.searchParams.set(
    'q',
    cleanQuery
  );

  const response = await fetch(
    url,
    {
      headers: {
        'User-Agent':
          NOMINATIM_USER_AGENT,
        Accept:
          'application/json'
      },
      signal:
        AbortSignal.timeout(15000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `Nominatim lookup failed with status ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !Array.isArray(data) ||
    !data.length
  ) {
    throw new Error(
      'Nominatim could not find the location.'
    );
  }

  const expectedCountry =
    extractCountryCodeFromQuery(
      cleanQuery
    );

  let result =
    data.find(
      (item) => {
        const code =
          String(
            item.address?.country_code ||
              ''
          ).toLowerCase();

        return (
          !expectedCountry ||
          !code ||
          code === expectedCountry
        );
      }
    );

  if (!result) {
    throw new Error(
      'Nominatim returned a location in the wrong country.'
    );
  }

  return {
    latitude: Number(result.lat),
    longitude: Number(result.lon),

    countryCode:
      String(
        result.address?.country_code ||
          ''
      ).toLowerCase(),

    displayName:
      result.display_name ||
      cleanQuery,

    source:
      'Nominatim'
  };
}

async function geocodeWithArcGIS(query) {
  const cleanQuery =
    cleanLocationQuery(query);

  const url = new URL(
    'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
  );

  url.searchParams.set(
    'SingleLine',
    cleanQuery
  );

  url.searchParams.set(
    'f',
    'json'
  );

  url.searchParams.set(
    'maxLocations',
    '5'
  );

  const response = await fetch(
    url,
    {
      signal:
        AbortSignal.timeout(15000)
    }
  );

  if (!response.ok) {
    throw new Error(
      `ArcGIS lookup failed with status ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !Array.isArray(
      data?.candidates
    ) ||
    !data.candidates.length
  ) {
    throw new Error(
      'ArcGIS could not find the location.'
    );
  }

  const expectedCountry =
    extractCountryCodeFromQuery(
      cleanQuery
    );

  let candidate =
    data.candidates.find(
      (item) => {
        const address =
          String(
            item.address || ''
          ).toLowerCase();

        if (!expectedCountry) {
          return true;
        }

        if (
          expectedCountry === 'gb'
        ) {
          return (
            address.includes(
              'united kingdom'
            ) ||
            address.includes(
              'england'
            ) ||
            address.includes(
              'scotland'
            ) ||
            address.includes(
              'wales'
            ) ||
            address.includes(
              'great britain'
            )
          );
        }

        if (
          expectedCountry === 'us'
        ) {
          return (
            address.includes(
              'united states'
            ) ||
            address.includes(
              'usa'
            )
          );
        }

        return true;
      }
    );

  if (!candidate) {
    candidate =
      data.candidates[0];
  }

  if (!candidate?.location) {
    throw new Error(
      'ArcGIS could not find the location.'
    );
  }

  const latitude =
    Number(candidate.location.y);

  const longitude =
    Number(candidate.location.x);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    throw new Error(
      'ArcGIS returned invalid coordinates.'
    );
  }

  return {
    latitude,
    longitude,

    countryCode:
      expectedCountry || '',

    displayName:
      candidate.address ||
      cleanQuery,

    source:
      'ArcGIS'
  };
}

async function geocodeLocation(location) {
  const query =
    cleanLocationQuery(location);

  if (!query) {
    throw serviceError(
      'Enter a city, neighborhood, or postal code.',
      400
    );
  }

  const cacheKey =
    query.toLowerCase();

  if (
    geocodeCache.has(cacheKey)
  ) {
    const cached =
      geocodeCache.get(
        cacheKey
      );

    console.log(
      'Merlin geocode cache hit:',
      query,
      '->',
      cached.displayName,
      cached.latitude,
      cached.longitude
    );

    return cached;
  }

  /*
   * PRIMARY GEOCODER:
   *
   * Geoapify
   *
   * This is the most important correction
   * for the destination problem.
   */
  try {
    const result =
      await geocodeWithGeoapify(
        query
      );

    geocodeCache.set(
      cacheKey,
      result
    );

    console.log(
      'Merlin Geoapify geocoded:',
      JSON.stringify({
        query,
        displayName:
          result.displayName,
        latitude:
          result.latitude,
        longitude:
          result.longitude,
        countryCode:
          result.countryCode
      })
    );

    return result;
  } catch (error) {
    console.warn(
      'Geoapify geocoding failed:',
      error.message
    );
  }

  /*
   * FALLBACK 1:
   *
   * Nominatim
   */
  try {
    const result =
      await geocodeWithNominatim(
        query
      );

    geocodeCache.set(
      cacheKey,
      result
    );

    console.log(
      'Merlin Nominatim geocoded:',
      JSON.stringify({
        query,
        displayName:
          result.displayName,
        latitude:
          result.latitude,
        longitude:
          result.longitude,
        countryCode:
          result.countryCode
      })
    );

    return result;
  } catch (error) {
    console.warn(
      'Nominatim failed:',
      error.message
    );
  }

  /*
   * FALLBACK 2:
   *
   * ArcGIS
   */
  try {
    const result =
      await geocodeWithArcGIS(
        query
      );

    geocodeCache.set(
      cacheKey,
      result
    );

    console.log(
      'Merlin ArcGIS geocoded:',
      JSON.stringify({
        query,
        displayName:
          result.displayName,
        latitude:
          result.latitude,
        longitude:
          result.longitude,
        countryCode:
          result.countryCode
      })
    );

    return result;
  } catch (error) {
    console.error(
      'ArcGIS fallback failed:',
      error.message
    );

    throw serviceError(
      `Merlin could not find "${query}". Try a nearby city or neighborhood.`,
      400
    );
  }
}

/*
 * ------------------------------------------------------------
 * DISTANCE
 * ------------------------------------------------------------
 */

function calculateDistanceKm(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  const earthRadiusKm = 6371;

  const lat1 =
    latitude1 *
    Math.PI /
    180;

  const lat2 =
    latitude2 *
    Math.PI /
    180;

  const deltaLat =
    (latitude2 - latitude1) *
    Math.PI /
    180;

  const deltaLon =
    (longitude2 - longitude1) *
    Math.PI /
    180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  return (
    earthRadiusKm *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    )
  );
}

/*
 * ------------------------------------------------------------
 * PLACE HELPERS
 * ------------------------------------------------------------
 */

function getPlaceName(properties) {
  return String(
    properties.name || ''
  ).trim();
}

function isRoadLikePlaceName(name) {
  const normalized =
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(
        /[.,#()\-]+/g,
        ' '
      )
      .replace(
        /\s+/g,
        ' '
      );

  if (!normalized) {
    return true;
  }

  const roadPatterns = [
    /\bmain road\b/,
    /\broad\b/,
    /\broadway\b/,
    /\bstreet\b/,
    /\bst\b$/,
    /\bavenue\b/,
    /\bav\b$/,
    /\blane\b/,
    /\bln\b$/,
    /\bcross road\b/,
    /\bhighway\b/,
    /\bhwy\b/,
    /\bexpressway\b/,
    /\bbypass\b/,
    /\bjunction\b/,
    /\bintersection\b/,
    /\bservice road\b/,
    /\blayout road\b/
  ];

  if (
    roadPatterns.some(
      (pattern) =>
        pattern.test(normalized)
    )
  ) {
    return true;
  }

  if (
    /^\d+(st|nd|rd|th)?\s+(main|cross|road|street)\b/.test(
      normalized
    )
  ) {
    return true;
  }

  return false;
}

function getPlaceAddress(properties) {
  return String(
    properties.formatted ||
      [
        properties.address_line1,
        properties.address_line2
      ]
        .filter(Boolean)
        .join(', ')
  ).trim();
}

function getCategoryForPlace(
  properties,
  activities
) {
  const categories =
    Array.isArray(
      properties.categories
    )
      ? properties.categories
      : [];

  for (
    const activity of activities
  ) {
    const config =
      ACTIVITY_CONFIG[activity];

    if (!config) {
      continue;
    }

    const matched =
      config.categories.some(
        (wanted) =>
          categories.some(
            (actual) =>
              actual === wanted ||
              actual.startsWith(
                `${wanted}.`
              )
          )
      );

    if (matched) {
      return {
        key: activity,
        label: config.label
      };
    }
  }

  return null;
}

function getTaggedPrice(properties) {
  const candidates = [
    properties.price,
    properties.charge,
    properties.fee,
    properties.datasource?.raw?.price
  ];

  for (
    const candidate of candidates
  ) {
    if (
      candidate === null ||
      candidate === undefined
    ) {
      continue;
    }

    const text =
      String(candidate);

    const match =
      text.match(
        /(?:₹|INR|Rs\.?\s*)\s*([\d,]+(?:\.\d+)?)/i
      );

    if (match) {
      const amount =
        Number(
          match[1].replace(
            /,/g,
            ''
          )
        );

      if (
        Number.isFinite(amount)
      ) {
        return amount;
      }
    }

    if (
      /^\s*\d+(?:\.\d+)?\s*$/.test(
        text
      )
    ) {
      const amount =
        Number(text);

      if (
        Number.isFinite(amount)
      ) {
        return amount;
      }
    }
  }

  return null;
}

function estimateAverageSpend(
  activity,
  preferences,
  taggedPrice
) {
  if (
    Number.isFinite(taggedPrice) &&
    taggedPrice >= 0
  ) {
    return {
      amount:
        Math.round(taggedPrice),
      basis:
        'mapped price information'
    };
  }

  const share =
    AVERAGE_SPEND_SHARES[
      activity
    ] || 0.4;

  const rawAmount =
    preferences.budgetRupees *
    share;

  const amount =
    Math.max(
      0,
      Math.round(
        rawAmount / 50
      ) * 50
    );

  return {
    amount,
    basis:
      'planning estimate from your selected budget'
  };
}

function getBudgetNote(
  properties,
  taggedPrice
) {
  const fee =
    String(
      properties.fee || ''
    ).toLowerCase();

  const charge =
    String(
      properties.charge || ''
    ).toLowerCase();

  if (
    fee === 'no' ||
    charge === 'no' ||
    charge === 'free'
  ) {
    return 'No entry fee tagged';
  }

  if (
    Number.isFinite(taggedPrice)
  ) {
    return `Map lists a ₹${new Intl.NumberFormat(
      'en-IN'
    ).format(
      taggedPrice
    )} charge`;
  }

  if (
    fee === 'yes' ||
    charge
  ) {
    return 'Fee tagged; amount not listed';
  }

  return 'Price not listed';
}

function normaliseWebsite(value) {
  const website =
    String(value || '').trim();

  if (!website) {
    return '';
  }

  if (
    website.startsWith(
      'https://'
    ) ||
    website.startsWith(
      'http://'
    )
  ) {
    return website;
  }

  return `https://${website}`;
}

function formatGeoapifyPlace(
  feature,
  center,
  activities,
  preferences
) {
  if (
    !feature?.geometry ||
    !Array.isArray(
      feature.geometry.coordinates
    )
  ) {
    return null;
  }

  const properties =
    feature.properties || {};

  const name =
    getPlaceName(properties);

  if (!name) {
    return null;
  }

  if (
    isRoadLikePlaceName(name)
  ) {
    return null;
  }

  const category =
    getCategoryForPlace(
      properties,
      activities
    );

  if (!category) {
    return null;
  }

  const longitude =
    Number(
      feature.geometry.coordinates[0]
    );

  const latitude =
    Number(
      feature.geometry.coordinates[1]
    );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const address =
    getPlaceAddress(properties);

  const distanceKm =
    calculateDistanceKm(
      center.latitude,
      center.longitude,
      latitude,
      longitude
    );

  const taggedPrice =
    getTaggedPrice(properties);

  const spend =
    estimateAverageSpend(
      category.key,
      preferences,
      taggedPrice
    );

  return {
    id:
      properties.place_id ||
      feature.id ||
      `${latitude}-${longitude}-${name}`,

    name,

    category:
      category.label,

    address,

    latitude,
    longitude,

    distanceKm:
      Math.round(
        distanceKm * 100
      ) / 100,

    _exactDistanceKm:
      distanceKm,

    mapsUrl:
      buildGoogleMapsUrl(
        {
          name,
          address
        },
        center.displayName
      ),

    website:
      normaliseWebsite(
        properties.website
      ),

    phone:
      properties.contact?.phone ||
      properties.phone ||
      '',

    openingHours:
      properties.opening_hours ||
      '',

    averageSpendRupees:
      Number.isFinite(
        spend.amount
      )
        ? spend.amount
        : 0,

    averageSpendBasis:
      spend.basis,

    budgetNote:
      getBudgetNote(
        properties,
        taggedPrice
      ),

    detail:
      properties.cuisine
        ? `Cuisine: ${String(
            properties.cuisine
          ).replace(
            /;/g,
            ', '
          )}`
        : '',

    wheelchair:
      properties.wheelchair === true ||
      properties.wheelchair === 'yes',

    transitDistanceKm: null
  };
}

/*
 * ------------------------------------------------------------
 * GEOAPIFY PLACE SEARCH
 * ------------------------------------------------------------
 *
 * Radius is ALWAYS a maximum distance.
 *
 * 1 km  -> 0 to 1 km
 * 3 km  -> 0 to 3 km
 * 5 km  -> 0 to 5 km
 * 10 km -> 0 to 10 km
 * 25 km -> 0 to 25 km
 * 50 km -> 0 to 50 km
 */

async function queryGeoapifyPlaces(
  center,
  activities,
  radiusKm,
  limit = 200
) {
  const apiKey =
    getGeoapifyApiKey();

  if (!apiKey) {
    throw serviceError(
      'Merlin place search is not configured. GEOAPIFY_API_KEY is missing in Render.',
      500
    );
  }

  const categories = [
    ...new Set(
      activities.flatMap(
        (activity) =>
          ACTIVITY_CONFIG[
            activity
          ]?.categories || []
      )
    )
  ];

  if (!categories.length) {
    throw serviceError(
      'Choose at least one activity.',
      400
    );
  }

  const searchRadiusKm =
    Number(radiusKm);

  if (
    !Number.isFinite(
      searchRadiusKm
    ) ||
    searchRadiusKm <= 0
  ) {
    throw serviceError(
      'Merlin received an invalid search radius.',
      400
    );
  }

  const safeCategories =
    categories.slice(0, 100);

  const searchCenters = [
    {
      latitude: center.latitude,
      longitude: center.longitude,
      label: 'center'
    }
  ];

  /*
   * Larger searches use overlapping
   * discovery circles.
   *
   * These circles are only for finding
   * candidates.
   *
   * The FINAL exact radius check below
   * still enforces the user's selected
   * maximum distance.
   */
  if (searchRadiusKm >= 10) {
    const offsetKm =
      searchRadiusKm * 0.55;

    const latDegreesPerKm =
      1 / 111.32;

    const longitudeDegreesPerKm =
      1 /
      (
        111.32 *
        Math.max(
          0.2,
          Math.cos(
            center.latitude *
              Math.PI /
              180
          )
        )
      );

    const offsets = [
      [0, 1, 'north'],
      [0, -1, 'south'],
      [1, 0, 'east'],
      [-1, 0, 'west']
    ];

    for (
      const [
        longitudeDirection,
        latitudeDirection,
        label
      ] of offsets
    ) {
      searchCenters.push({
        latitude:
          center.latitude +
          latitudeDirection *
            offsetKm *
            latDegreesPerKm,

        longitude:
          center.longitude +
          longitudeDirection *
            offsetKm *
            longitudeDegreesPerKm,

        label
      });
    }
  }

  const subSearchRadiusKm =
    searchRadiusKm >= 10
      ? Math.max(
          1,
          searchRadiusKm * 0.70
        )
      : searchRadiusKm;

  const perSearchLimit =
    searchRadiusKm >= 25
      ? 100
      : 80;

  const allFeatures = [];

  for (
    const searchCenter of
      searchCenters
  ) {
    const radiusMeters =
      Math.max(
        1,
        Math.round(
          subSearchRadiusKm *
            1000
        )
      );

    const url = new URL(
      GEOAPIFY_PLACES_URL
    );

    url.searchParams.set(
      'apiKey',
      apiKey
    );

    url.searchParams.set(
      'categories',
      safeCategories.join(',')
    );

    url.searchParams.set(
      'filter',
      `circle:${searchCenter.longitude},${searchCenter.latitude},${radiusMeters}`
    );

    url.searchParams.set(
      'bias',
      `proximity:${searchCenter.longitude},${searchCenter.latitude}`
    );

    url.searchParams.set(
      'limit',
      String(
        Math.min(
          100,
          Math.max(
            20,
            perSearchLimit
          )
        )
      )
    );

    url.searchParams.set(
      'lang',
      'en'
    );

    console.log(
      'Merlin Geoapify search:',
      JSON.stringify({
        searchArea:
          searchCenter.label,

        originalRadiusKm:
          searchRadiusKm,

        candidateRadiusKm:
          subSearchRadiusKm,

        latitude:
          searchCenter.latitude,

        longitude:
          searchCenter.longitude
      })
    );

    let response;

    try {
      response =
        await fetch(
          url,
          {
            headers: {
              'User-Agent':
                'MerlinOutingPlanner/1.0',

              Accept:
                'application/json'
            },

            signal:
              AbortSignal.timeout(
                20000
              )
          }
        );
    } catch (error) {
      console.error(
        'Geoapify connection error:',
        error.message
      );

      throw serviceError(
        'Merlin could not reach the place-search service. Please try again.',
        503
      );
    }

    const responseText =
      await response.text();

    if (!response.ok) {
      console.error(
        'Geoapify error:',
        response.status,
        responseText
      );

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        throw serviceError(
          'Merlin place search authorization failed. Check the GEOAPIFY_API_KEY in Render.',
          502
        );
      }

      if (
        response.status === 429
      ) {
        throw serviceError(
          'Merlin has temporarily reached the place-search request limit. Please try again later.',
          429
        );
      }

      if (
        response.status >= 500
      ) {
        throw serviceError(
          'The place-search service is temporarily unavailable. Please try again.',
          503
        );
      }

      throw serviceError(
        `Geoapify rejected the place-search request (HTTP ${response.status}).`,
        502
      );
    }

    let data;

    try {
      data =
        JSON.parse(
          responseText
        );
    } catch {
      throw serviceError(
        'The place-search service returned an invalid response.',
        502
      );
    }

    if (
      !data ||
      !Array.isArray(
        data.features
      )
    ) {
      throw serviceError(
        'The place-search service returned an unexpected response.',
        502
      );
    }

    console.log(
      `Merlin ${searchCenter.label} search returned ${data.features.length} features.`
    );

    allFeatures.push(
      ...data.features
    );
  }

  const uniqueFeatures = [];
  const featureIds = new Set();

  for (
    const feature of
      allFeatures
  ) {
    const id =
      feature?.properties
        ?.place_id ||
      feature?.id;

    if (
      id &&
      featureIds.has(id)
    ) {
      continue;
    }

    if (id) {
      featureIds.add(id);
    }

    uniqueFeatures.push(
      feature
    );
  }

  console.log(
    `Merlin collected ${uniqueFeatures.length} unique Geoapify candidates across ${searchCenters.length} spatial searches.`
  );

  return {
    type:
      'FeatureCollection',

    features:
      uniqueFeatures
  };
}

/*
 * ------------------------------------------------------------
 * DEDUPLICATION
 * ------------------------------------------------------------
 */

function deduplicatePlaces(places) {
  const unique = [];

  for (
    const place of places
  ) {
    const normalizedName =
      place.name
        .toLowerCase()
        .replace(
          /[^a-z0-9]+/g,
          ' '
        )
        .trim();

    const duplicate =
      unique.some(
        (existing) => {
          const existingName =
            existing.name
              .toLowerCase()
              .replace(
                /[^a-z0-9]+/g,
                ' '
              )
              .trim();

          if (
            existingName !==
            normalizedName
          ) {
            return false;
          }

          return (
            calculateDistanceKm(
              existing.latitude,
              existing.longitude,
              place.latitude,
              place.longitude
            ) < 0.08
          );
        }
      );

    if (!duplicate) {
      unique.push(place);
    }
  }

  return unique;
}

/*
 * ------------------------------------------------------------
 * RANKING
 * ------------------------------------------------------------
 */

function rankPlaces(
  places,
  preferences
) {
  return places
    .map((place) => {
      let score = 0;

      const radius =
        Math.max(
          0.1,
          preferences.radiusKm
        );

      const distanceScore =
        1 -
        Math.min(
          1,
          place.distanceKm /
            radius
        );

      /*
       * Distance is useful, but it should
       * NOT completely dominate large
       * radius searches.
       */
      score +=
        distanceScore * 1.5;

      if (
        place.averageSpendRupees <=
        preferences.budgetRupees
      ) {
        score += 3;
      } else {
        score -= 1;
      }

      if (
        preferences.transport ===
          'walk' &&
        place.distanceKm <= 2
      ) {
        score += 2;
      }

      if (
        preferences.transport ===
          'transit' &&
        place.distanceKm <= 10
      ) {
        score += 1;
      }

      if (
        preferences.transport ===
        'drive'
      ) {
        score += Math.min(
          1,
          place.distanceKm / 10
        );
      }

      if (
        preferences.companions ===
          'kids' &&
        /family|park|zoo|aquarium|activity|cinema/i.test(
          place.category
        )
      ) {
        score += 2;
      }

      return {
        ...place,
        _score: score
      };
    })
    .sort(
      (a, b) =>
        b._score -
          a._score ||
        a.distanceKm -
          b.distanceKm
    );
}

/*
 * ------------------------------------------------------------
 * RADIUS-AWARE FINAL SELECTION
 * ------------------------------------------------------------
 *
 * The selected radius is a MAXIMUM.
 *
 * We do not force results toward the
 * outside edge of the radius.
 */

function selectRadiusAwarePlaces(
  places,
  radiusKm,
  maximumResults = 20
) {
  const radius =
    Number(radiusKm);

  const validPlaces =
    places.filter(
      (place) =>
        place &&
        Number.isFinite(
          place._exactDistanceKm
        ) &&
        place._exactDistanceKm <=
          radius + 0.000001
    );

  if (
    validPlaces.length <=
    maximumResults
  ) {
    return validPlaces;
  }

  if (radius <= 5) {
    return validPlaces.slice(
      0,
      maximumResults
    );
  }

  const selected = [];

  const remaining =
    [...validPlaces];

  while (
    selected.length <
      maximumResults &&
    remaining.length
  ) {
    let bestIndex = 0;
    let bestScore =
      -Infinity;

    for (
      let i = 0;
      i < remaining.length;
      i++
    ) {
      const candidate =
        remaining[i];

      const normalizedDistance =
        Math.min(
          1,
          candidate._exactDistanceKm /
            Math.max(
              0.1,
              radius
            )
        );

      let coverageBonus = 0;

      if (radius >= 10) {
        coverageBonus =
          normalizedDistance *
          1.25;
      }

      let separationBonus = 0;

      if (selected.length) {
        let nearestSelectedDistance =
          Infinity;

        for (
          const chosen of selected
        ) {
          const distance =
            calculateDistanceKm(
              chosen.latitude,
              chosen.longitude,
              candidate.latitude,
              candidate.longitude
            );

          if (
            distance <
            nearestSelectedDistance
          ) {
            nearestSelectedDistance =
              distance;
          }
        }

        const separationScale =
          Math.max(
            1,
            radius * 0.20
          );

        separationBonus =
          Math.min(
            1,
            nearestSelectedDistance /
              separationScale
          ) *
          1.75;
      }

      const combinedScore =
        candidate._score +
        coverageBonus +
        separationBonus;

      if (
        combinedScore >
        bestScore
      ) {
        bestScore =
          combinedScore;

        bestIndex = i;
      }
    }

    selected.push(
      remaining[bestIndex]
    );

    remaining.splice(
      bestIndex,
      1
    );
  }

  return selected;
}

/*
 * ------------------------------------------------------------
 * TRAVEL ESTIMATES
 * ------------------------------------------------------------
 */

function buildTravelEstimates(
  distanceKm,
  isIndiaRoute,
  perTravelerBudget
) {
  if (
    !Number.isFinite(
      distanceKm
    ) ||
    distanceKm < 0
  ) {
    return [];
  }

  const roundToFifty =
    (amount) =>
      Math.round(
        amount / 50
      ) * 50;

  const estimate =
    (low, high) => ({
      lowRupees:
        roundToFifty(low),

      highRupees:
        roundToFifty(high)
    });

  const modes =
    isIndiaRoute
      ? [
          {
            mode: 'Bus',
            ...estimate(
              Math.max(
                30,
                distanceKm * 1.5
              ),
              Math.max(
                80,
                distanceKm * 4
              )
            )
          },

          {
            mode: 'Train',
            ...estimate(
              Math.max(
                50,
                distanceKm * 2
              ),
              Math.max(
                150,
                distanceKm * 5
              )
            )
          },

          {
            mode: 'Car or cab',
            ...estimate(
              Math.max(
                100,
                distanceKm * 10
              ),
              Math.max(
                250,
                distanceKm * 20
              )
            )
          },

          {
            mode: 'Flight',
            ...estimate(
              2500 +
                distanceKm * 3,
              5000 +
                distanceKm * 8
            ),
            available:
              distanceKm >= 250
          }
        ]
      : [
          {
            mode: 'Bus',
            ...estimate(
              Math.max(
                1500,
                distanceKm * 5
              ),
              Math.max(
                3500,
                distanceKm * 12
              )
            )
          },

          {
            mode: 'Train',
            ...estimate(
              Math.max(
                2500,
                distanceKm * 10
              ),
              Math.max(
                8000,
                distanceKm * 25
              )
            )
          },

          {
            mode: 'Car or cab',
            ...estimate(
              Math.max(
                3000,
                distanceKm * 15
              ),
              Math.max(
                9000,
                distanceKm * 30
              )
            )
          },

          {
            mode: 'Flight',
            ...estimate(
              6000 +
                distanceKm * 10,
              15000 +
                distanceKm * 30
            ),
            available:
              distanceKm >= 250
          }
        ];

  if (
    distanceKm <= 10
  ) {
    modes.unshift({
      mode: 'Walk',
      lowRupees: 0,
      highRupees: 0,
      available: true
    });
  }

  return modes.map(
    (mode) => ({
      ...mode,

      available:
        mode.available ??
        true,

      withinBudget:
        perTravelerBudget === null
          ? null
          : mode.highRupees <=
            perTravelerBudget
    })
  );
}

export function estimateTripTravelModes(
  distanceKm,
  isIndiaRoute = true
) {
  return buildTravelEstimates(
    distanceKm,
    isIndiaRoute,
    null
  );
}

/*
 * ------------------------------------------------------------
 * MAIN PLACE SEARCH
 * ------------------------------------------------------------
 */

export async function searchNearbyPlaces(
  input = {}
) {
  const preferences =
    normalizePlacePreferences(
      input
    );

  if (
    !preferences.location &&
    !preferences.coordinates
  ) {
    throw serviceError(
      'Enter a location or allow Merlin to use your live location.',
      400
    );
  }

  if (
    !preferences.activities.length
  ) {
    throw serviceError(
      'Choose at least one activity.',
      400
    );
  }

  let center;

  let usingLiveLocation =
    false;

  /*
   * --------------------------------------------------------
   * DESTINATION / SEARCH LOCATION
   * --------------------------------------------------------
   */

  if (
    preferences.locationMode ===
    'live'
  ) {
    if (
      !preferences.coordinates
    ) {
      throw serviceError(
        'Merlin could not access your live location. Choose Enter a location instead.',
        400
      );
    }

    usingLiveLocation = true;

    center = {
      latitude:
        preferences.coordinates
          .latitude,

      longitude:
        preferences.coordinates
          .longitude,

      countryCode: '',

      displayName:
        'Your current location',

      source:
        'Browser geolocation'
    };

    console.log(
      `Merlin live-location search: ${center.latitude}, ${center.longitude} within ${preferences.radiusKm} km`
    );
  } else {
    /*
     * MANUAL DESTINATION
     *
     * This is the destination field,
     * NOT the trip origin.
     */
    center =
      await geocodeLocation(
        preferences.location
      );

    console.log(
      'Merlin destination resolved:',
      JSON.stringify({
        requested:
          preferences.location,

        resolved:
          center.displayName,

        latitude:
          center.latitude,

        longitude:
          center.longitude,

        countryCode:
          center.countryCode,

        source:
          center.source
      })
    );
  }

  /*
   * --------------------------------------------------------
   * TRIP ORIGIN
   * --------------------------------------------------------
   *
   * The origin is only used for
   * calculating travel distance.
   *
   * It NEVER controls the place search.
   */

  let originCenter = null;

  let warning = '';

  if (
    preferences.origin
  ) {
    try {
      originCenter =
        await geocodeLocation(
          preferences.origin
        );

      console.log(
        'Merlin trip origin resolved:',
        JSON.stringify({
          requested:
            preferences.origin,

          resolved:
            originCenter.displayName,

          latitude:
            originCenter.latitude,

          longitude:
            originCenter.longitude,

          countryCode:
            originCenter.countryCode,

          source:
            originCenter.source
        })
      );
    } catch (error) {
      console.warn(
        'Merlin could not geocode trip origin:',
        error.message
      );

      warning =
        'Merlin could not locate the trip origin, so travel estimates are unavailable.';
    }
  }

  /*
   * --------------------------------------------------------
   * PLACE SEARCH
   * --------------------------------------------------------
   *
   * VERY IMPORTANT:
   *
   * Geoapify receives `center`, which is
   * the DESTINATION.
   *
   * It does NOT receive originCenter.
   *
   * Therefore:
   *
   * Goa -> London
   *
   * searches places around London.
   *
   * Goa is only used for travel-distance
   * calculations.
   */

  const geoapifyData =
    await queryGeoapifyPlaces(
      center,
      preferences.activities,
      preferences.radiusKm,
      200
    );

  /*
   * --------------------------------------------------------
   * FORMAT + FILTER
   * --------------------------------------------------------
   */

  let places =
    geoapifyData.features
      .map(
        (feature) =>
          formatGeoapifyPlace(
            feature,
            center,
            preferences.activities,
            preferences
          )
      )
      .filter(Boolean)
      .filter(
        (place) =>
          Number.isFinite(
            place._exactDistanceKm
          ) &&
          place._exactDistanceKm <=
            preferences.radiusKm +
              0.000001
      );

  console.log(
    `Merlin kept ${places.length} valid named places after category, road, and distance filtering.`
  );

  places =
    deduplicatePlaces(
      places
    );

  places =
    rankPlaces(
      places,
      preferences
    );

  /*
   * --------------------------------------------------------
   * FINAL 20
   * --------------------------------------------------------
   */

  const finalPlaces =
    selectRadiusAwarePlaces(
      places,
      preferences.radiusKm,
      20
    ).map(
      ({
        _exactDistanceKm,
        _score,
        ...place
      }) => place
    );

  console.log(
    `Merlin selected ${finalPlaces.length} final places within ${preferences.radiusKm} km of ${center.displayName}.`
  );

  /*
   * --------------------------------------------------------
   * TRAVEL DISTANCE
   * --------------------------------------------------------
   */

  const travelDistanceKm =
    originCenter
      ? calculateDistanceKm(
          originCenter.latitude,
          originCenter.longitude,
          center.latitude,
          center.longitude
        )
      : null;

  const perTravelerBudget =
    preferences.totalBudgetRupees ===
    null
      ? null
      : preferences.totalBudgetRupees /
        preferences.partySize;

  const isIndiaRoute =
    originCenter?.countryCode ===
      'in' ||
    center.countryCode ===
      'in' ||
    /india/i.test(
      center.displayName
    ) ||
    usingLiveLocation;

  const travelEstimates =
    travelDistanceKm === null
      ? []
      : buildTravelEstimates(
          travelDistanceKm,
          isIndiaRoute,
          perTravelerBudget
        );

  /*
   * --------------------------------------------------------
   * AVERAGE SPEND
   * --------------------------------------------------------
   */

  const averageSpend =
    finalPlaces.length
      ? Math.round(
          finalPlaces.reduce(
            (
              total,
              place
            ) =>
              total +
              (
                Number.isFinite(
                  place.averageSpendRupees
                )
                  ? place.averageSpendRupees
                  : 0
              ),
            0
          ) /
            finalPlaces.length /
            50
        ) * 50
      : null;

  /*
   * --------------------------------------------------------
   * RESPONSE
   * --------------------------------------------------------
   */

  return {
    location:
      center.displayName,

    origin:
      originCenter?.displayName ||
      preferences.origin ||
      center.displayName,

    radiusKm:
      preferences.radiusKm,

    suggestions:
      finalPlaces,

    attribution:
      'Place data © Geoapify contributors and OpenStreetMap contributors.',

    totalBudgetRupees:
      preferences.totalBudgetRupees,

    partySize:
      preferences.partySize,

    tripDays:
      preferences.tripDays,

    budgetPerPersonPerDayRupees:
      preferences.budgetMode ===
      'trip'
        ? preferences.budgetRupees
        : null,

    travelEstimateRegion:
      isIndiaRoute
        ? 'India-based'
        : 'international',

    travelDistanceKm:
      travelDistanceKm === null
        ? null
        : Math.round(
            travelDistanceKm
          ),

    travelEstimates,

    averageEstimatedSpendRupees:
      Number.isFinite(
        averageSpend
      )
        ? averageSpend
        : null,

    warning,

    source:
      usingLiveLocation
        ? 'Geoapify + browser location'
        : 'Geoapify'
  };
}
