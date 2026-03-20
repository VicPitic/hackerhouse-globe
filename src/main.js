import Globe from 'globe.gl';
import * as THREE from 'three';
import './style.css';
import { HACKERHOUSES } from './data/hackerhouses';

const REGION_COLORS = {
  'North America': '#7dd3fc',
  'South America': '#f6ad55',
  Europe: '#c4b5fd',
  Africa: '#fca5a5',
  'Middle East': '#fcd34d',
  Asia: '#86efac',
  Oceania: '#a5b4fc'
};

const DEFAULT_MARKER_MODEL = 'orb';
const MARKER_MODEL_STORAGE_KEY = 'hackerhouse-map.marker-models.v1';
const MARKER_MODEL_OPTIONS = [
  { value: 'orb', label: 'Classic Orb' },
  { value: 'house', label: 'House' },
  { value: 'car', label: 'Car' },
  { value: 'skyscraper', label: 'Skyscraper' },
  { value: 'temple', label: 'Japanese Temple' }
];
const MARKER_MODEL_LABELS = MARKER_MODEL_OPTIONS.reduce((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});
const VALID_MARKER_MODELS = new Set(MARKER_MODEL_OPTIONS.map((option) => option.value));
const OUTWARD_MODEL_ROTATION = { x: 90 };
const GLOBE_RADIUS_UNITS = 100;
const MARKER_LAYOUT_MIN_SEPARATION = 2.1;
const MARKER_LAYOUT_INTERACTION_DISTANCE = 5.5;
const MARKER_LAYOUT_ITERATIONS = 220;
const MARKER_LAYOUT_ANCHOR_STRENGTH = 0.01;
const MARKER_LAYOUT_MAX_OFFSET = 5.6;
const MIN_LONGITUDE_COSINE = 0.2;

const dom = {
  globe: document.getElementById('globeViz'),
  search: document.getElementById('searchInput'),
  markerModel: document.getElementById('markerModelSelect'),
  detailsEmpty: document.getElementById('houseDetailsEmpty'),
  detailsCard: document.getElementById('houseDetailsCard'),
  detailsRegion: document.getElementById('houseRegion'),
  detailsTitle: document.getElementById('houseTitle'),
  detailsTitleFavicon: document.getElementById('houseTitleFavicon'),
  detailsLocation: document.getElementById('houseLocation'),
  detailsBio: document.getElementById('houseBio'),
  detailsFocus: document.getElementById('houseFocus'),
  detailsStatus: document.getElementById('houseStatus'),
  detailsVisitSite: document.getElementById('houseVisitSite'),
  detailsClose: document.getElementById('houseDetailsClose')
};

const state = {
  query: '',
  filtered: [...HACKERHOUSES],
  layoutById: new Map(),
  selectedId: null,
  hoveredId: null,
  markerModels: loadMarkerModels()
};

const markerGeometries = {
  orb: new THREE.SphereGeometry(0.74, 24, 24),
  halo: new THREE.SphereGeometry(0.84, 24, 24),
  stem: new THREE.CylinderGeometry(0.1, 0.13, 0.5, 14),
  houseBody: new THREE.BoxGeometry(1.28, 0.9, 1.1),
  houseRoof: new THREE.ConeGeometry(0.9, 0.62, 4),
  houseDoor: new THREE.BoxGeometry(0.24, 0.42, 0.12),
  chimney: new THREE.BoxGeometry(0.18, 0.34, 0.18),
  carBase: new THREE.BoxGeometry(1.82, 0.5, 0.96),
  carCabin: new THREE.BoxGeometry(1.02, 0.4, 0.82),
  carWheel: new THREE.CylinderGeometry(0.2, 0.2, 0.18, 18),
  tower: new THREE.BoxGeometry(0.96, 2.2, 0.96),
  towerTop: new THREE.BoxGeometry(0.74, 0.42, 0.74),
  towerAntenna: new THREE.CylinderGeometry(0.07, 0.07, 0.48, 10),
  templeBase: new THREE.BoxGeometry(1.65, 0.34, 1.65),
  templeTierLarge: new THREE.BoxGeometry(0.96, 0.42, 0.96),
  templeTierMedium: new THREE.BoxGeometry(0.75, 0.38, 0.75),
  templeTierSmall: new THREE.BoxGeometry(0.56, 0.34, 0.56),
  templeRoofLarge: new THREE.CylinderGeometry(1.28, 1.52, 0.15, 8),
  templeRoofMedium: new THREE.CylinderGeometry(0.96, 1.2, 0.13, 8),
  templeRoofSmall: new THREE.CylinderGeometry(0.72, 0.92, 0.11, 8),
  templeSpire: new THREE.ConeGeometry(0.13, 0.38, 8)
};

