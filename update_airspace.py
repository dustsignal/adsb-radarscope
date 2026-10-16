#!/usr/bin/env python3
# Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
# File rev: update-airspace @ r4 (2026-10-16)
#
# update_airspace.py — Offline airspace data generator (run manually or by build.py).
#
# Regenerates public/data/class_airspace.mbtiles, the tileset the radar uses to draw
# Class B/C/D/E boundaries. It downloads controlled-airspace polygons from the public
# FAA ArcGIS Feature Server, slices them into Mapbox vector tiles, and writes them to a
# SQLite .mbtiles file (the format airspace.worker.ts reads at runtime).
#
# Usage:  python update_airspace.py
# Requires Python 3 and internet access; missing deps (requests, geojson2vt, vt2pbf)
# are auto-installed via pip on first run. Re-run whenever you want to refresh airspace
# boundaries, then redeploy so the new .mbtiles ships with the app.
import os
import sys
import gzip
import sqlite3
import subprocess
import time
import tempfile
import shutil
import re
from contextlib import closing

# Ensure we can run pip to install required dependencies
def install_dependencies():
    required_packages = ["requests", "geojson2vt", "vt2pbf"]
    missing_packages = []

    for pkg in required_packages:
        try:
            __import__(pkg)
        except ImportError:
            missing_packages.append(pkg)

    if missing_packages:
        print(f"Installing missing dependencies: {', '.join(missing_packages)}...")
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", *missing_packages], check=True)
            print("Dependencies installed successfully.")
        except Exception as e:
            print(f"Error installing dependencies: {e}")
            sys.exit(1)

if __name__ == '__main__':
    install_dependencies()

import requests
from geojson2vt.geojson2vt import geojson2vt
from vt2pbf import vt2pbf

# FAA Controlled Airspace Feature Server URL (Class B, C, D, E boundaries)
FAA_API_URL = "https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0/query"

# Space every request (including count queries and retries) after the prior
# response. ArcGIS charges request units, so this is not a quota guarantee.
FAA_REQUEST_INTERVAL = 3.0
FAA_MAX_INTERVAL = 15.0
FAA_MAX_QUOTA_RETRIES = 10
_next_faa_request = 0.0
_faa_interval = FAA_REQUEST_INTERVAL


def request_faa(params, validate):
    """Pace downloads and handle HTTP or JSON quota errors without losing pages."""
    global _next_faa_request, _faa_interval
    failures = 0
    quota_retries = 0
    last_error = None
    while failures < 5:
        wait = max(0, _next_faa_request - time.monotonic())
        if wait:
            time.sleep(wait)
        retry_delay = 3 * (failures + 1)
        rate_limited = False
        try:
            response = requests.get(FAA_API_URL, params=params, timeout=60)
            rate_limited = response.status_code == 429
            retry_header = response.headers.get("Retry-After", "")
            if isinstance(retry_header, str) and retry_header.isdigit():
                retry_delay = max(retry_delay, int(retry_header) + 1)
            if rate_limited:
                retry_delay = max(retry_delay, 65)
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                raise ValueError("FAA returned a non-object response")
            if data.get("error"):
                error = data["error"]
                if isinstance(error, dict) and error.get("code") == 429:
                    rate_limited = True
                    match = re.search(r"retry after\s+(\d+)\s*sec", str(error), re.I)
                    retry_delay = max(retry_delay, int(match.group(1)) + 1 if match else 65)
                raise ValueError(f"FAA ArcGIS error: {error}")
            validate(data)
            return data
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if rate_limited:
                quota_retries += 1
                _faa_interval = min(FAA_MAX_INTERVAL, _faa_interval * 2)
                if quota_retries > FAA_MAX_QUOTA_RETRIES:
                    raise RuntimeError("FAA quota remained unavailable after 10 cooldown retries; existing databases were preserved") from exc
                # Respect the service's cooldown, with additional backoff when
                # consecutive cooldowns still encounter a busy service.
                retry_delay = max(retry_delay, min(300, 61 * quota_retries))
                print(f"    FAA quota reached; pausing {retry_delay} seconds, then retrying this page "
                      f"({quota_retries}/{FAA_MAX_QUOTA_RETRIES}). Request spacing is now {_faa_interval:g} seconds.", flush=True)
            else:
                failures += 1
                print(f"    Warning: attempt {failures}/5: {exc}", flush=True)
                if failures == 5:
                    break
                print(f"    Retrying in {retry_delay} seconds...", flush=True)
            time.sleep(retry_delay)
        finally:
            _next_faa_request = time.monotonic() + _faa_interval
    raise RuntimeError(f"FAA request failed after 5 attempts: {last_error}") from last_error


