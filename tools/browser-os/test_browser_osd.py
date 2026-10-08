import importlib.machinery
import importlib.util
import pathlib
import struct
import unittest


BROKER_PATH = pathlib.Path(__file__).parent / "guest" / "browser-osd"
LOADER = importlib.machinery.SourceFileLoader("browser_osd", str(BROKER_PATH))
SPEC = importlib.util.spec_from_loader(LOADER.name, LOADER)
BROKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BROKER)


class FrameParserTests(unittest.TestCase):
    def test_fragmented_and_coalesced_frames_are_decoded_in_order(self):
        first = {"v": 1, "seq": 1, "op": "hello"}
        second = {"v": 1, "seq": 2, "op": "resize", "cols": 100, "rows": 40}
        wire = BROKER.encode_frame(first) + BROKER.encode_frame(second)
        parser = BROKER.FrameParser()
        decoded = []
        for offset in range(0, len(wire), 3):
            decoded.extend(parser.feed(wire[offset:offset + 3]))
        self.assertEqual(decoded, [first, second])
        self.assertEqual(parser.buffer, bytearray())

    def test_maximum_length_frame_does_not_exceed_parser_buffer_bound(self):
        payload = b'{"op":"hello"}'
        payload += b" " * (BROKER.FRAME_LIMIT - len(payload))
        wire = b"BOS1" + struct.pack(">H", len(payload)) + payload
        parser = BROKER.FrameParser()
        decoded = []
        for offset in range(0, len(wire), 257):
            decoded.extend(parser.feed(wire[offset:offset + 257]))
        self.assertEqual(decoded, [{"op": "hello"}])
        self.assertLessEqual(len(parser.buffer), BROKER.FRAME_LIMIT + 6)

    def test_invalid_magic_length_utf8_duplicates_and_nested_values_fail_closed(self):
        invalid_frames = [
            b"NOPE\x00\x01x",
            b"BOS1\x00\x00",
            b"BOS1\x10\x01",
            b"BOS1\x00\x02\xff\xff",
            BROKER.encode_frame({"ok": {"nested": True}}),
        ]
        duplicate_payload = b'{"seq":1,"seq":2}'
        invalid_frames.append(b"BOS1" + struct.pack(">H", len(duplicate_payload)) + duplicate_payload)
        for wire in invalid_frames:
            with self.subTest(wire=wire[:12]):
                with self.assertRaises((ValueError, UnicodeError)):
                    BROKER.FrameParser().feed(wire)

    def test_parser_does_not_resynchronize_after_bad_magic(self):
        valid = BROKER.encode_frame({"op": "hello"})
        with self.assertRaises(ValueError):
            BROKER.FrameParser().feed(b"x" + valid)



class FenceOrderingTests(unittest.TestCase):
    def broker_with_fence(self, target):
        broker = BROKER.Broker.__new__(BROKER.Broker)
        broker.com1_input = 0
        broker.com1_forwarded = 0
        broker.input_queue = bytearray()
        broker.gated_input = bytearray()
        broker.fence = {"id": 7, "target": target, "deadline": 10**9}
        broker.frames = []
        broker.errors = []
        broker.frame = lambda operation, **fields: broker.frames.append((operation, fields))
        broker.error = broker.errors.append
        return broker

    def test_fence_waits_for_prefix_forwarding_then_releases_suffix_in_order(self):
        broker = self.broker_with_fence(3)
        broker.input_bytes(b"ab")
        broker.input_bytes(b"cd")

        self.assertEqual(broker.input_queue, b"abc")
        self.assertEqual(broker.gated_input, b"d")
        self.assertEqual(broker.frames, [])

        broker.com1_forwarded = 3
        broker.try_fence()

        self.assertEqual(broker.frames, [("inputFenceAck", {
            "fenceId": 7,
            "inputBytes": 3,
            "state": "unknown",
        })])
        self.assertEqual(broker.input_queue, b"abcd")
        self.assertEqual(broker.gated_input, b"")
        self.assertIsNone(broker.fence)
        self.assertEqual(broker.errors, [])

    def test_ctrl_c_cancels_an_active_fence_and_releases_every_byte_in_order(self):
        broker = self.broker_with_fence(3)
        broker.input_bytes(b"ab")
        broker.input_bytes(b"cxy")
        self.assertEqual(broker.input_queue, b"abc")
        self.assertEqual(broker.gated_input, b"xy")

        broker.input_bytes(b"\x03")

        self.assertEqual(broker.input_queue, b"abcxy\x03")
        self.assertEqual(broker.gated_input, b"")
        self.assertIsNone(broker.fence)
        self.assertEqual(broker.frames, [])
        self.assertEqual(broker.errors, [])