const globe = Globe()(dom.globe)
  .globeImageUrl('//unpkg.com/three-globe/example/img/earth-night.jpg')
  .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')
  .backgroundColor('rgba(0,0,0,0)')
  .showAtmosphere(true)
  .atmosphereColor('#9ed9ff')
  .atmosphereAltitude(0.18)
  .objectLabel((house) => {
    const markerModel = MARKER_MODEL_LABELS[getHouseMarkerModel(house)] || MARKER_MODEL_LABELS[DEFAULT_MARKER_MODEL];

    return `<div class="point-tip"><strong>${escapeHtml(house.name)}</strong><br>${escapeHtml(house.city)}, ${escapeHtml(
      house.country
    )}<br>${escapeHtml(house.focus)}<br>Marker: ${escapeHtml(markerModel)}</div>`;
  })
  .onObjectClick((house) => selectHouse(house.id))
  .onObjectHover((house) => {
    const hoveredId = house ? house.id : null;
    if (state.hoveredId === hoveredId) {
      return;
    }

    state.hoveredId = hoveredId;
    dom.globe.style.cursor = house ? 'pointer' : 'grab';
    refreshMapData();
  });

const controls = globe.controls();
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.rotateSpeed = 0.55;
controls.zoomSpeed = 0.7;
controls.panSpeed = 0.5;
controls.noPan = true;

const scene = globe.scene();
scene.background = new THREE.Color('#040711');
scene.add(new THREE.AmbientLight(0xffffff, 0.95));
addStarfield(scene);

globe.pointOfView({ lat: 18, lng: 10, altitude: 2.4 });
setupMarkerModelControl();

dom.search.addEventListener('input', () => {
  state.query = dom.search.value.trim().toLowerCase();
  applyFilters();
});

dom.detailsClose.addEventListener('click', clearSelection);
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    clearSelection();
  }
});

window.addEventListener('resize', resizeGlobe);
resizeGlobe();
applyFilters();

function applyFilters() {
  state.filtered = HACKERHOUSES.filter((house) => {
    const haystack =
      `${house.name} ${house.city} ${house.country} ${house.region} ${house.focus} ${house.summary}`.toLowerCase();
    return haystack.includes(state.query);
  });

  if (!state.filtered.some((house) => house.id === state.selectedId)) {
    state.selectedId = null;
  }

  state.layoutById = buildHouseLayout(state.filtered);
  refreshMapData();
  renderDetailsCard();
}

function selectHouse(id) {
  const house = HACKERHOUSES.find((entry) => entry.id === id);
  if (!house) {
    return;
  }

  if (state.selectedId === house.id) {
    clearSelection();
    return;
  }

  state.selectedId = house.id;
  refreshMapData();
  renderDetailsCard();
  const displayPosition = getHouseDisplayPosition(house);

  globe.pointOfView(
    {
      lat: displayPosition.lat,
      lng: displayPosition.lng,
      altitude: 1.45
    },
    1100
  );
}

function clearSelection() {
  if (state.selectedId === null) {
    return;
  }

  state.selectedId = null;
  refreshMapData();
  renderDetailsCard();
}

