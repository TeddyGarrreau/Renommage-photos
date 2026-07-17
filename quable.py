import os

import requests

TIMEOUT = 5
VARIANT_LINK_TYPE = "link_article_variant"


def _headers():
    token = os.environ.get("QUABLE_API_TOKEN")
    if not token:
        return None
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def _base_url():
    return os.environ.get("QUABLE_BASE_URL", "").rstrip("/")


def _get(path):
    base_url = _base_url()
    headers = _headers()
    if not base_url or not headers:
        return None

    try:
        resp = requests.get(f"{base_url}{path}", headers=headers, timeout=TIMEOUT)
    except requests.RequestException:
        return None

    if resp.status_code != 200:
        return None

    return resp.json()


def _product_name(attrs):
    name = attrs.get("article_name")
    if not isinstance(name, dict):
        return None
    return name.get("fr_FR") or None


def get_product_info(ref):
    """Look up a product by reference directly in Quable. Returns
    {"type": "P"|"V", "name": ..., "variants": [{"ean": ..., "label": ...}, ...]}
    or None if Quable is unreachable, unconfigured, or the ref doesn't exist."""
    document = _get(f"/api/documents/{ref}")
    if not document:
        return None

    attrs = document.get("attributes", {})
    name = _product_name(attrs)
    has_variants = bool(attrs.get("article_art_srefcod"))

    if not has_variants:
        ean = attrs.get("article_art_ean")
        if not ean:
            return None
        return {"type": "P", "name": name, "variants": [{"ean": ean, "label": None}]}

    variant_ids = [
        link["target"]["id"]
        for link in document.get("documentLinks", [])
        if link.get("linkType", {}).get("id") == VARIANT_LINK_TYPE
    ]

    variants = []
    for variant_id in variant_ids:
        variant_doc = _get(f"/api/documents/{variant_id}")
        if not variant_doc:
            continue
        v_attrs = variant_doc.get("attributes", {})
        ean = v_attrs.get("variation_sart_ean")
        if not ean:
            continue
        variants.append({"ean": ean, "label": v_attrs.get("variation_sart_sref1")})

    if not variants:
        return None

    return {"type": "V", "name": name, "variants": variants}
