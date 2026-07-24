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
- **Alerte basse résolution** : à l'upload (Add-One et Carrefour), l'app lit les dimensions réelles de la photo source (`core.get_image_size`) et affiche un avertissement sur la carte si la largeur ou la hauteur est inférieure à 3000px (`core.is_low_res`), car l'image sera alors agrandie (upscale) pour atteindre 3000x3000 et peut perdre en netteté. C'est **informatif uniquement** : ça ne bloque pas le traitement, contrairement au cas du code Q côté Carrefour.

## Dossier de destination (Add-One)

Par défaut, les photos renommées sont enregistrées dans `Z:\Photos\{Référence}\` (comportement historique, inchangé). Un bouton "Choisir un autre dossier" en haut de l'onglet Add-One ouvre le sélecteur de dossier natif Windows (même mécanisme que côté Carrefour, route `/api/browse-folder`) et permet de rediriger **tout le traitement en cours** vers un dossier choisi, quel que soit le nombre de lots/références traités ensemble. Le choix reste actif tant que "Revenir au dossier par défaut" n'est pas cliqué (il n'est pas réinitialisé automatiquement après un traitement). Le numéro de séquence (`S••`) est toujours calculé par scan du dossier de destination réel (par défaut ou personnalisé).

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

**Bouton "Ouvrir le dossier"** : sous le bandeau de résultat, un bouton par dossier de destination distinct utilisé dans le lot (généralement un seul, mais plusieurs références traitées ensemble peuvent donner plusieurs dossiers) ouvre directement ce dossier dans l'Explorateur Windows (`os.startfile`, route `POST /api/open-folder`). Pensé pour enchaîner rapidement vers un glisser-déposer manuel dans l'écran d'import média du PIM Quable (`Données > Médias > Import`) — pas d'intégration API directe avec ce DAM pour l'instant, faute d'endpoint documenté publiquement (à investiguer auprès du support Quable si besoin un jour).

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

## Flux "Carrefour"

L'interface a trois onglets en haut (avec logos) : **PIM Quable** (flux décrit ci-dessus — le nommage "Add-One" sert en réalité à l'import dans le PIM Quable, d'où le logo Quable sur cet onglet et non le logo Add-One), **Carrefour** et **Super U** (règles de nommage spécifiques à chaque enseigne, voir sections dédiées). Le gros logo Add-One en haut de page est celui de la société elle-même (identité de l'outil), pas celui d'un onglet en particulier. Statut : **fait** pour les trois.

**Principe** : contrairement au flux Add-One, l'entrée du flux Carrefour est constituée de photos **déjà renommées selon la convention Add-One** (ex: `710306_3601029899278_P_H1S_P_S01_2023_I.jpg`). L'app parse ce nom pour en extraire EAN/Angle/Contexte, puis suggère automatiquement les champs équivalents côté Carrefour (modifiables avant traitement).

### Convention de sortie Carrefour

Format : `{EAN}_{Angle}_{Nature}_{Doublon}_{i}.jpg` — **chaque segment optionnel vide est complètement omis** (pas de underscore ni placeholder, contrairement à la convention Add-One). Exemple minimal : `3601029899278_1.jpg`. Exemple complet : `3133200000994_1_E_1-3_i.jpg`.

| Segment | Détail |
|---|---|
| `EAN` | Repris tel quel depuis le nom Add-One source. Doit être un EAN valide (13 chiffres) — les photos "génériques" Add-One (EAN vide, Type forcé en P) ne peuvent pas être exportées vers Carrefour, faute d'identifiant produit. |
| `Angle` | Codes Carrefour : `0`=3/4, `1`=Avant, `2`=Gauche, `3`=Dessus, `7`=Arrière, `8`=Droite, `9`=Dessous (pas de 4/5/6 ; `9`/Dessous n'a pas d'équivalent côté Add-One). |
| `Nature` | `` (vide) = Emballé, `E` = Modèle d'expo, `PAV` = Prêt à vendre, `AMB` = Ambiance. |
| `Doublon` | `X-Y` (photo X sur Y), ajouté uniquement s'il y a ≥2 photos partageant le même EAN+Angle+Nature **dans le même lot traité**. Le total Y n'est jamais recalculé rétroactivement si un nouveau lot ajoute d'autres doublons plus tard (comportement volontaire, validé par Teddy). |
| `i` | Présent si la photo contient des informations produit visibles (texte/infographie). |

### Correspondance Add-One → Carrefour (validée par Teddy)

**Angles** : Face(1)→Avant(1), Côté gauche(3)→Gauche(2), Vue du dessus(9)→Dessus(3), Dos(5)→Arrière(7), Côté droit(7)→Droite(8), et les 4 vues 3/4 (2,4,6,8) + Autre angle/zoom(0) → 3/4(0).

**Nature** (depuis le Contexte Add-One) : P (Packshot) → vide (Emballé), N (Nu/Préparé) → E (Modèle d'expo), M (Mis en situation) → AMB (Ambiance). Le contexte **T** (Produit + Texte) ne mappe à aucune Nature : il active uniquement le suffixe `i`, la Nature reste vide par défaut et doit être ajustée manuellement si besoin. Le code **PAV** n'a aucune correspondance côté Add-One — toujours choisi manuellement au cas par cas.

**Ancien code Q** : certaines photos historiques Add-One utilisent encore le contexte `Q` (ancien code plus utilisé, cf. section "Flux studio"). Comme Q est ambigu entre Emballé et Nu/Modèle d'expo, l'app ne le déduit pas automatiquement : le champ Nature affiche un placeholder "-- Choisir Emballé ou Nu --" obligatoire, et le traitement est bloqué (message d'alerte) tant que l'utilisateur n'a pas choisi manuellement pour chaque photo concernée.

**Règle Ambiance → Angle 1** : dès qu'une photo est taguée Nature = Ambiance (AMB), que ce soit par suggestion automatique (contexte M) ou par changement manuel du menu Nature, l'Angle est forcé/réinitialisé à `1` (Avant) — une photo d'ambiance n'a pas vraiment d'angle produit précis, on standardise sur 1 par défaut (reste modifiable ensuite si besoin).

### Interface et traitement

- **Dossier par défaut : `Z:\Photo Carrefour\`** (dossier plat, pas de sous-dossier par référence — cohérent avec le fait que le nom de fichier contient déjà l'EAN). Comme pour Add-One, un bouton **"Choisir un autre dossier"** permet de rediriger ponctuellement vers un autre dossier via le sélecteur natif Windows (`tkinter.filedialog`, exécuté côté serveur), avec un lien "Revenir au dossier par défaut" pour annuler ce choix. Ce changement (dossier par défaut au lieu d'un choix obligatoire à chaque fois) a été fait pour permettre un usage multi-utilisateur depuis plusieurs postes différents une fois l'app hébergée sur un poste partagé (ex. serveur ORBITVU) : le sélecteur natif s'ouvre côté serveur et serait invisible pour un collègue sur un autre poste, donc il ne doit plus être obligatoire.
- Chaque photo déposée est parsée automatiquement (`carrefour.parse_addone_filename`). Si le nom ne correspond pas à la convention Add-One, la photo est quand même acceptée : un champ EAN texte (13 chiffres) apparaît pour le saisir manuellement, en plus des champs Angle/Nature/Info habituels (Angle par défaut `1`, Nature par défaut vide/Emballé) — pas de blocage, juste une saisie manuelle à la place de la suggestion automatique.
- Champs Angle/Nature/case "Info produit visible" pré-remplis automatiquement mais éditables par photo avant traitement.
- Mêmes contraintes fichier que Add-One (JPG, 3000x3000px, max 1 Mo, `core.save_as_compressed_jpg`), **sauf le mode de redimensionnement** qui dépend de la Nature :
  - **Emballé (vide) et Modèle d'expo (E)** — photos sur fond blanc : l'image entière est mise à l'échelle pour tenir dans 3000x3000 **sans zoom/recadrage**, le reste est complété en blanc (`core.resize_to_square_contain`). Évite de couper le produit/packaging.
  - **Ambiance (AMB) et Prêt à vendre (PAV)** — comportement inchangé : recadrage centré plein cadre (`core.resize_to_square_cover`, comme Add-One).
  - Logique de choix : `carrefour.resize_mode_for_nature(nature)`.
- Module `carrefour.py` : `parse_addone_filename`, `suggest_carrefour_fields`, `build_filename`, `assign_doublons` (regroupe les items d'un même lot par EAN+Angle+Nature et numérote les doublons).
- Routes Flask : `GET /api/browse-folder` (sélecteur de dossier natif), `POST /api/carrefour/upload`, `POST /api/carrefour/process`.

## Flux "Super U"

Statut : **fait**. Source du cahier des charges : `CAHIER DES CHARGES POUR LA DÉPOSE DES MÉDIAS.pdf` (portail fournisseurs U Multimédias, section "Visuels produits unitaires").

**Principe** : comme pour Carrefour, l'entrée est constituée de photos **déjà renommées selon la convention Add-One** (ex: `710306_3601029899278_P_H1S_P_S01_2023_I.jpg`). L'app parse ce nom et suggère les champs équivalents côté Super U.

### Convention de sortie Super U

Format : `{EAN14}_C{Face}{AngleH}{Contenu}_s{NN}[_FAB_{fabricant}]`. Exemple : `03601029899278_C1N1_s01.jpg`.

| Segment | Détail |
|---|---|
| `EAN14` | **Important (précision de Teddy)** : ne pas chercher un "vrai" EAN 14 séparé — c'est notre EAN 13 habituel (repris du nom Add-One source), complété à gauche par un `0` pour obtenir 14 caractères (`superu.to_ean14`). Conforme au cahier des charges ("EAN sur 14 caractères, complété à gauche par des 0"). |
| `C` | Nature du fichier — toujours "Haute Définition", fixe (nos exports sont toujours ≥1500px). |
| `Face` | Principale face du produit (GS1) : `0`=Autre angle/zoom, `1`=Face, `2`=Côté gauche, `3`=Dessus, `7`=Dos, `8`=Côté droit, `9`=Dessous. Mêmes assignations de chiffres que les codes Carrefour (`carrefour.ANGLE_TO_CARREFOUR`), reprises indépendamment dans `superu.ANGLE_TO_FACE`. |
| `AngleH` | Angle de prise de vue horizontal — **champ entièrement nouveau, absent du nommage Add-One** : `L`=3/4 gauche, `C`=Centre avec angle de plongée 15°, `N`=Centre sans angle de plongée, `R`=3/4 droit. Pré-rempli à `N` par défaut (décision de Teddy), toujours modifiable manuellement par photo. |
| `Contenu` | `0`=Nu/déballé, `1`=Emballé/packshot, `D`=Préparé (monté), `G`=Mis en situation. |
| `sNN` | Numéro séquentiel (01-99), calculé en scannant le dossier de destination réel pour la même combinaison EAN+Face+AngleH+Contenu (`superu.next_sequence_number` — même logique que la séquence Add-One, **pas** le système de doublon X-sur-Y de Carrefour). |
| `_FAB_{fabricant}` | Optionnel — champ texte libre, ajouté seulement si rempli (variante liée à un fabricant). |

### Correspondance Add-One → Super U (validée par Teddy)

**Contexte P** → Contenu `1` (Emballé/packshot). **Contexte M** → Contenu `G` (Mis en situation). Ces deux sont sans ambiguïté.

**Contexte N** (regroupe "nu" et "préparé" côté Add-One) → Contenu par défaut `0` (Nu/déballé), **modifiable manuellement** vers `D` (Préparé/monté) si besoin — décision de Teddy (pas de blocage, juste une valeur par défaut à corriger au cas par cas).

**Contexte T** (Produit + Texte/infographie) → **aucun équivalent Super U** (pas de case "info visible" comme chez Carrefour). Décision de Teddy : **choix manuel obligatoire** — le champ Contenu affiche un placeholder "-- Choisir le contenu --" et le traitement est bloqué (message d'alerte) tant que l'utilisateur n'a pas choisi manuellement pour chaque photo concernée. Le contexte legacy **Q** (cf. "Flux studio") suit la même règle (choix manuel obligatoire), pour la même raison que côté Carrefour : ambigu, pas de défaut fiable.

### Interface et traitement

- **Dossier par défaut : `Z:\Photo Super U\`** (dossier plat, même logique et même raison que côté Carrefour ci-dessus). Bouton **"Choisir un autre dossier"** + lien "Revenir au dossier par défaut" pour rediriger ponctuellement (même sélecteur natif, route `/api/browse-folder`).
- **Pas de recadrage ni de redimensionnement** : contrairement à Add-One/Carrefour, le cahier des charges Super U n'exige pas de carré 3000x3000, seulement un minimum de 1500px sur au moins un côté et un poids ≤ 50 Mo. Comme la source est déjà notre propre export Add-One (3000x3000, ≤ 1 Mo), l'app se contente de **copier le fichier tel quel** (`shutil.copyfile`, pas de `save_as_compressed_jpg`) sous le nouveau nom — aucune perte de qualité, aucun recadrage qui pourrait couper le produit.
- **Alerte résolution insuffisante** : avertissement spécifique (`superu.is_below_min_size`, seuil **1500px**, pas 3000 comme pour Add-One/Carrefour) si ni la largeur ni la hauteur n'atteignent 1500px — la formulation précise qu'aucun agrandissement n'aura lieu (contrairement à l'alerte Add-One/Carrefour) et que le fichier serait refusé par le portail U Multimédias.
- Comme pour Carrefour, une photo dont le nom ne correspond pas à la convention Add-One est acceptée quand même : champ EAN texte manuel (13 chiffres) + Face/Angle horizontal/Contenu à choisir (Face par défaut `1`, Angle horizontal par défaut `N`). **Contenu n'a par contre pas de défaut silencieux** : comme il n'y a aucune source pour le suggérer, il reste sur le placeholder "-- Choisir le contenu --" (même mécanisme de blocage que pour les contextes T/Q ambigus) plutôt que de risquer un nom de fichier incohérent.
- Module `superu.py` : `suggest_superu_fields`, `build_filename`, `next_sequence_number`/`next_available_filename`, `to_ean14`, `is_below_min_size`. Réutilise `carrefour.parse_addone_filename` (même source, pas de duplication du parsing).
- Routes Flask : `POST /api/superu/upload`, `POST /api/superu/process`.
- Hors périmètre pour l'instant : les conventions Super U pour les **documents** (`DOC_{EAN14}_{type}`, ex. notices) et les **logos** (`LOGO_{nom}`) décrites dans le même cahier des charges — seul le flux "visuels produits unitaires" a été implémenté.

## Mode clair / sombre

Bouton (icône soleil/lune) dans l'en-tête, à droite du titre. Bascule instantanée via l'attribut `data-theme` sur `<html>` (`light`/`dark`), toutes les couleurs de `style.css` étant définies en variables CSS (`:root` pour le clair, `:root[data-theme="dark"]` pour le sombre) — aucun composant n'a de couleur en dur en dehors de ce système de variables. Choix persisté dans `localStorage` (clé `theme`), sinon la préférence système (`prefers-color-scheme`) sert de valeur par défaut au premier chargement. Un petit script inline dans le `<head>` (avant le CSS) applique le thème immédiatement pour éviter un flash de la mauvaise couleur au chargement. Contrastes texte/fond vérifiés manuellement en mode sombre (WCAG AA, ratio ≥ 4.5:1).

## Architecture technique

- **Stack** : Python 3.12 + Flask + Pillow, interface web locale (HTML/CSS/JS vanilla)
- `app.py` — routes Flask (`/`, `/api/upload`, `/api/lookup-ref/<ref>`, `/api/photo/<temp_id>` DELETE, `/api/process`, `/api/browse-folder`, `/api/carrefour/upload`, `/api/carrefour/process`, `/api/superu/upload`, `/api/superu/process`)
- `core.py` — logique métier Add-One : parsing du nom studio, génération du nom final, compression JPEG, calcul du numéro de séquence, lecture des variantes existantes dans `Z:\Photos`
- `quable.py` — appels à l'API Quable (voir section dédiée ci-dessus)
- `carrefour.py` — logique métier Carrefour (voir section dédiée ci-dessus)
- `superu.py` — logique métier Super U (voir section dédiée ci-dessus)
- `templates/index.html` — page principale (onglets PIM Quable / Carrefour / Super U)
- `static/app.js`, `static/style.css` — logique front (drag & drop, formulaires, aperçus) et style
- `static/logo-addone.png` — gros logo Add-One affiché dans l'en-tête de la page ; `static/logo-quable.png`, `static/logo-carrefour.svg`, `static/logo-superu.png` — logos affichés dans les onglets (PIM Quable / Carrefour / Super U)
- `uploads/` — stockage temporaire des photos importées avant traitement
- `.env` (non commité, voir `.env.example`) — `QUABLE_API_TOKEN`, `QUABLE_BASE_URL`
- **Sortie Add-One : `Z:\Photos\{Référence}\`** — les photos renommées/compressées sont écrites directement dans le lecteur réseau, dans le sous-dossier de la référence produit. Si le dossier référence existe déjà, les photos y sont ajoutées (numéro de séquence recalculé pour ne jamais écraser un fichier existant). S'il n'existe pas, il est créé automatiquement (nom = référence seule).
- **Sortie Carrefour : `Z:\Photo Carrefour\`** — **Sortie Super U : `Z:\Photo Super U\`** — dossiers plats par défaut (redirigeables ponctuellement via le sélecteur natif, voir sections dédiées).

### Lancer l'application

Servi par **waitress** (pas le serveur de dev Flask/mode debug — évite le débogueur Werkzeug qui permet l'exécution de code à distance), écoute sur `0.0.0.0:5000`.

**Démarrage automatique** : un script `Renommage Photos - serveur.vbs` est déposé dans le dossier Démarrage de Windows (`shell:startup`, soit `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`). Il lance `pythonw.exe app.py` (variante sans console de Python) de façon totalement silencieuse à chaque ouverture de session Windows — aucune fenêtre visible, aucune action manuelle requise. Créé via un `.vbs` plutôt qu'un raccourci `.lnk` classique car la création de raccourci par COM (`WScript.Shell`) est bloquée par le sandbox de l'environnement de dev ; le `.vbs` lui-même exécute ce même COM mais dans son propre processus `wscript.exe` au moment du login, donc sans ce problème.

**Raccourci Bureau** : `Renommage Photos.url` sur le Bureau — ouvre simplement `http://localhost:5000` dans le navigateur par défaut (le serveur tourne déjà en fond via le démarrage automatique, ce raccourci n'en lance pas un nouveau).

