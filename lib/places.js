const ACTIVITY_FILTERS = {
  food: [
    ['amenity', ['cafe', 'restaurant', 'fast_food', 'food_court', 'ice_cream', 'marketplace']],
    ['shop', ['street_vendor']]
  ],
  nature: [['leisure', ['park', 'garden', 'nature_reserve']]],
  culture: [
    ['tourism', ['museum', 'gallery', 'attraction']],
    ['historic', ['monument', 'memorial', 'temple']],
    ['amenity', ['place_of_worship']]
  ],
  shopping: [
    ['shop', ['mall', 'department_store', 'books', 'clothes', 'market']],
    ['amenity', ['marketplace']]
  ],
  family: [
    ['leisure', ['playground', 'amusement_arcade', 'sports_centre']],
    ['tourism', ['zoo', 'aquarium', 'theme_park']],
    ['amenity', ['community_centre']]
  ],
  active: [['leisure', ['sports_centre', 'fitness_centre', 'swimming_pool']]],
  quiet: [['amenity', ['library']], ['leisure', ['park', 'garden']]],
  beach: [['natural', ['beach']], ['leisure', ['beach_resort']]],
  nightlife: [['amenity', ['bar', 'pub', 'nightclub']]],
  wellness: [['leisure', ['spa', 'sauna']], ['amenity', ['spa']]],
  stay: [['tourism', ['hotel', 'motel', 'hostel', 'guest_house', 'apartment', 'chalet']]]
};

const ACTIVITY_LABELS = {
  food: 'Food and drink',
  nature: 'Parks and gardens',
  culture: 'Arts and culture',
  shopping: 'Shopping',
  family: 'Family activities',
  active: 'Sports and fitness',
  quiet: 'Quiet places',
  beach: 'Beaches and waterfront',
  nightlife: 'Nightlife',
  wellness: 'Wellness',
  stay: 'Hotels and stays'
};

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

const ALLOWED_COMPANIONS = new Set(['solo', 'date', 'friends', 'family', 'kids']);
const ALLOWED_ACCOMMODATION = new Set(['hotel', 'hostel', 'resort', 'guest house', 'homestay', 'apartment']);
const ALLOWED_RADII = new Set([1, 3, 5, 10, 25, 50]);
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const geocodeCache = new Map();
let geocodeQueue = Promise.resolve();
let lastGeocodeAt = 0;

function serviceError(message, statusCode = 503) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function normalizePlacePreferences(input = {}) {
  const rawActivities = Array.isArray(input.activities) ? input.activities : [input.activity];
  const activities = [...new Set(rawActivities.filter((activity) => ACTIVITY_FILTERS[activity]))].slice(0, 3);
  const radiusKm = Number(input.radiusKm);
  const requestedBudget = Number(input.budgetRupees);
  const tripBudget = input.budgetMode === 'trip';
  const totalBudgetRupees = Math.max(0, Number.isFinite(requestedBudget) ? requestedBudget : 3000);
  const boundedBudget = tripBudget
    ? Math.min(1000000000, totalBudgetRupees)
    : Math.min(10000, Math.max(300, totalBudgetRupees));
  const partySize = Math.max(1, Math.min(50, Math.floor(Number(input.partySize) || 1)));
  const tripDays = Math.max(1, Math.min(365, Math.floor(Number(input.tripDays) || 1)));

  return {
    activities,
    location: String(input.location || '').trim().slice(0, 160),
    budgetRupees: tripBudget
      ? Math.round(boundedBudget / (partySize * tripDays))
      : Math.min(10000, Math.round((boundedBudget - 300) / 200) * 200 + 300),
    totalBudgetRupees: tripBudget ? boundedBudget : null,
    budgetMode: tripBudget ? 'trip' : 'per-person',
    partySize,
    tripDays,
    accommodation: ALLOWED_ACCOMMODATION.has(String(input.accommodation || '').toLowerCase())
      ? String(input.accommodation).toLowerCase()
      : '',
    origin: String(input.origin || '').trim().slice(0, 160),
    companions: ALLOWED_COMPANIONS.has(input.companions) ? input.companions : 'friends',
    radiusKm: ALLOWED_RADII.has(radiusKm) ? radiusKm : 50,
    transport: ['walk', 'transit', 'drive', 'any'].includes(input.transport) ? input.transport : 'any'
  };
}

