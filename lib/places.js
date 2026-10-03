const NOMINATIM_USER_AGENT =
  process.env.NOMINATIM_USER_AGENT || 'MerlinOutingPlanner/1.0';

const GEOAPIFY_API_KEY =
  process.env.GEOAPIFY_API_KEY || '';

const GEOAPIFY_PLACES_URL =
  'https://api.geoapify.com/v2/places';

const CATEGORY_CONFIG = {
  food: {
    label: 'Food',
    categories: [
      'catering.restaurant',
      'catering.cafe',
      'catering.fast_food',
      'catering.food_court',
      'catering.ice_cream'
    ]
  },

  shopping: {
    label: 'Shopping',
    categories: [
      'commercial.shopping_mall',
      'commercial.supermarket',
      'commercial.department_store',
      'commercial'
    ]
  },

  salon: {
    label: 'Salon',
    categories: [
      'service.beauty',
      'commercial.hairdresser'
    ]
  },

  library: {
    label: 'Library',
    categories: [
      'education.library'
    ]
  },

  amusement: {
    label: 'Amusement Park',
    categories: [
      'entertainment.amusement_arcade',
      'entertainment.theme_park',
      'entertainment.water_park',
      'entertainment.activity_park'
    ]
  },

  park: {
    label: 'Park',
    categories: [
      'leisure.park',
      'leisure.garden'
    ]
  },

  family: {
    label: 'Family & Friends',
    categories: [
      'entertainment.zoo',
      'entertainment.aquarium',
      'entertainment.bowling_alley',
      'entertainment.cinema',
      'leisure.playground',
      'entertainment.activity_park'
    ]
  }
};

function normaliseActivity(activity) {
  if (!activity) return 'food';

  const value =
    String(activity)
      .trim()
      .toLowerCase();

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

  if (
    !Array.isArray(data) ||
    data.length === 0
  ) {
    throw new Error(
      'Nominatim could not find the location.'
    );
  }

  const result = data[0];

  return {
    latitude: Number(result.lat),
    longitude: Number(result.lon),
    displayName:
      result.display_name || query,
    source: 'Nominatim'
  };
}