function refreshMapData() {
  globe
    .pointsData([])
    .objectsData(state.filtered)
    .objectLat((house) => getHouseDisplayPosition(house).lat)
    .objectLng((house) => getHouseDisplayPosition(house).lng)
    .objectAltitude((house) => {
      if (house.id === state.selectedId) {
        return 0.024;
      }

      if (house.id === state.hoveredId) {
        return 0.02;
      }

      return 0.016;
    })
    .objectRotation(OUTWARD_MODEL_ROTATION)
    .objectThreeObject((house) => createHouseMarker(house));
}

function getHouseDisplayPosition(house) {
  return state.layoutById.get(house.id) || house;
}

function buildHouseLayout(houses) {
  const layout = new Map(houses.map((house) => [house.id, { lat: house.lat, lng: house.lng }]));
  if (houses.length < 2) {
    return layout;
  }

  const offsets = buildMarkerOffsets(houses);
  houses.forEach((house, index) => {
    layout.set(house.id, toDisplayCoordinates(house, offsets[index]));
  });

  return layout;
}

function buildMarkerOffsets(houses) {
  // Relax nearby markers in a local tangent plane so dense regions stay readable.
  const offsets = Array.from({ length: houses.length }, () => ({ x: 0, y: 0 }));
  const neighborPairs = [];

  for (let firstIndex = 0; firstIndex < houses.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < houses.length; secondIndex += 1) {
      const baseVector = getPairBaseVector(houses[firstIndex], houses[secondIndex]);
      if (Math.hypot(baseVector.x, baseVector.y) <= MARKER_LAYOUT_INTERACTION_DISTANCE) {
        neighborPairs.push({
          firstIndex,
          secondIndex,
          baseX: baseVector.x,
          baseY: baseVector.y
        });
      }
    }
  }

  if (!neighborPairs.length) {
    return offsets;
  }

  for (let iteration = 0; iteration < MARKER_LAYOUT_ITERATIONS; iteration += 1) {
    neighborPairs.forEach(({ firstIndex, secondIndex, baseX, baseY }) => {
      const firstOffset = offsets[firstIndex];
      const secondOffset = offsets[secondIndex];
      let deltaX = baseX + (secondOffset.x - firstOffset.x);
      let deltaY = baseY + (secondOffset.y - firstOffset.y);
      let distance = Math.hypot(deltaX, deltaY);

      if (distance >= MARKER_LAYOUT_MIN_SEPARATION) {
        return;
      }

      if (distance < 1e-5) {
        const angle = pairHashAngle(houses[firstIndex].id, houses[secondIndex].id);
        deltaX = Math.cos(angle);
        deltaY = Math.sin(angle);
        distance = 1;
      }

      const overlap = MARKER_LAYOUT_MIN_SEPARATION - distance;
      const shift = overlap * 0.5;
      const normX = deltaX / distance;
      const normY = deltaY / distance;

      firstOffset.x -= normX * shift;
      firstOffset.y -= normY * shift;
      secondOffset.x += normX * shift;
      secondOffset.y += normY * shift;
    });

    offsets.forEach((offset) => {
      offset.x *= 1 - MARKER_LAYOUT_ANCHOR_STRENGTH;
      offset.y *= 1 - MARKER_LAYOUT_ANCHOR_STRENGTH;

      const magnitude = Math.hypot(offset.x, offset.y);
      if (magnitude > MARKER_LAYOUT_MAX_OFFSET) {
        const scale = MARKER_LAYOUT_MAX_OFFSET / magnitude;
        offset.x *= scale;
        offset.y *= scale;
      }
    });
  }

  return offsets;
}

function getPairBaseVector(firstHouse, secondHouse) {
  const meanLatitudeRad = degreesToRadians((firstHouse.lat + secondHouse.lat) * 0.5);
  return {
    x: GLOBE_RADIUS_UNITS * degreesToRadians(secondHouse.lng - firstHouse.lng) * Math.cos(meanLatitudeRad),
    y: GLOBE_RADIUS_UNITS * degreesToRadians(secondHouse.lat - firstHouse.lat)
  };
}

