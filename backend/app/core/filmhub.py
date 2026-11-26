import csv
import io
import re
from datetime import date, datetime, time, timedelta, timezone
from pathlib import PurePosixPath
from zoneinfo import ZoneInfo


def split_values(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


def safe_filename(value: str) -> str:
    path = PurePosixPath(value)
    if not value or path.is_absolute() or "\\" in value or any(part in {".", ".."} for part in value.split("/")):
        raise ValueError(f"Invalid delivery filename: {value!r}")
    return str(path)


def availability_date(value: str, *, end: bool, timezone_name: str) -> datetime | None:
    value = value.strip()
    if value.lower() == "open":
        return None
    if not value:
        raise ValueError("Availability dates must be explicit dates or 'open'")
    boundary = date.fromisoformat(value)
    if end:
        boundary += timedelta(days=1)
    return datetime.combine(boundary, time.min, ZoneInfo(timezone_name)).astimezone(timezone.utc)


def parse_filmhub(raw: bytes, *, timezone_name: str, max_rows: int = 10000) -> list[dict]:
    reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""))
    required = {"Program Type", "Movie/Show Filmhub SKU", "Movie/Show Title", "Avail Type(s)", "Avail Start", "Avail End"}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError("Not a supported Filmhub Movies & Shows CSV")
    groups: dict[tuple[str, str], dict] = {}
    for row_number, row in enumerate(reader, 2):
        if row_number > max_rows + 1:
            raise ValueError("Metadata CSV exceeds row limit")
        overflow = row.pop(None, [])
        if any(value.strip() for value in overflow) or any(value is None for value in row.values()):
            raise ValueError(f"Malformed CSV row {row_number}")
        row = {key: value.strip() for key, value in row.items()}
        program = row["Program Type"].lower()
        if program not in {"movie", "show"}:
            raise ValueError(f"Unsupported Program Type on row {row_number}")
        series_sku = row["Movie/Show Filmhub SKU"]
        sku = row.get("Episode SKU", "") if program == "show" else series_sku
        if not sku or not series_sku or len(sku) > 255 or not row["Movie/Show Title"]:
            raise ValueError(f"Missing or invalid title identity on row {row_number}")
        kind = "episode" if program == "show" else "movie"
        if kind == "episode":
            for column in ("Season Number", "Episode Number"):
                if not row.get(column, "").isdigit() or int(row[column]) < 1:
                    raise ValueError(f"Invalid {column} on row {row_number}")
            if not row.get("Episode Name"):
                raise ValueError(f"Missing episode name on row {row_number}")
        filename = safe_filename(row.get("Episode Filename" if kind == "episode" else "Movie Filename", ""))
        key = (kind, sku)
        if key not in groups:
            groups[key] = {"kind": kind, "sku": sku, "series_sku": series_sku, "filename": filename, "row": row, "licenses": []}
        group = groups[key]
        identity_columns = ["Movie/Show Filmhub SKU", "Movie/Show Title", "Episode Name", "Season Number", "Episode Number"]
        if group["filename"] != filename or any(group["row"].get(column) != row.get(column) for column in identity_columns):
            raise ValueError(f"Conflicting metadata for SKU {sku}")
        starts = availability_date(row["Avail Start"], end=False, timezone_name=timezone_name)
        ends = availability_date(row["Avail End"], end=True, timezone_name=timezone_name)
        if starts and ends and ends <= starts:
            raise ValueError(f"Invalid license window for {sku}")
        countries = {}
        for column, target in (("Avail Countries Included", "included_countries"), ("Avail Countries Excluded", "excluded_countries")):
            values = [value.upper() for value in split_values(row.get(column, ""))]
            if any(not re.fullmatch(r"[A-Z]{2}", value) for value in values):
                raise ValueError(f"Invalid country code for {sku}")
            countries[target] = sorted(set(values))
        types = split_values(row["Avail Type(s)"].lower())
        if not types or any(value not in {"svod", "avod", "tvod"} for value in types):
            raise ValueError(f"Unsupported availability type for {sku}")
        for license_type in types:
            license_row = {"license_type": license_type, "starts_at": starts, "ends_at": ends, **countries}
            if license_row not in group["licenses"]:
                group["licenses"].append(license_row)
    if not groups:
        raise ValueError("Metadata CSV contains no titles")
    return list(groups.values())


def caption_entries(group: dict) -> list[dict]:
    row = group["row"]
    episode = group["kind"] == "episode"
    prefix = "Episode" if episode else "Movie"
    files = split_values(row.get(f"{prefix} Subtitles/Captions Filenames", ""))
    languages = split_values(row.get(f"{prefix} Subtitles/Captions Languages", ""))
    types = split_values(row.get(f"{prefix} Subtitles/Captions {'Type' if episode else 'Types'}", ""))
    if not (len(files) == len(languages) == len(types)):
        raise ValueError(f"Unaligned caption lists for {group['sku']}")
    tracks = []
    for filename, language, kind in zip(files, languages, types):
        if episode and f"_{group['sku']}_" not in filename:
            continue
        if kind not in {"subtitles", "sdh", "captions"}:
            raise ValueError(f"Unsupported caption type: {kind}")
        tracks.append({"source_filename": safe_filename(filename), "language": language, "kind": kind})
    return tracks