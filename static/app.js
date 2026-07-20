const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const studioGroupEl = document.getElementById("studioGroup");
const studioListEl = document.getElementById("studioList");
const manualGroupEl = document.getElementById("manualGroup");
const manualBatchesEl = document.getElementById("manualBatches");
const actionsEl = document.getElementById("actions");
const processBtn = document.getElementById("processBtn");
const resetBtn = document.getElementById("resetBtn");
const resultListEl = document.getElementById("resultList");
const addoneChooseFolderBtn = document.getElementById("addoneChooseFolderBtn");
const addoneResetFolderBtn = document.getElementById("addoneResetFolderBtn");
const addoneDestFolderPathEl = document.getElementById("addoneDestFolderPath");

let photos = [];
let manualGroups = new Map();
let addoneDestFolder = null;
const lookupCache = new Map();

addoneChooseFolderBtn.addEventListener("click", async () => {
  addoneChooseFolderBtn.disabled = true;
  addoneChooseFolderBtn.textContent = "Sélection en cours...";
  try {
    const res = await fetch("/api/browse-folder");
    const data = await res.json();
    if (data.path) {
      addoneDestFolder = data.path;
      addoneDestFolderPathEl.textContent = addoneDestFolder;
      addoneResetFolderBtn.classList.remove("hidden");
    }
  } finally {
    addoneChooseFolderBtn.disabled = false;
    addoneChooseFolderBtn.textContent = "Choisir un autre dossier";
  }
});

addoneResetFolderBtn.addEventListener("click", () => {
  addoneDestFolder = null;
  addoneDestFolderPathEl.textContent = "Dossier par défaut (Z:\\Photos\\{référence})";
  addoneResetFolderBtn.classList.add("hidden");
});

// --- Site tabs (Add-One / Carrefour) ---

document.querySelectorAll(".site-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".site-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    const site = tab.dataset.site;
    document.querySelectorAll(".site-view").forEach((view) => view.classList.add("hidden"));
    document.getElementById(`${site}View`).classList.remove("hidden");
  });
});

function stripExtension(name) {
  const idx = name.lastIndexOf(".");
  return idx > 0 ? name.slice(0, idx) : name;
}

function isImageFile(file) {
  if (file.type && file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|bmp|tiff?|webp|heic)$/i.test(file.name);
}

function isValidRefFormat(s) {
  return /^[A-Za-z0-9._-]+$/.test(s);
}

async function lookupRefCached(ref) {
  if (lookupCache.has(ref)) return lookupCache.get(ref);
  const promise = fetch(`/api/lookup-ref/${encodeURIComponent(ref)}`).then((res) => res.json());
  lookupCache.set(ref, promise);
  const data = await promise;
  lookupCache.set(ref, data);
  return data;
}

function computeFilenamePreview(p) {
  if (p.mode === "studio") {
    return `${p.parsed.ref}_${p.parsed.ean}_${p.type}_H${p.angle}S_${p.contexte}_S••_${p.parsed.annee}_I.jpg`;
  }
  const group = manualGroups.get(p.groupId) || {};
  const ref = (group.ref || "").trim() || "???";
  const type = group.type || "P";
  const eanValue = (group.ean || "").trim();
  const ean = eanValue || (type === "P" ? "" : "?????????????");
  const annee = (group.annee || "").trim() || "????";
  return `${ref}_${ean}_${type}_H${p.angle}S_${p.contexte}_S••_${annee}_I.jpg`;
}

function refreshAllPreviews() {
  document.querySelectorAll(".photo-card").forEach((card) => {
    const photo = photos.find((p) => p.temp_id === card.dataset.id);
    if (photo) card.querySelector(".preview-name").textContent = computeFilenamePreview(photo);
  });
}

function lowResWarningHtml(p) {
  if (!p.low_res) return "";
  return `<div class="lookup-status not-found">Résolution source ${p.width}x${p.height}px, inférieure à 3000x3000 — l'image sera agrandie et pourra perdre en netteté</div>`;
}

function optionsHtml(labels, selected) {
  return Object.entries(labels)
    .map(
      ([code, label]) =>
        `<option value="${code}" ${code === selected ? "selected" : ""}>${code} - ${label}</option>`
    )
    .join("");
}

