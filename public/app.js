const state = {
  currentPage: 'frequent',
  messages: [
    {
      role: 'assistant',
      content: 'Hi, I’m Merlin. Tell me what you enjoy, your budget, who is coming, and the area you have in mind. I’ll find nearby ideas for you.'
    }
  ],
  frequentPlaces: [],
  outings: [],
  activePlan: null,
  settings: {
    travelStyle: 'balanced',
    foodBudget: 'medium',
    distancePreference: 'nearby',
    notifications: true
  }
};

const quickActions = [
  'Plan an Outing',
  'My Frequent Places',
  'Food Time',
  'Shopping',
  'Salon Time',
  'Friends & Family',
  'Libraries',
  'Parks',
  'Entertainment'
];

const placeActivityLabels = {
  food: 'Food and drink',
  nature: 'Parks and gardens',
  culture: 'Arts and culture',
  shopping: 'Shopping',
  family: 'Family activities',
  active: 'Sports and fitness',
  quiet: 'Quiet places',
  beach: 'Beaches and waterfront',
  nightlife: 'Nightlife',
  wellness: 'Wellness'
};

const pageLabelMap = {
  frequent: 'Frequent Places',
  talk: 'Talk with Merlin',
  plan: 'Plan an Outing',
  trip: 'Plan Your Next Trip',
  settings: 'Settings'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const sideNav = document.getElementById('sideNav');
const pageTitle = document.getElementById('pageTitle');
const quickRow = document.getElementById('quickRow');
const chatList = document.getElementById('chatList');
const planContainer = document.getElementById('planContainer');
const frequentList = document.getElementById('frequentList');
const outingList = document.getElementById('outingList');
const placeForm = document.getElementById('placeForm');
const askMerlinHeader = document.getElementById('askMerlinHeader');
const placeFinderForm = document.getElementById('placeFinderForm');
const recommendationResults = document.getElementById('recommendationResults');
const recommendationStatus = document.getElementById('recommendationStatus');
const budgetRange = document.getElementById('budgetRange');
const budgetOutput = document.getElementById('budgetOutput');
const tripBudgetSlider = document.getElementById('tripBudgetSlider');
const tripBudgetInput = document.getElementById('tripBudgetInput');
const budgetLevels = [...Array.from({ length: 49 }, (_, index) => 300 + index * 200), 10000];
const merlinFab = document.getElementById('merlinFab');
const merlinDrawer = document.getElementById('merlinDrawer');
const closeMerlinDrawer = document.getElementById('closeMerlinDrawer');
const drawerChat = document.getElementById('drawerChat');
const drawerInput = document.getElementById('drawerInput');
const drawerSend = document.getElementById('drawerSend');
const outingPlannerForm = document.getElementById('outingPlannerForm');
const outingPreview = document.getElementById('outingPreview');
const tripPlannerForm = document.getElementById('tripPlannerForm');
const tripPreview = document.getElementById('tripPreview');
const settingsForm = document.getElementById('settingsForm');
const newChatBtn = document.getElementById('newChatBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const localLoopForm = document.getElementById('localLoopForm');
const localLoopLocation = document.getElementById('localLoopLocation');
const localLoopMood = document.getElementById('localLoopMood');
const localLoopResults = document.getElementById('localLoopResults');

/*
 * Location controls.
 */
const locationModeInputs = () => [...document.querySelectorAll('[name="locationMode"]')];
const locationStatus = document.getElementById('locationStatus');
const searchLocationInput = document.getElementById('searchLocation');

let liveLocationCache = null;

const localLoops = {
  slow: { activities: ['food', 'quiet', 'nature'], budgetRupees: 1100, companions: 'solo' },
  culture: { activities: ['culture', 'food', 'nature'], budgetRupees: 3100, companions: 'friends' },
  family: { activities: ['family', 'nature', 'food'], budgetRupees: 1100, companions: 'kids' },
  sweet: { activities: ['food', 'nature'], budgetRupees: 2300, companions: 'friends' }
};

function budgetIndexForAmount(amount) {
  return budgetLevels.reduce((closestIndex, level, index) =>
    Math.abs(level - Number(amount)) < Math.abs(budgetLevels[closestIndex] - Number(amount))
      ? index
      : closestIndex, 0);
}

function updateBudgetOutput() {
  if (!budgetRange || !budgetOutput) return;

  const budgetRupees = budgetLevels[Number(budgetRange.value)] || budgetLevels[0];
  budgetOutput.value = `₹${new Intl.NumberFormat('en-IN').format(budgetRupees)}`;
  budgetOutput.textContent = budgetOutput.value;
  budgetRange.setAttribute('aria-valuetext', `${budgetOutput.value} per person`);
}

budgetRange?.addEventListener('input', updateBudgetOutput);

tripBudgetSlider?.addEventListener('input', () => {
  if (tripBudgetInput) tripBudgetInput.value = tripBudgetSlider.value;
});

tripBudgetInput?.addEventListener('input', () => {
  const amount = Number(tripBudgetInput.value);

  if (Number.isFinite(amount) && tripBudgetSlider) {
    tripBudgetSlider.value = Math.min(
      Number(tripBudgetSlider.max),
      Math.max(Number(tripBudgetSlider.min), amount)
    );
  }
});

document.querySelectorAll('[data-budget-select]').forEach((select) => {
  select.innerHTML = budgetLevels.map((amount) => `
    <option value="${amount}">₹${new Intl.NumberFormat('en-IN').format(amount)} per person</option>
  `).join('');

  select.value = '3100';
});

function setActivePage(page) {
  state.currentPage = page;

  document.querySelectorAll('.nav-item').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === page);
  });

  document.querySelectorAll('.page-section').forEach((section) => {
    section.classList.toggle('active', section.dataset.page === page);
  });

  document.body.classList.toggle('talk-active', page === 'talk');

  if (pageTitle) {
    pageTitle.textContent = pageLabelMap[page] || 'Merlin';
  }
}

