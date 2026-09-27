import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.agent_orchestrator import (
    run_agent, set_provider_config, set_model, get_provider_config, PROVIDER_MODELS,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatContext(BaseModel):
    selected_symbol: str | None = None
    selected_stocks: list[str] | None = None
    active_indicators: list[str] | None = None
    signal_results: list[dict] | None = None
    code: str | None = None


class StrategyAttachment(BaseModel):
    id: int
    name: str
    code: str


class ChatRequest(BaseModel):
    message: str
    tab: str = "picker"
    context: ChatContext | None = None
    system_prompt: str | None = None
    attachments: list[StrategyAttachment] | None = None


class ToolCallInfo(BaseModel):
    tool: str
    input: dict
    output_preview: str


class ChatResponse(BaseModel):
    response: str
    code: str | None = None
    conditions: dict | None = None
    tool_calls: list[ToolCallInfo] = []


class SetProviderRequest(BaseModel):
    provider: str
    api_key: str | None = None
    model: str | None = None
    ollama_url: str | None = None


class SetModelRequest(BaseModel):
    model: str


@router.post("/set-provider")
async def set_provider(req: SetProviderRequest):
    set_provider_config(req.provider, req.api_key, req.model, req.ollama_url)
    return {"status": "ok", "config": get_provider_config()}


@router.post("/set-model")
async def set_model_endpoint(req: SetModelRequest):
    set_model(req.model)
    return {"status": "ok"}


@router.get("/provider")
async def get_provider():
    return get_provider_config()


@router.get("/models")
async def get_models():
    return PROVIDER_MODELS


@router.get("/ollama-models")
async def get_ollama_models(url: str = Query(default="http://localhost:11434")):
    """Fetch installed models from a local Ollama instance."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = [
                {"id": m["name"], "name": m["name"], "size": m.get("size", 0)}
                for m in data.get("models", [])
            ]
            return {"models": models, "status": "ok"}
    except Exception as e:
        return {"models": [], "status": "error", "error": str(e)}


# Keep old endpoint for backwards compat
class SetKeyRequest(BaseModel):
    api_key: str


@router.post("/set-key")
async def set_key(req: SetKeyRequest):
    set_provider_config("openai", req.api_key)
    return {"status": "ok"}


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    attachments = None
    if request.attachments:
        attachments = [{"id": a.id, "name": a.name, "code": a.code} for a in request.attachments]

    context_dict = None
    if request.context:
        context_dict = request.context.model_dump(exclude_none=True)

    result = await run_agent(
        message=request.message,
        db=db,
        system_prompt=request.system_prompt,
        attachments=attachments,
        tab=request.tab,
        context=context_dict,
    )

    tool_calls = [
        ToolCallInfo(tool=tc["tool"], input=tc["input"], output_preview=tc["output_preview"])
        for tc in result.get("tool_calls", [])
    ]

    return ChatResponse(
        response=result["response"],
        code=result.get("code"),
        conditions=result.get("conditions"),
        tool_calls=tool_calls,
    )
