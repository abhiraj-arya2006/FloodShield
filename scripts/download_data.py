"""Data acquisition instructions (not implemented).

CAMELS-IND and HydroRIVERS are MANUAL downloads. This script will later only
check that the expected files are in place; it does not download anything.

CAMELS-IND
    1. Open https://doi.org/10.5281/zenodo.14005378 (Zenodo record).
    2. Download ``CAMELS_IND_Catchments_Streamflow_Sufficient.zip`` and
       ``00_CAMELS_IND_Data_Description.pdf``.
    3. Read the licence on the Zenodo record (academic/research use).
    4. Unzip into ``data/raw/camels_ind/`` and keep the PDF alongside it.
    5. Use the PDF to confirm units, file layout and the CWC basin-code
       prefixes for Godavari and Mahanadi.

HydroRIVERS
    1. Open https://www.hydrosheds.org/products/hydrorivers.
    2. Accept the HydroSHEDS licence terms and download the shapefile product
       covering India (regional Asia or global; decide after inspection).
    3. Unzip into ``data/raw/hydrorivers/``.

Open-Meteo archive weather is fetched separately by
``scripts/fetch_open_meteo_archive.py``.
"""


def main() -> None:
    # TODO: verify expected files exist under data/raw/ and report what is missing.
    raise NotImplementedError("download_data.py is not implemented yet")


if __name__ == "__main__":
    main()
