import io
import os
import re
from PIL import Image

MAX_BYTES = 1_000_000

ANGLE_LABELS = {
    "0": "Autre angle ou zoom",
    "1": "Face",
    "2": "3/4 avant gauche",
    "3": "Cote gauche",
    "4": "3/4 arriere gauche",
    "5": "Dos",
    "6": "3/4 arriere droit",
    "7": "Cote droit",
    "8": "3/4 avant droit",
    "9": "Vue du dessus",
}

CONTEXTE_LABELS = {
    "P": "Produit emballe / Packshot",
    "N": "Produit nu / Prepare",
    "M": "Produit mis en situation",
    "T": "Produit + Texte (infographie)",
}

TYPE_LABELS = {
    "P": "Produit (pas de sous-reference)",
    "V": "Variante (sous-reference)",
}

STUDIO_PATTERN = re.compile(
    r"^I_(?P<ref>\d+)_(?P<ean>\d{13})_(?P<contexte>[PNMT])_(?P<annee>\d{4})_.*_(?P<angle>\d)$"
)


def parse_studio_filename(filename):
    """Try to parse a studio-camera filename. Returns a dict of extracted
    fields or None if the filename doesn't match the studio pattern."""
    stem = os.path.splitext(filename)[0]
    match = STUDIO_PATTERN.match(stem)
    if not match:
        return None
    data = match.groupdict()
    return {
        "ref": data["ref"],
        "ean": data["ean"],
        "contexte": data["contexte"],
        "annee": data["annee"],
        "angle": data["angle"],
        "type": "P",
    }


def is_studio_filename(filename):
    return parse_studio_filename(filename) is not None


def is_valid_ean(ean):
    return bool(re.fullmatch(r"\d{13}", ean))


def is_valid_ref(ref):
    return bool(re.fullmatch(r"[A-Za-z0-9._-]+", ref))


def next_sequence_number(output_dir, ref, angle, contexte):
    """Scan output_dir for existing files matching the same
    ref/angle/contexte combination and return the next free sequence number."""
    prefix_pattern = re.compile(
        rf"^{re.escape(ref)}_\d{{13}}_[PV]_H{re.escape(angle)}S_{re.escape(contexte)}_S(\d{{2}})_\d{{4}}_I\.jpg$",
        re.IGNORECASE,
    )
    max_seq = 0
    if os.path.isdir(output_dir):
        for name in os.listdir(output_dir):
            m = prefix_pattern.match(name)
            if m:
                max_seq = max(max_seq, int(m.group(1)))
    return max_seq + 1


def build_filename(ref, ean, type_, angle, contexte, seq, annee):
    return f"{ref}_{ean}_{type_}_H{angle}S_{contexte}_S{seq:02d}_{annee}_I.jpg"


def next_available_filename(dest_dir, ref, ean, type_, angle, contexte, annee):
    """Build the final filename, guaranteeing it doesn't collide with an
    existing file in dest_dir (bumping the sequence number as needed)."""
    seq = next_sequence_number(dest_dir, ref, angle, contexte)
    filename = build_filename(ref, ean, type_, angle, contexte, seq, annee)
    while os.path.exists(os.path.join(dest_dir, filename)):
        seq += 1
        filename = build_filename(ref, ean, type_, angle, contexte, seq, annee)
    return filename


def save_as_compressed_jpg(src_path, dest_path, max_bytes=MAX_BYTES):
    """Convert an image to JPEG and compress it (if needed) so the resulting
    file is at or under max_bytes. Writes the result to dest_path."""
    with Image.open(src_path) as img:
        img = img.convert("RGB")

        quality = 90
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=quality, optimize=True)

        while buffer.tell() > max_bytes and quality > 20:
            quality -= 10
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=quality, optimize=True)

        while buffer.tell() > max_bytes:
            width, height = img.size
            img = img.resize((int(width * 0.85), int(height * 0.85)), Image.LANCZOS)
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=max(quality, 60), optimize=True)
            if min(img.size) < 200:
                break

        with open(dest_path, "wb") as f:
            f.write(buffer.getvalue())

    return os.path.getsize(dest_path)
