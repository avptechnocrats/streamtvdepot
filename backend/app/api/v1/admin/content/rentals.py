import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_client_admin
from app.models.client.content import VideoRental
from app.schemas.client.content import VideoRentalCreate, VideoRentalOut, VideoRentalUpdate

router = APIRouter()


@router.get("", response_model=list[VideoRentalOut])
async def list_rentals(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(VideoRental)
        .where(VideoRental.client_id == admin._client_id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return result.scalars().all()


@router.post("", response_model=VideoRentalOut, status_code=status.HTTP_201_CREATED)
async def create_rental(
    payload: VideoRentalCreate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    rental = VideoRental(client_id=admin._client_id, **payload.model_dump())
    db.add(rental)
    await db.flush()
    await db.refresh(rental)
    return rental


@router.get("/{rental_id}", response_model=VideoRentalOut)
async def get_rental(
    rental_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(VideoRental).where(
            VideoRental.id == rental_id, VideoRental.client_id == admin._client_id
        )
    )
    rental = result.scalar_one_or_none()
    if not rental:
        raise HTTPException(status_code=404, detail="Rental not found")
    return rental


@router.patch("/{rental_id}", response_model=VideoRentalOut)
async def update_rental(
    rental_id: uuid.UUID,
    payload: VideoRentalUpdate,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(VideoRental).where(
            VideoRental.id == rental_id, VideoRental.client_id == admin._client_id
        )
    )
    rental = result.scalar_one_or_none()
    if not rental:
        raise HTTPException(status_code=404, detail="Rental not found")

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(rental, field, value)
    await db.flush()
    await db.refresh(rental)
    return rental


@router.delete("/{rental_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rental(
    rental_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    admin=Depends(get_current_client_admin),
):
    result = await db.execute(
        select(VideoRental).where(
            VideoRental.id == rental_id, VideoRental.client_id == admin._client_id
        )
    )
    rental = result.scalar_one_or_none()
    if not rental:
        raise HTTPException(status_code=404, detail="Rental not found")
    await db.delete(rental)