function renderDrawerMessages() {
  if (!drawerChat) return;

  const recent = state.messages.slice(-6);

  drawerChat.innerHTML = recent.map((message) => `
    <div class="message ${message.role}">
      ${message.role === 'assistant' ? '<div class="avatar">🐈</div>' : ''}
      <div class="message-bubble">${escapeHtml(message.content)}</div>
    </div>
  `).join('');
}

function renderQuickActions() {
  if (!quickRow) return;

  quickRow.innerHTML = quickActions.map((label) => `
    <button type="button" class="quick-btn" data-quick-action="${escapeHtml(label)}">${escapeHtml(label)}</button>
  `).join('');

  quickRow.querySelectorAll('[data-quick-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const value = button.dataset.quickAction;

      const activity = {
        'Food Time': 'food',
        Shopping: 'shopping',
        Libraries: 'quiet',
        Parks: 'nature',
        Entertainment: 'culture',
        'Friends & Family': 'family'
      }[value];

      setActivePage('talk');

      if (activity && placeFinderForm) {
        const checkbox = placeFinderForm.querySelector(
          `[name="activities"][value="${activity}"]`
        );

        if (checkbox) checkbox.checked = true;
      }

      document.getElementById('searchLocation')?.focus();
    });
  });
}

function renderMessages() {
  if (chatList) {
    chatList.innerHTML = state.messages.map((message) => `
      <div class="message ${message.role}">
        ${message.role === 'assistant' ? '<div class="avatar">🐈</div>' : ''}
        <div class="message-bubble">${escapeHtml(message.content)}</div>
      </div>
    `).join('');
  }

  renderDrawerMessages();

  if (chatList) {
    chatList.scrollTop = chatList.scrollHeight;
  }

  const lastMessage = state.messages[state.messages.length - 1];

  if (
    lastMessage &&
    lastMessage.role === 'assistant' &&
    lastMessage.structured?.plan
  ) {
    renderPlan(
      lastMessage.structured.plan,
      lastMessage.structured.summary || lastMessage.content
    );
  }
}

/* ---------------- LOCATION SYSTEM ---------------- */

function getSelectedLocationMode() {
  const selected = document.querySelector('[name="locationMode"]:checked');
  return selected?.value || 'manual';
}

function updateLocationModeUI() {
  const mode = getSelectedLocationMode();
  const input = document.getElementById('searchLocation');
  const status = document.getElementById('locationStatus');

  if (!input) return;

  if (mode === 'live') {
    input.disabled = true;
    input.required = false;
    input.placeholder = 'Your live location will be used';

    if (status && !liveLocationCache) {
      status.textContent = 'Merlin will ask for permission to use your current location when you search.';
    }
  } else {
    input.disabled = false;
    input.required = true;
    input.placeholder = 'City, area, or address (e.g., Malleshwaram, Bengaluru)';

    if (status) {
      status.textContent = '';
    }
  }
}

function requestLiveLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Live location is not supported by this browser.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude);
        const longitude = Number(position.coords.longitude);

        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude)
        ) {
          reject(new Error('Merlin received an invalid location from your browser.'));
          return;
        }

        const result = {
          latitude,
          longitude,
          accuracyMeters: Number.isFinite(position.coords.accuracy)
            ? Math.round(position.coords.accuracy)
            : null
        };

        liveLocationCache = result;
        resolve(result);
      },
      (error) => {
        let message = 'Merlin could not access your live location.';

        if (error.code === 1) {
          message = 'Location permission was denied. Please allow location access in your browser or choose Enter a location instead.';
        } else if (error.code === 2) {
          message = 'Your current location could not be determined. Please try again or enter a location manually.';
        } else if (error.code === 3) {
          message = 'Location lookup took too long. Please try again or enter a location manually.';
        }

        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      }
    );
  });
}

async function resolveLocationPreferences(preferences) {
  const mode = getSelectedLocationMode();

  if (mode !== 'live') {
    return {
      ...preferences,
      locationMode: 'manual',
      latitude: null,
      longitude: null,
      locationAccuracyMeters: null
    };
  }

  const status = document.getElementById('locationStatus');

  if (status) {
    status.textContent = '📍 Getting your current location...';
  }

  const liveLocation = await requestLiveLocation();

  if (status) {
    status.textContent = liveLocation.accuracyMeters
      ? `📍 Live location found. Accuracy about ${liveLocation.accuracyMeters} metres.`
      : '📍 Live location found.';
  }

  return {
    ...preferences,
    locationMode: 'live',
    latitude: liveLocation.latitude,
    longitude: liveLocation.longitude,
    locationAccuracyMeters: liveLocation.accuracyMeters,
    location: 'My current location'
  };
}

locationModeInputs().forEach((input) => {
  input.addEventListener('change', () => {
    if (input.checked) {
      if (input.value !== 'live') {
        liveLocationCache = null;
      }

      updateLocationModeUI();
    }
  });
});

updateLocationModeUI();

/* ---------------- LOCAL LOOP ---------------- */

localLoopForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  const location = localLoopLocation?.value.trim();
  if (!location) return;

  const preset = localLoops[localLoopMood?.value] || localLoops.slow;

  placeFinderForm?.querySelectorAll('[name="activities"]').forEach((input) => {
    input.checked = preset.activities.includes(input.value);
  });

  if (budgetRange) {
    budgetRange.value = budgetIndexForAmount(preset.budgetRupees);
    updateBudgetOutput();
  }

  if (placeFinderForm?.elements.companions) {
    placeFinderForm.elements.companions.value = preset.companions;
  }

  if (placeFinderForm?.elements.location) {
    placeFinderForm.elements.location.value = location;
  }

  document.querySelectorAll('[name="locationMode"]').forEach((input) => {
    input.checked = input.value === 'manual';
  });

  updateLocationModeUI();

  setActivePage('talk');

  findNearbySuggestions({
    ...preset,
    location,
    radiusKm: 50,
    transport: 'any'
  });

  if (localLoopResults) {
    localLoopResults.textContent = 'Your Local Loop is being prepared in Talk with Merlin.';
  }
});

/* ---------------- PLANS ---------------- */

function renderPlan(plan, summary) {
  if (!plan || !planContainer) return;

  state.activePlan = plan;

  const items = (plan.activities || [])
    .map((item) => `
      <li>
        ${item.time ? `<strong>${escapeHtml(item.time)}</strong> · ` : ''}
        ${escapeHtml(item.name || 'Destination')}
        · ${escapeHtml(item.type || 'activity')}
        ${item.location ? ` · ${escapeHtml(item.location)}` : ''}
      </li>
    `)
    .join('') || '<li>Flexible plan</li>';

  const notes = (plan.notes || [])
    .map((note) => `<li>${escapeHtml(note)}</li>`)
    .join('') || '<li>Keep the route simple and easy.</li>';

  const tips = (plan.natureFriendlyTips || [])
    .map((tip) => `<li>${escapeHtml(tip)}</li>`)
    .join('') || '<li>Group nearby stops to minimize repeated travel.</li>';

  planContainer.innerHTML = `
    <div class="plan-card">
      <h4>Your Merlin Outing</h4>
      <p>${escapeHtml(summary)}</p>
      <ul>${items}</ul>

      <div class="item-actions" style="margin-top: 12px;">
        <button type="button" class="small-btn" data-plan-action="edit">Edit Plan</button>
        <button type="button" class="small-btn" data-plan-action="add">Add destination</button>
        <button type="button" class="small-btn" data-plan-action="save">Save Outing</button>
      </div>

      <div style="margin-top: 18px;">
        <strong>Notes</strong>
        <ul>${notes}</ul>
      </div>

      <div style="margin-top: 18px;">
        <strong>Nature-friendly ideas</strong>
        <ul>${tips}</ul>
      </div>
    </div>
  `;

  planContainer.querySelectorAll('[data-plan-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      if (button.dataset.planAction === 'save') {
        await saveCurrentOuting(plan, summary);
      }

      if (button.dataset.planAction === 'edit') {
        setActivePage('plan');
      }

      if (button.dataset.planAction === 'add') {
        setActivePage('plan');
      }
    });
  });
}

/* ---------------- FREQUENT PLACES ---------------- */

async function loadFrequentPlaces() {
  try {
    const response = await fetch('/api/frequent-places');
    const data = await response.json();

    state.frequentPlaces = Array.isArray(data.places)
      ? data.places
      : state.frequentPlaces;

    renderFrequentPlaces();
  } catch (error) {
    renderFrequentPlaces();
  }
}

function renderFrequentPlaces() {
  if (!frequentList) return;

  if (!state.frequentPlaces.length) {
    frequentList.innerHTML = `
      <div class="context-box">
        No saved frequent places yet. Add the places you visit most often.
      </div>
    `;
    return;
  }

  frequentList.innerHTML = state.frequentPlaces.map((place) => `
    <div class="place-card" data-place-name="${escapeHtml(place.name)}">
      <div class="place-row">
        <span class="item-label">${escapeHtml(place.name)}</span>

        <div class="item-actions">
          <button
            type="button"
            class="small-btn"
            data-place-action="select"
            data-place-id="${escapeHtml(place.id || place.name)}"
          >
            Use
          </button>

          <button
            type="button"
            class="small-btn"
            data-place-action="delete"
            data-place-id="${escapeHtml(place.id || place.name)}"
          >
            Delete
          </button>
        </div>
      </div>

      <details class="route-details">
        <summary>Budget-friendly ways to get there</summary>

        <div class="route-controls">
          <label class="field-group">
            <span>Starting from</span>
            <input
              type="text"
              data-route-origin
              placeholder="Your starting place or address"
            />
          </label>

          <label class="field-group">
            <span>Approximate distance</span>
            <select data-route-distance>
              <option value="nearby">Nearby</option>
              <option value="town">Across town</option>
              <option value="far">Longer trip</option>
            </select>
          </label>
        </div>

        <div class="route-results" data-route-results>
          ${renderBudgetTravelOptions(place.name, '', 'nearby')}
        </div>
      </details>
    </div>
  `).join('');

  frequentList.querySelectorAll('.place-card').forEach((card) => {
    const refreshSuggestions = () => {
      const destination = card.dataset.placeName;
      const origin = card.querySelector('[data-route-origin]').value;
      const distance = card.querySelector('[data-route-distance]').value;

      card.querySelector('[data-route-results]').innerHTML =
        renderBudgetTravelOptions(destination, origin, distance);
    };

    card.querySelector('[data-route-origin]')
      ?.addEventListener('input', refreshSuggestions);

    card.querySelector('[data-route-distance]')
      ?.addEventListener('change', refreshSuggestions);
  });

  frequentList.querySelectorAll('[data-place-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const { placeAction, placeId } = button.dataset;

      if (placeAction === 'delete') {
        state.frequentPlaces = state.frequentPlaces.filter(
          (place) => (place.id || place.name) !== placeId
        );

        await persistFrequentPlaces();
      }

      if (placeAction === 'select') {
        const place = state.frequentPlaces.find(
          (item) => (item.id || item.name) === placeId
        );

        if (place) {
          setActivePage('talk');

          const startField = document.getElementById('searchLocation');

          if (startField) {
            document.querySelectorAll('[name="locationMode"]').forEach((input) => {
              input.checked = input.value === 'manual';
            });

            startField.disabled = false;
            startField.required = true;
            startField.value = place.name;

            updateLocationModeUI();
            startField.focus();
          }
        }
      }
    });
  });
}

