class WaterSimulatorApp {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mesh = null;
        this.cupMesh = null;
        this.probePoint = null;
        
        this.physicsEngine = null;
        this.timeSteps = [];
        this.currentTimeIndex = 0;
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
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#636E72',
                            font: { size: 11 },
                            usePointStyle: true,
                            padding: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(248, 249, 250, 0.95)',
                        titleColor: '#2D3436',
                        bodyColor: '#636E72',
                        borderColor: '#DEE2E6',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(222, 226, 230, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#95A5A6',
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: '时间 (秒)',
                            color: '#95A5A6',
                            font: { size: 12, weight: 500 }
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(222, 226, 230, 0.5)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#95A5A6',
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: '温度 (°C)',
                            color: '#95A5A6',
                            font: { size: 12, weight: 500 }
                        },
                        min: 0,
                        max: 100
                    }
                }
            }
        });
    }
    
    startSimulation() {
        this.updateStatus('计算中...', true);
        
        setTimeout(() => {
            try {
                this.physicsEngine = new HeatConductionEngine(this.params);
                this.timeSteps = this.physicsEngine.solve();
                
                console.log('计算完成，时间步数:', this.timeSteps.length);
                
                this.init3DScene();
                this.updateVisualization();
                this.generateAdvice();
                
                if (this.timeSteps.length > 0) {
                    document.getElementById('time-slider').max = this.timeSteps.length - 1;
                    document.getElementById('time-slider').value = 0;
                }
                
                this.updateStatus('计算完成', false);
            } catch (error) {
                console.error('模拟计算失败:', error);
                this.updateStatus('计算失败', false);
            }
        }, 100);
    }
    
    resetSimulation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.currentTimeIndex = 0;
        this.probes = [];
        
        if (this.tempChart) {
            this.tempChart.data.datasets = [];
            this.tempChart.data.labels = [];
            this.tempChart.update();
        }
        
        document.getElementById('time-slider').value = 0;
        document.getElementById('time-display').textContent = '00:00';
        
        document.getElementById('advice-card').innerHTML = `
            <h4>🧠 AI 饮水策略分析</h4>
            <p>点击「开始模拟计算」按钮，系统将基于物理信息神经网络进行热传导模拟，为您生成最优饮水方案。</p>
            <div class="strategy">
                <strong>💡 提示：</strong>点击3D模型任意位置放置探针，可查看该点的温度变化曲线。
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
        this.scene.background = new THREE.Color(0xFFFFFF);
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.position.set(0, 60, 200);
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);
        
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 100;
        this.controls.maxDistance = 400;
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(60, 120, 60);
        this.scene.add(directionalLight);
        
        const pointLight = new THREE.PointLight(0xFF5A5F, 0.2);
        pointLight.position.set(-40, 80, -40);
        this.scene.add(pointLight);
        
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
            color: 0xDEE2E6,
            transparent: true,
            opacity: 0.5,
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
        const rings = 24;
        
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
            opacity: 0.95,
            shininess: 120
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = (height - liquidHeight) / 2 - wallThickness;
        this.scene.add(this.mesh);
    }
    
    tempToColor(temp) {
        const minTemp = this.params.ambientTemp;
        const maxTemp = this.params.initialTemp;
        const tempRange = maxTemp - minTemp;
        
        if (tempRange <= 0) {
            return { r: 0.7, g: 0.7, b: 0.7 };
        }
        
        const normalized = Math.max(0, Math.min(1, (temp - minTemp) / tempRange));
        
        if (normalized < 0.3) {
            const t = normalized / 0.3;
            return { r: 0.1 + t * 0.2, g: 0.5 + t * 0.4, b: 0.8 + t * 0.2 };
        } else if (normalized < 0.6) {
            const t = (normalized - 0.3) / 0.3;
            return { r: 0.3, g: 0.9 - t * 0.4, b: 1 - t * 0.5 };
        } else if (normalized < 0.8) {
            const t = (normalized - 0.6) / 0.2;
            return { r: 0.3 + t * 0.7, g: 0.5 - t * 0.2, b: 0.5 - t * 0.5 };
        } else {
            const t = (normalized - 0.8) / 0.2;
            return { r: 1, g: 0.3 - t * 0.3, b: 0 };
        }
    }
    
    updateVisualization() {
        if (!this.mesh || !this.physicsEngine || !this.timeSteps[this.currentTimeIndex]) return;
        
        const grid = this.timeSteps[this.currentTimeIndex];
        const positions = this.mesh.geometry.attributes.position;
        const colors = this.mesh.geometry.attributes.color;
        const { height, wallThickness } = this.params;
        const liquidHeight = height - wallThickness * 2 - 2;
        const liquidBaseY = (height - liquidHeight) / 2 - wallThickness;
        
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i) + liquidBaseY;
            const z = positions.getZ(i);
            
            const temp = this.physicsEngine.getTemperatureAtPosition(x, y, z, this.currentTimeIndex);
            const color = this.tempToColor(temp);
            
            colors.setXYZ(i, color.r, color.g, color.b);
        }
        
        colors.needsUpdate = true;
        
        if (this.probePoint) {
            const probeY = this.probePoint.position.y + liquidBaseY;
            const probeTemp = this.physicsEngine.getTemperatureAtPosition(
                this.probePoint.position.x,
                probeY,
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
                
                const probeGeometry = new THREE.SphereGeometry(2.5, 16, 16);
                const probeMaterial = new THREE.MeshBasicMaterial({ color: 0xFF5A5F });
                this.probePoint = new THREE.Mesh(probeGeometry, probeMaterial);
                this.probePoint.position.copy(point);
                this.scene.add(this.probePoint);
                
                this.currentProbePosition = { x: point.x, y: point.y, z: point.z };
                
                document.getElementById('probe-x').textContent = point.x.toFixed(1);
                document.getElementById('probe-y').textContent = point.y.toFixed(1);
                document.getElementById('probe-z').textContent = point.z.toFixed(1);
                
                const { height, wallThickness } = this.params;
                const liquidHeight = height - wallThickness * 2 - 2;
                const liquidBaseY = (height - liquidHeight) / 2 - wallThickness;
                const probeY = point.y + liquidBaseY;
                
                const temp = this.physicsEngine.getTemperatureAtPosition(
                    point.x,
                    probeY,
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
        
        const { height, wallThickness } = this.params;
        const liquidHeight = height - wallThickness * 2 - 2;
        const liquidBaseY = (height - liquidHeight) / 2 - wallThickness;
        const probeY = this.currentProbePosition.y + liquidBaseY;
        
        const data = this.physicsEngine.getProbeData(
            this.currentProbePosition.x,
            probeY,
            this.currentProbePosition.z
        );
        
        const colors = ['#FF5A5F', '#00A699', '#FFD700', '#FF69B4', '#00D4FF', '#FC642D'];
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
            pointRadius: 0,
            pointHoverRadius: 6
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
        
        html += `<div style="margin-top: 16px;">`;
        
        for (const phase of strategy.phases) {
            html += `
                <div class="phase-card">
                    <div class="phase-header">
                        <span class="phase-time">${phase.timeRange}</span>
                        <span class="phase-name">${phase.description}</span>
                    </div>
                    <div class="phase-temps">
                        <span>中心: ${phase.temps.avgCenter.toFixed(1)}°C</span>
                        <span>边缘: ${phase.temps.avgEdge.toFixed(1)}°C</span>
                        <span>表层: ${phase.temps.avgSurface.toFixed(1)}°C</span>
                    </div>
                    ${phase.bestPosition ? `<div class="phase-best">📍 ${phase.bestPosition}</div>` : ''}
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
        
        if (this.controls) {
            this.controls.update();
        }
        
        if (this.mesh) {
            this.mesh.rotation.y += 0.002;
        }
        
        this.renderer.render(this.scene, this.camera);
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