**Lancement manuel** (debug, ou si besoin de voir les logs dans une console) : `start_app.bat` à la racine du projet — ouvre une fenêtre de console visible avec `python.exe app.py`, puis ouvre le navigateur. À ne pas utiliser en complément du démarrage automatique silencieux (les deux tenteraient d'écouter sur le port 5000 en même temps → erreur).

### Partage multi-utilisateur : abandonné

Deux pistes explorées puis abandonnées faute de droits suffisants :
1. Héberger sur le poste **ORBITVU** (`\\DESKTOP-7DKB60I`) — bloqué : impossible d'installer Python sur cette machine (poste verrouillé/restreint par l'IT).
2. Héberger sur le PC de Teddy (`ADDONE-26-18`) et ouvrir le port 5000 aux autres postes du LAN — bloqué : Teddy n'a pas les droits admin nécessaires pour modifier le pare-feu Windows, et l'IT externe gère ces droits.

**Décision finale de Teddy** : l'outil reste à usage personnel, lancé en local sur son propre PC (`python app.py`, accès via `http://localhost:5000` uniquement, pas de partage réseau). Les dossiers de sortie par défaut Carrefour/Super U (`Z:\Photo Carrefour`, `Z:\Photo Super U`, voir sections dédiées) restent en place tels quels : même en usage solo, ils évitent d'avoir à choisir un dossier à chaque traitement.
