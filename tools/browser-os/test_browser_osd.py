import os
import importlib.machinery
import importlib.util
import pathlib
import struct
import socket
import termios
from contextlib import ExitStack
from unittest.mock import patch
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



class BrokerConstructionIntegrationTests(unittest.TestCase):
    class ExecReached(Exception):
        pass

    def construct_parent(self):
        visitor = type("Visitor", (), {
            "pw_name": "visitor", "pw_gid": 1000, "pw_uid": 1000,
            "pw_dir": "/home/visitor",
        })()
        with patch.object(BROKER.os, "geteuid", return_value=0), \
                patch.object(BROKER, "load_guest_build_id", return_value="a" * 64), \
                patch.object(BROKER, "load_portfolio_ids", return_value=frozenset({"quick-cv"})), \
                patch.object(BROKER.pwd, "getpwnam", return_value=visitor), \
                patch.object(BROKER.os, "open", side_effect=(100, 101)), \
                patch.object(BROKER, "set_raw_115200"), \
                patch.object(BROKER.signal, "signal"), \
                patch.object(BROKER.Broker, "create_local_endpoints",
                             lambda broker: setattr(broker, "fifo_in", 102)), \
                patch.object(BROKER.Broker, "create_server", return_value=object()), \
                patch.object(BROKER.pty, "fork", return_value=(5000, 103)), \
                patch.object(BROKER.os, "set_blocking"), \
                patch.object(BROKER.Broker, "resize"):
            broker = BROKER.Broker()
        self.addCleanup(broker.zle_control_parent.close)
        return broker

    def test_parent_fork_path_keeps_parent_control_socket_and_bootstraps(self):
        broker = self.construct_parent()

        self.assertEqual(broker.shell_pid, 5000)
        self.assertIsNone(broker.zle_control_child)
        self.assertGreaterEqual(broker.zle_control_parent.fileno(), 0)
        self.assertTrue(broker.zle_control_parent.getblocking() is False)
        self.assertIsNotNone(broker.bootstrap_bytes_remaining)
        self.assertTrue(broker.com2_output.startswith(b"BOS1"))

    def test_child_fork_path_transfers_control_fd_then_execs_zsh(self):
        visitor = type("Visitor", (), {
            "pw_name": "visitor", "pw_gid": 1000, "pw_uid": 1000,
            "pw_dir": "/home/visitor",
        })()
        pairs = []
        real_socketpair = BROKER.socket.socketpair

        def record_socketpair(*args):
            pair = real_socketpair(*args)
            pairs.append(pair)
            return pair

        def stop_exec(path, argv):
            self.assertEqual((path, argv), ("/bin/zsh", ["zsh", "-l"]))
            self.assertEqual(BROKER.os.environ["ZSH_BROWSER_OS_CONTROL_FD"], "3")
            raise self.ExecReached()

        dup2 = patch.object(BROKER.os, "dup2")
        close = patch.object(BROKER.os, "close")
        execv = patch.object(BROKER.os, "execv", side_effect=stop_exec)
        with ExitStack() as stack:
            stack.enter_context(patch.object(BROKER.os, "geteuid", return_value=0))
            stack.enter_context(patch.object(BROKER, "load_guest_build_id", return_value="a" * 64))
            stack.enter_context(patch.object(BROKER, "load_portfolio_ids", return_value=frozenset({"quick-cv"})))
            stack.enter_context(patch.object(BROKER.pwd, "getpwnam", return_value=visitor))
            stack.enter_context(patch.object(BROKER.os, "open", side_effect=(100, 101)))
            stack.enter_context(patch.object(BROKER, "set_raw_115200"))
            stack.enter_context(patch.object(BROKER.signal, "signal"))
            stack.enter_context(patch.object(BROKER.socket, "socketpair", side_effect=record_socketpair))
            stack.enter_context(patch.object(
                BROKER.Broker, "create_local_endpoints",
                lambda broker: setattr(broker, "fifo_in", 102),
            ))
            stack.enter_context(patch.object(BROKER.Broker, "create_server", return_value=object()))
            stack.enter_context(patch.object(BROKER.pty, "fork", return_value=(0, 103)))
            stack.enter_context(patch.object(BROKER.os, "set_blocking"))
            stack.enter_context(patch.object(BROKER.os, "set_inheritable"))
            stack.enter_context(patch.object(BROKER.os, "closerange"))
            stack.enter_context(patch.object(BROKER.os, "initgroups"))
            stack.enter_context(patch.object(BROKER.os, "setgid"))
            stack.enter_context(patch.object(BROKER.os, "setuid"))
            stack.enter_context(patch.object(BROKER.os, "chdir"))
            dup2_mock = stack.enter_context(dup2)
            close_mock = stack.enter_context(close)
            execv_mock = stack.enter_context(execv)
            stack.enter_context(patch.dict(BROKER.os.environ, {}, clear=True))
            with self.assertRaises(self.ExecReached):
                BROKER.Broker()

        child_fd = dup2_mock.call_args.args[0]
        dup2_mock.assert_called_once_with(child_fd, 3)
        close_mock.assert_called_once_with(child_fd)
        execv_mock.assert_called_once()
        self.assertEqual(pairs[0][0].fileno(), -1)
        self.assertEqual(pairs[0][1].fileno(), -1)
        os.close(child_fd)

    def test_com2_select_loop_processes_hello_locale_and_action_ack(self):
        broker = self.construct_parent()
        com2, host = socket.socketpair()
        com1, terminal = socket.socketpair()
        pty_master, shell = socket.socketpair()
        server, server_peer = socket.socketpair()
        control, control_peer = socket.socketpair()
        self.addCleanup(control.close)
        self.addCleanup(control_peer.close)
        broker.zle_control_parent.close()
        broker.zle_control_parent = control
        control.setblocking(False)
        fifo_in, fifo_out = os.pipe()
        for resource in (com2, host, com1, terminal, pty_master, shell, server, server_peer):
            self.addCleanup(resource.close)
        self.addCleanup(os.close, fifo_in)
        self.addCleanup(os.close, fifo_out)
        host.settimeout(1)
        broker.com2 = com2.fileno()
        broker.com1 = com1.fileno()
        broker.pty_master = pty_master.fileno()
        broker.server = server.fileno()
        broker.fifo_in = fifo_in
        broker.shell_pid = 5000
        broker.resize = lambda cols, rows: setattr(broker, "dimensions", (cols, rows))
        locales = []
        broker.set_locale = locales.append

        broker.flush_fd(broker.com2, broker.com2_output)
        bootstrap = BROKER.FrameParser().feed(host.recv(4096))
        self.assertEqual([frame["op"] for frame in bootstrap], ["bootstrap"])

        session = "b" * 32
        host.sendall(
            BROKER.encode_frame({
                "v": 1, "sessionId": session, "seq": 1, "op": "hello",
                "cols": 100, "rows": 40,
            })
            + BROKER.encode_frame({
                "v": 1, "sessionId": session, "seq": 2, "op": "setLocale",
                "locale": "ru",
            })
        )
        with patch.object(BROKER.os, "waitpid", side_effect=[
            (0, 0), (0, 0), (broker.shell_pid, 0),
        ]):
            broker.run()
        startup = BROKER.FrameParser().feed(host.recv(4096))
        self.assertEqual([frame["op"] for frame in startup], ["ready", "localeAck"])
        self.assertEqual([frame["seq"] for frame in startup], [1, 2])
        self.assertEqual((broker.dimensions, locales), ((100, 40), ["ru"]))
        self.assertTrue(broker.initial_locale_acknowledged)

        replies = []
        broker.reply = lambda _client, text: replies.append(text)
        client = object()
        broker.handle_cli(client, b"open quick-cv")
        action = BROKER.FrameParser().feed(broker.com2_output)[0]
        host.sendall(BROKER.encode_frame({
            "v": 1, "sessionId": session, "seq": 3, "op": "ack",
            "ackSeq": action["seq"], "status": "queued",
        }))
        with patch.object(BROKER.os, "waitpid", side_effect=[
            (0, 0), (broker.shell_pid, 0),
        ]):
            broker.run()
        action_wire = BROKER.FrameParser().feed(host.recv(4096))
        self.assertEqual([frame["op"] for frame in action_wire], ["portfolioAction"])
        self.assertEqual((action_wire[0]["requestId"], action_wire[0]["linkId"]), (1, "quick-cv"))
        self.assertEqual(replies, ["queued"])
        self.assertIsNone(broker.pending_cli)