def download_faa_airspaces():
    global _faa_interval
    _faa_interval = FAA_REQUEST_INTERVAL
    print("Fetching controlled airspace boundaries from FAA database...", flush=True)
    print(f"  Rate limit: at least {FAA_REQUEST_INTERVAL:g} seconds between requests; automatic cooldown on FAA quota limits.", flush=True)
    def validate_count(data):
        count = data.get("count")
        if type(count) is not int or count <= 0:
            raise ValueError(f"FAA returned an invalid or empty feature count: {count!r}")
    expected = request_faa({"where": "1=1", "returnCountOnly": "true", "f": "json"}, validate_count)["count"]
    print(f"  FAA reports {expected} features.", flush=True)
    features = []
    seen_ids = set()
    limit = 100
    while len(features) < expected:
        offset = len(features)
        params = {
            "where": "1=1",
            "outFields": "OBJECTID,NAME,CLASS,LOWER_VAL,LOWER_CODE,UPPER_VAL,UPPER_CODE",
            "f": "geojson", "outSR": 4326,
            "orderByFields": "OBJECTID ASC",
            "resultRecordCount": min(limit, expected - offset),
            "resultOffset": offset,
        }
        def validate_page(data):
            batch = data.get("features")
            if data.get("type") != "FeatureCollection" or not isinstance(batch, list) or not batch:
                raise ValueError(f"FAA returned no valid features at offset {offset}; expected {expected} total")
            ids = []
            for feature in batch:
                if not isinstance(feature, dict) or feature.get("type") != "Feature":
                    raise ValueError("FAA returned a malformed feature")
                props = feature.get("properties") or {}
                ident = props.get("OBJECTID", feature.get("id"))
                if type(ident) is not int:
                    raise ValueError("FAA feature is missing its numeric OBJECTID")
                ids.append(ident)
            if len(set(ids)) != len(ids) or seen_ids.intersection(ids):
                raise ValueError("FAA pagination returned duplicate features")
            if offset + len(batch) > expected:
                raise ValueError("FAA feature count changed during download; retry the download")
        print(f"  Downloading features {offset} to {min(offset + limit, expected)}...", flush=True)
        batch = request_faa(params, validate_page)["features"]
        features.extend(batch)
        seen_ids.update((f.get("properties") or {}).get("OBJECTID", f.get("id")) for f in batch)
        print(f"    Fetched {len(batch)} features (Total: {len(features)}/{expected})", flush=True)
    return features


def process_and_clean_features(features):
    cleaned_features = []

    for feat in features:
        props = feat.get("properties", {})
        geom = feat.get("geometry")

        if not geom:
            continue

        # Clean airspace classification
        airspace_class = props.get("CLASS", "Special")
        # Standardize B, C, D, E to Class B, Class C, etc.
        if airspace_class in ["B", "C", "D", "E"]:
            airspace_class = f"Class {airspace_class}"

        # Formulate upper and lower limit strings for both formats supported by the worker
        lower_val = props.get("LOWER_VAL")
        lower_code = props.get("LOWER_CODE") or ""
        if lower_val is not None:
            try:
                val_int = int(lower_val)
                if val_int == 0 or lower_code.upper() == "SFC":
                    lower_limit = "SFC"
                else:
                    lower_limit = f"{val_int} {lower_code}".strip()
            except ValueError:
                lower_limit = str(lower_val)
        else:
            lower_limit = "SFC"

        upper_val = props.get("UPPER_VAL")
        upper_code = props.get("UPPER_CODE") or ""
        if upper_val is not None:
            try:
                upper_limit = f"{int(upper_val)} {upper_code}".strip()
            except ValueError:
                upper_limit = str(upper_val)
        else:
            upper_limit = "Unknown"

        new_props = {
            "name": props.get("NAME") or "Unnamed Airspace",
            "class": airspace_class,
            "lower_limit": lower_limit,
            "floor": lower_limit,
            "upper_limit": upper_limit,
            "ceiling": upper_limit
        }

        cleaned_features.append({
            "type": "Feature",
            "geometry": geom,
            "properties": new_props
        })

    return {
        "type": "FeatureCollection",
        "features": cleaned_features
    }

