import os
import re
import json
from urllib.request import Request, urlopen
from typing import Any, Dict, List, Tuple
from .base_skill import BaseSkill

FALLBACK_STATIONS: Dict[str, Dict[str, str]] = {
    "bbc world": {
        "name": "BBC World Service",
        "url": "https://stream.live.vc.bbcmedia.co.uk/bbc_world_service",
        "genre": "News",
    },
    "bbc radio 1": {
        "name": "BBC Radio 1",
        "url": "https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one",
        "genre": "Pop",
    },
    "bbc radio 2": {
        "name": "BBC Radio 2",
        "url": "https://stream.live.vc.bbcmedia.co.uk/bbc_radio_two",
        "genre": "Easy Listening",
    },
    "jazz": {
        "name": "Jazz FM",
        "url": "https://edge-bauermedia2-ice.sharp-stream.com/jazzfm.mp3",
        "genre": "Jazz",
    },
    "classical": {
        "name": "Classic FM",
        "url": "https://media-ice.musicradio.com/ClassicFM",
        "genre": "Classical",
    },
    "ambient": {
        "name": "Soma FM – Drone Zone",
        "url": "https://ice1.somafm.com/dronezone-128-mp3",
        "genre": "Ambient",
    },
    # ── Italian national radio (RAI) ──────────────────────────────
    "rai radio 1": {
        "name": "RAI Radio 1",
        "url": "https://icestreaming.rai.it/1.mp3",
        "genre": "Generalista",
    },
    "rai radio 2": {
        "name": "RAI Radio 2",
        "url": "https://icestreaming.rai.it/2.mp3",
        "genre": "Pop / Intrattenimento",
    },
    "rai radio 3": {
        "name": "RAI Radio 3",
        "url": "https://icestreaming.rai.it/3.mp3",
        "genre": "Cultura / Classica",
    },
    "rai radio 4": {
        "name": "RAI Radio 4 – GR Parlamento",
        "url": "https://icestreaming.rai.it/4.mp3",
        "genre": "Notizie / Parlamento",
    },
    "rai radio 5": {
        "name": "RAI Radio 5 – Classica",
        "url": "https://icestreaming.rai.it/5.mp3",
        "genre": "Musica Classica",
    },
    "rai isoradio": {
        "name": "RAI Isoradio",
        "url": "https://icestreaming.rai.it/isoradio.mp3",
        "genre": "Traffico / Viaggi",
    },
}

FALLBACK_ALIASES: Dict[str, str] = {
    # Italian shorthand
    "radio uno": "rai radio 1",
    "radio due": "rai radio 2",
    "radio tre": "rai radio 3",
    "radio quattro": "rai radio 4",
    "radio cinque": "rai radio 5",
    "rai uno": "rai radio 1",
    "rai due": "rai radio 2",
    "rai tre": "rai radio 3",
    "rai quattro": "rai radio 4",
    "rai cinque": "rai radio 5",
    "isoradio": "rai isoradio",
    # Numeric shorthand
    "radio 1": "rai radio 1",
    "radio 2": "rai radio 2",
    "radio 3": "rai radio 3",
    "radio 4": "rai radio 4",
    "radio 5": "rai radio 5",
    "rai 1": "rai radio 1",
    "rai 2": "rai radio 2",
    "rai 3": "rai radio 3",
    "rai 4": "rai radio 4",
    "rai 5": "rai radio 5",
}

RADIO_M3U_URL_DEFAULT = "https://raw.githubusercontent.com/Tundrak/IPTV-Italia/main/ipradioita.m3u"
RADIO_LOGO_API_URL_DEFAULT = (
    "https://all.api.radio-browser.info/json/stations/bycountrycodeexact/IT"
    "?hidebroken=true&order=clickcount&reverse=true&limit=1500"
)

_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
}


def _normalize_key(text: str) -> str:
    key = (text or "").lower()
    key = re.sub(r"[^a-z0-9]+", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    return key


def _name_match_keys(text: str) -> List[str]:
    base = _normalize_key(text)
    if not base:
        return []

    variants = {base}

    stripped = re.sub(r"\[[^\]]*\]", " ", base)
    stripped = re.sub(r"\(([^)]*)\)", " ", stripped)
    stripped = re.sub(r"\b(radio|dab|web|network|fm|am)\b", " ", stripped)
    stripped = re.sub(r"\s+", " ", stripped).strip()
    if stripped:
        variants.add(stripped)

    return [v for v in variants if v]


def _parse_attr_map(line: str) -> Dict[str, str]:
    attrs: Dict[str, str] = {}
    for key, value in re.findall(r'([a-zA-Z0-9\-_]+)="([^"]*)"', line):
        attrs[key.lower()] = value.strip()
    return attrs


def _fetch_m3u(url: str, timeout: float = 12.0) -> str:
    req = Request(url, headers=_HTTP_HEADERS)
    with urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="ignore")


def _fetch_json(url: str, timeout: float = 14.0) -> Any:
    req = Request(url, headers=_HTTP_HEADERS)
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8", errors="ignore"))


