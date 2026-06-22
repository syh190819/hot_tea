"""
SyncNeuro CFD验证服务 - FastAPI
提供CFD精确求解与浏览器引擎精度对比接口
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional
import uvicorn
import json

from cfd_solver import solve_heat_conduction, compare_with_engine

app = FastAPI(
    title="SyncNeuro CFD Validation API",
    description="严格FDM求解器 - 柱坐标2D轴对称热传导方程",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ===== 请求/响应模型 =====

class SimulationParams(BaseModel):
    diameter: float = Field(80, ge=30, le=200)
    height: float = Field(120, ge=40, le=300)
    wall_thickness: float = Field(3, ge=1, le=10)
    liquid_level: float = Field(100, ge=30, le=100)
    initial_temp: float = Field(85, ge=20, le=120)
    ambient_temp: float = Field(25, ge=0, le=50)
    wall_k: float = Field(1.5, ge=0.1, le=50)
    liquid_type: str = Field("tea")
    grid_r: int = Field(30, ge=10, le=80)
    grid_h: int = Field(36, ge=10, le=80)
    num_time_steps: int = Field(100, ge=20, le=500)

class ComparisonParams(SimulationParams):
    browser_grid: list  # 浏览器引擎在相同参数下的计算结果

# ===== 热扩散率表 =====
LIQUID_DIFFUSIVITY = {
    "tea": 1.41e-7,
    "coffee": 1.38e-7,
    "juice": 1.45e-7,
    "water": 1.43e-7,
}
LIQUID_HSURFACE = {
    "tea": 15.0,
    "coffee": 14.0,
    "juice": 16.0,
    "water": 18.0,
}

# ===== 接口 =====

@app.get("/health")
def health():
    return {"status": "ok", "service": "syncneuro-cfd"}


@app.post("/api/solve")
def solve(params: SimulationParams):
    """CFD严格求解"""
    alpha = LIQUID_DIFFUSIVITY.get(params.liquid_type, 1.41e-7)
    h_surf = LIQUID_HSURFACE.get(params.liquid_type, 15.0)

    result = solve_heat_conduction(
        diameter=params.diameter,
        height=params.height,
        wall_thickness=params.wall_thickness,
        liquid_level=params.liquid_level,
        initial_temp=params.initial_temp,
        ambient_temp=params.ambient_temp,
        thermal_diffusivity=alpha,
        wall_k=params.wall_k,
        h_surface=h_surf,
        grid_r=params.grid_r,
        grid_h=params.grid_h,
        num_time_steps=params.num_time_steps,
    )
    return result


@app.post("/api/compare")
def compare(params: ComparisonParams):
    """CFD求解并与浏览器引擎结果对比"""
    alpha = LIQUID_DIFFUSIVITY.get(params.liquid_type, 1.41e-7)
    h_surf = LIQUID_HSURFACE.get(params.liquid_type, 15.0)

    cfd_result = solve_heat_conduction(
        diameter=params.diameter,
        height=params.height,
        wall_thickness=params.wall_thickness,
        liquid_level=params.liquid_level,
        initial_temp=params.initial_temp,
        ambient_temp=params.ambient_temp,
        thermal_diffusivity=alpha,
        wall_k=params.wall_k,
        h_surface=h_surf,
        grid_r=params.grid_r,
        grid_h=params.grid_h,
        num_time_steps=params.num_time_steps,
    )

    if "error" in cfd_result:
        return cfd_result

    # 取最后一帧对比
    browser_last = params.browser_grid
    cfd_last = cfd_result["time_steps"][-1]["grid"]

    comparison = compare_with_engine(browser_last, cfd_last)
    comparison["cfd_metadata"] = cfd_result["metadata"]
    return comparison


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8020, reload=True)
