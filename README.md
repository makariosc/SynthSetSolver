# setsolver

Photo of SET cards → detected cards → valid sets. A YOLO26n-pose detector (box + 4
corners) and an EfficientNet-B0 classifier (number, color, shape, shading), both trained
only on procedurally rendered photos with exact labels.

**Try it:** https://makariosc.github.io/setsolver/ — runs in the browser with ONNX Runtime
Web (WebGPU, falling back to WASM), so photos never leave the device. Results are
spoiler-safe: it shows the card count and reveals sets or hints on request.

**Results:** 99.9% of cards found and read correctly on 300 held-out synthetic scenes,
99.1% on 300 synthetic scenes from a seated player's angle (40–65° tilt), and 449/449 on
37 real photos (labels proposed by the model, then checked by hand).

## Generate data

```sh
uv run scripts/generate.py -n 48 --out data/synth/preview    # images + JSON labels
uv run scripts/preview.py data/synth/preview                 # label overlays + contact sheets
```

Useful flags: `--seed`, `--start`, `--workers`, `--width/--height`, `--tilt-range 40,65`
(seated angles), `--distractor-prob`, `--glossy-prob`, `--only-backgrounds rug,wood` (also
`--only-rigs`, `--only-layouts`, `--only-distractors`). `--supersample 1` renders ~3.5x
faster and is enough for detector training. Image `i` comes from seed `(seed, i)`, so any
image is reproducible.

Each scene is a camera looking at a flat table, with one homography shared by everything
on it. The renderer (`src/setsolver/synth/`) samples deck style, layout, camera, table
surface, card finish (including glossy glare), lighting and shadows, occluders (fingers,
coins, pens), distractors (envelopes, playing cards, receipts) and a phone camera pipeline
(blur, noise, white balance, JPEG). Labels in `labels/NNNNNN.json` hold each card's
attributes, corners and visibility, plus all scene parameters.

## Train

```sh
UV_PROJECT_ENVIRONMENT=.venv-train uv sync --group train   # separate env for training

# detector
uv run scripts/generate.py -n 10000 --seed 1 --out data/synth/train --width 960 --height 1280
uv run scripts/generate.py -n 1000  --seed 2 --out data/synth/val   --width 960 --height 1280
uv run scripts/export_yolo.py data/synth/train data/synth/val --out data/yolo/cards
.venv-train/bin/python scripts/train_detector.py data/yolo/cards/data.yaml --model yolo26n-pose.pt --device 0

# classifier (160x256 straightened crops; never mirrored, since a mirrored squiggle isn't a card)
uv run scripts/extract_crops.py data/synth/train --out data/crops/train
uv run scripts/extract_crops.py data/synth/val   --out data/crops/val --jitter 0
uv run scripts/extract_crops.py data/synth/val   --out data/crops/val_jitter
.venv-train/bin/python scripts/train_classifier.py --backbone efficientnet_b0 --epochs 15 --name effb0
```

`scripts/dashboard.py` charts every run under `runs/`. `scripts/predict_detector.py`,
`scripts/eval_real.py` and `scripts/eval_distractors.py` check models on real photos and
distractors. `uv run pytest` guards the card-to-image geometry.

## Web app

```sh
.venv-train/bin/python scripts/export_onnx.py \
    --detector runs/pose/runs/detector/<run>/weights/best.pt \
    --classifier runs/classify/<run>/weights/best.pt \
    --photos data/real/setchecker_samples --out web/models
uv run scripts/serve_web.py   # --host 0.0.0.0 for a phone on the LAN
node web/tests/test.mjs       # set-finding + geometry tests
```

A card counts if detection is ≥ 0.80 and every attribute is ≥ 0.85.
`web/js/pipeline.js` mirrors `src/setsolver/crops.py`, so keep the two in step.

To ship a model, commit `web/models/meta.json` and the two files it names, then push to
`main`; `.github/workflows/pages.yml` deploys. The detector stays fp32 because fp16 shifts
corners on WebGPU; the classifier is fp16.

## Extending

Backgrounds, lighting rigs, layouts, distractors and occluders are plugins, registered
with a decorator such as `@BACKGROUNDS.register("name", weight=1.0)` and sampled by weight.
See `src/setsolver/synth/`.

## Known gaps

- Tables are flat: no soft surfaces, card curl, table edge or second surface.
- No digital (app or screenshot) card styles.
