const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const studioGroupEl = document.getElementById("studioGroup");
const studioListEl = document.getElementById("studioList");
const manualGroupEl = document.getElementById("manualGroup");
const manualListEl = document.getElementById("manualList");
const actionsEl = document.getElementById("actions");
const processBtn = document.getElementById("processBtn");
const resetBtn = document.getElementById("resetBtn");
const resultListEl = document.getElementById("resultList");
const batchRefEl = document.getElementById("batchRef");
const batchEanEl = document.getElementById("batchEan");
const batchTypeEl = document.getElementById("batchType");
const batchAnneeEl = document.getElementById("batchAnnee");

batchAnneeEl.value = new Date().getFullYear();

let photos = [];

function computeFilenamePreview(p) {
  const ref = p.mode === "studio" ? p.parsed.ref : batchRefEl.value.trim() || "???";
  const type = p.mode === "studio" ? p.type : batchTypeEl.value;
  let ean;
  if (p.mode === "studio") {
    ean = p.parsed.ean;
  } else {
    const eanValue = batchEanEl.value.trim();
    ean = eanValue || (type === "P" ? "" : "?????????????");
  }
  const annee = p.mode === "studio" ? p.parsed.annee : batchAnneeEl.value.trim() || "????";
  return `${ref}_${ean}_${type}_H${p.angle}S_${p.contexte}_S••_${annee}_I.jpg`;
}

function refreshAllPreviews() {
  document.querySelectorAll(".photo-card").forEach((card) => {
    const photo = photos.find((p) => p.temp_id === card.dataset.id);
    if (photo) card.querySelector(".preview-name").textContent = computeFilenamePreview(photo);
  });
}

[batchRefEl, batchEanEl, batchAnneeEl].forEach((el) => el.addEventListener("input", refreshAllPreviews));

const refLookupStatusEl = document.getElementById("refLookupStatus");
const variantPickerEl = document.getElementById("variantPicker");
const variantSelectEl = document.getElementById("variantSelect");
const defaultEanPlaceholder = batchEanEl.placeholder;

let refHasVariants = false;

function applyEanRequirementForType() {
  if (batchTypeEl.value === "P" && refHasVariants) {
    batchEanEl.value = "";
    batchEanEl.disabled = true;
    batchEanEl.classList.remove("invalid");
    batchEanEl.placeholder = "Non applicable (type Produit)";
    variantPickerEl.classList.add("hidden");
  } else {
    batchEanEl.disabled = false;
    batchEanEl.placeholder = defaultEanPlaceholder;
    if (refHasVariants) variantPickerEl.classList.remove("hidden");
  }
  refreshAllPreviews();
}

batchTypeEl.addEventListener("change", applyEanRequirementForType);

function applyVariant(variant) {
  batchEanEl.value = variant.ean;
  batchTypeEl.value = variant.type;
  refreshAllPreviews();
}

variantSelectEl.addEventListener("change", () => {
  const variant = JSON.parse(variantSelectEl.value);
  applyVariant(variant);
});

