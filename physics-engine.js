class HeatConductionEngine {
    constructor(params) {
        this.params = params;
        this.grid = null;
        this.timeSteps = [];
        this.maxTime = 600;
        this.numTimeSteps = 100;
        this.cachedData = {};
        
        this.wallMaterials = {
            ceramic: { k: 1.5, insulation: 0.6, name: '陶瓷' },
            glass: { k: 1.0, insulation: 0.7, name: '玻璃' },
            stainless_steel: { k: 17.0, insulation: 0.15, name: '不锈钢' },
            plastic: { k: 0.3, insulation: 0.85, name: '塑料' },
            silicone: { k: 0.25, insulation: 0.9, name: '硅胶' }
        };
        
        this.currentMaterial = this.wallMaterials[params.wallMaterial] || this.wallMaterials.ceramic;
    }
    
    initGrid() {
        const { diameter, height, wallThickness } = this.params;
        
        this.rMax = diameter / 2 - wallThickness;
        this.hMax = height - wallThickness * 2;
        
        this.nr = 20;
        this.nh = 24;
        
        this.dr = this.rMax / (this.nr - 1);
        this.dh = this.hMax / (this.nh - 1);
        
        this.grid = [];
        for (let i = 0; i < this.nr; i++) {
            this.grid[i] = [];
            for (let j = 0; j < this.nh; j++) {
                this.grid[i][j] = this.params.initialTemp;
            }
        }
        
        this.timeSteps.push(this.cloneGrid());
    }
    
    cloneGrid() {
        return this.grid.map(row => [...row]);
    }
    
    solve() {
        this.initGrid();
        
        const { ambientTemp, initialTemp, wallMaterial } = this.params;
        
        this.currentMaterial = this.wallMaterials[wallMaterial] || this.wallMaterials.ceramic;
        const insulationFactor = this.currentMaterial.insulation;
        
        const baseCoolingRate = 0.003;
        const edgeCoolingFactor = 5.0 * (1 - insulationFactor * 0.5);
        const surfaceCoolingFactor = 6.0 * (1 - insulationFactor * 0.3);
        
        console.log('=== 物理引擎开始计算 ===');
        console.log(`杯壁材料: ${this.currentMaterial.name} (导热系数: ${this.currentMaterial.k} W/m·°C)`);
        console.log(`保温系数: ${insulationFactor}`);
        console.log(`初始温度: ${initialTemp}°C, 环境温度: ${ambientTemp}°C`);
        console.log(`网格: ${this.nr}×${this.nh}`);
        
        for (let step = 0; step < this.numTimeSteps; step++) {
            const newGrid = this.cloneGrid();
            
            for (let i = 0; i < this.nr; i++) {
                for (let j = 0; j < this.nh; j++) {
                    const rRatio = i / (this.nr - 1);
                    const hRatio = j / (this.nh - 1);
                    
                    let coolingMultiplier = 1.0;
                    
                    if (rRatio > 0.6) {
                        const wallLoss = (rRatio - 0.6) * 2.5 * edgeCoolingFactor;
                        coolingMultiplier += wallLoss * insulationFactor;
                    }
                    
                    if (hRatio > 0.75) {
                        const surfaceLoss = (hRatio - 0.75) * 4 * surfaceCoolingFactor;
                        coolingMultiplier += surfaceLoss * insulationFactor;
                    }
                    
                    if (rRatio < 0.4 && hRatio < 0.4) {
                        coolingMultiplier *= 0.5 * (1 - insulationFactor * 0.3);
                    }
                    
                    const tempDiff = this.grid[i][j] - ambientTemp;
                    const cooling = tempDiff * baseCoolingRate * coolingMultiplier;
                    
                    newGrid[i][j] -= cooling;
                    
                    if (newGrid[i][j] < ambientTemp) {
                        newGrid[i][j] = ambientTemp;
                    }
                }
            }
            
            const diffusionRate = 0.15 + insulationFactor * 0.1;
            for (let i = 1; i < this.nr - 1; i++) {
                for (let j = 1; j < this.nh - 1; j++) {
                    const avgNeighbor = (
                        newGrid[i + 1][j] + newGrid[i - 1][j] +
                        newGrid[i][j + 1] + newGrid[i][j - 1]
                    ) / 4;
                    newGrid[i][j] = newGrid[i][j] * (1 - diffusionRate) + avgNeighbor * diffusionRate;
                }
            }
            
            this.grid = newGrid;
            this.timeSteps.push(this.cloneGrid());
        }
        
        const centerTemp = this.grid[Math.floor(this.nr/2)][Math.floor(this.nh/2)];
        const edgeTemp = this.grid[this.nr-1][Math.floor(this.nh/2)];
        const surfaceTemp = this.grid[Math.floor(this.nr/2)][this.nh-1];
        
        console.log(`=== 计算完成 ===`);
        console.log(`时间步数: ${this.timeSteps.length}`);
        console.log(`最终时刻 - 中心: ${centerTemp.toFixed(2)}°C, 边缘: ${edgeTemp.toFixed(2)}°C, 表层: ${surfaceTemp.toFixed(2)}°C`);
        
        return this.timeSteps;
    }
    
    getTemperatureAtPosition(x, y, z, timeIndex) {
        if (!this.timeSteps || !this.timeSteps[timeIndex]) {
            console.warn(`时间索引 ${timeIndex} 无效，总步数 ${this.timeSteps?.length || 0}`);
            return this.params.initialTemp;
        }
        
        const grid = this.timeSteps[timeIndex];
        const r = Math.sqrt(x * x + z * z);
        
        if (r > this.rMax) {
            return this.params.ambientTemp;
        }
        
        if (y < 0 || y > this.hMax) {
            return this.params.ambientTemp;
        }
        
        const i = Math.floor(r / this.dr);
        const j = Math.floor(y / this.dh);
        
        const i_clamped = Math.max(0, Math.min(this.nr - 1, i));
        const j_clamped = Math.max(0, Math.min(this.nh - 1, j));
        
        return grid[i_clamped][j_clamped];
    }
    
    getProbeData(x, y, z) {
        const data = [];
        if (!this.timeSteps || this.timeSteps.length === 0) return data;
        
        const timeStepSize = this.maxTime / this.numTimeSteps;
        
        for (let t = 0; t < this.timeSteps.length; t++) {
            const time = t * timeStepSize;
            const temp = this.getTemperatureAtPosition(x, y, z, t);
            data.push({ time, temp });
        }
        return data;
    }
    
    generateDrinkingStrategy(material = null) {
        const { targetMinTemp, targetMaxTemp } = this.params;
        const strategy = {
            phases: [],
            recommendations: [],
            material: material || this.currentMaterial
        };
        
        const timeStepSize = this.maxTime / this.numTimeSteps;
        const insulationFactor = strategy.material.insulation || 0.5;
        
        const analyzePhase = (timeStart, timeEnd, description) => {
            const temps = [];
            const stepSize = Math.max(1, Math.floor((timeEnd - timeStart) / timeStepSize / 10));
            for (let t = Math.floor(timeStart / timeStepSize); t <= Math.floor(timeEnd / timeStepSize); t += stepSize) {
                if (t >= 0 && t < this.timeSteps.length) {
                    const centerTemp = this.getTemperatureAtPosition(0, this.hMax / 2, 0, t);
                    const edgeTemp = this.getTemperatureAtPosition(
                        Math.max(1, this.rMax * 0.8), this.hMax / 2, 0, t
                    );
                    const surfaceTemp = this.getTemperatureAtPosition(
                        0, Math.max(1, this.hMax * 0.9), 0, t
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
        const timeStepSize = this.maxTime / this.numTimeSteps;
        
        for (let t = 0; t < this.timeSteps.length; t++) {
            const centerTemp = this.getTemperatureAtPosition(0, this.hMax / 2, 0, t);
            if (centerTemp <= targetMaxTemp && centerTemp >= targetMinTemp) {
                return t * timeStepSize;
            }
        }
        return null;
    }
}