export function buildGoogleMapsUrl(place, location) {
  const query = [place.name, place.address, location].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildOverpassQuery(preferences, center) {
  const uniqueFilters = new Map();
  for (const activity of preferences.activities) {
    const accommodationValues = {
      hotel: ['hotel'],
      hostel: ['hostel'],
      resort: ['hotel', 'chalet'],
      'guest house': ['guest_house'],
      homestay: ['guest_house', 'hotel'],
      apartment: ['apartment']
    }[preferences.accommodation];
    const activityFilters = activity === 'stay' && accommodationValues
      ? [['tourism', accommodationValues]]
      : ACTIVITY_FILTERS[activity] || [];
    for (const [key, values] of activityFilters) {
      uniqueFilters.set(`${key}:${values.join('|')}`, [key, values]);
    }
  }

  const radiusMeters = preferences.radiusKm * 1000;
  const statements = [...uniqueFilters.values()].flatMap(([key, values]) => {
    const selector = `["${key}"~"^(${values.join('|')})$"]`;
    return ['node', 'way', 'relation'].map((kind) =>
      `${kind}${selector}(around:${radiusMeters},${center.lat},${center.lon});`
    );
  });
  if (preferences.transport === 'transit') {
    statements.push(
      `node["highway"="bus_stop"](around:${radiusMeters},${center.lat},${center.lon});`,
      `node["public_transport"~"^(platform|station)$"](around:${radiusMeters},${center.lat},${center.lon});`,
      `node["railway"~"^(station|halt|tram_stop)$"](around:${radiusMeters},${center.lat},${center.lon});`
    );
  }

  return `[out:json][timeout:20];(${statements.join('')});out center tags 220;`;
}

function distanceInKm(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(second.lat - first.lat);
  const longitudeDelta = radians(second.lon - first.lon);
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function categoryForTags(tags, activities) {
  for (const activity of activities) {
    for (const [key, values] of ACTIVITY_FILTERS[activity] || []) {
      if (values.includes(String(tags[key] || '').toLowerCase())) return ACTIVITY_LABELS[activity];
    }
  }
  return 'Local place';
}

function addressForTags(tags) {
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  return street || tags['addr:suburb'] || tags['addr:place'] || '';
}

function priceInRupees(tags) {
  const charge = String(tags.charge || '');
  const currency = String(tags.currency || tags['currency:INR'] || '').toUpperCase();
  const hasRupeeMarker = /₹|\bINR\b|\bRs\.?/i.test(charge);
  if (!hasRupeeMarker && currency !== 'INR' && currency !== 'YES') return null;
  const taggedPrice = charge.match(/(?:₹|INR|Rs\.?\s*)\s*([\d,]+(?:\.\d+)?)/i)
    || charge.match(/^\s*([\d,]+(?:\.\d+)?)(?:\s*(?:INR|Rs\.?))?\s*$/i);
  return taggedPrice ? Number(taggedPrice[1].replace(/,/g, '')) : null;
}

function averageSpendForPlace(price, category, preferences) {
  if (price !== null) return { amount: price, basis: 'mapped INR charge' };

  const activity = preferences.activities.find((key) => ACTIVITY_LABELS[key] === category);
  const share = AVERAGE_SPEND_SHARES[activity] || 0.4;
  const unrounded = preferences.budgetRupees * share;
  return {
    amount: Math.max(preferences.budgetMode === 'trip' ? 0 : 50, Math.round(unrounded / 50) * 50),
    basis: 'planning estimate from your budget'
  };
}

export function rankNearbyPlaces(elements, center, preferences) {
  const seen = new Set();
  const transitStops = preferences.transport === 'transit'
    ? elements.filter(({ tags = {} }) => tags.highway === 'bus_stop'
      || /^(platform|station)$/.test(tags.public_transport || '')
      || /^(station|halt|tram_stop)$/.test(tags.railway || ''))
    : [];

  const rankedPlaces = elements.flatMap((element) => {
    const tags = element.tags || {};
    const name = String(tags.name || '').trim();
    const lat = Number(element.lat ?? element.center?.lat);
    const lon = Number(element.lon ?? element.center?.lon);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];

    const distanceKm = distanceInKm(center, { lat, lon });
    if (distanceKm > preferences.radiusKm) return [];

    const address = addressForTags(tags);
    const dedupeKey = `${name.toLowerCase()}|${address.toLowerCase()}`;
    if (seen.has(dedupeKey)) return [];
    seen.add(dedupeKey);

    const category = categoryForTags(tags, preferences.activities);
    if (category === 'Local place') return [];

    const fee = String(tags.fee || '').toLowerCase();
    const charge = String(tags.charge || '').toLowerCase();
    const noFee = fee === 'no' || charge === 'no' || charge === 'free';
    const feeKnown = fee === 'yes' || Boolean(charge && !noFee);
    const price = priceInRupees(tags);
    const averageSpend = averageSpendForPlace(price, category, preferences);
    let score = (preferences.radiusKm - distanceKm) / preferences.radiusKm;

    if (price !== null) score += price <= preferences.budgetRupees ? 4 : -5;
    else if (noFee) score += preferences.budgetRupees <= 2000 ? 3 : 1;
    else if (feeKnown && preferences.budgetRupees <= 2000) score -= 1;
    if (preferences.companions === 'kids' && /playground|kids/.test(`${tags.leisure || ''} ${tags.kids || ''}`)) score += 3;
    if (preferences.companions === 'family' && tags.wheelchair === 'yes') score += 1;
    if (preferences.transport === 'walk' && distanceKm <= 2) score += 2;
    const transitDistanceKm = transitStops.length
      ? Math.min(...transitStops.map((stop) => {
        const stopLat = Number(stop.lat ?? stop.center?.lat);
        const stopLon = Number(stop.lon ?? stop.center?.lon);
        return Number.isFinite(stopLat) && Number.isFinite(stopLon)
          ? distanceInKm({ lat, lon }, { lat: stopLat, lon: stopLon })
          : Infinity;
      }))
      : null;
    if (transitDistanceKm !== null && transitDistanceKm <= 0.5) score += 2;

    return [{
      id: `${element.type || 'place'}-${element.id}`,
      name,
      category,
      address,
      distanceKm: Math.round(distanceKm * 10) / 10,
      budgetNote: price !== null
        ? `Map lists a ₹${new Intl.NumberFormat('en-IN').format(price)} charge`
        : noFee ? 'No entry fee tagged' : feeKnown ? 'Fee tagged; amount not listed' : 'Price not listed',
      averageSpendRupees: averageSpend.amount,
      averageSpendBasis: averageSpend.basis,
      detail: tags.cuisine ? `Cuisine: ${String(tags.cuisine).replace(/;/g, ', ')}` : '',
      wheelchair: tags.wheelchair === 'yes',
      transitDistanceKm: Number.isFinite(transitDistanceKm) ? Math.round(transitDistanceKm * 10) / 10 : null,
      score
    }];
  }).sort((first, second) => second.score - first.score || first.distanceKm - second.distanceKm);
  const categories = [...new Set(preferences.activities.map((activity) => ACTIVITY_LABELS[activity]))];
  const placesByCategory = new Map(categories.map((category) => [category, []]));

  for (const place of rankedPlaces) {
    placesByCategory.get(place.category)?.push(place);
  }

  const suggestions = [];
  while (suggestions.length < 12 && categories.some((category) => placesByCategory.get(category).length)) {
    for (const category of categories) {
      const place = placesByCategory.get(category).shift();
      if (place) suggestions.push(place);
      if (suggestions.length === 12) break;
    }
  }

  return suggestions.map(({ score, ...place }) => place);
}

async function geocodeLocation(location) {
  const cacheKey = location.toLowerCase();
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  const request = geocodeQueue.then(async () => {
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);
    const waitMs = Math.max(0, 1000 - (Date.now() - lastGeocodeAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastGeocodeAt = Date.now();

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('q', location);
    const response = await fetch(url, {
      headers: { 'User-Agent': 'MerlinOutingPlanner/1.0' },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw serviceError('Location lookup is temporarily unavailable. Try again shortly.');

    const [result] = await response.json();
    const place = result ? {
      lat: Number(result.lat),
      lon: Number(result.lon),
      countryCode: String(result.address?.country_code || '').toLowerCase(),
      label: [result.name, result.address?.state, result.address?.country].filter(Boolean).join(', ')
    } : null;
    geocodeCache.set(cacheKey, place);
    return place;
  });
  geocodeQueue = request.catch(() => null);
  return request;
}

async function fetchOverpassResults(query) {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'User-Agent': 'MerlinOutingPlanner/1.0',
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(15000)
      });
      if (response.ok) return await response.json();
    } catch {
      // Try the next public Overpass instance.
    }
  }
  throw serviceError('Nearby place data is busy right now. Please try again in a moment.');
}

