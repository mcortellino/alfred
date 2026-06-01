from typing import Any, Dict, List, Optional
from skills.base_skill import BaseSkill
from skills.calendar_skill import CalendarSkill
from skills.radio_skill import RadioSkill
from skills.tv_skill import TVSkill
from skills.shopping_skill import ShoppingSkill
from skills.timer_skill import TimerSkill


class SkillManager:
    """Pluggable skill registry and command dispatcher."""

    def __init__(self):
        self._skills: List[BaseSkill] = []
        self._register_defaults()

    def _register_defaults(self):
        self.register(CalendarSkill())
        self.register(RadioSkill())
        self.register(TVSkill())
        self.register(ShoppingSkill())
        self.register(TimerSkill())

    def register(self, skill: BaseSkill):
        """Register a new skill at runtime."""
        self._skills.append(skill)

    def get_skill(self, name: str) -> Optional[BaseSkill]:
        for skill in self._skills:
            if skill.name == name:
                return skill
        return None

    def handle(self, command: str, lang: str = "en") -> Dict[str, Any]:
        """Dispatch a command to the best-matching skill."""
        it = lang == "it"
        cmd = (command or "").lower().strip()

        # Global emergency stop command (including common STT typo "sop").
        if self._is_stop_command(cmd):
            return {
                "action": "assistant_stop",
                "message": "Mi fermo subito, signore." if it else "Stopping immediately, sir.",
            }

        for skill in self._skills:
            if skill.matches(cmd):
                try:
                    return skill.handle(cmd, lang)
                except Exception as exc:
                    return {
                        "action": "error",
                        "message": (
                            f"Ho riscontrato un problema, signore: {exc}"
                            if it else
                            f"I encountered a difficulty, sir: {exc}"
                        ),
                    }

        return {
            "action": "unknown",
            "message": (
                "Mi dispiace, non ho capito, signore. "
                "Posso aiutarla con radio, televisione, lista della spesa e timer."
                if it else
                "I'm afraid I don't understand, sir. "
                "I can assist with radio, television, shopping list and timers."
            ),
        }

    @staticmethod
    def _is_stop_command(cmd: str) -> bool:
        stripped = cmd
        if stripped.startswith("alfred"):
            stripped = stripped[len("alfred"):].strip(" ,")

        stop_terms = {
            "stop", "sop", "halt", "cancel", "basta", "ferma", "annulla", "stoppa",
        }
        if stripped in stop_terms:
            return True

        return any(f" {w} " in f" {stripped} " for w in stop_terms)

    def get_all_skills(self) -> List[Dict[str, Any]]:
        return [{"name": s.name, "triggers": s.triggers} for s in self._skills]
