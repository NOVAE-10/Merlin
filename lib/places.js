const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || 'MerlinOutingPlanner/1.0';

const CATEGORY_CONFIG = {
  food: {
    label: 'Food',
    tags: [
      '["amenity"="restaurant"]',
      '["amenity"="cafe"]',
      '["amenity"="fast_food"]',
      '["amenity"="food_court"]',
      '["amenity"="ice_cream"]'
    ]
  },

  shopping: {
    label: 'Shopping',
    tags: [
      '["shop"]',
      '["shop"="mall"]',
      '["shop"="department_store"]',
      '["shop"="supermarket"]'
    ]
  },

  salon: {
    label: 'Salon',
    tags: [
      '["shop"="hairdresser"]',
      '["shop"="beauty"]',
      '["amenity"="spa"]'
    ]
  },

  library: {
    label: 'Library',
    tags: [
      '["amenity"="library"]'
    ]
  },

  amusement: {
    label: 'Amusement Park',
    tags: [
      '["leisure"="amusement_arcade"]',
      '["tourism"="theme_park"]',
      '["leisure"="water_park"]'
    ]
  },

  park: {
    label: 'Park',
    tags: [
      '["leisure"="park"]',
      '["leisure"="garden"]'
    ]
  },

  family: {
    label: 'Family & Friends',
    tags: [
      '["tourism"="zoo"]',
      '["tourism"="aquarium"]',
      '["leisure"="playground"]',
      '["leisure"="sports_centre"]',
      '["leisure"="bowling_alley"]',
      '["amenity"="cinema"]'
    ]
  }
};

function normaliseActivity(activity) {
  if (!activity) return 'food';

  const value = String(activity).trim().toLowerCase();

  const aliases = {
    restaurant: 'food',
    restaurants: 'food',
    cafe: 'food',
    cafes: 'food',
    food: 'food',

    shopping: 'shopping',
    shop: 'shopping',
    shops: 'shopping',
    mall: 'shopping',
    malls: 'shopping',

    salon: 'salon',
    salons: 'salon',
    beauty: 'salon',

    library: 'library',
    libraries: 'library',

    amusement: 'amusement',
    'amusement park': 'amusement',
    'theme park': 'amusement',

    park: 'park',
    parks: 'park',

    family: 'family',
    friends: 'family'
  };

  return aliases[value] || 'food';
}

/*
 * First geocoder: OpenStreetMap Nominatim
 */
