from pydantic import BaseModel


class GenerateRequest(BaseModel):
    prompt: str
    num_images: int = 4


class GenerateResponse(BaseModel):
    images: list[str]
    backend_used: str


class SegmentRequest(BaseModel):
    image_b64: str
    landmarks: list[dict]
    img_width: int
    img_height: int


class SegmentResponse(BaseModel):
    results: dict


class PartsGenerateRequest(BaseModel):
    base_image_b64: str
    masks: dict[str, str]


class PartsGenerateResponse(BaseModel):
    parts: dict[str, str | None]


class HealthResponse(BaseModel):
    status: str
    version: str
