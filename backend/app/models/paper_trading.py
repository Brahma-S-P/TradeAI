from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, func

from app.core.database import Base


class PaperAccount(Base):
    __tablename__ = "paper_accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, default="Default")
    initial_balance = Column(Float, nullable=False, default=100000)
    cash_balance = Column(Float, nullable=False, default=100000)
    is_active = Column(Boolean, default=True)
    slippage_bps = Column(Float, default=5)
    commission_pct = Column(Float, default=0.03)
    max_position_pct = Column(Float, default=20)
    max_positions = Column(Integer, default=10)
    daily_loss_limit_pct = Column(Float, default=5)
    strategy_id = Column(Integer, nullable=True)
    batch_id = Column(Integer, nullable=True)
    tradable_symbols = Column(Text, nullable=True)  # JSON array string
    created_at = Column(DateTime, server_default=func.now())


class PaperOrder(Base):
    __tablename__ = "paper_orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, nullable=False)
    symbol = Column(String(20), nullable=False)
    side = Column(String(4), nullable=False)  # BUY / SELL
    order_type = Column(String(10), default="MARKET")  # MARKET / LIMIT / SL
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=True)  # for LIMIT
    trigger_price = Column(Float, nullable=True)  # for SL
    status = Column(String(20), default="PENDING")  # PENDING / FILLED / CANCELLED / REJECTED
    filled_price = Column(Float, nullable=True)
    filled_at = Column(DateTime, nullable=True)
    strategy_id = Column(Integer, nullable=True)
    reject_reason = Column(String(200), nullable=True)
    created_at = Column(DateTime, server_default=func.now())


class PaperPosition(Base):
    __tablename__ = "paper_positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, nullable=False)
    symbol = Column(String(20), nullable=False)
    side = Column(String(5), default="LONG")  # LONG / SHORT
    quantity = Column(Integer, default=0)
    avg_price = Column(Float, default=0)
    realized_pnl = Column(Float, default=0)
    opened_at = Column(DateTime, server_default=func.now())
    closed_at = Column(DateTime, nullable=True)


class PaperTrade(Base):
    __tablename__ = "paper_trades"

    id = Column(Integer, primary_key=True, autoincrement=True)
    order_id = Column(Integer, nullable=False)
    account_id = Column(Integer, nullable=False)
    symbol = Column(String(20), nullable=False)
    side = Column(String(4), nullable=False)
    quantity = Column(Integer, nullable=False)
    price = Column(Float, nullable=False)
    pnl = Column(Float, default=0)
    commission = Column(Float, default=0)
    executed_at = Column(DateTime, server_default=func.now())