class SequenceBoundaryTests(unittest.TestCase):
    def test_guest_emits_maximum_sequence_then_revokes_without_overflow_frame(self):
        broker = BROKER.Broker.__new__(BROKER.Broker)
        broker.session = "a" * 32
        broker.com2 = object()
        broker.guest_seq = BROKER.MAX_INT
        broker.com2_output = bytearray()
        revoked = []
        broker.revoke = lambda: revoked.append(True)

        self.assertEqual(broker.frame("shellState", state="unknown"), BROKER.MAX_INT)
        emitted = BROKER.FrameParser().feed(broker.com2_output)
        self.assertEqual([frame["seq"] for frame in emitted], [BROKER.MAX_INT])
        self.assertIsNone(broker.frame("shellState", state="unknown"))
        self.assertEqual(len(emitted), 1)
        self.assertEqual(revoked, [True])

    def test_host_sequence_regression_and_exhaustion_are_rejected(self):
        broker = BROKER.Broker.__new__(BROKER.Broker)
        broker.session = "a" * 32
        broker.host_seq = 2
        base = {"v": 1, "sessionId": broker.session, "op": "resize", "cols": 80, "rows": 24}

        with self.assertRaisesRegex(ValueError, "bad sequence"):
            broker.validate_envelope({**base, "seq": 3})

        broker.host_seq = BROKER.MAX_INT + 1
        with self.assertRaisesRegex(ValueError, "bad sequence"):
            broker.validate_envelope({**base, "seq": BROKER.MAX_INT})
        broker.session = "a" * 32
        with self.assertRaisesRegex(ValueError, "bad session"):
            broker.validate_envelope({
                "v": 1, "sessionId": "b" * 32, "seq": 2,
                "op": "resize", "cols": 80, "rows": 24,
            })


class BootHandshakeTests(unittest.TestCase):
    def make_broker(self):
        broker = BROKER.Broker.__new__(BROKER.Broker)
        broker.build_id = "a" * 64
        broker.session = None
        broker.bootstrapped = False
        broker.revoked = False
        broker.host_seq = 1
        broker.guest_seq = 1
        broker.ready = False
        broker.initial_locale_acknowledged = False
        broker.shell_ready = True
        broker.shell_ready_sent = False
        broker.pending_shell_state = "busy"
        broker.shell_state = "busy"
        broker.frames = []

        def record_frame(operation, **fields):
            sequence = broker.guest_seq
            broker.frames.append({
                "v": 1, "sessionId": broker.session, "seq": sequence,
                "op": operation, **fields,
            })
            broker.guest_seq += 1
            return sequence
        broker.frame = record_frame
        broker.resize = lambda cols, rows: setattr(broker, "dimensions", (cols, rows))
        broker.set_locale = lambda locale: setattr(broker, "locale", locale)
        return broker

    def test_bootstrap_then_host_session_and_locale_ack_gate_startup_frames(self):
        broker = self.make_broker()
        bootstrap = {
            "v": 1, "op": "bootstrap", "guestBuildId": broker.build_id,
            "cols": 80, "rows": 24,
        }
        broker.handle_frame(bootstrap)
        self.assertTrue(broker.bootstrapped)
        self.assertEqual(broker.frames, [])

        broker.handle_frame({
            "v": 1, "sessionId": "b" * 32, "seq": 1, "op": "hello",
            "cols": 100, "rows": 40,
        })
        self.assertEqual(broker.frames, [{
            "v": 1, "sessionId": "b" * 32, "seq": 1, "op": "ready",
            "guestBuildId": broker.build_id, "cols": 100, "rows": 40,
        }])
        self.assertEqual(broker.dimensions, (100, 40))
        self.assertFalse(broker.initial_locale_acknowledged)

        broker.handle_frame({
            "v": 1, "sessionId": "b" * 32, "seq": 2, "op": "setLocale",
            "locale": "ru",
        })
        self.assertEqual([frame["op"] for frame in broker.frames], [
            "ready", "localeAck", "shellReady", "shellState",
        ])
        self.assertEqual([frame["seq"] for frame in broker.frames], [1, 2, 3, 4])
        self.assertEqual(broker.frames[1]["locale"], "ru")
        self.assertEqual(broker.frames[2]["guestBuildId"], broker.build_id)
        self.assertEqual(broker.frames[3]["state"], "busy")
        self.assertTrue(broker.initial_locale_acknowledged)

        broker.handle_frame({
            "v": 1, "sessionId": "b" * 32, "seq": 3, "op": "setLocale",
            "locale": "en",
        })
        self.assertEqual(sum(frame["op"] == "shellReady" for frame in broker.frames), 1)
        self.assertEqual(
            (broker.frames[-1]["op"], broker.frames[-1]["locale"], broker.frames[-1]["seq"]),
            ("localeAck", "en", 5),
        )

    def test_malformed_bootstrap_and_pre_bootstrap_hello_are_rejected(self):
        for first in (
            {"v": 1, "op": "hello", "sessionId": "b" * 32, "seq": 1, "cols": 80, "rows": 24},
            {"v": 1, "op": "bootstrap", "guestBuildId": "c" * 64, "cols": 80, "rows": 24},
            {"v": 1, "op": "bootstrap", "guestBuildId": "a" * 64, "cols": True, "rows": 24},
            {"v": 1, "op": "bootstrap", "guestBuildId": "a" * 64, "cols": 80, "rows": 24, "extra": 1},
        ):
            broker = self.make_broker()
            with self.subTest(first=first), self.assertRaises(ValueError):
                broker.handle_frame(first)

    def test_resize_is_rejected_before_initial_locale_ack(self):
        broker = self.make_broker()
        broker.handle_frame({
            "v": 1, "op": "bootstrap", "guestBuildId": broker.build_id,
            "cols": 80, "rows": 24,
        })
        broker.handle_frame({
            "v": 1, "sessionId": "b" * 32, "seq": 1, "op": "hello",
            "cols": 80, "rows": 24,
        })
        with self.assertRaisesRegex(ValueError, "initial locale acknowledgement required"):
            broker.handle_frame({
                "v": 1, "sessionId": "b" * 32, "seq": 2, "op": "resize",
                "cols": 100, "rows": 40,
            })

