from fastapi import FastAPI, Request, Response
from rembg import remove, new_session

# rembg's own default model (bria-rmbg-2.0) is CC BY-NC 4.0, non-commercial,
# requires a paid BRIA license for commercial use. u2net is Apache 2.0,
# free for commercial use. Load it once at startup rather than per-request.
session = new_session("u2net")

app = FastAPI()


@app.post("/remove-background")
async def remove_background(request: Request):
    image_bytes = await request.body()
    result = remove(image_bytes, session=session)
    return Response(content=result, media_type="image/png")
