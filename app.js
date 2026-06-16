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
        
        this.useWebGL = true;
        
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
                console.log('物理引擎实例:', this.physicsEngine);
                
                this.initVisualization();
                
                if (this.timeSteps.length > 0) {
                    document.getElementById('time-slider').max = this.timeSteps.length - 1;
                    document.getElementById('time-slider').value = 0;
                    this.currentTimeIndex = 0;
                    this.updateVisualization();
                    this.updateTimeDisplay();
                }
                
                this.generateAdvice();
                this.updateStatus('计算完成', false);
            } catch (error) {
                console.error('模拟计算失败:', error);
                this.updateStatus('计算失败', false);
            }
        }, 100);
    }
    
    initVisualization() {
        const container = document.getElementById('canvas-container');
        container.innerHTML = '';
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mesh = null;
        this.cupMesh = null;
        
        if (this.detectWebGL()) {
            this.init3DScene();
        } else {
            this.init2DHeatmap();
        }
    }
    
    detectWebGL() {
        try {
            const canvas = document.createElement('canvas');
            const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
            return gl && gl instanceof WebGLRenderingContext;
        } catch (e) {
            return false;
        }
    }
    
    init3DScene() {
        const container = document.getElementById('canvas-container');
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xFFFFFF);
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.position.set(0, 60, 200);
        
        try {
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
            this.useWebGL = true;
        } catch (e) {
            console.error('WebGL初始化失败，切换到2D热力图:', e);
            this.useWebGL = false;
            this.init2DHeatmap();
        }
    }
    
    init2DHeatmap() {
        const container = document.getElementById('canvas-container');
        
        const canvas = document.createElement('canvas');
        canvas.id = 'heatmap-canvas';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.cursor = 'crosshair';
        container.appendChild(canvas);
        
        this.heatmapCanvas = canvas;
        this.heatmapCtx = canvas.getContext('2d');
        
        this.resizeHeatmap();
        this.draw2DHeatmap();
        
        canvas.addEventListener('click', (e) => this.handleHeatmapClick(e));
        window.addEventListener('resize', () => this.resizeHeatmap());
        
        this.useWebGL = false;
    }
    
    resizeHeatmap() {
        if (!this.heatmapCanvas) return;
        const container = document.getElementById('canvas-container');
        this.heatmapCanvas.width = container.clientWidth;
        this.heatmapCanvas.height = container.clientHeight;
        this.draw2DHeatmap();
    }
    
    draw2DHeatmap() {
        if (!this.heatmapCtx || !this.physicsEngine) return;
        
        const ctx = this.heatmapCtx;
        const width = this.heatmapCanvas.width;
        const height = this.heatmapCanvas.height;
        
        ctx.clearRect(0, 0, width, height);
        
        const grid = this.timeSteps[this.currentTimeIndex];
        const { rMax, hMax } = this.physicsEngine;
        
        const scaleX = width / (rMax * 2);
        const scaleY = height / hMax;
        const offsetX = width / 2;
        const offsetY = height;
        
        const centerX = width / 2;
        const centerY = height / 2;
        const liquidRadius = Math.min(width, height) * 0.35;
        const liquidHeight = liquidRadius * 1.4;
        
        ctx.beginPath();
        ctx.roundRect(centerX - liquidRadius, centerY - liquidHeight/2, liquidRadius * 2, liquidHeight, 8);
        ctx.fillStyle = 'rgba(222, 226, 230, 0.3)';
        ctx.fill();
        ctx.strokeStyle = '#DEE2E6';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        const probeSpacing = 4;
        const probeCountX = Math.floor(width / probeSpacing);
        const probeCountY = Math.floor(height / probeSpacing);
        
        for (let py = 0; py < probeCountY; py++) {
            for (let px = 0; px < probeCountX; px++) {
                const screenX = px * probeSpacing;
                const screenY = py * probeSpacing;
                
                const relX = screenX - centerX;
                const relY = centerY - screenY;
                
                const r = Math.sqrt(relX * relX) / liquidRadius * rMax;
                const h = relY / liquidHeight * hMax;
                
                if (r <= rMax && h >= 0 && h <= hMax) {
                    const temp = this.physicsEngine.getTemperatureAtPosition(r, h, 0, this.currentTimeIndex);
                    const color = this.tempToColor(temp);
                    
                    ctx.fillStyle = `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, 0.8)`;
                    ctx.fillRect(screenX, screenY, probeSpacing - 1, probeSpacing - 1);
                }
            }
        }
        
        ctx.beginPath();
        ctx.roundRect(centerX - liquidRadius, centerY - liquidHeight/2, liquidRadius * 2, liquidHeight, 8);
        ctx.strokeStyle = '#FF5A5F';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#636E72';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('点击任意位置查看温度', centerX, centerY + liquidHeight/2 + 24);
        
        if (this.currentProbePosition) {
            const probeScreenX = centerX + this.currentProbePosition.x / rMax * liquidRadius;
            const probeScreenY = centerY - this.currentProbePosition.y / hMax * liquidHeight;
            
            ctx.beginPath();
            ctx.arc(probeScreenX, probeScreenY, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#FF5A5F';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(probeScreenX, probeScreenY, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fill();
            
            const probeTemp = this.physicsEngine.getTemperatureAtPosition(
                this.currentProbePosition.x,
                this.currentProbePosition.y,
                0,
                this.currentTimeIndex
            );
            
            ctx.fillStyle = '#FF5A5F';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(probeTemp.toFixed(1) + '°C', probeScreenX, probeScreenY + 4);
        }
    }
    
    handleHeatmapClick(e) {
        if (!this.physicsEngine) return;
        
        const rect = this.heatmapCanvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        
        const centerX = this.heatmapCanvas.width / 2;
        const centerY = this.heatmapCanvas.height / 2;
        const { rMax, hMax } = this.physicsEngine;
        
        const liquidRadius = Math.min(this.heatmapCanvas.width, this.heatmapCanvas.height) * 0.35;
        const liquidHeight = liquidRadius * 1.4;
        
        const relX = screenX - centerX;
        const relY = centerY - screenY;
        
        const r = Math.sqrt(relX * relX) / liquidRadius * rMax;
        const h = relY / liquidHeight * hMax;
        
        if (r <= rMax && h >= 0 && h <= hMax) {
            this.currentProbePosition = { x: r, y: h, z: 0 };
            
            document.getElementById('probe-x').textContent = r.toFixed(1);
            document.getElementById('probe-y').textContent = h.toFixed(1);
            document.getElementById('probe-z').textContent = '0';
            
            const temp = this.physicsEngine.getTemperatureAtPosition(r, h, 0, this.currentTimeIndex);
            document.getElementById('probe-temp').textContent = temp.toFixed(1);
            document.getElementById('probe-info').classList.add('active');
            
            this.draw2DHeatmap();
        }
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
        
        if (normalized < 0.25) {
            const t = normalized / 0.25;
            return { r: 0.0, g: 0.4 + t * 0.3, b: 0.9 + t * 0.1 };
        } else if (normalized < 0.5) {
            const t = (normalized - 0.25) / 0.25;
            return { r: 0.0, g: 0.7 + t * 0.3, b: 1.0 - t * 0.3 };
        } else if (normalized < 0.75) {
            const t = (normalized - 0.5) / 0.25;
            return { r: 0.0 + t * 0.8, g: 1.0 - t * 0.2, b: 0.7 - t * 0.4 };
        } else {
            const t = (normalized - 0.75) / 0.25;
            return { r: 0.8 + t * 0.2, g: 0.8 - t * 0.5, b: 0.3 - t * 0.3 };
        }
    }
    
    updateVisualization() {
        if (this.useWebGL) {
            this.update3DVisualization();
        } else {
            this.draw2DHeatmap();
        }
    }
    
    update3DVisualization() {
        if (!this.mesh || !this.physicsEngine || !this.timeSteps[this.currentTimeIndex]) {
            console.log('updateVisualization skipped:', !this.mesh, !this.physicsEngine, !this.timeSteps[this.currentTimeIndex]);
            return;
        }
        
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
        if (!this.currentProbePosition || !this.physicsEngine) {
            console.warn('无法添加探针:', !this.currentProbePosition, !this.physicsEngine);
            return;
        }
        
        let probeY = this.currentProbePosition.y;
        let probeX = this.currentProbePosition.x;
        let probeZ = this.currentProbePosition.z || 0;
        
        if (this.useWebGL) {
            const { height, wallThickness } = this.params;
            const liquidHeight = height - wallThickness * 2 - 2;
            const liquidBaseY = (height - liquidHeight) / 2 - wallThickness;
            probeY = this.currentProbePosition.y + liquidBaseY;
        }
        
        console.log('获取探针数据:', { x: probeX, y: probeY, z: probeZ });
        
        const data = this.physicsEngine.getProbeData(probeX, probeY, probeZ);
        
        console.log('探针数据:', data);
        
        if (data.length === 0) {
            console.warn('探针数据为空');
            return;
        }
        
        const colors = ['#FF5A5F', '#00A699', '#FFD700', '#FF69B4', '#00D4FF', '#FC642D'];
        const color = colors[this.probes.length % colors.length];
        
        const label = `位置 (${probeX.toFixed(1)}, ${probeY.toFixed(1)}, ${probeZ.toFixed(1)})`;
        
        if (this.probes.length === 0) {
            this.tempChart.data.labels = data.map(d => Math.round(d.time));
        }
        
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
        this.probes.push({ position: { x: probeX, y: probeY, z: probeZ }, color });
    }
    
    generateAdvice() {
        if (!this.physicsEngine) return;
        
        const strategy = this.physicsEngine.generateDrinkingStrategy();
        const adviceCard = document.getElementById('advice-card');
        
        let html = `<h4>🧠 AI 饮水策略分析</h4>`;
        
        if (strategy.optimalStartTime !== null) {
            const minutes = Math.floor(strategy.optimalStartTime / 60);
            const seconds = Math.floor(strategy.optimalStartTime % 60);
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
        
        if (this.renderer && this.scene && this.camera) {
            if (this.physicsEngine && this.mesh) {
                this.update3DVisualization();
            }
            this.renderer.render(this.scene, this.camera);
        }
    }
    
    updateTimeDisplay() {
        if (!this.timeSteps || this.timeSteps.length === 0) {
            document.getElementById('time-display').textContent = '00:00';
            return;
        }
        const totalSeconds = this.currentTimeIndex * 2;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        document.getElementById('time-display').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    updateStatus(text, isComputing) {
        const statusText = document.getElementById('status-text');
        statusText.textContent = text;
        statusText.className = isComputing ? 'computing' : '';
    }
    
    onWindowResize() {
        if (this.useWebGL && this.renderer) {
            const container = document.getElementById('canvas-container');
            const width = container.clientWidth;
            const height = container.clientHeight;
            
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(width, height);
        } else {
            this.resizeHeatmap();
        }
    }
    
    resetSimulation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        this.currentTimeIndex = 0;
        this.probes = [];
        this.currentProbePosition = null;
        
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
        
        const container = document.getElementById('canvas-container');
        container.innerHTML = '';
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mesh = null;
        this.cupMesh = null;
        this.probePoint = null;
        this.heatmapCanvas = null;
        this.heatmapCtx = null;
        
        this.updateStatus('准备就绪', false);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new WaterSimulatorApp();
});