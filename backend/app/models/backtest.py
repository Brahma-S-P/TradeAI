from sqlalchemy import Column, Integer, String, Float, Text, DateTime, func

from app.core.database import Base


class BacktestRun(Base):
    __tablename__ = "backtest_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    strategy_id = Column(Integer, nullable=True)
    risk_profile_id = Column(Integer, nullable=True)
    start_date = Column(String(10), nullable=False)
    end_date = Column(String(10), nullable=False)
    initial_capital = Column(Float, default=100000)
    total_return = Column(Float, default=0)
    win_rate = Column(Float, default=0)
    avg_win_loss = Column(Float, default=0)
    max_drawdown = Column(Float, default=0)
    sharpe_ratio = Column(Float, default=0)
    total_trades = Column(Integer, default=0)
    trade_log = Column(Text, default="[]")
    equity_curve = Column(Text, default="[]")
    created_at = Column(DateTime, server_default=func.now())

    # New columns
    profit_factor = Column(Float, default=0)
    sortino_ratio = Column(Float, default=0)
    calmar_ratio = Column(Float, default=0)
    max_drawdown_duration = Column(Integer, default=0)
    winning_trades = Column(Integer, default=0)
    losing_trades = Column(Integer, default=0)
    expectancy = Column(Float, default=0)
    strategy_code = Column(Text, default="")
    symbols = Column(Text, default="[]")
    status = Column(String(20), default="completed")
    signals_log = Column(Text, default="{}")
    benchmark_curve = Column(Text, default="[]")
    drawdown_curve = Column(Text, default="[]")
    monthly_returns = Column(Text, default="[]")
    metrics_json = Column(Text, default="{}")