class FenceOrderingTests(unittest.TestCase):
    def broker_with_fence(self, target):
        broker = BROKER.Broker.__new__(BROKER.Broker)
        broker.com1_input = 0
        broker.com1_forwarded = 0
        broker.com1_editor_forwarded = 0
        broker.com1_signal_positions = []
        broker.com1_signal_compacted = 0
        broker.com1_signal_floor = 0
        broker.zle_input_ordinal = 0
        broker.zle_generation = 1
        broker.zle_state = 0
        broker.input_queue = bytearray()
        broker.gated_input = bytearray()
        broker.fence = {"id": 7, "target": target, "generation": 1, "deadline": 10**9}
        broker.frames = []
        broker.errors = []
        broker.frame = lambda operation, **fields: broker.frames.append((operation, fields))
        broker.error = broker.errors.append
        return broker

    def test_read_count_never_authorizes_clean_fence(self):
        broker = self.broker_with_fence(3)
        broker.input_bytes(b"abc")
        broker.com1_forwarded = 3
        broker.zle_input_ordinal = 3
        broker.zle_state = 1

        broker.try_fence()

        self.assertEqual(broker.frames, [("inputFenceAck", {
            "fenceId": 7,
            "inputBytes": 3,
            "state": "unknown",
        })])
        self.assertEqual(broker.input_queue, b"abc")
        self.assertEqual(broker.gated_input, b"")
        self.assertIsNone(broker.fence)
        self.assertEqual(broker.errors, [])

    def test_later_ordinary_input_cancels_fence_and_releases_bytes_in_order(self):
        broker = self.broker_with_fence(3)
        broker.input_bytes(b"abc")
        broker.com1_forwarded = 3
        broker.zle_input_ordinal = 3
        broker.zle_state = 1

        broker.input_bytes(b"d")

        self.assertEqual(broker.frames, [("inputFenceAck", {
            "fenceId": 7,
            "inputBytes": 3,
            "state": "busy",
        })])
        self.assertEqual(broker.input_queue, b"abcd")
        self.assertEqual(broker.gated_input, b"")
        self.assertIsNone(broker.fence)
        self.assertEqual(broker.errors, [])

    def test_nonclean_editor_state_rejects_and_releases_input(self):
        broker = self.broker_with_fence(3)
        broker.input_bytes(b"abc")
        broker.com1_forwarded = 3
        broker.zle_input_ordinal = 3
        broker.zle_state = 0

        broker.try_fence()

        self.assertEqual(broker.frames, [("inputFenceAck", {
            "fenceId": 7,
            "inputBytes": 3,
            "state": "busy",
        })])
        self.assertEqual(broker.input_queue, b"abc")
        self.assertEqual(broker.gated_input, b"")
        self.assertIsNone(broker.fence)


    def test_signal_byte_is_excluded_from_the_fence_watermark(self):
        broker = self.broker_with_fence(10)
        broker.com1_signal_positions = [9]
        broker.com1_input = 10
        broker.com1_forwarded = 10
        broker.com1_editor_forwarded = 9
        broker.zle_input_ordinal = 9
        broker.zle_state = 1

        broker.try_fence()

        self.assertEqual(broker.frames, [("inputFenceAck", {
            "fenceId": 7,
            "inputBytes": 10,
            "state": "unknown",
        })])
        self.assertIsNone(broker.fence)
        self.assertEqual(broker.errors, [])

    def test_editor_ordinal_still_gates_a_fence_before_the_signal(self):
        broker = self.broker_with_fence(10)
        broker.com1_signal_positions = [9]
        broker.input_bytes(b"abcdefghi")
        broker.com1_forwarded = 10
        broker.com1_editor_forwarded = 9
        broker.zle_input_ordinal = 8
        broker.zle_state = 1

        broker.try_fence()

        self.assertEqual(broker.frames, [])
        self.assertIsNotNone(broker.fence)

    def test_ctrl_c_cancels_an_active_fence_and_releases_every_byte_in_order(self):
        broker = self.broker_with_fence(3)
        broker.input_bytes(b"abc")
        broker.input_bytes(b"\x03")

        self.assertEqual(broker.input_queue, b"abc\x03")
        self.assertEqual(broker.gated_input, b"")
        self.assertIsNone(broker.fence)
        self.assertEqual(broker.frames, [])
        self.assertEqual(broker.errors, [])


