const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const photoListEl = document.getElementById("photoList");
const manualBatchEl = document.getElementById("manualBatch");
const actionsEl = document.getElementById("actions");
const processBtn = document.getElementById("processBtn");
const resetBtn = document.getElementById("resetBtn");
const resultListEl = document.getElementById("resultList");
const batchAnneeEl = document.getElementById("batchAnnee");

batchAnneeEl.value = new Date().getFullYear();

let photos = [];

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

function render() {
  const hasManual = photos.some((p) => p.mode === "manual");
  manualBatchEl.classList.toggle("hidden", !hasManual);
  actionsEl.classList.toggle("hidden", photos.length === 0);

  photoListEl.innerHTML = photos
    .map((p) => {
      const badge =
        p.mode === "studio"
          ? '<span class="badge studio">Studio (auto)</span>'
          : '<span class="badge manual">Manuel</span>';

      const refEanInfo =
        p.mode === "studio"
          ? `<div class="name">Ref: ${p.parsed.ref} · EAN: ${p.parsed.ean} · Année: ${p.parsed.annee}</div>`
          : "";

      return `
      <div class="photo-card" data-id="${p.temp_id}">
        <img src="${p.preview_url}" alt="">
        <div class="meta">
          ${badge}
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
        </div>
        <button class="remove-btn" title="Supprimer cette photo">&times;</button>
      </div>`;
    })
    .join("");

  photoListEl.querySelectorAll(".photo-card").forEach((card) => {
    const id = card.dataset.id;
    const photo = photos.find((p) => p.temp_id === id);

    card.querySelector(".f-angle").addEventListener("change", (e) => {
      photo.angle = e.target.value;
    });
    card.querySelector(".f-contexte").addEventListener("change", (e) => {
      photo.contexte = e.target.value;
    });
    const typeSelect = card.querySelector(".f-type");
    if (typeSelect) {
      typeSelect.addEventListener("change", (e) => {
        photo.type = e.target.value;
      });
    }
    card.querySelector(".remove-btn").addEventListener("click", () => removePhoto(id));
  });
}

processBtn.addEventListener("click", async () => {
  const batchRef = document.getElementById("batchRef").value.trim();
  const batchEan = document.getElementById("batchEan").value.trim();
  const batchType = document.getElementById("batchType").value;
  const batchAnnee = document.getElementById("batchAnnee").value.trim();

  const hasManual = photos.some((p) => p.mode === "manual");
  const batchEanEl = document.getElementById("batchEan");
  const eanValid = /^\d{13}$/.test(batchEan);

  if (hasManual && !eanValid) {
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

  const res = await fetch("/api/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(items),
  });
  const results = await res.json();

  resultListEl.innerHTML = results
    .map((r) =>
      r.error
        ? `<div class="result-row error">Erreur (${r.temp_id}) : ${r.error}</div>`
        : `<div class="result-row"><span>${r.path}</span><span>${r.size_kb} Ko</span></div>`
    )
    .join("");

  photos = [];
  photoListEl.innerHTML = "";
  actionsEl.classList.add("hidden");
  processBtn.disabled = false;
  processBtn.textContent = "Traiter et renommer";
  fileInput.value = "";
});
