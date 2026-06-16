class WaterSimulatorApp {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.mesh = null;
        this.cupMesh = null;
        this.probePoint = null;
        
        this.physicsEngine = null;
        this.timeSteps = [];
        this.currentTimeIndex = 0;
        this.isPlaying = false;
        this.animationId = null;
        
        this.tempChart = null;
        this.probes = [];
        
        this.params = {
            shape: 'cylinder',
            diameter: 80,
            height: 120,
            wallThickness: 3,
            initialTemp: 85,
            ambientTemp: 25,
            targetMinTemp: 55,
            targetMaxTemp: 65,
            liquidType: 'tea'
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.initChart();
        this.updatePhysicsParamsDisplay();
    }
    
    setupEventListeners() {
        const updateParam = (sliderId, inputId, valueId, paramName, unit = '') => {
            const slider = document.getElementById(sliderId);
            const input = document.getElementById(inputId);
            const value = document.getElementById(valueId);
            
            const sync = (source) => {
                const val = parseInt(source.value);
                slider.value = val;
                input.value = val;
                value.textContent = val + unit;
                this.params[paramName] = val;
            };
            
            slider.addEventListener('input', () => sync(slider));
            input.addEventListener('input', () => sync(input));
        };
        
        updateParam('diameter-slider', 'diameter-input', 'diameter-value', 'diameter', 'mm');
        updateParam('height-slider', 'height-input', 'height-value', 'height', 'mm');
        updateParam('wall-thickness-slider', 'wall-thickness-input', 'wall-thickness-value', 'wallThickness', 'mm');
        updateParam('initial-temp-slider', 'initial-temp-input', 'initial-temp-value', 'initialTemp', '°C');
        updateParam('ambient-temp-slider', 'ambient-temp-input', 'ambient-temp-value', 'ambientTemp', '°C');
        
        document.getElementById('target-min-slider').addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            document.getElementById('target-min-value').textContent = val + '°C';
            this.params.targetMinTemp = val;
            this.updateTargetRangeDisplay();
        });
        
        document.getElementById('target-max-slider').addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            document.getElementById('target-max-value').textContent = val + '°C';
            this.params.targetMaxTemp = val;
            this.updateTargetRangeDisplay();
        });
        
        document.getElementById('shape-select').addEventListener('change', (e) => {
            this.params.shape = e.target.value;
            document.getElementById('shape-value').textContent = 
                e.target.options[e.target.selectedIndex].text;
        });
        
        document.querySelectorAll('.liquid-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.liquid-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.params.liquidType = opt.dataset.liquid;
                this.updatePhysicsParamsDisplay();
            });
        });
        
        document.getElementById('start-btn').addEventListener('click', () => this.startSimulation());
        document.getElementById('reset-btn').addEventListener('click', () => this.resetSimulation());
        
        document.getElementById('play-btn').addEventListener('click', () => this.togglePlay());
        document.getElementById('step-back-btn').addEventListener('click', () => this.stepBack());
        document.getElementById('step-forward-btn').addEventListener('click', () => this.stepForward());
        document.getElementById('time-slider').addEventListener('input', (e) => {
            this.currentTimeIndex = parseInt(e.target.value);
            this.updateVisualization();
            this.updateTimeDisplay();
        });
        
        document.getElementById('add-probe-btn').addEventListener('click', () => this.addProbeToChart());
    }
    
    updateTargetRangeDisplay() {
        document.getElementById('target-range').textContent = 
            `${this.params.targetMinTemp} - ${this.params.targetMaxTemp}°C`;
    }
    
    updatePhysicsParamsDisplay() {
        const props = {
            tea: { cp: 4186, k: 0.58, rho: 998, alpha: 1.41e-7 },
            coffee: { cp: 4050, k: 0.55, rho: 1010, alpha: 1.35e-7 },
            juice: { cp: 3850, k: 0.52, rho: 1050, alpha: 1.26e-7 },
            water: { cp: 4186, k: 0.60, rho: 998, alpha: 1.47e-7 }
        };
        
        const p = props[this.params.liquidType] || props.water;
        document.getElementById('cp-value').textContent = p.cp;
        document.getElementById('k-value').textContent = p.k;
        document.getElementById('rho-value').textContent = p.rho;
        document.getElementById('alpha-value').textContent = p.alpha.toExponential(2);
    }
    
    initChart() {
        const ctx = document.getElementById('temp-chart').getContext('2d');
        this.tempChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: []
            },
            options: {
                responsive: true,
                scales: {
                    x: {
                        title: { display: true, text: '时间 (秒)', color: '#666' },
                        ticks: { color: '#666' },
                        grid: { color: '#2a2a4a' }
                    },
                    y: {
                        title: { display: true, text: '温度 (°C)', color: '#666' },
                        ticks: { color: '#666' },
                        grid: { color: '#2a2a4a' },
                        min: 0,
                        max: 100
                    }
                },
                plugins: {
                    legend: {
                        labels: { color: '#aaa' }
                    }
                },
                interaction: {
                    mode: 'index',
                    intersect: false
                }
            }
        });
    }
    
    startSimulation() {
        this.updateStatus('计算中...', true);
        
        setTimeout(() => {
            this.physicsEngine = new HeatConductionEngine(this.params);
            this.timeSteps = this.physicsEngine.solve();
            
            this.init3DScene();
            this.updateVisualization();
            this.generateAdvice();
            
            document.getElementById('time-slider').max = this.timeSteps.length - 1;
            document.getElementById('time-slider').value = 0;
            
            this.updateStatus('计算完成', false);
        }, 100);
    }
    
    resetSimulation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.isPlaying = false;
        this.currentTimeIndex = 0;
        this.probes = [];
        
        if (this.tempChart) {
            this.tempChart.data.datasets = [];
            this.tempChart.data.labels = [];
            this.tempChart.update();
        }
        
        document.getElementById('time-slider').value = 0;
        document.getElementById('time-display').textContent = '00:00';
        document.getElementById('play-btn').textContent = '▶';
        
        document.getElementById('advice-card').innerHTML = `
            <h4>🧠 AI 饮水策略分析</h4>
            <p>点击「开始模拟计算」按钮，系统将基于PINN物理信息神经网络进行热传导模拟，为您生成最优饮水方案。</p>
            <div class="strategy">
                <strong>提示：</strong>使用探针功能在3D模型中点击任意位置，可查看该点的温度变化曲线。
            </div>
        `;
        
        document.getElementById('probe-info').classList.remove('active');
        
        if (this.renderer) {
            this.renderer.dispose();
            document.getElementById('canvas-container').innerHTML = '';
        }
        
        this.updateStatus('准备就绪', false);
    }
    
    init3DScene() {
        const container = document.getElementById('canvas-container');
        container.innerHTML = '';
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a15);
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.position.set(0, 50, 150);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(50, 100, 50);
        this.scene.add(directionalLight);
        
        this.createCup();
        this.createLiquid();
        
        this.setupRaycaster();
        
        window.addEventListener('resize', () => this.onWindowResize());
        
        this.animate();
    }
    
    createCup() {
        const { diameter, height, wallThickness } = this.params;
        const innerRadius = diameter / 2 - wallThickness;
        const outerRadius = diameter / 2;
        
        const geometry = new THREE.CylinderGeometry(innerRadius, outerRadius, height, 32, 1, true);
        const material = new THREE.MeshPhongMaterial({
            color: 0x4a4a6a,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide
        });
        
        this.cupMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.cupMesh);
    }
    
    createLiquid() {
        const { diameter, height, wallThickness } = this.params;
        const radius = diameter / 2 - wallThickness - 1;
        const liquidHeight = height - wallThickness * 2 - 2;
        
        const segments = 32;
        const rings = 20;
        
        const geometry = new THREE.CylinderGeometry(radius, radius, liquidHeight, segments, rings);
        const positions = geometry.attributes.position;
        
        const colors = new Float32Array(positions.count * 3);
        
        for (let i = 0; i < positions.count; i++) {
            const temp = this.params.initialTemp;
            const color = this.tempToColor(temp);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.MeshPhongMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            shininess: 100
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = -1;
        this.scene.add(this.mesh);
    }
    
    tempToColor(temp) {
        const minTemp = this.params.ambientTemp;
        const maxTemp = this.params.initialTemp;
        
        const normalized = Math.max(0, Math.min(1, (temp - minTemp) / (maxTemp - minTemp)));
        
        if (normalized < 0.3) {
            const t = normalized / 0.3;
            return { r: 0, g: t, b: 1 };
        } else if (normalized < 0.6) {
            const t = (normalized - 0.3) / 0.3;
            return { r: 0, g: 1, b: 1 - t };
        } else if (normalized < 0.8) {
            const t = (normalized - 0.6) / 0.2;
            return { r: t, g: 1 - t * 0.5, b: 0 };
        } else {
            const t = (normalized - 0.8) / 0.2;
            return { r: 1, g: 0.5 - t * 0.5, b: 0 };
        }
    }
    
    updateVisualization() {
        if (!this.mesh || !this.timeSteps[this.currentTimeIndex]) return;
        
        const grid = this.timeSteps[this.currentTimeIndex];
        const positions = this.mesh.geometry.attributes.position;
        const colors = this.mesh.geometry.attributes.color;
        
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i) + (this.params.height - this.params.wallThickness * 2) / 2;
            const z = positions.getZ(i);
            
            const temp = this.physicsEngine.getTemperatureAtPosition(x, y, z, this.currentTimeIndex);
            const color = this.tempToColor(temp);
            
            colors.setXYZ(i, color.r, color.g, color.b);
        }
        
        colors.needsUpdate = true;
        
        if (this.probePoint) {
            const probeTemp = this.physicsEngine.getTemperatureAtPosition(
                this.probePoint.position.x,
                this.probePoint.position.y + (this.params.height - this.params.wallThickness * 2) / 2,
                this.probePoint.position.z,
                this.currentTimeIndex
            );
            
            document.getElementById('probe-temp').textContent = probeTemp.toFixed(1);
        }
    }
    
    setupRaycaster() {
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        
        const onClick = (event) => {
            if (!this.mesh) return;
            
            const rect = this.renderer.domElement.getBoundingClientRect();
            mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            
            raycaster.setFromCamera(mouse, this.camera);
            
            const intersects = raycaster.intersectObject(this.mesh);
            
            if (intersects.length > 0) {
                const point = intersects[0].point;
                
                if (this.probePoint) {
                    this.scene.remove(this.probePoint);
                }
                
                const probeGeometry = new THREE.SphereGeometry(3, 16, 16);
                const probeMaterial = new THREE.MeshBasicMaterial({ color: 0xff6b6b });
                this.probePoint = new THREE.Mesh(probeGeometry, probeMaterial);
                this.probePoint.position.copy(point);
                this.scene.add(this.probePoint);
                
                this.currentProbePosition = { x: point.x, y: point.y, z: point.z };
                
                document.getElementById('probe-x').textContent = point.x.toFixed(1);
                document.getElementById('probe-y').textContent = point.y.toFixed(1);
                document.getElementById('probe-z').textContent = point.z.toFixed(1);
                
                const temp = this.physicsEngine.getTemperatureAtPosition(
                    point.x,
                    point.y + (this.params.height - this.params.wallThickness * 2) / 2,
                    point.z,
                    this.currentTimeIndex
                );
                
                document.getElementById('probe-temp').textContent = temp.toFixed(1);
                document.getElementById('probe-info').classList.add('active');
            }
        };
        
        this.renderer.domElement.addEventListener('click', onClick);
    }
    
    addProbeToChart() {
        if (!this.currentProbePosition || !this.physicsEngine) return;
        
        const data = this.physicsEngine.getProbeData(
            this.currentProbePosition.x,
            this.currentProbePosition.y + (this.params.height - this.params.wallThickness * 2) / 2,
            this.currentProbePosition.z
        );
        
        const colors = ['#00d4ff', '#ff6b6b', '#00ff88', '#ffd700', '#ff69b4'];
        const color = colors[this.probes.length % colors.length];
        
        const label = `位置 (${this.currentProbePosition.x.toFixed(1)}, ${this.currentProbePosition.y.toFixed(1)}, ${this.currentProbePosition.z.toFixed(1)})`;
        
        this.tempChart.data.labels = data.map(d => d.time);
        this.tempChart.data.datasets.push({
            label: label,
            data: data.map(d => d.temp),
            borderColor: color,
            backgroundColor: color + '22',
            borderWidth: 2,
            tension: 0.4,
            fill: false,
            pointRadius: 0
        });
        
        this.tempChart.update();
        this.probes.push({ position: this.currentProbePosition, color });
    }
    
    generateAdvice() {
        if (!this.physicsEngine) return;
        
        const strategy = this.physicsEngine.generateDrinkingStrategy();
        const adviceCard = document.getElementById('advice-card');
        
        let html = `<h4>🧠 AI 饮水策略分析</h4>`;
        
        if (strategy.optimalStartTime !== null) {
            const minutes = Math.floor(strategy.optimalStartTime / 60);
            const seconds = strategy.optimalStartTime % 60;
            html += `<p><strong>最佳饮用时间：</strong>等待约 ${minutes}分${seconds}秒 后开始饮用</p>`;
        }
        
        html += `<div style="margin-top: 15px;">`;
        
        for (const phase of strategy.phases) {
            const isGood = phase.bestPosition && 
                phase.temps.avgCenter >= this.params.targetMinTemp && 
                phase.temps.avgCenter <= this.params.targetMaxTemp;
            
            html += `
                <div style="margin-bottom: 10px; padding: 8px; background: ${isGood ? '#00d4ff11' : '#2a2a4a'}; border-radius: 4px;">
                    <div style="font-size: 11px; color: #00d4ff; margin-bottom: 4px;">${phase.timeRange} - ${phase.description}</div>
                    <div style="font-size: 10px; color: #aaa;">
                        中心: ${phase.temps.avgCenter.toFixed(1)}°C | 
                        边缘: ${phase.temps.avgEdge.toFixed(1)}°C | 
                        表层: ${phase.temps.avgSurface.toFixed(1)}°C
                    </div>
                    ${phase.bestPosition ? `<div style="font-size: 11px; color: #00ff88; margin-top: 4px;">📍 ${phase.bestPosition}</div>` : ''}
                </div>
            `;
        }
        
        html += `</div>`;
        
        html += `
            <div class="strategy">
                <strong>💡 专家建议：</strong>${this.generateDrinkingTips(strategy)}
            </div>
        `;
        
        adviceCard.innerHTML = html;
    }
    
    generateDrinkingTips(strategy) {
        const tips = [
            '前5分钟建议从杯口边缘饮用，因为表层散热最快',
            '5-15分钟可尝试从杯壁附近小口啜饮',
            '15-30分钟后杯中心温度逐渐均匀，是畅饮的最佳时机',
            '记得适时搅拌，促进热量均匀分布',
            '使用隔热杯套可以延长最佳饮用时间窗口'
        ];
        
        return tips.join('</br>');
    }
    
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        if (this.isPlaying && this.currentTimeIndex < this.timeSteps.length - 1) {
            this.currentTimeIndex++;
            document.getElementById('time-slider').value = this.currentTimeIndex;
            this.updateVisualization();
            this.updateTimeDisplay();
        }
        
        if (this.mesh) {
            this.mesh.rotation.y += 0.002;
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    togglePlay() {
        this.isPlaying = !this.isPlaying;
        document.getElementById('play-btn').textContent = this.isPlaying ? '⏸' : '▶';
    }
    
    stepBack() {
        this.currentTimeIndex = Math.max(0, this.currentTimeIndex - 1);
        document.getElementById('time-slider').value = this.currentTimeIndex;
        this.updateVisualization();
        this.updateTimeDisplay();
    }
    
    stepForward() {
        if (this.timeSteps.length > 0) {
            this.currentTimeIndex = Math.min(this.timeSteps.length - 1, this.currentTimeIndex + 1);
            document.getElementById('time-slider').value = this.currentTimeIndex;
            this.updateVisualization();
            this.updateTimeDisplay();
        }
    }
    
    updateTimeDisplay() {
        const totalSeconds = this.currentTimeIndex * 5;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        document.getElementById('time-display').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    updateStatus(text, isComputing) {
        const statusText = document.getElementById('status-text');
        statusText.textContent = text;
        statusText.className = isComputing ? 'computing' : '';
    }
    
    onWindowResize() {
        const container = document.getElementById('canvas-container');
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new WaterSimulatorApp();
});