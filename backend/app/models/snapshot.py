from sqlalchemy import Column, Integer, String, Text, Float, Date, DateTime, UniqueConstraint, Index, func

from app.core.database import Base


class DailyCandleStore(Base):
    """Raw daily OHLCV series per symbol, refreshed by the daily pull.

    One row per symbol; `candles` is a JSON list of {date, open, high, low,
    close, volume} in chronological order. Code strategies read this via the
    SDK's get_historical, and indicators are computed from it.
    """

    __tablename__ = "daily_candle_store"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False, index=True, unique=True)
    candles = Column(Text, nullable=False, default="[]")
    updated_at = Column(DateTime, server_default=func.now())


class IntradayCandle(Base):
    """Normalized intraday OHLCV candles (one row per candle).

    Supports accumulation: daily top-ups merge new candles with existing data,
    building up history beyond Kite's per-request lookback limit.
    """

    __tablename__ = "intraday_candles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False)
    interval = Column(String(10), nullable=False, default="5minute")
    timestamp = Column(DateTime, nullable=False)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Integer, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("symbol", "interval", "timestamp", name="uq_intraday_candle"),
        Index("ix_intraday_sym_interval", "symbol", "interval"),
        Index("ix_intraday_timestamp", "timestamp"),
    )


class IndicatorSnapshot(Base):
    """Computed indicator values per symbol per day (one row / symbol / date).

    `values` is a JSON dict keyed by catalog indicator id (return_1d, rsi_14,
    …). Manual filters read from here; adding indicators needs no migration.
    """

    __tablename__ = "indicator_snapshot"

    id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    symbol = Column(String(50), nullable=False, index=True)
    values = Column(Text, nullable=False, default="{}")
    ltp = Column(Float, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class SnapshotRun(Base):
    """Job log so the app knows whether today's pull is done."""

    __tablename__ = "snapshot_run"

    id = Column(Integer, primary_key=True, autoincrement=True)
    snapshot_date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="running")  # running|done|failed
    universe = Column(String(100), nullable=False, default="")
    source = Column(String(10), nullable=False, default="mock")  # kite|mock
    stocks_processed = Column(Integer, nullable=False, default=0)
    stocks_total = Column(Integer, nullable=False, default=0)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, server_default=func.now())
    finished_at = Column(DateTime, nullable=True)
