import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.strategy import Strategy

router = APIRouter(prefix="/api/strategies", tags=["strategies"])


class StrategyCreate(BaseModel):
    name: str
    strategy_type: str  # "manual" | "code"
    code: str = ""
    filters: list[dict] = []
    index_filter: str = ""
    description: str = ""
    folder_id: int | None = None


class MoveRequest(BaseModel):
    folder_id: int | None = None
    position: int = 0


def _row_to_dict(s: Strategy) -> dict:
    return {
        "id": str(s.id),
        "name": s.name,
        "description": s.description,
        "version": s.version,
        "code": s.code,
        "filters": json.loads(s.filters) if s.filters else [],
        "index_filter": s.index_filter,
        "strategy_type": s.strategy_type,
        "folder_id": s.folder_id,
        "position": s.position or 0,
        "parent_id": s.parent_id,
        "updated_at": str(s.updated_at) if s.updated_at else None,
        "created_at": str(s.created_at) if s.created_at else None,
    }


@router.get("")
async def list_strategies(context: str = "", db: AsyncSession = Depends(get_db)):
    q = select(Strategy)
    if context == "picker":
        q = q.where(Strategy.strategy_type.in_(["manual", "code", "parameter"]))
    elif context == "analyzer":
        q = q.where(Strategy.strategy_type == "analyzer_code")
    q = q.order_by(Strategy.updated_at.desc())
    result = await db.execute(q)
    rows = result.scalars().all()
    all_ids = {r.id for r in rows}
    version_counts: dict[int, int] = {}
    for r in rows:
        root = r.parent_id or r.id
        version_counts[root] = version_counts.get(root, 0) + 1
    out = []
    for s in rows:
        d = _row_to_dict(s)
        root = s.parent_id or s.id
        d["version_count"] = version_counts.get(root, 1)
        out.append(d)
    return out


@router.post("")
async def create_strategy(payload: StrategyCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).where(Strategy.folder_id == payload.folder_id))
    max_pos = max((s.position or 0 for s in result.scalars().all()), default=-1)
    strat = Strategy(
        name=payload.name,
        description=payload.description,
        code=payload.code,
        filters=json.dumps(payload.filters),
        index_filter=payload.index_filter,
        strategy_type=payload.strategy_type,
        folder_id=payload.folder_id,
        version=1,
        position=max_pos + 1,
    )
    db.add(strat)
    await db.commit()
    await db.refresh(strat)
    return _row_to_dict(strat)


@router.put("/{strategy_id}/move")
async def move_strategy(strategy_id: int, payload: MoveRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strat = result.scalar_one_or_none()
    if not strat:
        return {"error": "not found"}
    strat.folder_id = payload.folder_id
    strat.position = payload.position
    await db.commit()
    await db.refresh(strat)
    return _row_to_dict(strat)


@router.get("/risk-profiles/list")
async def list_risk_profiles():
    return []


@router.get("/risk-profiles/{profile_id}")
async def get_risk_profile(profile_id: str):
    return None


@router.get("/{strategy_id}")
async def get_strategy(strategy_id: str, db: AsyncSession = Depends(get_db)):
    if not strategy_id.isdigit():
        return None
    result = await db.execute(select(Strategy).where(Strategy.id == int(strategy_id)))
    row = result.scalar_one_or_none()
    return _row_to_dict(row) if row else None


@router.put("/{strategy_id}")
async def update_strategy(strategy_id: int, payload: StrategyCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strat = result.scalar_one_or_none()
    if not strat:
        return {"error": "not found"}
    strat.name = payload.name
    strat.description = payload.description
    strat.code = payload.code
    strat.filters = json.dumps(payload.filters)
    strat.index_filter = payload.index_filter
    strat.strategy_type = payload.strategy_type
    strat.version = (strat.version or 1) + 1
    await db.commit()
    await db.refresh(strat)
    return _row_to_dict(strat)


@router.get("/{strategy_id}/versions")
async def get_versions(strategy_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strat = result.scalar_one_or_none()
    if not strat:
        return []
    root_id = strat.parent_id or strat.id
    result = await db.execute(
        select(Strategy)
        .where((Strategy.id == root_id) | (Strategy.parent_id == root_id))
        .order_by(Strategy.version.asc())
    )
    return [_row_to_dict(s) for s in result.scalars().all()]


@router.post("/{strategy_id}/new-version")
async def create_new_version(strategy_id: int, payload: StrategyCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strat = result.scalar_one_or_none()
    if not strat:
        return {"error": "not found"}
    root_id = strat.parent_id or strat.id
    result = await db.execute(
        select(Strategy)
        .where((Strategy.id == root_id) | (Strategy.parent_id == root_id))
    )
    all_versions = result.scalars().all()
    max_ver = max((v.version or 1) for v in all_versions)
    new_strat = Strategy(
        name=payload.name,
        description=payload.description,
        code=payload.code,
        filters=json.dumps(payload.filters),
        index_filter=payload.index_filter,
        strategy_type=payload.strategy_type,
        folder_id=strat.folder_id,
        parent_id=root_id,
        version=max_ver + 1,
        position=strat.position,
    )
    db.add(new_strat)
    await db.commit()
    await db.refresh(new_strat)
    return _row_to_dict(new_strat)


@router.delete("/{strategy_id}")
async def delete_strategy(strategy_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Strategy).where(Strategy.id == strategy_id))
    strat = result.scalar_one_or_none()
    if not strat:
        return {"error": "not found"}
    if strat.parent_id is None:
        children = await db.execute(
            select(Strategy).where(Strategy.parent_id == strategy_id).order_by(Strategy.version.asc())
        )
        children_list = children.scalars().all()
        if children_list:
            new_root = children_list[0]
            new_root.parent_id = None
            for child in children_list[1:]:
                child.parent_id = new_root.id
    await db.execute(sa_delete(Strategy).where(Strategy.id == strategy_id))
    await db.commit()
    return {"ok": True}
