import os
import re
import io
import gzip
import datetime as dt
import xml.etree.ElementTree as ET
from urllib.parse import quote
from urllib.request import Request, urlopen
from typing import Any, Dict, List, Tuple
from .base_skill import BaseSkill

CHANNEL_ALIASES: Dict[str, str] = {
    # Italian spoken variants
    "rai uno": "rai 1",
    "rai due": "rai 2",
    "rai tre": "rai 3",
    "rai quattro": "rai 4",
    "rai cinque": "rai 5",
    "rai news 24": "rai news",
    "canale cinque": "canale 5",
    "sky tg 24": "sky tg24",
    "tg com 24": "tgcom24",
}

M3U_CHANNELS_FILE = os.path.join(
    os.path.dirname(__file__), "..", "data", "tv_m3u_urls.txt"
)

EPG_URLS_DEFAULT = "https://epgshare01.online/epgshare01/epg_ripper_IT1.xml.gz"

_HTTP_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9,it;q=0.8",
}


def _normalize_channel_key(text: str) -> str:
    key = (text or "").lower()
    key = re.sub(r"([a-z])([0-9])", r"\1 \2", key)
    key = re.sub(r"([0-9])([a-z])", r"\1 \2", key)
    key = re.sub(r"[^a-z0-9]+", " ", key)
    key = re.sub(r"\b(hd|uhd|fhd|sd|4k)\b", " ", key)
    key = re.sub(r"\s+", " ", key).strip()
    return key


def _key_variants(text: str) -> List[str]:
    base = _normalize_channel_key(text)
    if not base:
        return []

    variants = {base}

    without_noise = re.sub(r"\b(hd|uhd|fhd|sd|4k|it)\b", " ", base)
    without_noise = re.sub(r"\s+", " ", without_noise).strip()
    if without_noise:
        variants.add(without_noise)

    if base.endswith(" it"):
        variants.add(base[:-3].strip())

    return [v for v in variants if v]


def _tag_name(tag: str) -> str:
    return tag.split("}", 1)[-1]


def _parse_attr_map(line: str) -> Dict[str, str]:
    attrs: Dict[str, str] = {}
    for key, value in re.findall(r'([a-zA-Z0-9\-_]+)="([^"]*)"', line):
        attrs[key.lower()] = value.strip()
    return attrs


def _split_epg_urls(raw: str) -> List[str]:
    if not raw:
        return []
    out: List[str] = []
    for item in re.split(r"[;,]", raw):
        url = item.strip()
        if url.startswith("http://") or url.startswith("https://"):
            out.append(url)
    return out


def _youtube_embed(url: str) -> str:
    if "youtube.com/watch?v=" in url:
        video_id = url.split("watch?v=", 1)[1].split("&", 1)[0]
        return f"https://www.youtube.com/embed/{quote(video_id)}?autoplay=1"
    if "youtu.be/" in url:
        video_id = url.split("youtu.be/", 1)[1].split("?", 1)[0]
        return f"https://www.youtube.com/embed/{quote(video_id)}?autoplay=1"
    return url


def _iframe_proxy_url(url: str) -> str:
    if url.startswith("/api/frame-proxy"):
        return url
    return f"/api/frame-proxy?url={quote(url, safe='')}"


def _detect_stream_type(url: str) -> str:
    u = (url or "").lower()
    if "youtube.com" in u or "youtu.be" in u:
        return "youtube"
    if "relinker" in u:
        return "hls"
    if ".m3u8" in u:
        # Use direct HLS for broad host compatibility with open IPTV lists.
        return "hls-direct"
    if ".mpd" in u:
        return "dash-direct"
    if u.startswith("http"):
        return "link"
    return "link"


def _append_aliases(name: str, key: str, aliases: Dict[str, str]) -> None:
    normalized_name = _normalize_channel_key(name)
    if normalized_name and normalized_name not in aliases:
        aliases[normalized_name] = key

    no_quality = re.sub(r"\b(hd|uhd|fhd|sd|4k)\b", " ", normalized_name)
    no_quality = re.sub(r"\s+", " ", no_quality).strip()
    if no_quality and no_quality not in aliases:
        aliases[no_quality] = key

    if key.startswith("rai "):
        aliases.setdefault(key.replace(" 1", " uno"), key)
        aliases.setdefault(key.replace(" 2", " due"), key)
        aliases.setdefault(key.replace(" 3", " tre"), key)
        aliases.setdefault(key.replace(" 4", " quattro"), key)
        aliases.setdefault(key.replace(" 5", " cinque"), key)