function renderBudgetTravelOptions(destination, origin, distance) {
  const suggestions = {
    nearby: [
      [
        'Walk or cycle',
        'Usually the lowest-cost choice for a nearby stop, when the route is safe and accessible.'
      ],
      [
        'Check local transit',
        'If walking is not practical, compare a single fare with any transfer or day-pass options.'
      ]
    ],

    town: [
      [
        'Bus or local transit',
        'Compare the single fare with a day pass, transfer fare, or other local discount.'
      ],
      [
        'Combine nearby errands',
        'Group stops in the same area to avoid paying for repeated trips.'
      ],
      [
        'Share a ride',
        'Carpool with someone already going that way and agree on the cost beforehand.'
      ]
    ],

    far: [
      [
        'Compare coach and rail',
        'Check advance and off-peak fares, including the cost of getting to each station.'
      ],
      [
        'Check return fares',
        'Compare a return ticket with two singles before booking.'
      ],
      [
        'Share the journey',
        'A carpool can be cheaper when costs are split; include fuel and tolls in the comparison.'
      ]
    ]
  }[distance] || [];

  const routeLabel = origin.trim()
    ? `Budget ideas from <strong>${escapeHtml(origin.trim())}</strong> to <strong>${escapeHtml(destination)}</strong>`
    : `Budget ideas for getting to <strong>${escapeHtml(destination)}</strong>`;

  return `
    <p class="route-direction">${routeLabel}</p>

    <ul class="route-options">
      ${suggestions.map(([title, detail]) => `
        <li>
          <strong>${title}</strong>
          <span>${detail}</span>
        </li>
      `).join('')}
    </ul>

    <p class="route-disclaimer">
      These are general ways to save, not live directions or fare quotes.
      Check local routes, accessibility, and current prices before setting out.
    </p>
  `;
}

async function persistFrequentPlaces() {
  await fetch('/api/frequent-places', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ places: state.frequentPlaces })
  });

  renderFrequentPlaces();
}

/* ---------------- SAVED OUTINGS ---------------- */

async function loadOutings() {
  try {
    const response = await fetch('/api/outings');
    const data = await response.json();

    state.outings = Array.isArray(data.outings)
      ? data.outings
      : [];

    renderOutings();
  } catch (error) {
    renderOutings();
  }
}

function renderOutings() {
  if (!outingList) return;

  if (!state.outings.length) {
    outingList.innerHTML = `
      <div class="context-box">
        No saved outings yet. Once you save a plan, it will appear here.
      </div>
    `;
    return;
  }

  outingList.innerHTML = state.outings.map((outing) => `
    <div class="list-item">
      <div>
        <div class="item-label">${escapeHtml(outing.title || 'Merlin outing')}</div>
        <small>${escapeHtml(outing.date || 'Flexible date')}</small>
      </div>

      <div class="item-actions">
        <button
          type="button"
          class="small-btn"
          data-outing-action="open"
          data-outing-id="${escapeHtml(outing.id)}"
        >
          Open
        </button>

        <button
          type="button"
          class="small-btn"
          data-outing-action="delete"
          data-outing-id="${escapeHtml(outing.id)}"
        >
          Delete
        </button>
      </div>
    </div>
  `).join('');

  outingList.querySelectorAll('[data-outing-action]').forEach((button) => {
    button.addEventListener('click', async () => {
      const { outingAction, outingId } = button.dataset;

      const outing = state.outings.find(
        (item) => String(item.id) === String(outingId)
      );

      if (!outing) return;

      if (outingAction === 'open') {
        renderPlan(outing.plan, outing.summary || 'Saved outing');
        setActivePage('talk');
      }

      if (outingAction === 'delete') {
        await fetch(
          `/api/outings/${encodeURIComponent(outingId)}`,
          { method: 'DELETE' }
        );

        state.outings = state.outings.filter(
          (item) => String(item.id) !== String(outingId)
        );

        renderOutings();
      }
    });
  });
}

async function saveCurrentOuting(plan, summary) {
  const title = typeof summary === 'string'
    ? summary.slice(0, 30)
    : 'Merlin outing';

  const payload = {
    id: `outing_${Date.now()}`,
    title,
    date: plan?.date || 'Flexible',
    summary,
    plan
  };

  const response = await fetch('/api/outings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (result.outing) {
    state.outings = [
      result.outing,
      ...state.outings.filter(
        (item) => item.id !== result.outing.id
      )
    ];

    renderOutings();
  }
}

async function addFrequentPlace() {
  const input = document.getElementById('placeName');
  if (!input) return;

  const name = input.value.trim();
  if (!name) return;

  if (state.frequentPlaces.length >= 5) {
    state.frequentPlaces = [
      ...state.frequentPlaces.slice(1),
      {
        id: `place_${Date.now()}`,
        name
      }
    ];
  } else {
    state.frequentPlaces = [
      ...state.frequentPlaces,
      {
        id: `place_${Date.now()}`,
        name
      }
    ];
  }

  input.value = '';
  await persistFrequentPlaces();
}

placeForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  await addFrequentPlace();
});

/* ---------------- PLACE RESULTS ---------------- */