batchRefEl.addEventListener("change", async () => {
  const ref = batchRefEl.value.trim();
  refLookupStatusEl.textContent = "";
  variantPickerEl.classList.add("hidden");
  variantSelectEl.innerHTML = "";
  refHasVariants = false;
  batchEanEl.disabled = false;
  batchEanEl.placeholder = defaultEanPlaceholder;
  if (!ref) return;

  const res = await fetch(`/api/lookup-ref/${encodeURIComponent(ref)}`);
  const data = await res.json();

  const sourceLabel = data.source === "quable" ? "Quable" : "Z:\\Photos";

  if (data.found && data.variants.length === 1) {
    applyVariant(data.variants[0]);
    refLookupStatusEl.textContent = `Produit trouvé (${sourceLabel}) — EAN/Type pré-remplis`;
    refLookupStatusEl.classList.remove("not-found");
    batchEanEl.classList.remove("invalid");
  } else if (data.found && data.variants.length > 1) {
    refHasVariants = true;
    refLookupStatusEl.textContent = `${data.variants.length} variantes trouvées (${sourceLabel}) — choisis le bon EAN ci-dessous, ou force le type en "Produit" si ces photos sont génériques (pas d'EAN)`;
    refLookupStatusEl.classList.remove("not-found");
    batchEanEl.classList.remove("invalid");
    variantSelectEl.innerHTML = data.variants
      .map((v) => `<option value='${JSON.stringify(v)}'>${v.label ? `${v.label} — ` : ""}${v.ean} (${v.type})</option>`)
      .join("");
    variantPickerEl.classList.remove("hidden");
    applyVariant(data.variants[0]);
  } else {
    batchEanEl.value = "";
    batchEanEl.classList.add("invalid");
    refLookupStatusEl.textContent = "Nouveau produit — EAN à saisir manuellement";
    refLookupStatusEl.classList.add("not-found");
  }

  applyEanRequirementForType();
});

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("drag");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("drag"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag");
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener("change", () => handleFiles(fileInput.files));

async function handleFiles(fileList) {
  if (!fileList.length) return;

  const formData = new FormData();
  for (const file of fileList) formData.append("photos", file);

  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const uploaded = await res.json();

  for (const item of uploaded) {
    photos.push({
      ...item,
      angle: item.parsed ? item.parsed.angle : "1",
      contexte: item.parsed ? item.parsed.contexte : "P",
      type: item.parsed ? item.parsed.type : "P",
    });
  }

  render();
}

function optionsHtml(labels, selected) {
  return Object.entries(labels)
    .map(
      ([code, label]) =>
        `<option value="${code}" ${code === selected ? "selected" : ""}>${code} - ${label}</option>`
    )
    .join("");
}

async function removePhoto(tempId) {
  await fetch(`/api/photo/${tempId}`, { method: "DELETE" });
  photos = photos.filter((p) => p.temp_id !== tempId);
  render();
}

async function resetPhotos() {
  await Promise.all(photos.map((p) => fetch(`/api/photo/${p.temp_id}`, { method: "DELETE" })));
  photos = [];
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

function render() {
  const studioPhotos = photos.filter((p) => p.mode === "studio");
  const manualPhotos = photos.filter((p) => p.mode === "manual");

  studioGroupEl.classList.toggle("hidden", studioPhotos.length === 0);
  manualGroupEl.classList.toggle("hidden", manualPhotos.length === 0);
  actionsEl.classList.toggle("hidden", photos.length === 0);

  studioListEl.innerHTML = studioPhotos.map(buildCardHtml).join("");
  manualListEl.innerHTML = manualPhotos.map(buildCardHtml).join("");

  wireCards(studioListEl);
  wireCards(manualListEl);
}

processBtn.addEventListener("click", async () => {
  const batchRef = batchRefEl.value.trim();
  const batchEan = batchEanEl.value.trim();
  const batchType = batchTypeEl.value;
  const batchAnnee = batchAnneeEl.value.trim();

  const hasManual = photos.some((p) => p.mode === "manual");
  const eanValid = /^\d{13}$/.test(batchEan);
  const eanExempt = batchType === "P" && batchEan === "";

  if (hasManual && !eanValid && !eanExempt) {
    batchEanEl.classList.add("invalid");
    batchEanEl.reportValidity
      ? (batchEanEl.setCustomValidity("L'EAN doit contenir exactement 13 chiffres"),
        batchEanEl.reportValidity())
      : alert("L'EAN doit contenir exactement 13 chiffres");
    return;
  }
  batchEanEl.classList.remove("invalid");
  batchEanEl.setCustomValidity("");

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
    return {
      temp_id: p.temp_id,
      ref: batchRef,
      ean: batchEan,
      type: batchType,
      angle: p.angle,
      contexte: p.contexte,
      annee: batchAnnee,
    };
  });

  processBtn.disabled = true;
  processBtn.textContent = "Traitement en cours...";

  let results;
  try {
    const res = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(items),
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
  studioListEl.innerHTML = "";
  manualListEl.innerHTML = "";
  studioGroupEl.classList.add("hidden");
  manualGroupEl.classList.add("hidden");
  actionsEl.classList.add("hidden");
  processBtn.disabled = false;
  processBtn.textContent = "Traiter et renommer";
  fileInput.value = "";
});
