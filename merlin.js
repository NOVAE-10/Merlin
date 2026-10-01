const ACTIVITY_LIBRARY = {
  lunch: { name: 'Lunch', type: 'food', location: 'A café or casual food stop' },
  shopping: { name: 'Shopping', type: 'shopping', location: 'A local shopping area' },
  park: { name: 'Park', type: 'nature', location: 'A green outdoor stop' },
  library: { name: 'Library', type: 'learning', location: 'A quiet learning space' },
  salon: { name: 'Salon', type: 'self-care', location: 'A grooming or self-care stop' },
  museum: { name: 'Museum', type: 'culture', location: 'A relaxed cultural visit' },
  entertainment: { name: 'Entertainment', type: 'fun', location: 'A playful activity stop' },
  gym: { name: 'Gym', type: 'fitness', location: 'An active stop' },
  college: { name: 'College', type: 'campus', location: 'A familiar campus or study stop' },
  office: { name: 'Office', type: 'work', location: 'A useful work-related stop' },
  nature: { name: 'Nature walk', type: 'nature', location: 'A green, calming outdoor area' },
  friends: { name: 'Friends time', type: 'social', location: 'A relaxed social hangout' },
  family: { name: 'Family time', type: 'family', location: 'A shared, comfortable outing' },
  explore: { name: 'Explore', type: 'wander', location: 'A flexible discovery stop' }
};

function selectSuggestedActivities(text) {
  const normalized = text.toLowerCase();
  const intents = [];

  const intentRules = [
    { key: 'lunch', matches: ['lunch', 'dinner', 'breakfast', 'brunch', 'eat', 'food', 'meal', 'restaurant', 'cafe', 'café', 'snacks'] },
    { key: 'shopping', matches: ['shopping', 'mall', 'buy something', 'clothes', 'store', 'boutique', 'shop'] },
    { key: 'salon', matches: ['salon', 'haircut', 'hair', 'beauty', 'grooming', 'self-care', 'spa'] },
    { key: 'library', matches: ['library', 'read', 'reading', 'books', 'study', 'learning'] },
    { key: 'museum', matches: ['museum', 'gallery', 'art', 'culture'] },
    { key: 'entertainment', matches: ['movie', 'movies', 'fun', 'amusement', 'games', 'entertainment', 'activities'] },
    { key: 'park', matches: ['park', 'garden', 'walk', 'walking', 'fresh air', 'nature', 'outdoors', 'greenery', 'trees', 'lake', 'peaceful', 'relaxing'] },
    { key: 'nature', matches: ['nature', 'green', 'outdoors', 'fresh air', 'peaceful', 'relaxing', 'eco-friendly', 'environment', 'garden', 'trees', 'lake', 'walk', 'cycling'] },
    { key: 'college', matches: ['college', 'campus', 'university'] },
    { key: 'office', matches: ['office', 'work'] }
  ];

  for (const rule of intentRules) {
    if (rule.matches.some((phrase) => normalized.includes(phrase))) {
      intents.push(rule.key);
    }
  }

  if (intents.length === 0) {
    return ['explore'];
  }

  const preferredOrder = ['nature', 'park', 'lunch', 'shopping', 'salon', 'library', 'museum', 'entertainment', 'friends', 'family', 'college', 'office'];
  return [...new Set(intents)].sort((a, b) => preferredOrder.indexOf(a) - preferredOrder.indexOf(b));
}

function buildLocalPlan(message, context = {}) {
  const text = String(message || '').trim();
  const normalized = normalizeOutingRequest(text);
  const activityKeys = selectSuggestedActivities(text);
  const planDate = normalized.dateMood === 'weekend' ? 'Saturday' : normalized.dateMood === 'soon' ? 'Tomorrow' : 'Flexible';
  const startLocation = context.startLocation || 'Home';

  const activities = activityKeys.map((key) => ACTIVITY_LIBRARY[key] || ACTIVITY_LIBRARY.explore);

  const notes = [
    'Keep the route compact to reduce unnecessary travel.',
    'Leave enough time for a relaxed, enjoyable stop in the middle of the outing.',
    'If the group changes, swap the final stop without disturbing the overall flow.'
  ];

  const natureFriendlyTips = [
    'Group nearby stops together to avoid extra short car trips.',
    'Choose walking, cycling, or public transport when the route makes sense.',
    'Add a green space or calm outdoor stop wherever it fits the plan.'
  ];

  const title =
    normalized.activities.includes('lunch')
      ? 'Food-first outing'
      : normalized.activities.includes('shopping')
        ? 'Shopping outing'
        : normalized.activities.includes('park') || normalized.activities.includes('nature')
          ? 'Nature-friendly outing'
          : normalized.activities.includes('friends') || normalized.activities.includes('family')
            ? 'Shared outing'
            : 'Merlin outing';

  return {
    title,
    date: planDate,
    startLocation,
    type: activityKeys[0] || 'explore',
    activities,
    notes,
    natureFriendlyTips,
    confidence: 'medium'
  };
}

