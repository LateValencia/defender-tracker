# Defender Tracker — Guide de déploiement

## Vue d'ensemble
Stack : React + Vite → Vercel (hébergement) + Supabase (PostgreSQL)

---

## ÉTAPE 1 — Supabase (5 min)

1. Aller sur https://supabase.com → "Start your project" → créer un compte
2. "New project" → nommer "defender-tracker" → choisir une région (Europe West)
3. Attendre la création (1-2 min)
4. Dans le menu gauche : **SQL Editor** → "New Query"
5. Coller le contenu de `schema.sql` → cliquer **Run**
6. Vérifier dans **Table Editor** : 5 tables créées (vehicle, maintenance, trips, fuel, expenses)
7. Dans **Project Settings** → **API** → noter :
   - `Project URL` → ex: https://abcdefgh.supabase.co
   - `anon public` key → longue chaine JWT

---

## ÉTAPE 2 — Icônes (2 min)

1. Aller sur https://favicon.io/favicon-generator/
2. Text = "D", Background = Rounded, Background Color = #1a2600, Font Color = #c4d44a
3. Télécharger → extraire le zip
4. Copier dans le dossier `public/` :
   - `android-chrome-192x192.png` → renommer en `pwa-192x192.png`
   - `android-chrome-512x512.png` → renommer en `pwa-512x512.png`
   - `apple-touch-icon.png` → garder tel quel

---

## ÉTAPE 3 — Config locale (2 min)

Dans le dossier du projet :

```bash
cp .env.example .env.local
```

Éditer `.env.local` avec tes valeurs Supabase :
```
VITE_SUPABASE_URL=https://TON-ID.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...ta-clé-complète
```

---

## ÉTAPE 4 — Test local (2 min)

```bash
npm install
npm run dev
```

Ouvrir http://localhost:5173 → tester l'app → ajouter une entrée test

---

## ÉTAPE 5 — GitHub (3 min)

1. Aller sur https://github.com → "New repository" → nommer "defender-tracker"
2. Dans le terminal (dans le dossier du projet) :

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TON-USERNAME/defender-tracker.git
git push -u origin main
```

---

## ÉTAPE 6 — Vercel (3 min)

1. Aller sur https://vercel.com → connexion avec GitHub
2. "Add New Project" → importer `defender-tracker`
3. Dans **Environment Variables**, ajouter :
   - `VITE_SUPABASE_URL` = ta valeur
   - `VITE_SUPABASE_ANON_KEY` = ta valeur
4. Cliquer **Deploy**
5. Vercel donne une URL type `defender-tracker-xxx.vercel.app`
   → renommer en `defender-tracker.vercel.app` dans les settings

---

## ÉTAPE 7 — iPhone Safari (1 min)

1. Ouvrir l'URL Vercel sur Safari iPhone
2. Icône Partager (carré avec flèche) → "Sur l'écran d'accueil"
3. Nommer "Defender" → Ajouter

L'app apparaît comme une vraie app, plein écran sans barre Safari.

---

## Mises à jour futures

Chaque `git push` sur `main` redéploie automatiquement sur Vercel.

```bash
git add .
git commit -m "description du changement"
git push
```

---

## Dépannage

**Erreur "Variables Supabase manquantes"**
→ Vérifier `.env.local` (variables VITE_*)
→ Sur Vercel : vérifier Environment Variables dans Project Settings

**Tables non trouvées**
→ Relancer le `schema.sql` dans Supabase SQL Editor

**PWA ne s'installe pas sur iPhone**
→ Vérifier que `public/apple-touch-icon.png` existe (180x180 PNG)
→ Ouvrir en HTTPS (Vercel), pas en localhost
