import os
import re

ANGLE_TO_CARREFOUR = {
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

CONTEXTE_TO_NATURE = {"P": "", "N": "E", "M": "AMB"}

ANGLE_LABELS = {
    "0": "3/4",
    "1": "Avant",
    "2": "Gauche",
    "3": "Dessus",
    "7": "Arriere",
    "8": "Droite",
    "9": "Dessous",
}

NATURE_LABELS = {
    "": "Emballe",
    "E": "Modele d'expo",
    "PAV": "Pret a vendre",
    "AMB": "Ambiance",
}

ADDONE_PATTERN = re.compile(
    r"^(?P<ref>.+)_(?P<ean>\d{13})_(?P<type>[PV])_H(?P<angle>\d)S_(?P<contexte>[PNMTQ])_S(?P<seq>\d{2})_(?P<annee>\d{4})_I$",
    re.IGNORECASE,
)


def parse_addone_filename(filename):
    """Parse a photo already named with the Add-One output convention
    ({Ref}_{EAN}_{Type}_H{Angle}S_{Contexte}_S{NN}_{Annee}_I.ext). Returns a
    dict of extracted fields or None if the filename doesn't match."""
    stem = os.path.splitext(filename)[0]
    match = ADDONE_PATTERN.match(stem)
    if not match:
        return None
    return match.groupdict()


def suggest_carrefour_fields(parsed):
    """Given fields parsed from an Add-One filename, suggest the
    corresponding Carrefour angle/nature/info values (the user can still
    adjust them, notably nature when contexte is T or PAV is intended)."""
    angle = ANGLE_TO_CARREFOUR.get(parsed["angle"], "0")
    contexte = parsed["contexte"].upper()
    if contexte == "T":
        return {"angle": angle, "nature": "", "info": True}
    if contexte == "Q":
        # Legacy code, ambiguous between Emballe and Modele d'expo — force a manual choice.
        return {"angle": angle, "nature": None, "info": False}
    nature = CONTEXTE_TO_NATURE.get(contexte, "")
    if nature == "AMB":
        angle = "1"
    return {"angle": angle, "nature": nature, "info": False}


def is_valid_nature(nature):
    return nature in NATURE_LABELS


NATURE_NO_ZOOM = {"", "E"}


def resize_mode_for_nature(nature):
    """Emballe/Modele d'expo photos are shot on a plain background: fit the
    whole image and pad with white instead of cropping into it. Ambiance/PAV
    photos keep the cover-crop behavior."""
    return "contain" if nature in NATURE_NO_ZOOM else "cover"


def is_valid_angle(angle):
    return angle in ANGLE_LABELS


def build_filename(ean, angle, nature, info, doublon=None):
    parts = [ean, angle]
    if nature:
        parts.append(nature)
    if doublon:
        parts.append(doublon)
    if info:
        parts.append("i")
    return "_".join(parts) + ".jpg"


def assign_doublons(items):
    """Given a list of dicts with 'ean'/'angle'/'nature' keys, group items
    sharing the same combination and assign a "X-Y" doublon string to each
    item in a group of 2 or more (None if the item is alone in its group).
    Mutates nothing; returns a list of doublon values aligned with items."""
    groups = {}
    for item in items:
        key = (item["ean"], item["angle"], item["nature"])
        groups.setdefault(key, []).append(item)

    doublons = []
    seen_counts = {}
    for item in items:
        key = (item["ean"], item["angle"], item["nature"])
        group = groups[key]
        if len(group) < 2:
            doublons.append(None)
            continue
        seen_counts[key] = seen_counts.get(key, 0) + 1
        doublons.append(f"{seen_counts[key]}-{len(group)}")

    return doublons
