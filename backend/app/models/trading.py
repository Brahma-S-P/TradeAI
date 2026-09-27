from sqlalchemy import Column, Integer, String, Float, DateTime, func

from app.core.database import Base


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), nullable=False)
    quantity = Column(Integer, default=0)
    avg_price = Column(Float, default=0)
    ltp = Column(Float, default=0)
    pnl = Column(Float, default=0)
    created_at = Column(DateTime, server_default=func.now())


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(20), nullable=False)
    order_type = Column(String(10), default="MARKET")
    side = Column(String(4), nullable=False)
    quantity = Column(Integer, default=0)
    price = Column(Float, default=0)
    stop_loss = Column(Float, nullable=True)
    target = Column(Float, nullable=True)
    status = Column(String(20), default="PENDING")
    strategy_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
