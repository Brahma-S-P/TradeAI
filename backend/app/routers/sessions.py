import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.session import AnalysisSession

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    name: str = "Untitled Session"
    symbol: str | None = None
    strategy_id: str | None = None
    backtest_run_id: int | None = None
    notes: str = ""
    indicator_state: list[str] = []
    chart_config: dict = {}
    code: str = ""
    builder_mode: str = "code"
    conditions: dict = {}
    selected_symbols: list[str] = []


class SessionUpdate(BaseModel):
    name: str | None = None
    symbol: str | None = None
    strategy_id: str | None = None
    backtest_run_id: int | None = None
    notes: str | None = None
    indicator_state: list[str] | None = None
    chart_config: dict | None = None
    code: str | None = None
    builder_mode: str | None = None
    conditions: dict | None = None
    selected_symbols: list[str] | None = None


def _serialize(session: AnalysisSession) -> dict:
    return {
        "id": session.id,
        "name": session.name,
        "symbol": session.symbol,
        "strategy_id": session.strategy_id,
        "backtest_run_id": session.backtest_run_id,
        "notes": session.notes or "",
        "indicator_state": json.loads(session.indicator_state or "[]"),
        "chart_config": json.loads(session.chart_config or "{}"),
        "code": session.code or "",
        "builder_mode": session.builder_mode or "code",
        "conditions": json.loads(session.conditions or "{}"),
        "selected_symbols": json.loads(session.selected_symbols or "[]"),
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "updated_at": session.updated_at.isoformat() if session.updated_at else None,
    }


@router.post("")
async def create_session(req: SessionCreate, db: AsyncSession = Depends(get_db)):
    session = AnalysisSession(
        name=req.name,
        symbol=req.symbol,
        strategy_id=req.strategy_id,
        backtest_run_id=req.backtest_run_id,
        notes=req.notes,
        indicator_state=json.dumps(req.indicator_state),
        chart_config=json.dumps(req.chart_config),
        code=req.code,
        builder_mode=req.builder_mode,
        conditions=json.dumps(req.conditions),
        selected_symbols=json.dumps(req.selected_symbols),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return _serialize(session)


@router.get("")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AnalysisSession).order_by(AnalysisSession.updated_at.desc()).limit(50)
    )
    return [_serialize(s) for s in result.scalars().all()]


@router.get("/{session_id}")
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AnalysisSession).where(AnalysisSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return {"error": "Session not found"}
    return _serialize(session)


@router.put("/{session_id}")
async def update_session(session_id: int, req: SessionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AnalysisSession).where(AnalysisSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if not session:
        return {"error": "Session not found"}

    if req.name is not None:
        session.name = req.name
    if req.symbol is not None:
        session.symbol = req.symbol
    if req.strategy_id is not None:
        session.strategy_id = req.strategy_id
    if req.backtest_run_id is not None:
        session.backtest_run_id = req.backtest_run_id
    if req.notes is not None:
        session.notes = req.notes
    if req.indicator_state is not None:
        session.indicator_state = json.dumps(req.indicator_state)
    if req.chart_config is not None:
        session.chart_config = json.dumps(req.chart_config)
    if req.code is not None:
        session.code = req.code
    if req.builder_mode is not None:
        session.builder_mode = req.builder_mode
    if req.conditions is not None:
        session.conditions = json.dumps(req.conditions)
    if req.selected_symbols is not None:
        session.selected_symbols = json.dumps(req.selected_symbols)

    await db.commit()
    await db.refresh(session)
    return _serialize(session)


@router.delete("/{session_id}")
async def delete_session(session_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(AnalysisSession).where(AnalysisSession.id == session_id))
    await db.commit()
    return {"deleted": session_id}