// --- Drag & drop, including whole folders ---

function readDirEntries(reader) {
  return new Promise((resolve, reject) => {
    let all = [];
    const readBatch = () => {
      reader.readEntries((entries) => {
        if (!entries.length) {
          resolve(all);
        } else {
          all = all.concat(entries);
          readBatch();
        }
      }, reject);
    };
    readBatch();
  });
}

async function traverseEntry(entry, path) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    return [{ file, path: path + entry.name }];
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const children = await readDirEntries(reader);
    let results = [];
    for (const child of children) {
      results = results.concat(await traverseEntry(child, `${path}${entry.name}/`));
    }
    return results;
  }
  return [];
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("drag");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag");

  const items = e.dataTransfer.items;
  let entries = [];

  if (items && items.length && items[0].webkitGetAsEntry) {
    const roots = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
      if (entry) roots.push(entry);
    }
    for (const root of roots) {
      entries = entries.concat(await traverseEntry(root, ""));
    }
  } else {
    entries = Array.from(e.dataTransfer.files).map((file) => ({ file, path: file.name }));
  }

  handleFileEntries(entries);
});
fileInput.addEventListener("change", () => {
  const entries = Array.from(fileInput.files).map((file) => ({ file, path: file.name }));
  handleFileEntries(entries);
});

async function handleFileEntries(entries) {
  const imageEntries = entries.filter(({ file }) => isImageFile(file));
  if (!imageEntries.length) return;

  const formData = new FormData();
  for (const { file } of imageEntries) formData.append("photos", file);

  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const uploaded = await res.json();

  const newManualPhotos = [];

  uploaded.forEach((item, i) => {
    const path = imageEntries[i].path;
    const parts = path.split("/");
    const folderCandidate = parts.length > 1 ? parts[parts.length - 2] : null;
    const fileCandidate = stripExtension(item.original_name);

    const photo = {
      ...item,
      angle: item.parsed ? item.parsed.angle : "1",
      contexte: item.parsed ? item.parsed.contexte : "P",
      type: item.parsed ? item.parsed.type : "P",
    };

    if (photo.mode === "manual") {
      photo.groupId = null;
      photo.folderCandidate = folderCandidate;
      photo.fileCandidate = fileCandidate;
      newManualPhotos.push(photo);
    }

    photos.push(photo);
  });

  if (newManualPhotos.length) {
    await assignManualGroups(newManualPhotos);
  }

  render();
}

// --- Manual batch grouping (one group per detected product ref) ---

async function assignManualGroups(newManualPhotos) {
  for (const photo of newManualPhotos) {
    const candidates = [photo.folderCandidate, photo.fileCandidate].filter(
      (c) => c && isValidRefFormat(c)
    );

    let groupId = null;
    let lookupData = null;

    for (const candidate of candidates) {
      const data = await lookupRefCached(candidate);
      if (data.found) {
        groupId = candidate;
        lookupData = data;
        break;
      }
    }

    const attemptedFolder = photo.folderCandidate && isValidRefFormat(photo.folderCandidate);
    if (!groupId && attemptedFolder) {
      groupId = photo.folderCandidate;
    }
    if (!groupId) groupId = "";

    photo.groupId = groupId;

    if (!manualGroups.has(groupId)) {
      manualGroups.set(groupId, {
        ref: groupId,
        ean: "",
        type: "P",
        annee: String(new Date().getFullYear()),
        hasVariants: false,
        variants: [],
        status: "",
        statusIsError: false,
      });

      const group = manualGroups.get(groupId);
      if (lookupData) {
        const sourceLabel = lookupData.source === "quable" ? "Quable" : "Z:\\Photos";
        group.name = lookupData.name || null;
        if (lookupData.variants.length > 1) {
          group.hasVariants = true;
          group.variants = lookupData.variants;
          group.ean = lookupData.variants[0].ean;
          group.type = lookupData.variants[0].type;
          group.status = `${lookupData.variants.length} variantes trouvées (${sourceLabel}) — vérifie l'EAN choisi, ou force le type en "Produit" si ces photos sont génériques`;
        } else {
          group.ean = lookupData.variants[0].ean;
          group.type = lookupData.variants[0].type;
          group.status = `Produit trouvé (${sourceLabel}) — EAN/Type pré-remplis automatiquement`;
        }
      } else if (groupId && attemptedFolder && groupId === photo.folderCandidate) {
        group.status = "Nouveau produit — EAN à saisir manuellement";
        group.statusIsError = true;
      }
    }
  }
}

