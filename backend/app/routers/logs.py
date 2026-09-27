from fastapi import APIRouter

from app.services.event_log import get_events, clear_events

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("")
async def logs(after: int = 0):
    events = get_events(after)
    return {"events": events, "last_id": events[-1]["id"] if events else after}


@router.delete("")
async def clear():
    clear_events()
    return {"ok": True}
