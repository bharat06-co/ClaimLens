"""Compare the audited source with the supplied ZIP without reading secrets."""
from pathlib import Path
import difflib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
archive = Path(r"C:\Users\bhara\Downloads\CLAIMLENS_Level3_Project_SETUP_FIXED.zip")
changed = []
patches = []
text_suffixes = {'.md', '.ts', '.tsx', '.sql', '.mjs', '.json', '.yaml'}
with zipfile.ZipFile(archive) as source:
    for entry in source.infolist():
        relative = Path(entry.filename).relative_to('CLAIMLENS')
        if relative.suffix not in text_suffixes and relative.name not in {'.gitignore', '.env.example'}:
            continue
        current = root / relative
        if not current.is_file():
            continue
        before = source.read(entry).decode('utf-8').splitlines(keepends=True)
        after = current.read_text(encoding='utf-8').splitlines(keepends=True)
        if before != after:
            changed.append(relative.as_posix())
            patches.extend(difflib.unified_diff(before, after, fromfile='original/'+relative.as_posix(), tofile='audited/'+relative.as_posix()))
evidence = root/'docs'/'audit-evidence'
evidence.mkdir(parents=True, exist_ok=True)
(evidence/'source-changes.patch').write_text(''.join(patches),encoding='utf-8')
(evidence/'modified-original-files.json').write_text(json.dumps(changed,indent=2),encoding='utf-8')
print(f'Saved exact source diff for {len(changed)} modified original text files. No .env, database backup, or private snapshot was read.')