async function removePhoto(tempId) {
  await fetch(`/api/photo/${tempId}`, { method: "DELETE" });
  photos = photos.filter((p) => p.temp_id !== tempId);
  render();
}

async function resetPhotos() {
  await Promise.all(photos.map((p) => fetch(`/api/photo/${p.temp_id}`, { method: "DELETE" })));
  photos = [];
  manualGroups = new Map();
  resultListEl.innerHTML = "";
  fileInput.value = "";
  render();
}

resetBtn.addEventListener("click", resetPhotos);

function buildCardHtml(p) {
  const refEanInfo =
    p.mode === "studio"
      ? `<div class="name">Ref: ${p.parsed.ref} · EAN: ${p.parsed.ean} · Année: ${p.parsed.annee}</div>`
      : "";

  return `
  <div class="photo-card" data-id="${p.temp_id}">
    <img src="${p.preview_url}" alt="">
    <div class="meta">
      <div class="name">${p.original_name}</div>
      ${refEanInfo}
      ${lowResWarningHtml(p)}
      <div class="fields">
        <label>Angle
          <select class="f-angle">${optionsHtml(window.ANGLE_LABELS, p.angle)}</select>
        </label>
        <label>Contexte
          <select class="f-contexte">${optionsHtml(window.CONTEXTE_LABELS, p.contexte)}</select>
        </label>
        ${
          p.mode === "studio"
            ? `<label>Type
                <select class="f-type">${optionsHtml(window.TYPE_LABELS, p.type)}</select>
              </label>`
            : ""
        }
      </div>
      <div class="preview-name">${computeFilenamePreview(p)}</div>
    </div>
    <button class="remove-btn" title="Supprimer cette photo">&times;</button>
  </div>`;
}

function wireCards(container) {
  container.querySelectorAll(".photo-card").forEach((card) => {
    const id = card.dataset.id;
    const photo = photos.find((p) => p.temp_id === id);
    const previewEl = card.querySelector(".preview-name");

    card.querySelector(".f-angle").addEventListener("change", (e) => {
      photo.angle = e.target.value;
      previewEl.textContent = computeFilenamePreview(photo);
    });
    card.querySelector(".f-contexte").addEventListener("change", (e) => {
      photo.contexte = e.target.value;
      previewEl.textContent = computeFilenamePreview(photo);
    });
    const typeSelect = card.querySelector(".f-type");
    if (typeSelect) {
      typeSelect.addEventListener("change", (e) => {
        photo.type = e.target.value;
        previewEl.textContent = computeFilenamePreview(photo);
      });
    }
    card.querySelector(".remove-btn").addEventListener("click", () => removePhoto(id));
  });
}

// --- Manual batch cards (one per detected/entered product ref) ---

function applyEanRequirementForGroup(card, group) {
  const eanInput = card.querySelector(".g-ean");
  const variantPicker = card.querySelector(".g-variant-picker");

  if (group.type === "P" && group.hasVariants) {
    group.ean = "";
    eanInput.value = "";
    eanInput.disabled = true;
    eanInput.classList.remove("invalid");
    eanInput.placeholder = "Non applicable (type Produit)";
    variantPicker.classList.add("hidden");
  } else {
    eanInput.disabled = false;
    eanInput.placeholder = "3700256070693";
    if (group.hasVariants) variantPicker.classList.remove("hidden");
  }
  refreshAllPreviews();
}