class PortfolioActionTests(unittest.TestCase):
    def test_portfolio_actions_use_monotonic_request_ids_and_typed_ack(self):
        broker = BROKER.Broker.__new__(BROKER.Broker)
        broker.revoked = False
        broker.bootstrapped = True
        broker.session = "a" * 32
        broker.com2 = object()
        broker.guest_seq = 1
        broker.com2_output = bytearray()
        broker.ready = True
        broker.initial_locale_acknowledged = True
        broker.host_seq = 2
        broker.pending_cli = None
        broker.last_portfolio_request_id = 0
        broker.link_ids = {"quick-cv"}
        replies = []
        broker.reply = lambda client, text: replies.append((client, text))
        client = object()

        broker.handle_cli(client, b"open quick-cv")
        first = BROKER.FrameParser().feed(broker.com2_output)[0]
        self.assertEqual((first["op"], first["requestId"], first["action"], first["linkId"]), (
            "portfolioAction", 1, "open", "quick-cv"
        ))
        self.assertEqual(set(first), {"v", "sessionId", "seq", "op", "requestId", "action", "linkId"})

        broker.host_seq = 2
        broker.handle_frame({
            "v": 1, "sessionId": broker.session, "seq": 2, "op": "ack",
            "ackSeq": first["seq"], "status": "queued",
        })
        self.assertEqual(replies, [(client, "queued")])
        self.assertIsNone(broker.pending_cli)
        broker.handle_cli(client, b"open quick-cv")
        requests = BROKER.FrameParser().feed(broker.com2_output)
        self.assertEqual([frame["requestId"] for frame in requests], [1, 2])
        self.assertEqual(BROKER.ERRORS, {
            "badFrame", "badSession", "badSequence", "badOperation", "badValue", "internal",
        })

    def test_exhausted_portfolio_request_id_fails_closed(self):
        broker = BROKER.Broker.__new__(BROKER.Broker)
        broker.ready = True
        broker.pending_cli = None
        broker.last_portfolio_request_id = BROKER.MAX_INT
        broker.link_ids = {"quick-cv"}
        replies = []
        errors = []
        broker.reply = lambda client, text: replies.append((client, text))
        broker.error = errors.append
        client = object()

        broker.handle_cli(client, b"open quick-cv")

        self.assertEqual(replies, [(client, "error control-unavailable")])
        self.assertEqual(errors, ["badValue"])
if __name__ == "__main__":
    unittest.main()
