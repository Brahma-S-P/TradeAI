import asyncio

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import delete as sa_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.instrument import Instrument
from app.services.kite_service import kite_service

router = APIRouter(prefix="/api/kite", tags=["kite-auth"])


@router.get("/login")
async def kite_login():
    return {"login_url": kite_service.login_url}


@router.get("/callback")
async def kite_callback(
    request_token: str = Query(...),
    status: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if status == "cancelled":
        return RedirectResponse("http://localhost:5173/?kite=cancelled")

    session_data = kite_service.generate_session(request_token)

    try:
        seen: dict[str, dict] = {}
        for exchange in ("NSE", "BSE"):
            try:
                instruments = kite_service.get_instruments(exchange)
                for i in instruments:
                    if i.get("instrument_type") != "EQ":
                        continue
                    sym = i["tradingsymbol"]
                    if sym not in seen:
                        seen[sym] = {**i, "exchange": exchange}
            except Exception:
                pass
        existing = {}
        res = await db.execute(select(Instrument))
        for inst in res.scalars().all():
            existing[inst.symbol] = inst
        for sym, i in seen.items():
            if sym in existing:
                existing[sym].instrument_token = i.get("instrument_token")
                existing[sym].name = i.get("name", sym)
            else:
                db.add(Instrument(
                    symbol=sym, name=i.get("name", sym), exchange=i["exchange"],
                    instrument_token=i.get("instrument_token"),
                ))
        await db.commit()
    except Exception:
        pass

    user_id = session_data.get("user_id", "")
    return HTMLResponse(f"""<!DOCTYPE html><html><body>
<p>Login successful! This window will close automatically.</p>
<script>
if (window.opener) {{
    window.opener.postMessage({{ type: "kite-connected", user: "{user_id}" }}, "*");
}}
window.close();
</script></body></html>""")


@router.get("/status")
async def kite_status():
    if not kite_service.is_connected:
        return {"connected": False, "mode": "mock"}
    try:
        profile = kite_service.get_profile()
        return {
            "connected": True,
            "mode": "live",
            "user_id": profile.get("user_id"),
            "user_name": profile.get("user_name"),
            "email": profile.get("email"),
            "broker": profile.get("broker"),
        }
    except Exception:
        return {"connected": False, "mode": "mock", "error": "Session expired"}


@router.get("/ping")
async def kite_ping():
    """Lightweight heartbeat — cached for 10s to avoid hammering Kite API."""
    return kite_service.ping()


@router.get("/margins")
async def kite_margins():
    if not kite_service.is_connected:
        return {"error": "Not connected"}
    return kite_service.get_margins()
