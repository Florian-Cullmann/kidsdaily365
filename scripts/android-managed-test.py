#!/usr/bin/env python3
"""Opt-in runner for a provisioned disposable emulator. Keeps reports working after DPC disables ADB."""
import argparse
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
import re
import socket
import subprocess
import tempfile
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--serial", required=True, help="Dedicated emulator serial, e.g. emulator-5554")
parser.add_argument("--leave-managed", action="store_true", help="Leave emulator managed after success for a manual cold-boot probe; no automatic cleanup")
parser.add_argument("--output", type=Path, default=None)
args = parser.parse_args()
if not re.fullmatch(r"emulator-[0-9]+", args.serial):
    parser.error("Only a disposable emulator is supported; no physical devices")
output = (args.output or Path(tempfile.mkdtemp(prefix="kidsdaily-managed-proof-"))).resolve()
output.mkdir(parents=True, exist_ok=True)
result = None


def console_capture(name):
    # Host console capture works without ADB; token stays local and is never logged.
    directory = output / name
    directory.mkdir(exist_ok=True)
    with socket.create_connection(("127.0.0.1", int(args.serial.split("-")[1])), timeout=3) as stream:
        stream.settimeout(.5)
        stream.recv(4096)
        token = (Path.home() / ".emulator_console_auth_token").read_text().strip()
        stream.sendall(f"auth {token}\n".encode())
        try:
            while stream.recv(4096):
                pass
        except TimeoutError:
            pass
        stream.sendall(f"screenrecord screenshot {directory}\n".encode())
        try:
            while stream.recv(4096):
                pass
        except TimeoutError:
            pass


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        global result
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 10_000_000:
            self.send_error(400)
            return
        data = self.rfile.read(length)
        if self.path == "/proof":
            (output / "managed-proof.png").write_bytes(data)
        elif self.path == "/result":
            result = data.decode()
            (output / "result.txt").write_text(result)
        elif self.path in ("/blocked-settings", "/allowed-clock", "/settings"):
            console_capture(self.path[1:])
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.end_headers()

    def log_message(self, *_):
        pass


with HTTPServer(("127.0.0.1", 0), Handler) as server:
    server.timeout = 1
    log = (output / "adb-instrumentation.txt").open("w")
    command = ["adb", "-s", args.serial, "shell", "am", "instrument", "-w", "-e", "reportPort",
               str(server.server_port), "de.kidsdaily365.launcher.test/de.kidsdaily365.launcher.ManagedDeviceTestRunner"]
    if args.leave_managed:
        command = command[:-1] + ["-e", "leaveManaged", "true", command[-1]]
    process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
    deadline = time.monotonic() + 90
    try:
        while result is None and time.monotonic() < deadline:
            server.handle_request()
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
        log.close()
print(result or "FAILED: No emulator result received within 90 seconds. Inspect the dedicated emulator.")
print(f"Evidence: {output}")
raise SystemExit(0 if result and result.startswith("Device Owner checks passed:") else 1)
