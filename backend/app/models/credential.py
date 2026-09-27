from sqlalchemy import Column, Integer, String, Text, DateTime, func

from app.core.database import Base


class Credential(Base):
    __tablename__ = "credentials"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key_name = Column(String(100), nullable=False, unique=True)
    encrypted_value = Column(Text, nullable=False)
    salt = Column(String(64), nullable=False)
    iv = Column(String(48), nullable=False)
    password_hash = Column(String(128), nullable=False)
    password_salt = Column(String(64), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
