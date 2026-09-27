from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.strategy import Strategy, StrategyFolder

router = APIRouter(prefix="/api/strategy-folders", tags=["strategy-folders"])


class FolderCreate(BaseModel):
    name: str
    context: str = "picker"


class FolderRename(BaseModel):
    name: str


class ReorderItem(BaseModel):
    type: str  # "strategy" | "folder"
    id: int
    position: int


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


def _row_to_dict(f: StrategyFolder) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "context": f.context or "picker",
        "position": f.position,
        "created_at": str(f.created_at) if f.created_at else None,
        "updated_at": str(f.updated_at) if f.updated_at else None,
    }


@router.get("")
async def list_folders(context: str = "", db: AsyncSession = Depends(get_db)):
    q = select(StrategyFolder)
    if context:
        q = q.where(StrategyFolder.context == context)
    q = q.order_by(StrategyFolder.position)
    result = await db.execute(q)
    return [_row_to_dict(f) for f in result.scalars().all()]


@router.post("")
async def create_folder(payload: FolderCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(StrategyFolder).where(StrategyFolder.context == payload.context)
    )
    max_pos = max((f.position or 0 for f in result.scalars().all()), default=-1)
    folder = StrategyFolder(name=payload.name, context=payload.context, position=max_pos + 1)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return _row_to_dict(folder)


@router.put("/{folder_id}")
async def rename_folder(folder_id: int, payload: FolderRename, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(StrategyFolder).where(StrategyFolder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        return {"error": "not found"}
    folder.name = payload.name
    await db.commit()
    await db.refresh(folder)
    return _row_to_dict(folder)


@router.delete("/{folder_id}")
async def delete_folder(folder_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(sa_delete(Strategy).where(Strategy.folder_id == folder_id))
    await db.execute(sa_delete(StrategyFolder).where(StrategyFolder.id == folder_id))
    await db.commit()
    return {"ok": True}


@router.post("/reorder")
async def reorder_bar(payload: ReorderRequest, db: AsyncSession = Depends(get_db)):
    for item in payload.items:
        if item.type == "folder":
            result = await db.execute(select(StrategyFolder).where(StrategyFolder.id == item.id))
            row = result.scalar_one_or_none()
            if row:
                row.position = item.position
        else:
            result = await db.execute(select(Strategy).where(Strategy.id == item.id))
            row = result.scalar_one_or_none()
            if row:
                row.position = item.position
    await db.commit()
    return {"ok": True}