export function buildLocalMerlinResponse(message = '', context = {}, errorMessage = '') {
  const cleanMessage = String(message || '').trim();
  const normalized = normalizeOutingRequest(cleanMessage);
  const hasAnyIntent = normalized.activities.length > 0 && normalized.activities[0] !== 'explore';

  if (!cleanMessage) {
    return {
      message: 'Merlin is ready to help. Tell me what kind of outing you want — food, shopping, nature, friends, family, or something relaxing.',
      structured: {
        summary: 'Merlin is ready to help.',
        needsClarification: true,
        clarifyingQuestion: 'What kind of outing do you want — food, shopping, nature, friends, family, or something relaxing?',
        plan: {
          date: 'Flexible',
          startLocation: 'Home',
          activities: [{ name: 'Explore', type: 'wander', location: 'A flexible discovery stop' }],
          notes: ['Pick a direction and Merlin will shape the plan.'],
          natureFriendlyTips: ['Keep the route compact and light on unnecessary travel.']
        },
        confidence: 'medium'
      },
      normalized,
      needsClarification: true,
      clarifyingQuestion: 'What kind of outing do you want — food, shopping, nature, friends, family, or something relaxing?',
      fallback: true,
      source: 'local',
      warning: errorMessage || 'Local planner is active.'
    };
  }

  if (!hasAnyIntent) {
    return {
      message: 'I can help with that. What kind of outing do you want — food, shopping, nature, friends, family, or something relaxing?',
      structured: {
        summary: 'Merlin needs a little more direction to plan the outing.',
        needsClarification: true,
        clarifyingQuestion: 'What kind of outing are you in the mood for?',
        plan: {
          date: 'Flexible',
          startLocation: 'Home',
          activities: [{ name: 'Explore', type: 'wander', location: 'A flexible discovery stop' }],
          notes: ['Merlin can build a better plan once you choose a direction.'],
          natureFriendlyTips: ['Keep the outing compact and nature-friendly.']
        },
        confidence: 'medium'
      },
      normalized,
      needsClarification: true,
      clarifyingQuestion: 'What kind of outing are you in the mood for?',
      fallback: true,
      source: 'local',
      warning: errorMessage || 'Local planner is active.'
    };
  }

  const plan = buildLocalPlan(cleanMessage, context);
  const intro = errorMessage
    ? 'Merlin has put together a practical outing plan.'
    : 'Merlin has a practical plan ready for you.';

  const summary = `${intro} For “${cleanMessage}”, I’d start at ${plan.startLocation} and keep the route relaxed with ${plan.activities.map((activity) => activity.name.toLowerCase()).join(', ')}.`;

  const structured = {
    summary,
    title: plan.title,
    needsClarification: false,
    clarifyingQuestion: '',
    plan,
    confidence: 'medium'
  };

  return {
    message: summary,
    structured,
    normalized,
    needsClarification: false,
    clarifyingQuestion: '',
    fallback: true,
    source: 'local',
    warning: errorMessage || 'Local planner is active.'
  };
}

export const buildFallbackMerlinResponse = buildLocalMerlinResponse;

export function normalizeOutingRequest(message = '') {
  const text = String(message || '').toLowerCase();
  const activities = [];

  const activityMap = [
    { key: 'lunch', matches: ['lunch', 'eat', 'food', 'restaurant', 'cafe', 'café', 'coffee', 'brunch', 'dinner', 'meal', 'snacks'] },
    { key: 'shopping', matches: ['shopping', 'mall', 'store', 'boutique', 'shops', 'clothes', 'buy something'] },
    { key: 'park', matches: ['park', 'garden', 'nature', 'walk', 'walking', 'relax', 'peaceful', 'fresh air', 'greenery', 'trees', 'lake'] },
    { key: 'library', matches: ['library', 'study', 'read', 'reading', 'books', 'learning'] },
    { key: 'salon', matches: ['salon', 'haircut', 'hair', 'beauty', 'grooming', 'self-care', 'spa'] },
    { key: 'museum', matches: ['museum', 'gallery', 'art', 'culture'] },
    { key: 'entertainment', matches: ['movies', 'movie', 'entertainment', 'fun', 'games', 'amusement'] },
    { key: 'nature', matches: ['nature', 'outdoors', 'green', 'environment', 'eco-friendly', 'cycling', 'garden', 'trees', 'lake'] },
    { key: 'gym', matches: ['gym', 'workout', 'fitness'] },
    { key: 'college', matches: ['college', 'campus', 'university'] },
    { key: 'office', matches: ['office', 'work'] }
  ];

  for (const activity of activityMap) {
    if (activity.matches.some((value) => text.includes(value))) {
      activities.push(activity.key);
    }
  }

  const dateMood =
    /weekend|saturday|sunday/.test(text)
      ? 'weekend'
      : /today|tomorrow/.test(text)
        ? 'soon'
        : 'flexible';

  const peopleCount =
    /friends|friend group/.test(text)
      ? 'friends'
      : /family/.test(text)
        ? 'family'
        : /alone|solo/.test(text)
          ? 'solo'
          : 'group';

  return {
    activities: activities.length > 0 ? activities : ['explore'],
    dateMood,
    peopleCount,
    rawMessage: message,
    hasFood: /food|eat|restaurant|lunch|dinner|cafe|coffee|brunch|meal|snacks/.test(text),
    hasShopping: /shopping|mall|store|boutique|clothes|buy something/.test(text),
    hasRelaxation: /park|peaceful|relax|nature|walk|outdoors|fresh air|garden|trees|lake/.test(text),
    categories: activities.slice(0, 5)
  };
}
