import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import init_db
from app.services.event_log import log_event
from app.routers import stocks, strategies, strategy_folders, backtesting, trading, paper_trading, live_trading, websocket, chat, kite_auth, batches, snapshot, logs, analyzer, analyzer_folders, sessions, system_prompts, credentials


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Trading Console API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# High-frequency poll endpoints excluded from the activity log to avoid noise.
_LOG_SKIP = ("/api/logs", "/api/snapshot/status", "/api/kite/status", "/api/kite/ping", "/api/trading/pnl", "/api/live/portfolio", "/api/live/orders")


@app.middleware("http")
async def activity_logger(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    path = request.url.path
    if not any(path.startswith(p) for p in _LOG_SKIP):
        dur = (time.time() - start) * 1000
        level = "info" if response.status_code < 400 else "error"
        log_event(f"{request.method} {path} → {response.status_code} ({dur:.0f}ms)",
                  source="http", level=level)
    return response

app.include_router(kite_auth.router)
app.include_router(stocks.router)
app.include_router(strategies.router)
app.include_router(strategy_folders.router)
app.include_router(backtesting.router)
app.include_router(trading.router)
app.include_router(paper_trading.router)
app.include_router(live_trading.router)
app.include_router(websocket.router)
app.include_router(chat.router)
app.include_router(batches.router)
app.include_router(snapshot.router)
app.include_router(logs.router)
app.include_router(analyzer.router)
app.include_router(analyzer_folders.router)
app.include_router(sessions.router)
app.include_router(system_prompts.router)
app.include_router(credentials.router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "Trading Console API"}
