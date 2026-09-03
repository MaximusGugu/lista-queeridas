const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;
const EXPORT_SCALE = 2;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const TEMPLATE_PATHS = {
    todes: "story-todes.png?v=20260903-2",
    allstars: "story-allstars.png?v=20260903-2",
    elax: "story-elax.png?v=20260903-2"
};
const MODE_LABELS = {
    todes: "TODES",
    allstars: "ALL STARS",
    elax: "ELAX"
};

const canvas = document.getElementById("storyCanvas");
const context = canvas.getContext("2d", { alpha: false });
const photoInput = document.getElementById("storyPhotoInput");
const zoomInput = document.getElementById("storyZoom");
const emptyState = document.getElementById("storyEmptyState");
const statusText = document.getElementById("storyStatus");
const resetButton = document.getElementById("btnStoryReset");
const shareButton = document.getElementById("btnStoryShare");
const downloadButton = document.getElementById("btnStoryDownload");

const templates = new Map();
const unavailableTemplates = new Set();
const pointers = new Map();
let selectedMode = "todes";
let photo = null;
let photoUrl = "";
let baseScale = 1;
let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let gesture = null;
let renderFrame = 0;
let initialized = false;

function loadImage(source) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Não foi possível carregar ${source}.`));
        image.src = source;
    });
}

function setStatus(message = "") {
    statusText.textContent = message;
}

function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast-copiado toast-centered";
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
}

function requestRender() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(() => {
        renderFrame = 0;
        renderStory();
    });
}

function scaledPhotoSize() {
    if (!photo) return { width: 0, height: 0 };
    return {
        width: photo.naturalWidth * baseScale * zoom,
        height: photo.naturalHeight * baseScale * zoom
    };
}

function constrainOffsets() {
    const size = scaledPhotoSize();
    const maxX = Math.max(0, (size.width - STORY_WIDTH) / 2);
    const maxY = Math.max(0, (size.height - STORY_HEIGHT) / 2);
    offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
    offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
}

function drawStory(targetContext, outputScale = 1) {
    const outputWidth = STORY_WIDTH * outputScale;
    const outputHeight = STORY_HEIGHT * outputScale;
    targetContext.fillStyle = "#f1f5f9";
    targetContext.fillRect(0, 0, outputWidth, outputHeight);
    targetContext.imageSmoothingEnabled = true;
    targetContext.imageSmoothingQuality = "high";

    if (photo) {
        constrainOffsets();
        const size = scaledPhotoSize();
        const x = (STORY_WIDTH - size.width) / 2 + offsetX;
        const y = (STORY_HEIGHT - size.height) / 2 + offsetY;
        targetContext.drawImage(
            photo,
            x * outputScale,
            y * outputScale,
            size.width * outputScale,
            size.height * outputScale
        );
    }

    const template = templates.get(selectedMode);
    if (template) targetContext.drawImage(template, 0, 0, outputWidth, outputHeight);
}

function renderStory() {
    drawStory(context);
}

function resetFraming() {
    if (!photo) return;
    baseScale = Math.max(STORY_WIDTH / photo.naturalWidth, STORY_HEIGHT / photo.naturalHeight);
    zoom = 1;
    offsetX = 0;
    offsetY = 0;
    zoomInput.value = "1";
    requestRender();
}

function setPhotoControlsEnabled(enabled) {
    zoomInput.disabled = !enabled;
    resetButton.disabled = !enabled;
    shareButton.disabled = !enabled;
    downloadButton.disabled = !enabled;
    emptyState.classList.toggle("hidden", enabled);
}

async function loadTemplates() {
    await Promise.all(Object.entries(TEMPLATE_PATHS).map(async ([mode, path]) => {
        try {
            const image = await loadImage(path);
            if (image.naturalWidth !== STORY_WIDTH || image.naturalHeight !== STORY_HEIGHT) {
                throw new Error(`${path} precisa ter 1080 × 1920.`);
            }
            templates.set(mode, image);
        } catch (error) {
            unavailableTemplates.add(mode);
            console.warn(error.message);
        }
    }));

    document.querySelectorAll(".story-mode-option").forEach(button => {
        const unavailable = unavailableTemplates.has(button.dataset.mode);
        button.classList.toggle("is-unavailable", unavailable);
        if (unavailable) button.title = `Template ${MODE_LABELS[button.dataset.mode]} ainda não foi adicionado`;
    });
    requestRender();
}

async function selectMode(mode) {
    if (unavailableTemplates.has(mode) || !templates.has(mode)) {
        const message = `Template ${MODE_LABELS[mode]} ainda não foi adicionado.`;
        setStatus(message);
        showToast(message);
        return;
    }

    selectedMode = mode;
    setStatus("");
    document.querySelectorAll(".story-mode-option").forEach(button => {
        const active = button.dataset.mode === mode;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });
    document.body.classList.remove("theme-todes", "theme-allstars", "theme-elax");
    document.body.classList.add(`theme-${mode}`);
    requestRender();
}

async function choosePhoto(file) {
    if (!file || !file.type.startsWith("image/")) {
        setStatus("Escolha um arquivo de imagem válido.");
        return;
    }

    const nextUrl = URL.createObjectURL(file);
    try {
        const nextPhoto = await loadImage(nextUrl);
        if (photoUrl) URL.revokeObjectURL(photoUrl);
        photoUrl = nextUrl;
        photo = nextPhoto;
        setStatus("");
        setPhotoControlsEnabled(true);
        resetFraming();
    } catch (error) {
        URL.revokeObjectURL(nextUrl);
        setStatus("Não foi possível abrir esta imagem.");
    }
}

function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX, y: event.clientY, scaleX: STORY_WIDTH / rect.width, scaleY: STORY_HEIGHT / rect.height };
}

function distanceBetween(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first, second) {
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function startGesture() {
    const activePointers = [...pointers.values()];
    if (activePointers.length === 1) {
        gesture = {
            type: "pan",
            start: { ...activePointers[0] },
            offsetX,
            offsetY
        };
    } else if (activePointers.length >= 2) {
        gesture = {
            type: "pinch",
            distance: Math.max(1, distanceBetween(activePointers[0], activePointers[1])),
            midpoint: midpoint(activePointers[0], activePointers[1]),
            zoom,
            offsetX,
            offsetY
        };
    }
}

function handlePointerDown(event) {
    if (!photo) return;
    event.preventDefault();
    const point = canvasPoint(event);
    pointers.set(event.pointerId, point);
    canvas.setPointerCapture?.(event.pointerId);
    startGesture();
}

function handlePointerMove(event) {
    if (!photo || !pointers.has(event.pointerId)) return;
    event.preventDefault();
    const point = canvasPoint(event);
    pointers.set(event.pointerId, point);
    const activePointers = [...pointers.values()];

    if (activePointers.length === 1 && gesture?.type === "pan") {
        offsetX = gesture.offsetX + (point.x - gesture.start.x) * point.scaleX;
        offsetY = gesture.offsetY + (point.y - gesture.start.y) * point.scaleY;
    } else if (activePointers.length >= 2) {
        if (gesture?.type !== "pinch") startGesture();
        const currentMidpoint = midpoint(activePointers[0], activePointers[1]);
        const currentDistance = distanceBetween(activePointers[0], activePointers[1]);
        zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, gesture.zoom * currentDistance / gesture.distance));
        offsetX = gesture.offsetX + (currentMidpoint.x - gesture.midpoint.x) * point.scaleX;
        offsetY = gesture.offsetY + (currentMidpoint.y - gesture.midpoint.y) * point.scaleY;
        zoomInput.value = String(zoom);
    }

    constrainOffsets();
    requestRender();
}

function handlePointerEnd(event) {
    pointers.delete(event.pointerId);
    if (pointers.size) startGesture();
    else gesture = null;
}

function storyFilename() {
    const now = new Date();
    const date = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
    return `story-queeridas-${selectedMode}-${date}.png`;
}

function createStoryBlob() {
    return new Promise((resolve, reject) => {
        if (!photo || !templates.has(selectedMode)) {
            reject(new Error("Selecione uma foto e uma modalidade disponível."));
            return;
        }

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = STORY_WIDTH * EXPORT_SCALE;
        exportCanvas.height = STORY_HEIGHT * EXPORT_SCALE;
        const exportContext = exportCanvas.getContext("2d", { alpha: false });
        if (!exportContext) {
            reject(new Error("Não foi possível preparar a imagem em alta resolução."));
            return;
        }

        drawStory(exportContext, EXPORT_SCALE);
        exportCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Não foi possível gerar o PNG.")), "image/png");
    });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function setExportBusy(busy) {
    shareButton.disabled = busy || !photo;
    downloadButton.disabled = busy || !photo;
}

async function shareStory() {
    await setExportBusy(true);
    try {
        const blob = await createStoryBlob();
        const file = new File([blob], storyFilename(), { type: "image/png" });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: "Story Queeridas" });
        } else {
            downloadBlob(blob, file.name);
            showToast("Compartilhamento indisponível. PNG baixado.");
        }
    } catch (error) {
        if (error.name !== "AbortError") {
            setStatus(error.message || "Não foi possível compartilhar o story.");
        }
    } finally {
        await setExportBusy(false);
    }
}

async function downloadStory() {
    await setExportBusy(true);
    try {
        const blob = await createStoryBlob();
        downloadBlob(blob, storyFilename());
        showToast("PNG gerado.");
    } catch (error) {
        setStatus(error.message || "Não foi possível gerar o story.");
    } finally {
        await setExportBusy(false);
    }
}

function initializeEvents() {
    document.getElementById("btnStoryPhoto").onclick = () => photoInput.click();
    photoInput.onchange = event => {
        choosePhoto(event.target.files?.[0]);
        event.target.value = "";
    };
    resetButton.onclick = resetFraming;
    shareButton.onclick = shareStory;
    downloadButton.onclick = downloadStory;

    document.getElementById("storyModeSelector").onclick = event => {
        const button = event.target.closest(".story-mode-option");
        if (button) selectMode(button.dataset.mode);
    };

    zoomInput.oninput = () => {
        zoom = Number(zoomInput.value);
        constrainOffsets();
        requestRender();
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerEnd);
    canvas.addEventListener("pointercancel", handlePointerEnd);
    canvas.addEventListener("wheel", event => {
        if (!photo) return;
        event.preventDefault();
        zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom - event.deltaY * 0.001));
        zoomInput.value = String(zoom);
        constrainOffsets();
        requestRender();
    }, { passive: false });

    window.addEventListener("beforeunload", () => {
        if (photoUrl) URL.revokeObjectURL(photoUrl);
    });
}

async function initializeEditor() {
    if (initialized) return;
    initialized = true;
    initializeEvents();
    setPhotoControlsEnabled(false);
    await loadTemplates();
}

const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    && new URLSearchParams(window.location.search).has("preview");

if (localPreview) {
    initializeEditor();
} else {
    const { auth } = await import("./firebase-config.js");
    const { exigirAcesso, monitorarAcesso } = await import("./access-control.js");
    auth.onAuthStateChanged(async user => {
        const perfil = await exigirAcesso(user);
        if (!perfil) return;
        monitorarAcesso(perfil);
        initializeEditor();
    });
}
