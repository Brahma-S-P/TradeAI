from sqlalchemy import Column, Integer, String, Text, DateTime, func

from app.core.database import Base


class AnalysisSession(Base):
    __tablename__ = "analysis_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, default="Untitled Session")
    symbol = Column(String, nullable=True)
    strategy_id = Column(String, nullable=True)
    backtest_run_id = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True, default="")
    indicator_state = Column(Text, nullable=True, default="[]")
    chart_config = Column(Text, nullable=True, default="{}")
    code = Column(Text, nullable=True, default="")
    builder_mode = Column(String, nullable=True, default="code")
    conditions = Column(Text, nullable=True, default="{}")
    selected_symbols = Column(Text, nullable=True, default="[]")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
