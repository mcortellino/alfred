import json
import re
from datetime import datetime, date
from pathlib import Path
from typing import Any, Dict, List, Optional
from .base_skill import BaseSkill

_DATA_FILE = Path(__file__).parent.parent / "data" / "calendar_events.json"


class CalendarSkill(BaseSkill):

    def __init__(self):
        _DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not _DATA_FILE.exists():
            _DATA_FILE.write_text(json.dumps({"events": []}, indent=2))

    @property
    def name(self) -> str:
        return "calendar"

    @property
    def triggers(self) -> List[str]:
        return [
            # English
            "calendar", "agenda", "event", "appointment", "schedule", "reminder", "eventi",
            # Italian
            "calendario", "agenda", "appuntamento", "evento", "programma", "promemoria",
        ]

    def handle(self, command: str, lang: str = "en") -> Dict[str, Any]:
        cmd = (command or "").lower().strip()
        it = lang == "it"
        events = self._load()
        view = self._select_view(cmd)

        if self._is_remove_command(cmd):
            title = self._extract_event_title(cmd)
            if title:
                removed = [e for e in events if title not in e["title"].lower()]
                if len(removed) < len(events):
                    self._save(removed)
                    return {
                        "action": "calendar_open",
                        "message": (
                            f"Ho rimosso l'appuntamento '{title}' dal calendario, signore."
                            if it else
                            f"Removed '{title}' from the calendar, sir."
                        ),
                        "data": {"events": removed, "view": view},
                    }
            return {
                "action": "calendar_open",
                "message": (
                    "Non ho trovato l'appuntamento da rimuovere, signore."
                    if it else
                    "I couldn't find the event to remove, sir."
                ),
                "data": {"events": events, "view": view},
            }

        if self._is_add_command(cmd):
            event = self._parse_event(cmd)
            if event:
                events.append(event)
                events.sort(key=lambda ev: ev["datetime"])
                self._save(events)
                return {
                    "action": "calendar_open",
                    "message": (
                        f"Evento '{event['title']}' aggiunto per {event['date']} alle {event['time']}, signore."
                        if it else
                        f"Added '{event['title']}' on {event['date']} at {event['time']}, sir."
                    ),
                    "data": {"events": events, "view": view},
                }
            return {
                "action": "calendar_open",
                "message": (
                    "Dimmi il titolo e la data in formato YYYY-MM-DD, per esempio 'aggiungi evento riunione il 2026-05-30 alle 14:00'."
                    if it else
                    "Tell me the title and date in YYYY-MM-DD format, for example 'add event meeting on 2026-05-30 at 14:00'."
                ),
                "data": {"events": events, "view": view},
            }

        # Default: open calendar view
        return {
            "action": "calendar_open",
            "message": (
                "Ecco il calendario, signore."
                if it else
                "Here is your calendar, sir."
            ),
            "data": {"events": events, "view": view},
        }

    def _select_view(self, cmd: str) -> str:
        if any(w in cmd for w in ("day", "daily", "today", "oggi", "giorno")):
            return "day"
        if any(w in cmd for w in ("week", "weekly", "settimana", "questa settimana")):
            return "week"
        if any(w in cmd for w in ("month", "monthly", "mese", "mensile")):
            return "month"
        return "month"

    def _is_add_command(self, cmd: str) -> bool:
        return any(w in cmd for w in ("add", "schedule", "set", "pianifica", "aggiungi", "programma"))

    def _is_remove_command(self, cmd: str) -> bool:
        return any(w in cmd for w in ("remove", "delete", "cancel", "clear", "rimuovi", "cancella"))

    def _extract_event_title(self, cmd: str) -> Optional[str]:
        match = re.search(r"(?:remove|delete|cancel|clear|rimuovi|cancella)\s+(?:event\s+|appointment\s+|appuntamento\s+|evento\s+)?(.+)$", cmd)
        if not match:
            return None
        return match.group(1).strip().strip(" .,")

    def _parse_event(self, cmd: str) -> Optional[Dict[str, str]]:
        now = date.today()
        default_date = now.isoformat()
        default_time = "09:00"

        patterns = [
            r"(?:add|schedule|set|pianifica|aggiungi|programma)\s+(?:event\s+|appointment\s+|appuntamento\s+|evento\s+)?(.+?)\s+(?:on|for|per|il)\s+(\d{4}-\d{2}-\d{2})(?:\s+(?:at|alle)\s+(\d{1,2}:\d{2}))?",
            r"(?:add|schedule|set|pianifica|aggiungi|programma)\s+(?:event\s+|appointment\s+|appuntamento\s+|evento\s+)?(.+?)\s+(?:at|alle)\s+(\d{1,2}:\d{2})\s+(?:on|for|per|il)\s+(\d{4}-\d{2}-\d{2})",
        ]

        for pattern in patterns:
            match = re.search(pattern, cmd)
            if match:
                title = match.group(1).strip().strip(" .,")
                if len(match.groups()) == 3 and match.group(3):
                    date_value = match.group(2)
                    time_value = match.group(3)
                elif len(match.groups()) >= 2:
                    date_value = match.group(2)
                    time_value = match.group(3) or default_time
                else:
                    continue
                if self._is_valid_date(date_value) and self._is_valid_time(time_value):
                    title = re.sub(r"\s+(?:to|in|on|for|per|al|alla|il|lo|la)$", "", title).strip()
                    if title:
                        dt = f"{date_value}T{time_value}:00"
                        return {"id": f"evt-{int(datetime.utcnow().timestamp() * 1000)}", "title": title.title(), "date": date_value, "time": time_value, "datetime": dt}
        return None

    def _is_valid_date(self, value: str) -> bool:
        try:
            date.fromisoformat(value)
            return True
        except ValueError:
            return False

    def _is_valid_time(self, value: str) -> bool:
        try:
            datetime.strptime(value, "%H:%M")
            return True
        except ValueError:
            return False

    def _load(self) -> List[Dict[str, str]]:
        payload = json.loads(_DATA_FILE.read_text())
        events = payload.get("events", [])
        return sorted(events, key=lambda ev: ev.get("datetime", ""))

    def _save(self, events: List[Dict[str, str]]):
        _DATA_FILE.write_text(json.dumps({"events": events}, indent=2))
