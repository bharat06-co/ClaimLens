"""Create a source/evidence ZIP for sharing, excluding secrets and local runtimes."""
from pathlib import Path
from hashlib import sha256
import json
import zipfile

root = Path(__file__).resolve().parents[1]
target = root.parent / 'CLAIMLENS_AUDITED_SHARE_2026-10-22.zip'
allowed_dirs = {'app', 'components', 'lib', 'db', 'docs', 'scripts', 'tests', '.github'}
blocked_dirs = {'node_modules', '.next', 'model-cache', 'audit-private', '.git',
                'coverage', '__pycache__', '.pytest_cache'}
root_files = {'.env.example', '.gitignore', 'README.md', 'SHARE_WITH_GPT.md',
              'CHANGELOG_AUDIT.md', 'compose.yaml', 'package.json',
              'package-lock.json', 'tsconfig.json', 'next.config.ts',
              'next-env.d.ts', 'middleware.ts'}

files = []
for path in root.rglob('*'):
    relative = path.relative_to(root)
    if set(relative.parts) & blocked_dirs:
        continue
    if not path.is_file():
        continue
    if len(relative.parts) == 1:
        if relative.name not in root_files:
            continue
    elif relative.parts[0] not in allowed_dirs:
        continue
    if relative.name.startswith('.env') and relative.name != '.env.example':
        continue
    if path.suffix.lower() in {'.log', '.tsbuildinfo', '.pyc', '.zip'}:
        continue
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise ValueError('Unexpected source link outside the project')
    files.append(path)
files.sort()

# Read original unique secrets only to check that none enters the archive.
# Never print them or include them in a manifest.
secrets = []
environment = root / '.env'
if environment.exists():
    for line in environment.read_text(encoding='utf-8').splitlines():
        key, separator, value = line.partition('=')
        if separator and key in {'SESSION_SECRET', 'SEED_DEMO_PASSWORD'}:
            value = value.strip().strip('"').strip("'")
            if value:
                secrets.append(value.encode('utf-8'))

contents = {}
for path in files:
    relative = path.relative_to(root).as_posix()
    data = path.read_bytes()
    if any(secret in data for secret in secrets):
        raise ValueError(f'Private environment secret detected in {relative}')
    contents['CLAIMLENS/' + relative] = data

required = {'CLAIMLENS/CHANGELOG_AUDIT.md', 'CLAIMLENS/docs/AUDIT_RESULTS.md',
            'CLAIMLENS/docs/REQUIREMENTS_AUDIT.md', 'CLAIMLENS/SHARE_WITH_GPT.md',
            'CLAIMLENS/package-lock.json'}
assert required.issubset(contents), 'Required audit/source files missing'
manifest = {
    'package': target.name,
    'date': '2026-10-22',
    'contents': 'Audited source and evidence; private runtime data excluded',
    'files': [{'path': name, 'bytes': len(data), 'sha256': sha256(data).hexdigest()}
              for name, data in contents.items()],
}
with zipfile.ZipFile(target, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in contents.items():
        archive.writestr(name, data)
    archive.writestr('CLAIMLENS/SHARE_MANIFEST.json', json.dumps(manifest, indent=2))

with zipfile.ZipFile(target) as archive:
    assert archive.testzip() is None, 'ZIP CRC verification failed'
    for entry in manifest['files']:
        assert sha256(archive.read(entry['path'])).hexdigest() == entry['sha256']
    assert len(archive.namelist()) == len(contents) + 1

print(f'Created {target.name}: {len(contents) + 1} files, {target.stat().st_size:,} bytes')
print('PASS ZIP integrity, per-file hashes, required audit files and private-secret checks')