function renderSuggestions(
  result,
  resultsTarget = recommendationResults,
  context = '',
  schedule = [],
  outingDate = ''
) {
  const places = Array.isArray(result.suggestions)
    ? result.suggestions
    : [];

  const validSpendValues = places
    .map((place) => Number(place.averageSpendRupees))
    .filter((amount) => Number.isFinite(amount));

  const averageSpend = validSpendValues.length
    ? Math.round(
        validSpendValues.reduce((total, amount) => total + amount, 0) /
        validSpendValues.length /
        50
      ) * 50
    : null;

  const formattedAverage = averageSpend === null
    ? ''
    : new Intl.NumberFormat('en-IN').format(averageSpend);

  const formatRupees = (amount) => {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount)) {
      return '₹—';
    }

    return `₹${new Intl.NumberFormat('en-IN').format(
      Math.round(numericAmount)
    )}`;
  };

  const renderPlaceCard = (place) => {
    const spend = Number(place.averageSpendRupees);
    const hasSpend = Number.isFinite(spend);

    const mapsUrl = place.mapsUrl || '#';

    const transitDistance = Number(place.transitDistanceKm);
    const hasTransitDistance = Number.isFinite(transitDistance);

    return `
      <a
        class="recommendation-card"
        href="${escapeHtml(mapsUrl)}"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open ${escapeHtml(place.name)} in Google Maps"
      >
        <div class="recommendation-card-heading">
          <h4>${escapeHtml(place.name)}</h4>
          <span>${escapeHtml(place.distanceKm ?? '—')} km</span>
        </div>

        <p class="recommendation-category">
          ${escapeHtml(place.category || 'Place')}
          ${place.address ? ` · ${escapeHtml(place.address)}` : ''}
        </p>

        ${
          place.detail
            ? `<p class="recommendation-detail">${escapeHtml(place.detail)}</p>`
            : ''
        }

        <p class="recommendation-spend">
          Est. spend:
          <strong>${hasSpend ? formatRupees(spend) : 'Not available'}</strong>
          per person
        </p>

        <div class="recommendation-badges">
          ${
            place.budgetNote
              ? `<span>${escapeHtml(place.budgetNote)}</span>`
              : ''
          }

          ${
            place.wheelchair
              ? '<span>Wheelchair access tagged</span>'
              : ''
          }

          ${
            hasTransitDistance
              ? `<span>Transit stop ${escapeHtml(transitDistance)} km away</span>`
              : ''
          }
        </div>

        <span class="recommendation-open">
          Open in Google Maps
        </span>
      </a>
    `;
  };

  const groups = schedule.length
    ? schedule.map((stop) => ({
        stop,
        places: places.filter(
          (place) =>
            place.category === placeActivityLabels[stop.activity]
        )
      }))
    : [{ stop: null, places }];

  resultsTarget.innerHTML = `
    ${
      context
        ? `<p class="recommendation-context">${escapeHtml(context)}</p>`
        : ''
    }

    ${
      result.totalBudgetRupees !== null &&
      result.totalBudgetRupees !== undefined
        ? `
          <div class="trip-budget-summary">
            <strong>
              Total trip budget:
              ${formatRupees(result.totalBudgetRupees)}
            </strong>

            <span>
              ${formatRupees(result.budgetPerPersonPerDayRupees || 0)}
              per person / day ·
              ${escapeHtml(result.partySize ?? '—')} travelers ·
              ${escapeHtml(result.tripDays ?? '—')} days
            </span>
          </div>
        `
        : ''
    }

    ${
      result.travelEstimates?.length
        ? `
          <section class="trip-travel-estimates">
            <h4>Estimated travel costs</h4>

            <p>
              About ${escapeHtml(result.travelDistanceKm ?? '—')} km
              straight-line from
              ${escapeHtml(result.origin ?? 'your starting point')}
              to
              ${escapeHtml(result.location ?? 'your destination')}.
              Indicative INR ranges per person, one way.
            </p>

            <div class="travel-mode-list">
              ${result.travelEstimates.map((estimate) => `
                <div class="travel-mode-row">
                  <strong>${escapeHtml(estimate.mode)}</strong>

                  <span>
                    ${
                      estimate.available
                        ? `${formatRupees(estimate.lowRupees)}–${formatRupees(estimate.highRupees)}`
                        : 'Usually impractical at this distance'
                    }
                  </span>

                  ${
                    estimate.withinBudget === null ||
                    !estimate.available
                      ? ''
                      : `
                        <small>
                          ${
                            estimate.withinBudget
                              ? 'Within'
                              : 'Over'
                          }
                          per-traveler trip budget
                        </small>
                      `
                  }
                </div>
              `).join('')}
            </div>

            <p class="recommendation-attribution">
              Rough
              ${escapeHtml(result.travelEstimateRegion || 'regional')}
              planning estimates using straight-line distance,
              not live operator fares. Confirm current prices with
              the transport operator.
            </p>
          </section>
        `
        : ''
    }

    ${
      result.warning
        ? `<div class="recommendation-empty">${escapeHtml(result.warning)}</div>`
        : ''
    }

    ${
      places.length
        ? `
          <p class="recommendation-intro">
            ${places.length}
            ${places.length === 1 ? 'nearby idea' : 'nearby ideas'}
            around
            <strong>${escapeHtml(result.location || 'your location')}</strong>
          </p>
        `
        : ''
    }

    ${
      averageSpend !== null
        ? `
          <div class="recommendation-average">
            <span>Average estimated spend</span>
            <strong>₹${formattedAverage} per person</strong>
            <small>
              Planning estimate based on your selected budget and activity,
              not a venue quote.
            </small>
          </div>
        `
        : ''
    }

    ${
      places.length
        ? groups.map(({ stop, places: stopPlaces }) => `
          <section class="recommendation-stop">
            ${
              stop
                ? `
                  <h4>
                    <time>${escapeHtml(stop.time)}</time>
                    ·
                    ${escapeHtml(placeActivityLabels[stop.activity])}
                  </h4>
                `
                : ''
            }

            ${
              stopPlaces.length
                ? `
                  <div class="recommendation-list">
                    ${stopPlaces.map(renderPlaceCard).join('')}
                  </div>
                `
                : `
                  <div class="recommendation-empty">
                    No matching mapped places were found for this stop.
                  </div>
                `
            }
          </section>
        `).join('')
        : `
          <div class="recommendation-empty">
            No mapped place suggestions are available for
            ${escapeHtml(result.location || 'this destination')}
            right now.
          </div>
        `
    }

    ${
      schedule.length
        ? `
          <button
            type="button"
            class="primary-btn wide"
            data-save-scheduled-outing
          >
            Save timed outing
          </button>
        `
        : ''
    }

    <p class="recommendation-attribution">
      ${escapeHtml(
        result.attribution ||
        'Place information is provided for planning purposes.'
      )}
      Opening hours and prices may be missing or out of date.
    </p>
  `;

  const saveButton = resultsTarget.querySelector(
    '[data-save-scheduled-outing]'
  );

  saveButton?.addEventListener('click', async () => {
    const activities = schedule.map((stop) => ({
      name: placeActivityLabels[stop.activity],
      type: stop.activity,
      time: stop.time,
      location:
        groups
          .find((group) => group.stop === stop)
          ?.places
          .map((place) => place.name)
          .join(', ') ||
        'No mapped suggestion yet'
    }));

    const summary =
      `${schedule.length}-stop timed outing in ${result.location}`;

    await saveCurrentOuting(
      {
        date: outingDate || 'Flexible date',
        startLocation: result.location,
        activities
      },
      summary
    );

    const statusTarget = document.getElementById('outingStatus');

    if (statusTarget) {
      statusTarget.textContent =
        'Timed outing saved with its destination reminders.';
    }
  });
}

