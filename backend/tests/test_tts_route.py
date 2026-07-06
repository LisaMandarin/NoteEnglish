import asyncio
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from pydantic import ValidationError

from app.routes import tts as tts_route
from app.models.tts import TtsRequest
from app.services import tts as tts_service

USER = {"id": "user-1"}


class FakeCommunicate:
    """Stands in for edge_tts.Communicate without hitting the network."""

    calls = 0

    def __init__(self, text, voice):
        FakeCommunicate.calls += 1

    async def stream(self):
        yield {"type": "audio", "data": b"fake-mp3-bytes"}
        yield {"type": "WordBoundary", "data": b"ignored"}


class TtsRouteTests(unittest.TestCase):
    def _call(self, text="Hello world."):
        return asyncio.run(tts_route.tts(TtsRequest(text=text), user=USER))

    def test_returns_mp3_response(self):
        with patch.object(tts_route, "synthesize_speech", AsyncMock(return_value=b"mp3")):
            res = self._call()

        self.assertEqual(res.media_type, "audio/mpeg")
        self.assertEqual(res.body, b"mp3")

    def test_blank_text_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            self._call(text="   ")
        self.assertEqual(ctx.exception.status_code, 400)

    def test_over_length_text_rejected_by_model(self):
        with self.assertRaises(ValidationError):
            TtsRequest(text="a" * 1201)

    def test_synthesis_failure_maps_to_502(self):
        with patch.object(tts_route, "synthesize_speech", AsyncMock(side_effect=RuntimeError)):
            with self.assertRaises(HTTPException) as ctx:
                self._call()
        self.assertEqual(ctx.exception.status_code, 502)


class TtsCacheTests(unittest.TestCase):
    def setUp(self):
        tts_service.AUDIO_CACHE.clear()
        FakeCommunicate.calls = 0

    def test_second_call_hits_cache(self):
        with patch.object(tts_service.edge_tts, "Communicate", FakeCommunicate):
            first = asyncio.run(tts_service.synthesize_speech("Hello."))
            second = asyncio.run(tts_service.synthesize_speech("Hello."))

        self.assertEqual(first, b"fake-mp3-bytes")
        self.assertEqual(second, b"fake-mp3-bytes")
        self.assertEqual(FakeCommunicate.calls, 1)

    def test_cache_evicts_oldest_beyond_cap(self):
        with patch.object(tts_service, "_MAX_ENTRIES", 2), patch.object(
            tts_service.edge_tts, "Communicate", FakeCommunicate
        ):
            asyncio.run(tts_service.synthesize_speech("one"))
            asyncio.run(tts_service.synthesize_speech("two"))
            asyncio.run(tts_service.synthesize_speech("three"))

        self.assertEqual(len(tts_service.AUDIO_CACHE), 2)
        self.assertNotIn(
            f"{tts_service.settings.tts_voice}|one", tts_service.AUDIO_CACHE
        )