function toDisplayCoordinates(house, offset) {
  const shiftedLat = clamp(house.lat + radiansToDegrees(offset.y / GLOBE_RADIUS_UNITS), -89.5, 89.5);
  const cosLat = Math.max(MIN_LONGITUDE_COSINE, Math.cos(degreesToRadians(shiftedLat)));
  const shiftedLng = normalizeLongitude(house.lng + radiansToDegrees(offset.x / (GLOBE_RADIUS_UNITS * cosLat)));

  return { lat: shiftedLat, lng: shiftedLng };
}

function pairHashAngle(firstId, secondId) {
  const key = firstId < secondId ? `${firstId}|${secondId}` : `${secondId}|${firstId}`;
  let hash = 2166136261;

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

function normalizeLongitude(value) {
  let longitude = value;
  while (longitude > 180) {
    longitude -= 360;
  }
  while (longitude < -180) {
    longitude += 360;
  }
  return longitude;
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value) {
  return (value * 180) / Math.PI;
}

function renderDetailsCard() {
  const house = state.selectedId ? HACKERHOUSES.find((entry) => entry.id === state.selectedId) : null;

  if (!house) {
    dom.detailsEmpty.hidden = false;
    dom.detailsCard.hidden = true;
    return;
  }

  dom.detailsEmpty.hidden = true;
  dom.detailsCard.hidden = false;
  dom.detailsRegion.textContent = house.region;
  dom.detailsTitle.textContent = house.name;
  dom.detailsLocation.textContent = `${house.city}, ${house.country}`;
  dom.detailsBio.textContent = house.summary;
  dom.detailsFocus.textContent = house.focus;
  dom.detailsStatus.textContent = house.status;
  dom.detailsVisitSite.href = getVisitSiteUrl(house);
  dom.detailsVisitSite.setAttribute('aria-label', `Visit ${house.name} site`);
  updateVisitSiteFavicon(house);
  dom.markerModel.value = getHouseMarkerModel(house);
}

function getVisitSiteUrl(house) {
  if (house.website) {
    return house.website;
  }

  const searchQuery = encodeURIComponent(`${house.name} ${house.city} ${house.country}`);
  return `https://www.google.com/search?q=${searchQuery}`;
}

function updateVisitSiteFavicon(house) {
  const faviconUrl = getFaviconUrl(house.website);
  if (faviconUrl) {
    dom.detailsTitleFavicon.src = faviconUrl;
    dom.detailsTitleFavicon.hidden = false;
    return;
  }

  dom.detailsTitleFavicon.removeAttribute('src');
  dom.detailsTitleFavicon.hidden = true;
}

function getFaviconUrl(website) {
  if (!website) {
    return '';
  }

  try {
    const { hostname } = new URL(website);
    if (!hostname) {
      return '';
    }

    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  } catch {
    return '';
  }
}

function resizeGlobe() {
  globe.width(window.innerWidth);
  globe.height(window.innerHeight);
}

function addStarfield(targetScene) {
  const starCount = 3500;
  const positions = new Float32Array(starCount * 3);

  for (let i = 0; i < starCount; i += 1) {
    const i3 = i * 3;
    const radius = 820 + Math.random() * 520;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    positions[i3 + 2] = radius * Math.cos(phi);
  }

  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const starsMaterial = new THREE.PointsMaterial({
    color: '#d9f5ff',
    size: 1.4,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });

  targetScene.add(new THREE.Points(starsGeometry, starsMaterial));
}

function createHouseMarker(house) {
  const isSelected = house.id === state.selectedId;
  const isHovered = house.id === state.hoveredId;
  const color = isSelected ? '#ff8a3d' : isHovered ? '#ffe18a' : REGION_COLORS[house.region] || '#9ca3af';
  const marker = new THREE.Group();
  const emissiveIntensity = isSelected ? 0.55 : isHovered ? 0.4 : 0.24;
  const materials = createMarkerMaterials(color, emissiveIntensity);
  const model = getHouseMarkerModel(house);

  marker.add(createMarkerStem(materials.shadow));
  marker.add(createMarkerModel(model, materials));
  marker.add(createMarkerHalo(color, isSelected, isHovered));

  marker.scale.setScalar(isSelected ? 1.22 : isHovered ? 1.08 : 1);

  return marker;
}

function createMarkerStem(stemMaterial) {
  const stem = new THREE.Mesh(markerGeometries.stem, stemMaterial);
  stem.position.y = 0.24;
  return stem;
}

function createMarkerModel(model, materials) {
  switch (model) {
    case 'house':
      return createHouseModel(materials);
    case 'car':
      return createCarModel(materials);
    case 'skyscraper':
      return createSkyscraperModel(materials);
    case 'temple':
      return createTempleModel(materials);
    default:
      return createOrbModel(materials);
  }
}

function createOrbModel(materials) {
  const model = new THREE.Group();

  const orb = new THREE.Mesh(markerGeometries.orb, materials.main);
  orb.position.y = 0.92;
  model.add(orb);

  return model;
}

function createHouseModel(materials) {
  const model = new THREE.Group();

  const body = new THREE.Mesh(markerGeometries.houseBody, materials.main);
  body.position.y = 0.86;
  model.add(body);

  const roof = new THREE.Mesh(markerGeometries.houseRoof, materials.accent);
  roof.position.y = 1.62;
  roof.rotation.y = Math.PI * 0.25;
  model.add(roof);

  const door = new THREE.Mesh(markerGeometries.houseDoor, materials.shadow);
  door.position.set(0, 0.54, 0.57);
  model.add(door);

  const chimney = new THREE.Mesh(markerGeometries.chimney, materials.shadow);
  chimney.position.set(-0.32, 1.84, 0.1);
  model.add(chimney);

  return model;
}

function createCarModel(materials) {
  const model = new THREE.Group();

  const body = new THREE.Mesh(markerGeometries.carBase, materials.main);
  body.position.y = 0.62;
  model.add(body);

  const cabin = new THREE.Mesh(markerGeometries.carCabin, materials.accent);
  cabin.position.set(0.08, 1.05, 0);
  model.add(cabin);

  const wheelPositions = [
    [-0.58, 0.25, -0.5],
    [0.62, 0.25, -0.5],
    [-0.58, 0.25, 0.5],
    [0.62, 0.25, 0.5]
  ];

  wheelPositions.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(markerGeometries.carWheel, materials.shadow);
    wheel.position.set(x, y, z);
    wheel.rotation.z = Math.PI * 0.5;
    model.add(wheel);
  });

  return model;
}