/* ---------------- SEARCH ---------------- */

async function findNearbySuggestions(preferences, options = {}) {
  const resultsTarget =
    options.resultsTarget || recommendationResults;

  const statusTarget =
    options.statusTarget || recommendationStatus;

  const submitButton =
    options.submitButton ||
    document.getElementById('findPlacesButton');

  if (!resultsTarget || !statusTarget) return;

  statusTarget.textContent =
    'Merlin is checking nearby places and matching your preferences...';

  resultsTarget.innerHTML =
    '<div class="recommendation-empty">Searching nearby places...</div>';

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const resolvedPreferences =
      await resolveLocationPreferences(preferences);

    const response = await fetch('/api/places/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resolvedPreferences)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(
        result.error ||
        'Merlin could not find nearby suggestions.'
      );
    }

    renderSuggestions(
      result,
      resultsTarget,
      options.context || '',
      options.schedule || [],
      options.date || ''
    );

    statusTarget.textContent =
      result.warning
        ? `${result.suggestions?.length || 0} suggestions found with a planning note.`
        : `${result.suggestions?.length || 0} suggestions matched your preferences.`;

    state.settings.outingSearch = resolvedPreferences;

    await fetch('/api/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(state.settings)
    });
  } catch (error) {
    resultsTarget.innerHTML = `
      <div class="recommendation-empty">
        ${escapeHtml(error.message)}
      </div>
    `;

    statusTarget.textContent =
      'Search could not be completed.';
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

placeFinderForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const formData = new FormData(placeFinderForm);

  const preferences = {
    activities: formData.getAll('activities'),
    location: formData.get('location'),
    budgetRupees:
      budgetLevels[Number(formData.get('budgetLevel'))],
    companions: formData.get('companions'),
      radiusKm: formData.get('radiusKm'),
    transport: formData.get('transport')
  };

  await findNearbySuggestions(preferences);
});

placeFinderForm?.addEventListener('change', (event) => {
  if (!event.target.matches('[name="activities"]:checked')) return;

  const selectedActivities =
    placeFinderForm.querySelectorAll(
      '[name="activities"]:checked'
    );

  if (selectedActivities.length > 3) {
    event.target.checked = false;

    if (recommendationStatus) {
      recommendationStatus.textContent =
        'Choose up to three activities so Merlin can keep your results focused.';
    }
  }
});

/* ---------------- CHAT ---------------- */

async function fetchMerlinResponse(message) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message,
      history: state.messages,
      context: {
        page: state.currentPage
      }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    const details =
      result.details
        ? ` ${result.details}`
        : '';

    throw new Error(
      `${result.error || 'Could not reach Merlin.'}${details}`
    );
  }

  return result;
}

async function sendPrompt(
  messageOverride = null,
  input = drawerInput
) {
  if (!input) return;

  const message =
    (messageOverride ?? input.value).trim();

  if (!message) return;

  const transcript =
    drawerChat || chatList;

  if (!transcript) return;

  state.messages.push({
    role: 'user',
    content: message
  });

  renderMessages();

  input.value = '';

  const loading =
    document.createElement('div');

  loading.className =
    'message assistant';

  loading.innerHTML =
    '<div class="avatar">🐈</div>' +
    '<div class="message-bubble">' +
    '<div class="loading">' +
    '<span class="dot"></span>' +
    '<span class="dot"></span>' +
    '<span class="dot"></span>' +
    '</div>' +
    '</div>';

  transcript.appendChild(loading);
  transcript.scrollTop = transcript.scrollHeight;

  try {
    const result =
      await fetchMerlinResponse(message);

    loading.remove();

    state.messages.push({
      role: 'assistant',
      content: result.message,
      structured: result.structured || null,
      placeSearch: result.placeSearch || null
    });

    renderMessages();
  } catch (error) {
    loading.remove();

    state.messages.push({
      role: 'assistant',
      content: `Merlin hit a snag: ${error.message}`
    });

    renderMessages();
  }
}

