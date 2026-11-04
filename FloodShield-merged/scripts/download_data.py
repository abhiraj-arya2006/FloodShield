"""Download and unpack the file-based datasets into data/raw/ (re-runnable).

CAMELS-IND v2.2 (Zenodo record 14999580, CC BY 4.0, no login)
    - CAMELS_IND_Catchments_Streamflow_Sufficient.zip  (md5-verified)
    - 00_CAMELS_IND_Data_Description.pdf                (md5-verified)
    -> data/raw/camels_ind/

HydroRIVERS v1.0, Asia shapefile (HydroSHEDS licence; attribution required)
    - HydroRIVERS_v10_as_shp.zip
    -> data/raw/hydrorivers/
    No checksum is published, so it is verified by size (HTTP Content-Length)
    and zip integrity. If the download fails, manual instructions are printed.

Files that are already present and verified are skipped. Partial downloads are
resumed with HTTP Range requests. Archives are extracted once; a marker file
(``.<archive>.extracted``) records a completed extraction.

Weather inputs come from the CAMELS-IND forcings in the same zip (Open-Meteo is not used).

Usage:
    python scripts/download_data.py [--data-dir ./data] [--skip-hydrorivers] [--no-extract]
"""

import argparse
import hashlib
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path

import requests

CAMELS_BASE = "https://zenodo.org/records/14999580/files"
HYDRORIVERS_PAGE = "https://www.hydrosheds.org/products/hydrorivers"
HYDRORIVERS_URL = "https://data.hydrosheds.org/file/HydroRIVERS/HydroRIVERS_v10_as_shp.zip"

CHUNK = 1 << 20  # 1 MiB
TIMEOUT = (30, 120)  # connect, read seconds


@dataclass
class RemoteFile:
    name: str
    url: str
    subdir: str
    md5: str | None = None
    extract: bool = False


CAMELS_FILES = [
    RemoteFile(
        name="CAMELS_IND_Catchments_Streamflow_Sufficient.zip",
        url=f"{CAMELS_BASE}/CAMELS_IND_Catchments_Streamflow_Sufficient.zip?download=1",
        subdir="camels_ind",
        md5="3993c25ba7d7b86df0541de91e094f39",
        extract=True,
    ),
    RemoteFile(
        name="00_CAMELS_IND_Data_Description.pdf",
        url=f"{CAMELS_BASE}/00_CAMELS_IND_Data_Description.pdf?download=1",
        subdir="camels_ind",
        md5="19cf924c9a0a5417163ba773432ac274",
    ),
]

HYDRORIVERS_FILE = RemoteFile(
    name="HydroRIVERS_v10_as_shp.zip",
    url=HYDRORIVERS_URL,
    subdir="hydrorivers",
    extract=True,
)

HYDRORIVERS_MANUAL = f"""
HydroRIVERS could not be downloaded automatically. Manual steps:
  1. Open {HYDRORIVERS_PAGE}
  2. Scroll to "Data download" and, in the Asia row, click "Download" in the
     Shapefile column (file: HydroRIVERS_v10_as_shp.zip, about 86 MB).
     Downloading means accepting the HydroSHEDS licence (see the page).
  3. Save it as data/raw/hydrorivers/HydroRIVERS_v10_as_shp.zip
  4. Re-run this script to verify and extract it.
"""


class DownloadError(Exception):
    pass


def md5sum(path: Path) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(CHUNK), b""):
            h.update(block)
    return h.hexdigest()


def remote_size(url: str) -> int | None:
    r = requests.head(url, allow_redirects=True, timeout=TIMEOUT)
    r.raise_for_status()
    size = r.headers.get("Content-Length")
    return int(size) if size is not None else None


