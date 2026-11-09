# SynthSetSolver

The Set Checker webapp can be found at https://makariosc.github.io/setsolver. Give it a try!

The heart of SynthSetSolver is the synthetic data generator: a generator that renders Set cards within a procedurally generated scene. Each scene is a camera looking at a flat table, with one homography shared by everything on it. The renderer (src/setsolver/synth/) samples deck style, layout, camera, table surface, card finish (including glossy glare), lighting and shadows, occluders (fingers, coins, pens), distractors (envelopes, playing cards, receipts) and a phone camera pipeline (blur, noise, white balance, JPEG). Labels in labels/NNNNNN.json hold each card's attributes, corners and visibility, plus all scene parameters.

These generated images are then used to fine-tune an Ultralytics YOLO26n model for detection, and an EfficientNet-B0 model for classification of each of the four card attributes. This pipeline achieves a 99.9% accuracy on the synthetic test set, and a 100% accuracy with no false positives on an independent test set compiled from real-life images taken by myself and off the internet. Included in this repo is a script for compiling this test set below (images not re-hosted here due to licensing issues).

---

## Card generation

```sh
uv run scripts/generate.py -n 48 --out data/synth/preview    # images + JSON labels
uv run scripts/preview.py data/synth/preview                 # label overlays + contact sheets
```

The card generator comes with a number of options for configuring layout and scene augmentations. See [here](#test-set) for more details.

## Training

```sh
UV_PROJECT_ENVIRONMENT=.venv-train uv sync --group train   # separate env for training
# detector
uv run scripts/generate.py -n 50000 --seed 1 --out data/synth/train --width 960 --height 1280
uv run scripts/generate.py -n 1000  --seed 2 --out data/synth/val   --width 960 --height 1280
uv run scripts/export_yolo.py data/synth/train data/synth/val --out data/yolo/cards
.venv-train/bin/python scripts/train_detector.py data/yolo/cards/data.yaml --model yolo26n-pose.pt --device 0
# classifier (160x256 straightened crops; never mirrored, since a mirrored squiggle isn't a card)
uv run scripts/extract_crops.py data/synth/train --out data/crops/train
uv run scripts/extract_crops.py data/synth/val   --out data/crops/val --jitter 0
uv run scripts/extract_crops.py data/synth/val   --out data/crops/val_jitter
.venv-train/bin/python scripts/train_classifier.py --backbone efficientnet_b0 --epochs 15 --name effb0
```

## Web app

```sh
.venv-train/bin/python scripts/export_onnx.py \
    --detector runs/pose/runs/detector/<run>/weights/best.pt \
    --classifier runs/classify/<run>/weights/best.pt \
    --photos data/real/setchecker_samples --out web/models
uv run scripts/serve_web.py   # --host 0.0.0.0 for a phone on the LAN
node web/tests/test.mjs       # set-finding + geometry tests
```

A card counts if detection is ≥ 0.80 and every attribute is ≥ 0.85. web/js/pipeline.js mirrors src/setsolver/crops.py, so keep the two in step.

To ship a model, commit web/models/meta.json and the two files it names, then push to main; .github/workflows/pages.yml deploys. The detector stays fp32 because fp16 shifts corners on WebGPU; the classifier is fp16.

## Test set

37 real photos with 449 scored cards. 14 are my own and are bundled in test_set/own/ (stored with Git LFS, so install it before cloning). The other 23 belong to their original posters, so this repo holds only their labels and links.

```sh
uv run scripts/download_test_set.py --out data/real_test
```

This copies the bundled photos and downloads the rest, checking each download against its recorded hash. Five photos are resized or cropped to match the versions that were labeled.

Labels are in test_set/labels.json, keyed by file name, with each card's corners (image px), number, color, shape and shading. Only cards with counted: true are scored. Sources, authors and licenses are in test_set/sources.json. A link may stop working if its owner removes the image.

---

## Generator Default Attribute Breakdown

| Scene content | Share of scenes | Breakdown | Options |
| --- | --- | --- | --- |
| Layout | Every scene | Grid 62%, scatter 23%, few cards 15% | --only-layouts |
| Background | Every scene | Wood 28%, rug 21%, fabric 14%, solid table 14%, tile 14%, felt 10% | --only-backgrounds |
| Distractors | 35% | 1–4 objects (45/30/15/10%): envelope 19%, playing card 14%, book 12%, game card 10%, index card 10%, e-reader 8%, business card 8%, letter 7%, receipt 6%, photo print 5%, coaster 3% | --distractor-prob, --only-distractors |
| Occluders | 30% | 1–3 objects (60/30/10%): finger 36%, coin 18%, paper 18%, phone 14%, pen 14% | SceneConfig.occluder_prob |

| Lighting | Share of scenes | Breakdown | Options |
| --- | --- | --- | --- |
| Lighting setup | Every scene | Neutral room 23%, window daylight 17%, overcast 14%, warm room 12%, fluorescent 12%, mixed warm and cool 9%, dim lamp 7%, phone flash 6% | --only-rigs |
| Glossy cards | 30% | 75% of those (22.5% of all scenes) have a lamp aimed so glare lands on the cards; 70% have a linen texture | --glossy-prob, SceneConfig.glare_light_prob |
| Photographer's shadow | 35% | Strength 0.7–1.0 | Fixed in scene.py |
| Off-frame object shadow | 31% | At least one, from two independent chances of 25% and 8% | Fixed in scene.py |

| Camera | Share of scenes | Breakdown | Options |
| --- | --- | --- | --- |
| Camera tilt | Every scene | Off straight down: under 10° 52%, 10–20° 32%, 20–30° 12%, over 30° 3% (capped at 42°) | --tilt-range LO,HI (uniform; seated scenes use 40,65) |
| Camera direction | Every scene | Square to the layout (±5°) for 80% of grid and few-card scenes, otherwise any direction | Fixed in scene.py |
| Camera roll | Every scene | Normal, standard deviation 4° | Fixed in camera.py |
| Field of view | Every scene | 64–80° 85%, 45–64° 15% | Fixed in camera.py |
| Framing | Every scene | Tight 83%, loose 12%, cards cut off by the frame 5% | SceneConfig.clip_prob, loose_prob, roomy_prob |
| Orientation | Every scene | Portrait 65%, landscape 35% | SceneConfig.landscape_prob |
| Strong defocus blur | 25% | The rest get only slight blur | Fixed in sensor.py |
| Motion blur | 15% |  | Fixed in sensor.py |