async function handleGroupRefChange(card, groupId) {
  const group = manualGroups.get(groupId);
  const ref = card.querySelector(".g-ref").value.trim();
  group.ref = ref;

  const statusEl = card.querySelector(".g-status");
  const variantPicker = card.querySelector(".g-variant-picker");
  const variantSelect = card.querySelector(".g-variant-select");
  const eanInput = card.querySelector(".g-ean");
  const typeSelect = card.querySelector(".g-type");
  const productNameEl = card.querySelector(".product-name");

  statusEl.textContent = "";
  statusEl.classList.remove("not-found");
  variantPicker.classList.add("hidden");
  variantSelect.innerHTML = "";
  group.hasVariants = false;
  group.variants = [];
  group.name = null;
  productNameEl.textContent = "";
  productNameEl.classList.add("hidden");
  eanInput.disabled = false;
  eanInput.placeholder = "3700256070693";

  if (!ref) {
    refreshAllPreviews();
    return;
  }

  const data = await lookupRefCached(ref);
  const sourceLabel = data.source === "quable" ? "Quable" : "Z:\\Photos";

  if (data.found) {
    group.name = data.name || null;
    if (group.name) {
      productNameEl.textContent = group.name;
      productNameEl.classList.remove("hidden");
    }
  }

  if (data.found && data.variants.length === 1) {
    group.ean = data.variants[0].ean;
    group.type = data.variants[0].type;
    eanInput.value = group.ean;
    typeSelect.value = group.type;
    statusEl.textContent = `Produit trouvé (${sourceLabel}) — EAN/Type pré-remplis`;
    eanInput.classList.remove("invalid");
  } else if (data.found && data.variants.length > 1) {
    group.hasVariants = true;
    group.variants = data.variants;
    group.ean = data.variants[0].ean;
    group.type = data.variants[0].type;
    eanInput.value = group.ean;
    typeSelect.value = group.type;
    statusEl.textContent = `${data.variants.length} variantes trouvées (${sourceLabel}) — choisis le bon EAN ci-dessous, ou force le type en "Produit" si ces photos sont génériques (pas d'EAN)`;
    eanInput.classList.remove("invalid");
    variantSelect.innerHTML = data.variants
      .map((v) => `<option value='${JSON.stringify(v)}'>${v.label ? `${v.label} — ` : ""}${v.ean} (${v.type})</option>`)
      .join("");
    variantPicker.classList.remove("hidden");
  } else {
    group.ean = "";
    eanInput.value = "";
    eanInput.classList.add("invalid");
    statusEl.textContent = "Nouveau produit — EAN à saisir manuellement";
    statusEl.classList.add("not-found");
  }

  applyEanRequirementForGroup(card, group);
}

function wireManualBatch(card, groupId) {
  const group = manualGroups.get(groupId);
  const refInput = card.querySelector(".g-ref");
  const eanInput = card.querySelector(".g-ean");
  const typeSelect = card.querySelector(".g-type");
  const anneeInput = card.querySelector(".g-annee");
  const variantSelect = card.querySelector(".g-variant-select");

  refInput.addEventListener("input", () => {
    group.ref = refInput.value.trim();
    refreshAllPreviews();
  });
  refInput.addEventListener("change", () => handleGroupRefChange(card, groupId));

  eanInput.addEventListener("input", () => {
    group.ean = eanInput.value.trim();
    refreshAllPreviews();
  });

  anneeInput.addEventListener("input", () => {
    group.annee = anneeInput.value.trim();
    refreshAllPreviews();
  });

  typeSelect.addEventListener("change", () => {
    group.type = typeSelect.value;
    applyEanRequirementForGroup(card, group);
  });

  variantSelect.addEventListener("change", () => {
    const variant = JSON.parse(variantSelect.value);
    group.ean = variant.ean;
    group.type = variant.type;
    eanInput.value = variant.ean;
    typeSelect.value = variant.type;
    refreshAllPreviews();
  });

  wireCards(card.querySelector(".group-photo-list"));
}

