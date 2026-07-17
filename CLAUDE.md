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
| `Contexte` | `P` = Produit emballé/Packshot, `N` = Produit nu/Préparé, `M` = Produit mis en situation, `T` = Produit + Texte (infographie). Un ancien code `Q` existe sur des photos historiques dans `Z:\Photos` mais n'est plus utilisé — ne pas le proposer dans l'interface. |
| `S{NN}` | Numéro de séquence (01-99), incrémenté automatiquement quand plusieurs photos partagent la même Ref + Angle + Contexte |
| `Année` | Année en cours au moment du traitement |
| `I` | Suffixe fixe, ne change jamais |

## Contraintes fichier

- Toutes les photos de sortie doivent être en `.jpg`
- Poids max **1 Mo** par photo — compression automatique si besoin (qualité JPEG dégressive puis redimensionnement en dernier recours)

## Flux "manuel"

Champs saisis une fois pour tout le lot (un lot = un produit) :
- Référence produit
- EAN
- Type (P/V)
- Année (pré-rempli avec l'année en cours)

Champs saisis par photo :
- Angle (0-9)
- Contexte (P/N/M/T)

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

## Roadmap / à faire

- **Intégration Quable** : récupérer automatiquement l'info Produit/Variante (P/V) depuis le PIM au lieu du défaut `P` manuel. Nécessite de vérifier les capacités d'API exposées par Quable (clé API, endpoint, etc.). Pas encore commencé.

## Architecture technique

- **Stack** : Python 3.12 + Flask + Pillow, interface web locale (HTML/CSS/JS vanilla)
- `app.py` — routes Flask (`/`, `/api/upload`, `/api/photo/<temp_id>` DELETE, `/api/process`)
- `core.py` — logique métier : parsing du nom studio, génération du nom final, compression JPEG, calcul du numéro de séquence
- `templates/index.html` — page principale
- `static/app.js`, `static/style.css` — logique front (drag & drop, formulaires, aperçus) et style
- `uploads/` — stockage temporaire des photos importées avant traitement
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
