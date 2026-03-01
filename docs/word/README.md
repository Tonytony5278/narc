# PanierClair — Documents Word

## Documents générés

| Fichier | Description |
|---------|-------------|
| `PanierClair_Plan_Financier.docx` | Plan financier 2026–2028 |
| `PanierClair_Plan_Affaires.docx` | Plan d'affaires 2026 |

## Régénérer les documents

### Prérequis
- Node.js 18+
- npm

### Commandes

```bash
cd docs/word
npm install
node generate.mjs
```

Les fichiers `.docx` seront régénérés dans ce dossier.

## Contenu des graphiques (Plan Financier)

| Graphique | Type | Description |
|-----------|------|-------------|
| 1 | Barres groupées | Revenus vs Charges vs Résultat Net (Années 1–3) |
| 2 | Barres empilées | Ventilation des revenus par source (Années 1–3) |
| 3 | Courbe | Solde de trésorerie cumulatif par mois (Année 1) |
| 4 | Courbe | Croissance UAM et Abonnés Premium (Années 1–3) |
| 5 | Barres | Comparaison des scénarios de sensibilité |

## Contenu des graphiques (Plan d'Affaires)

| Graphique | Type | Description |
|-----------|------|-------------|
| 1 | Anneau (Doughnut) | Marché TAM / SAM / SOM |

## Structure du projet

```
docs/word/
├── generate.mjs                    # Script de génération (ESM)
├── package.json                    # Dépendances Node.js
├── README.md                       # Ce fichier
├── PanierClair_Plan_Financier.docx # Généré automatiquement
└── PanierClair_Plan_Affaires.docx  # Généré automatiquement
```

## Notes techniques

- Les graphiques sont de véritables objets OOXML (pas des images) — ils s'ouvrent et se modifient dans Microsoft Word.
- La table des matières nécessite une mise à jour manuelle dans Word (clic droit → Mettre à jour les champs).
- Les documents sont en français canadien (`fr-CA`).
- Chaque document contient un pied de page avec le nom du document, la date « Mars 2026 » et la numérotation des pages.