function batchCardHtml(groupId, group, groupPhotos) {
  const statusClass = group.statusIsError ? "not-found" : "";
  const eanDisabled = group.type === "P" && group.hasVariants;
  const eanPlaceholder = eanDisabled ? "Non applicable (type Produit)" : "3700256070693";
  const variantOptionsHtml = (group.variants || [])
    .map((v) => `<option value='${JSON.stringify(v)}'>${v.label ? `${v.label} — ` : ""}${v.ean} (${v.type})</option>`)
    .join("");

  return `
  <section class="card manual-batch" data-group-id="${groupId}">
    <h3>${groupId ? `Lot : ${groupId}` : "Lot (référence à saisir)"}</h3>
    <div class="product-name ${group.name ? "" : "hidden"}">${group.name || ""}</div>
    <div class="grid">
      <label>Référence produit
        <input type="text" class="g-ref" value="${group.ref || ""}" placeholder="7069">
        <span class="lookup-status g-status ${statusClass}">${group.status || ""}</span>
      </label>
      <label>EAN (13 chiffres)
        <input type="text" class="g-ean" value="${group.ean || ""}" placeholder="${eanPlaceholder}" maxlength="13" ${eanDisabled ? "disabled" : ""}>
      </label>
      <label>Type
        <select class="g-type">${optionsHtml(window.TYPE_LABELS, group.type)}</select>
      </label>
      <label>Année
        <input type="number" class="g-annee" value="${group.annee || ""}">
      </label>
    </div>
    <label class="g-variant-picker variant-picker ${group.hasVariants ? "" : "hidden"}">Variante détectée (EAN différent selon la variante)
      <select class="g-variant-select">${variantOptionsHtml}</select>
    </label>
    <div class="photo-list group-photo-list">${groupPhotos.map(buildCardHtml).join("")}</div>
  </section>`;
}

function renderManualBatches(manualPhotos) {
  manualBatchesEl.innerHTML = "";

  for (const [groupId, group] of manualGroups.entries()) {
    const groupPhotos = manualPhotos.filter((p) => p.groupId === groupId);
    if (!groupPhotos.length) continue;
    manualBatchesEl.insertAdjacentHTML("beforeend", batchCardHtml(groupId, group, groupPhotos));
  }

  manualBatchesEl.querySelectorAll(".manual-batch").forEach((card) => {
    wireManualBatch(card, card.dataset.groupId);
  });
}

function render() {
  const studioPhotos = photos.filter((p) => p.mode === "studio");
  const manualPhotos = photos.filter((p) => p.mode === "manual");

  studioGroupEl.classList.toggle("hidden", studioPhotos.length === 0);
  manualGroupEl.classList.toggle("hidden", manualPhotos.length === 0);
  actionsEl.classList.toggle("hidden", photos.length === 0);

  studioListEl.innerHTML = studioPhotos.map(buildCardHtml).join("");
  wireCards(studioListEl);

  renderManualBatches(manualPhotos);
}