def _write_mbtiles(geojson_data, output_path):
    print("Generating vector tile index (zoom 4 to 9)...")
    # Using geojson2vt to build the spatial tile index
    # We pre-generate up to zoom level 9 (which is the maximum used by rangeToZoom)
    tile_index = geojson2vt(geojson_data, {
        "maxZoom": 9,
        "indexMaxZoom": 9,
        "indexMaxPoints": 0,
        "tolerance": 3,
        "extent": 4096,
        "buffer": 64
    })

    print(f"Creating MBTiles SQLite database at {output_path}...")
    # Setup directories if needed
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    conn = sqlite3.connect(output_path)
    try:
        cursor = conn.cursor()

        # Initialize MBTiles schema
        cursor.execute("CREATE TABLE metadata (name text, value text);")
        cursor.execute("CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);")
        cursor.execute("CREATE UNIQUE INDEX tile_index on tiles (zoom_level, tile_column, tile_row);")

        # Insert metadata
        metadata = [
            ("name", "class_airspace"),
            ("format", "pbf"),
            ("bounds", "-180.0,-90.0,180.0,90.0"),
            ("center", "0.0,0.0,4"),
            ("minzoom", "4"),
            ("maxzoom", "9"),
            ("json", '{"vector_layers": [{"id": "airspaces", "description": "FAA Controlled Airspace", "minzoom": 4, "maxzoom": 9}]}')
        ]
        cursor.executemany("INSERT INTO metadata VALUES (?, ?)", metadata)

        print("Encoding and compressing vector tiles...")
        tile_coords = tile_index.tile_coords
        total_tiles = len([c for c in tile_coords if 4 <= c['z'] <= 9])
        print(f"Found {total_tiles} tiles to encode.")

        encoded_count = 0
        for coord in tile_coords:
            z = coord["z"]
            x = coord["x"]
            y = coord["y"]

            # Only compile zoom levels 4 to 9 needed by the UI
            if z < 4 or z > 9:
                continue

            tile = tile_index.get_tile(z, x, y)
            if not tile:
                continue

            # Encode to Mapbox Vector Tile format (PBF) under layer name 'airspaces'
            pbf_data = vt2pbf(tile, "airspaces")
            # Gzip compress the PBF tile (mbtiles vector tiles spec requires gzip)
            gzipped_data = gzip.compress(pbf_data)

            # Slippy Y tile to TMS tile row conversion (required for MBTiles standard)
            tms_row = (2 ** z) - 1 - y

            cursor.execute(
                "INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)",
                (z, x, tms_row, sqlite3.Binary(gzipped_data))
            )
            encoded_count += 1
            if encoded_count % 100 == 0:
                print(f"  Encoded {encoded_count}/{total_tiles} tiles...")

        if encoded_count == 0:
            raise RuntimeError("No airspace tiles were generated; existing databases were preserved")
        conn.commit()

    finally:
        conn.close()

    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"Successfully generated MBTiles! Total tiles: {encoded_count}, File size: {file_size_mb:.2f} MB")

def build_mbtiles(geojson_data, output_path):
    """Publish only a complete, nonempty database; failed builds preserve the old file."""
    if not geojson_data.get("features"):
        raise ValueError("FAA supplied no usable airspace polygons; existing databases were preserved")
    output_path = os.path.abspath(output_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".airspace-", suffix=".tmp", dir=os.path.dirname(output_path))
    os.close(fd)
    try:
        _write_mbtiles(geojson_data, temporary)
        with closing(sqlite3.connect(temporary)) as conn:
            if conn.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise RuntimeError("Generated airspace database failed SQLite integrity validation")
            tile = conn.execute("SELECT tile_data FROM tiles LIMIT 1").fetchone()
            if tile is None or not gzip.decompress(tile[0]):
                raise RuntimeError("Generated airspace database contains no valid vector tiles")
        os.replace(temporary, output_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def publish_copy(source, destination):
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".airspace-", suffix=".tmp", dir=os.path.dirname(destination))
    os.close(fd)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, destination)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main():
    # Make paths relative to this source checkout.
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(script_dir, "data", "class_airspace.mbtiles")

    features = download_faa_airspaces()
    geojson_data = process_and_clean_features(features)
    build_mbtiles(geojson_data, output_path)

    # Proactively copy the built file to public/data and dist/data if they exist
    public_path = os.path.join(script_dir, "public", "data", "class_airspace.mbtiles")
    dist_path = os.path.join(script_dir, "dist", "data", "class_airspace.mbtiles")

    for dest in [public_path, dist_path]:
        try:
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            publish_copy(output_path, dest)
            print(f"Copied MBTiles to: {dest}")
        except Exception as e:
            if dest == public_path:
                raise RuntimeError(f"Could not publish airspace database to {dest}: {e}") from e
            print(f"Note: Could not copy to {dest}: {e}")

    from airspace_tiles import export_airspace_tiles
    export_airspace_tiles(public_path, os.path.join(script_dir, 'public', 'data', 'airspace'))
    print("Database update complete! Viewport tiles are ready.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Airspace update failed: {exc}", file=sys.stderr)
        sys.exit(1)
