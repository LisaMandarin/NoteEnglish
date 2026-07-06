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

    def test_handles_supabase_trimmed_fractional_seconds(self):
        # Supabase drops trailing zeros, so fractional seconds can have any
        # digit count. Python 3.10's fromisoformat rejects 5-digit fractions,
        # which previously crashed the whole usage endpoint with a 500.
        rows = [
            {"created_at": "2026-06-07T02:01:47.71418+00:00", "total_tokens": 9},
        ]

        with (
            patch.object(supabase, "datetime", FixedDateTime),
            patch.object(supabase, "_request_json", return_value=rows),
        ):
            result = supabase.get_usage_stats("user-1")

        self.assertEqual(result["last_12_hours"]["total"], 9)
        self.assertEqual(result["last_12_hours"]["hourly"][-1]["tokens"], 9)


class ParseTimestampTests(unittest.TestCase):
    def test_pads_and_truncates_fractional_seconds(self):
        cases = {
            "2026-06-10T03:07:47.71418+00:00": (714180, "5-digit pads to 6"),
            "2026-06-10T03:07:47.5Z": (500000, "1-digit pads to 6"),
            "2026-06-10T03:07:47.123456789+00:00": (123456, "9-digit truncates to 6"),
            "2026-06-10T03:07:47+00:00": (0, "no fraction"),
        }
        for ts, (micro, label) in cases.items():
            with self.subTest(label):
                dt = supabase.parse_timestamp_utc(ts)
                self.assertEqual(dt.microsecond, micro)
                self.assertEqual(dt.tzinfo, timezone.utc)

    def test_naive_timestamp_is_assumed_utc(self):
        dt = supabase.parse_timestamp_utc("2026-06-10T03:07:47")
        self.assertEqual(dt.tzinfo, timezone.utc)


if __name__ == "__main__":
    unittest.main()
