const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || 'MerlinOutingPlanner/1.0';

const GEOAPIFY_API_KEY =
  process.env.GEOAPIFY_API_KEY || '';

const GEOAPIFY_PLACES_URL =
  'https://api.geoapify.com/v2/places';

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
      'leisure.garden',
      'leisure.nature_reserve'
    ]
  },

  culture: {
    label: 'Arts and culture',
    categories: [
      'entertainment.museum',
      'entertainment.gallery',
      'tourism.attraction',
      'tourism.sights',
      'historic'
    ]
  },

  shopping: {
    label: 'Shopping',
    categories: [
      'commercial.shopping_mall',
      'commercial.department_store',
      'commercial.supermarket',
      'commercial.marketplace'
    ]
  },

  family: {
    label: 'Family activities',
    categories: [
      'entertainment.zoo',
      'entertainment.aquarium',
      'entertainment.bowling_alley',
      'entertainment.cinema',
      'entertainment.theme_park',
      'entertainment.water_park',
      'entertainment.activity_park',
      'leisure.playground'
    ]
  },

  active: {
    label: 'Sports and fitness',
    categories: [
      'sport',
      'leisure.sports_centre',
      'leisure.fitness_centre',
      'leisure.swimming_pool'
    ]
  },

  quiet: {
    label: 'Quiet places',
    categories: [
      'education.library',
      'leisure.park',
      'leisure.garden'
    ]
  },

  beach: {
    label: 'Beaches and waterfront',
    categories: [
      'natural.beach',
      'leisure.beach_resort'
    ]
  },

  nightlife: {
    label: 'Nightlife',
    categories: [
      'catering.bar',
      'catering.pub',
      'entertainment.nightclub'
    ]
  },

  wellness: {
    label: 'Wellness',
    categories: [
      'service.beauty',
      'commercial.hairdresser',
      'leisure.spa',
      'leisure.sauna'
    ]
  },

  stay: {
    label: 'Hotels and stays',
    categories: [
      'accommodation.hotel',
      'accommodation.hostel',
      'accommodation.motel',
      'accommodation.guest_house',
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

  shopping: 'shopping',
  shop: 'shopping',
  shops: 'shopping',
  mall: 'shopping',
  malls: 'shopping',

  salon: 'wellness',
  salons: 'wellness',
  beauty: 'wellness',
  spa: 'wellness',

  library: 'quiet',
  libraries: 'quiet',
  reading: 'quiet',
  study: 'quiet',

  amusement: 'family',
  'amusement park': 'family',
  'theme park': 'family',
  zoo: 'family',
  aquarium: 'family',

  park: 'nature',
  parks: 'nature',
  garden: 'nature',
  gardens: 'nature',

  family: 'family',
  friends: 'family',

  culture: 'culture',
  museum: 'culture',
  museums: 'culture',

  active: 'active',
  fitness: 'active',
  sports: 'active',

  beach: 'beach',
  beaches: 'beach',

  nightlife: 'nightlife',
  nightclubs: 'nightlife',

  stay: 'stay',
  hotel: 'stay',
  hotels: 'stay'
};

const ALLOWED_RADII = new Set([1, 3, 5, 10, 25, 50]);

const AVERAGE_SPEND_SHARES = {
  food: 0.55,
  nature: 0.2,
  culture: 0.3,
  shopping: 0.65,
  family: 0.4,
  active: 0.45,
  quiet: 0.1,
  beach: 0.25,
  nightlife: 0.7,
  wellness: 0.65,
  stay: 0.35
};

const geocodeCache = new Map();

function serviceError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normaliseActivity(activity) {
  const value = String(activity || '').trim().toLowerCase();
  return ACTIVITY_ALIASES[value] || null;
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
        .flatMap((value) => String(value || '').split(','))
        .map(normaliseActivity)
        .filter(Boolean)
    )
  ].slice(0, 3);
}