def download(url: str, dest: Path) -> None:
    """Download url to dest, resuming a partial file via a Range request."""
    part = dest.with_name(dest.name + ".part")
    offset = part.stat().st_size if part.exists() else 0
    headers = {"Range": f"bytes={offset}-"} if offset else {}

    with requests.get(url, headers=headers, stream=True, timeout=TIMEOUT) as r:
        if r.status_code == 416:  # requested range beyond end: .part is already complete
            part.replace(dest)
            return
        r.raise_for_status()
        if offset and r.status_code != 206:  # server ignored Range; start over
            offset = 0
        total = int(r.headers.get("Content-Length", 0)) + offset
        mode = "ab" if offset else "wb"
        print(f"  downloading {dest.name} ({total / 1e6:.1f} MB, resuming at {offset / 1e6:.1f} MB)"
              if offset else f"  downloading {dest.name} ({total / 1e6:.1f} MB)")
        done = offset
        with part.open(mode) as f:
            for block in r.iter_content(CHUNK):
                f.write(block)
                done += len(block)
                if total:
                    print(f"\r  {done / 1e6:8.1f} / {total / 1e6:.1f} MB", end="", flush=True)
        print()
    part.replace(dest)


def verify(rf: RemoteFile, path: Path, expected_size: int | None) -> None:
    if rf.md5 is not None:
        actual = md5sum(path)
        if actual != rf.md5:
            raise DownloadError(
                f"md5 mismatch for {path}: expected {rf.md5}, got {actual}. "
                "Delete the file and re-run if you want to retry."
            )
        print(f"  md5 OK ({actual})")
    if expected_size is not None and path.stat().st_size != expected_size:
        raise DownloadError(
            f"size mismatch for {path}: expected {expected_size} bytes, "
            f"got {path.stat().st_size}"
        )
    if path.suffix == ".zip":
        with zipfile.ZipFile(path) as zf:
            bad = zf.testzip()
        if bad is not None:
            raise DownloadError(f"corrupt member {bad!r} in {path}")
        print("  zip integrity OK")


def safe_extract(archive: Path, target: Path) -> None:
    """Extract archive into target, refusing members that escape target."""
    marker = target / f".{archive.name}.extracted"
    if marker.exists():
        print(f"  already extracted ({marker.name} present), skipping")
        return
    root = target.resolve()
    with zipfile.ZipFile(archive) as zf:
        for member in zf.infolist():
            out = (target / member.filename).resolve()
            if root not in out.parents and out != root:
                raise DownloadError(f"unsafe path in {archive.name}: {member.filename}")
        zf.extractall(target)
        count = len(zf.infolist())
    marker.write_text(f"{count} members extracted\n")
    print(f"  extracted {count} members into {target}")


def fetch(rf: RemoteFile, raw_dir: Path, extract: bool, check_remote_size: bool) -> None:
    target = raw_dir / rf.subdir
    target.mkdir(parents=True, exist_ok=True)
    dest = target / rf.name
    print(f"[{rf.subdir}] {rf.name}")

    expected_size = None
    if check_remote_size:
        try:
            expected_size = remote_size(rf.url)
        except requests.RequestException as e:
            if not dest.exists():
                raise
            print(f"  WARNING: could not query remote size ({e}); checking zip integrity only")
    if dest.exists():
        print("  present, verifying")
    else:
        download(rf.url, dest)
    verify(rf, dest, expected_size)

    if extract and rf.extract:
        safe_extract(dest, target)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=Path("data"))
    parser.add_argument("--skip-hydrorivers", action="store_true")
    parser.add_argument("--no-extract", action="store_true")
    args = parser.parse_args()
    raw_dir = args.data_dir / "raw"
    extract = not args.no_extract

    try:
        for rf in CAMELS_FILES:
            # md5 is authoritative for CAMELS-IND; no size check needed.
            fetch(rf, raw_dir, extract, check_remote_size=False)
    except (DownloadError, requests.RequestException) as e:
        print(f"ERROR (CAMELS-IND): {e}", file=sys.stderr)
        return 1

    if args.skip_hydrorivers:
        print("[hydrorivers] skipped (--skip-hydrorivers)")
        return 0
    try:
        fetch(HYDRORIVERS_FILE, raw_dir, extract, check_remote_size=True)
    except DownloadError as e:
        print(f"ERROR (HydroRIVERS): {e}", file=sys.stderr)
        return 1
    except requests.RequestException as e:
        print(f"ERROR (HydroRIVERS): {e}", file=sys.stderr)
        print(HYDRORIVERS_MANUAL, file=sys.stderr)
        return 1

    print("All file-based datasets present and verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
