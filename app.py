import os
import uuid

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory

import carrefour
import quable
from core import (
    ANGLE_LABELS,
    CONTEXTE_LABELS,
    TYPE_LABELS,
    find_existing_variants,
    is_valid_ean,
    is_valid_ref,
    next_available_filename,
    parse_studio_filename,
    save_as_compressed_jpg,
)

load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
PHOTOS_ROOT = r"Z:\Photos"

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)


@app.route("/")
def index():
    return render_template(
        "index.html",
        angle_labels=ANGLE_LABELS,
        contexte_labels=CONTEXTE_LABELS,
        type_labels=TYPE_LABELS,
        carrefour_angle_labels=carrefour.ANGLE_LABELS,
        carrefour_nature_labels=carrefour.NATURE_LABELS,
    )


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.route("/api/upload", methods=["POST"])
def api_upload():
    files = request.files.getlist("photos")
    results = []

    for f in files:
        temp_id = f"{uuid.uuid4().hex}{os.path.splitext(f.filename)[1]}"
        temp_path = os.path.join(UPLOAD_DIR, temp_id)
        f.save(temp_path)

        parsed = parse_studio_filename(f.filename)
        results.append(
            {
                "temp_id": temp_id,
                "original_name": f.filename,
                "preview_url": f"/uploads/{temp_id}",
                "mode": "studio" if parsed else "manual",
                "parsed": parsed,
            }
        )

    return jsonify(results)


@app.route("/api/lookup-ref/<ref>")
def api_lookup_ref(ref):
    if not is_valid_ref(ref):
        return jsonify({"found": False})

    quable_info = quable.get_product_info(ref)
    if quable_info:
        variants = [
            {"ean": v["ean"], "type": quable_info["type"], "label": v["label"]}
            for v in quable_info["variants"]
        ]
        return jsonify(
            {"found": True, "source": "quable", "name": quable_info.get("name"), "variants": variants}
        )

    variants = find_existing_variants(os.path.join(PHOTOS_ROOT, ref), ref)
    if not variants:
        return jsonify({"found": False})

    variants = [{"ean": v["ean"], "type": v["type"], "label": None} for v in variants]
    return jsonify({"found": True, "source": "photos", "name": None, "variants": variants})


@app.route("/api/photo/<path:temp_id>", methods=["DELETE"])
def api_delete_photo(temp_id):
    safe_id = os.path.basename(temp_id)
    if safe_id != temp_id:
        return jsonify({"error": "identifiant invalide"}), 400

    temp_path = os.path.join(UPLOAD_DIR, safe_id)
    if os.path.isfile(temp_path):
        os.remove(temp_path)

    return jsonify({"deleted": safe_id})


@app.route("/api/process", methods=["POST"])
def api_process():
    items = request.get_json(force=True)
    results = []

    for item in items:
        temp_id = item["temp_id"]
        ref = str(item["ref"]).strip()
        ean = str(item["ean"]).strip()
        type_ = item["type"].strip().upper()
        angle = str(item["angle"]).strip()
        contexte = item["contexte"].strip().upper()
        annee = str(item["annee"]).strip()

        src_path = os.path.join(UPLOAD_DIR, temp_id)

        if not is_valid_ref(ref):
            results.append({"temp_id": temp_id, "error": f"Référence invalide : \"{ref}\""})
            if os.path.isfile(src_path):
                os.remove(src_path)
            continue

        ean_ok = (ean == "" and type_ == "P") or is_valid_ean(ean)
        if not ean_ok:
            results.append(
                {
                    "temp_id": temp_id,
                    "error": f"EAN invalide : \"{ean}\" doit contenir exactement 13 chiffres (vide autorisé uniquement pour le type Produit)",
                }
            )
            if os.path.isfile(src_path):
                os.remove(src_path)
            continue

        if not os.path.isfile(src_path):
            results.append({"temp_id": temp_id, "error": "fichier introuvable"})
            continue

        dest_dir = os.path.join(PHOTOS_ROOT, ref)
        os.makedirs(dest_dir, exist_ok=True)
        filename = next_available_filename(dest_dir, ref, ean, type_, angle, contexte, annee)
        dest_path = os.path.join(dest_dir, filename)

        try:
            size = save_as_compressed_jpg(src_path, dest_path)
            results.append(
                {
                    "temp_id": temp_id,
                    "filename": filename,
                    "path": dest_path,
                    "size_kb": round(size / 1024, 1),
                }
            )
        except Exception as exc:
            results.append({"temp_id": temp_id, "error": str(exc)})
        finally:
            if os.path.isfile(src_path):
                os.remove(src_path)

    return jsonify(results)