def _parse_radio_m3u(payload: str) -> Tuple[Dict[str, Dict[str, str]], Dict[str, str]]:
    stations: Dict[str, Dict[str, str]] = {}
    aliases: Dict[str, str] = {}

    pending_name = ""
    pending_meta: Dict[str, str] = {}

    for raw in payload.splitlines():
        line = raw.strip()
        if not line:
            continue

        if line.startswith("#EXTINF"):
            pending_meta = _parse_attr_map(line)
            pending_name = line.split(",", 1)[1].strip() if "," in line else ""
            continue

        if line.startswith("#"):
            continue

        if not (line.startswith("http://") or line.startswith("https://")):
            continue

        name = pending_name or pending_meta.get("tvg-name", "").strip() or "Radio"
        key_base = _normalize_key(name)
        if not key_base:
            pending_name = ""
            pending_meta = {}
            continue

        key = key_base
        idx = 2
        while key in stations:
            key = f"{key_base} {idx}"
            idx += 1

        genre = pending_meta.get("group-title", "").strip() or "Radio"

        stations[key] = {
            "name": name,
            "url": line,
            "genre": genre,
            "logo": pending_meta.get("tvg-logo", "").strip(),
        }

        aliases[key] = key
        if key.startswith("rai radio "):
            short = key.replace("rai radio ", "radio ")
            aliases.setdefault(short, key)

        pending_name = ""
        pending_meta = {}

    return stations, aliases


class RadioSkill(BaseSkill):

    def __init__(self) -> None:
        self._stations: Dict[str, Dict[str, str]] = dict(FALLBACK_STATIONS)
        self._aliases: Dict[str, str] = dict(FALLBACK_ALIASES)
        self._m3u_url = os.getenv("ALFRED_RADIO_M3U_URL", RADIO_M3U_URL_DEFAULT)
        self._logo_api_url = os.getenv("ALFRED_RADIO_LOGO_API_URL", RADIO_LOGO_API_URL_DEFAULT)
        self._load_remote_stations()
        self._enrich_station_logos()

    @property
    def name(self) -> str:
        return "radio"

    @property
    def triggers(self) -> List[str]:
        return ["radio", "music", "station", "musica", "stazione"]

    @staticmethod
    def _normalize(cmd: str) -> str:
        text = (cmd or "").lower().strip()
        if text.startswith("alfred"):
            text = text[len("alfred"):].strip(" ,")
        text = re.sub(r"\s+", " ", text)
        return text

    def _resolve_station(self, cmd: str) -> Dict[str, str] | None:
        for key, station in self._stations.items():
            if key in cmd:
                return station

        for alias, key in self._aliases.items():
            if alias in cmd:
                return self._stations.get(key)

        return None

    def _load_remote_stations(self) -> None:
        try:
            payload = _fetch_m3u(self._m3u_url)
            stations, aliases = _parse_radio_m3u(payload)
            if not stations:
                return

            max_items = int(os.getenv("ALFRED_RADIO_MAX_STATIONS", "220"))
            keys = list(stations.keys())[:max_items]
            self._stations = {k: stations[k] for k in keys}

            merged_aliases = dict(FALLBACK_ALIASES)
            for alias, key in aliases.items():
                if key in self._stations:
                    merged_aliases.setdefault(alias, key)
            self._aliases = merged_aliases
        except Exception as exc:
            print(f"[RADIO] M3U load failed, using fallback list: {exc}")

    def _enrich_station_logos(self) -> None:
        if not self._logo_api_url:
            return

        try:
            payload = _fetch_json(self._logo_api_url)
            if not isinstance(payload, list):
                return

            logo_by_key: Dict[str, str] = {}
            for item in payload:
                if not isinstance(item, dict):
                    continue

                favicon = (item.get("favicon") or "").strip()
                if not favicon or not favicon.startswith(("http://", "https://")):
                    continue

                name = item.get("name") or ""
                for key in _name_match_keys(name):
                    logo_by_key.setdefault(key, favicon)

            if not logo_by_key:
                return

            for station in self._stations.values():
                if station.get("logo"):
                    continue

                station_name = station.get("name", "")
                matched = ""
                for key in _name_match_keys(station_name):
                    matched = logo_by_key.get(key, "")
                    if matched:
                        break

                if matched:
                    station["logo"] = matched
        except Exception as exc:
            print(f"[RADIO] Logo enrichment failed: {exc}")

    def handle(self, command: str, lang: str = "en") -> Dict[str, Any]:
        cmd = self._normalize(command)
        it = lang == "it"

        if any(w in cmd for w in ("stop", "off", "pause", "ferma", "spegni", "pausa")):
            return {"action": "radio_stop",
                    "message": "Radio fermata, signore." if it else "Radio stopped, sir."}

        if any(w in cmd for w in ("list", "stations", "channels", "stazioni", "lista", "canali")):
            names = [s["name"] for s in self._stations.values()]
            joined = ", ".join(names)
            return {
                "action": "radio_stations",
                "message": f"Stazioni disponibili: {joined}." if it else f"Available stations: {joined}.",
                "data": list(self._stations.values()),
            }

        station = self._resolve_station(cmd)
        if station:
            return {
                "action": "radio_play",
                "message": f"In riproduzione {station['name']}, signore." if it else f"Playing {station['name']}, sir.",
                "data": station,
            }

        # If user requested radio but station is unclear, ask explicitly.
        names = [s["name"] for s in self._stations.values()]
        return {
            "action": "radio_stations",
            "message": (
                "Quale canale radio desidera, signore?"
                if it else
                "Which radio station would you like, sir?"
            ),
            "data": list(self._stations.values()),
            "hints": names,
        }
