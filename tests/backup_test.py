"""No real family data: unit fault injection plus opt-in disposable Docker roundtrip."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
import uuid

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('backup', ROOT / 'scripts/backup.py')
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def fake_run(self, args, **kwargs):
        if 'pg_dump' in args:
            kwargs['stdout'].write(b'fictional archive')
        return subprocess.CompletedProcess(args, 0, stdout=b'test-revision')

    def test_rotation_only_own_completed_bundles(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(backup, 'run', self.fake_run):
            target = Path(directory)
            unrelated = target / 'family.dump'
            unrelated.write_text('keep')
            incomplete = target / '.kidsdaily365-incomplete-aborted'
            incomplete.mkdir()
            foreign = target / ('kidsdaily365-20000101T000000.000000Z-' + 'a' * 32)
            foreign.mkdir()
            (foreign / 'manifest.json').write_text('{}')
            first = backup.backup(target, 1)
            second = backup.backup(target, 1)
            self.assertFalse(first.exists())
            self.assertTrue(second.exists())
            self.assertTrue(unrelated.exists())
            self.assertTrue(incomplete.exists())
            self.assertTrue(foreign.exists())

    def test_failed_or_interrupted_dump_keeps_last_success(self):
        for failure in (RuntimeError('injected failure'), KeyboardInterrupt()):
            with self.subTest(failure=type(failure)), tempfile.TemporaryDirectory() as directory:
                target = Path(directory)
                with patch.object(backup, 'run', self.fake_run):
                    previous = backup.backup(target, 1)
                def fail(args, **kwargs):
                    kwargs['stdout'].write(b'partial')
                    raise failure
                with patch.object(backup, 'run', fail), self.assertRaises(type(failure)):
                    backup.backup(target, 1)
                self.assertTrue(previous.exists())
                self.assertEqual(len(list(target.glob('kidsdaily365-*'))), 1)
                self.assertEqual(list(target.glob('.kidsdaily365-incomplete-*')), [])

    def test_invalid_archive_never_published(self):
        with tempfile.TemporaryDirectory() as directory:
            def fail_list(args, **kwargs):
                if 'pg_restore' in args:
                    raise RuntimeError('bad archive')
                return self.fake_run(args, **kwargs)
            with patch.object(backup, 'run', fail_list), self.assertRaises(RuntimeError):
                backup.backup(Path(directory), 1)
            self.assertEqual(list(Path(directory).glob('kidsdaily365-*')), [])

    def test_modified_dump_and_wrong_schema_rejected_before_docker(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(backup, 'run', self.fake_run):
            bundle = backup.backup(Path(directory), 1)
            (bundle / 'database.dump').write_bytes(b'corrupt')
            with patch.object(backup, 'run') as run, self.assertRaises(RuntimeError):
                backup.restore_check(bundle)
            run.assert_not_called()
            metadata = json.loads((bundle / 'manifest.json').read_text())
            metadata['schema'] = 'different'
            (bundle / 'manifest.json').write_text(json.dumps(metadata))
            with patch.object(backup, 'run') as run, self.assertRaises(RuntimeError):
                backup.restore_check(bundle)
            run.assert_not_called()

    def test_lock_prevents_concurrent_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            with (Path(directory) / '.kidsdaily365.lock').open('a') as lock:
                backup.fcntl.flock(lock, backup.fcntl.LOCK_EX)
                with self.assertRaises(RuntimeError):
                    backup.backup(Path(directory), 1)

    @unittest.skipUnless(os.environ.get('BACKUP_INTEGRATION') == '1', 'set BACKUP_INTEGRATION=1 for disposable PostgreSQL test')
    def test_real_migrated_roundtrip(self):
        name = 'kidsdaily365-backup-test-' + uuid.uuid4().hex
        real_run = backup.run
        def sql(container, database, query):
            return real_run(['docker', 'exec', '-i', container, 'psql', '-U', 'kidsdaily' if container == name else 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], input=query.encode(), stdout=subprocess.PIPE).stdout
        def snapshot(container, database):
            tables = sql(container, database, "SELECT schemaname || '.' || tablename FROM pg_tables WHERE schemaname IN ('public', 'drizzle') ORDER BY 1").decode().splitlines()
            return {table: sql(container, database, 'SELECT row_to_json(t)::text FROM ' + table + ' t ORDER BY row_to_json(t)::text') for table in tables}
        try:
            real_run(['docker', 'run', '-d', '--name', name, '-p', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql:rw', '-e', 'POSTGRES_USER=kidsdaily', '-e', 'POSTGRES_DB=kidsdaily_source_test', '-e', 'POSTGRES_PASSWORD=fictional-test-only', 'postgres:18-alpine'], stdout=subprocess.DEVNULL)
            for _ in range(60):
                ready = subprocess.run(['docker', 'exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'kidsdaily', '-d', 'kidsdaily_source_test'], capture_output=True)
                if ready.returncode == 0:
                    break
                time.sleep(1)
            port = real_run(['docker', 'port', name, '5432'], stdout=subprocess.PIPE).stdout.decode().strip().rsplit(':', 1)[1]
            env = dict(os.environ, DATABASE_URL='postgres://kidsdaily:fictional-test-only@127.0.0.1:' + port + '/kidsdaily_source_test')
            # The real migrator includes Drizzle's migration history in the dump.
            subprocess.run(['npm', 'run', 'db:migrate'], cwd=ROOT, env=env, check=True)
            subprocess.run(['npm', 'run', 'test:integration'], cwd=ROOT, env=env, check=True)
            family, child, task = (str(uuid.uuid4()) for _ in range(3))
            picture = (ROOT / 'public/illustrations/buddy-fox.webp').read_bytes().hex()
            sql(name, 'kidsdaily_source_test', f'''INSERT INTO families(id,name) VALUES ('{family}','Fiktive Familie');
INSERT INTO children(id,"familyId",name,avatar) VALUES ('{child}','{family}','Testkind','T');
INSERT INTO child_images("childId","familyId",data) VALUES ('{child}','{family}',decode('{picture}','hex'));
INSERT INTO daily_tasks(id,"familyId","childId",date,title,section,points) VALUES ('{task}','{family}','{child}','2026-11-01','Fiktive Tageskopie','morning',7);
INSERT INTO point_entries("familyId","childId","taskId",amount) VALUES ('{family}','{child}','{task}',7);''')
            expected = snapshot(name, 'kidsdaily_source_test')
            restored = []
            def route(args, **kwargs):
                if args[:6] == ['docker', 'compose', 'exec', '-T', 'db', 'pg_dump']:
                    args = ['docker', 'exec', name, 'pg_dump', '-U', 'kidsdaily', '-d', 'kidsdaily_source_test', '-Fc']
                elif args[:6] == ['docker', 'compose', 'exec', '-T', 'db', 'pg_restore']:
                    args = ['docker', 'exec', '-i', name, 'pg_restore', '--list']
                result = real_run(args, **kwargs)
                if 'psql' in args and 'kidsdaily_restore_test' in args:
                    self.assertEqual(snapshot(args[2], 'kidsdaily_restore_test'), expected)
                    restored.append(True)
                return result
            with tempfile.TemporaryDirectory() as directory, patch.object(backup, 'run', route):
                bundle = backup.backup(Path(directory), 2)
                backup.restore_check(bundle)
                self.assertEqual(restored, [True])
                # A truncated but checksum-adjusted archive gets past integrity checks;
                # pg_restore must still fail and its isolated container be removed.
                data = (bundle / 'database.dump').read_bytes()
                (bundle / 'database.dump').write_bytes(data[:len(data) // 2])
                metadata = json.loads((bundle / 'manifest.json').read_text())
                metadata['sha256'] = backup.digest(bundle / 'database.dump')
                (bundle / 'manifest.json').write_text(json.dumps(metadata))
                with self.assertRaises(RuntimeError):
                    backup.restore_check(bundle)
            self.assertEqual(snapshot(name, 'kidsdaily_source_test'), expected)
        finally:
            real_run(['docker', 'rm', '-f', '-v', name], stdout=subprocess.DEVNULL)


if __name__ == '__main__':
    unittest.main()