function createSkyscraperModel(materials) {
  const model = new THREE.Group();

  const tower = new THREE.Mesh(markerGeometries.tower, materials.main);
  tower.position.y = 1.28;
  model.add(tower);

  const crown = new THREE.Mesh(markerGeometries.towerTop, materials.accent);
  crown.position.y = 2.62;
  model.add(crown);

  const antenna = new THREE.Mesh(markerGeometries.towerAntenna, materials.shadow);
  antenna.position.y = 3.08;
  model.add(antenna);

  return model;
}

function createTempleModel(materials) {
  const model = new THREE.Group();

  const base = new THREE.Mesh(markerGeometries.templeBase, materials.shadow);
  base.position.y = 0.2;
  model.add(base);

  const tierLarge = new THREE.Mesh(markerGeometries.templeTierLarge, materials.main);
  tierLarge.position.y = 0.58;
  model.add(tierLarge);

  const roofLarge = new THREE.Mesh(markerGeometries.templeRoofLarge, materials.accent);
  roofLarge.position.y = 0.93;
  model.add(roofLarge);

  const tierMedium = new THREE.Mesh(markerGeometries.templeTierMedium, materials.main);
  tierMedium.position.y = 1.21;
  model.add(tierMedium);

  const roofMedium = new THREE.Mesh(markerGeometries.templeRoofMedium, materials.accent);
  roofMedium.position.y = 1.5;
  model.add(roofMedium);

  const tierSmall = new THREE.Mesh(markerGeometries.templeTierSmall, materials.main);
  tierSmall.position.y = 1.74;
  model.add(tierSmall);

  const roofSmall = new THREE.Mesh(markerGeometries.templeRoofSmall, materials.accent);
  roofSmall.position.y = 1.98;
  model.add(roofSmall);

  const spire = new THREE.Mesh(markerGeometries.templeSpire, materials.shadow);
  spire.position.y = 2.27;
  model.add(spire);

  return model;
}

