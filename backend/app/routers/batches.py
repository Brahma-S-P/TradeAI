from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.batch import Batch

router = APIRouter(prefix="/api/batches", tags=["batches"])


class BatchCreate(BaseModel):
    name: str
    symbols: list[str]


class BatchUpdate(BaseModel):
    name: str | None = None
    symbols: list[str] | None = None


def _row_to_dict(b: Batch) -> dict:
    return {
        "id": b.id,
        "name": b.name,
        "symbols": [s.strip() for s in b.symbols.split(",") if s.strip()],
        "created_at": str(b.created_at) if b.created_at else None,
        "updated_at": str(b.updated_at) if b.updated_at else None,
    }


@router.get("")
async def list_batches(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Batch).order_by(Batch.updated_at.desc()))
    return [_row_to_dict(b) for b in result.scalars().all()]


@router.post("")
async def create_batch(body: BatchCreate, db: AsyncSession = Depends(get_db)):
    batch = Batch(name=body.name, symbols=",".join(body.symbols))
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    return _row_to_dict(batch)


@router.put("/{batch_id}")
async def update_batch(batch_id: int, body: BatchUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Batch).where(Batch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        return {"error": "Batch not found"}
    if body.name is not None:
        batch.name = body.name
    if body.symbols is not None:
        batch.symbols = ",".join(body.symbols)
    await db.commit()
    await db.refresh(batch)
    return _row_to_dict(batch)


@router.delete("/{batch_id}")
async def delete_batch(batch_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Batch).where(Batch.id == batch_id))
    batch = result.scalar_one_or_none()
    if not batch:
        return {"error": "Batch not found"}
    await db.delete(batch)
    await db.commit()
    return {"ok": True}


@router.post("/seed-industries")
async def seed_industry_batches(db: AsyncSession = Depends(get_db)):
    from app.models.instrument import Instrument

    res = await db.execute(select(Instrument.industry, Instrument.symbol).where(Instrument.industry != ""))
    industry_map: dict[str, list[str]] = {}
    for industry, symbol in res.all():
        industry_map.setdefault(industry, []).append(symbol)

    result = await db.execute(select(Batch))
    existing = {b.name for b in result.scalars().all()}

    created = []
    for industry, symbols in sorted(industry_map.items()):
        if industry in existing:
            continue
        batch = Batch(name=industry, symbols=",".join(sorted(symbols)))
        db.add(batch)
        created.append(industry)

    if created:
        await db.commit()

    return {"created": created, "skipped": len(industry_map) - len(created)}
