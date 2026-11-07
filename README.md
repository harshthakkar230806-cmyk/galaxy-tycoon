# GALAXY TYCOON

A single-player space mining and industry game that runs entirely in your browser.
Mine asteroids, upgrade your scout, build drones, stations and refineries, research alien technology, and construct the **Stellar Gateway** — or play on forever in sandbox mode.

**No backend. No database. No accounts. No external API. No environment variables.**
Everything is computed client-side and saved on your device (IndexedDB, with a localStorage fallback). Nothing is ever transmitted.

Built with React + TypeScript + Vite + Three.js.

## Install and run

Requires Node.js 18+.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-checks, then builds to dist/
npm run preview    # serve the production build locally
npm test           # engine unit tests (vitest)
npm run balance    # headless balance bot (prints a progression timeline)
```

## How to play

1. **Scan** your home system to chart its planets and belts.
2. Pick the asteroid belt and press **Mine**. Mining costs energy; use **Pulse Burst** for a big instant yield.
3. **Unload** at a dock (home system / hubs / stations), then **sell** in *Cargo*.
4. Buy your first upgrade in the **Hangar** (Laser, Cargo, Reactor, Scanner, Engines, Jump Drive, Shield, Weapons). Costs and effects are shown before you buy.
5. Follow the **Objective** card for the first steps, then take on **Missions**.
6. Build **Drones**, mining ships, stations, refineries, research labs and cargo vessels in *Stations* — they keep working while you are away (offline progress, capped at 8 hours by default, longer via research).
7. Research the 5-branch **tech tree** (Engineering, Automation, Exploration, Energy, Alien Technology).
8. Explore the **Galaxy Map** (120+ seeded systems, hidden systems, anomalies), fight pirates and hazards, collect alien discoveries and achievements.
9. Craft advanced materials, buy bigger ships (6 classes), and finish the 3-stage **Stellar Gateway** megaproject. Then keep going in endless sandbox.

Tips: keep an eye on power (buildings need it), upkeep (credits/s), and market prices — selling a lot of one resource lowers its price, which slowly recovers.

## Saving

- Autosave every 20 s and when the tab is hidden/closed; manual save in *Saves*.
- Export / import JSON from *Saves* or the main menu. Imports are validated and sanitised; corrupt files are rejected without touching your current game.
- A rolling backup is kept automatically. *Reset* asks for confirmation.

## Deploying to Vercel (static)

1. Push the project to a Git repo and import it in Vercel (or run `npx vercel`).
2. Framework preset: **Vite**. Build command: `npm run build`. Output directory: `dist`.
3. No environment variables are required. The build uses relative asset paths (`base: './'`).

Any static host works (Netlify, GitHub Pages, S3, `npx serve dist`).

## Troubleshooting

- **Black screen / "WebGL unavailable":** enable hardware acceleration, update your browser, or lower *Graphics quality* in Settings. The game needs WebGL2.
- **Slow on a low-end device:** Settings → Graphics quality "Low" (disables bloom), and enable *Reduce motion*.
- **No sound:** browsers require a click before audio starts; check the mute button (top right).
- **Progress missing:** saves are per-browser and per-origin. Private windows or cleared site data erase them — use *Export JSON* for backups.
- **Debug:** add `?debug` to the URL to expose `window.__gt` (for testing only).

## Project layout

```
src/game/    deterministic engine (data, galaxy generation, sim, combat, missions, save)
src/three/   Three.js stage and procedural visuals (planet shaders, starfield, nebulae)
src/ui/      React screens and HUD
src/audio.ts procedural WebAudio sound effects
tests/       vitest engine tests and balance bot
```
