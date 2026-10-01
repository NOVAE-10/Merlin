import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeOutingRequest,
  buildFallbackMerlinResponse
} from '../lib/merlin.js';
import {
  buildGoogleMapsUrl,
  buildOverpassQuery,
  estimateTripTravelModes,
  normalizePlacePreferences,
  rankNearbyPlaces
} from '../lib/places.js';

test('normalizeOutingRequest extracts destination intent and date cues', () => {
  const result = normalizeOutingRequest('I want lunch, shopping, and a park this Saturday afternoon with friends');

  assert.equal(result.activities.length, 3);
  assert.equal(result.activities[0], 'lunch');
  assert.equal(result.activities[1], 'shopping');
  assert.equal(result.activities[2], 'park');
  assert.equal(result.dateMood, 'weekend');
  assert.equal(result.peopleCount, 'friends');
});

test('buildFallbackMerlinResponse gives a usable plan even without API access', () => {
  const result = buildFallbackMerlinResponse('I want lunch and shopping this Saturday with friends', { page: 'talk' });

  assert.equal(result.needsClarification, false);
  assert.match(result.message, /lunch|shopping|weekend/i);
  assert.equal(Array.isArray(result.structured.plan.activities), true);
  assert.ok(result.structured.plan.activities.length > 0);
});

test('normalizePlacePreferences limits activities and validates user choices', () => {
  const result = normalizePlacePreferences({
    activities: ['food', 'nature', 'culture', 'shopping', 'invalid'],
    location: ' Portland ',
    budgetRupees: 1100,
    companions: 'kids',
    radiusKm: '3',
    transport: 'walk'
  });

  assert.deepEqual(result.activities, ['food', 'nature', 'culture']);
  assert.equal(result.location, 'Portland');
  assert.equal(result.budgetRupees, 1100);
  assert.equal(result.companions, 'kids');
  assert.equal(result.radiusKm, 3);
  assert.equal(result.transport, 'walk');
  assert.equal(normalizePlacePreferences({}).radiusKm, 50);
  assert.equal(normalizePlacePreferences({ budgetRupees: 20000 }).budgetRupees, 10000);
  assert.equal(normalizePlacePreferences({ budgetRupees: 0 }).budgetRupees, 300);
});

test('normalizePlacePreferences divides a custom trip budget by travelers and days', () => {
  const result = normalizePlacePreferences({
    activities: ['food', 'stay'],
    budgetMode: 'trip',
    budgetRupees: 60000,
    partySize: 2,
    tripDays: 3
  });

  assert.equal(result.totalBudgetRupees, 60000);
  assert.equal(result.budgetRupees, 10000);
  assert.equal(result.partySize, 2);
  assert.equal(result.tripDays, 3);
});

test('buildGoogleMapsUrl points to a selected venue and its Indian location', () => {
  const url = new URL(buildGoogleMapsUrl({ name: 'Cafe One', address: '10 MG Road' }, 'Pune, Maharashtra, India'));

  assert.equal(url.hostname, 'www.google.com');
  assert.match(url.pathname, /maps\/search/);
  assert.equal(url.searchParams.get('query'), 'Cafe One, 10 MG Road, Pune, Maharashtra, India');
});

test('buildOverpassQuery searches selected activity tags within the chosen radius', () => {
  const preferences = normalizePlacePreferences({ activities: ['food', 'nature'], radiusKm: 3 });
  const query = buildOverpassQuery(preferences, { lat: 45.52, lon: -122.67 });

  assert.match(query, /amenity/);
  assert.match(query, /leisure/);
  assert.match(query, /around:3000,45\.52,-122\.67/);
});

test('buildOverpassQuery includes nearby bus and metro stops for transit preferences', () => {
  const preferences = normalizePlacePreferences({ activities: ['food'], transport: 'transit' });
  const query = buildOverpassQuery(preferences, { lat: 18.52, lon: 73.85 });

  assert.match(query, /highway"="bus_stop/);
  assert.match(query, /public_transport/);
});

test('buildOverpassQuery includes hotels and stays for trip accommodation searches', () => {
  const preferences = normalizePlacePreferences({ activities: ['stay'] });
  const query = buildOverpassQuery(preferences, { lat: 35.01, lon: 135.76 });

  assert.match(query, /tourism/);
  assert.match(query, /hotel/);
  assert.match(query, /hostel/);
});

test('buildOverpassQuery respects the requested accommodation type', () => {
  const preferences = normalizePlacePreferences({ activities: ['stay'], accommodation: 'Hostel' });
  const query = buildOverpassQuery(preferences, { lat: 35.01, lon: 135.76 });

  assert.match(query, /hostel/);
  assert.doesNotMatch(query, /hotel/);
});

