from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.analyzer import AnalyzerFolder, AnalyzerStock

router = APIRouter(prefix="/api/analyzer-folders", tags=["analyzer-folders"])


class FolderCreate(BaseModel):
    name: str


class FolderRename(BaseModel):
    name: str


class MoveRunRequest(BaseModel):
    folder_id: int | None
    position: int = 0


class ReorderItem(BaseModel):
    type: str  # "run" | "folder"
    id: str  # run_id or folder id (as str)
    position: int


class ReorderRequest(BaseModel):
    items: list[ReorderItem]


def _row_to_dict(f: AnalyzerFolder) -> dict:
    return {
        "id": f.id,
        "name": f.name,
        "position": f.position,
        "created_at": str(f.created_at) if f.created_at else None,
        "updated_at": str(f.updated_at) if f.updated_at else None,
    }


@router.get("")
async def list_folders(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AnalyzerFolder).order_by(AnalyzerFolder.position)
    )
    return [_row_to_dict(f) for f in result.scalars().all()]


@router.post("")
async def create_folder(payload: FolderCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AnalyzerFolder))
    max_pos = max((f.position or 0 for f in result.scalars().all()), default=-1)
    folder = AnalyzerFolder(name=payload.name, position=max_pos + 1)
    db.add(folder)
    await db.commit()
    await db.refresh(folder)
    return _row_to_dict(folder)


@router.put("/{folder_id}")
async def rename_folder(folder_id: int, payload: FolderRename, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AnalyzerFolder).where(AnalyzerFolder.id == folder_id))
    folder = result.scalar_one_or_none()
    if not folder:
        return {"error": "not found"}
    folder.name = payload.name
    await db.commit()
    await db.refresh(folder)
    return _row_to_dict(folder)


@router.delete("/{folder_id}")
async def delete_folder(folder_id: int, delete_batches: bool = False, db: AsyncSession = Depends(get_db)):
    if delete_batches:
        await db.execute(
            sa_delete(AnalyzerStock).where(AnalyzerStock.folder_id == folder_id)
        )
    else:
        await db.execute(
            update(AnalyzerStock)
            .where(AnalyzerStock.folder_id == folder_id)
            .values(folder_id=None)
        )
    await db.execute(sa_delete(AnalyzerFolder).where(AnalyzerFolder.id == folder_id))
    await db.commit()
    return {"ok": True}


@router.put("/run/{run_id}/move")
async def move_run(run_id: str, payload: MoveRunRequest, db: AsyncSession = Depends(get_db)):
    await db.execute(
        update(AnalyzerStock)
        .where(AnalyzerStock.run_id == run_id)
        .values(folder_id=payload.folder_id, position=payload.position)
    )
    await db.commit()
    return {"ok": True}


@router.post("/reorder")
async def reorder(payload: ReorderRequest, db: AsyncSession = Depends(get_db)):
    for item in payload.items:
        if item.type == "folder":
            result = await db.execute(
                select(AnalyzerFolder).where(AnalyzerFolder.id == int(item.id))
            )
            row = result.scalar_one_or_none()
            if row:
                row.position = item.position
        else:
            await db.execute(
                update(AnalyzerStock)
                .where(AnalyzerStock.run_id == item.id)
                .values(position=item.position)
            )
    await db.commit()
    return {"ok": True}
