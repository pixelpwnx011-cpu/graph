# GeoGraph Teach

A native offline Android app for teaching **coordinate geometry, trigonometry, and
graphing**, built for classroom smart boards (e.g. Geneo smart boards running
Android). It is a real, installable app — not a floating overlay.

## Features

- **2D Graphing** — plot `y=f(x)`, `x=f(y)`, polar `r=f(θ)`, or parametric curves.
  Multiple equations at once, colour-coded, live parameter sliders, pan & zoom.
- **3D Graphing** — plot surfaces `z=f(x,y)`, rotate with a finger/pinch to zoom,
  height mapped to colour. A custom lightweight software 3D renderer is used
  (no three.js/WebGL dependency), so the app stays small and fully offline.
- **Draw or type points → equation** — place points on the graph (or type
  coordinates), pick Linear / Quadratic / Cubic / Quartic / Exponential / Power,
  and the app fits and plots the best-fit equation (least squares regression,
  with R² shown).
- **Coordinate Geometry tool** — tap to plot points; instantly see distance
  between any two points, **distance from the origin**, midpoint, slope, line
  equation, and polygon perimeter/area (shoelace formula).
- **Trigonometry tool** — a draggable unit circle synced live to a sin/cos/tan
  grapher, with amplitude/frequency/phase sliders and quick-angle buttons.
- **Function palette** — quick-insert buttons for sin, cos, tan, log, ln, sqrt,
  abs, ^, π, e — handy for touch-only use on a smart board.
- **"Show Labels" toggle** — switches on/off axis names (Abscissa/Ordinate),
  quadrant labels (I–IV), grid tick numbers, and point coordinate labels
  everywhere, for a cleaner teaching view.
- Landscape, fullscreen, keeps the screen awake — designed for a large touch
  display, not a phone.
- 100% offline: no internet permission, no ads, no external JS libraries — the
  whole app is a handful of small hand-written JS/canvas files wrapped in a
  single-Activity WebView, so it is very lightweight (well under 1 MB of app
  code plus the small WebView shell).

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
│               ├── graph2d.js   (2D plane engine + equation grapher)
│               ├── graph3d.js   (custom 3D surface renderer)
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
   trigger it manually from the **Actions** tab (“Run workflow”).
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
- Supported functions: `sin cos tan asin acos atan sinh cosh tanh cot sec csc
  sqrt abs exp ln log log2 floor ceil round sign pow atan2 min max`.
- Constants: `pi`, `e`.
- Any other single letter (e.g. `a`, `k`) is treated as an adjustable
  parameter and automatically gets a slider, e.g. `a*sin(b*x)`.
