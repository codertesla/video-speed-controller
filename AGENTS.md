# Repository Guidelines

## Project Structure & Module Organization
Code lives at the repository root. `manifest.json` controls extension metadata, permissions, and registered scripts. `background.js` hosts the service worker that coordinates messaging and state. UI assets are grouped as `popup.html`, `popup.js`, and `styles.css`; keep related changes synchronized. Shared defaults and enums sit in `constants.js`. Platform-specific logic is separated in `content-scripts/bilibili.js`, `content-scripts/youtube.js`, and helpers in `content-scripts/video-speed-controller.js`. Icons for the toolbar and store listing are stored under `icons/`; supply retina variants when updating artwork.

## Build, Test, and Development Commands
Load the unpacked extension during development via `chrome://extensions` → enable Developer Mode → *Load unpacked* pointing at the repository root. After edits, use the *Reload* button to pick up changes. Package a release with `zip -r dist/video-speed-controller.zip . -x "dist/*" "*.git*"` to match the expected structure. Keep the ZIP contents flat (manifest in root) to satisfy Chrome Web Store submission checks.

## Coding Style & Naming Conventions
Follow the existing ES module style: four-space indentation, trailing semicolons, and double quotes for strings. Prefer `const`/`let` with block scoping, and reuse helper functions instead of duplicating logic across content scripts. Name functions and variables in `camelCase`; reserve `SCREAMING_SNAKE_CASE` for shared constants in `constants.js`. Keep comments concise and bilingual only when it adds clarity for non-English readers. Update popup markup and styles together to preserve the DOM structure expected by `popup.js` queries.

## Testing Guidelines
No automated suite exists, so rely on manual verification in Chrome. After each change, reload the extension, then open Bilibili and YouTube pages to confirm default speed application, icon state updates, and logging via DevTools (`chrome://extensions` → *Inspect views*). Test SPA navigation on YouTube and multiple simultaneous tabs to exercise the message queue in `background.js`. Document exploratory steps in the pull request when touching timing-sensitive logic.

## Commit & Pull Request Guidelines
Commits generally follow Conventional Commit prefixes (`feat`, `fix`, `chore`) with optional scoped tags like `feat(youtube): …`. Keep summaries imperative and under 72 characters; add extended descriptions for complex changes, in English or Chinese as appropriate. Each pull request should describe the motivation, summarize validation steps, link relevant issues, and include screenshots or GIFs when altering the popup UI. Request review when the branch cleanly loads as an unpacked extension without console errors.
