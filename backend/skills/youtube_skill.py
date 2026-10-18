import re
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from .base_skill import BaseSkill

try:
    from yt_dlp import YoutubeDL
except ImportError:  # pragma: no cover
    YoutubeDL = None


class YouTubeSkill(BaseSkill):

    @property
    def name(self) -> str:
        return "youtube"

    @property
    def triggers(self) -> List[str]:
        return ["youtube", "youtu.be", "yt"]

    def matches(self, command: str) -> bool:
        lowered = (command or "").lower()
        if "youtu.be" in lowered or "youtube.com" in lowered:
            return True
        return bool(re.search(r"\b(youtube|yt)\b", lowered))

    def handle(self, command: str, lang: str = "en") -> Dict[str, Any]:
        if YoutubeDL is None:
            raise RuntimeError("yt-dlp is not installed")

        cmd = (command or "").strip()
        it = lang == "it"
        query = self._extract_query(cmd)

        if self._is_search_request(cmd):
            results = []
            if query:
                results = self._search_videos(query)
            return {
                "action": "youtube_search",
                "message": (
                    "Cerca un video su YouTube, signore." if it else "Search for a YouTube video, sir."
                ),
                "data": {
                    "query": query or "",
                    "results": results,
                },
            }

        if not query:
            return {
                "action": "error",
                "message": (
                    "Dimmi quale video di YouTube vuoi riprodurre, signore."
                    if it else
                    "Tell me which YouTube video you want to play, sir."
                ),
            }

        try:
            info = self._fetch_video_info(query)
        except Exception as exc:
            return {
                "action": "error",
                "message": (
                    "Non sono riuscito a recuperare il video di YouTube, signore. "
                    f"Errore: {exc}"
                    if it else
                    f"I could not retrieve the YouTube video, sir. Error: {exc}"
                ),
            }

        if not info:
            return {
                "action": "error",
                "message": (
                    "Non ho trovato alcun risultato su YouTube, signore."
                    if it else
                    "I could not find any result on YouTube, sir."
                ),
            }

        title = info.get("title") or "YouTube"
        thumb = info.get("thumbnail")
        video_id = info.get("id")
        embed_url = self._make_embed_url(video_id)
        if not embed_url:
            return {
                "action": "error",
                "message": (
                    "Non sono riuscito a costruire il link di riproduzione, signore."
                    if it else
                    "I could not build the playback link, sir."
                ),
            }

        related = []
        for item in info.get("related", []) or []:
            payload = self._related_payload(item)
            if payload:
                related.append(payload)

        return {
            "action": "tv_show",
            "message": (
                f"Riproduco {title}, signore." if it else f"Playing {title}, sir."
            ),
            "data": {
                "name": title,
                "url": embed_url,
                "type": "youtube",
                "logo": thumb or "",
                "related": related,
            },
        }

    @staticmethod
    def _is_search_request(command: str) -> bool:
        text = (command or "").lower()
        return bool(re.search(r"\b(search|find|cerca|trova|ricerca|cercare)\b", text))

    @staticmethod
    def _search_videos(query: str, limit: int = 20) -> List[Dict[str, Any]]:
        search_input = f"ytsearch{limit}:{query}"
        opts = {
            "format": "best[ext=mp4]/best",
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "nocheckcertificate": True,
            "noplaylist": True,
            "extract_flat": True,
        }

        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(search_input, download=False)

        if not info or not isinstance(info, dict):
            return []

        entries = info.get("entries") or []
        return [YouTubeSkill._result_payload(item) for item in entries if YouTubeSkill._result_payload(item)]

    @staticmethod
    def _result_payload(entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not entry:
            return None
        video_id = entry.get("id")
        if not video_id:
            return None
        url = entry.get("webpage_url") or entry.get("url")
        if not url:
            url = f"https://www.youtube.com/watch?v={quote(video_id)}"
        thumbnail = entry.get("thumbnail") or f"https://i.ytimg.com/vi/{quote(video_id)}/hqdefault.jpg"
        return {
            "id": video_id,
            "name": entry.get("title") or "YouTube",
            "url": url,
            "thumbnail": thumbnail,
            "uploader": entry.get("uploader") or entry.get("channel") or "",
            "duration": entry.get("duration") or 0,
        }

    @staticmethod
    def _related_payload(entry: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return YouTubeSkill._result_payload(entry)

    @staticmethod
    def _extract_query(command: str) -> Optional[str]:
        text = (command or "").strip()
        text = re.sub(r"^alfred[\s,]*", "", text, flags=re.IGNORECASE).strip()

        url = YouTubeSkill._find_youtube_url(text)
        if url:
            return url

        # Strip common verbs to keep only the search terms.
        text = re.sub(
            r"^(play|riproduci|cerca|metti su|mostra|apri|avvia|guarda|vedi|vedere|search|find|trova|ricerca|cercare)\b",
            "",
            text,
            flags=re.IGNORECASE,
        ).strip()
        text = re.sub(r"\bon\s+youtube\b", "", text, flags=re.IGNORECASE).strip()
        text = re.sub(r"\bon\s+yt\b", "", text, flags=re.IGNORECASE).strip()
        text = re.sub(r"^(youtube|yt)\b", "", text, flags=re.IGNORECASE).strip()
        text = re.sub(r"\bvideo\b", "", text, flags=re.IGNORECASE).strip()

        if not text:
            return None

        return text

    @staticmethod
    def _find_youtube_url(text: str) -> Optional[str]:
        match = re.search(r"https?://(?:www\.)?(?:youtube\.com/watch\?v=[A-Za-z0-9_-]+|youtu\.be/[A-Za-z0-9_-]+)(?:[&?][^\s]*)?", text)
        if match:
            return match.group(0)
        return None

    def _fetch_video_info(self, query: str) -> Optional[Dict[str, Any]]:
        search_input = query
        if not search_input.startswith("http"):
            search_input = f"ytsearch1:{query}"

        opts = {
            "format": "best[ext=mp4]/best",
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "nocheckcertificate": True,
            "noplaylist": True,
            "extract_flat": False,
        }

        with YoutubeDL(opts) as ydl:
            info = ydl.extract_info(search_input, download=False)

        if not info:
            return None

        if isinstance(info, dict) and info.get("entries"):
            entries = info.get("entries")
            if entries:
                info = entries[0]
            else:
                return None

        return info

    @staticmethod
    def _make_embed_url(video_id: Optional[str]) -> Optional[str]:
        if not video_id:
            return None
        return f"https://www.youtube.com/embed/{quote(video_id)}?autoplay=1"
