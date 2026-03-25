const CONFIG = window.APP_CONFIG || {};

const state = {
  folderMap: {},
  currentLookup: "",
  currentFolderId: "",
  currentFolderLabel: "",
  images: [],
  activeIndex: 0,
  lightboxOpen: false
};

const elements = {
  form: document.getElementById("lookup-form"),
  input: document.getElementById("lookup-input"),
  submitButton: document.getElementById("submit-button"),
  refreshButton: document.getElementById("refresh-button"),
  pageTitle: document.getElementById("page-title"),
  heroText: document.getElementById("hero-text"),
  galleryTitle: document.getElementById("gallery-title"),
  statusMessage: document.getElementById("status-message"),
  sampleKeys: document.getElementById("sample-keys"),
  loadingState: document.getElementById("loading-state"),
  emptyState: document.getElementById("empty-state"),
  galleryGrid: document.getElementById("gallery-grid"),
  noticeBanner: document.getElementById("notice-banner"),
  lightbox: document.getElementById("lightbox"),
  lightboxImage: document.getElementById("lightbox-image"),
  lightboxCaption: document.getElementById("lightbox-caption"),
  lightboxPosition: document.getElementById("lightbox-position"),
  closeLightbox: document.getElementById("close-lightbox"),
  prevPhoto: document.getElementById("prev-photo"),
  nextPhoto: document.getElementById("next-photo")
};

const DRIVE_API_ROOT = "https://www.googleapis.com/drive/v3/files";
const FOLDER_URL_PATTERNS = [
  /drive\/folders\/([a-zA-Z0-9_-]+)/i,
  /[?&]id=([a-zA-Z0-9_-]+)/i
];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  applyBranding();
  bindEvents();
  await loadFolderMap();
  populateSampleKeys();
  await hydrateFromUrl();
}

function applyBranding() {
  if (CONFIG.pageTitle) {
    document.title = CONFIG.pageTitle;
    elements.pageTitle.textContent = CONFIG.pageTitle;
  }

  if (CONFIG.heroText) {
    elements.heroText.textContent = CONFIG.heroText;
  }
}

function bindEvents() {
  elements.form.addEventListener("submit", handleLookupSubmit);
  elements.refreshButton.addEventListener("click", () => {
    if (state.currentLookup) {
      runLookup(state.currentLookup, { pushHistory: false });
    }
  });
  elements.closeLightbox.addEventListener("click", closeLightbox);
  elements.prevPhoto.addEventListener("click", showPreviousPhoto);
  elements.nextPhoto.addEventListener("click", showNextPhoto);

  elements.lightbox.addEventListener("click", (event) => {
    if (event.target.hasAttribute("data-close-lightbox")) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!state.lightboxOpen) {
      return;
    }

    if (event.key === "Escape") {
      closeLightbox();
    } else if (event.key === "ArrowLeft") {
      showPreviousPhoto();
    } else if (event.key === "ArrowRight") {
      showNextPhoto();
    }
  });
}

async function loadFolderMap() {
  try {
    if (window.location.protocol === "file:") {
      throw new Error("Open this app through IIS, localhost, or GitHub Pages. Loading keys does not work from file://.");
    }

    const response = await fetch("./data/folders.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not read data/folders.json.");
    }

    state.folderMap = await response.json();
  } catch (error) {
    state.folderMap = {};
    showNotice(error.message);
  }
}

function populateSampleKeys() {
  const keys = Object.keys(state.folderMap).slice(0, 6);
  elements.sampleKeys.innerHTML = "";

  if (!keys.length) {
    return;
  }

  keys.forEach((key) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sample-key";
    button.textContent = key;
    button.addEventListener("click", () => {
      elements.input.value = key;
      runLookup(key);
    });
    elements.sampleKeys.appendChild(button);
  });
}

async function hydrateFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lookup = params.get("gallery");

  if (!lookup) {
    return;
  }

  elements.input.value = lookup;
  await runLookup(lookup, { pushHistory: false });
}

async function handleLookupSubmit(event) {
  event.preventDefault();
  await runLookup(elements.input.value.trim());
}

async function runLookup(rawLookup, options = {}) {
  const { pushHistory = true } = options;
  const lookup = rawLookup.trim();

  if (!lookup) {
    showNotice("Enter a key, folder ID, or Google Drive folder link.");
    return;
  }

  if (!CONFIG.googleApiKey || CONFIG.googleApiKey === "REPLACE_WITH_YOUR_GOOGLE_API_KEY") {
    showNotice("Add your Google API key in config.js before opening a gallery.");
    return;
  }

  const resolved = resolveFolderLookup(lookup);
  if (!resolved.folderId) {
    showNotice("Key not found. Check the exact key in data/folders.json, or paste a full Drive folder link.");
    return;
  }

  state.currentLookup = lookup;
  state.currentFolderId = resolved.folderId;
  state.currentFolderLabel = resolved.label || "";
  setLoading(true);
  elements.galleryGrid.innerHTML = "";
  hideNotice();

  try {
    const [folderMetadata, images] = await Promise.all([
      fetchFolderMetadata(resolved.folderId),
      fetchFolderImages(resolved.folderId)
    ]);

    state.images = images;
    state.activeIndex = 0;

    const folderName = state.currentFolderLabel || folderMetadata.name || "Untitled folder";
    elements.galleryTitle.textContent = folderName;
    elements.statusMessage.textContent = `${images.length} photo${images.length === 1 ? "" : "s"} loaded.`;
    renderGallery(images);

    if (!images.length) {
      showNotice("The folder loaded, but no public image files were found inside it.");
    }

    if (pushHistory) {
      const url = new URL(window.location.href);
      url.searchParams.set("gallery", lookup);
      window.history.replaceState({}, "", url);
    }
  } catch (error) {
    state.images = [];
    elements.galleryTitle.textContent = state.currentFolderLabel || "Unable to load gallery";
    elements.statusMessage.textContent = "Check the folder sharing settings and API key restrictions.";
    renderGallery([]);
    showNotice(error.message || "Google Drive could not load that folder.");
  } finally {
    setLoading(false);
  }
}

