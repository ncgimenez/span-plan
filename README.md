# Span Plan 🗓️⚡

> **Time-blocking quotidien & multi-jours ultra-fluide**, conçu pour libérer la charge cognitive en alignant le temps réel avec les priorités de la journée.

Partie intégrante de l'écosystème de productivité **Span Suite** (avec *Span Focus*), **Span Plan** combine la rigueur d'un calendrier temporel avec l'agilité d'un gestionnaire de tâches.

---

## 🎯 Vision Produit & Problème Résolu

### Le problème
Les to-do lists conventionnelles créent une illusion de productivité : les tâches s'accumulent à l'infini sans estimation temporelle réaliste, menant à la procrastination et à la surcharge cognitive. À l'inverse, les agendas traditionnels (Google Calendar, Outlook) sont trop rigides pour les micro-tâches imprévues.

### La solution Span Plan
Un modèle mental équilibré reposant sur **3 piliers complémentaires** :
1. **La Grille Temporelle (Timeline 24h)** : Planification visuelle par blocs de temps (pas de 15 min, redimensionnement direct, résolution automatique des chevauchements d'horaires).
2. **Le Dock du Jour (To-do)** : Réserve de tâches à accomplir dans la journée sans créneau horaire fixe obligatoire.
3. **Le Tiroir Backlog (Later)** : Bac de capture rapide rétractable pour décharger son esprit sans polluer sa journée active.

---

## ✨ Fonctionnalités Clés & Expérience Utilisateur (UX)

### 1. Manipulation Directe & Création Intuitive
- **Création en 1 clic sur la grille** : Cliquez directement sur n'importe quel créneau horaire pour créer une tâche pré-remplie à cette heure précise.
- **Ajout rapide intelligent (NLP)** :
  - Détection automatique de l'heure (`14:30`, `14h30`, `2pm`, `9am`).
  - Détection de la durée (`30m`, `45m`, `1h`, `1h30`).
  - Détection contextuelle via tags (`#work`, `#life`, `#fun`).
  - Détection de date naturelle (`demain` / `tomorrow`, `later` / `backlog`).
- **Ajout direct dans le Dock** : Un champ inline permet d'ajouter une to-do à la journée sans quitter la colonne des yeux.

### 2. Ergonomie & Optimisation de l'Espace Vertical
- **Barre supérieure unifiée** : Navigation temporelle (`‹`, `Today`, `›`), sélecteur de vues (`1D`, `2D`, `3D`, `5D`, `7D`), filtres de contextes et actions regroupés de façon compacte pour récupérer jusqu'à 100px d'espace utile pour le planning.
- **Gestion automatique des chevauchements (*Overlaps*)** : Si deux événements partagent la même plage horaire, Span Plan calcule dynamiquement des multi-colonnes imbriquées (style Google / Apple Calendar) évitant tout masquage d'information.
- **Report automatique intelligent (*Rollover*)** : Les tâches non complétées des jours passés sont automatiquement reportées sur aujourd'hui avec un indicateur visuel distinctif (`⟳`).

### 3. Système de Design & Accessibilité
- **Palette sémantique** :
  - 🟣 **Work** (`#818cf8`) : Tâches professionnelles, études, développement.
  - 🟢 **Life** (`#10b981`) : Gestion personnelle, maison, santé, administration.
  - 🔴 **Fun** (`#fb7185`) : Loisirs, détente, projets passions.
- **Thèmes Sombre & Clair** : Transition sans rechargement, persistance locale.
- **Repère temporel dynamique (*Now marker*)** : Ligne rouge animée avec badge horaire et défilement intelligent au chargement.
- **Notifications Toast non bloquantes** : Remplacement des popups `alert()` natives par des toasts discrets et élégants.

### 4. Continuité Multi-Appareils
- Synchronisation cloud temps réel alimentée par **Supabase** (WebSockets).
- Import / Export JSON complet pour la souveraineté des données.
- Pont natif avec **Span Focus** : bascule de tâches prioritaires en 1 clic.

---

## ⌨️ Raccourcis Clavier

| Raccourci | Action |
| :--- | :--- |
| <kbd>N</kbd> ou <kbd>C</kbd> | Créer / Activer la saisie rapide de tâche |
| <kbd>T</kbd> | Revenir à la date d'**Aujourd'hui** (*Today*) |
| <kbd>←</kbd> / <kbd>→</kbd> | Naviguer dans les périodes (précédente / suivante) |
| <kbd>L</kbd> | Ouvrir / Fermer le tiroir Backlog (*Later*) |
| <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd>, <kbd>5</kbd>, <kbd>7</kbd> | Changer l'échelle de la vue (1J à 7J) |
| <kbd>Échap</kbd> | Fermer les modales, menus contextuels et tiroirs |

---

## 🛠️ Architecture Technique

```
span-plan/
├── index.html        # Structure sémantique HTML5 & modales
├── style.css         # Design system, tokens CSS, grille réactive & animations
├── js/
│   ├── app.js        # Thème, notifications Toast, raccourcis clavier, import/export
│   ├── plan.js       # Moteur de planification, drag & drop, overlap layout, NLP
│   └── sync.js       # Synchronisation temps réel Supabase & persistance locale
└── README.md         # Documentation produit & design
```

---

## 🚀 Perspectives Product Design (Roadmap)

- [ ] **Intégration d'agendas externes** : Synchronisation bidirectionnelle Google Calendar / Outlook via iCal.
- [ ] **Analytics & Bilan de fin de journée** : Récapitulatif du temps passé par contexte (`Work` vs `Life` vs `Fun`).
- [ ] **Figma UI Kit** : Conception et documentation des composants d'interface selon les standards Atomic Design.