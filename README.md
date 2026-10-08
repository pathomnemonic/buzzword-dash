# Dx Dash (standalone)

**Run the list.** An endless-runner game for USMLE & COMLEX board prep: read medical buzzwords, swipe into the right diagnosis lane, dodge obstacles, collect coins and build your streak.

This is the **standalone, no-backend copy** of Dx Dash (the full app lives in `buzzword-dash-v2`). Everything runs in the browser and saves on your device. It is built with `VITE_NO_BACKEND=1`, which means:

- **Included:** the full game and all game modes, 3,000+ flashcards, Flashcards and study tools, Daily 15, Weekly Gauntlet, friend challenge links, the animated 3D heroes with per-piece colors, the maps, trails and monsters (all bought with coins), quests, badges, stats, readiness and study plan, tutorial and tour, accessibility options, offline play.
- **Left out because they need a server:** accounts and cloud saves, Friends and the feed, leaderboards, Versus multiplayer, Dx Dash Pro, real-money items and analytics. The items that are real-money in the full app are ordinary coin items here, with their level unlocks.

## Develop

```
npm ci
npm run dev          # local server
npm test             # unit tests (set VITE_NO_BACKEND=1 to match the deployed build)
npm run build        # production build in dist/
```

Set `VITE_NO_BACKEND=1` when you build or test. A push to `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes to GitHub Pages (Settings → Pages → Source: **GitHub Actions**).

## Credits

3D characters, monsters and props are CC0 (Quaternius, KayKit by Kay Lousberg, Kenney) or CC BY 3.0 where noted. See Settings → About → Credits for the full list.
