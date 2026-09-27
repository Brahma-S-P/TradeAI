from sqlalchemy import Column, Integer, String, DateTime, Boolean, func

from app.core.database import Base


class Instrument(Base):
    __tablename__ = "instruments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False, index=True, unique=True)
    name = Column(String(200), nullable=False, default="")
    exchange = Column(String(10), nullable=False, default="NSE")
    instrument_token = Column(Integer, nullable=True)
    sector = Column(String(50), nullable=False, default="")
    industry = Column(String(100), nullable=False, default="")
    isin = Column(String(20), nullable=True)
    series = Column(String(10), nullable=False, default="EQ")
    synced_at = Column(DateTime, server_default=func.now())


class IndexMember(Base):
    __tablename__ = "index_members"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False, index=True)
    index_name = Column(String(30), nullable=False, index=True)
    active = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
