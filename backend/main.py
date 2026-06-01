from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response
from pydantic import BaseModel
from pathlib import Path
from urllib.parse import urlparse, quote
import re
import json
import asyncio
from curl_cffi.requests import AsyncSession as _CurlSession
from skill_manager import SkillManager
from offline_voice import OfflineVoiceEngine
from tts_engine import LocalTTSEngine

app = FastAPI(title="Alfred – Home Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

skill_manager = SkillManager()
offline_voice_engine = OfflineVoiceEngine()
tts_engine = LocalTTSEngine()


class CommandRequest(BaseModel):
    command: str
    lang: str = "en"


class TTSRequest(BaseModel):
    text: str
    lang: str = "en"


class TTSConfigRequest(BaseModel):
    voice_preference: str | None = None
    voice_id: str | None = None


@app.post("/api/command")
async def process_command(request: CommandRequest):
    return skill_manager.handle(request.command, request.lang)


@app.get("/api/skills")
async def list_skills():
    return {"skills": skill_manager.get_all_skills()}


@app.get("/api/voice/status")
async def voice_status():
    return offline_voice_engine.status()


@app.get("/api/tts/status")
async def tts_status():
    return tts_engine.status()


@app.get("/api/tts/voices")
async def tts_voices():
    return {"voices": tts_engine.list_voices()}


@app.post("/api/tts/config")
async def tts_config(request: TTSConfigRequest):
    try:
        return tts_engine.configure(
            voice_preference=request.voice_preference,
            voice_id=request.voice_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/tts")
async def tts_synthesize(request: TTSRequest):
    if not tts_engine.enabled:
        raise HTTPException(status_code=503, detail=tts_engine.reason)

    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")

    try:
        wav_data = await asyncio.to_thread(tts_engine.synthesize, text, request.lang)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return Response(content=wav_data, media_type="audio/wav")


@app.get("/api/shopping")
async def get_shopping():
    shopping = skill_manager.get_skill("shopping")
    return shopping.get_list()


# Trusted CDN hostnames/domains allowed through the HLS proxy (prevents SSRF)
_HLS_ALLOWED_HOSTS = {
    "mediapolis.rai.it",
    "mediapolismanager.rai.it",
}
# Subdomains of these base domains are also allowed (e.g. *.msvdn.net for RAI CDN)
_HLS_ALLOWED_DOMAINS = {
    "msvdn.net",         # RAI CDN
    "akamaihd.net",      # legacy Akamai HLS
    "akamaized.net",     # Mediaset / other Akamai HLS CDN
}


def _hls_host_permitted(hostname: str) -> bool:
    if hostname in _HLS_ALLOWED_HOSTS:
        return True
    return any(hostname == d or hostname.endswith("." + d) for d in _HLS_ALLOWED_DOMAINS)


@app.get("/api/hls-proxy")
async def hls_proxy(url: str):
    """CORS proxy for HLS playlists. Uses curl-cffi (Chrome TLS fingerprint) to
    bypass CDN WAF checks, rewrites nested playlist URLs through this proxy."""
    parsed = urlparse(url)
    if not _hls_host_permitted(parsed.hostname or ""):
        raise HTTPException(status_code=403, detail="Host not permitted.")

    hostname = parsed.hostname or ""
    is_rai = hostname in ("mediapolis.rai.it", "mediapolismanager.rai.it")

    req_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "it-IT,it;q=0.9",
        "Referer": "https://www.raiplay.it/direttes/rai1" if is_rai else "https://mediasetinfinity.mediaset.it/",
    }
    if is_rai:
        req_headers["Origin"] = "https://www.raiplay.it"

    try:
        async with _CurlSession(impersonate="chrome120") as session:
            resp = await session.get(url, headers=req_headers, allow_redirects=True, timeout=10)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=f"Upstream returned {resp.status_code}")

    content_type = resp.headers.get("content-type", "")
    is_m3u8 = "mpegurl" in content_type or url.lower().endswith(".m3u8")

    if is_m3u8:
        # Use the final URL after redirects (relinker may redirect to CDN)
        base = str(resp.url).rsplit("/", 1)[0] + "/"
        def _rewrite(u: str) -> str:
            abs_u = u if u.startswith("http") else base + u
            if ".m3u8" in abs_u:
                return f"/api/hls-proxy?url={quote(abs_u, safe='')}"
            return abs_u

        _uri_re = re.compile(r'URI="([^"]+)"')

        lines = []
        for raw in resp.text.splitlines():
            line = raw.strip()
            if line and not line.startswith("#"):
                # Non-comment lines: stream/segment URLs
                line = _rewrite(line)
            elif line.startswith("#") and 'URI="' in line:
                # Rewrite URI= attributes in tags like #EXT-X-MEDIA, #EXT-X-KEY
                line = _uri_re.sub(lambda m: f'URI="{_rewrite(m.group(1))}"', raw)
            else:
                line = raw
            lines.append(line)
        return Response(
            content="\n".join(lines),
            media_type="application/vnd.apple.mpegurl",
            headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "no-cache"},
        )

    # Binary pass-through (should not normally be reached for live HLS)
    return Response(
        content=resp.content,
        media_type=content_type or "video/mp2t",
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            result = skill_manager.handle(data)
            await websocket.send_json(result)
    except WebSocketDisconnect:
        pass


@app.websocket("/ws/voice")
async def voice_websocket(websocket: WebSocket):
    await websocket.accept()

    if not offline_voice_engine.enabled:
        await websocket.send_json({
            "type": "error",
            "message": offline_voice_engine.reason,
        })
        await websocket.close(code=1011)
        return

    session = offline_voice_engine.new_session()
    await websocket.send_json({
        "type": "ready",
        "engine": "openwakeword+vosk",
        "wakeword": offline_voice_engine.wakeword_name,
    })

    try:
        while True:
            message = await websocket.receive()

            if message.get("text") is not None:
                text = message["text"]
                try:
                    payload = json.loads(text)
                except json.JSONDecodeError:
                    payload = {}

                action = payload.get("action")
                if action == "configure":
                    event = session.configure(sample_rate=payload.get("sample_rate"))
                    await websocket.send_json(event)
                elif action == "listen_once":
                    await websocket.send_json(session.force_listen())
                elif action == "ping":
                    await websocket.send_json({"type": "pong"})
                continue

            if message.get("bytes") is not None:
                events = session.process_audio(message["bytes"])
                for event in events:
                    await websocket.send_json(event)

    except WebSocketDisconnect:
        return


# Serve the frontend at root
frontend_path = Path(__file__).parent.parent / "frontend"
if frontend_path.exists():
    app.mount("/", StaticFiles(directory=str(frontend_path), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
