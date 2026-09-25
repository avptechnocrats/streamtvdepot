"""
EPG (Electronic Program Guide) — Admin API
==========================================
Manages scheduled program entries for live TV channels (RTMP / SRT sources).

Endpoints
---------
GET    /epg/channels                              List RTMP/SRT channels for EPG management
GET    /epg/{channel_id}/programs                 List programs (optionally filtered by date)
POST   /epg/{channel_id}/programs                 Create a single program
PUT    /epg/programs/{program_id}                 Update a program
DELETE /epg/programs/{program_id}                 Delete a program
POST   /epg/{channel_id}/programs/reorder         Bulk sort-order update (drag-drop)
POST   /epg/{channel_id}/import                   Import programs from an XMLTV feed (XML upload)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from io import BytesIO
from typing import Annotated
from xml.etree import ElementTree as ET

from fastapi import APIRouter, Body, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.client.content import EPGProgram, LiveStream, Video
from app.schemas.client.content import (
    EPGImportResult,
    EPGProgramCreate,
    EPGProgramOut,
    EPGProgramUpdate,
    EPGReorderItem,
    EPGScheduleSave,
)

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _calc_end_time(start: datetime, duration_minutes: int) -> datetime:
    """Return end_time = start_time + duration, always UTC-aware."""
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return start + timedelta(minutes=duration_minutes)


async def _get_channel_or_404(
    channel_id: uuid.UUID,
    client_id: uuid.UUID,
    db: AsyncSession,
) -> LiveStream:
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.id == channel_id,
            LiveStream.client_id == client_id,
        )
    )
    channel = result.scalar_one_or_none()
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    return channel


async def _get_program_or_404(
    program_id: uuid.UUID,
    client_id: uuid.UUID,
    db: AsyncSession,
) -> EPGProgram:
    result = await db.execute(
        select(EPGProgram).where(
            EPGProgram.id == program_id,
            EPGProgram.client_id == client_id,
        )
    )
    program = result.scalar_one_or_none()
    if program is None:
        raise HTTPException(status_code=404, detail="EPG program not found")
    return program


async def _resolve_video_id_or_422(
    video_id: uuid.UUID | None,
    client_id: uuid.UUID,
    db: AsyncSession,
) -> uuid.UUID | None:
    """Validate an optional video_id belongs to the same client and is active."""
    if video_id is None:
        return None

    result = await db.execute(
        select(Video.id).where(
            Video.id == video_id,
            Video.client_id == client_id,
            Video.deleted_at.is_(None),
            Video.is_active.is_(True),
        )
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=422, detail="Invalid or inactive video_id in EPG program")
    return video_id


# ─── XMLTV parser ─────────────────────────────────────────────────────────────

_XMLTV_DT_FORMATS = [
    "%Y%m%d%H%M%S %z",   # 20260501120000 +0000
    "%Y%m%d%H%M%S%z",    # 20260501120000+0000
    "%Y%m%d%H%M%S",      # 20260501120000  (assume UTC)
]


def _parse_xmltv_dt(value: str) -> datetime | None:
    """Parse an XMLTV datetime string to a UTC-aware datetime."""
    value = value.strip()
    for fmt in _XMLTV_DT_FORMATS:
        try:
            dt = datetime.strptime(value, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        except ValueError:
            continue
    return None


def _parse_xmltv(xml_bytes: bytes) -> list[dict]:
    """
    Parse an XMLTV XML document and return a list of programme dicts.

    Each dict has: title, description, category, rating, start_time, end_time,
    duration_minutes, channel_xmltv_id.
    """
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid XML: {exc}") from exc

    programmes: list[dict] = []
    for prog in root.iter("programme"):
        start_raw = prog.get("start", "")
        stop_raw = prog.get("stop", "")
        xmltv_channel_id = prog.get("channel", "")

        start = _parse_xmltv_dt(start_raw)
        stop = _parse_xmltv_dt(stop_raw)
        if start is None or stop is None:
            continue
        if stop <= start:
            continue

        duration_minutes = max(1, int((stop - start).total_seconds() / 60))

        title_el = prog.find("title")
        title = (title_el.text or "").strip() if title_el is not None else ""
        if not title:
            continue

        desc_el = prog.find("desc")
        description = (desc_el.text or "").strip() if desc_el is not None else None

        cat_el = prog.find("category")
        category = (cat_el.text or "").strip() if cat_el is not None else None

        rating_el = prog.find("rating/value")
        rating = (rating_el.text or "").strip() if rating_el is not None else None

        programmes.append({
            "title": title,
            "description": description or None,
            "category": category or None,
            "rating": rating or None,
            "start_time": start,
            "end_time": stop,
            "duration_minutes": duration_minutes,
            "channel_xmltv_id": xmltv_channel_id,
        })

    return programmes


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/channels", response_model=list[dict])
async def list_epg_channels(
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Return all RTMP and SRT channels that can have an EPG schedule."""
    result = await db.execute(
        select(LiveStream).where(
            LiveStream.client_id == admin._client_id,
            LiveStream.source.in_(["rtmp", "srt"]),
        ).order_by(LiveStream.title)
    )
    channels = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "title": c.title,
            "slug": c.slug,
            "source": c.source,
            "is_live": c.is_live,
            "stream_status": c.stream_status,
            "thumbnails": c.thumbnails,
        }
        for c in channels
    ]