processBtn.addEventListener("click", async () => {
  const manualPhotos = photos.filter((p) => p.mode === "manual");

  for (const [groupId, group] of manualGroups.entries()) {
    if (!manualPhotos.some((p) => p.groupId === groupId)) continue;

    if (!(group.ref || "").trim()) {
      alert(`Merci de renseigner la référence produit pour le lot "${groupId || "sans référence"}"`);
      return;
    }

    const eanValid = /^\d{13}$/.test(group.ean || "");
    const eanExempt = group.type === "P" && !group.ean;
    if (!eanValid && !eanExempt) {
      const eanInput = manualBatchesEl.querySelector(
        `.manual-batch[data-group-id="${CSS.escape(groupId)}"] .g-ean`
      );
      if (eanInput) {
        eanInput.classList.add("invalid");
        eanInput.reportValidity
          ? (eanInput.setCustomValidity("L'EAN doit contenir exactement 13 chiffres"),
            eanInput.reportValidity())
          : alert(`EAN invalide pour le lot "${groupId || "sans référence"}"`);
      }
      return;
    }
  }

  const items = photos.map((p) => {
    if (p.mode === "studio") {
      return {
        temp_id: p.temp_id,
        ref: p.parsed.ref,
        ean: p.parsed.ean,
        type: p.type,
        angle: p.angle,
        contexte: p.contexte,
        annee: p.parsed.annee,
      };
    }
    const group = manualGroups.get(p.groupId) || {};
    return {
      temp_id: p.temp_id,
      ref: (group.ref || "").trim(),
      ean: (group.ean || "").trim(),
      type: group.type || "P",
      angle: p.angle,
      contexte: p.contexte,
      annee: (group.annee || "").trim(),
    };
  });

  processBtn.disabled = true;
  processBtn.textContent = "Traitement en cours...";

  let results;
  try {
    const res = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, dest_folder: addoneDestFolder }),
    });
    if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
    results = await res.json();
  } catch (err) {
    resultListEl.innerHTML = `<div class="result-banner error">Le traitement a échoué : ${err.message}</div>`;
    processBtn.disabled = false;
    processBtn.textContent = "Traiter et renommer";
    return;
  }

  const successCount = results.filter((r) => !r.error).length;
  const errorCount = results.length - successCount;

  let banner;
  if (errorCount === 0) {
    banner = `<div class="result-banner success">${successCount} photo${successCount > 1 ? "s" : ""} traitée${successCount > 1 ? "s" : ""} avec succès</div>`;
  } else if (successCount === 0) {
    banner = `<div class="result-banner error">Échec du traitement : ${errorCount} erreur${errorCount > 1 ? "s" : ""}</div>`;
  } else {
    banner = `<div class="result-banner warning">${successCount} photo${successCount > 1 ? "s" : ""} traitée${successCount > 1 ? "s" : ""}, ${errorCount} erreur${errorCount > 1 ? "s" : ""}</div>`;
  }

  resultListEl.innerHTML =
    banner +
    results
      .map((r) =>
        r.error
          ? `<div class="result-row error">Erreur (${r.temp_id}) : ${r.error}</div>`
          : `<div class="result-row"><span>${r.path}</span><span>${r.size_kb} Ko</span></div>`
      )
      .join("");

  photos = [];
  manualGroups = new Map();
  studioListEl.innerHTML = "";
  manualBatchesEl.innerHTML = "";
  studioGroupEl.classList.add("hidden");
  manualGroupEl.classList.add("hidden");
  actionsEl.classList.add("hidden");
  processBtn.disabled = false;
  processBtn.textContent = "Traiter et renommer";
  fileInput.value = "";
});

// --- Carrefour tab ---

const carrefourDropzone = document.getElementById("carrefourDropzone");
const carrefourFileInput = document.getElementById("carrefourFileInput");
const carrefourListEl = document.getElementById("carrefourList");
const carrefourActionsEl = document.getElementById("carrefourActions");
const carrefourProcessBtn = document.getElementById("carrefourProcessBtn");
const carrefourResetBtn = document.getElementById("carrefourResetBtn");
const carrefourResultListEl = document.getElementById("carrefourResultList");
const chooseFolderBtn = document.getElementById("chooseFolderBtn");
const destFolderPathEl = document.getElementById("destFolderPath");

let carrefourPhotos = [];
let destFolder = null;

chooseFolderBtn.addEventListener("click", async () => {
  chooseFolderBtn.disabled = true;
  chooseFolderBtn.textContent = "Sélection en cours...";
  try {
    const res = await fetch("/api/browse-folder");
    const data = await res.json();
    if (data.error) {
      alert(data.error);
    } else if (data.path) {
      destFolder = data.path;
      destFolderPathEl.textContent = destFolder;
      destFolderPathEl.classList.remove("not-found");
    }
  } finally {
    chooseFolderBtn.disabled = false;
    chooseFolderBtn.textContent = "Choisir le dossier de sortie";
  }
});

carrefourDropzone.addEventListener("click", () => carrefourFileInput.click());
carrefourDropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  carrefourDropzone.classList.add("drag");
});
carrefourDropzone.addEventListener("dragleave", () => carrefourDropzone.classList.remove("drag"));
carrefourDropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  carrefourDropzone.classList.remove("drag");
  handleCarrefourFiles(e.dataTransfer.files);
});
carrefourFileInput.addEventListener("change", () => handleCarrefourFiles(carrefourFileInput.files));