drawerSend?.addEventListener('click', () => {
  setActivePage('talk');
  sendPrompt();
});

drawerInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    setActivePage('talk');
    sendPrompt();
  }
});

askMerlinHeader?.addEventListener('click', () => {
  setActivePage('talk');
  document.getElementById('searchLocation')?.focus();
});

merlinFab?.addEventListener('click', () => {
  if (state.currentPage === 'talk') {
    merlinDrawer?.classList.remove('open');
    document.getElementById('searchLocation')?.focus();
    return;
  }

  merlinDrawer?.classList.toggle('open');

  if (merlinDrawer?.classList.contains('open')) {
    drawerInput?.focus();
  }
});

closeMerlinDrawer?.addEventListener('click', () => {
  merlinDrawer?.classList.remove('open');
});

/* ---------------- VISUAL EFFECT ---------------- */

document.addEventListener('click', (event) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const control =
    event.target instanceof Element
      ? event.target.closest(
          'button, a, input, select, textarea, summary, [role="button"]'
        )
      : null;

  if (!control || control.disabled) return;

  const leaf =
    document.createElement('span');

  leaf.className =
    'falling-leaf';

  leaf.setAttribute(
    'aria-hidden',
    'true'
  );

  leaf.textContent = '🍃';

  leaf.style.left =
    `${event.clientX}px`;

  leaf.style.top =
    `${event.clientY}px`;

  leaf.style.setProperty(
    '--leaf-duration',
    `${(2.8 + Math.random() * 2.4).toFixed(2)}s`
  );

  leaf.style.setProperty(
    '--leaf-distance',
    `${120 + Math.round(Math.random() * 120)}px`
  );

  leaf.style.setProperty(
    '--leaf-drift',
    `${Math.round((Math.random() - 0.5) * 120)}px`
  );

  leaf.style.setProperty(
    '--leaf-rotation',
    `${Math.round((Math.random() - 0.5) * 360)}deg`
  );

  leaf.addEventListener(
    'animationend',
    () => leaf.remove(),
    { once: true }
  );

  document.body.append(leaf);
});

/* ---------------- NAVIGATION ---------------- */

document.querySelectorAll('.nav-item').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.preventDefault();

    const page = button.dataset.page;

    if (!page) return;

    setActivePage(page);
  });
});

document.querySelectorAll('[data-context-message]')
  .forEach((button) => {
    button.addEventListener('click', () => {
      setActivePage('talk');

      merlinDrawer?.classList.remove('open');

      if (recommendationStatus) {
        recommendationStatus.textContent =
          'Choose an activity and enter a city or neighborhood to get tailored suggestions.';
      }

      document.getElementById('searchLocation')?.focus();
    });
  });

/* ---------------- PLANNER HELPERS ---------------- */

function inferPlannerActivities(formData) {
  const selected =
    formData.getAll('activities');

  const focus =
    `${formData.get('focus') || ''} ${formData.get('style') || ''}`
      .toLowerCase();

  const inferred = [];

  if (/food|cafe|café|restaurant|street/.test(focus)) {
    inferred.push('food');
  }

  if (/park|nature|relax|beach|outdoor/.test(focus)) {
    inferred.push('nature');
  }

  if (/culture|heritage|museum|art/.test(focus)) {
    inferred.push('culture');
  }

  if (/shop|market|bazaar/.test(focus)) {
    inferred.push('shopping');
  }

  if (/active|sport|fitness/.test(focus)) {
    inferred.push('active');
  }

  if (
    /hotel|stay|accommodation|lodging|hostel|resort/.test(
      `${focus} ${formData.get('stay') || ''}`.toLowerCase()
    )
  ) {
    inferred.push('stay');
  }

  return [
    ...new Set([
      ...selected,
      ...inferred
    ])
  ].slice(0, 3);
}

function plannerCompanion(formData) {
  const value =
    String(
      formData.get('companions') ||
      formData.get('people') ||
      'friends'
    ).toLowerCase();

  if (value === 'solo') return 'solo';
  if (value === 'partner' || value === 'date') return 'date';

  if (
    value.includes('family') &&
    value.includes('kid')
  ) {
    return 'kids';
  }

  if (value.includes('family')) {
    return 'family';
  }

  return 'friends';
}

function formatReminderTime(value) {
  const [hours, minutes] =
    String(value || '')
      .split(':')
      .map(Number);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes)
  ) {
    return String(value || '');
  }

  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(
    new Date(2000, 0, 1, hours, minutes)
  );
}

function handlePlannerSubmit(event, options) {
  event.preventDefault();

  const formData =
    new FormData(event.currentTarget);

  const schedule =
    options.schedule?.(formData) || [];

  const activities =
    schedule.length
      ? [...new Set(
          schedule.map(
            (stop) => stop.activity
          )
        )]
      : inferPlannerActivities(formData);

  if (!activities.length) {
    options.statusTarget.textContent =
      'Choose at least one activity so Merlin can find matching places.';

    options.form
      .querySelector(
        '.itinerary-stops, .activity-fieldset'
      )
      ?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

    return;
  }

  const context =
    options.context(formData);

  findNearbySuggestions(
    {
      activities,
      location:
        formData.get('searchLocation'),
      budgetRupees:
        Number(formData.get('budgetRupees')),
      companions:
        plannerCompanion(formData),
      radiusKm:
              formData.get('radiusKm'),
      transport:
        formData.get('transport'),
      ...(options.extraPreferences
        ? options.extraPreferences(formData)
        : {})
    },
    {
      resultsTarget:
        options.resultsTarget,

      statusTarget:
        options.statusTarget,

      submitButton:
        options.submitButton,

      context,
      schedule,
      date:
        formData.get('date') || ''
    }
  );
}

