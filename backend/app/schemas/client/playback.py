from pydantic import BaseModel


class PlaybackAdConfig(BaseModel):
    tag_url: str
    format: str  # vmap | vast
    timeout_seconds: int = 8
    show_countdown: bool = True


class PlaybackFallback(BaseModel):
    csai: PlaybackAdConfig | None = None


class PlaybackCreative(BaseModel):
    advertisement_id: str
    title: str
    ad_type: str
    media_url: str
    click_through_url: str | None = None
    duration_seconds: int | None = None
    is_skippable: bool = True
    placement_type: str
    at_seconds: float | None = None
    # Unique per ad × slot × timestamp — lets the player track each cue-point independently
    break_key: str = ""


class PlaybackDecisionOut(BaseModel):
    content_type: str  # video | live_stream
    content_id: str
    ad_mode: str       # ssai | csai | none
    strategy: str      # hybrid | csai | ssai | none
    playback_url: str | None = None
    ssai_url: str | None = None
    ad_config: PlaybackAdConfig | None = None
    fallback: PlaybackFallback | None = None
    creatives: list[PlaybackCreative] = []
    tracking_token: str | None = None