export async function searchNearbyPlaces(input = {}) {
  const preferences = normalizePlacePreferences(input);
  if (!preferences.location) throw serviceError('Enter a city, neighborhood, or postal code.', 400);
  if (!preferences.activities.length) throw serviceError('Choose at least one activity.', 400);

  const center = await geocodeLocation(preferences.location);
  if (!center) throw serviceError('Merlin could not find that area. Try a nearby city or neighborhood.', 404);

  let originCenter = null;
  let warning = '';
  if (preferences.origin) {
    try {
      originCenter = await geocodeLocation(preferences.origin);
      if (!originCenter) warning = 'Merlin could not locate the trip origin, so travel estimates are unavailable.';
    } catch {
      warning = 'Merlin could not locate the trip origin, so travel estimates are unavailable.';
    }
  }

  let data = { elements: [] };
  try {
    data = await fetchOverpassResults(buildOverpassQuery(preferences, center));
  } catch {
    warning = [warning, 'Nearby place data is temporarily unavailable. Travel estimates may still be shown.'].filter(Boolean).join(' ');
  }

  const travelDistanceKm = originCenter ? distanceInKm(originCenter, center) : null;
  const perTravelerBudget = preferences.totalBudgetRupees === null
    ? null
    : preferences.totalBudgetRupees / preferences.partySize;
  const isIndiaRoute = originCenter?.countryCode === 'in' && center.countryCode === 'in';
  const travelEstimates = travelDistanceKm === null
    ? []
    : estimateTripTravelModes(travelDistanceKm, isIndiaRoute).map((estimate) => ({
      ...estimate,
      withinBudget: perTravelerBudget === null ? null : estimate.highRupees <= perTravelerBudget
    }));

  return {
    location: center.label,
    origin: originCenter?.label || preferences.origin,
    radiusKm: preferences.radiusKm,
    suggestions: rankNearbyPlaces(data.elements || [], center, preferences).map((place) => ({
      ...place,
      mapsUrl: buildGoogleMapsUrl(place, center.label)
    })),
    attribution: 'Place data © OpenStreetMap contributors (ODbL).',
    totalBudgetRupees: preferences.totalBudgetRupees,
    partySize: preferences.partySize,
    tripDays: preferences.tripDays,
    budgetPerPersonPerDayRupees: preferences.budgetMode === 'trip' ? preferences.budgetRupees : null,
    travelEstimateRegion: isIndiaRoute ? 'India-based' : 'international',
    travelDistanceKm: travelDistanceKm === null ? null : Math.round(travelDistanceKm),
    travelEstimates,
    warning
  };
}

