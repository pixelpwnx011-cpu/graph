# GeoGraph Teach

A native offline Android app for teaching **coordinate geometry, trigonometry, and
graphing**, built for classroom smart boards (e.g. Geneo smart boards running
Android). It is a real, installable app — not a floating overlay.

## Features

- **Merged 2D/3D Graphing workspace** — one "Graphing" tab with a 2D/3D toggle
  (like switching viewports), instead of two separate tools. Opens by default
  showing a 3D "butterfly" surface built entirely from typed equations.
- **2D Graphing** — type an equation naturally and the app **auto-detects** the
  form: `y=sin(x)`, `x=y^2`, `r=2cos(θ)` (polar), `x=cos(t), y=sin(t)`
  (parametric), `x^2+y^2=25` (implicit curve, traced with marching squares), or
  `x^2+y^2<25` (inequality region, shaded). No manual "equation type" dropdown
  needed. Multiple equations at once, colour-coded, live parameter sliders,
  pan & zoom.
- **3D Graphing** — plot surfaces `z=f(x,y)`, rotate with a finger/pinch to
  zoom, height mapped to colour. Supports absolute value bars, `mod(x,n)`, and
  Iverson brackets `{condition}` (1 where true, 0 elsewhere — chain `{a}{b}`
  for AND) so you can carve regions directly into a surface formula, e.g.
  `x^2 {|y|<1.5+log(|x|)} {|x|<2+sin(y)}`. A custom lightweight software 3D
  renderer is used (no three.js/WebGL dependency), so the app stays small and
  fully offline.
- **"Extend to 3D"** — any 2D equation or relation has an Extend to 3D button
  that lifts it into the 3D view as a raised ridge (equalities) or a flat
  plateau region (inequalities), reusing the same bracket-condition syntax.
- **Blender-style navigation gizmo** — a small ball-widget in the corner of
  the 3D view; tap a coloured axis ball to smoothly snap the camera to that
  view, the same interaction Blender's viewport gizmo offers.
- **Formation animation** — curves sweep in and 3D surfaces grow up out of the
  plane whenever a graph is (re)plotted, instead of just popping in instantly.
  Also plays when switching back into the 2D/3D mode or the Graphing tab.
- **Adaptive quality while interacting** — 2D implicit-curve sampling and the
  3D surface grid both drop resolution while you're actively panning, zooming,
  or rotating, then snap back to full detail ~160ms after you let go, so
  dragging stays smooth on modest smart-board hardware. The WebView also runs
  on a forced GPU-composited hardware layer.
- **Draw or type points → equation** — place points on the graph (or type
  coordinates), pick Linear / Quadratic / Cubic / Quartic / Exponential / Power,
  and the app fits and plots the best-fit equation (least squares regression,
  with R² shown).
- **Coordinate Geometry tool** — tap to plot points, or type exact coordinates
  and edit them inline; instantly see distance between any two points,
  **distance from the origin**, midpoint, slope, line equation. Tap point A
  again once you have 3+ points (or press "Close Polygon") to join the shape
  into a closed polygon with perimeter/area (shoelace formula).
- **Trigonometry tool** — a draggable unit circle showing all **six** trig
  ratios (sin, cos, tan, cot, sec, csc) live, synced to a function grapher with
  amplitude/frequency/phase sliders, a reciprocal-function overlay, and
  degrees/radians toggle.
- **Math symbol palette** — quick-insert buttons for sin/cos/tan/cot/sec/csc,
  sqrt, log, ln, abs, mod, and characters that don't exist on a number pad:
  `| |` absolute value, `{ }` Iverson brackets, `⟨ ⟩` angle brackets,
  `≤ ≥ ≠`, `π`, `θ`, `∞`, and a `°` degrees macro — handy for touch-only use.
- **"Show Labels" toggle** — switches on/off axis names (Abscissa/Ordinate),
  quadrant labels (I–IV), grid tick numbers, and point coordinate labels
  everywhere, for a cleaner teaching view.
- Landscape, fullscreen, keeps the screen awake — designed for a large touch
  display, not a phone.
- 100% offline: no internet permission, no ads, no external JS libraries — the
  whole app is a handful of small hand-written JS/canvas files wrapped in a
  single-Activity WebView, so it is very lightweight.

## Project structure

```
GeoGraphApp/
├── .github/workflows/build.yml   <- GitHub Actions: builds the APK on every push
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/geneo/graphteach/MainActivity.kt   <- thin WebView shell
│       └── assets/                                     <- the actual app (HTML/CSS/JS)
│           ├── index.html
│           ├── css/style.css
│           └── js/
│               ├── parser.js    (math expression parser/evaluator)
│               ├── fit.js       (least-squares curve fitting)
│               ├── graph2d.js   (2D plane engine + equation grapher + auto-detect)
│               ├── graph3d.js   (custom 3D surface renderer + gizmo + animation)
│               ├── geometry.js  (coordinate geometry tool)
│               ├── trig.js      (unit circle + trig grapher)
│               └── app.js       (UI wiring)
├── build.gradle / settings.gradle / gradle.properties
```

## Getting the APK from GitHub

1. Create a new (empty) GitHub repository.
2. Upload/push the **contents of this zip** to that repository (so `.github/`,
   `app/`, `build.gradle`, etc. sit at the repo root).
3. GitHub Actions will automatically run the **Build APK** workflow
   (`.github/workflows/build.yml`) on every push to `main`/`master`, or you can
   trigger it manually from the **Actions** tab ("Run workflow").
4. Once the run finishes, open it and download the **`GeoGraphTeach-debug-apk`**
   artifact (a zip containing `app-debug.apk`). That APK can be sideloaded
   directly onto the Geneo smart board (enable "Install unknown apps" for your
   file manager/browser first).

A release (unsigned) APK is also produced as a separate artifact if you want to
sign it yourself for wider distribution.

## Building locally (optional)

If you have Android Studio / the Android SDK installed:

```bash
./gradlew assembleDebug
```
(There is no committed Gradle wrapper jar in this zip — Android Studio will
generate one automatically the first time you open the project, or the CI
workflow installs Gradle directly, so nothing extra is needed for GitHub
Actions builds.)

## Notes on the equation syntax

- Implicit multiplication works: `2x`, `3(x+1)`.
- Absolute value bars work: `|x|`, `|y|+|x|`.
- Comparisons `< > <= >= = ==` and Iverson brackets `{condition}` work (evaluate
  to 1/0); chain brackets `{a}{b}` for logical AND, e.g. `x^2 {x>0}`.
- Supported functions: `sin cos tan asin acos atan sinh cosh tanh cot sec csc
  sqrt abs exp ln log log2 floor ceil round sign pow atan2 min max mod`.
- Constants: `pi` (or `π`), `e`, `theta` (or `θ`).
- Nicer symbols are normalized automatically: `≤ ≥ ≠ ⟨ ⟩ × ÷ √ π θ φ` all just
  work if typed or inserted from the palette.
- Any other single letter (e.g. `a`, `k`) is treated as an adjustable
  parameter and automatically gets a slider, e.g. `a*sin(b*x)`.
- 2D equation type is auto-detected from what you type — no dropdown needed.