def _parse_m3u_playlist(payload: str) -> Tuple[Dict[str, Dict[str, str]], Dict[str, str], List[str]]:
    channels: Dict[str, Dict[str, str]] = {}
    aliases: Dict[str, str] = {}
    epg_urls: List[str] = []

    current_name = ""
    pending_parts: List[str] = []
    pending_meta: Dict[str, str] = {}

    for raw in payload.splitlines():
        line = raw.strip()
        if not line:
            continue

        if line.startswith("#EXTM3U"):
            attrs = _parse_attr_map(line)
            epg_urls.extend(_split_epg_urls(attrs.get("url-tvg", "")))
            epg_urls.extend(_split_epg_urls(attrs.get("x-tvg-url", "")))
            continue

        if line.startswith("#EXTINF"):
            pending_meta = _parse_attr_map(line)
            current_name = line.split(",", 1)[1].strip() if "," in line else ""
            pending_parts = [current_name] if current_name else []
            continue

        if line.startswith("#"):
            continue

        if line.startswith("http://") or line.startswith("https://"):
            if not pending_parts:
                continue

            display_name = re.sub(r"\s+", " ", " ".join(pending_parts)).strip()
            key_base = _normalize_channel_key(display_name)
            if not key_base:
                pending_parts = []
                continue

            key = key_base
            index = 2
            while key in channels:
                key = f"{key_base} {index}"
                index += 1

            stream_type = pending_meta.get("type", "").strip().lower()
            if stream_type not in {"youtube", "link", "hls", "hls-direct", "dash", "dash-direct", "iframe"}:
                stream_type = _detect_stream_type(line)

            url = _youtube_embed(line) if stream_type == "youtube" else line
            if stream_type == "iframe":
                url = _iframe_proxy_url(url)

            channels[key] = {
                "name": display_name,
                "url": url,
                "type": stream_type,
                "tvg_id": pending_meta.get("tvg-id", "").strip(),
                "tvg_name": pending_meta.get("tvg-name", "").strip(),
                "tvg_logo": pending_meta.get("tvg-logo", "").strip(),
            }

            aliases[key] = key
            _append_aliases(display_name, key, aliases)

            pending_parts = []
            current_name = ""
            pending_meta = {}
            continue

        # Some lists break channel labels across multiple lines (e.g. "LA7" + "HD").
        if pending_parts:
            pending_parts.append(line)

    return channels, aliases, epg_urls


def _fetch_text(url: str, timeout: float = 14.0) -> str:
    def _decode(payload: bytes, source_url: str) -> str:
        if source_url.lower().endswith(".gz") or payload[:2] == b"\x1f\x8b":
            payload = gzip.decompress(payload)
        return payload.decode("utf-8", errors="ignore")

    try:
        req = Request(url, headers=_HTTP_HEADERS)
        with urlopen(req, timeout=timeout) as resp:
            return _decode(resp.read(), url)
    except Exception as urllib_exc:
        try:
            from curl_cffi import requests as curl_requests

            resp = curl_requests.get(url, timeout=timeout, impersonate="chrome120", verify=False)
            if resp.status_code >= 400:
                raise RuntimeError(f"HTTP {resp.status_code}")
            return _decode(resp.content, url)
        except Exception as curl_exc:
            raise RuntimeError(f"Text fetch failed: urllib={urllib_exc}; curl_cffi={curl_exc}") from curl_exc


def _parse_xmltv_time(value: str) -> dt.datetime | None:
    raw = (value or "").strip()
    if not raw:
        return None

    match = re.match(r"^(\d{14})(?:\s*([+-]\d{4}))?", raw)
    if not match:
        return None

    stamp = dt.datetime.strptime(match.group(1), "%Y%m%d%H%M%S")
    offset = match.group(2)
    if not offset:
        return stamp.replace(tzinfo=dt.timezone.utc)

    sign = 1 if offset[0] == "+" else -1
    hours = int(offset[1:3])
    minutes = int(offset[3:5])
    zone = dt.timezone(sign * dt.timedelta(hours=hours, minutes=minutes))
    return stamp.replace(tzinfo=zone).astimezone(dt.timezone.utc)


