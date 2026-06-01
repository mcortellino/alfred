import json
from pathlib import Path
from typing import Any, Dict, List
from .base_skill import BaseSkill

_DATA_FILE = Path(__file__).parent.parent / "data" / "shopping_list.json"


class ShoppingSkill(BaseSkill):

    def __init__(self):
        _DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        if not _DATA_FILE.exists():
            _DATA_FILE.write_text(json.dumps({"items": []}, indent=2))

    @property
    def name(self) -> str:
        return "shopping"

    @property
    def triggers(self) -> List[str]:
        return [
            # English
            "shopping", "grocery", "groceries",
            "to the list", "to my list", "from the list", "from my list", "shopping list",
            # Italian
            "spesa", "lista della spesa",
            "alla lista", "dalla lista", "alla mia lista", "dalla mia lista",
            "aggiungi", "rimuovi", "togli", "elimina",
        ]

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------

    def get_list(self) -> Dict[str, Any]:
        return {"items": self._load()}

    # ------------------------------------------------------------------
    # Skill interface
    # ------------------------------------------------------------------

    def handle(self, command: str, lang: str = "en") -> Dict[str, Any]:
        cmd = command.lower()
        it = lang == "it"
        items = self._load()

        # --- Add ---
        for verb in ("add", "aggiungi"):
            if verb in cmd:
                after = cmd.split(verb, 1)[1]
                for filler in (
                    "to the shopping list", "to my shopping list",
                    "to the list", "to my list", "to shopping",
                    "alla lista della spesa", "alla mia lista della spesa",
                    "alla lista", "alla mia lista",
                ):
                    after = after.replace(filler, "")
                item = after.strip().strip(",").title()
                if item:
                    items.append(item)
                    self._save(items)
                    return {
                        "action": "shopping_updated",
                        "message": f"Aggiunto '{item}' alla lista, signore." if it else f"Added '{item}' to your list, sir.",
                        "data": items,
                    }

        # --- Remove ---
        for verb in ("remove", "delete", "cross off", "rimuovi", "elimina", "togli"):
            if verb in cmd:
                after = cmd.split(verb, 1)[1]
                for filler in (
                    "from the shopping list", "from my shopping list",
                    "from the list", "from my list",
                    "dalla lista della spesa", "dalla lista", "dalla mia lista",
                ):
                    after = after.replace(filler, "")
                target = after.strip().title()
                original_len = len(items)
                items = [i for i in items if target.lower() not in i.lower()]
                if len(items) < original_len:
                    self._save(items)
                    return {
                        "action": "shopping_updated",
                        "message": f"Rimosso '{target}' dalla lista, signore." if it else f"Removed '{target}' from your list, sir.",
                        "data": items,
                    }
                return {
                    "action": "not_found",
                    "message": f"Non ho trovato '{target}' nella lista, signore." if it else f"I couldn't find '{target}' on the list, sir.",
                    "data": items,
                }

        # --- Clear ---
        if any(w in cmd for w in ("clear", "empty", "wipe", "svuota", "cancella tutto", "azzera")):
            self._save([])
            return {
                "action": "shopping_updated",
                "message": "Lista della spesa svuotata, signore." if it else "Shopping list cleared, sir.",
                "data": [],
            }

        # --- Show (default) ---
        if not items:
            return {
                "action": "shopping_list",
                "message": "La sua lista della spesa \u00e8 vuota, signore." if it else "Your shopping list is empty, sir.",
                "data": [],
            }
        n = len(items)
        return {
            "action": "shopping_list",
            "message": f"Ha {n} element{'i' if n > 1 else 'o'} nella lista, signore." if it else f"You have {n} item(s) on your list, sir.",
            "data": items,
        }

        # --- Add ---
        if "add" in cmd:
            after = cmd.split("add", 1)[1]
            for filler in ("to the shopping list", "to my shopping list",
                           "to the list", "to my list", "to shopping"):
                after = after.replace(filler, "")
            item = after.strip().strip(",").title()
            if item:
                items.append(item)
                self._save(items)
                return {
                    "action": "shopping_updated",
                    "message": f"Added '{item}' to your list, sir.",
                    "data": items,
                }

        # --- Remove ---
        for verb in ("remove", "delete", "cross off"):
            if verb in cmd:
                after = cmd.split(verb, 1)[1]
                for filler in ("from the shopping list", "from my shopping list",
                               "from the list", "from my list"):
                    after = after.replace(filler, "")
                target = after.strip().title()
                original_len = len(items)
                items = [i for i in items if target.lower() not in i.lower()]
                if len(items) < original_len:
                    self._save(items)
                    return {
                        "action": "shopping_updated",
                        "message": f"Removed '{target}' from your list, sir.",
                        "data": items,
                    }
                return {
                    "action": "not_found",
                    "message": f"I couldn't find '{target}' on the list, sir.",
                    "data": items,
                }

        # --- Clear ---
        if "clear" in cmd or "empty" in cmd or "wipe" in cmd:
            self._save([])
            return {
                "action": "shopping_updated",
                "message": "Shopping list cleared, sir.",
                "data": [],
            }

        # --- Show (default) ---
        if not items:
            return {
                "action": "shopping_list",
                "message": "Your shopping list is empty, sir.",
                "data": [],
            }
        return {
            "action": "shopping_list",
            "message": f"You have {len(items)} item(s) on your list, sir.",
            "data": items,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _load(self) -> List[str]:
        return json.loads(_DATA_FILE.read_text())["items"]

    def _save(self, items: List[str]):
        _DATA_FILE.write_text(json.dumps({"items": items}, indent=2))
