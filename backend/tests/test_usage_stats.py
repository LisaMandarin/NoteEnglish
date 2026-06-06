import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from app.services import supabase


class FixedDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        value = cls(2026, 6, 7, 2, 30, tzinfo=timezone.utc)
        return value if tz is None else value.astimezone(tz)


class UsageStatsTests(unittest.TestCase):
    def test_last_12_hours_are_continuous_utc_buckets(self):
        rows = [
            {"created_at": "2026-06-06T14:59:00Z", "total_tokens": 100},
            {"created_at": "2026-06-06T15:10:00Z", "total_tokens": 5},
            {"created_at": "2026-06-07T02:01:00Z", "total_tokens": 7},
            {"created_at": "2026-06-07T10:15:00+08:00", "total_tokens": 11},
        ]

        with (
            patch.object(supabase, "datetime", FixedDateTime),
            patch.object(supabase, "_request_json", return_value=rows),
        ):
            result = supabase.get_usage_stats("user-1")

        recent = result["last_12_hours"]
        self.assertEqual(len(recent["hourly"]), 12)
        self.assertEqual(recent["hourly"][0]["timestamp"], "2026-06-06T15:00:00Z")
        self.assertEqual(recent["hourly"][-1]["timestamp"], "2026-06-07T02:00:00Z")
        self.assertEqual(recent["hourly"][0]["tokens"], 5)
        self.assertEqual(recent["hourly"][-1]["tokens"], 18)
        self.assertEqual(recent["total"], 23)


if __name__ == "__main__":
    unittest.main()