async function handleCarrefourFiles(fileList) {
  if (!fileList.length) return;

  const formData = new FormData();
  for (const file of fileList) formData.append("photos", file);

  const res = await fetch("/api/carrefour/upload", { method: "POST", body: formData });
  const uploaded = await res.json();

  for (const item of uploaded) {
    const suggestedNature = item.suggested ? item.suggested.nature : "";
    carrefourPhotos.push({
      ...item,
      angle: item.suggested ? item.suggested.angle : "1",
      nature: suggestedNature === null ? "?" : suggestedNature,
      info: item.suggested ? item.suggested.info : false,
    });
  }

  renderCarrefour();
}

function carrefourFilenamePreview(p) {
  if (!p.parsed) return "(nom non reconnu)";
  if (p.nature === "?") return "(choisir Emballé ou Nu avant traitement)";
  const parts = [p.parsed.ean, p.angle];
  if (p.nature) parts.push(p.nature);
  if (p.info) parts.push("i");
  return parts.join("_") + ".jpg";
}

function carrefourNatureOptionsHtml(p) {
  const placeholder =
    p.nature === "?" ? `<option value="?" selected disabled>-- Choisir Emballé ou Nu --</option>` : "";
  return placeholder + optionsHtml(window.CARREFOUR_NATURE_LABELS, p.nature);
}

function refreshCarrefourPreviews() {
  document.querySelectorAll("#carrefourList .photo-card").forEach((card) => {
    const photo = carrefourPhotos.find((p) => p.temp_id === card.dataset.id);
    if (photo) card.querySelector(".preview-name").textContent = carrefourFilenamePreview(photo);
  });
}

async function removeCarrefourPhoto(tempId) {
  await fetch(`/api/photo/${tempId}`, { method: "DELETE" });
  carrefourPhotos = carrefourPhotos.filter((p) => p.temp_id !== tempId);
  renderCarrefour();
}

async function resetCarrefourPhotos() {
  await Promise.all(carrefourPhotos.map((p) => fetch(`/api/photo/${p.temp_id}`, { method: "DELETE" })));
  carrefourPhotos = [];
  carrefourResultListEl.innerHTML = "";
  carrefourFileInput.value = "";
  renderCarrefour();
}

carrefourResetBtn.addEventListener("click", resetCarrefourPhotos);

function carrefourCardHtml(p) {
  if (!p.parsed) {
    return `
    <div class="photo-card" data-id="${p.temp_id}">
      <img src="${p.preview_url}" alt="">
      <div class="meta">
        <div class="name">${p.original_name}</div>
        <div class="lookup-status not-found">Nom non reconnu — attendu : convention Add-One (ex: 710306_3601029899278_P_H1S_P_S01_2023_I.jpg)</div>
      </div>
      <button class="remove-btn" title="Supprimer cette photo">&times;</button>
    </div>`;
  }

  return `
  <div class="photo-card" data-id="${p.temp_id}">
    <img src="${p.preview_url}" alt="">
    <div class="meta">
      <div class="name">${p.original_name}</div>
      <div class="name">Ref: ${p.parsed.ref} · EAN: ${p.parsed.ean} · Contexte source: ${p.parsed.contexte}</div>
      ${lowResWarningHtml(p)}
      ${
        p.nature === "?"
          ? `<div class="lookup-status not-found">Ancien code Q détecté — choisis Emballé ou Nu ci-dessous</div>`
          : ""
      }
      <div class="fields">
        <label>Angle
          <select class="cf-angle">${optionsHtml(window.CARREFOUR_ANGLE_LABELS, p.angle)}</select>
        </label>
        <label>Nature
          <select class="cf-nature">${carrefourNatureOptionsHtml(p)}</select>
        </label>
        <label class="checkbox-label">
          <input type="checkbox" class="cf-info" ${p.info ? "checked" : ""}>
          Info produit visible (i)
        </label>
      </div>
      <div class="preview-name">${carrefourFilenamePreview(p)}</div>
    </div>
    <button class="remove-btn" title="Supprimer cette photo">&times;</button>
  </div>`;
}

