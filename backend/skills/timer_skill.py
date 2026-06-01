import re
from typing import Any, Dict, List
from .base_skill import BaseSkill


class TimerSkill(BaseSkill):

    @property
    def name(self) -> str:
        return "timer"

    @property
    def triggers(self) -> List[str]:
        return ["timer", "alarm", "countdown", "remind me",
                "sveglia", "conto alla rovescia", "ricordami"]

    def handle(self, command: str, lang: str = "en") -> Dict[str, Any]:
        cmd = command.lower()
        it = lang == "it"

        if any(w in cmd for w in ("stop", "cancel", "clear", "annulla", "ferma", "cancella")):
            return {"action": "timer_cancel",
                    "message": "Timer annullato, signore." if it else "Timer cancelled, sir."}

        total_seconds = 0
        h = re.search(r"(\d+)\s*hour", cmd) or re.search(r"(\d+)\s*or[ae]\b", cmd)
        m = re.search(r"(\d+)\s*min", cmd)
        s = re.search(r"(\d+)\s*sec", cmd)

        if h:
            total_seconds += int(h.group(1)) * 3600
        if m:
            total_seconds += int(m.group(1)) * 60
        if s:
            total_seconds += int(s.group(1))

        if total_seconds > 0:
            label = self._format(total_seconds, lang)
            return {
                "action": "timer_start",
                "message": f"Timer impostato per {label}, signore." if it else f"Timer set for {label}, sir.",
                "data": {"seconds": total_seconds, "label": label},
            }

        return {
            "action": "error",
            "message": (
                "Non ho capito la durata, signore. "
                "Dica ad esempio 'imposta un timer per 5 minuti'."
                if it else
                "I didn't catch the duration, sir. "
                "Please say something like 'set a timer for 5 minutes'."
            ),
        }

    @staticmethod
    def _format(total: int, lang: str = "en") -> str:
        parts = []
        remaining = total
        it = lang == "it"
        if remaining >= 3600:
            h = remaining // 3600
            remaining %= 3600
            parts.append(f"{h} ora{'e' if h > 1 else ''}" if it else f"{h} hour{'s' if h > 1 else ''}")
        if remaining >= 60:
            m = remaining // 60
            remaining %= 60
            parts.append(f"{m} minut{'i' if m > 1 else 'o'}" if it else f"{m} minute{'s' if m > 1 else ''}")
        if remaining > 0:
            parts.append(f"{remaining} second{'i' if remaining > 1 else 'o'}" if it else f"{remaining} second{'s' if remaining > 1 else ''}")
        sep = " e " if it else " and "
        return sep.join(parts)
