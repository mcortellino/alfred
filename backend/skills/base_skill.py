"""Abstract base class for all Alfred skills."""
import re
from abc import ABC, abstractmethod
from typing import Any, Dict, List


class BaseSkill(ABC):

    @property
    @abstractmethod
    def name(self) -> str:
        """Unique skill identifier."""

    @property
    @abstractmethod
    def triggers(self) -> List[str]:
        """Keywords / phrases that route a command to this skill."""

    @abstractmethod
    def handle(self, command: str, lang: str = "en") -> Dict[str, Any]:
        """Process a command and return a response dict with at least 'action' and 'message'."""

    def matches(self, command: str) -> bool:
        """Return True if this skill should handle the given command."""
        command_lower = command.lower()
        for trigger in self.triggers:
            if " " in trigger:
                # Multi-word phrase: simple substring match
                if trigger in command_lower:
                    return True
            else:
                # Single word: respect word boundaries
                if re.search(r"\b" + re.escape(trigger) + r"\b", command_lower):
                    return True
        return False
