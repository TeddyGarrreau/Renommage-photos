import io
import os
import re
from PIL import Image

MAX_BYTES = 1_000_000
TARGET_SIZE = 3000

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


def get_image_size(path):
    """Return (width, height) of the image at path without loading full pixel data."""
    with Image.open(path) as img:
        return img.size


def is_low_res(width, height, target=TARGET_SIZE):
    """True if the source image is smaller than the export target in either
    dimension, meaning it will be upscaled (and potentially blurred) rather
    than only cropped/padded down to size."""
    return width < target or height < target


def is_valid_ean(ean):
    return bool(re.fullmatch(r"\d{13}", ean))


def is_valid_ref(ref):
    return bool(re.fullmatch(r"[A-Za-z0-9._-]+", ref))


def next_sequence_number(output_dir, ref, angle, contexte):
    """Scan output_dir for existing files matching the same
    ref/angle/contexte combination and return the next free sequence number."""
    prefix_pattern = re.compile(
        rf"^{re.escape(ref)}_(?:\d{{13}})?_[PV]_H{re.escape(angle)}S_{re.escape(contexte)}_S(\d{{2}})_\d{{4}}_I\.jpg$",
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


def find_existing_variants(dest_dir, ref):
    """Look for already-renamed photos of this ref in dest_dir and return
    every distinct EAN/type combination found (most recently modified
    first), so the batch form can offer a choice when the product has
    several variants (each with its own EAN). Returns an empty list if the
    folder doesn't exist or has no matching file."""
    if not os.path.isdir(dest_dir):
        return []

    pattern = re.compile(
        rf"^{re.escape(ref)}_(\d{{13}})_([PV])_H\dS_[PNMT]_S\d{{2}}_\d{{4}}_I\.jpg$",
        re.IGNORECASE,
    )

    seen = {}
    for name in os.listdir(dest_dir):
        m = pattern.match(name)
        if not m:
            continue
        ean, type_ = m.group(1), m.group(2).upper()
        mtime = os.path.getmtime(os.path.join(dest_dir, name))
        key = (ean, type_)
        if key not in seen or mtime > seen[key]:
            seen[key] = mtime

    return [
        {"ean": ean, "type": type_}
        for (ean, type_), _ in sorted(seen.items(), key=lambda item: item[1], reverse=True)
    ]


def next_available_filename(dest_dir, ref, ean, type_, angle, contexte, annee):
    """Build the final filename, guaranteeing it doesn't collide with an
    existing file in dest_dir (bumping the sequence number as needed)."""
    seq = next_sequence_number(dest_dir, ref, angle, contexte)
    filename = build_filename(ref, ean, type_, angle, contexte, seq, annee)
    while os.path.exists(os.path.join(dest_dir, filename)):
        seq += 1
        filename = build_filename(ref, ean, type_, angle, contexte, seq, annee)
    return filename


def resize_to_square_cover(img, size=TARGET_SIZE):
    """Scale img to cover a size x size square, then crop the center so the
    result is exactly size x size (may cut off the edges of non-square
    source images)."""
    width, height = img.size
    scale = max(size / width, size / height)
    new_width, new_height = round(width * scale), round(height * scale)
    resized = img.resize((new_width, new_height), Image.LANCZOS)

    left = (new_width - size) // 2
    top = (new_height - size) // 2
    return resized.crop((left, top, left + size, top + size))


def resize_to_square_contain(img, size=TARGET_SIZE, background=(255, 255, 255)):
    """Scale img to fit entirely within a size x size square (no cropping,
    no zooming in), then pad the remaining space with a solid background
    color so the result is exactly size x size."""
    width, height = img.size
    scale = min(size / width, size / height)
    new_width, new_height = round(width * scale), round(height * scale)
    resized = img.resize((new_width, new_height), Image.LANCZOS)

    canvas = Image.new("RGB", (size, size), background)
    offset = ((size - new_width) // 2, (size - new_height) // 2)
    canvas.paste(resized, offset)
    return canvas


def resize_to_square(img, size=TARGET_SIZE, mode="cover"):
    if mode == "contain":
        return resize_to_square_contain(img, size)
    return resize_to_square_cover(img, size)


def save_as_compressed_jpg(src_path, dest_path, max_bytes=MAX_BYTES, target_size=TARGET_SIZE, resize_mode="cover"):
    """Convert an image to a target_size x target_size JPEG and compress it
    (if needed) so the resulting file is at or under max_bytes. resize_mode
    "cover" crops the center (may cut off edges); "contain" fits the whole
    image and pads with white (no cropping/zooming). Writes to dest_path."""
    with Image.open(src_path) as img:
        img = img.convert("RGB")
        img = resize_to_square(img, target_size, mode=resize_mode)

        quality = 90
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=quality, optimize=True)

        while buffer.tell() > max_bytes and quality > 10:
            quality -= 10
            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=quality, optimize=True)

        with open(dest_path, "wb") as f:
            f.write(buffer.getvalue())

    return os.path.getsize(dest_path)
