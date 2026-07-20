import os
import re

from carrefour import parse_addone_filename

# Systeme U requires >=1500px on at least one side (cf. cahier des charges) -
# unlike Add-One/Carrefour, Super U has no fixed square/3000px target and this
# app never upscales for Super U (the file is copied as-is), so the generic
# core.is_low_res (3000px-based) warning doesn't apply here.
MIN_SIDE = 1500


def is_below_min_size(width, height):
    return width < MIN_SIDE and height < MIN_SIDE

# GS1 "principale face du produit" code list — same digit assignments as the
# Carrefour angle codes (0=autre/3/4, 1=face, 2=gauche, 3=dessus, 7=dos,
# 8=droit, 9=dessous), kept as an independent mapping since the two retailers
# are unrelated conventions that happen to share the GS1 standard.
ANGLE_TO_FACE = {
    "0": "0",
    "1": "1",
    "2": "0",
    "3": "2",
    "4": "0",
    "5": "7",
    "6": "0",
    "7": "8",
    "8": "0",
    "9": "3",
}

FACE_LABELS = {
    "0": "Autre angle ou zoom",
    "1": "Face",
    "2": "Cote gauche",
    "3": "Dessus",
    "7": "Dos",
    "8": "Cote droit",
    "9": "Dessous",
}

HORIZONTAL_ANGLE_LABELS = {
    "L": "Trois quart gauche",
    "C": "Centre avec angle de plongee 15",
    "N": "Centre sans angle de plongee",
    "R": "Trois quart droit",
}

CONTENU_LABELS = {
    "0": "Nu / deballe",
    "1": "Emballe / packshot",
    "D": "Prepare (monte)",
    "G": "Mis en situation",
}

# P and M map cleanly; N defaults to "Nu/deballe" (0) but is editable since
# Add-One's N covers both "nu" and "prepare" (validated by Teddy). T and Q
# have no reliable default and are left out on purpose — suggest_superu_fields
# returns contenu=None for them, forcing a manual choice in the UI.
CONTEXTE_TO_CONTENU = {"P": "1", "N": "0", "M": "G"}

DEFAULT_HORIZONTAL_ANGLE = "N"


def suggest_superu_fields(parsed):
    """Given fields parsed from an Add-One filename, suggest the
    corresponding Super U face/angle horizontal/contenu values."""
    face = ANGLE_TO_FACE.get(parsed["angle"], "0")
    contexte = parsed["contexte"].upper()
    contenu = CONTEXTE_TO_CONTENU.get(contexte)
    return {"face": face, "angle_h": DEFAULT_HORIZONTAL_ANGLE, "contenu": contenu}


def is_valid_face(face):
    return face in FACE_LABELS


def is_valid_angle_h(angle_h):
    return angle_h in HORIZONTAL_ANGLE_LABELS


def is_valid_contenu(contenu):
    return contenu in CONTENU_LABELS


def to_ean14(ean13):
    """Super U wants the EAN on 14 characters, left-padded with zeros —
    for our 13-digit EANs that's simply a single leading 0 (the standard
    GTIN-14 form of an EAN-13, per Teddy)."""
    return ean13.zfill(14)


def build_filename(ean13, face, angle_h, contenu, seq, fab=None):
    ean14 = to_ean14(ean13)
    name = f"{ean14}_C{face}{angle_h}{contenu}_s{seq:02d}"
    if fab:
        name += f"_FAB_{fab}"
    return name + ".jpg"


def next_sequence_number(dest_dir, ean13, face, angle_h, contenu):
    """Scan dest_dir for existing files matching the same
    EAN/face/angle_h/contenu combination and return the next free sequence
    number (mirrors core.next_sequence_number's approach for Add-One)."""
    ean14 = to_ean14(ean13)
    prefix_pattern = re.compile(
        rf"^{re.escape(ean14)}_C{re.escape(face)}{re.escape(angle_h)}{re.escape(contenu)}_s(\d{{2}})(?:_.*)?\.jpg$",
        re.IGNORECASE,
    )
    max_seq = 0
    if os.path.isdir(dest_dir):
        for name in os.listdir(dest_dir):
            m = prefix_pattern.match(name)
            if m:
                max_seq = max(max_seq, int(m.group(1)))
    return max_seq + 1


def next_available_filename(dest_dir, ean13, face, angle_h, contenu, fab=None):
    seq = next_sequence_number(dest_dir, ean13, face, angle_h, contenu)
    filename = build_filename(ean13, face, angle_h, contenu, seq, fab)
    while os.path.exists(os.path.join(dest_dir, filename)):
        seq += 1
        filename = build_filename(ean13, face, angle_h, contenu, seq, fab)
    return filename