@router.get("/{channel_id}/programs", response_model=list[EPGProgramOut])
async def list_programs(
    channel_id: uuid.UUID,
    date: str | None = Query(None, description="Filter by date (YYYY-MM-DD). Omit to return all programs."),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Return EPG programs for a channel, optionally filtered to a single day."""
    await _get_channel_or_404(channel_id, admin._client_id, db)

    q = select(EPGProgram).where(
        EPGProgram.channel_id == channel_id,
        EPGProgram.client_id == admin._client_id,
    )

    if date:
        try:
            day = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="date must be YYYY-MM-DD") from exc
        next_day = day + timedelta(days=1)
        # Programs that overlap with the requested day
        q = q.where(EPGProgram.start_time < next_day, EPGProgram.end_time > day)

    q = q.order_by(EPGProgram.start_time, EPGProgram.sort_order)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/{channel_id}/programs", response_model=EPGProgramOut, status_code=status.HTTP_201_CREATED)
async def create_program(
    channel_id: uuid.UUID,
    payload: EPGProgramCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Create a new EPG program entry. end_time is auto-calculated from start_time + duration_minutes."""
    await _get_channel_or_404(channel_id, admin._client_id, db)

    end_time = _calc_end_time(payload.start_time, payload.duration_minutes)

    resolved_video_id = await _resolve_video_id_or_422(payload.video_id, admin._client_id, db)

    program = EPGProgram(
        client_id=admin._client_id,
        channel_id=channel_id,
        video_id=resolved_video_id,
        title=payload.title,
        description=payload.description,
        start_time=payload.start_time,
        end_time=end_time,
        duration_minutes=payload.duration_minutes,
        category=payload.category,
        rating=payload.rating,
        thumbnail_url=payload.thumbnail_url,
        sort_order=payload.sort_order,
    )
    db.add(program)
    await db.commit()
    await db.refresh(program)
    return program


@router.put("/programs/{program_id}", response_model=EPGProgramOut)
async def update_program(
    program_id: uuid.UUID,
    payload: EPGProgramUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """Update a program. Re-calculates end_time whenever start_time or duration_minutes changes."""
    program = await _get_program_or_404(program_id, admin._client_id, db)

    data = payload.model_dump(exclude_unset=True)
    if "video_id" in data:
        data["video_id"] = await _resolve_video_id_or_422(data["video_id"], admin._client_id, db)
    for field, value in data.items():
        setattr(program, field, value)

    # Re-calculate end_time after any time/duration change
    program.end_time = _calc_end_time(program.start_time, program.duration_minutes)

    await db.commit()
    await db.refresh(program)
    return program


@router.delete("/programs/{program_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_program(
    program_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    program = await _get_program_or_404(program_id, admin._client_id, db)
    await db.delete(program)
    await db.commit()


@router.post("/{channel_id}/programs/reorder", response_model=list[EPGProgramOut])
async def reorder_programs(
    channel_id: uuid.UUID,
    items: Annotated[list[EPGReorderItem], Body()],
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """
    Bulk update sort_order for drag-drop reordering.

    Also recalculates start_time / end_time to be contiguous based on the new order:
    each program's start_time becomes the previous program's end_time.
    """
    await _get_channel_or_404(channel_id, admin._client_id, db)

    # Fetch all programs for this channel ordered by the incoming sort_order
    ids_in_order = [item.id for item in sorted(items, key=lambda x: x.sort_order)]
    result = await db.execute(
        select(EPGProgram).where(
            EPGProgram.channel_id == channel_id,
            EPGProgram.client_id == admin._client_id,
            EPGProgram.id.in_(ids_in_order),
        )
    )
    programs_by_id: dict[uuid.UUID, EPGProgram] = {p.id: p for p in result.scalars().all()}

    # Apply new sort_orders; chain start/end times sequentially
    current_time: datetime | None = None
    updated: list[EPGProgram] = []

    for item in sorted(items, key=lambda x: x.sort_order):
        prog = programs_by_id.get(item.id)
        if prog is None:
            continue
        prog.sort_order = item.sort_order

        if current_time is None:
            # Keep the first program's start_time as anchor
            current_time = prog.start_time
            if current_time.tzinfo is None:
                current_time = current_time.replace(tzinfo=timezone.utc)
        else:
            prog.start_time = current_time

        prog.end_time = _calc_end_time(prog.start_time, prog.duration_minutes)
        current_time = prog.end_time
        updated.append(prog)

    await db.commit()
    for prog in updated:
        await db.refresh(prog)

    return updated


@router.post("/{channel_id}/import", response_model=EPGImportResult, status_code=status.HTTP_200_OK)
async def import_xmltv(
    channel_id: uuid.UUID,
    file: UploadFile = File(..., description="XMLTV-format XML file"),
    replace: bool = Query(False, description="When true, delete all existing programs for this channel before importing"),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """
    Import EPG programs from an XMLTV XML file.

    - Parses <programme> elements from the XML.
    - If replace=true, clears existing programs first.
    - Imports all valid programmes regardless of the XMLTV channel id attribute
      (since you selected the target channel explicitly in the UI).
    """
    await _get_channel_or_404(channel_id, admin._client_id, db)

    # Validate content-type loosely
    if file.content_type and "xml" not in file.content_type and "text" not in file.content_type:
        raise HTTPException(status_code=422, detail="File must be an XML document")

    xml_bytes = await file.read()
    if len(xml_bytes) > 10 * 1024 * 1024:  # 10 MB limit
        raise HTTPException(status_code=413, detail="File too large (max 10 MB)")

    programmes = _parse_xmltv(xml_bytes)

    if replace:
        await db.execute(
            delete(EPGProgram).where(
                EPGProgram.channel_id == channel_id,
                EPGProgram.client_id == admin._client_id,
            )
        )

    imported = 0
    errors: list[str] = []
    for idx, prog in enumerate(programmes):
        try:
            db.add(EPGProgram(
                client_id=admin._client_id,
                channel_id=channel_id,
                video_id=None,
                title=prog["title"],
                description=prog["description"],
                start_time=prog["start_time"],
                end_time=prog["end_time"],
                duration_minutes=prog["duration_minutes"],
                category=prog["category"],
                rating=prog["rating"],
                thumbnail_url=None,
                sort_order=idx,
            ))
            imported += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Row {idx + 1}: {exc}")

    await db.commit()
    return EPGImportResult(imported=imported, skipped=len(programmes) - imported, errors=errors)


@router.post("/{channel_id}/schedule", response_model=list[EPGProgramOut], status_code=status.HTTP_200_OK)
async def save_schedule(
    channel_id: uuid.UUID,
    payload: EPGScheduleSave,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    """
    Batch-save an entire schedule block for a channel.

    - Deletes all existing programs for the channel on the same calendar date as ``schedule_start``.
    - Creates all programs sequentially, each starting immediately after the previous ends.
    - Returns the saved programs in order.
    """
    await _get_channel_or_404(channel_id, admin._client_id, db)

    start = payload.schedule_start
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)

    # Clear existing programs before re-inserting.
    #
    # Loop mode has a single global cycle that the public guide projects across
    # every day regardless of the stored dates, so a date-scoped delete would
    # leave stale programs from a previous save polluting the projection. Loop
    # therefore replaces the channel's ENTIRE program set. Schedule mode keeps
    # per-day semantics (saving one day must not wipe other days), so it only
    # clears programs overlapping the schedule_start's calendar date.
    delete_stmt = delete(EPGProgram).where(
        EPGProgram.channel_id == channel_id,
        EPGProgram.client_id == admin._client_id,
    )
    if payload.playout_mode != "loop":
        day_start = start.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        delete_stmt = delete_stmt.where(
            EPGProgram.start_time < day_end,
            EPGProgram.end_time > day_start,
        )
    await db.execute(delete_stmt)

    saved: list[EPGProgram] = []
    current_time = start
    for idx, item in enumerate(payload.programs):
        resolved_video_id = await _resolve_video_id_or_422(item.video_id, admin._client_id, db)
        end_time = _calc_end_time(current_time, item.duration_minutes)
        prog = EPGProgram(
            client_id=admin._client_id,
            channel_id=channel_id,
            video_id=resolved_video_id,
            title=item.title,
            description=item.description,
            start_time=current_time,
            end_time=end_time,
            duration_minutes=item.duration_minutes,
            category=item.category,
            rating=item.rating,
            thumbnail_url=item.thumbnail_url,
            sort_order=idx,
            playout_mode=payload.playout_mode,
        )
        db.add(prog)
        saved.append(prog)
        current_time = end_time

    await db.commit()
    for prog in saved:
        await db.refresh(prog)

    return saved
