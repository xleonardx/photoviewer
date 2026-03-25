const CONFIG = window.APP_CONFIG || {};

const state = {
  folderMap: {},
  currentLookup: "",
  currentFolderId: "",
  currentFolderLabel: "",
  images: [],
  activeIndex: 0
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
  lookupPill: document.getElementById("lookup-pill"),
  imageCount: document.getElementById("image-count"),
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
    if (event.target === elements.lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!elements.lightbox.open) {
      return;
    }

    if (event.key === "Escape") {
      closeLightbox();
    }

    if (event.key === "ArrowLeft") {
      showPreviousPhoto();
    }

    if (event.key === "ArrowRight") {
      showNextPhoto();
    }
  });
}

async function loadFolderMap() {
  try {
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
    const placeholder = document.createElement("span");
    placeholder.className = "helper-text";
    placeholder.textContent = "No mapped keys yet. Add entries in data/folders.json.";
    elements.sampleKeys.appendChild(placeholder);
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
    showNotice("Enter a short key, raw folder ID, or Google Drive folder link.");
    return;
  }

  if (!CONFIG.googleApiKey || CONFIG.googleApiKey === "REPLACE_WITH_YOUR_GOOGLE_API_KEY") {
    showNotice("Add your Google API key in config.js before opening a gallery.");
    return;
  }

  const resolved = resolveFolderLookup(lookup);
  if (!resolved.folderId) {
    showNotice("I could not resolve that value into a Google Drive folder ID.");
    return;
  }

  state.currentLookup = lookup;
  state.currentFolderId = resolved.folderId;
  state.currentFolderLabel = resolved.label || "";
  updateLookupSummary(resolved.lookupLabel);
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
    elements.statusMessage.textContent = folderMetadata.description
      ? folderMetadata.description
      : `${images.length} public image${images.length === 1 ? "" : "s"} available in this Google Drive folder.`;
    elements.imageCount.textContent = String(images.length);
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
    elements.imageCount.textContent = "0";
    elements.galleryTitle.textContent = state.currentFolderLabel || "Unable to load folder";
    elements.statusMessage.textContent = "Check the folder visibility, folder ID, and API key settings.";
    renderGallery([]);
    showNotice(error.message || "Google Drive could not load that folder.");
  } finally {
    setLoading(false);
  }
}

function resolveFolderLookup(input) {
  const normalized = input.trim();
  const mappedEntry = state.folderMap[normalized];

  if (mappedEntry && mappedEntry.folderId) {
    return {
      folderId: mappedEntry.folderId,
      label: mappedEntry.label || "",
      lookupLabel: `Key: ${normalized}`
    };
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
        thumbnailSrc: buildThumbnailUrl(file.id),
        imageSrc: buildImageUrl(file.id)
      }))
    );

    pageToken = payload.nextPageToken || "";
  } while (pageToken);

  return images;
}

function buildThumbnailUrl(fileId) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w800`;
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
    img.referrerPolicy = "no-referrer";

    const meta = document.createElement("span");
    meta.className = "photo-meta";

    const textWrap = document.createElement("span");

    const name = document.createElement("span");
    name.className = "photo-name";
    name.textContent = image.name;

    const date = document.createElement("span");
    date.className = "photo-date";
    date.textContent = formatDate(image.createdTime || image.modifiedTime);

    textWrap.appendChild(name);
    textWrap.appendChild(date);
    meta.appendChild(textWrap);
    button.appendChild(img);
    button.appendChild(meta);
    fragment.appendChild(button);
  });

  elements.galleryGrid.appendChild(fragment);
}

function openLightbox(index) {
  if (!state.images.length) {
    return;
  }

  state.activeIndex = index;
  syncLightbox();
  elements.lightbox.showModal();
}

function closeLightbox() {
  if (elements.lightbox.open) {
    elements.lightbox.close();
  }
}

function syncLightbox() {
  const image = state.images[state.activeIndex];
  if (!image) {
    return;
  }

  elements.lightboxImage.src = image.imageSrc;
  elements.lightboxImage.alt = image.name;
  elements.lightboxCaption.textContent = image.name;
  elements.lightboxPosition.textContent = `${state.activeIndex + 1} / ${state.images.length}`;
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

function updateLookupSummary(label) {
  elements.lookupPill.textContent = label || "Custom";
}

function showNotice(message) {
  elements.noticeBanner.hidden = false;
  elements.noticeBanner.textContent = message;
}

function hideNotice() {
  elements.noticeBanner.hidden = true;
  elements.noticeBanner.textContent = "";
}

function formatDate(value) {
  if (!value) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}
