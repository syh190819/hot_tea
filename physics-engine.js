class HeatConductionEngine {
    constructor(params) {
        this.params = params;
        this.grid = null;
        this.timeSteps = [];
        this.maxTime = 600;
        this.timeStep = 1;
        this.numSteps = this.maxTime / this.timeStep;
        
        this.liquidProperties = {
            tea: { cp: 4186, k: 0.58, rho: 998, alpha: 1.41e-7 },
            coffee: { cp: 4050, k: 0.55, rho: 1010, alpha: 1.35e-7 },
            juice: { cp: 3850, k: 0.52, rho: 1050, alpha: 1.26e-7 },
            water: { cp: 4186, k: 0.60, rho: 998, alpha: 1.47e-7 }
        };
        
        this.liquid = this.liquidProperties[params.liquidType] || this.liquidProperties.water;
    }
    
    initGrid() {
        const { diameter, height, wallThickness } = this.params;
        const rMax = diameter / 2 - wallThickness;
        const hMax = height - wallThickness * 2;
        
        const nr = 16;
        const nh = 20;
        const nTheta = 8;
        
        const dr = rMax / (nr - 1);
        const dh = hMax / (nh - 1);
        
        this.grid = {
            nr, nh, nTheta,
            dr, dh,
            rMax, hMax,
            data: []
        };
        
        for (let i = 0; i < nr; i++) {
            const row = [];
            for (let j = 0; j < nh; j++) {
                const col = [];
                for (let k = 0; k < nTheta; k++) {
                    col.push(this.params.initialTemp);
                }
                row.push(col);
            }
            this.grid.data.push(row);
        }
        
        this.timeSteps.push(this.cloneGrid());
    }
    
    cloneGrid() {
        const newGrid = { ...this.grid };
        newGrid.data = this.grid.data.map(row => row.map(col => [...col]));
        return newGrid;
    }
    
    solve() {
        this.initGrid();
        
        const alpha = this.liquid.alpha;
        const dt = this.timeStep;
        const { dr, dh, nr, nh, nTheta } = this.grid;
        const { ambientTemp, wallThickness } = this.params;
        
        const h_conv = 10;
        const h_evap = 5;
        const k_wall = 1.0;
        
        for (let step = 0; step < this.numSteps; step++) {
            const newData = this.grid.data.map(row => row.map(col => [...col]));
            
            for (let i = 0; i < nr; i++) {
                for (let j = 0; j < nh; j++) {
                    for (let k = 0; k < nTheta; k++) {
                        const r = i * dr;
                        const h = j * dh;
                        const currentTemp = this.grid.data[i][j][k];
                        
                        let d2T_dr2 = 0;
                        let dT_dr = 0;
                        let d2T_dh2 = 0;
                        
                        if (i > 0 && i < nr - 1) {
                            d2T_dr2 = (this.grid.data[i + 1][j][k] - 2 * currentTemp + this.grid.data[i - 1][j][k]) / (dr * dr);
                            dT_dr = (this.grid.data[i + 1][j][k] - this.grid.data[i - 1][j][k]) / (2 * dr);
                        } else if (i === nr - 1) {
                            const wallResistance = wallThickness / k_wall;
                            const heatLoss = (currentTemp - ambientTemp) / (wallResistance + 1 / h_conv);
                            d2T_dr2 = -heatLoss / (this.liquid.k * dr);
                            dT_dr = -heatLoss / this.liquid.k;
                        } else if (i === 0) {
                            d2T_dr2 = (this.grid.data[1][j][k] - currentTemp) / (dr * dr);
                        }
                        
                        if (j > 0 && j < nh - 1) {
                            d2T_dh2 = (this.grid.data[i][j + 1][k] - 2 * currentTemp + this.grid.data[i][j - 1][k]) / (dh * dh);
                        } else if (j === nh - 1) {
                            const heatLoss = h_evap * (currentTemp - ambientTemp);
                            d2T_dh2 = -heatLoss / (this.liquid.k * dh);
                        } else if (j === 0) {
                            const wallResistance = wallThickness / k_wall;
                            const heatLoss = (currentTemp - ambientTemp) / (wallResistance + 1 / h_conv);
                            d2T_dh2 = -heatLoss / (this.liquid.k * dh);
                        }
                        
                        const dT_dt = alpha * (d2T_dr2 + (r > 0 ? dT_dr / r : 0) + d2T_dh2);
                        newData[i][j][k] = Math.max(ambientTemp, Math.min(this.params.initialTemp, currentTemp + dT_dt * dt));
                    }
                }
            }
            
            this.grid.data = newData;
            
            if (step % 5 === 0) {
                this.timeSteps.push(this.cloneGrid());
            }
        }
        
        return this.timeSteps;
    }
    
    getTemperatureAtPosition(x, y, z, timeIndex) {
        if (!this.timeSteps || !this.timeSteps[timeIndex]) return this.params.initialTemp;
        
        const grid = this.timeSteps[timeIndex];
        const { rMax, hMax, nr, nh } = grid;
        
        const r = Math.sqrt(x * x + z * z);
        
        if (r > rMax) {
            return this.params.ambientTemp;
        }
        
        const h = y + hMax / 2;
        
        if (h < 0 || h > hMax) {
            return this.params.ambientTemp;
        }
        
        const i = Math.floor(r / grid.dr);
        const j = Math.floor(h / grid.dh);
        
        const i_clamped = Math.max(0, Math.min(nr - 1, i));
        const j_clamped = Math.max(0, Math.min(nh - 1, j));
        
        return grid.data[i_clamped][j_clamped][0];
    }
    
    getProbeData(x, y, z) {
        const data = [];
        if (!this.timeSteps || this.timeSteps.length === 0) return data;
        
        for (let t = 0; t < this.timeSteps.length; t++) {
            const time = t * this.timeStep * 5;
            const temp = this.getTemperatureAtPosition(x, y, z, t);
            data.push({ time, temp });
        }
        return data;
    }
    
    generateDrinkingStrategy() {
        const { targetMinTemp, targetMaxTemp } = this.params;
        const strategy = {
            phases: [],
            recommendations: []
        };
        
        const analyzePhase = (timeStart, timeEnd, description) => {
            const temps = [];
            const stepSize = Math.max(1, Math.floor((timeEnd - timeStart) / 10));
            for (let t = timeStart; t <= timeEnd; t += stepSize) {
                const timeIndex = Math.floor(t / 5);
                if (timeIndex >= 0 && timeIndex < this.timeSteps.length) {
                    const centerTemp = this.getTemperatureAtPosition(0, 0, 0, timeIndex);
                    const edgeTemp = this.getTemperatureAtPosition(
                        Math.max(0.1, this.grid.rMax * 0.8), 0, 0, timeIndex
                    );
                    const surfaceTemp = this.getTemperatureAtPosition(
                        0, Math.max(0.1, this.grid.hMax * 0.8), 0, timeIndex
                    );
                    temps.push({ centerTemp, edgeTemp, surfaceTemp });
                }
            }
            
            if (temps.length === 0) {
                return {
                    timeRange: `${timeStart}s - ${timeEnd}s`,
                    description,
                    bestPosition: '',
                    temps: { avgCenter: this.params.initialTemp, avgEdge: this.params.initialTemp, avgSurface: this.params.initialTemp }
                };
            }
            
            const avgCenter = temps.reduce((sum, t) => sum + t.centerTemp, 0) / temps.length;
            const avgEdge = temps.reduce((sum, t) => sum + t.edgeTemp, 0) / temps.length;
            const avgSurface = temps.reduce((sum, t) => sum + t.surfaceTemp, 0) / temps.length;
            
            let bestPosition = '';
            if (avgSurface >= targetMinTemp && avgSurface <= targetMaxTemp) {
                bestPosition = '液面表层';
            } else if (avgEdge >= targetMinTemp && avgEdge <= targetMaxTemp) {
                bestPosition = '杯壁附近';
            } else if (avgCenter >= targetMinTemp && avgCenter <= targetMaxTemp) {
                bestPosition = '杯中心';
            } else if (avgCenter > targetMaxTemp && avgEdge < targetMaxTemp) {
                bestPosition = '从杯壁向中心过渡';
            }
            
            return {
                timeRange: `${timeStart}s - ${timeEnd}s`,
                description,
                bestPosition,
                temps: { avgCenter, avgEdge, avgSurface }
            };
        };
        
        strategy.phases = [
            analyzePhase(0, 60, '初始阶段 - 高温散热期'),
            analyzePhase(60, 180, '快速降温期'),
            analyzePhase(180, 300, '平稳降温期'),
            analyzePhase(300, 480, '缓慢降温期'),
            analyzePhase(480, 600, '接近环境温度')
        ];
        
        for (const phase of strategy.phases) {
            if (phase.bestPosition) {
                strategy.recommendations.push({
                    time: phase.timeRange,
                    action: `建议从${phase.bestPosition}饮用`,
                    reason: this.generateReason(phase)
                });
            }
        }
        
        const optimalStart = this.findOptimalStartTime();
        if (optimalStart) {
            strategy.optimalStartTime = optimalStart;
        }
        
        return strategy;
    }
    
    generateReason(phase) {
        const { targetMinTemp, targetMaxTemp } = this.params;
        const { avgCenter, avgEdge, avgSurface } = phase.temps;
        
        if (avgSurface >= targetMinTemp && avgSurface <= targetMaxTemp) {
            return `液面温度(${avgSurface.toFixed(1)}°C)正处于理想范围，表层散热较快，是饮用的最佳时机。`;
        }
        if (avgEdge >= targetMinTemp && avgEdge <= targetMaxTemp) {
            return `杯壁附近温度(${avgEdge.toFixed(1)}°C)适中，通过杯壁传导散热后已降至适宜温度。`;
        }
        if (avgCenter >= targetMinTemp && avgCenter <= targetMaxTemp) {
            return `杯中心温度(${avgCenter.toFixed(1)}°C)达到理想范围，此时整体温度分布较为均匀。`;
        }
        return `根据热传导模拟，此阶段${phase.bestPosition}的温度最接近目标范围。`;
    }
    
    findOptimalStartTime() {
        const { targetMinTemp, targetMaxTemp } = this.params;
        
        for (let t = 0; t < this.timeSteps.length; t++) {
            const centerTemp = this.getTemperatureAtPosition(0, 0, 0, t);
            if (centerTemp <= targetMaxTemp && centerTemp >= targetMinTemp) {
                return t * this.timeStep * 5;
            }
        }
        return null;
    }
}