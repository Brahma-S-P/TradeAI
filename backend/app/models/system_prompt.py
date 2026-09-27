from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, func

from app.core.database import Base


class SystemPrompt(Base):
    __tablename__ = "system_prompts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    content = Column(Text, default="")
    context = Column(String(30), default="picker")
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
