# ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
"""Export MBTiles to static, individually loadable tiles. No FAA requests."""
import hashlib
import json
import os
import sqlite3
from contextlib import closing
from pathlib import Path


def export_airspace_tiles(database, destination):
    database, destination = Path(database), Path(destination)
    digest = hashlib.sha256(database.read_bytes()).hexdigest()[:20]
    destination.mkdir(parents=True, exist_ok=True)
    manifest_path = destination / 'manifest.json'
    if manifest_path.exists():
        old = json.loads(manifest_path.read_text(encoding='utf-8'))
        if old.get('revision') == digest and all((destination / digest / (key + '.pbf')).is_file() for key in old.get('tiles', [])) and old.get('tiles'):
            return len(old['tiles'])
    keys = []
    with closing(sqlite3.connect(f'{database.resolve().as_uri()}?mode=ro', uri=True)) as db:
        for z, x, tms_y, data in db.execute('SELECT zoom_level, tile_column, tile_row, tile_data FROM tiles WHERE zoom_level BETWEEN 4 AND 8'):
            y = (1 << z) - 1 - tms_y
            key = f'{z}/{x}/{y}'
            target = destination / digest / (key + '.pbf')
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix('.tmp')
            temporary.write_bytes(data)
            os.replace(temporary, target)
            keys.append(key)
    if not keys:
        raise ValueError('Cannot publish an empty airspace tile index')
    temporary = manifest_path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'version': 1, 'revision': digest, 'tiles': keys}, separators=(',', ':')), encoding='utf-8')
    os.replace(temporary, manifest_path)
    return len(keys)
