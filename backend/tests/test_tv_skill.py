import datetime as dt
import threading
import unittest
from unittest.mock import patch

from skills.tv_skill import EPG_REFRESH_INTERVAL, TVSkill


class TVSkillTests(unittest.TestCase):
    def test_refreshes_epg_after_refresh_interval_only_once(self) -> None:
        skill = TVSkill.__new__(TVSkill)
        skill._epg_refresh_lock = threading.Lock()
        skill._epg_last_attempt = (
            dt.datetime.now(dt.timezone.utc) - EPG_REFRESH_INTERVAL - dt.timedelta(seconds=1)
        )

        with patch.object(skill, "_load_epg") as load_epg:
            skill._refresh_epg_if_stale()
            skill._refresh_epg_if_stale()

        load_epg.assert_called_once_with()

    def test_turning_tv_off_does_not_trigger_epg_refresh(self) -> None:
        skill = TVSkill.__new__(TVSkill)

        with patch.object(skill, "_refresh_epg_if_stale") as refresh_epg:
            result = skill.handle("turn tv off")

        self.assertEqual(result["action"], "tv_off")
        refresh_epg.assert_not_called()

    def test_preserves_existing_epg_when_refresh_has_no_programmes(self) -> None:
        skill = TVSkill.__new__(TVSkill)
        skill._epg_urls_env = "https://example.test/guide.xml"
        skill._epg_by_channel_id = {"old-channel": []}
        skill._epg_name_to_id = {"old channel": "old-channel"}

        with patch(
            "skills.tv_skill._fetch_text",
            return_value=(
                "<tv><channel id='new-channel'>"
                "<display-name>New Channel</display-name></channel></tv>"
            ),
        ):
            skill._load_epg()

        self.assertEqual(skill._epg_by_channel_id, {"old-channel": []})
        self.assertEqual(skill._epg_name_to_id, {"old channel": "old-channel"})

    def test_binds_names_that_only_differ_by_spacing(self) -> None:
        skill = TVSkill.__new__(TVSkill)
        skill._channels = {"rai scuola": {"name": "Rai Scuola HD"}}
        skill._epg_by_channel_id = {"RaiScuola.it": []}
        skill._epg_name_to_id = {"raiscuola": "RaiScuola.it"}

        skill._bind_epg_to_channels()

        self.assertEqual(skill._channels["rai scuola"]["epg_id"], "RaiScuola.it")

    def test_does_not_bind_ambiguous_compact_channel_names(self) -> None:
        skill = TVSkill.__new__(TVSkill)
        skill._channels = {"raiscuola": {"name": "RaiScuola"}}
        skill._epg_by_channel_id = {"first": [], "second": []}
        skill._epg_name_to_id = {
            "rai scuola": "first",
            "rai.scuola": "second",
        }

        skill._bind_epg_to_channels()

        self.assertNotIn("epg_id", skill._channels["raiscuola"])


if __name__ == "__main__":
    unittest.main()