function normalisePreferences(input = {}) {
  const activities = normaliseActivities(input);

  const radiusValue = Number(input.radiusKm);

  const radiusKm = ALLOWED_RADII.has(radiusValue)
    ? radiusValue
    : 50;

  const requestedBudget = Number(input.budgetRupees);

  const budgetRupees = Number.isFinite(requestedBudget)
    ? Math.max(300, Math.min(10000, Math.round(requestedBudget)))
    : 3000;

  const partySize = Math.max(
    1,
    Math.min(50, Math.floor(Number(input.partySize) || 1))
  );

  const tripDays = Math.max(
    1,
    Math.min(365, Math.floor(Number(input.tripDays) || 1))
  );

  const tripBudget =
    input.budgetMode === 'trip';

  const totalBudgetRupees = tripBudget
    ? Math.max(
        0,
        Number.isFinite(requestedBudget)
          ? Math.min(1000000000, requestedBudget)
          : 3000
      )
    : null;

  const accommodation = String(
    input.accommodation || ''
  ).trim().toLowerCase();

  return {
    activities,
    location: String(input.location || '').trim().slice(0, 160),
    radiusKm,
    budgetRupees: tripBudget
      ? Math.max(
          0,
          Math.round(
            totalBudgetRupees /
              partySize /
              tripDays
          )
        )
      : budgetRupees,
    totalBudgetRupees,
    budgetMode: tripBudget
      ? 'trip'
      : 'per-person',
    partySize,
    tripDays,
    accommodation,
    origin: String(input.origin || '').trim().slice(0, 160),
    companions: String(input.companions || 'friends'),
    transport: ['walk', 'transit', 'drive', 'any'].includes(
      input.transport
    )
      ? input.transport
      : 'any'
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

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export { buildGoogleMapsUrl };

async function geocodeWithNominatim(query) {
  const url = new URL(
    'https://nominatim.openstreetmap.org/search'
  );

  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('q', query);

  const response = await fetch(url, {
    headers: {
      'User-Agent': NOMINATIM_USER_AGENT,
      Accept: 'application/json'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(
      `Nominatim lookup failed with status ${response.status}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data) || !data.length) {
    throw new Error(
      'Nominatim could not find the location.'
    );
  }

  const result = data[0];

  return {
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    countryCode: String(
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

  url.searchParams.set('SingleLine', query);
  url.searchParams.set('f', 'json');
  url.searchParams.set('maxLocations', '1');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MerlinOutingPlanner/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(
      `ArcGIS lookup failed with status ${response.status}`
    );
  }

  const data = await response.json();

  if (
    !data ||
    !Array.isArray(data.candidates) ||
    !data.candidates.length
  ) {
    throw new Error(
      'ArcGIS could not find the location.'
    );
  }

  const result = data.candidates[0];

  if (
    !result.location ||
    !Number.isFinite(Number(result.location.x)) ||
    !Number.isFinite(Number(result.location.y))
  ) {
    throw new Error(
      'ArcGIS returned invalid coordinates.'
    );
  }

  return {
    latitude: Number(result.location.y),
    longitude: Number(result.location.x),
    countryCode: '',
    displayName: result.address || query,
    source: 'ArcGIS'
  };
}

async function geocodeLocation(location) {
  const query = String(location || '').trim();

  if (!query) {
    throw serviceError(
      'Enter a city, neighborhood, or postal code.',
      400
    );
  }

  const cacheKey = query.toLowerCase();

  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  try {
    const result =
      await geocodeWithNominatim(query);

    console.log(
      `Location "${query}" found using ${result.source}.`
    );

    geocodeCache.set(cacheKey, result);

    return result;
  } catch (nominatimError) {
    console.warn(
      `Nominatim failed for "${query}":`,
      nominatimError.message
    );
  }

  try {
    const result =
      await geocodeWithArcGIS(query);

    console.log(
      `Location "${query}" found using ${result.source}.`
    );

    geocodeCache.set(cacheKey, result);

    return result;
  } catch (arcgisError) {
    console.error(
      `ArcGIS fallback failed for "${query}":`,
      arcgisError.message
    );

    throw serviceError(
      'Merlin could not find that area. Try a nearby city or neighborhood.'
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
    (latitude1 * Math.PI) / 180;

  const lat2 =
    (latitude2 * Math.PI) / 180;

  const deltaLat =
    ((latitude2 - latitude1) * Math.PI) / 180;

  const deltaLon =
    ((longitude2 - longitude1) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLon / 2) ** 2;

  const c =
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a)
    );

  return earthRadiusKm * c;
}

function getPlaceName(properties) {
  return String(
    properties.name ||
      properties.address_line1 ||
      properties.formatted ||
      'Unnamed place'
  ).trim();
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

function getCategoryForPlace(properties, activities) {
  const categories = Array.isArray(
    properties.categories
  )
    ? properties.categories
    : [];

  for (const activity of activities) {
    const config = ACTIVITY_CONFIG[activity];

    if (!config) continue;

    if (
      config.categories.some((category) =>
        categories.some(
          (resultCategory) =>
            resultCategory === category ||
            resultCategory.startsWith(`${category}.`)
        )
      )
    ) {
      return {
        key: activity,
        label: config.label
      };
    }
  }

  return {
    key: activities[0] || 'food',
    label:
      ACTIVITY_CONFIG[activities[0] || 'food']
        ?.label || 'Local place'
  };
}

function getTaggedPrice(properties) {
  const candidates = [
    properties.price,
    properties.charge,
    properties.fee
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) {
      continue;
    }

    const text = String(candidate);

    const match = text.match(
      /(?:₹|INR|Rs\.?\s*)\s*([\d,]+(?:\.\d+)?)/i
    );

    if (match) {
      const amount = Number(
        match[1].replace(/,/g, '')
      );

      if (Number.isFinite(amount)) {
        return amount;
      }
    }

    if (/^\s*\d+(?:\.\d+)?\s*$/.test(text)) {
      const amount = Number(text);

      if (Number.isFinite(amount)) {
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
      amount: Math.round(taggedPrice),
      basis: 'mapped price information'
    };
  }

  const share =
    AVERAGE_SPEND_SHARES[activity] || 0.4;

  const amount =
    preferences.budgetRupees * share;

  const safeAmount = Math.max(
    preferences.budgetMode === 'trip'
      ? 0
      : 50,
    Math.round(amount / 50) * 50
  );

  return {
    amount: Number.isFinite(safeAmount)
      ? safeAmount
      : 0,
    basis:
      'planning estimate from your selected budget'
  };
}

function getBudgetNote(
  properties,
  taggedPrice,
  preferences
) {
  const fee = String(
    properties.fee || ''
  ).toLowerCase();

  const charge = String(
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
    ).format(taggedPrice)} charge`;
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
  const website = String(value || '').trim();

  if (!website) return '';

  if (
    website.startsWith('https://') ||
    website.startsWith('http://')
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
    !feature ||
    !feature.geometry ||
    !Array.isArray(
      feature.geometry.coordinates
    )
  ) {
    return null;
  }

  const properties =
    feature.properties || {};

  const longitude = Number(
    feature.geometry.coordinates[0]
  );

  const latitude = Number(
    feature.geometry.coordinates[1]
  );

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  const name = getPlaceName(properties);

  if (!name || name === 'Unnamed place') {
    return null;
  }

  const distanceKm =
    calculateDistanceKm(
      center.latitude,
      center.longitude,
      latitude,
      longitude
    );

  const category =
    getCategoryForPlace(
      properties,
      activities
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

    address:
      getPlaceAddress(properties),

    latitude,

    longitude,

    distanceKm:
      Math.round(distanceKm * 100) / 100,

    mapsUrl:
      buildGoogleMapsUrl(
        {
          name,
          address:
            getPlaceAddress(properties)
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
      spend.amount,

    averageSpendBasis:
      spend.basis,

    budgetNote:
      getBudgetNote(
        properties,
        taggedPrice,
        preferences
      ),

    detail:
      properties.cuisine
        ? `Cuisine: ${String(
            properties.cuisine
          ).replace(/;/g, ', ')}`
        : '',

    wheelchair:
      properties.wheelchair === true ||
      properties.wheelchair === 'yes' ||
      properties.accessibility?.wheelchair === true,

    transitDistanceKm: null
  };
}

async function queryGeoapifyPlaces(
  center,
  activities,
  radiusKm,
  limit
) {
  if (!GEOAPIFY_API_KEY) {
    throw serviceError(
      'GEOAPIFY_API_KEY is not configured on the server.'
    );
  }

  const categories = [
    ...new Set(
      activities.flatMap(
        (activity) =>
          ACTIVITY_CONFIG[activity]
            ?.categories || []
      )
    )
  ];

  if (!categories.length) {
    throw serviceError(
      'No supported place categories were selected.',
      400
    );
  }

  const url =
    new URL(GEOAPIFY_PLACES_URL);

  url.searchParams.set(
    'apiKey',
    GEOAPIFY_API_KEY
  );

  url.searchParams.set(
    'categories',
    categories.join(',')
  );

  url.searchParams.set(
    'filter',
    `circle:${center.longitude},${center.latitude},${Math.round(radiusKm * 1000)}`
  );

  url.searchParams.set(
    'bias',
    `proximity:${center.longitude},${center.latitude}`
  );

  url.searchParams.set(
    'limit',
    String(limit)
  );

  url.searchParams.set(
    'lang',
    'en'
  );

  console.log(
    `Searching Geoapify for ${activities.join(', ')} within ${radiusKm} km.`
  );

  const response = await fetch(
    url,
    {
      headers: {
        'User-Agent':
          'MerlinOutingPlanner/1.0',
        Accept: 'application/json'
      },
      signal:
        AbortSignal.timeout(20000)
    }
  );

  if (!response.ok) {
    const errorText =
      await response.text();

    console.error(
      `Geoapify request failed with status ${response.status}:`,
      errorText
    );

    throw serviceError(
      `Geoapify request failed with status ${response.status}.`
    );
  }

  const data =
    await response.json();

  if (
    !data ||
    !Array.isArray(data.features)
  ) {
    throw serviceError(
      'Geoapify returned an invalid place response.'
    );
  }

  console.log(
    `Geoapify returned ${data.features.length} places.`
  );

  return data;
}

function deduplicatePlaces(places) {
  const unique = [];
  const seenNames = new Set();

  for (const place of places) {
    const normalizedName =
      place.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const normalizedAddress =
      place.address
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const nameAddressKey =
      `${normalizedName}|${normalizedAddress}`;

    if (seenNames.has(nameAddressKey)) {
      continue;
    }

    const nearbyDuplicate =
      unique.some((existing) => {
        if (
          existing.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim() !== normalizedName
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
      });

    if (nearbyDuplicate) {
      continue;
    }

    seenNames.add(nameAddressKey);
    unique.push(place);
  }

  return unique;
}

function rankPlaces(
  places,
  activities,
  preferences
) {
  const activityCount =
    Math.max(1, activities.length);

  const ranked = places.map((place) => {
    let score = 0;

    const distanceScore =
      1 -
      Math.min(
        1,
        place.distanceKm /
          Math.max(0.1, preferences.radiusKm)
      );

    score += distanceScore * 5;

    if (
      place.averageSpendRupees <=
      preferences.budgetRupees
    ) {
      score += 3;
    } else {
      score -= 1;
    }

    if (
      preferences.transport === 'walk' &&
      place.distanceKm <= 2
    ) {
      score += 2;
    }

    if (
      preferences.companions === 'kids' &&
      /family|park|zoo|aquarium|amusement/i.test(
        place.category
      )
    ) {
      score += 2;
    }

    return {
      ...place,
      _score: score / activityCount
    };
  });

  return ranked.sort(
    (first, second) =>
      second._score - first._score ||
      first.distanceKm - second.distanceKm
  );
}

function buildTravelEstimates(
  distanceKm,
  isIndiaRoute,
  perTravelerBudget
) {
  if (
    !Number.isFinite(distanceKm) ||
    distanceKm < 0
  ) {
    return [];
  }

  const roundToFifty = (amount) =>
    Math.round(amount / 50) * 50;

  const estimate = (
    low,
    high
  ) => ({
    lowRupees:
      roundToFifty(low),
    highRupees:
      roundToFifty(high)
  });

  const modes = isIndiaRoute
    ? [
        {
          mode: 'Bus',
          ...estimate(
            Math.max(30, distanceKm * 1.5),
            Math.max(80, distanceKm * 4)
          )
        },
        {
          mode: 'Train',
          ...estimate(
            Math.max(50, distanceKm * 2),
            Math.max(150, distanceKm * 5)
          )
        },
        {
          mode: 'Car or cab',
          ...estimate(
            Math.max(100, distanceKm * 10),
            Math.max(250, distanceKm * 20)
          )
        },
        {
          mode: 'Flight',
          ...estimate(
            2500 + distanceKm * 3,
            5000 + distanceKm * 8
          ),
          available:
            distanceKm >= 250
        }
      ]
    : [
        {
          mode: 'Bus',
          ...estimate(
            Math.max(1500, distanceKm * 5),
            Math.max(3500, distanceKm * 12)
          )
        },
        {
          mode: 'Train',
          ...estimate(
            Math.max(2500, distanceKm * 10),
            Math.max(8000, distanceKm * 25)
          )
        },
        {
          mode: 'Car or cab',
          ...estimate(
            Math.max(3000, distanceKm * 15),
            Math.max(9000, distanceKm * 30)
          )
        },
        {
          mode: 'Flight',
          ...estimate(
            6000 + distanceKm * 10,
            15000 + distanceKm * 30
          ),
          available:
            distanceKm >= 250
        }
      ];

  if (distanceKm <= 10) {
    modes.unshift({
      mode: 'Walk',
      lowRupees: 0,
      highRupees: 0,
      available: true
    });
  }

  return modes.map((mode) => ({
    ...mode,
    available:
      mode.available ?? true,
    withinBudget:
      perTravelerBudget === null
        ? null
        : mode.highRupees <=
          perTravelerBudget
  }));
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
    normalizePlacePreferences(input);

  if (!preferences.location) {
    throw serviceError(
      'Enter a city, neighborhood, or postal code.',
      400
    );
  }

  if (!preferences.activities.length) {
    throw serviceError(
      'Choose at least one activity.',
      400
    );
  }

  const center =
    await geocodeLocation(
      preferences.location
    );

  let originCenter = null;
  let warning = '';

  if (preferences.origin) {
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

  const geoapifyData =
    await queryGeoapifyPlaces(
      center,
      preferences.activities,
      preferences.radiusKm,
      50
    );

  let places =
    geoapifyData.features
      .map((feature) =>
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
          place.distanceKm <=
          preferences.radiusKm
      );

  places =
    deduplicatePlaces(places);

  places =
    rankPlaces(
      places,
      preferences.activities,
      preferences
    );

  /*
   * Keep the result balanced when multiple
   * activities were selected.
   */
  const selected = [];
  const remaining = [...places];

  for (
    let round = 0;
    selected.length < 20 &&
    remaining.length;
    round += 1
  ) {
    let addedThisRound = false;

    for (
      const activity of preferences.activities
    ) {
      const label =
        ACTIVITY_CONFIG[activity]?.label;

      const index =
        remaining.findIndex(
          (place) =>
            place.category === label
        );

      if (index >= 0) {
        selected.push(
          remaining.splice(index, 1)[0]
        );

        addedThisRound = true;

        if (selected.length >= 20) {
          break;
        }
      }
    }

    if (!addedThisRound) {
      break;
    }
  }

  const finalPlaces =
    selected.length
      ? selected
      : places.slice(0, 20);

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
    preferences.totalBudgetRupees === null
      ? null
      : preferences.totalBudgetRupees /
        preferences.partySize;

  const isIndiaRoute =
    originCenter?.countryCode === 'in' ||
    center.countryCode === 'in';

  const travelEstimates =
    travelDistanceKm === null
      ? []
      : buildTravelEstimates(
          travelDistanceKm,
          isIndiaRoute,
          perTravelerBudget
        );

  const averageSpend =
    finalPlaces.length
      ? Math.round(
          finalPlaces.reduce(
            (total, place) =>
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
      preferences.origin,

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
      preferences.budgetMode === 'trip'
        ? preferences.budgetRupees
        : null,

    travelEstimateRegion:
      isIndiaRoute
        ? 'India-based'
        : 'international',

    travelDistanceKm:
      travelDistanceKm === null
        ? null
        : Math.round(travelDistanceKm),

    travelEstimates,

    averageEstimatedSpendRupees:
      Number.isFinite(averageSpend)
        ? averageSpend
        : null,

    warning,

    source: 'Geoapify'
  };
}
