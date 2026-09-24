# jamaribenologa.com

My personal portfolio: **[jamaribenologa.com](https://jamaribenologa.com)**

It comes in two versions:

- **Classic** (`/`): a single-page portfolio with my experience, projects, and contact info.
- **Desktop** ([`/desktop/`](https://jamaribenologa.com/desktop/)): the same portfolio as a macOS-style desktop, built from scratch in plain HTML, CSS, and JavaScript with no frameworks.

## Desktop edition

- **Window manager:** drag, resize, minimize to the dock, maximize, and z-order stacking. Pointer Events give mouse and touch one code path.
- **Customizable desktop and dock:** drag icons around a snapping grid, reorder the dock, drag apps between the dock and the desktop, and right-click for menus. Layouts are saved per visitor.
- **Apps:** About, Experience, Projects, Resume (PDF viewer), Contact, Browser (tabs and history), Terminal, Notes, Calculator, and Settings (wallpapers, light/dark mode).
- **Live demos in windows:** [Snake](https://jamaribenologa.com/snake/) and [A* Pathfinding](https://jamaribenologa.com/a-star/), loaded only when their window opens.
- **Phones:** a home screen with full-screen apps and an iOS-style edit mode (press and hold to rearrange).
- **Accessibility:** keyboard navigation, focus management, visible focus rings, and reduced-motion support.

## Structure

| Path | What it is |
|---|---|
| `index.html`, `app.css`, `app.js` | Classic site |
| `desktop/index.html` | Desktop edition markup and content |
| `desktop/desktop.js` | Window manager, dock, menu bar, boot screen |
| `desktop/apps.js` | Browser, Terminal, Notes, Calculator, Settings |
| `desktop/layout.js` | Draggable icons and dock, right-click menus, phone edit mode |
| `snake/`, `a-star/` | Live demos (from [Snake-Game](https://github.com/Askew11/Snake-Game) and [A-Pathfinding](https://github.com/Askew11/A-Pathfinding)) |

## Run locally

It's a static site, so any web server works:

```bash
python -m http.server 5799
```

Then open http://localhost:5799 for the classic site or http://localhost:5799/desktop/ for the desktop.

## Deployment

Pushes to `main` deploy automatically to Hostinger through its Git integration. Hostinger's CDN caches CSS and JavaScript for 7 days, so bump the `?v=` number on a stylesheet or script link whenever that file changes.
