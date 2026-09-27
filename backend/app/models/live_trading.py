from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, func

from app.core.database import Base


class LiveSession(Base):
    __tablename__ = "live_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    strategy_id = Column(Integer, nullable=False)
    strategy_name = Column(String(200), default="")
    batch_id = Column(Integer, nullable=True)
    batch_name = Column(String(200), default="")
    symbols = Column(Text, default="")  # comma-separated selected symbols
    mode = Column(String(20), default="manual")  # manual | auto
    status = Column(String(20), default="idle")  # idle | running | paused | stopped
    product = Column(String(10), default="CNC")  # CNC | MIS | NRML
    max_position_pct = Column(Float, default=10)
    max_positions = Column(Integer, default=5)
    per_trade_qty = Column(Integer, default=1)
    stoploss_pct = Column(Float, default=3.0)
    target_pct = Column(Float, default=6.0)
    daily_loss_limit = Column(Float, default=10000)
    scan_interval_sec = Column(Integer, default=60)
    trades_today = Column(Integer, default=0)
    pnl_today = Column(Float, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LiveOrder(Base):
    __tablename__ = "live_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, nullable=False)
    kite_order_id = Column(String(100), default="")
    symbol = Column(String(50), nullable=False)
    side = Column(String(10), nullable=False)  # BUY | SELL
    order_type = Column(String(10), default="MARKET")
    quantity = Column(Integer, default=0)
    price = Column(Float, nullable=True)
    trigger_price = Column(Float, nullable=True)
    status = Column(String(20), default="PENDING")  # PENDING | PLACED | COMPLETE | CANCELLED | REJECTED
    kite_status = Column(String(30), default="")
    filled_price = Column(Float, nullable=True)
    pnl = Column(Float, default=0)
    commission = Column(Float, default=0)
    signal_reason = Column(Text, default="")
    needs_approval = Column(Boolean, default=False)
    approved = Column(Boolean, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