@app.route("/api/browse-folder")
def api_browse_folder():
    try:
        import tkinter
        from tkinter import filedialog
    except ImportError:
        return jsonify({"error": "Selection de dossier indisponible sur ce poste (tkinter manquant)"}), 500

    root = tkinter.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    try:
        path = filedialog.askdirectory(title="Choisir le dossier de sortie Carrefour")
    finally:
        root.destroy()

    return jsonify({"path": path or None})


@app.route("/api/carrefour/upload", methods=["POST"])
def api_carrefour_upload():
    files = request.files.getlist("photos")
    results = []

    for f in files:
        temp_id = f"{uuid.uuid4().hex}{os.path.splitext(f.filename)[1]}"
        temp_path = os.path.join(UPLOAD_DIR, temp_id)
        f.save(temp_path)

        parsed = carrefour.parse_addone_filename(f.filename)
        suggested = carrefour.suggest_carrefour_fields(parsed) if parsed else None

        results.append(
            {
                "temp_id": temp_id,
                "original_name": f.filename,
                "preview_url": f"/uploads/{temp_id}",
                "parsed": parsed,
                "suggested": suggested,
            }
        )

    return jsonify(results)


@app.route("/api/carrefour/process", methods=["POST"])
def api_carrefour_process():
    payload = request.get_json(force=True)
    items = payload.get("items", [])
    dest_dir = str(payload.get("dest_folder", "")).strip()
    results = []

    if not dest_dir or not os.path.isdir(dest_dir):
        return jsonify(
            [{"temp_id": item.get("temp_id"), "error": "Dossier de destination invalide ou non choisi"} for item in items]
        )

    valid_items = []
    for item in items:
        temp_id = item["temp_id"]
        ean = str(item["ean"]).strip()
        angle = str(item["angle"]).strip()
        nature = str(item.get("nature", "")).strip()
        info = bool(item.get("info"))

        src_path = os.path.join(UPLOAD_DIR, temp_id)

        if not is_valid_ean(ean):
            results.append(
                {"temp_id": temp_id, "error": f"EAN invalide : \"{ean}\" doit contenir exactement 13 chiffres"}
            )
            if os.path.isfile(src_path):
                os.remove(src_path)
            continue

        if not carrefour.is_valid_angle(angle):
            results.append({"temp_id": temp_id, "error": f"Angle invalide : \"{angle}\""})
            if os.path.isfile(src_path):
                os.remove(src_path)
            continue

        if not carrefour.is_valid_nature(nature):
            results.append({"temp_id": temp_id, "error": f"Nature invalide : \"{nature}\""})
            if os.path.isfile(src_path):
                os.remove(src_path)
            continue

        if not os.path.isfile(src_path):
            results.append({"temp_id": temp_id, "error": "fichier introuvable"})
            continue

        valid_items.append(
            {"temp_id": temp_id, "src_path": src_path, "ean": ean, "angle": angle, "nature": nature, "info": info}
        )

    doublons = carrefour.assign_doublons(valid_items)

    for item, doublon in zip(valid_items, doublons):
        filename = carrefour.build_filename(item["ean"], item["angle"], item["nature"], item["info"], doublon)
        dest_path = os.path.join(dest_dir, filename)

        try:
            resize_mode = carrefour.resize_mode_for_nature(item["nature"])
            size = save_as_compressed_jpg(item["src_path"], dest_path, resize_mode=resize_mode)
            results.append(
                {
                    "temp_id": item["temp_id"],
                    "filename": filename,
                    "path": dest_path,
                    "size_kb": round(size / 1024, 1),
                }
            )
        except Exception as exc:
            results.append({"temp_id": item["temp_id"], "error": str(exc)})
        finally:
            if os.path.isfile(item["src_path"]):
                os.remove(item["src_path"])

    return jsonify(results)


if __name__ == "__main__":
    from waitress import serve

    serve(app, host="0.0.0.0", port=5000)