function resolveFolderLookup(input) {
  const normalized = input.trim();
  const normalizedKey = normalizeKey(normalized);
  const mappedEntries = Object.entries(state.folderMap);

  const exactMatch = state.folderMap[normalized];
  if (exactMatch && exactMatch.folderId) {
    return buildResolvedLookup(exactMatch, normalized, `Key: ${normalized}`);
  }

  const normalizedMatch = mappedEntries.find(([key]) => normalizeKey(key) === normalizedKey);
  if (normalizedMatch) {
    return buildResolvedLookup(normalizedMatch[1], normalizedMatch[0], `Key: ${normalizedMatch[0]}`);
  }

  for (const pattern of FOLDER_URL_PATTERNS) {
    const match = normalized.match(pattern);
    if (match) {
      return {
        folderId: match[1],
        label: "",
        lookupLabel: "Drive link"
      };
    }
  }

  if (/^[a-zA-Z0-9_-]{10,}$/.test(normalized)) {
    return {
      folderId: normalized,
      label: "",
      lookupLabel: "Raw folder ID"
    };
  }

  return { folderId: "" };
}

function buildResolvedLookup(entry, key, lookupLabel) {
  return {
    folderId: entry.folderId,
    label: entry.label || key,
    lookupLabel
  };
}

function normalizeKey(value) {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

async function fetchFolderMetadata(folderId) {
  const params = new URLSearchParams({
    fields: "id,name,description",
    supportsAllDrives: "true",
    key: CONFIG.googleApiKey
  });

  const response = await fetch(`${DRIVE_API_ROOT}/${folderId}?${params.toString()}`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message || "Google Drive could not open that folder.");
  }

  return payload;
}

async function fetchFolderImages(folderId) {
  let pageToken = "";
  const images = [];

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
      fields: "nextPageToken,files(id,name,createdTime,modifiedTime)",
      orderBy: CONFIG.orderBy || "createdTime desc",
      pageSize: "200",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
      key: CONFIG.googleApiKey
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(`${DRIVE_API_ROOT}?${params.toString()}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error?.message || "Google Drive could not list images from that folder.");
    }

    images.push(
      ...payload.files.map((file) => ({
        ...file,
        thumbnailSrc: buildThumbnailUrl(file.id, 720),
        viewerSrc: buildThumbnailUrl(file.id, 2200),
        originalSrc: buildImageUrl(file.id)
      }))
    );

    pageToken = payload.nextPageToken || "";
  } while (pageToken);

  return images;
}

function buildThumbnailUrl(fileId, width) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${width}`;
}

function buildImageUrl(fileId) {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&key=${encodeURIComponent(CONFIG.googleApiKey)}`;
}

function renderGallery(images) {
  elements.galleryGrid.innerHTML = "";
  elements.emptyState.hidden = images.length > 0;

  if (!images.length) {
    return;
  }

  const fragment = document.createDocumentFragment();

  images.forEach((image, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "photo-card";
    button.setAttribute("aria-label", `Open ${image.name}`);
    button.addEventListener("click", () => openLightbox(index));

    const img = document.createElement("img");
    img.src = image.thumbnailSrc;
    img.alt = image.name;
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";

    button.appendChild(img);
    fragment.appendChild(button);
  });

  elements.galleryGrid.appendChild(fragment);
}

function openLightbox(index) {
  if (!state.images.length) {
    return;
  }

  state.activeIndex = index;
  state.lightboxOpen = true;
  elements.lightbox.hidden = false;
  elements.lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("lightbox-open");
  syncLightbox();
}

function closeLightbox() {
  state.lightboxOpen = false;
  elements.lightbox.hidden = true;
  elements.lightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("lightbox-open");
}

function syncLightbox() {
  const image = state.images[state.activeIndex];
  if (!image) {
    return;
  }

  elements.lightboxImage.src = image.viewerSrc;
  elements.lightboxImage.alt = image.name;
  elements.lightboxCaption.textContent = image.name;
  elements.lightboxPosition.textContent = `${state.activeIndex + 1} / ${state.images.length}`;

  preloadImage(image.viewerSrc);
  preloadNeighbor((state.activeIndex + 1) % state.images.length);
  preloadNeighbor((state.activeIndex - 1 + state.images.length) % state.images.length);
}

function preloadNeighbor(index) {
  const image = state.images[index];
  if (image) {
    preloadImage(image.viewerSrc);
  }
}

function preloadImage(src) {
  const image = new Image();
  image.src = src;
}

function showPreviousPhoto() {
  if (!state.images.length) {
    return;
  }

  state.activeIndex = (state.activeIndex - 1 + state.images.length) % state.images.length;
  syncLightbox();
}

function showNextPhoto() {
  if (!state.images.length) {
    return;
  }

  state.activeIndex = (state.activeIndex + 1) % state.images.length;
  syncLightbox();
}

function setLoading(isLoading) {
  elements.loadingState.hidden = !isLoading;
  elements.emptyState.hidden = isLoading || state.images.length > 0;
  elements.submitButton.disabled = isLoading;
  elements.refreshButton.disabled = isLoading || !state.currentLookup;
}

function showNotice(message) {
  elements.noticeBanner.hidden = false;
  elements.noticeBanner.textContent = message;
}

function hideNotice() {
  elements.noticeBanner.hidden = true;
  elements.noticeBanner.textContent = "";
}