class SafePointRecordTests(unittest.TestCase):
    class Channel:
        def __init__(self, *records):
            self.records = list(records)
            self.closed = False

        def recv(self, _size):
            if not self.records:
                raise __import__("BlockingIOError").BlockingIOError()
            return self.records.pop(0)

        def close(self):
            self.closed = True

    def broker(self, record):
        broker = BROKER.Broker.__new__(BROKER.Broker)
        broker.zle_control_parent = self.Channel(record)
        broker.zle_input_ordinal = 0
        broker.zle_generation = 1
        broker.zle_state = 1
        broker.com1_input = 3
        broker.com1_forwarded = 3
        broker.com1_editor_forwarded = 5
        broker.com1_signal_positions = []
        broker.com1_signal_compacted = 0
        broker.com1_signal_floor = 0
        broker.gated_input = bytearray()
        broker.fence = {"id": 7, "target": 3, "generation": 1, "deadline": 10**9}
        broker.frames = []
        broker.errors = []
        broker.frame = lambda operation, **fields: broker.frames.append((operation, fields))
        broker.error = broker.errors.append
        return broker

    def record(self, ordinal, generation, state=1, version=2):
        return b"BOSZ" + bytes((version, 1, state, 0)) + ordinal.to_bytes(8, "big") + generation.to_bytes(8, "big")

    def test_generation_crossing_cancels_a_fence_created_before_it(self):
        broker = self.broker(self.record(5, 2))

        broker.process_zle_control()

        self.assertEqual(broker.frames, [("inputFenceAck", {
            "fenceId": 7,
            "inputBytes": 3,
            "state": "unknown",
        })])
        self.assertIsNone(broker.fence)
        self.assertEqual(broker.zle_generation, 2)
        self.assertEqual(broker.errors, [])

    def test_same_generation_fence_uses_the_editor_watermark(self):
        broker = self.broker(self.record(5, 1))

        broker.process_zle_control()

        self.assertEqual(broker.frames, [("inputFenceAck", {
            "fenceId": 7,
            "inputBytes": 3,
            "state": "unknown",
        })])
        self.assertIsNone(broker.fence)

    def test_editor_ordinal_above_forwarded_editor_bytes_fails_closed(self):
        broker = self.broker(self.record(6, 1))
        channel = broker.zle_control_parent

        broker.process_zle_control()

        self.assertEqual(broker.errors, ["badValue"])
        self.assertTrue(channel.closed)
        self.assertIsNotNone(broker.fence)

    def test_version_one_record_is_rejected(self):
        broker = self.broker(self.record(5, 1, version=1)[:16])
        channel = broker.zle_control_parent

        broker.process_zle_control()

        self.assertEqual(broker.errors, ["badFrame"])
        self.assertTrue(channel.closed)
        self.assertIsNotNone(broker.fence)


