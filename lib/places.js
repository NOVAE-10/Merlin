const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  'MerlinOutingPlanner/1.0';

const GEOAPIFY_PLACES_URL =
  'https://api.geoapify.com/v2/places';

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

function buildGoogleMapsUrl(place, location = '') {
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

async function geocodeWithNominatim(query) {
  const url = new URL(
    'https://nominatim.openstreetmap.org/search'
  );

  url.searchParams.set(
    'format',
    'jsonv2'
  );

  url.searchParams.set(
    'limit',
    '1'
  );

  url.searchParams.set(
    'addressdetails',
    '1'
  );

  url.searchParams.set(
    'q',
    query
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

  const result = data[0];

  return {
    latitude: Number(result.lat),
    longitude: Number(result.lon),

    countryCode:
      String(
        result.address?.country_code || ''
      ).toLowerCase(),

    displayName:
      result.display_name || query,

    source: 'Nominatim'
  };
}

async function geocodeWithArcGIS(query) {
  const url = new URL(
    'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates'
  );

  url.searchParams.set(
    'SingleLine',
    query
  );

  url.searchParams.set(
    'f',
    'json'
  );

  url.searchParams.set(
    'maxLocations',
    '1'
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

  const candidate =
    data?.candidates?.[0];

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
    countryCode: '',
    displayName:
      candidate.address || query,
    source: 'ArcGIS'
  };
}

async function geocodeLocation(location) {
  const query =
    String(location || '').trim();

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
    return geocodeCache.get(
      cacheKey
    );
  }

  try {
    const result =
      await geocodeWithNominatim(
        query
      );

    geocodeCache.set(
      cacheKey,
      result
    );

    return result;
  } catch (error) {
    console.warn(
      'Nominatim failed:',
      error.message
    );
  }

  try {
    const result =
      await geocodeWithArcGIS(
        query
      );

    geocodeCache.set(
      cacheKey,
      result
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
 * SEARCH AREA
 *
 * The selected radius is ALWAYS a maximum radius.
 *
 * 1 km  -> 0 to 1 km
 * 3 km  -> 0 to 3 km
 * 5 km  -> 0 to 5 km
 * 10 km -> 0 to 10 km
 * 25 km -> 0 to 25 km
 * 50 km -> 0 to 50 km
 *
 * Larger searches use several overlapping
 * search circles so Geoapify can discover
 * places in different parts of the area.
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
   * For larger radii, search a wider grid.
   *
   * This is NOT a distance-band system.
   * It only helps discovery.
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

  /*
   * For 50 km, the sub-searches cover
   * a large portion of the complete area.
   *
   * The ORIGINAL radius is still used
   * later for the final exact-distance filter.
   */
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

    /*
     * Bias discovery toward the current
     * search center. It does NOT alter
     * the final user radius.
     */
    url.searchParams.set(
      'bias',
      `proximity:${searchCenter.longitude},${searchCenter.latitude}`
    );

    url.searchParams.set(
      'limit',
      String(perSearchLimit)
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

  /*
   * Deduplicate raw Geoapify features.
   */
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
 * RANKING
 *
 * Distance is still useful.
 *
 * BUT distance is no longer powerful
 * enough to make a 50 km search behave
 * like a 1 km search.
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
       * IMPORTANT FIX:
       *
       * Old value:
       * distanceScore * 5
       *
       * That strongly favored the nearest
       * places and made 50 km look like
       * a tiny local search.
       *
       * New value:
       * distanceScore * 1.5
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
 * FINAL SELECTION
 *
 * Radius = MAXIMUM distance.
 *
 * 50 km means:
 *
 *     EVERY valid place
 *     from 0 km through 50 km
 *     is eligible.
 *
 * We DO NOT require places to be
 * near 50 km.
 *
 * However, when the search radius is
 * large, we deliberately prevent the
 * first 20 nearest places from taking
 * all the slots.
 *
 * This is geographic diversity,
 * NOT a distance band.
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

  /*
   * For small searches, there is no need
   * to force geographic variety.
   *
   * 1, 3 and 5 km should simply return
   * the best valid places.
   */
  if (radius <= 5) {
    return validPlaces.slice(
      0,
      maximumResults
    );
  }

  /*
   * For 10/25/50 km:
   *
   * Start with the highest-quality place.
   *
   * Then each next place gets:
   *
   *   quality
   *   +
   *   distance coverage
   *   +
   *   separation from already selected places
   *
   * This means a good place 2 km away
   * can still beat a poor place 45 km away.
   *
   * But equally good places that are spread
   * around the larger search area can be
   * selected instead of 20 places sitting
   * beside each other.
   */
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

      /*
       * This is a SMALL coverage bonus.
       *
       * It never forces a place to be
       * near the outer edge.
       */
      let coverageBonus = 0;

      if (radius >= 10) {
        coverageBonus =
          normalizedDistance *
          1.25;
      }

      /*
       * Measure how far this candidate
       * is from the places already selected.
       */
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

        /*
         * Normalize separation.
         *
         * Larger search radius =
         * larger useful separation.
         */
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
   * LIVE LOCATION
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
     * MANUAL LOCATION
     */
    center =
      await geocodeLocation(
        preferences.location
      );

    console.log(
      `Merlin manual-location search: "${preferences.location}" -> ${center.latitude}, ${center.longitude}`
    );
  }

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
    } catch {
      warning =
        'Merlin could not locate the trip origin, so travel estimates are unavailable.';
    }
  }

  /*
   * SEARCH GEOAPIFY
   */
  const geoapifyData =
    await queryGeoapifyPlaces(
      center,
      preferences.activities,
      preferences.radiusKm,
      200
    );

  /*
   * Convert Geoapify features into
   * Merlin places.
   *
   * This also:
   *
   * - rejects unnamed features
   * - rejects roads
   * - rejects wrong categories
   * - calculates exact distance
   * - enforces the ORIGINAL radius
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

  /*
   * Remove duplicates.
   */
  places =
    deduplicatePlaces(
      places
    );

  /*
   * Rank by quality.
   */
  places =
    rankPlaces(
      places,
      preferences
    );

  /*
   * Select final 20.
   *
   * IMPORTANT:
   *
   * This is where the radius bug
   * was previously happening.
   *
   * The old version simply did:
   *
   *     places.slice(0, 20)
   *
   * after heavily rewarding proximity.
   *
   * The new version allows larger
   * radius searches to use the larger
   * candidate pool.
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
    `Merlin selected ${finalPlaces.length} final places within ${preferences.radiusKm} km.`
  );

  /*
   * TRAVEL DISTANCE
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
   * AVERAGE SPEND
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
