#!/usr/bin/env python3
"""Local Compose backup and network-isolated restore rehearsal (Python 3.9+)."""
import argparse
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
FORMAT = 'kidsdaily365-backup-v1'
NAME = re.compile(r'kidsdaily365-\d{8}T\d{6}\.\d{6}Z-[0-9a-f]{32}')


def run(args, **kwargs):
    # PostgreSQL/Compose diagnostics may contain credentials or row contents.
    result = subprocess.run(args, stderr=subprocess.DEVNULL, **kwargs)
    if result.returncode:
        raise RuntimeError('Unterprozess fehlgeschlagen (Exit %d); keine Sicherung löschen. Docker/DB und Speicherplatz lokal prüfen.' % result.returncode)
    return result


def digest(path):
    with path.open('rb') as source:
        checksum = hashlib.sha256()
        for block in iter(lambda: source.read(1024 * 1024), b''):
            checksum.update(block)
        return checksum.hexdigest()


def sync_directory(path):
    descriptor = os.open(path, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def schema_digest():
    return hashlib.sha256(''.join(digest(p) for p in sorted((ROOT / 'drizzle').glob('*.sql'))).encode()).hexdigest()


def backup(target, keep):
    if keep < 1:
        raise RuntimeError('Aufbewahrung muss mindestens 1 sein.')
    target.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (target / '.kidsdaily365.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError('Ein anderer Backup-Lauf ist aktiv.') from None
        stage = Path(tempfile.mkdtemp(prefix='.kidsdaily365-incomplete-', dir=target))
        try:
            print('Vollständigen PostgreSQL-Dump erstellen …', flush=True)
            with (stage / 'database.dump').open('wb') as output:
                run(['docker', 'compose', 'exec', '-T', 'db', 'pg_dump', '-U', 'kidsdaily', '-d', 'kidsdaily', '-Fc'], cwd=ROOT, stdout=output)
                output.flush()
                os.fsync(output.fileno())
            with (stage / 'database.dump').open('rb') as source:
                run(['docker', 'compose', 'exec', '-T', 'db', 'pg_restore', '--list'], cwd=ROOT, stdin=source, stdout=subprocess.DEVNULL)
            name = 'kidsdaily365-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ-') + uuid.uuid4().hex
            revision = run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, stdout=subprocess.PIPE).stdout.decode().strip()
            manifest = dict(format=FORMAT, name=name, sha256=digest(stage / 'database.dump'), schema=schema_digest(), revision=revision, postgresMajor=18)
            with (stage / 'manifest.json').open('w') as output:
                json.dump(manifest, output)
                output.flush()
                os.fsync(output.fileno())
            sync_directory(stage)
            stage.rename(target / name)
            sync_directory(target)
            # Only our completed bundles, never unrelated files or symlinks.
            owned = []
            for candidate in target.iterdir():
                if not NAME.fullmatch(candidate.name) or candidate.is_symlink() or not candidate.is_dir():
                    continue
                try:
                    metadata = json.loads((candidate / 'manifest.json').read_text())
                    if metadata.get('format') == FORMAT and metadata.get('name') == candidate.name and (candidate / 'database.dump').is_file():
                        owned.append(candidate)
                except (OSError, ValueError):
                    continue
            # Keep the current successful backup even if the host clock moved backwards.
            previous = sorted((p for p in owned if p.name != name), key=lambda p: p.name, reverse=True)
            for old in previous[keep - 1:]:
                shutil.rmtree(old)
            print('Sicherung abgeschlossen; Aufbewahrung: %d erfolgreiche Läufe.' % keep)
            return target / name
        finally:
            if stage.exists():
                shutil.rmtree(stage)


def restore_check(bundle):
    metadata = json.loads((bundle / 'manifest.json').read_text())
    if metadata.get('format') != FORMAT or metadata.get('postgresMajor') != 18 or metadata.get('schema') != schema_digest():
        raise RuntimeError('Backup-/Schemaversion passt nicht zu diesem Checkout.')
    if digest(bundle / 'database.dump') != metadata.get('sha256'):
        raise RuntimeError('Prüfsumme stimmt nicht; Restore abgebrochen.')
    name = 'kidsdaily365-restore-' + uuid.uuid4().hex
    print('Restore in isolierte, wegwerfbare kidsdaily_restore_test-Datenbank …', flush=True)
    try:
        run(['docker', 'run', '-d', '--name', name, '--network', 'none', '--tmpfs', '/var/lib/postgresql:rw', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=kidsdaily_restore_test', 'postgres:18-alpine'], stdout=subprocess.DEVNULL)
        for _ in range(60):
            ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'kidsdaily_restore_test'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            if ready.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Test-PostgreSQL wurde nicht bereit.')
        with (bundle / 'database.dump').open('rb') as source:
            run(['docker', 'exec', '-i', name, 'pg_restore', '-U', 'postgres', '-d', 'kidsdaily_restore_test', '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction'], stdin=source, stdout=subprocess.DEVNULL)
        # Read all key data, including binary images; never print child data.
        run(['docker', 'exec', name, 'psql', '-U', 'postgres', '-d', 'kidsdaily_restore_test', '-v', 'ON_ERROR_STOP=1', '-c', 'SELECT count(*) FROM children; SELECT sum(octet_length(data)) FROM child_images; SELECT count(*) FROM daily_tasks; SELECT sum(amount) FROM point_entries;'], stdout=subprocess.DEVNULL)
        print('Restore erfolgreich: Schema, Profilbilder, Tageskopien und Punktejournal lesbar.')
    finally:
        run(['docker', 'rm', '-f', '-v', name], stdout=subprocess.DEVNULL)


def main():
    os.umask(0o077)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(143))
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    create = commands.add_parser('create')
    create.add_argument('--target', type=Path, required=True)
    create.add_argument('--keep', type=int, default=14)
    restore = commands.add_parser('verify')
    restore.add_argument('bundle', type=Path)
    args = parser.parse_args()
    try:
        if args.command == 'create':
            backup(args.target.resolve(), args.keep)
        else:
            restore_check(args.bundle.resolve())
    except RuntimeError as error:
        print('FEHLER: ' + str(error), file=sys.stderr)
        return 1
    except (OSError, ValueError):
        print('FEHLER: Backup/Restore nicht abgeschlossen. Docker/DB, Version, Prüfsumme, Rechte und Speicherplatz lokal prüfen. Keine Rohlogs mit Geheimnissen weitergeben.', file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print('Abgebrochen; kein unvollständiger Dump veröffentlicht.', file=sys.stderr)
        return 130
    return 0


if __name__ == '__main__':
    sys.exit(main())
