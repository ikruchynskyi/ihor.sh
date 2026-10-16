#!/bin/bash
# One-time setup for the simulated-learner review: a Python with the notebooks' libraries and Playwright's Chromium.
# Then: export REVIEW_PY=ai/review/.venv/bin/python, and run browse.py with that Python.
set -e
cd "$(dirname "$0")"
command -v uv >/dev/null || { echo "Needs uv (https://docs.astral.sh/uv/)"; exit 1; }
[ -d .venv ] || uv venv -q .venv
uv pip install -q --python .venv numpy pandas matplotlib scikit-learn torch torchvision gymnasium playwright
.venv/bin/playwright install chromium
echo "ready: REVIEW_PY=$(pwd)/.venv/bin/python"