/*
 * Second geocoder: ArcGIS
 *
 * Used when Nominatim is unavailable
 * or rate-limits the Render server.
 */
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

  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'MerlinOutingPlanner/1.0'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(
      `ArcGIS lookup failed with status ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !data ||
    !Array.isArray(data.candidates) ||
    data.candidates.length === 0
  ) {
    throw new Error(
      'ArcGIS could not find the location.'
    );
  }

  const result =
    data.candidates[0];

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
    latitude:
      result.location.y,

    longitude:
      result.location.x,

    displayName:
      result.address || query,

    source: 'ArcGIS'
  };
}

/*
 * Geocode the user's location.
 *
 * Nominatim is tried first.
 * ArcGIS is used automatically
 * if Nominatim fails.
 */
async function geocodeLocation(location) {
  const query =
    String(location || '').trim();

  if (!query) {
    throw new Error(
      'Location is required.'
    );
  }

  try {
    const result =
      await geocodeWithNominatim(query);

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
      const result =
        await geocodeWithArcGIS(query);

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

/*
 * Calculate distance between two coordinates.
 */
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
    ((latitude2 - latitude1) * Math.PI) /
    180;

  const deltaLon =
    ((longitude2 - longitude1) * Math.PI) /
    180;

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

/*
 * Get a readable place name.
 */
function getPlaceName(properties) {
  return (
    properties.name ||
    properties.address_line1 ||
    properties.formatted ||
    'Unnamed place'
  );
}

/*
 * Search Geoapify for nearby places.
 *
 * Geoapify's circle filter is a hard limit,
 * so a 1 km request will only return places
 * inside the selected 1 km radius.
 */
async function queryGeoapifyPlaces(
  latitude,
  longitude,
  activity,
  radius,
  limit
) {
  if (!GEOAPIFY_API_KEY) {
    throw new Error(
      'GEOAPIFY_API_KEY is not configured.'
    );
  }

  const config =
    CATEGORY_CONFIG[activity] ||
    CATEGORY_CONFIG.food;

  const url =
    new URL(GEOAPIFY_PLACES_URL);

  url.searchParams.set(
    'apiKey',
    GEOAPIFY_API_KEY
  );

  url.searchParams.set(
    'categories',
    config.categories.join(',')
  );

  url.searchParams.set(
    'filter',
    `circle:${longitude},${latitude},${radius}`
  );

  url.searchParams.set(
    'bias',
    `proximity:${longitude},${latitude}`
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
    `Searching Geoapify for ${activity} within ${radius / 1000} km.`
  );

  const response = await fetch(
    url,
    {
      method: 'GET',
      headers: {
        'User-Agent':
          'MerlinOutingPlanner/1.0'
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

    throw new Error(
      `Geoapify request failed with status ${response.status}`
    );
  }

  const data =
    await response.json();

  if (
    !data ||
    !Array.isArray(data.features)
  ) {
    throw new Error(
      'Invalid response from Geoapify.'
    );
  }

  console.log(
    `Geoapify returned ${data.features.length} places.`
  );

  return data;
}

/*
 * Convert a Geoapify feature into Merlin's
 * existing place format.
 */
function formatGeoapifyPlace(
  feature,
  originLatitude,
  originLongitude,
  activity
) {
  if (
    !feature ||
    !feature.geometry ||
    !Array.isArray(feature.geometry.coordinates)
  ) {
    return null;
  }

  const properties =
    feature.properties || {};

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

  const distanceKm =
    calculateDistanceKm(
      originLatitude,
      originLongitude,
      latitude,
      longitude
    );

  return {
    id:
      properties.place_id ||
      `${latitude}-${longitude}-${getPlaceName(properties)}`,

    name:
      getPlaceName(properties),

    category:
      activity,

    address:
      properties.formatted ||
      properties.address_line2 ||
      properties.address_line1 ||
      '',

    latitude,

    longitude,

    distanceKm:
      Number(
        distanceKm.toFixed(2)
      ),

    website:
      properties.website ||
      '',

    phone:
      properties.contact?.phone ||
      properties.phone ||
      '',

    openingHours:
      properties.opening_hours ||
      ''
  };
}

export async function searchNearbyPlaces(
  preferences = {}
) {
  const location =
    preferences.location ||
    preferences.place ||
    preferences.city;

  const activity =
    normaliseActivity(
      preferences.activity ||
        preferences.category ||
        preferences.type
    );

  /*
   * The frontend sends radiusKm.
   *
   * Convert kilometres to metres because
   * Geoapify's circle filter expects metres.
   *
   * Older radius/radiusMeters values are
   * still supported as a fallback.
   */
  const requestedRadiusKm =
    Number(
      preferences.radiusKm
    );

  let radius;

  if (
    Number.isFinite(
      requestedRadiusKm
    ) &&
    requestedRadiusKm > 0
  ) {
    radius =
      requestedRadiusKm * 1000;
  } else {
    radius =
      Number(
        preferences.radius ||
          preferences.radiusMeters ||
          50000
      );
  }

  radius =
    Math.min(
      Math.max(
        radius,
        1000
      ),
      50000
    );

  console.log(
    `Merlin place search radius: ${radius / 1000} km`
  );

  const limit =
    Math.min(
      Math.max(
        Number(
          preferences.limit || 20
        ),
        1
      ),
      50
    );

  let coordinates;

  /*
   * Find the coordinates of the user's
   * entered location.
   */
  try {
    coordinates =
      await geocodeLocation(
        location
      );
  } catch (error) {
    console.error(
      'Geocoding error:',
      error
    );

    return {
      suggestions: [],
      location:
        location || '',
      activity,
      warning:
        'Location lookup is temporarily unavailable. Try again shortly.'
    };
  }

  /*
   * Search actual nearby places.
   */
  let geoapifyData;

  try {
    geoapifyData =
      await queryGeoapifyPlaces(
        coordinates.latitude,
        coordinates.longitude,
        activity,
        radius,
        limit
      );
  } catch (error) {
    console.error(
      'Geoapify error:',
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

  /*
   * Convert Geoapify results into
   * Merlin's existing format.
   */
  const places =
    geoapifyData.features
      .map((feature) =>
        formatGeoapifyPlace(
          feature,
          coordinates.latitude,
          coordinates.longitude,
          activity
        )
      )
      .filter(Boolean)
      .filter(
        (place) =>
          place.distanceKm <=
          radius / 1000
      )
      .sort(
        (a, b) =>
          a.distanceKm -
          b.distanceKm
      );

  /*
   * Remove duplicate places.
   */
  const uniquePlaces = [];
  const seen = new Set();

  for (
    const place of places
  ) {
    const key =
      `${place.name.toLowerCase()}-` +
      `${place.latitude.toFixed(4)}-` +
      `${place.longitude.toFixed(4)}`;

    if (!seen.has(key)) {
      seen.add(key);
      uniquePlaces.push(place);
    }
  }

  console.log(
    `Merlin found ${uniquePlaces.length} unique ${activity} places.`
  );

  return {
    suggestions:
      uniquePlaces.slice(
        0,
        limit
      ),

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
