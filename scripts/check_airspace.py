# ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
# Run with .build-venv/Scripts/python.exe scripts/check_airspace.py
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('airspace', Path(__file__).resolve().parents[1] / 'update_airspace.py')
airspace = importlib.util.module_from_spec(spec)
spec.loader.exec_module(airspace)

def response(data):
    result = Mock()
    result.json.return_value = data
    result.status_code = 200
    result.headers = {}
    return result

def feature(ident):
    return {'type': 'Feature', 'properties': {'OBJECTID': ident, 'CLASS': 'B'}, 'geometry': {'type': 'Polygon', 'coordinates': [[[-71.1,42.3],[-71,42.3],[-71,42.4],[-71.1,42.4],[-71.1,42.3]]]}}

def page(*ids):
    return {'type': 'FeatureCollection', 'features': [feature(i) for i in ids]}

class AirspaceTests(unittest.TestCase):
    def setUp(self):
        self.clock = 1000.0
        airspace._next_faa_request = 0.0
        airspace._faa_interval = airspace.FAA_REQUEST_INTERVAL
        def advance(seconds):
            self.clock += seconds
        clock_patch = patch.object(airspace.time, 'monotonic', side_effect=lambda: self.clock)
        sleep_patch = patch.object(airspace.time, 'sleep', side_effect=advance)
        clock_patch.start()
        self.sleep = sleep_patch.start()
        self.addCleanup(clock_patch.stop)
        self.addCleanup(sleep_patch.stop)

    def test_successful_requests_are_spaced(self):
        timestamps = []
        replies = iter([response({'count': 2}), response(page(1)), response(page(2))])
        def fetch(*args, **kwargs):
            timestamps.append(self.clock)
            return next(replies)
        with patch.object(airspace.requests, 'get', side_effect=fetch):
            self.assertEqual(len(airspace.download_faa_airspaces()), 2)
        self.assertEqual(timestamps, [1000, 1003, 1006])

    def test_repeated_quota_does_not_exhaust_normal_retries(self):
        quota = response({'error': {'code': 429, 'details': ['Retry after 60 sec.']}})
        replies = [response({'count': 2}), response(page(1))] + [quota]*6 + [response(page(2))]
        with patch.object(airspace.requests, 'get', side_effect=replies) as fetch:
            result = airspace.download_faa_airspaces()
        self.assertEqual(len(result), 2)
        self.assertEqual(airspace._faa_interval, 15)
        # All throttled requests resume the same page, preserving earlier features.
        for call in fetch.call_args_list[2:]:
            self.assertEqual(call.kwargs['params']['resultOffset'], 1)

    def test_persistent_quota_has_bounded_retries(self):
        quota = response({'error': {'code': 429}})
        with patch.object(airspace.requests, 'get', return_value=quota) as fetch:
            with self.assertRaisesRegex(RuntimeError, '10 cooldown retries'):
                airspace.download_faa_airspaces()
        self.assertEqual(fetch.call_count, 11)

    def test_long_server_cooldown_is_not_shortened(self):
        quota = response({'error': {'code': 429, 'details': ['Retry after 600 sec.']}})
        with patch.object(airspace.requests, 'get', side_effect=[quota,response({'count': 1}),response(page(1))]):
            airspace.download_faa_airspaces()
        self.assertIn(unittest.mock.call(601), self.sleep.call_args_list)

    def test_http_200_arcgis_error_retries(self):
        replies = [response({'error': {'code': 500, 'message': 'Busy'}}), response({'count': 1}), response(page(1))]
        with patch.object(airspace.requests, 'get', side_effect=replies):
            self.assertEqual(len(airspace.download_faa_airspaces()), 1)
        self.assertIn(unittest.mock.call(3), self.sleep.call_args_list)

    def test_empty_first_page_is_retried(self):
        replies = [response({'count': 1}), response(page()), response(page(1))]
        with patch.object(airspace.requests, 'get', side_effect=replies):
            self.assertEqual(len(airspace.download_faa_airspaces()), 1)

    def test_persistent_empty_page_fails(self):
        with patch.object(airspace.requests, 'get', side_effect=[response({'count': 1})]+[response(page())]*5):
            with self.assertRaisesRegex(RuntimeError, 'expected 1'):
                airspace.download_faa_airspaces()

    def test_short_page_does_not_truncate_download(self):
        with patch.object(airspace.requests, 'get', side_effect=[response({'count': 2}),response(page(1)),response(page(2))]):
            self.assertEqual(len(airspace.download_faa_airspaces()), 2)

    def test_duplicate_page_fails(self):
        with patch.object(airspace.requests, 'get', side_effect=[response({'count': 2}),response(page(1))]+[response(page(1))]*5):
            with self.assertRaisesRegex(RuntimeError, 'duplicate'):
                airspace.download_faa_airspaces()

    def test_arcgis_quota_delay_is_honored(self):
        quota = {'error': {'code': 429, 'details': ['Retry after 60 sec.']}}
        with patch.object(airspace.requests, 'get', side_effect=[response(quota),response({'count': 1}),response(page(1))]):
            self.assertEqual(len(airspace.download_faa_airspaces()), 1)
        self.assertIn(unittest.mock.call(61), self.sleep.call_args_list)

    def test_http_quota_retry_after_header(self):
        quota = response({})
        quota.status_code = 429
        quota.headers = {'Retry-After': '90'}
        quota.raise_for_status.side_effect = airspace.requests.HTTPError('429 Too Many Requests')
        with patch.object(airspace.requests, 'get', side_effect=[quota,response({'count': 1}),response(page(1))]):
            self.assertEqual(len(airspace.download_faa_airspaces()), 1)
        self.assertIn(unittest.mock.call(91), self.sleep.call_args_list)

    def test_zero_tiles_preserves_existing_database(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'class_airspace.mbtiles'
            path.write_bytes(b'previous tiles')
            with patch.object(airspace, 'geojson2vt', return_value=Mock(tile_coords=[])):
                with self.assertRaisesRegex(RuntimeError, 'No airspace tiles'):
                    airspace.build_mbtiles({'features': [feature(1)]}, str(path))
            self.assertEqual(path.read_bytes(), b'previous tiles')
            self.assertEqual(list(Path(folder).glob('*.tmp')), [])

    def test_failed_copy_preserves_destination(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder)/'source.mbtiles'
            target = Path(folder)/'target.mbtiles'
            source.write_bytes(b'new tiles')
            target.write_bytes(b'old tiles')
            with patch.object(airspace.shutil, 'copy2', side_effect=OSError('Disk full')):
                with self.assertRaises(OSError):
                    airspace.publish_copy(str(source), str(target))
            self.assertEqual(target.read_bytes(), b'old tiles')
            self.assertEqual(list(Path(folder).glob('*.tmp')), [])

    def test_generation_and_failed_replacement(self):
        data = airspace.process_and_clean_features([feature(1)])
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder)/'class_airspace.mbtiles'
            airspace.build_mbtiles(data, str(path))
            original = path.read_bytes()
            with self.assertRaises(ValueError):
                airspace.build_mbtiles({'features': []}, str(path))
            self.assertEqual(path.read_bytes(), original)
            with patch.object(airspace, 'vt2pbf', side_effect=RuntimeError('Encoder failed')):
                with self.assertRaisesRegex(RuntimeError, 'Encoder failed'):
                    airspace.build_mbtiles(data, str(path))
            self.assertEqual(path.read_bytes(), original)
            self.assertEqual(list(Path(folder).glob('*.tmp')), [])

if __name__ == '__main__':
    unittest.main()
