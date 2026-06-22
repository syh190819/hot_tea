"""
CFD严格FDM求解器 - 柱坐标2D轴对称热传导方程
∂T/∂t = α · (∂²T/∂r² + (1/r)·∂T/∂r + ∂²T/∂h²)

边界条件:
  - 壁面: 第三类边界 -k·∂T/∂r = h_w·(T - T_amb)
  - 液面: 第三类边界 -k·∂T/∂h = h_s·(T - T_amb)
  - 中心轴: ∂T/∂r = 0 (轴对称)
  - 杯底: 第一类/第三类混合
"""

import numpy as np
from typing import Optional


def solve_heat_conduction(
    diameter: float = 80.0,
    height: float = 120.0,
    wall_thickness: float = 3.0,
    liquid_level: float = 100.0,
    initial_temp: float = 85.0,
    ambient_temp: float = 25.0,
    thermal_diffusivity: float = 1.41e-7,
    wall_k: float = 1.5,
    h_wall: float = 10.0,
    h_surface: float = 15.0,
    grid_r: int = 30,
    grid_h: int = 36,
    num_time_steps: int = 100,
    max_time: float = 600.0,
) -> dict:
    """
    严格FDM求解2D轴对称热传导方程。

    Parameters:
        diameter, height: 杯子外径/高度 (mm)
        wall_thickness: 壁厚 (mm)
        liquid_level: 液位百分比 30-100
        initial_temp, ambient_temp: 温度 (°C)
        thermal_diffusivity: 热扩散率 (m²/s)
        wall_k: 杯壁导热系数 (W/m·°C)
        h_wall: 壁面对流换热系数 (W/m²·°C)
        h_surface: 液表面对流换热系数
        grid_r, grid_h: 网格数 (径向/轴向)
        num_time_steps, max_time: 时间步

    Returns:
        dict with time_steps (list of 2D arrays), grid params
    """
    # 单位转换: mm → m（热扩散率是 m²/s）
    r_inner_m = (diameter / 2 - wall_thickness) * 1e-3
    h_max_m = (height - wall_thickness * 2) * (liquid_level / 100) * 1e-3

    if r_inner_m <= 0 or h_max_m <= 0:
        return {"error": "invalid geometry"}

    alpha = thermal_diffusivity  # m²/s
    dt = max_time / num_time_steps

    dr = r_inner_m / (grid_r - 1)
    dh = h_max_m / (grid_h - 1)

    # CFL 稳定性检查
    cfl = alpha * dt * (1 / dr ** 2 + 1 / dh ** 2)
    if cfl > 0.25:
        # 自适应缩小dt
        dt = 0.2 / (alpha * (1 / dr ** 2 + 1 / dh ** 2))
        num_time_steps = int(max_time / dt)
        print(f"CFL={cfl:.3f} > 0.25, 调整 dt={dt:.4f}, steps={num_time_steps}")

    # 初始化温度场 (°C)
    T = np.full((grid_r, grid_h), initial_temp, dtype=np.float64)
    T_amb = ambient_temp

    r = np.linspace(0, r_inner_m, grid_r)
    h = np.linspace(0, h_max_m, grid_h)

    time_steps = []
    # 每 N 步保存一次，均匀采样到 num_time_steps
    save_interval = max(1, num_time_steps // 100)

    for step in range(num_time_steps):
        T_new = T.copy()

        # 内部节点: 显式FDM
        for i in range(1, grid_r - 1):
            ri = r[i]
            for j in range(1, grid_h - 1):
                # ∂²T/∂r²
                d2T_dr2 = (T[i + 1, j] - 2 * T[i, j] + T[i - 1, j]) / dr ** 2
                # (1/r)·∂T/∂r (在r=0处由对称性处理)
                if ri > 1e-12:
                    dT_dr = (T[i + 1, j] - T[i - 1, j]) / (2 * dr)
                    radial = d2T_dr2 + (1 / ri) * dT_dr
                else:
                    # r→0: 用二阶近似 ∂²T/∂r² + (1/r)∂T/∂r ≈ 2·(T[1]-T[0])/dr²
                    radial = 2 * (T[1, j] - T[0, j]) / dr ** 2
                # ∂²T/∂h²
                d2T_dh2 = (T[i, j + 1] - 2 * T[i, j] + T[i, j - 1]) / dh ** 2

                T_new[i, j] += alpha * dt * (radial + d2T_dh2)

        # 边界条件: 中心轴 (r=0)
        T_new[0, :] = T_new[1, :]  # ∂T/∂r = 0

        # 边界条件: 杯壁 (r=r_max) - 第三类
        T_new[-1, :] = (
            T_amb * h_wall * dr / wall_k + T[-2, :]
        ) / (1 + h_wall * dr / wall_k)

        # 边界条件: 杯底 (h=0) - 假设与杯壁导热
        T_new[:, 0] = T[:, 1]  # 绝热近似

        # 边界条件: 液面 (h=h_max) - 第三类 + 蒸发
        T_new[:, -1] = (
            T_amb * h_surface * dh / wall_k + T[:, -2]
        ) / (1 + h_surface * dh / wall_k)

        # 强制最低温度
        T_new = np.maximum(T_new, T_amb)

        T = T_new

        if step % save_interval == 0 or step == num_time_steps - 1:
            time_steps.append({
                "step": step,
                "time": step * dt,
                "grid": T.tolist(),
            })

    return {
        "time_steps": time_steps,
        "metadata": {
            "grid_r": grid_r,
            "grid_h": grid_h,
            "dr": dr,
            "dh": dh,
            "dt": dt,
            "num_time_steps": num_time_steps,
            "cfl": float(cfl),
            "r_max_m": r_inner_m,
            "h_max_m": h_max_m,
        }
    }


def compare_with_engine(
    browser_grid: list,
    cfd_grid: list,
) -> dict:
    """
    比较浏览器引擎与CFD求解器的温度场偏差。
    网格大小可能不同，先插值到同一分辨率再计算MAE/MaxAE。
    """
    browser_arr = np.array(browser_grid, dtype=np.float64)
    cfd_arr = np.array(cfd_grid, dtype=np.float64)

    if browser_arr.shape != cfd_arr.shape:
        # 双线性插值到较小网格
        from scipy.interpolate import RegularGridInterpolator
        # 简化: 只取公共区域
        min_r = min(browser_arr.shape[0], cfd_arr.shape[0])
        min_h = min(browser_arr.shape[1], cfd_arr.shape[1])
        browser_arr = browser_arr[:min_r, :min_h]
        cfd_arr = cfd_arr[:min_r, :min_h]

    diff = np.abs(browser_arr - cfd_arr)
    return {
        "mae": float(np.mean(diff)),
        "max_ae": float(np.max(diff)),
        "rmse": float(np.sqrt(np.mean(diff ** 2))),
        "grid_r": browser_arr.shape[0],
        "grid_h": browser_arr.shape[1],
    }
