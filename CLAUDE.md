# Photo Renamer — ADD-ONE

Outil web local pour renommer et compresser automatiquement les photos produit avant leur import dans le PIM **Quable**.

## Contexte métier

Deux sources de photos, deux flux de traitement :

1. **Photos manuelles** — prises avec un appareil photo classique, nom de fichier quelconque (ex: `IMG_1234.jpg`). L'utilisateur doit renseigner les infos manquantes dans l'interface.
2. **Photos studio** — prises avec l'appareil du studio (fond blanc), nom de fichier structuré dont on peut extraire automatiquement une partie des infos.

## Convention de nommage finale (fichier de sortie)

Format : `{Ref}_{EAN}_{Type}_H{Angle}S_{Contexte}_S{NN}_{Année}_I.jpg`

Exemple : `7069_3700256070693_P_H0S_M_S01_2023_I.jpg`

| Segment | Description |
|---|---|
| `Ref` | Référence produit |
| `EAN` | Code-barres EAN, 13 chiffres, unique par produit. **Validé strictement** (front + back) : erreur si différent de 13 chiffres. |
| `Type` | `P` = Produit (pas de sous-référence) / `V` = Variante (produit avec sous-références). Une variante garde la même Ref mais a un EAN différent. |
| `H{Angle}S` | `H` et `S` fixes, le chiffre au milieu (0-9) indique l'angle de vue :<br>0 = Autre angle/zoom, 1 = Face, 2 = 3/4 avant gauche, 3 = Côté gauche, 4 = 3/4 arrière gauche, 5 = Dos, 6 = 3/4 arrière droit, 7 = Côté droit, 8 = 3/4 avant droit, 9 = Vue du dessus |
| `Contexte` | `P` = Produit emballé/Packshot, `N` = Produit nu/Préparé, `M` = Produit mis en situation, `T` = Produit + Texte (infographie). Un ancien code `Q` existe sur des photos historiques dans `Z:\Photos` mais n'est plus utilisé — ne pas le proposer dans l'interface.<br>**Règle P vs N** : dès qu'une étiquette/carte/tag est encore attaché au produit (même sans carton/boîte complet), c'est `P` (emballé). `N` (nu) = produit vraiment seul, sans aucun élément d'emballage/étiquetage attaché. |
| `S{NN}` | Numéro de séquence (01-99), incrémenté automatiquement quand plusieurs photos partagent la même Ref + Angle + Contexte |
| `Année` | Année en cours au moment du traitement |
| `I` | Suffixe fixe, ne change jamais |

## Contraintes fichier

