# Background Removal Service

Thin FastAPI wrapper around `rembg`, called by the Node backend to strip
backgrounds from uploaded logos. Runs as a separate process alongside the
Node server in dev.

## Setup

    python -m venv .venv
    .venv\Scripts\activate        (Windows)
    source .venv/bin/activate     (macOS/Linux)
    pip install -r requirements.txt

## Run

    uvicorn main:app --reload --port 8000

The first request downloads the `rembg` model (~176MB) and will be slow;
subsequent requests are fast. The Node backend expects this running at
`REMBG_SERVICE_URL` (defaults to `http://localhost:8000/remove-background`
in `.env`/`.env.test`).
