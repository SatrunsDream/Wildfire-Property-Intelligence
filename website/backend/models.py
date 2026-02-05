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


class BayesianMapRequest(BaseModel):
    lc_type: str | None = None
    metric: str = "movement"  # "movement", "shrinkage_weight", "abs_movement"
    color_category: str | None = None  # Filter by specific color category


class ColorGroupMapping(BaseModel):
    name: str
    colors: list[str]


class ColorGroupedCompareRequest(BaseModel):
    fips_a: str
    fips_b: str
    conditions: list[ConditionFilter] | None = None
    color_groups: list[ColorGroupMapping] | None = None


class ColorGroupedDivergenceRequest(BaseModel):
    color_groups: list[ColorGroupMapping]