function createMarkerMaterials(color, emissiveIntensity) {
  const base = new THREE.Color(color);
  const accent = shiftColor(base, 0.11, 0.08);
  const shadow = shiftColor(base, -0.2, -0.06);

  return {
    main: new THREE.MeshStandardMaterial({
      color: base,
      roughness: 0.34,
      metalness: 0.12,
      emissive: base.clone(),
      emissiveIntensity
    }),
    accent: new THREE.MeshStandardMaterial({
      color: accent,
      roughness: 0.27,
      metalness: 0.16,
      emissive: accent.clone(),
      emissiveIntensity: emissiveIntensity * 0.7
    }),
    shadow: new THREE.MeshStandardMaterial({
      color: shadow,
      roughness: 0.52,
      metalness: 0.08,
      emissive: shadow.clone(),
      emissiveIntensity: emissiveIntensity * 0.35
    })
  };
}

function createMarkerHalo(color, isSelected, isHovered) {
  const halo = new THREE.Mesh(
    markerGeometries.halo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: isSelected ? 0.3 : isHovered ? 0.22 : 0.16,
      side: THREE.BackSide
    })
  );

  halo.position.y = 1.05;
  halo.scale.setScalar(isSelected ? 1.95 : isHovered ? 1.72 : 1.52);

  return halo;
}

function setupMarkerModelControl() {
  dom.markerModel.innerHTML = '';

  MARKER_MODEL_OPTIONS.forEach((option) => {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    dom.markerModel.append(element);
  });

  dom.markerModel.value = DEFAULT_MARKER_MODEL;
  dom.markerModel.addEventListener('change', () => {
    if (!state.selectedId) {
      return;
    }

    setHouseMarkerModel(state.selectedId, dom.markerModel.value);
  });
}

function setHouseMarkerModel(houseId, nextModel) {
  const model = isValidMarkerModel(nextModel) ? nextModel : DEFAULT_MARKER_MODEL;
  state.markerModels[houseId] = model;
  saveMarkerModels(state.markerModels);
  refreshMapData();
}

function getHouseMarkerModel(house) {
  const customModel = state.markerModels[house.id];
  if (isValidMarkerModel(customModel)) {
    return customModel;
  }

  if (isValidMarkerModel(house.markerModel)) {
    return house.markerModel;
  }

  return DEFAULT_MARKER_MODEL;
}

function loadMarkerModels() {
  try {
    const raw = localStorage.getItem(MARKER_MODEL_STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([houseId, model]) => typeof houseId === 'string' && isValidMarkerModel(model))
    );
  } catch {
    return {};
  }
}

function saveMarkerModels(markerModels) {
  try {
    localStorage.setItem(MARKER_MODEL_STORAGE_KEY, JSON.stringify(markerModels));
  } catch {
    // Ignore browser storage failures.
  }
}

function isValidMarkerModel(model) {
  return VALID_MARKER_MODELS.has(model);
}

function shiftColor(baseColor, lightnessShift = 0, saturationShift = 0) {
  const color = baseColor.clone();
  const hsl = { h: 0, s: 0, l: 0 };

  color.getHSL(hsl);
  color.setHSL(
    hsl.h,
    clamp(hsl.s + saturationShift, 0, 1),
    clamp(hsl.l + lightnessShift, 0, 1)
  );

  return color;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
