# ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
from contextlib import closing
import gzip
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from airspace_tiles import export_airspace_tiles

class TileExportTests(unittest.TestCase):
    def test_xyz_conversion_bytes_cache_and_revision(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); database=root/'source.mbtiles'; dest=root/'airspace'
            with closing(sqlite3.connect(database)) as db, db:
                db.execute('CREATE TABLE tiles (zoom_level, tile_column, tile_row, tile_data)')
                db.execute('INSERT INTO tiles VALUES (4, 3, 5, ?)', (gzip.compress(b'example-vector-data'),))
                db.execute('INSERT INTO tiles VALUES (9, 3, 5, ?)', (gzip.compress(b'unused-zoom'),))
            self.assertEqual(export_airspace_tiles(database,dest),1)
            manifest=json.loads((dest/'manifest.json').read_text())
            self.assertEqual(manifest['tiles'],['4/3/10'])
            tile=dest/manifest['revision']/'4/3/10.pbf'
            self.assertEqual(gzip.decompress(tile.read_bytes()),b'example-vector-data')
            modified=tile.stat().st_mtime_ns
            self.assertEqual(export_airspace_tiles(database,dest),1)
            self.assertEqual(tile.stat().st_mtime_ns,modified)
            tile.unlink()
            export_airspace_tiles(database,dest)
            self.assertTrue(tile.exists())
            with closing(sqlite3.connect(database)) as db, db:
                db.execute('UPDATE tiles SET tile_data=? WHERE zoom_level=4',(gzip.compress(b'new-data'),))
            export_airspace_tiles(database,dest)
            newer=json.loads((dest/'manifest.json').read_text())
            self.assertNotEqual(manifest['revision'],newer['revision'])
            self.assertEqual(gzip.decompress((dest/newer['revision']/'4/3/10.pbf').read_bytes()),b'new-data')

    def test_empty_export_preserves_manifest(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder); database=root/'empty.mbtiles'; dest=root/'airspace';dest.mkdir()
            with closing(sqlite3.connect(database)) as db, db:
                db.execute('CREATE TABLE tiles (zoom_level, tile_column, tile_row, tile_data)')
            original=json.dumps({'version':1,'revision':'previous','tiles':[]})
            (dest/'manifest.json').write_text(original)
            with self.assertRaises(ValueError): export_airspace_tiles(database,dest)
            self.assertEqual((dest/'manifest.json').read_text(),original)

if __name__=='__main__': unittest.main()
