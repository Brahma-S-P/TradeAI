import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.system_prompt import SystemPrompt

router = APIRouter(prefix="/api/system-prompts", tags=["system-prompts"])


class SystemPromptCreate(BaseModel):
    name: str
    content: str
    context: str = "picker"
    is_default: bool = False


class SystemPromptUpdate(BaseModel):
    name: str | None = None
    content: str | None = None
    is_default: bool | None = None


@router.get("")
async def list_prompts(context: str = "picker", db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SystemPrompt)
        .where(SystemPrompt.context == context)
        .order_by(SystemPrompt.created_at.desc())
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "name": r.name,
            "content": r.content,
            "context": r.context,
            "is_default": r.is_default,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]


@router.post("")
async def create_prompt(body: SystemPromptCreate, db: AsyncSession = Depends(get_db)):
    if body.is_default:
        await db.execute(
            update(SystemPrompt)
            .where(SystemPrompt.context == body.context, SystemPrompt.is_default == True)
            .values(is_default=False)
        )
    prompt = SystemPrompt(
        name=body.name,
        content=body.content,
        context=body.context,
        is_default=body.is_default,
    )
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)
    return {
        "id": prompt.id,
        "name": prompt.name,
        "content": prompt.content,
        "context": prompt.context,
        "is_default": prompt.is_default,
    }


@router.put("/{prompt_id}")
async def update_prompt(prompt_id: int, body: SystemPromptUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemPrompt).where(SystemPrompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="System prompt not found")

    if body.is_default:
        await db.execute(
            update(SystemPrompt)
            .where(SystemPrompt.context == prompt.context, SystemPrompt.is_default == True)
            .values(is_default=False)
        )

    if body.name is not None:
        prompt.name = body.name
    if body.content is not None:
        prompt.content = body.content
    if body.is_default is not None:
        prompt.is_default = body.is_default

    await db.commit()
    await db.refresh(prompt)
    return {
        "id": prompt.id,
        "name": prompt.name,
        "content": prompt.content,
        "context": prompt.context,
        "is_default": prompt.is_default,
    }


@router.delete("/{prompt_id}")
async def delete_prompt(prompt_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SystemPrompt).where(SystemPrompt.id == prompt_id))
    prompt = result.scalar_one_or_none()
    if not prompt:
        raise HTTPException(status_code=404, detail="System prompt not found")
    await db.delete(prompt)
    await db.commit()
    return {"ok": True}