- Toutes les photos de sortie doivent être en `.jpg`
- **Dimensions fixes : 3000x3000 px.** Chaque photo est redimensionnée pour couvrir un carré 3000x3000 puis **recadrée au centre** (les bords de l'image d'origine peuvent être coupés si elle n'est pas carrée — choix validé par Teddy plutôt que d'ajouter des bandes blanches ou de déformer l'image).
- Poids max **1 Mo** par photo — compression automatique si besoin (qualité JPEG dégressive, de 90 jusqu'à 10 si nécessaire). Les dimensions restent toujours 3000x3000, seule la qualité JPEG varie pour respecter le poids max.

## Flux "manuel"

**Dépôt de dossiers et multi-produits** : on peut glisser un ou plusieurs dossiers contenant chacun plusieurs photos (pas seulement des fichiers isolés). L'app détecte automatiquement la référence produit de chaque groupe de photos, dans cet ordre de priorité :
1. Le nom du dossier contenant la photo (ex: dossier `4556/`)
2. Le nom du fichier lui-même, sans extension (ex: photo renommée `7069.jpg`)

Pour chaque référence ainsi détectée, l'app tente une recherche (Quable puis `Z:\Photos` en repli) et crée automatiquement **un lot séparé** avec EAN/Type pré-remplis si le produit est trouvé. Si le dossier ne correspond à aucune référence connue, un lot est quand même créé pour ce dossier (EAN à saisir manuellement). Les photos isolées sans dossier ni nom exploitable tombent dans un lot par défaut (référence à saisir), comme avant. Chaque lot a ses propres champs Référence/EAN/Type/Année, modifiables indépendamment.

Champs saisis une fois par lot (un lot = un produit) :
- Référence produit — dès que le champ perd le focus, l'app interroge **l'API Quable** (source primaire) pour cette référence ; si Quable est injoignable/non configuré ou ne connaît pas la ref, elle se rabat automatiquement sur une lecture de `Z:\Photos\{Ref}\` (photos déjà nommées). Le statut affiché indique la source utilisée ("Quable" ou "Z:\Photos"). Si le produit est trouvé sur Quable, le **titre du produit** (attribut `article_name.fr_FR`) s'affiche sous le nom du lot, pour vérifier facilement qu'on a la bonne référence (non disponible via le repli `Z:\Photos`, qui ne connaît que les noms de fichiers).
- EAN (auto-rempli si produit trouvé, sinon à saisir)
- Type (P/V) (idem)
- Année (pré-rempli avec l'année en cours)

**Cas des variantes (V)** : une référence peut avoir plusieurs EAN différents (un par variante). Si plusieurs EAN sont trouvés (Quable ou dossier), l'app affiche un sélecteur "Variante détectée" listant chaque EAN (+ label si dispo, ex: couleur) — l'utilisateur choisit la bonne variante au lieu de se faire imposer un EAN au hasard.

**Photos génériques sur une référence à variantes** : si l'utilisateur force manuellement le champ Type sur "P" (Produit) alors que la référence a plusieurs variantes détectées, le champ EAN se vide, se désactive ("Non applicable") et le sélecteur de variante se cache — ces photos ne sont pas liées à une variante précise. Le nom de fichier final laisse le segment EAN vide (double underscore), ex : `4556__P_H1S_P_S01_2026_I.jpg`. Repasser le Type sur "V" réaffiche le sélecteur de variante et réactive le champ EAN (requis dans ce cas). Validé aussi côté serveur (`/api/process`) : EAN vide autorisé uniquement quand `type == "P"`.

Aperçu du nom de fichier final affiché en direct sous chaque photo, mis à jour à chaque changement de champ (numéro de séquence affiché en `S••` car calculé côté serveur au moment du traitement).

Champs saisis par photo :
- Angle (0-9)
- Contexte (P/N/M/T)

**Confirmation de traitement** : au clic sur "Traiter et renommer", un bandeau s'affiche au-dessus des résultats — vert "X photo(s) traitée(s) avec succès" si tout est OK, orange si succès partiel (X traitées / Y erreurs), rouge si échec total (erreurs ou requête réseau en échec).

## Flux "studio"

Nom de fichier généré par l'appareil studio, exemple : `I_7085_3700256070853_P_2026_133_1_HD_1_1`

Détection automatique par regex sur le pattern : `I_{Ref}_{EAN 13 chiffres}_{Contexte P/N/M/T}_{Année}_..._{Angle, dernier chiffre}`

Extraction automatique :
- Référence produit (`7085`)
- EAN (`3700256070853`)
- Contexte (`P` — ici la lettre correspond au **contexte**, pas au type Produit/Variante, contrairement au nom manuel)
- Année (`2026`)
- Angle = dernier chiffre du nom (`1`)

Le reste du nom (`133_1_HD_1`) n'est pas utilisé.

**Type Produit/Variante** : non présent dans le nom studio. Valeur par défaut = `P`, modifiable manuellement dans l'interface.

**Numéro de séquence** : généré automatiquement comme pour le flux manuel (incrémenté par combinaison Ref + Angle + Contexte).

## Intégration Quable (API)

Statut : **fait**, source primaire pour l'auto-remplissage EAN/Type (voir flux manuel ci-dessus). Repli automatique sur `Z:\Photos` si indisponible.

- Doc API : https://developers.quable.com (v5), auth par header `Authorization: Bearer <token>`
- Config dans `photo-renamer/.env` (jamais commité) : `QUABLE_API_TOKEN`, `QUABLE_BASE_URL` (ex: `https://add-one.quable.com`)
- `GET /api/documents/{ref}` → document type `article`. Attributs clés :
  - `attributes.article_art_ref` = référence
  - `attributes.article_art_ean` = EAN (produit sans variante)
  - `attributes.article_art_srefcod` = booléen, `true` si le produit a des sous-références (= Type `V`), `false` = Type `P`
  - `attributes.article_name.fr_FR` = titre du produit (affiché dans l'interface pour vérification visuelle)
  - `documentLinks[]` où `linkType.id == "link_article_variant"` → chaque `target.id` est l'ID d'un document de type `variation` (une variante)
- `GET /api/documents/{variation_id}` → document type `variation`. Attributs clés :
  - `attributes.variation_sart_ref` = référence (identique au parent)
  - `attributes.variation_sart_ean` = EAN de cette variante précise
  - `attributes.variation_sart_sref1` = libellé de la variante (ex: couleur "NOIR")
- Module `quable.py` : `get_product_info(ref)` fait ces appels et retourne `{"type": "P"|"V", "variants": [{"ean", "label"}]}`, ou `None` si Quable ne répond pas/pas configuré/ref inconnue (déclenche le repli `Z:\Photos`).

## Architecture technique

- **Stack** : Python 3.12 + Flask + Pillow, interface web locale (HTML/CSS/JS vanilla)
- `app.py` — routes Flask (`/`, `/api/upload`, `/api/lookup-ref/<ref>`, `/api/photo/<temp_id>` DELETE, `/api/process`)
- `core.py` — logique métier : parsing du nom studio, génération du nom final, compression JPEG, calcul du numéro de séquence, lecture des variantes existantes dans `Z:\Photos`
- `quable.py` — appels à l'API Quable (voir section dédiée ci-dessus)
- `templates/index.html` — page principale
- `static/app.js`, `static/style.css` — logique front (drag & drop, formulaires, aperçus) et style
- `uploads/` — stockage temporaire des photos importées avant traitement
- `.env` (non commité, voir `.env.example`) — `QUABLE_API_TOKEN`, `QUABLE_BASE_URL`
- **Sortie : `Z:\Photos\{Référence}\`** — les photos renommées/compressées sont écrites directement dans le lecteur réseau, dans le sous-dossier de la référence produit. Si le dossier référence existe déjà, les photos y sont ajoutées (numéro de séquence recalculé pour ne jamais écraser un fichier existant). S'il n'existe pas, il est créé automatiquement (nom = référence seule).

### Lancer l'application

```
cd photo-renamer
python app.py
```

Servi par **waitress** (pas le serveur de dev Flask/mode debug — évite le débogueur Werkzeug qui permet l'exécution de code à distance), écoute sur `0.0.0.0:5000`.

Puis ouvrir `http://localhost:5000` (en local) ou `http://<IP locale>:5000` (depuis un autre poste du réseau).

### Partage réseau avec des collègues

En pause : le profil réseau Windows de la machine est **"Public"** et une règle de pare-feu bloque déjà les connexions entrantes vers `python.exe`. Teddy doit régler ça lui-même (ou via l'IT) avant que le partage LAN fonctionne — ce n'est pas quelque chose que l'assistant modifie directement (réglages pare-feu/sécurité système). Le code est déjà prêt côté appli (waitress, pas de debug, `0.0.0.0`).
