"""Failure boundaries for the release operator; Docker is stubbed, no real data."""
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/unraid-release.sh'


class DeploymentTest(unittest.TestCase):
    def run_release(self, failure=''):
        temporary = tempfile.TemporaryDirectory(prefix='kidsdaily-', dir='/tmp')
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name)
        incoming = base / 'incoming/upload.test'
        incoming.mkdir(parents=True)
        old = base / 'releases' / ('a' * 40)
        old.mkdir(parents=True)
        (base / 'current').symlink_to(old)
        (base / '.env').write_text('APP_MODE=live\n')
        (incoming / 'unraid-release.sh').write_bytes(SCRIPT.read_bytes())
        source = base / 'source'
        source.mkdir()
        (source / 'compose.yaml').write_text('services: {}\n')
        with tarfile.open(incoming / 'source.tar.gz', 'w:gz') as archive:
            archive.add(source / 'compose.yaml', arcname='compose.yaml')
        binaries = base / 'bin'
        binaries.mkdir()
        docker = binaries / 'docker'
        docker.write_text('''#!/bin/bash
printf '%s\\n' "$*" >> "$LOG"
case "$*" in
  *" build") test "$FAIL" != build ;;
  *pg_dump*) test "$FAIL" != backup || exit 1; printf 'fictional dump' ;;
  *pg_restore*) cat >/dev/null ;;
  *"run --rm --no-deps migrate") test "$FAIL" != migration ;;
  *"exec -T app node"*) test "$FAIL" != health ;;
  *) exit 0 ;;
esac
''')
        docker.chmod(0o700)
        # flock and GNU mv are host prerequisites; emulate them for macOS unit runs.
        (binaries / 'flock').write_text('#!/bin/sh\nexit 0\n')
        (binaries / 'flock').chmod(0o700)
        (binaries / 'mv').write_text('''#!/bin/sh
if [ "$1" = -Tf ]; then
  shift
  exec python3 -c 'import os,sys; os.replace(sys.argv[1],sys.argv[2])' "$1" "$2"
fi
exec /bin/mv "$@"
''')
        (binaries / 'mv').chmod(0o700)
        autostart = base / 'autostart'
        autostart.write_text('unrelated-container\nkidsdaily365-db-1\nkidsdaily365-app-1\n')
        log = base / 'calls'
        result = subprocess.run(['bash', str(SCRIPT), str(base), 'b' * 40, str(incoming)],
                                env={**os.environ, 'PATH': str(binaries) + ':' + os.environ['PATH'],
                                     'LOG': str(log), 'FAIL': failure, 'KIDSDAILY_AUTOSTART_FILE': str(autostart)}, capture_output=True, text=True)
        return base, result, log.read_text(), old

    def test_build_failure_keeps_running_release(self):
        base, result, calls, old = self.run_release('build')
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('stop app', calls)
        self.assertEqual((base / 'current').resolve(), old.resolve())

    def test_backup_failure_resumes_old_app_without_migration(self):
        base, result, calls, old = self.run_release('backup')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('start app', calls)
        self.assertNotIn('run --rm --no-deps migrate', calls)
        self.assertEqual((base / 'current').resolve(), old.resolve())

    def test_migration_or_health_failure_never_resumes_old_schema(self):
        for failure in ['migration', 'health']:
            with self.subTest(failure=failure):
                base, result, calls, old = self.run_release(failure)
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn('start app', calls)
                self.assertEqual((base / 'current').resolve(), old.resolve())
                self.assertTrue(list((base / 'backups').glob('*/database.dump')))
                self.assertNotIn('kidsdaily365-app-1', (base / 'autostart').read_text())
                self.assertIn('unrelated-container', (base / 'autostart').read_text())

    def test_success_records_release_only_after_backup_and_health(self):
        base, result, calls, _ = self.run_release()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((base / 'installed-revision').read_text().strip(), 'b' * 40)
        self.assertEqual((base / 'current').resolve(), (base / 'releases' / ('b' * 40)).resolve())
        self.assertLess(calls.index('pg_dump'), calls.index('run --rm --no-deps migrate'))
        self.assertLess(calls.index('run --rm --no-deps migrate'), calls.index('exec -T app node'))


if __name__ == '__main__':
    unittest.main()
