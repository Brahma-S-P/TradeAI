from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session


async def init_db():
    import app.models.session  # noqa: F401 — register AnalysisSession table
    import app.models.system_prompt  # noqa: F401 — register SystemPrompt table
    import app.models.credential  # noqa: F401 — register Credential table
    import app.models.paper_trading  # noqa: F401 — register Paper Trading tables
    import app.models.live_trading  # noqa: F401 — register Live Trading tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_strategies_columns(conn)
        await _migrate_instruments_columns(conn)
        await _migrate_folders_columns(conn)
        await _migrate_backtest_columns(conn)
        await _migrate_analyzer_columns(conn)
        await _migrate_paper_account_columns(conn)


async def _migrate_strategies_columns(conn):
    result = await conn.execute(text("PRAGMA table_info(strategies)"))
    cols = {row[1] for row in result.fetchall()}
    if "folder_id" not in cols:
        await conn.execute(text("ALTER TABLE strategies ADD COLUMN folder_id INTEGER"))
    if "position" not in cols:
        await conn.execute(text("ALTER TABLE strategies ADD COLUMN position INTEGER DEFAULT 0"))
    if "parent_id" not in cols:
        await conn.execute(text("ALTER TABLE strategies ADD COLUMN parent_id INTEGER"))


async def _migrate_folders_columns(conn):
    result = await conn.execute(text("PRAGMA table_info(strategy_folders)"))
    cols = {row[1] for row in result.fetchall()}
    if "context" not in cols:
        await conn.execute(text("ALTER TABLE strategy_folders ADD COLUMN context TEXT DEFAULT 'picker'"))


async def _migrate_backtest_columns(conn):
    result = await conn.execute(text("PRAGMA table_info(backtest_runs)"))
    cols = {row[1] for row in result.fetchall()}
    new_cols = {
        "profit_factor": "REAL DEFAULT 0",
        "sortino_ratio": "REAL DEFAULT 0",
        "calmar_ratio": "REAL DEFAULT 0",
        "max_drawdown_duration": "INTEGER DEFAULT 0",
        "winning_trades": "INTEGER DEFAULT 0",
        "losing_trades": "INTEGER DEFAULT 0",
        "expectancy": "REAL DEFAULT 0",
        "strategy_code": "TEXT DEFAULT ''",
        "symbols": "TEXT DEFAULT '[]'",
        "status": "TEXT DEFAULT 'completed'",
        "signals_log": "TEXT DEFAULT '{}'",
        "benchmark_curve": "TEXT DEFAULT '[]'",
        "drawdown_curve": "TEXT DEFAULT '[]'",
        "monthly_returns": "TEXT DEFAULT '[]'",
        "metrics_json": "TEXT DEFAULT '{}'",
    }
    for col, typedef in new_cols.items():
        if col not in cols:
            await conn.execute(text(f"ALTER TABLE backtest_runs ADD COLUMN {col} {typedef}"))


async def _migrate_analyzer_columns(conn):
    result = await conn.execute(text("PRAGMA table_info(analyzer_stocks)"))
    cols = {row[1] for row in result.fetchall()}
    if "folder_id" not in cols:
        await conn.execute(text("ALTER TABLE analyzer_stocks ADD COLUMN folder_id INTEGER"))
    if "position" not in cols:
        await conn.execute(text("ALTER TABLE analyzer_stocks ADD COLUMN position INTEGER DEFAULT 0"))


async def _migrate_instruments_columns(conn):
    result = await conn.execute(text("PRAGMA table_info(instruments)"))
    cols = {row[1] for row in result.fetchall()}
    if "industry" not in cols:
        await conn.execute(text("ALTER TABLE instruments ADD COLUMN industry TEXT DEFAULT ''"))
    if "isin" not in cols:
        await conn.execute(text("ALTER TABLE instruments ADD COLUMN isin TEXT"))
    if "series" not in cols:
        await conn.execute(text("ALTER TABLE instruments ADD COLUMN series TEXT DEFAULT 'EQ'"))


async def _migrate_paper_account_columns(conn):
    result = await conn.execute(text("PRAGMA table_info(paper_accounts)"))
    cols = {row[1] for row in result.fetchall()}
    if "strategy_id" not in cols:
        await conn.execute(text("ALTER TABLE paper_accounts ADD COLUMN strategy_id INTEGER"))
    if "batch_id" not in cols:
        await conn.execute(text("ALTER TABLE paper_accounts ADD COLUMN batch_id INTEGER"))
    if "tradable_symbols" not in cols:
        await conn.execute(text("ALTER TABLE paper_accounts ADD COLUMN tradable_symbols TEXT"))
