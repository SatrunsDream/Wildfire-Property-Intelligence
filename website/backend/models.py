from pydantic import BaseModel


class ConditionalProbRequest(BaseModel):
    context_cols: list[str]
    target: str
    min_support: int = 30


class MapRequest(BaseModel):
    context_cols: list[str]
    target: str
    min_support: int = 30


class ConditionFilter(BaseModel):
    column: str
    value: str


class CountyCompareRequest(BaseModel):
    fips_a: str
    fips_b: str
    conditions: list[ConditionFilter] | None = None