class TVSkill(BaseSkill):

    def __init__(self) -> None:
        self._channels: Dict[str, Dict[str, Any]] = {}
        self._aliases: Dict[str, str] = dict(CHANNEL_ALIASES)
        self._epg_urls_env = os.getenv("ALFRED_TV_EPG_URLS", EPG_URLS_DEFAULT)
        self._epg_by_channel_id: Dict[str, List[Dict[str, Any]]] = {}
        self._epg_name_to_id: Dict[str, str] = {}
        self._load_channels()
        self._load_epg()

    @property
    def name(self) -> str:
        return "tv"

    @property
    def triggers(self) -> List[str]:
        return ["tv", "television", "channel", "watch",
                "televisione", "canale", "guarda"]

    def matches(self, command: str) -> bool:
        cmd = command.lower()

        # Never treat YouTube requests as TV commands.
        if re.search(r"\b(youtube|youtu\.be)\b", cmd) or re.search(r"\byt\b", cmd):
            return False

        # Standard trigger words first.
        if super().matches(command):
            return True

        # Follow-up utterances should still map to TV if they mention a known channel.
        for key in self._channels.keys():
            if key in cmd:
                return True
        for alias in self._aliases.keys():
            if alias in cmd:
                return True

        return False

    def _resolve_channel(self, cmd: str) -> Dict[str, Any] | None:
        for key, channel in self._channels.items():
            if key in cmd:
                return channel

        for alias, key in self._aliases.items():
            if alias in cmd:
                return self._channels.get(key)

        return None

    def _load_channels(self) -> None:
        try:
            with open(M3U_CHANNELS_FILE, encoding="utf-8") as handle:
                payload = handle.read()
        except OSError as exc:
            print(f"[TV] Channel list load failed for {M3U_CHANNELS_FILE}: {exc}")
            return

        try:
            channels, aliases, m3u_epg_urls = _parse_m3u_playlist(payload)
            if not channels:
                print(f"[TV] No channels parsed from {M3U_CHANNELS_FILE}")
                return

            max_items = int(os.getenv("ALFRED_TV_MAX_CHANNELS", "220"))
            ordered_keys = list(channels.keys())[:max_items]
            self._channels = {k: channels[k] for k in ordered_keys}

            if m3u_epg_urls:
                merged = _split_epg_urls(self._epg_urls_env)
                for url in m3u_epg_urls:
                    if url not in merged:
                        merged.append(url)
                self._epg_urls_env = ",".join(merged)

            merged_aliases = dict(CHANNEL_ALIASES)
            for alias, key in aliases.items():
                if key in self._channels:
                    merged_aliases.setdefault(alias, key)

            # Ensure old explicit aliases still resolve if corresponding channels exist.
            for alias, legacy_key in CHANNEL_ALIASES.items():
                if legacy_key in self._channels:
                    merged_aliases[alias] = legacy_key
            self._aliases = merged_aliases
        except Exception as exc:
            print(f"[TV] M3U parse failed from {M3U_CHANNELS_FILE}: {exc}")

    def _load_epg(self) -> None:
        sources = _split_epg_urls(self._epg_urls_env)
        if not sources:
            return

        now_utc = dt.datetime.now(dt.timezone.utc)
        max_future_h = int(os.getenv("ALFRED_TV_EPG_FUTURE_HOURS", "18"))
        max_past_h = int(os.getenv("ALFRED_TV_EPG_PAST_HOURS", "4"))
        max_programs = int(os.getenv("ALFRED_TV_EPG_MAX_PROGRAMS", "20000"))

        epg_by_id: Dict[str, List[Dict[str, Any]]] = {}
        name_to_id: Dict[str, str] = {}
        seen_programs = 0

        for url in sources:
            if seen_programs >= max_programs:
                break

            try:
                xml_payload = _fetch_text(url)
            except Exception as exc:
                print(f"[TV] EPG source failed ({url}): {exc}")
                continue

            try:
                parser = ET.iterparse(io.StringIO(xml_payload), events=("end",))
            except Exception as exc:
                print(f"[TV] EPG parse init failed ({url}): {exc}")
                continue

            for _event, elem in parser:
                tag = _tag_name(elem.tag)

                if tag == "channel":
                    channel_id = (elem.attrib.get("id") or "").strip()
                    if channel_id:
                        for key in _key_variants(channel_id):
                            if key not in name_to_id:
                                name_to_id[key] = channel_id

                        for child in list(elem):
                            if _tag_name(child.tag) != "display-name":
                                continue
                            for display in _key_variants(child.text or ""):
                                if display not in name_to_id:
                                    name_to_id[display] = channel_id

                    elem.clear()
                    continue

                if tag != "programme":
                    continue

                if seen_programs >= max_programs:
                    elem.clear()
                    break

                channel_id = (elem.attrib.get("channel") or "").strip()
                start = _parse_xmltv_time(elem.attrib.get("start", ""))
                stop = _parse_xmltv_time(elem.attrib.get("stop", ""))
                if not channel_id or not start or not stop:
                    elem.clear()
                    continue

                if stop < now_utc - dt.timedelta(hours=max_past_h):
                    elem.clear()
                    continue
                if start > now_utc + dt.timedelta(hours=max_future_h):
                    elem.clear()
                    continue

                title = ""
                for child in list(elem):
                    if _tag_name(child.tag) == "title":
                        title = (child.text or "").strip()
                        if title:
                            break

                if title:
                    epg_by_id.setdefault(channel_id, []).append(
                        {
                            "title": title,
                            "start": start,
                            "stop": stop,
                        }
                    )
                    seen_programs += 1

                elem.clear()

        for channel_id, rows in epg_by_id.items():
            rows.sort(key=lambda p: p["start"])

        self._epg_by_channel_id = epg_by_id
        self._epg_name_to_id = name_to_id

        if epg_by_id:
            self._bind_epg_to_channels()

    def _bind_epg_to_channels(self) -> None:
        for key, channel in self._channels.items():
            candidates: List[str] = []
            for raw in (
                channel.get("tvg_id", ""),
                channel.get("tvg_name", ""),
                channel.get("name", ""),
                key,
            ):
                for variant in _key_variants(raw):
                    if variant not in candidates:
                        candidates.append(variant)

            epg_id = ""
            for candidate in candidates:
                if not candidate:
                    continue
                if candidate in self._epg_by_channel_id:
                    epg_id = candidate
                    break
                mapped = self._epg_name_to_id.get(candidate, "")
                if mapped and mapped in self._epg_by_channel_id:
                    epg_id = mapped
                    break

                partial = next(
                    (
                        channel_id
                        for name_key, channel_id in self._epg_name_to_id.items()
                        if name_key == candidate
                        or name_key.startswith(candidate + " ")
                        or candidate.startswith(name_key + " ")
                    ),
                    "",
                )
                if partial and partial in self._epg_by_channel_id:
                    epg_id = partial
                    break

            if epg_id:
                channel["epg_id"] = epg_id

    def _program_preview(self, channel: Dict[str, Any]) -> Dict[str, Any]:
        epg_id = (channel.get("epg_id") or "").strip()
        if not epg_id:
            return {}

        rows = self._epg_by_channel_id.get(epg_id, [])
        if not rows:
            return {}

        now_utc = dt.datetime.now(dt.timezone.utc)
        on_air = None
        next_up = None

        for item in rows:
            if item["start"] <= now_utc < item["stop"]:
                on_air = item
                continue
            if item["start"] > now_utc:
                next_up = item
                break

        def _serialize(row: Dict[str, Any] | None) -> Dict[str, Any] | None:
            if not row:
                return None
            return {
                "title": row["title"],
                "start": row["start"].isoformat(),
                "stop": row["stop"].isoformat(),
            }

        return {
            "on_air": _serialize(on_air),
            "next": _serialize(next_up),
        }

    def _channel_payload(self, key: str, channel: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "key": key,
            "name": channel.get("name", key),
            "url": channel.get("url", ""),
            "type": channel.get("type", "link"),
            "logo": channel.get("tvg_logo", ""),
            "epg": self._program_preview(channel),
        }

    def handle(self, command: str, lang: str = "en") -> Dict[str, Any]:
        cmd = command.lower()
        it = lang == "it"

        if any(w in cmd for w in ("off", "close", "stop", "hide", "spegni", "chiudi", "ferma")):
            return {"action": "tv_off",
                    "message": "Televisione spenta, signore." if it else "Television closed, sir."}

        channel = self._resolve_channel(cmd)
        if channel:
            channel_key = next(key for key, item in self._channels.items() if item is channel)
            return {
                "action": "tv_show",
                "message": f"Mostro {channel['name']}, signore." if it else f"Showing {channel['name']}, sir.",
                "data": {
                    "key": channel_key,
                    "channel_list": [
                        {
                            "key": key,
                            "name": item.get("name", key),
                            "url": item.get("url", ""),
                            "type": item.get("type", "link"),
                            "logo": item.get("tvg_logo", ""),
                        }
                        for key, item in self._channels.items()
                    ],
                    "name": channel.get("name", ""),
                    "url": channel.get("url", ""),
                    "type": channel.get("type", "link"),
                    "logo": channel.get("tvg_logo", ""),
                    "epg": self._program_preview(channel),
                },
            }

        channels_list = [self._channel_payload(k, v) for k, v in self._channels.items()]
        return {
            "action": "tv_list",
            "message": "Quale canale desidera, signore?" if it else "Which channel would you like, sir?",
            "data": channels_list,
        }