function roundToFifty(amount) {
  return Math.round(amount / 50) * 50;
}

export function estimateTripTravelModes(distanceKm, isIndiaRoute = true) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) return [];
  const estimate = (minimum, maximum) => ({
    lowRupees: roundToFifty(minimum),
    highRupees: roundToFifty(maximum)
  });
  const modes = isIndiaRoute
    ? [
      { mode: 'Bus', ...estimate(Math.max(30, distanceKm * 1.5), Math.max(80, distanceKm * 4)) },
      { mode: 'Train', ...estimate(Math.max(50, distanceKm * 2), Math.max(150, distanceKm * 5)) },
      { mode: 'Car or cab', ...estimate(Math.max(100, distanceKm * 10), Math.max(250, distanceKm * 20)) },
      { mode: 'Flight', ...estimate(2500 + distanceKm * 3, 5000 + distanceKm * 8), available: distanceKm >= 250 }
    ]
    : [
      { mode: 'Bus', ...estimate(Math.max(1500, distanceKm * 5), Math.max(3500, distanceKm * 12)) },
      { mode: 'Train', ...estimate(Math.max(2500, distanceKm * 10), Math.max(8000, distanceKm * 25)) },
      { mode: 'Car or cab', ...estimate(Math.max(3000, distanceKm * 15), Math.max(9000, distanceKm * 30)) },
      { mode: 'Flight', ...estimate(6000 + distanceKm * 10, 15000 + distanceKm * 30), available: distanceKm >= 250 }
    ];
  if (distanceKm <= 10) modes.unshift({ mode: 'Walk', lowRupees: 0, highRupees: 0, available: true });
  return modes.map((mode) => ({ ...mode, available: mode.available ?? true }));
}