test('estimateTripTravelModes returns broad INR estimates and flags short-haul flights', () => {
  const localModes = estimateTripTravelModes(10);
  const longModes = estimateTripTravelModes(1000);
  const internationalModes = estimateTripTravelModes(344, false);

  assert.equal(localModes.find((mode) => mode.mode === 'Walk').highRupees, 0);
  assert.equal(localModes.find((mode) => mode.mode === 'Flight').available, false);
  assert.equal(longModes.find((mode) => mode.mode === 'Flight').available, true);
  assert.ok(longModes.find((mode) => mode.mode === 'Train').highRupees > longModes.find((mode) => mode.mode === 'Train').lowRupees);
  assert.ok(internationalModes.find((mode) => mode.mode === 'Bus').lowRupees > localModes.find((mode) => mode.mode === 'Bus').lowRupees);
});

test('rankNearbyPlaces prioritizes fee-free matches, filters distance, and avoids invented prices', () => {
  const preferences = normalizePlacePreferences({
    activities: ['nature'],
    budgetRupees: 1000,
    companions: 'family',
    radiusKm: 3
  });
  const center = { lat: 45.52, lon: -122.67 };
  const results = rankNearbyPlaces([
    { type: 'way', id: 1, center: { lat: 45.52, lon: -122.68 }, tags: { name: 'Rose Garden', leisure: 'garden', fee: 'no', wheelchair: 'yes' } },
    { type: 'node', id: 2, lat: 45.5202, lon: -122.67, tags: { name: 'Paid Nature Park', leisure: 'park', fee: 'yes', charge: '₹1,500' } },
    { type: 'node', id: 3, lat: 45.57, lon: -122.67, tags: { name: 'Far Park', leisure: 'park' } },
    { type: 'node', id: 4, lat: 45.52, lon: -122.67, tags: { leisure: 'park' } }
  ], center, preferences);

  assert.deepEqual(results.map((place) => place.name), ['Rose Garden', 'Paid Nature Park']);
  assert.equal(results[0].budgetNote, 'No entry fee tagged');
  assert.equal(results[1].budgetNote, 'Map lists a ₹1,500 charge');
  assert.equal(results[0].wheelchair, true);
});

test('rankNearbyPlaces estimates per-person spend from the selected budget when venue prices are absent', () => {
  const preferences = normalizePlacePreferences({ activities: ['food'], budgetRupees: 1100 });
  const [place] = rankNearbyPlaces([
    { type: 'node', id: 20, lat: 18.52, lon: 73.85, tags: { name: 'Local Cafe', amenity: 'cafe' } }
  ], { lat: 18.52, lon: 73.85 }, preferences);

  assert.equal(place.averageSpendRupees, 600);
  assert.equal(place.averageSpendBasis, 'planning estimate from your budget');
});

test('rankNearbyPlaces does not treat an unlabelled foreign charge as rupees', () => {
  const preferences = normalizePlacePreferences({ activities: ['food'], budgetRupees: 300 });
  const results = rankNearbyPlaces([
    { type: 'node', id: 10, lat: 48.85, lon: 2.35, tags: { name: 'Cafe Europe', amenity: 'cafe', charge: '12' } },
    { type: 'node', id: 11, lat: 48.85, lon: 2.35, tags: { name: 'Cafe India', amenity: 'cafe', charge: '₹250' } }
  ], { lat: 48.85, lon: 2.35 }, preferences);

  assert.equal(results.find((place) => place.name === 'Cafe Europe').budgetNote, 'Fee tagged; amount not listed');
  assert.doesNotMatch(results.find((place) => place.name === 'Cafe Europe').budgetNote, /₹/);
  assert.equal(results.find((place) => place.name === 'Cafe India').budgetNote, 'Map lists a ₹250 charge');
});

test('rankNearbyPlaces keeps multiple requested activity types represented', () => {
  const preferences = normalizePlacePreferences({ activities: ['food', 'nature'], radiusKm: 3 });
  const results = rankNearbyPlaces([
    { type: 'node', id: 1, lat: 45.52, lon: -122.67, tags: { name: 'Cafe One', amenity: 'cafe' } },
    { type: 'node', id: 2, lat: 45.5201, lon: -122.67, tags: { name: 'Cafe Two', amenity: 'cafe' } },
    { type: 'node', id: 3, lat: 45.5202, lon: -122.67, tags: { name: 'City Garden', leisure: 'garden' } }
  ], { lat: 45.52, lon: -122.67 }, preferences);

  assert.deepEqual(results.slice(0, 2).map((place) => place.category), ['Food and drink', 'Parks and gardens']);
});

test('rankNearbyPlaces reports mapped transit distance when requested', () => {
  const preferences = normalizePlacePreferences({ activities: ['food'], transport: 'transit' });
  const results = rankNearbyPlaces([
    { type: 'node', id: 1, lat: 18.52, lon: 73.85, tags: { name: 'Local Cafe', amenity: 'cafe' } },
    { type: 'node', id: 2, lat: 18.521, lon: 73.85, tags: { highway: 'bus_stop', name: 'Bus Stop' } }
  ], { lat: 18.52, lon: 73.85 }, preferences);

  assert.equal(results[0].name, 'Local Cafe');
  assert.equal(results[0].transitDistanceKm, 0.1);
});
