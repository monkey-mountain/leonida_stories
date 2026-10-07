# Leonida Stories — a GTA VI–inspired web game

A fan-made **3D first-person** open-world game that runs in the browser (rendered with Three.js), set in **Leonida**, the state from *Grand Theft Auto VI*. It needs no build step and no installs (Three.js is bundled in `js/vendor/`), and it installs as a Progressive Web App (PWA) that works offline.

> Fan project. Not affiliated with or endorsed by Rockstar Games or Take-Two Interactive. All gameplay, missions, art and audio here are original and generated in code.

## Play

Serve the folder with any static web server and open `index.html`:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

To publish it, enable **GitHub Pages → Source: GitHub Actions** in the repository settings. The workflow in `.github/workflows/pages.yml` deploys on every push to `main`.

## Features

- **3D first-person shooter view:** mouse-look aiming with a crosshair, a weapon in hand with recoil and muzzle flash, and real 3D buildings (lit windows at night), palm and pine trees, street lamps, cars and people.
- **Driving cameras:** cockpit view or chase view (V or right click), with speed-based field of view and headlights at night.

- **A procedurally built Leonida (256×256 tiles):** Vice City, the Leonida Keys, Grassrivers, Port Gellhorn, Ambrosia and Mount Kalaga National Park, connected by highways and bridges.
- **Two protagonists:** switch between Lucia Caminos and Jason Duval with Tab. Each one keeps their own position, health and weapons.
- **Driving:** arcade physics with drifting, handbrake, off-road slowdown, crash damage, skid marks, fires and explosions. There are 9 vehicle types.
- **Living city:** traffic follows the road network, and pedestrians walk around and panic.
- **Wanted system (1–5 stars):** police drive along the road graph to chase you, get out of their cars, arrest or shoot you, and send a helicopter at 4+ stars. You lose them by staying out of sight.
- **Six-mission story:** prison release, a car theft against the clock, a store robbery, a swamp shootout, a truck takedown, and a bank heist finale.
- **Robbable stores,** pickups (weapons, health, armor, cash), and safehouses where you save and sleep.
- **World and HUD:** day/night cycle with street lights and headlights, rain, a minimap with GPS routing, and a full map where you set waypoints.
- **Radio:** six stations that play anywhere (R / Shift+R, or the phone's radio app): synthwave, trap, reggae, country and reggaeton songs composed live in Web Audio, plus WCTR talk radio read aloud by the browser's speech synthesizer. Volume is in Settings.
- **Sound effects:** synthesized weapon, engine and siren sounds.
- **Phone feed, keyboard and mouse controls, and touch controls on mobile.**
- **Leonida Guide** with what has been announced about the real game (see below).

## Controls

| Action | Keys |
|---|---|
| Move / drive | WASD (arrow keys turn the view) |
| Look around | Mouse (click the game to capture the pointer) |
| Shoot | Left click or Space (J also works; in a car: click or J) |
| Driving camera | V or right click |
| Enter / exit vehicle | F / Enter |
| Sprint / handbrake | Shift on foot / Space in a vehicle |
| Interact (rob, save) | Hold E |
| Weapons | Q, mouse wheel, 1–5 |
| Switch character | Tab |
| Radio / horn | R (Shift+R back) / H |
| Map / pause / phone | M / Esc / T |

## Real-world data used

These facts come from public sources, such as Rockstar's announcements and trailers and press coverage:

- **Release:** November 19, 2026, on PS5 and Xbox Series X|S. It was first planned for 2025, then delayed to May 26, 2026, then to November 19, 2026.
- **Setting:** the state of Leonida, Rockstar's take on Florida. Its regions are Vice City, Leonida Keys, Grassrivers, Port Gellhorn, Ambrosia and Mount Kalaga National Park.
- **Protagonists:** Lucia Caminos and Jason Duval.
- **Supporting cast:** Cal Hampton, Boobie Ike, Dre'Quan Priest, Real Dimez, Raul Bautista and Brian Heder.

Everything else (map layout, missions, dialogue, vehicles' stats) is invented for this fan game.

## Code layout

```
index.html            UI shell (HUD, menus, touch controls)
css/style.css         Styling
js/data.js            Lore, regions, vehicles, weapons, missions
js/world.js           Map generation, road graph, chunked tile rendering, minimap
js/entities.js        Vehicles (physics), pedestrians, particles
js/game.js            Game loop systems: player, traffic, police, crime, missions
js/render.js          Three.js 3D renderer: city geometry, models, first-person camera, lighting, weather
js/vendor/three.min.js Three.js r149 (MIT)
js/audio.js           Web Audio sound effects
js/radio.js           Radio stations: generated music and talk radio
js/ui.js              HUD, menus, input, main loop
sw.js, manifest.webmanifest   PWA / offline support
```
