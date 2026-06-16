# Neon Kitty Catcher

Neon Kitty Catcher is a Fruit Ninja inspired browser game where cats fly across a neon canvas. The player uses camera-based finger tracking to catch cats, drag them into the glass on the right side, and transform them into dissolving pills for points.

## Installation

```bash
cd ./catopillsninja_gpt55
npm install
```

## Run

```bash
npm start
```

Open the printed local URL in a browser. Camera permission is required for normal play. If the camera is unavailable, the game switches to demo tracking so the scene still runs.

## Test

```bash
npm test
```

The Playwright HTML report is generated at:

```text
playwright-report/index.html
```

## Project Structure

- `index.html` - application shell and HUD markup.
- `src/main.js` - game loop, camera finger tracking, collision, scoring, restart, and animation logic.
- `src/styles.css` - neon visual design and responsive layout.
- `tests/game.spec.js` - Playwright end-to-end tests for start, camera-control interaction, scoring, game over, and restart.
- `playwright.config.js` - Playwright web server and HTML report configuration.