class SignalClassificationTests(unittest.TestCase):
    def setUp(self):
        import pty
        self.master, self.slave = pty.openpty()
        self.addCleanup(os.close, self.slave)
        self.addCleanup(os.close, self.master)

    def broker(self):
        broker = BROKER.Broker.__new__(BROKER.Broker)
        broker.pty_master = self.master
        broker.com1_input = 0
        broker.com1_forwarded = 0
        broker.com1_editor_forwarded = 0
        broker.com1_signal_positions = []
        broker.com1_signal_compacted = 0
        broker.com1_signal_floor = 0
        broker.fence = None
        broker.gated_input = bytearray()
        broker.frames = []
        broker.frame = lambda operation, **fields: broker.frames.append((operation, fields))
        return broker

    def configure(self, isig=True, ignbrk=False, vintr=b"\x03"):
        attributes = termios.tcgetattr(self.slave)
        attributes[0] = (attributes[0] | termios.IGNBRK) if ignbrk else (attributes[0] & ~termios.IGNBRK)
        attributes[3] = (attributes[3] | termios.ISIG) if isig else (attributes[3] & ~termios.ISIG)
        attributes[6][termios.VINTR] = vintr
        termios.tcsetattr(self.slave, termios.TCSANOW, attributes)

    def test_isig_is_read_from_local_flags_not_input_flags(self):
        self.configure(isig=True, ignbrk=False)
        broker = self.broker()

        classified = broker.isig_characters()
        self.assertIn(b"\x03", classified)
        broker.note_forwarded(b"\x03")
        self.assertEqual((broker.com1_forwarded, broker.com1_editor_forwarded), (1, 0))
        self.assertEqual(broker.com1_signal_positions, [0])

        self.configure(isig=True, ignbrk=True)
        self.assertIn(b"\x03", broker.isig_characters())

    def test_disabled_isig_credits_the_byte_to_the_editor(self):
        self.configure(isig=False)
        broker = self.broker()

        self.assertEqual(broker.isig_characters(), frozenset())
        broker.note_forwarded(b"\x03")
        self.assertEqual((broker.com1_forwarded, broker.com1_editor_forwarded), (1, 1))
        self.assertEqual(broker.com1_signal_positions, [])

    def test_configured_signal_character_is_classified(self):
        self.configure(isig=True, vintr=b"\x07")
        broker = self.broker()

        classified = broker.isig_characters()
        self.assertIn(b"\x07", classified)
        self.assertNotIn(b"\x03", classified)
        broker.note_forwarded(b"\x03\x07")
        self.assertEqual(broker.com1_editor_forwarded, 1)
        self.assertEqual(broker.com1_signal_positions, [1])

    def test_unreadable_termios_credits_no_editor_bytes(self):
        broker = self.broker()
        with patch.object(BROKER.termios, "tcgetattr", side_effect=OSError("gone")):
            broker.note_forwarded(b"abc")

        self.assertEqual(broker.com1_forwarded, 3)
        self.assertEqual(broker.com1_editor_forwarded, 0)
        self.assertEqual(broker.editor_bytes_before(3), 3)

    def test_signal_history_is_bounded_under_sustained_input(self):
        self.configure(isig=True)
        broker = self.broker()

        for _ in range(17):
            broker.note_forwarded(b"\x03" * 4096)

        self.assertEqual(broker.com1_forwarded, 69632)
        self.assertEqual(broker.com1_editor_forwarded, 0)
        self.assertLessEqual(len(broker.com1_signal_positions), BROKER.SIGNAL_HISTORY_LIMIT)
        self.assertGreater(broker.com1_signal_compacted, 0)
        self.assertLessEqual(broker.com1_forwarded - broker.com1_signal_floor, BROKER.SIGNAL_WINDOW)

    def test_compaction_preserves_an_outstanding_fence_boundary(self):
        self.configure(isig=True)
        broker = self.broker()
        broker.fence = {"id": 7, "target": 100, "generation": 1, "deadline": 10**9}

        broker.note_forwarded(b"\x03" * 200)
        broker.note_forwarded(b"x" * 70000)

        self.assertEqual(broker.editor_bytes_before(100), 0)
        self.assertEqual(broker.com1_signal_compacted, 100)
        self.assertLessEqual(len(broker.com1_signal_positions), BROKER.SIGNAL_HISTORY_LIMIT)

    def test_unrepresentable_boundary_fails_closed(self):
        self.configure(isig=True)
        broker = self.broker()
        broker.com1_input = 69632
        broker.fence = {"id": 7, "target": 1, "generation": 1, "deadline": 10**9}
        broker.zle_input_ordinal = 0
        broker.zle_state = 1

        for _ in range(17):
            broker.note_forwarded(b"\x03" * 4096)

        self.assertIsNone(broker.editor_bytes_before(0))
        self.assertEqual(broker.frames, [("inputFenceAck", {
            "fenceId": 7, "inputBytes": 1, "state": "unknown",
        })])
        self.assertIsNone(broker.fence)

        broker.fence = {"id": 8, "target": 0, "generation": 1, "deadline": 10**9}
        broker.com1_input = 0
        broker.try_fence()
        self.assertEqual(broker.frames[-1], ("inputFenceAck", {
            "fenceId": 8, "inputBytes": 0, "state": "unknown",
        }))


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
        broker.com2 = object()
        broker.com2_output = bytearray()
        broker.cols, broker.rows = 80, 24
        broker.bootstrapped = False
        broker.bootstrap_bytes_remaining = None
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
        broker.cli_clients = {}

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

    def flush_bootstrap(self, broker):
        read_fd, write_fd = os.pipe()
        previous_com2 = broker.com2
        broker.com2 = write_fd
        try:
            broker.flush_fd(write_fd, broker.com2_output)
            return os.read(read_fd, 4096)
        finally:
            broker.com2 = previous_com2
            os.close(read_fd)
            os.close(write_fd)

    def test_guest_bootstrap_then_host_session_and_locale_ack_gate_startup_frames(self):
        broker = self.make_broker()
        broker.send_bootstrap()
        self.assertFalse(broker.bootstrapped)
        bootstrap_wire = self.flush_bootstrap(broker)
        self.assertTrue(broker.bootstrapped)
        self.assertEqual(BROKER.FrameParser().feed(bootstrap_wire), [{
            "v": 1, "op": "bootstrap", "guestBuildId": broker.build_id,
            "cols": 80, "rows": 24,
        }])
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

    def test_bootstrap_readiness_waits_for_all_partial_uart_writes(self):
        broker = self.make_broker()
        broker.send_bootstrap()
        self.assertEqual(broker.bootstrap_bytes_remaining, len(broker.com2_output))
        broker.com2 = 7
        original_write = BROKER.os.write
        writes = []

        def write_partial(_fd, data):
            chunk = bytes(data[:3])
            writes.append(chunk)
            return len(chunk)

        BROKER.os.write = write_partial
        try:
            while broker.com2_output:
                broker.flush_fd(broker.com2, broker.com2_output)
                if broker.com2_output:
                    self.assertEqual(broker.bootstrap_bytes_remaining, len(broker.com2_output))
        finally:
            BROKER.os.write = original_write

        self.assertGreater(len(writes), 1)
        self.assertTrue(broker.bootstrapped)
        self.assertIsNone(broker.bootstrap_bytes_remaining)

    def test_host_cannot_bootstrap_and_invalid_first_hello_is_rejected(self):
        broker = self.make_broker()
        hello = {
            "v": 1, "sessionId": "b" * 32, "seq": 1, "op": "hello",
            "cols": 80, "rows": 24,
        }
        with self.assertRaisesRegex(ValueError, "before guest bootstrap"):
            broker.handle_frame(hello)

        broker.send_bootstrap()
        with self.assertRaisesRegex(ValueError, "before guest bootstrap"):
            broker.handle_frame(hello)
        self.flush_bootstrap(broker)
        invalid_first_frames = [
            {"v": 1, "op": "bootstrap", "guestBuildId": broker.build_id, "cols": 80, "rows": 24},
            {**hello, "seq": 2},
            {**hello, "sessionId": "not-a-session"},
            {**hello, "extra": 1},
            {**hello, "cols": True},
        ]
        for first in invalid_first_frames:
            with self.subTest(first=first), self.assertRaises(ValueError):
                broker.handle_frame(first)

    def test_resize_is_rejected_before_initial_locale_ack(self):
        broker = self.make_broker()
        broker.send_bootstrap()
        self.flush_bootstrap(broker)
        broker.handle_frame({
            "v": 1, "sessionId": "b" * 32, "seq": 1, "op": "hello",
            "cols": 80, "rows": 24,
        })
        with self.assertRaisesRegex(ValueError, "initial locale acknowledgement required"):
            broker.handle_frame({
                "v": 1, "sessionId": "b" * 32, "seq": 2, "op": "resize",
                "cols": 100, "rows": 40,
            })

    def test_cli_output_and_mutations_wait_for_initial_locale_ack(self):
        broker = self.make_broker()
        replies = []
        broker.reply = lambda _client, text: replies.append(text)
        client = object()

        for ready in (False, True):
            broker.ready = ready
            broker.initial_locale_acknowledged = False
            for command in (b"locale ru", b"open quick-cv", b"open invalid-id", b"invalid"):
                broker.handle_cli(client, command)

        self.assertEqual(replies, ["error unavailable"] * 8)
        self.assertFalse(hasattr(broker, "locale"))
        self.assertEqual(broker.frames, [])

    def test_cli_socket_returns_unavailable_before_parsing_any_request(self):
        broker = self.make_broker()
        replies = []
        broker.reply = lambda _client, text: replies.append(text)

        class Client:
            def __init__(self, payload):
                self.payload = payload

            def recv(self, _limit):
                return self.payload

        for ready in (False, True):
            broker.ready = ready
            broker.initial_locale_acknowledged = False
            for payload in (b"locale ru\n", b"\xff\n", b"x" * 129, b"open quick-cv\nextra\n"):
                client = Client(payload)
                broker.cli_clients[client] = bytearray()
                broker.read_client(client)

        self.assertEqual(replies, ["error unavailable"] * 8)
        self.assertEqual(broker.frames, [])

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
        broker.initial_locale_acknowledged = True
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