outingPlannerForm?.addEventListener(
  'submit',
  (event) =>
    handlePlannerSubmit(event, {
      form: outingPlannerForm,
      resultsTarget: outingPreview,
      statusTarget:
        document.getElementById('outingStatus'),
      submitButton:
        document.getElementById('outingSearchButton'),

      schedule: (formData) =>
        formData
          .getAll('stopActivity')
          .flatMap((activity, index) =>
            activity
              ? [{
                  activity,
                  time: formatReminderTime(
                    formData.getAll('stopTime')[index]
                  )
                }]
              : []
          ),

      context: (formData) =>
        `${formData.get('date') || 'Flexible date'} · ${
          formData.get('style') || 'Balanced'
        } outing`
    })
);

tripPlannerForm?.addEventListener(
  'submit',
  (event) =>
    handlePlannerSubmit(event, {
      form: tripPlannerForm,
      resultsTarget: tripPreview,
      statusTarget:
        document.getElementById('tripStatus'),
      submitButton:
        document.getElementById('tripSearchButton'),

      context: (formData) =>
        `${formData.get('tripName') || 'Trip'} · ${
          formData.get('focus') || 'Flexible focus'
        } · Total budget ₹${
          new Intl.NumberFormat('en-IN').format(
            Number(formData.get('budgetRupees')) || 0
          )
        }`,

      extraPreferences: (formData) => ({
        budgetMode: 'trip',
        origin: formData.get('origin'),
        accommodation:
          formData.get('stay'),
        partySize:
          Number(formData.get('partySize')),
        tripDays:
          Number(formData.get('tripDays'))
      })
    })
);

document.querySelectorAll('.planner-form')
  .forEach((form) => {
    form.addEventListener('change', (event) => {
      if (
        !event.target.matches(
          '[name="activities"]:checked'
        )
      ) {
        return;
      }

      const selectedActivities =
        form.querySelectorAll(
          '[name="activities"]:checked'
        );

      if (selectedActivities.length > 3) {
        event.target.checked = false;

        const status = form.querySelector('.recommendation-status');

        if (status) {
          status.textContent =
            'Choose up to three activities so Merlin can keep your results focused.';
        }
      }
    });
  });

/* ---------------- SETTINGS ---------------- */

settingsForm?.addEventListener(
  'submit',
  async (event) => {
    event.preventDefault();

    state.settings = {
      ...state.settings,
      travelStyle:
        document.getElementById('travelStyle')?.value ||
        'balanced',

      foodBudget:
        document.getElementById('foodBudget')?.value ||
        'medium',

      distancePreference:
        document.getElementById('distancePreference')?.value ||
        'nearby',

      notifications:
        document.getElementById('notifications')?.checked ??
        true
    };

    await fetch('/api/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(state.settings)
    });

    const toast =
      document.createElement('div');

    toast.className =
      'context-box';

    toast.textContent =
      'Merlin saved your preferences.';

    document
      .querySelector('[data-page="settings"]')
      ?.appendChild(toast);

    setTimeout(
      () => toast.remove(),
      2000
    );
  }
);

async function loadSettings() {
  try {
    const response =
      await fetch('/api/preferences');

    const data =
      await response.json();

    const settings =
      data.preferences || {};

    state.settings = {
      ...state.settings,
      ...settings
    };

    const travelStyle =
      document.getElementById('travelStyle');

    const foodBudget =
      document.getElementById('foodBudget');

    const distancePreference =
      document.getElementById('distancePreference');

    const notifications =
      document.getElementById('notifications');

    if (travelStyle) {
      travelStyle.value =
        state.settings.travelStyle ||
        'balanced';
    }

    if (foodBudget) {
      foodBudget.value =
        state.settings.foodBudget ||
        'medium';
    }

    if (distancePreference) {
      distancePreference.value =
        state.settings.distancePreference ||
        'nearby';
    }

    if (notifications) {
      notifications.checked =
        Boolean(state.settings.notifications);
    }

    const outingSearch =
      state.settings.outingSearch;

    if (outingSearch && placeFinderForm) {
      placeFinderForm
        .querySelectorAll('[name="activities"]')
        .forEach((input) => {
          input.checked =
            outingSearch.activities?.includes(
              input.value
            ) || false;
        });

      for (
        const [name, value]
        of Object.entries(outingSearch)
      ) {
        if (name === 'budgetRupees') {
          if (budgetRange) {
            budgetRange.value =
              budgetIndexForAmount(value);
          }
        } else if (
          name !== 'activities' &&
          placeFinderForm.elements[name]
        ) {
          placeFinderForm.elements[name].value =
            value;
        }
      }

      /*
       * Do not restore live coordinates as an
       * automatic location.
       */
      if (
        outingSearch.locationMode === 'live'
      ) {
        document.querySelectorAll(
          '[name="locationMode"]'
        ).forEach((input) => {
          input.checked =
            input.value === 'manual';
        });

        if (placeFinderForm.elements.location) {
          placeFinderForm.elements.location.value = '';
        }
      }

      updateBudgetOutput();
      updateLocationModeUI();
    }
  } catch (error) {
    // Keep defaults.
  }
}

/* ---------------- INITIALIZATION ---------------- */

async function initialize() {
  renderQuickActions();
  renderMessages();
  renderFrequentPlaces();
  renderOutings();

  await loadSettings();
  await loadFrequentPlaces();
  await loadOutings();

  updateBudgetOutput();
  updateLocationModeUI();

  setActivePage('frequent');
}

initialize();