async function geocodeWithNominatim(query) {
  const url = new URL(
    'https://nominatim.openstreetmap.org/search'
  );

  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', query);

  const response = await fetch(url, {
    headers: {
      'User-Agent': NOMINATIM_USER_AGENT
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(
      `Nominatim lookup failed with status ${response.status}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(
      'Nominatim could not find the location.'
    );
  }

  const result = data[0];

  return {
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    displayName: result.display_name || query,
    source: 'Nominatim'
  };
}

/*
 * Second geocoder: ArcGIS
 *
 * Used as a fallback when Nominatim is unavailable
 * or rate-limits the Render server.
 */
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
    data.candidates.length === 0
  ) {
    throw new Error(
      'ArcGIS could not find the location.'
    );
  }

  const result = data.candidates[0];

  if (
    !result.location ||
    typeof result.location.x !== 'number' ||
    typeof result.location.y !== 'number'
  ) {
    throw new Error(
      'ArcGIS returned invalid coordinates.'
    );
  }

  return {
    latitude: result.location.y,
    longitude: result.location.x,
    displayName: result.address || query,
    source: 'ArcGIS'
  };
}

/*
 * Geocode the user's location.
 *
 * Nominatim is tried first.
 * If it fails, ArcGIS is used automatically.
 */
async function geocodeLocation(location) {
  const query = String(location || '').trim();

  if (!query) {
    throw new Error('Location is required.');
  }

  try {
    const result = await geocodeWithNominatim(query);

    console.log(
      `Location "${query}" found using ${result.source}.`
    );

    return result;
  } catch (nominatimError) {
    console.warn(
      `Nominatim failed for "${query}":`,
      nominatimError.message
    );

    try {
      const result = await geocodeWithArcGIS(query);

      console.log(
        `Location "${query}" found using ${result.source}.`
      );

      return result;
    } catch (arcgisError) {
      console.error(
        `ArcGIS fallback failed for "${query}":`,
        arcgisError.message
      );

      throw new Error(
        'All location lookup services are currently unavailable.'
      );
    }
  }
}

function buildOverpassQuery(
  latitude,
  longitude,
  activity,
  radius
) {
  const config =
    CATEGORY_CONFIG[activity] || CATEGORY_CONFIG.food;

  const statements = config.tags
    .map(
      (tag) =>
        `nwr${tag}(around:${radius},${latitude},${longitude});`
    )
    .join('\n');

  return `
[out:json][timeout:25];
(
${statements}
);
out center tags;
`;
}

function getElementCoordinates(element) {
  if (
    typeof element.lat === 'number' &&
    typeof element.lon === 'number'
  ) {
    return {
      latitude: element.lat,
      longitude: element.lon
    };
  }

  if (
    element.center &&
    typeof element.center.lat === 'number' &&
    typeof element.center.lon === 'number'
  ) {
    return {
      latitude: element.center.lat,
      longitude: element.center.lon
    };
  }

  return null;
}

function getPlaceName(element) {
  const tags = element.tags || {};

  return (
    tags.name ||
    tags['name:en'] ||
    tags.brand ||
    tags.operator ||
    'Unnamed place'
  );
}

function getAddress(element) {
  const tags = element.tags || {};

  const addressParts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:suburb'],
    tags['addr:city'],
    tags['addr:postcode']
  ].filter(Boolean);

  if (addressParts.length > 0) {
    return addressParts.join(', ');
  }

  return tags['addr:full'] || '';
}

function calculateDistanceKm(
  latitude1,
  longitude1,
  latitude2,
  longitude2
) {
  const earthRadiusKm = 6371;

  const lat1 = (latitude1 * Math.PI) / 180;
  const lat2 = (latitude2 * Math.PI) / 180;

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

function formatPlace(
  element,
  originLatitude,
  originLongitude,
  activity
) {
  const coordinates = getElementCoordinates(element);

  if (!coordinates) {
    return null;
  }

  const tags = element.tags || {};

  const distance = calculateDistanceKm(
    originLatitude,
    originLongitude,
    coordinates.latitude,
    coordinates.longitude
  );

  return {
    id: `${element.type}-${element.id}`,
    name: getPlaceName(element),
    category: activity,
    address: getAddress(element),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    distanceKm: Number(distance.toFixed(2)),
    website:
      tags.website ||
      tags['contact:website'] ||
      '',
    phone:
      tags.phone ||
      tags['contact:phone'] ||
      '',
    openingHours:
      tags.opening_hours ||
      ''
  };
}

/*
 * Query both Overpass servers at the same time.
 *
 * The first successful server is used.
 */
async function queryOverpass(query) {
  const requests = OVERPASS_ENDPOINTS.map(
    async (endpoint) => {
      console.log(
        `Trying Overpass endpoint: ${endpoint}`
      );

      const response = await fetch(endpoint, {
        method: 'POST',

        headers: {
          'User-Agent': 'MerlinOutingPlanner/1.0',
          'Content-Type':
            'application/x-www-form-urlencoded;charset=UTF-8'
        },

        body: new URLSearchParams({
          data: query
        }),

        signal: AbortSignal.timeout(30000)
      });

      if (!response.ok) {
        throw new Error(
          `Overpass request failed with status ${response.status}`
        );
      }

      const data = await response.json();

      if (
        !data ||
        !Array.isArray(data.elements)
      ) {
        throw new Error(
          'Invalid response from Overpass.'
        );
      }

      console.log(
        `Overpass search succeeded using ${endpoint}.`
      );

      return data;
    }
  );

  try {
    return await Promise.any(requests);
  } catch (errors) {
    console.error(
      'All Overpass endpoints failed:',
      errors
    );

    throw new Error(
      'All Overpass servers failed.'
    );
  }
}

export async function searchNearbyPlaces(
  preferences = {}
) {
  const location =
    preferences.location ||
    preferences.place ||
    preferences.city;

  const activity = normaliseActivity(
    preferences.activity ||
      preferences.category ||
      preferences.type
  );

  /*
   * Read the radius selected by the user.
   *
   * The frontend sends radiusKm.
   * Convert kilometres to metres because
   * Overpass expects the radius in metres.
   *
   * Keep support for the older radius/radiusMeters
   * values as a fallback.
   */
  const requestedRadiusKm = Number(
    preferences.radiusKm
  );

  let radius;

  if (
    Number.isFinite(requestedRadiusKm) &&
    requestedRadiusKm > 0
  ) {
    radius = requestedRadiusKm * 1000;
  } else {
    radius = Number(
      preferences.radius ||
        preferences.radiusMeters ||
        50000
    );
  }

  radius = Math.min(
    Math.max(radius, 1000),
    50000
  );

  console.log(
    `Merlin place search radius: ${radius / 1000} km`
  );

  const limit = Math.min(
    Math.max(
      Number(preferences.limit || 20),
      1
    ),
    50
  );

  let coordinates;

  try {
    coordinates =
      await geocodeLocation(location);
  } catch (error) {
    console.error(
      'Geocoding error:',
      error
    );

    return {
      suggestions: [],
      location: location || '',
      activity,
      warning:
        'Location lookup is temporarily unavailable. Try again shortly.'
    };
  }

  const query = buildOverpassQuery(
    coordinates.latitude,
    coordinates.longitude,
    activity,
    radius
  );

  let overpassData;

  try {
    overpassData =
      await queryOverpass(query);
  } catch (error) {
    console.error(
      'Overpass error:',
      error
    );

    return {
      suggestions: [],
      location:
        coordinates.displayName,
      activity,
      warning:
        'Nearby place search is temporarily unavailable. Try again shortly.'
    };
  }

  const places =
    overpassData.elements
      .map((element) =>
        formatPlace(
          element,
          coordinates.latitude,
          coordinates.longitude,
          activity
        )
      )
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.distanceKm - b.distanceKm
      );

  const uniquePlaces = [];
  const seen = new Set();

  for (const place of places) {
    const key =
      `${place.name.toLowerCase()}-` +
      `${place.latitude.toFixed(4)}-` +
      `${place.longitude.toFixed(4)}`;

    if (!seen.has(key)) {
      seen.add(key);
      uniquePlaces.push(place);
    }
  }

  return {
    suggestions:
      uniquePlaces.slice(0, limit),

    location:
      coordinates.displayName,

    activity,

    coordinates: {
      latitude:
        coordinates.latitude,
      longitude:
        coordinates.longitude
    }
  };
}
