from sqlalchemy import Column, Integer, String, Text, Float, DateTime, func

from app.core.database import Base


class AnalyzerFolder(Base):
    __tablename__ = "analyzer_folders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class AnalyzerStock(Base):
    __tablename__ = "analyzer_stocks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False)
    name = Column(String(200), default="")
    price = Column(Float, default=0.0)
    matched_criteria = Column(Text, default="")
    strategy_name = Column(String(200), default="")
    strategy_type = Column(String(20), default="manual")
    index_filter = Column(String(50), default="NIFTY500")
    sector_filter = Column(String(100), default="All")
    run_id = Column(String(50), default="")
    folder_id = Column(Integer, nullable=True)
    position = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
