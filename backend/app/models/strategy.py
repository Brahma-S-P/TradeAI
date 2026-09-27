from sqlalchemy import Column, Integer, String, Text, DateTime, func

from app.core.database import Base


class Strategy(Base):
    __tablename__ = "strategies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    version = Column(Integer, default=1)
    code = Column(Text, default="")
    filters = Column(Text, default="")
    index_filter = Column(String(50), default="")
    strategy_type = Column(String(20), default="parameter")
    folder_id = Column(Integer, nullable=True)
    position = Column(Integer, default=0)
    parent_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class StrategyFolder(Base):
    __tablename__ = "strategy_folders"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    context = Column(String(30), default="picker")
    position = Column(Integer, default=0)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class RiskProfile(Base):
    __tablename__ = "risk_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    version = Column(Integer, default=1)
    code = Column(Text, default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