function wireCarrefourCards() {
  carrefourListEl.querySelectorAll(".photo-card").forEach((card) => {
    const id = card.dataset.id;
    const photo = carrefourPhotos.find((p) => p.temp_id === id);
    card.querySelector(".remove-btn").addEventListener("click", () => removeCarrefourPhoto(id));

    if (!photo.parsed) return;

    const previewEl = card.querySelector(".preview-name");
    card.querySelector(".cf-angle").addEventListener("change", (e) => {
      photo.angle = e.target.value;
      previewEl.textContent = carrefourFilenamePreview(photo);
    });
    card.querySelector(".cf-nature").addEventListener("change", (e) => {
      photo.nature = e.target.value;
      if (photo.nature === "AMB") {
        photo.angle = "1";
      }
      renderCarrefour();
    });
    card.querySelector(".cf-info").addEventListener("change", (e) => {
      photo.info = e.target.checked;
      previewEl.textContent = carrefourFilenamePreview(photo);
    });
  });
}

function renderCarrefour() {
  carrefourActionsEl.classList.toggle("hidden", carrefourPhotos.length === 0);
  carrefourListEl.innerHTML = carrefourPhotos.map(carrefourCardHtml).join("");
  wireCarrefourCards();
}

carrefourProcessBtn.addEventListener("click", async () => {
  if (!destFolder) {
    alert("Choisis d'abord un dossier de sortie.");
    return;
  }

  const unresolved = carrefourPhotos.filter((p) => p.parsed && p.nature === "?");
  if (unresolved.length) {
    alert(
      `${unresolved.length} photo(s) avec l'ancien code Q attendent un choix Emballé/Nu avant de pouvoir traiter.`
    );
    return;
  }

  const unparsed = carrefourPhotos.filter((p) => !p.parsed);
  const parsed = carrefourPhotos.filter((p) => p.parsed);

  const preResults = unparsed.map((p) => ({
    temp_id: p.temp_id,
    error: "Nom de fichier non reconnu (convention Add-One requise)",
  }));

  const items = parsed.map((p) => ({
    temp_id: p.temp_id,
    ean: p.parsed.ean,
    angle: p.angle,
    nature: p.nature,
    info: p.info,
  }));

  carrefourProcessBtn.disabled = true;
  carrefourProcessBtn.textContent = "Traitement en cours...";

  let results = preResults;
  if (items.length) {
    try {
      const res = await fetch("/api/carrefour/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, dest_folder: destFolder }),
      });
      if (!res.ok) throw new Error(`Erreur serveur (${res.status})`);
      const serverResults = await res.json();
      results = preResults.concat(serverResults);
    } catch (err) {
      carrefourResultListEl.innerHTML = `<div class="result-banner error">Le traitement a échoué : ${err.message}</div>`;
      carrefourProcessBtn.disabled = false;
      carrefourProcessBtn.textContent = "Traiter et renommer";
      return;
    }
  }

  const successCount = results.filter((r) => !r.error).length;
  const errorCount = results.length - successCount;

  let banner;
  if (errorCount === 0) {
    banner = `<div class="result-banner success">${successCount} photo${successCount > 1 ? "s" : ""} traitée${successCount > 1 ? "s" : ""} avec succès</div>`;
  } else if (successCount === 0) {
    banner = `<div class="result-banner error">Échec du traitement : ${errorCount} erreur${errorCount > 1 ? "s" : ""}</div>`;
  } else {
    banner = `<div class="result-banner warning">${successCount} photo${successCount > 1 ? "s" : ""} traitée${successCount > 1 ? "s" : ""}, ${errorCount} erreur${errorCount > 1 ? "s" : ""}</div>`;
  }

  carrefourResultListEl.innerHTML =
    banner +
    results
      .map((r) =>
        r.error
          ? `<div class="result-row error">Erreur (${r.temp_id}) : ${r.error}</div>`
          : `<div class="result-row"><span>${r.path}</span><span>${r.size_kb} Ko</span></div>`
      )
      .join("");

  carrefourPhotos = [];
  carrefourListEl.innerHTML = "";
  carrefourActionsEl.classList.add("hidden");
  carrefourProcessBtn.disabled = false;
  carrefourProcessBtn.textContent = "Traiter et renommer";
  carrefourFileInput.value = "";
});
