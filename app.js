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
        this.probeChart = null;
        this.probes = [];
        
        this.params = {
            shape: 'cylinder',
            wallMaterial: 'ceramic',
            diameter: 80,
            height: 120,
            wallThickness: 3,
            liquidLevel: 80,
            initialTemp: 85,
            ambientTemp: 25,
            targetMinTemp: 55,
            targetMaxTemp: 65,
            liquidType: 'tea'
        };
        
        this.wallMaterials = {
            ceramic: { name: '陶瓷', k: 1.5, insulation: 0.6, description: '中等散热，保温性好' },
            glass: { name: '玻璃', k: 1.0, insulation: 0.7, description: '散热较慢' },
            stainless_steel: { name: '不锈钢', k: 17.0, insulation: 0.15, description: '散热快，热传导迅速' },
            plastic: { name: '塑料', k: 0.3, insulation: 0.85, description: '保温性好，热量散失慢' },
            silicone: { name: '硅胶', k: 0.25, insulation: 0.9, description: '最佳保温效果' }
        };
        
        this.useWebGL = true;
        this.currentMaterial = this.wallMaterials.ceramic;
        this.isPlaying = false;
        this.playbackSpeed = 100; // 默认倍速
        
        // === Demo 指标追踪 ===
        this.metrics = {
            simCount: 0,
            totalSimTime: 0,
            avgSimTime: 0,
            lastSimTime: 0,
            accuracy: null,      // vs CFD 偏差
            accuracyLabel: '',
            pinnLevel: 'medium', // low / medium / high
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.initChart();
        this.initProbeChart();
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
        
        // 液位高度同步(带%单位)
        const syncLiquidLevel = () => {
            const val = parseInt(document.getElementById('liquid-level-slider').value);
            document.getElementById('liquid-level-value').textContent = val + '%';
            this.params.liquidLevel = val;
            if (this.physicsEngine) {
                this.initVisualization();
                if (this.timeSteps.length > 0) {
                    document.getElementById('time-slider').max = this.timeSteps.length - 1;
                    this.updateVisualization();
                    this.updateTimeDisplay();
                }
            }
        };
        document.getElementById('liquid-level-slider').addEventListener('input', syncLiquidLevel);
        
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
            
            if (this.physicsEngine) {
                this.initVisualization();
                if (this.timeSteps.length > 0) {
                    document.getElementById('time-slider').max = this.timeSteps.length - 1;
                    this.updateVisualization();
                    this.updateTimeDisplay();
                }
            }
        });
        
        document.getElementById('material-select').addEventListener('change', (e) => {
            this.params.wallMaterial = e.target.value;
            const material = this.wallMaterials[e.target.value];
            document.getElementById('material-value').textContent = material.name;
            document.getElementById('wall-k-value').textContent = material.k;
            document.querySelector('.material-desc').textContent = material.description;
            
            if (this.physicsEngine) {
                this.startSimulation();
            }
        });
        
        document.querySelectorAll('.liquid-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('.liquid-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                this.params.liquidType = opt.dataset.liquid;
                this.updatePhysicsParamsDisplay();
            });
        });
        
        // PINN精度等级选择
        document.querySelectorAll('.pinn-level-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.addRipple(e);
                document.querySelectorAll('.pinn-level-btn').forEach(b => {
                    b.className = b.className.replace('btn-primary', 'btn-secondary');
                });
                btn.className = btn.className.replace('btn-secondary', 'btn-primary');
                this.setPINNLevel(btn.dataset.level);
            });
        });
        
        document.getElementById('start-btn').addEventListener('click', (e) => {
            this.addRipple(e);
            this.startSimulation();
        });
        document.getElementById('reset-btn').addEventListener('click', (e) => {
            this.addRipple(e);
            this.resetSimulation();
        });
        
        document.getElementById('time-slider').addEventListener('input', (e) => {
            this.currentTimeIndex = parseInt(e.target.value);
            this.updateVisualization();
            this.updateTimeDisplay();
        });
        
        document.getElementById('add-probe-btn').addEventListener('click', (e) => { this.addRipple(e); this.addProbeToChart(); });
        document.getElementById('play-btn').addEventListener('click', () => this.togglePlay());
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setSpeed(parseInt(btn.dataset.speed)));
        });
        document.getElementById('set-probe-btn').addEventListener('click', (e) => { this.addRipple(e); this.setProbeFromInput(); });
        document.getElementById('probe-close-btn')?.addEventListener('click', () => this.closeProbeInfo());
        
        // 故事模式
        document.getElementById('story-btn').addEventListener('click', (e) => { this.addRipple(e); this.openStoryMode(); });
        document.getElementById('story-next').addEventListener('click', () => this.storyNext());
        document.getElementById('story-prev').addEventListener('click', () => this.storyPrev());
        document.getElementById('story-close').addEventListener('click', (e) => { this.addRipple(e); this.closeStoryMode(); });
        
        // 面板折叠
        document.getElementById('panel-collapse-btn')?.addEventListener('click', () => this.togglePanelCollapse());
        
        // 可为 collapse toggle 按钮追加初始 click
        this.initPanelResize();
    }
    
    showProbeSection() {
        const section = document.getElementById('probe-panel-section');
        if (section) section.style.display = 'block';
    }
    
    hideProbeSection() {
        const section = document.getElementById('probe-panel-section');
        if (section) section.style.display = 'none';
    }
    
    closeProbeInfo() {
        const section = document.getElementById('probe-panel-section');
        if (section) section.style.display = 'none';
    }
    
    setProbeFromInput() {
        const x = parseFloat(document.getElementById('input-probe-x').value);
        const y = parseFloat(document.getElementById('input-probe-y').value);
        const z = parseFloat(document.getElementById('input-probe-z').value);
        
        if (isNaN(x) || isNaN(y) || isNaN(z)) {
            console.warn('请输入有效的坐标值');
            return;
        }
        
        const { height, wallThickness } = this.params;
        const liquidHeight = height - wallThickness * 2 - 2;
        const liquidBaseY = (height - liquidHeight) / 2 - wallThickness;
        const probeGlobalY = y - liquidBaseY + liquidHeight / 2;
        
        document.getElementById('probe-x').textContent = x.toFixed(1);
        document.getElementById('probe-y').textContent = y.toFixed(1);
        document.getElementById('probe-z').textContent = z.toFixed(1);
        
        const temp = this.physicsEngine.getTemperatureAtPosition(x, probeGlobalY, z, this.currentTimeIndex);
        document.getElementById('probe-temp').textContent = temp.toFixed(1);
        this.showProbeSection();
            
        this.currentProbePosition = { x, y, z, probeGlobalY };
        
        if (this.useWebGL && this.mesh && this.scene) {
            if (this.probePoint) {
                this.scene.remove(this.probePoint);
            }
            const probeGeometry = new THREE.SphereGeometry(2.5, 16, 16);
            const probeMaterial = new THREE.MeshBasicMaterial({ color: 0xE67E22 });
            this.probePoint = new THREE.Mesh(probeGeometry, probeMaterial);
            this.probePoint.position.set(x, y, z);
            this.scene.add(this.probePoint);
        }
        
        this.updateProbeChart(probeGlobalY);
        
        this.drawCrossSections(x, probeGlobalY, z);
    }
    
    togglePlay() {
        if (!this.timeSteps || this.timeSteps.length === 0) return;
        
        this.isPlaying = !this.isPlaying;
        const playBtn = document.getElementById('play-btn');
        playBtn.textContent = this.isPlaying ? '⏸' : '▶';
        
        if (this.isPlaying) {
            this.playAnimation();
        }
    }
    
    setSpeed(speed) {
        this.playbackSpeed = speed;
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.speed) === speed);
        });
    }
    
    playAnimation() {
        if (!this.isPlaying) return;
        
        if (this.currentTimeIndex < this.timeSteps.length - 1) {
            this.currentTimeIndex++;
            document.getElementById('time-slider').value = this.currentTimeIndex;
            this.updateVisualization();
            this.updateTimeDisplay();
            
            // 每步的模拟秒数 / 倍速 = 实际间隔(秒)，转毫秒
            const stepSeconds = (this.physicsEngine?.maxTime || 600) / (this.timeSteps.length || 100);
            const intervalMs = (stepSeconds / this.playbackSpeed) * 1000;
            setTimeout(() => this.playAnimation(), Math.max(16, Math.round(intervalMs)));
        } else {
            this.isPlaying = false;
            document.getElementById('play-btn').textContent = '▶';
        }
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
        
        const material = this.wallMaterials[this.params.wallMaterial];
        if (material) {
            document.getElementById('wall-k-value').textContent = material.k;
        }
    }
    
    initProbeChart() {
        const ctx = document.getElementById('probe-chart').getContext('2d');
        this.probeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: '温度',
                    data: [],
                    borderColor: '#E67E22',
                    backgroundColor: 'rgba(230, 126, 34, 0.12)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(15, 22, 40, 0.95)',
                        titleColor: '#F4F8FC',
                        bodyColor: '#999999',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        padding: 8,
                        displayColors: false
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { display: false }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { 
                            display: true, 
                            color: '#777777',
                            font: { size: 10 },
                            maxTicksLimit: 3
                        },
                        min: 0,
                        max: 100
                    }
                }
            }
        });
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
                            color: '#999999',
                            font: { size: 11 },
                            usePointStyle: true,
                            padding: 12
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 22, 40, 0.95)',
                        titleColor: '#F4F8FC',
                        bodyColor: '#999999',
                        borderColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: true
                    }
                },
                scales: {
                    x: {
                        grid: {
                            color: 'rgba(255,255,255,0.04)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#777777',
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: '时间 (秒)',
                            color: '#777777',
                            font: { size: 12, weight: 500 }
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(255,255,255,0.04)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#777777',
                            font: { size: 11 }
                        },
                        title: {
                            display: true,
                            text: '温度 (°C)',
                            color: '#777777',
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
        const t0 = performance.now();
        
        setTimeout(() => {
            try {
                this.physicsEngine = new HeatConductionEngine(this.params);
                this.currentMaterial = this.physicsEngine.currentMaterial;
                this.timeSteps = this.physicsEngine.solve();
                
                // 更新指标
                const elapsed = performance.now() - t0;
                this.metrics.simCount++;
                this.metrics.totalSimTime += elapsed;
                this.metrics.lastSimTime = elapsed;
                this.metrics.avgSimTime = this.metrics.totalSimTime / this.metrics.simCount;
                this.updateMetricsDisplay();
                
                console.log('计算完成，时间步数:', this.timeSteps.length);
                console.log('物理引擎实例:', this.physicsEngine);
                console.log('杯壁材料:', this.currentMaterial);
                console.log(`模拟耗时: ${elapsed.toFixed(1)}ms`);
                
                this.initVisualization();
                this._meshesNeedRefresh = false;  // rebuildSceneObjects 内部置 true，此处重置
                
                if (this.timeSteps.length > 0) {
                    document.getElementById('time-slider').max = this.timeSteps.length - 1;
                    document.getElementById('time-slider').value = 0;
                    this.currentTimeIndex = 0;
                    this.updateVisualization();
                    this.updateTimeDisplay();
                }
                
                // 默认显示 (0,0,0) 处的剖面图
                this.currentProbePosition = { x: 0, y: 0, z: 0, probeGlobalY: 0 };
                document.getElementById('probe-x').textContent = '0';
                document.getElementById('probe-y').textContent = '0';
                document.getElementById('probe-z').textContent = '0';
                const centerTemp = this.physicsEngine.getTemperatureAtPosition(0, 0, 0, this.currentTimeIndex);
                document.getElementById('probe-temp').textContent = centerTemp.toFixed(1);
                this.showProbeSection();
                this.drawCrossSections(0, 0, 0);
                
                this.updateStatus('计算完成', false);

                // 异步发起CFD精度校验
                this.requestCFDValidation();
            } catch (error) {
                console.error('模拟计算失败:', error);
                this.updateStatus('计算失败', false);
            }
        }, 100);
    }
    
    initVisualization() {
        const container = document.getElementById('canvas-container');
        
        if (this.scene) {
            // Scene/camera/controls already exist — only rebuild 3D objects
            this.rebuildSceneObjects();
            return;
        }
        
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
    
    rebuildSceneObjects() {
        if (!this.scene) return;
        if (this.cupMesh) { this.scene.remove(this.cupMesh); this.cupMesh = null; }
        if (this.mesh)   { this.scene.remove(this.mesh);   this.mesh   = null; }
        if (this._steamGroup) { this.scene.remove(this._steamGroup); this._steamMeshes?.forEach(m => { m.geometry?.dispose(); m.material?.dispose(); }); this._steamGroup = null; this._steamMeshes = null; }
        if (this._steamInterval) { clearInterval(this._steamInterval); this._steamInterval = null; }
        
        // 标记物理引擎数据已过时，防止 update3DVisualization 用旧数据染新 mesh
        this._meshesNeedRefresh = true;
        
        this.createCup();
        this.createLiquid();
        this.createSteam();
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
        this.scene.background = new THREE.Color(0x0A0E17);
        
        const width = container.clientWidth;
        const height = container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
        this.camera.position.set(0, 175, 303);
        
        try {
            this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
            this.renderer.setSize(width, height);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.shadowMap.enabled = true;
            this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.2;
            container.appendChild(this.renderer.domElement);
            
            try {
                this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
                this.controls.enableDamping = true;
                this.controls.dampingFactor = 0.08;
                this.controls.minDistance = 90;
                this.controls.maxDistance = 350;
                this.controls.autoRotate = true;
                this.controls.autoRotateSpeed = 0.8;
            } catch (e) {
                console.warn('OrbitControls 未加载，使用静态视角:', e);
                this.controls = null;
            }
            
            // Enhanced lighting for dark scene
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
            this.scene.add(ambientLight);
            
            const hemiLight = new THREE.HemisphereLight(0x1a2a4a, 0x0a0e17, 0.5);
            this.scene.add(hemiLight);
            
            const mainLight = new THREE.DirectionalLight(0xffeedd, 1.2);
            mainLight.position.set(40, 100, 50);
            mainLight.castShadow = true;
            mainLight.shadow.mapSize.width = 1024;
            mainLight.shadow.mapSize.height = 1024;
            this.scene.add(mainLight);
            
            const fillLight = new THREE.DirectionalLight(0x5599ff, 0.35);
            fillLight.position.set(-40, 30, -60);
            this.scene.add(fillLight);
            
            const rimLight = new THREE.DirectionalLight(0xE67E22, 0.3);
            rimLight.position.set(0, -40, -80);
            this.scene.add(rimLight);
            
            this.createCup();
            this.createLiquid();
            this.createSteam();
            
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
        // 重新绘制剖面图
        if (this.currentProbePosition) {
            const probeX = this.currentProbePosition.x;
            const probeY = this.currentProbePosition.probeGlobalY || this.currentProbePosition.y;
            const probeZ = this.currentProbePosition.z || 0;
            this.drawCrossSections(probeX, probeY, probeZ);
        }
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
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
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
        ctx.strokeStyle = 'rgba(230,126,34,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.fillStyle = '#777777';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('点击任意位置查看温度', centerX, centerY + liquidHeight/2 + 24);
        
        if (this.currentProbePosition) {
            const probeScreenX = centerX + this.currentProbePosition.x / rMax * liquidRadius;
            const probeScreenY = centerY - this.currentProbePosition.y / hMax * liquidHeight;
            
            ctx.beginPath();
            ctx.arc(probeScreenX, probeScreenY, 12, 0, Math.PI * 2);
            ctx.fillStyle = '#E67E22';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(probeScreenX, probeScreenY, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#0A0E17';
            ctx.fill();
            
            const probeTemp = this.physicsEngine.getTemperatureAtPosition(
                this.currentProbePosition.x,
                this.currentProbePosition.y,
                0,
                this.currentTimeIndex
            );
            
            ctx.fillStyle = '#E67E22';
            ctx.font = 'bold 14px sans-serif';
            ctx.fillText(probeTemp.toFixed(1) + '°C', probeScreenX, probeScreenY + 4);
        }
        
        // 绘制颜色图例
        this.drawColorLegend(ctx, width, height);
    }
    
    drawColorLegend(ctx, width, height) {
        const legendWidth = 24;
        const legendHeight = Math.min(height * 0.55, 200);
        const legendX = width - legendWidth - 16;
        const legendY = (height - legendHeight) / 2;
        
        // 背景
        ctx.fillStyle = 'rgba(10, 14, 23, 0.85)';
        ctx.beginPath();
        ctx.roundRect(legendX - 4, legendY - 20, legendWidth + 18, legendHeight + 52, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        // 标题
        ctx.fillStyle = '#777777';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('温度 °C', legendX + legendWidth / 2 + 5, legendY - 6);
        
        // 渐变条 — 固定 0~100°C
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const temp = 0 + t * 100;
            const color = this.tempToColor(temp);
            const y = legendY + legendHeight * (1 - t);
            ctx.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
            ctx.fillRect(legendX + 5, y - legendHeight / steps / 2, legendWidth, legendHeight / steps + 1);
        }
        
        // 边框
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(legendX + 5, legendY, legendWidth, legendHeight);
        
        // 温度标签 — 固定 0~100°C
        ctx.fillStyle = '#777777';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        const labelPositions = [0, 0.25, 0.5, 0.75, 1];
        const labelTemps = [0, 25, 50, 75, 100];
        for (let idx = 0; idx < labelPositions.length; idx++) {
            const pos = labelPositions[idx];
            const temp = labelTemps[idx];
            const y = legendY + legendHeight * (1 - pos);
            ctx.fillText(temp + '°C', legendX + legendWidth + 10, y + 3);
            // 刻度线
            ctx.strokeStyle = '#555555';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(legendX + 5 + legendWidth, y);
            ctx.lineTo(legendX + 5 + legendWidth + 4, y);
            ctx.stroke();
        }
    }
    
    drawCrossSections(probeX, probeY, probeZ) {
        if (!this.physicsEngine || !this.timeSteps || this.timeSteps.length === 0) return;
        
        document.getElementById('cs-x').textContent = probeX.toFixed(1);
        document.getElementById('cs-y').textContent = probeY.toFixed(1);
        document.getElementById('cs-z').textContent = probeZ.toFixed(1);
        
        const { rMax, hMax } = this.physicsEngine;
        const timeIndex = this.currentTimeIndex;
        
        // 使用 requestAnimationFrame 确保 DOM 布局已完成再绘制
        requestAnimationFrame(() => {
            // XY剖面 (固定Z): 垂直切片
            this.drawSingleCrossSection('cross-section-xy', (px, py, w, h) => {
                const liquidX = (px / w) * 2 * rMax - rMax;
                const liquidY = hMax - (py / h) * hMax;
                const r = Math.sqrt(liquidX * liquidX + probeZ * probeZ);
                if (r <= rMax && liquidY >= 0 && liquidY <= hMax) {
                    return this.physicsEngine.getTemperatureAtPosition(liquidX, liquidY, probeZ, timeIndex);
                }
                return null;
            });
            
            // XZ剖面 (固定Y): 水平切片
            this.drawSingleCrossSection('cross-section-xz', (px, py, w, h) => {
                const liquidX = (px / w) * 2 * rMax - rMax;
                const liquidZ = rMax - (py / h) * 2 * rMax;
                const r = Math.sqrt(liquidX * liquidX + liquidZ * liquidZ);
                if (r <= rMax && probeY >= 0 && probeY <= hMax) {
                    return this.physicsEngine.getTemperatureAtPosition(liquidX, probeY, liquidZ, timeIndex);
                }
                return null;
            });
            
            // YZ剖面 (固定X): 垂直切片
            this.drawSingleCrossSection('cross-section-yz', (px, py, w, h) => {
                const liquidZ = (px / w) * 2 * rMax - rMax;
                const liquidY = hMax - (py / h) * hMax;
                const r = Math.sqrt(probeX * probeX + liquidZ * liquidZ);
                if (r <= rMax && liquidY >= 0 && liquidY <= hMax) {
                    return this.physicsEngine.getTemperatureAtPosition(probeX, liquidY, liquidZ, timeIndex);
                }
                return null;
            });
        });
    }
    
    drawSingleCrossSection(canvasId, getTempFn) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const drawWidth = Math.round(rect.width * dpr);
        const drawHeight = Math.round(rect.height * dpr);
        
        if (canvas.width !== drawWidth || canvas.height !== drawHeight) {
            canvas.width = drawWidth;
            canvas.height = drawHeight;
        }
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, drawWidth, drawHeight);
        
        // 背景
        ctx.fillStyle = '#0A0E17';
        ctx.fillRect(0, 0, drawWidth, drawHeight);
        
        // 绘制热力图像素
        const pixelSize = Math.max(1, Math.ceil(dpr));
        for (let py = 0; py < drawHeight; py += pixelSize) {
            for (let px = 0; px < drawWidth; px += pixelSize) {
                const temp = getTempFn(px, py, drawWidth, drawHeight);
                if (temp !== null) {
                    const color = this.tempToColor(temp);
                    ctx.fillStyle = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
                    ctx.fillRect(px, py, pixelSize, pixelSize);
                }
            }
        }
        
        // 边框
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, drawWidth, drawHeight);
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
            this.currentProbePosition = { x: r, y: h, z: 0, probeGlobalY: h };
            
            document.getElementById('probe-x').textContent = r.toFixed(1);
            document.getElementById('probe-y').textContent = h.toFixed(1);
            document.getElementById('probe-z').textContent = '0';
            
            const temp = this.physicsEngine.getTemperatureAtPosition(r, h, 0, this.currentTimeIndex);
            document.getElementById('probe-temp').textContent = temp.toFixed(1);
            this.showProbeSection();
            
            this.updateProbeChart(h);
            
            this.drawCrossSections(r, h, 0);
            
            this.draw2DHeatmap();
        }
    }
    
    createCup() {
        const { diameter, height, wallThickness, shape } = this.params;
        const innerRadius = diameter / 2 - wallThickness;
        const outerRadius = diameter / 2;
        
        let geometry;
        if (shape === 'cone') {
            const topRadius = diameter / 4;
            geometry = new THREE.CylinderGeometry(topRadius - wallThickness, outerRadius, height, 32, 1, true);
        } else {
            geometry = new THREE.CylinderGeometry(outerRadius, outerRadius, height, 32, 1, true);
        }
        
        const material = new THREE.MeshPhongMaterial({
            color: 0x2C2C2C,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthWrite: false,
            depthTest: true
        });
        
        this.cupMesh = new THREE.Mesh(geometry, material);
        this.cupMesh.renderOrder = 1;
        this.scene.add(this.cupMesh);
    }
    
    createLiquid() {
        const { diameter, height, wallThickness, shape, liquidLevel } = this.params;
        const innerBottom = -height / 2 + wallThickness + 1;
        const maxLiquidHeight = height - wallThickness * 2 - 2;
        const liquidHeight = maxLiquidHeight * (liquidLevel / 100);
        const liquidPosY = innerBottom + liquidHeight / 2;
        
        let geometry;
        
        if (shape === 'cone') {
            const topRadius = (diameter / 4) - wallThickness - 1;
            const bottomRadius = (diameter / 2) - wallThickness - 1;
            geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, liquidHeight, 32, 24);
        } else {
            const radius = diameter / 2 - wallThickness - 1;
            geometry = new THREE.CylinderGeometry(radius, radius, liquidHeight, 32, 24);
        }
        
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
        
        const material = new THREE.MeshPhysicalMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.88,
            roughness: 0.25,
            metalness: 0.05,
            clearcoat: 0.15,
            clearcoatRoughness: 0.4,
            side: THREE.DoubleSide,
            envMapIntensity: 0.4,
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.y = liquidPosY;
        this.mesh.renderOrder = 2;
        this.scene.add(this.mesh);
    }
    
    tempToColor(temp) {
        // 固定 0°C ~ 100°C 映射到完整热力渐变
        const minTemp = 0;
        const maxTemp = 100;
        const tempRange = maxTemp - minTemp;
        
        if (tempRange <= 0) return { r: 0.6, g: 0.6, b: 0.6 };
        
        const t = Math.max(0, Math.min(1, (temp - minTemp) / tempRange));
        
        // 传统热力图 6 色阶平滑渐变（冷→热）
        // 蓝 → 浅蓝 → 青绿 → 黄绿 → 橙 → 红
        const stops = [
            { pos: 0.00, r: 0.04, g: 0.04, b: 0.80 },  // 深蓝 (冷)
            { pos: 0.20, r: 0.00, g: 0.45, b: 0.95 },  // 浅蓝
            { pos: 0.40, r: 0.00, g: 0.85, b: 0.60 },  // 青绿
            { pos: 0.60, r: 0.40, g: 0.90, b: 0.00 },  // 黄绿
            { pos: 0.80, r: 0.90, g: 0.45, b: 0.00 },  // 橙
            { pos: 1.00, r: 0.85, g: 0.00, b: 0.00 },  // 红 (热)
        ];
        
        for (let i = 0; i < stops.length - 1; i++) {
            if (t >= stops[i].pos && t <= stops[i + 1].pos) {
                const local = (t - stops[i].pos) / (stops[i + 1].pos - stops[i].pos);
                return {
                    r: stops[i].r + local * (stops[i + 1].r - stops[i].r),
                    g: stops[i].g + local * (stops[i + 1].g - stops[i].g),
                    b: stops[i].b + local * (stops[i + 1].b - stops[i].b),
                };
            }
        }
        return { r: 0.85, g: 0.0, b: 0.0 };
    }
    
    updateVisualization() {
        if (this.useWebGL) {
            this.update3DVisualization();
        } else {
            this.draw2DHeatmap();
        }
        // 如果当前有探针位置，更新剖面图
        if (this.currentProbePosition) {
            const probeX = this.currentProbePosition.x;
            const probeY = this.currentProbePosition.probeGlobalY || this.currentProbePosition.y;
            const probeZ = this.currentProbePosition.z || 0;
            this.drawCrossSections(probeX, probeY, probeZ);
        }
    }
    
    update3DVisualization() {
        // 参数已变化但未重新模拟时，保持初始温度颜色，不做错误映射
        if (this._meshesNeedRefresh) return;
        
        if (!this.mesh || !this.physicsEngine || !this.timeSteps[this.currentTimeIndex]) {
            console.log('updateVisualization skipped:', !this.mesh, !this.physicsEngine, !this.timeSteps[this.currentTimeIndex]);
            return;
        }
        
        const positions = this.mesh.geometry.attributes.position;
        const colors = this.mesh.geometry.attributes.color;
        const { height, wallThickness, liquidLevel } = this.params;
        const maxLiquidHeight = height - wallThickness * 2 - 2;
        const liquidHeight = maxLiquidHeight * (liquidLevel / 100);
        const innerBottom = -height / 2 + wallThickness + 1;
        
        // 3D space: innerBottom to innerBottom+liquidHeight
        // Physics engine: 0 to hMax (hMax = maxLiquidHeight * liquidLevel/100)
        // Convert: physicsY = globalY - innerBottom
        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const localY = positions.getY(i);
            const z = positions.getZ(i);
            
            // mesh.center = innerBottom + liquidHeight/2
            const globalY = localY + innerBottom + liquidHeight / 2;
            const physicsY = globalY - innerBottom;
            
            const temp = this.physicsEngine.getTemperatureAtPosition(x, physicsY, z, this.currentTimeIndex);
            const color = this.tempToColor(temp);
            
            colors.setXYZ(i, color.r, color.g, color.b);
        }
        
        colors.needsUpdate = true;
        
        if (this.probePoint) {
            const localY = this.probePoint.position.y;
            const globalY = localY + innerBottom + liquidHeight / 2;
            const physicsY = globalY - innerBottom;
            const probeTemp = this.physicsEngine.getTemperatureAtPosition(
                this.probePoint.position.x,
                physicsY,
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
                // ... existing probe placement code
                const point = intersects[0].point;
                
                if (this.probePoint) {
                    this.scene.remove(this.probePoint);
                }
                
                const probeGeometry = new THREE.SphereGeometry(2.5, 16, 16);
                const probeMaterial = new THREE.MeshBasicMaterial({ color: 0xE67E22 });
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
                const probeGlobalY = point.y - liquidBaseY + liquidHeight / 2;
                
                const temp = this.physicsEngine.getTemperatureAtPosition(
                    point.x,
                    probeGlobalY,
                    point.z,
                    this.currentTimeIndex
                );
                
                document.getElementById('probe-temp').textContent = temp.toFixed(1);
                this.showProbeSection();
                
                this.currentProbePosition.probeGlobalY = probeGlobalY;
                
                this.updateProbeChart(probeGlobalY);
                
                this.drawCrossSections(point.x, probeGlobalY, point.z);
            } else {
                this.hideProbeSection();
            }
        };
        
        this.renderer.domElement.addEventListener('click', onClick);
    }
    
    updateProbeChart(probeY) {
        if (!this.probeChart || !this.physicsEngine || !this.currentProbePosition) return;
        
        const probeX = this.currentProbePosition.x;
        const probeZ = this.currentProbePosition.z || 0;
        
        const data = this.physicsEngine.getProbeData(probeX, probeY, probeZ);
        
        this.probeChart.data.labels = data.map(d => Math.round(d.time));
        this.probeChart.data.datasets[0].data = data.map(d => d.temp);
        this.probeChart.update();
    }
    
    addProbeToChart() {
        if (!this.currentProbePosition || !this.physicsEngine) {
            console.warn('无法添加探针:', !this.currentProbePosition, !this.physicsEngine);
            return;
        }
        
        const probeX = this.currentProbePosition.x;
        const probeZ = this.currentProbePosition.z || 0;
        const probeY = this.currentProbePosition.probeGlobalY || this.currentProbePosition.y;
        
        console.log('获取探针数据:', { x: probeX, y: probeY, z: probeZ });
        
        const data = this.physicsEngine.getProbeData(probeX, probeY, probeZ);
        
        console.log('探针数据条数:', data.length);
        
        if (data.length === 0) {
            console.warn('探针数据为空');
            return;
        }
        
        const colors = ['#E67E22', '#27AE60', '#F5B041', '#8E44AD', '#16A085', '#E74C3C'];
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
    
    animate() {
        this.animationId = requestAnimationFrame(() => this.animate());
        
        if (this.controls) {
            this.controls.update();
        }
        
        if (this.renderer && this.scene && this.camera) {
            if (this.physicsEngine && this.mesh && !this.isPlaying) {
                this.update3DVisualization();
            }
            this.renderer.render(this.scene, this.camera);
        }
        
        // HUD FPS counter
        if (this.hudFpsCounter !== undefined) {
            const now = performance.now();
            if (now - this.hudLastFpsTime > 500) {
                document.getElementById('hud-fps').textContent = Math.round(this.hudFpsCounter / ((now - this.hudLastFpsTime) / 1000));
                this.hudFpsCounter = 0;
                this.hudLastFpsTime = now;
            }
            this.hudFpsCounter++;
        }
    }
    
    updateTimeDisplay() {
        if (!this.timeSteps || this.timeSteps.length === 0) {
            document.getElementById('time-display').textContent = '00:00';
            return;
        }
        const stepSeconds = (this.physicsEngine?.maxTime || 600) / (this.timeSteps.length || 100);
        const totalSeconds = this.currentTimeIndex * stepSeconds;
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
    
    // === Demo 指标展示 ===
    updateMetricsDisplay() {
        const badge = document.getElementById('accuracy-badge');
        if (badge) {
            badge.style.display = 'inline-flex';
            badge.innerHTML = `
                <span style="color:#777777;">#${this.metrics.simCount}</span>
                <span style="color:#999999;">${this.metrics.lastSimTime.toFixed(0)}ms</span>
                <span style="color:#27AE60;">avg ${this.metrics.avgSimTime.toFixed(0)}ms</span>
                ${this.metrics.accuracy !== null ? `<span style="color:#E67E22;">±${this.metrics.accuracy.toFixed(2)}°C</span>` : ''}
            `;
        }
    }
    
    setAccuracy(deviation) {
        this.metrics.accuracy = deviation;
        this.updateMetricsDisplay();
    }
    
    // === CFD精度验证 ===
    async requestCFDValidation() {
        const CFD_URL = `http://${window.location.hostname || 'localhost'}:8020`;
        const grid = this.timeSteps[this.currentTimeIndex];
        if (!grid) return;
        
        try {
            const resp = await fetch(`${CFD_URL}/api/compare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    diameter: this.params.diameter,
                    height: this.params.height,
                    wall_thickness: this.params.wallThickness,
                    liquid_level: this.params.liquidLevel,
                    initial_temp: this.params.initialTemp,
                    ambient_temp: this.params.ambientTemp,
                    wall_k: this.currentMaterial?.k || 1.5,
                    liquid_type: this.params.liquidType || 'tea',
                    num_time_steps: 100,
                    browser_grid: grid,
                }),
            });
            if (!resp.ok) return;
            const data = await resp.json();
            if (data.mae !== undefined) {
                this.setAccuracy(data.mae);
                console.log(`CFD验证: MAE=${data.mae.toFixed(3)}°C, MAX=${data.max_ae.toFixed(3)}°C`);
            }
        } catch (_) {
            // CFD服务未启动时静默失败
            console.log('CFD后端未启动，跳过精度验证');
        }
    }
    
    // === PINN精度等级 ===
    setPINNLevel(level) {
        this.metrics.pinnLevel = level;
        document.getElementById('pinn-level-value').textContent = 
            level === 'low' ? '快速' : level === 'medium' ? '标准' : '高精度';
    }
    
    onWindowResize() {
        // 防抖：避免 CSS transition 期间多次触发导致 3D 模型横向漂移
        if (this._resizeTimer) clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => {
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
        }, 200);
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
        
        this.hideProbeSection();
        
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
    
    // ======== 右栏拖拽调节 & 折叠 ========
    
    initPanelResize() {
        const handle = document.getElementById('panel-resize-handle');
        const panel = document.getElementById('right-panel');
        if (!handle || !panel) return;
        
        let resizeTick = false;
        const triggerResize = () => {
            resizeTick = false;
            window.dispatchEvent(new Event('resize'));
        };
        
        const onDrag = (e) => {
            const newWidth = window.innerWidth - e.clientX;
            const clamped = Math.max(260, Math.min(560, newWidth));
            panel.style.width = clamped + 'px';
            panel.classList.remove('collapsed');
            // 用 rAF 节流，避免拖拽时高频触发 resize
            if (!resizeTick) {
                resizeTick = true;
                requestAnimationFrame(triggerResize);
            }
        };
        
        const onUp = () => {
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', onUp);
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            // 松手后确保最终 resize
            window.dispatchEvent(new Event('resize'));
        };
        
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            handle.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', onUp);
        });
    }
    
    togglePanelCollapse() {
        const panel = document.getElementById('right-panel');
        const btn = document.getElementById('panel-collapse-btn');
        if (!panel) return;
        panel.classList.toggle('collapsed');
        if (btn) btn.textContent = panel.classList.contains('collapsed') ? '◀' : '▶';
        // 等 transition 结束后再触发 resize，防止中间帧抖动
        const onEnd = () => { panel.removeEventListener('transitionend', onEnd); window.dispatchEvent(new Event('resize')); };
        panel.addEventListener('transitionend', onEnd);
    }
    
    // ======== Phase 0: 新增方法 ========
    
    addRipple(e) {
        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        btn.appendChild(ripple);
        ripple.addEventListener('animationend', () => ripple.remove());
    }
    
    // HUD
    initHUD() {
        document.getElementById('hud-overlay').style.display = 'flex';
        document.getElementById('hud-grid').textContent = `${this.physicsEngine?.nr || 20}×${this.physicsEngine?.nh || 24}`;
        document.getElementById('hud-solver').textContent = 'FDM';
        this.hudFpsCounter = 0;
        this.hudLastFpsTime = performance.now();
    }
    
    // 蒸发粒子系统
    createSteam() {
        if (this._steamGroup) {
            this.scene.remove(this._steamGroup);
            this._steamMeshes?.forEach(m => { m.geometry?.dispose(); m.material?.map?.dispose(); m.material?.dispose(); });
            this._steamGroup = null;
            this._steamMeshes = null;
        }
        
        // 生成雾状渐变纹理 (canvas radial gradient)
        const texSize = 256;
        const canvas = document.createElement('canvas');
        canvas.width = texSize; canvas.height = texSize;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(texSize/2, texSize/2, 0, texSize/2, texSize/2, texSize/2);
        gradient.addColorStop(0, 'rgba(230,235,245,0.7)');
        gradient.addColorStop(0.10, 'rgba(225,232,242,0.55)');
        gradient.addColorStop(0.25, 'rgba(215,224,238,0.30)');
        gradient.addColorStop(0.50, 'rgba(200,212,230,0.10)');
        gradient.addColorStop(0.75, 'rgba(190,205,225,0.02)');
        gradient.addColorStop(1, 'rgba(190,205,225,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, texSize, texSize);
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        
        // 液面坐标（与 createLiquid 一致）
        const innerBottom = -this.params.height / 2 + this.params.wallThickness + 1;
        const maxLiquidH = this.params.height - this.params.wallThickness * 2 - 2;
        const liquidH = maxLiquidH * (this.params.liquidLevel / 100);
        const surfaceY = innerBottom + liquidH;  // 液面顶部 Y
        const r = this.params.diameter / 2 - this.params.wallThickness - 1; // 液体半径
        
        this._steamGroup = new THREE.Group();
        this._steamMeshes = [];
        
        // 创建多层雾盘
        const count = 36;
        for (let i = 0; i < count; i++) {
            const discR = r * (0.25 + Math.random() * 0.6);
            const geo = new THREE.PlaneGeometry(discR * 2, discR * 2);
            const mat = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 0.18 + Math.random() * 0.25,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.DoubleSide,
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2; // 水平放置
            
            // 起点：部分从液面以下生成（体现内部外溢）
            const fromInside = i < 12;
            const startY = fromInside
                ? surfaceY - liquidH * 0.25 - Math.random() * liquidH * 0.35 // 液面以下 25%~60%
                : surfaceY - 1 + Math.random() * 3;                           // 液面以上 0~2
            
            mesh.position.set(
                (Math.random() - 0.5) * r * 0.6,
                startY,
                (Math.random() - 0.5) * r * 0.6
            );
            mesh.userData = {
                baseY: startY,
                baseR: discR,
                riseSpeed: 0.5 + Math.random() * 1.2,
                spreadSpeed: 0.3 + Math.random() * 0.7,
                phase: Math.random() * Math.PI * 2,
                fromInside: fromInside,
            };
            this._steamGroup.add(mesh);
            this._steamMeshes.push(mesh);
        }
        this.scene?.add(this._steamGroup);
        
        // 动画循环
        this._animateSteam = () => {
            if (!this._steamGroup || !this.physicsEngine) return;
            if (!this._steamMeshes.length) return;
            
            // 当前表层温度 → 强度因子 (温度越低蒸汽越少)
            const ni = Math.floor((this.physicsEngine.nr || 20) / 2);
            const nj = Math.floor((this.physicsEngine.nh || 24) * 0.9);
            const temp = this.physicsEngine.timeSteps?.[this.currentTimeIndex]?.[ni]?.[nj] || this.params.initialTemp;
            const intensity = Math.max(0.03, (temp - this.params.ambientTemp) / (this.params.initialTemp - this.params.ambientTemp));
            
            const cupTop = this.params.height / 2;
            const overflowTop = cupTop + 0.2 * this.params.height; // 杯壁上方 20% 杯高
            const maxH = (overflowTop - surfaceY) * intensity; // 蒸汽高度随温度衰减，低温时溢出趋零
            
            for (const mesh of this._steamMeshes) {
                const ud = mesh.userData;
                // 上升
                mesh.position.y += ud.riseSpeed * intensity * 0.5;
                // 径向扩散 (热力外溢)
                const spread = ud.spreadSpeed * intensity;
                mesh.position.x += Math.cos(ud.phase + mesh.position.y * 0.15) * spread * 0.15;
                mesh.position.z += Math.sin(ud.phase + mesh.position.y * 0.15) * spread * 0.15;
                // 越远越大越淡
                const distFromSurface = Math.max(0, mesh.position.y - surfaceY);
                const expand = 1 + distFromSurface * (ud.fromInside ? 0.12 : 0.08);
                mesh.scale.setScalar(expand);
                
                // 不透明度：随高度 + 温度递减
                const heightFade = 1 - Math.min(1, distFromSurface / maxH);
                mesh.material.opacity = (0.08 + intensity * 0.32) * heightFade;
                
                // 重置
                if (mesh.position.y > surfaceY + maxH || Math.abs(mesh.position.x) > r * 1.8 || Math.abs(mesh.position.z) > r * 1.8) {
                    mesh.position.y = surfaceY - (ud.fromInside ? liquidH * 0.25 + Math.random() * liquidH * 0.35 : 1 - Math.random() * 2);
                    mesh.position.x = (Math.random() - 0.5) * r * 0.6;
                    mesh.position.z = (Math.random() - 0.5) * r * 0.6;
                    mesh.scale.setScalar(1);
                    mesh.material.opacity = 0.18 + Math.random() * (0.25 * intensity);
                    ud.baseY = mesh.position.y;
                }
            }
        };
        
        if (this._steamInterval) clearInterval(this._steamInterval);
        this._steamInterval = setInterval(() => {
            if (this._animateSteam) this._animateSteam();
        }, 40);
    }
    
    // 故事模式
    openStoryMode() {
        this.storyStep = 0;
        this.storyData = [
            { title: '从一杯茶开始', desc: 'SyncNeuro 物理AI正在模拟陶瓷杯中85°C热茶的自然冷却过程。温度场从杯壁和液面逐渐散热，内部热量向四周传导。', highlight: '' },
            { title: '改变杯壁材料', desc: '切换为不锈钢材质观察区别。不锈钢导热系数(17.0 W/m·°C)远高于陶瓷(1.5 W/m·°C)，杯壁散热速度显著加快，温度分布更加不均匀。', highlight: 'material-select' },
            { title: '深度温度检测', desc: '点击3D模型上的任意位置放置探针，系统会实时显示该点的温度和变化曲线。杯中心和杯壁的温度差异可达10°C以上。', highlight: 'canvas-container' },
            { title: 'AI 智能分析', desc: '基于完整的温度场模拟数据，SyncNeuro引擎自动分析出最佳饮用时段和各阶段的推荐饮用位置。', highlight: '' },
            { title: 'SyncNeuro 物理AI', desc: '与传统数值方法(需要1-3秒重算)不同，PINN模型经过训练后可在毫秒级完成推理。这正是物理AI驱动工业智能的核心优势。', highlight: '' },
        ];
        this.updateStoryContent();
        document.getElementById('story-overlay').style.display = 'flex';
    }
    
    updateStoryContent() {
        const data = this.storyData[this.storyStep];
        document.getElementById('story-title').textContent = data.title;
        document.getElementById('story-desc').textContent = data.desc;
        const dots = document.querySelectorAll('.story-dot');
        dots.forEach((d, i) => d.classList.toggle('active', i === this.storyStep));
        document.getElementById('story-prev').style.display = this.storyStep === 0 ? 'none' : '';
        document.getElementById('story-next').textContent = this.storyStep === this.storyData.length - 1 ? '完成 ✓' : '下一步 →';
    }
    
    storyNext() {
        if (this.storyStep < this.storyData.length - 1) {
            this.storyStep++;
            this.updateStoryContent();
        } else {
            this.closeStoryMode();
        }
    }
    
    storyPrev() {
        if (this.storyStep > 0) {
            this.storyStep--;
            this.updateStoryContent();
        }
    }
    
    closeStoryMode() {
        document.getElementById('story-overlay').style.display = 'none';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const app = new WaterSimulatorApp();
    // 自动播放: 页面加载后自动启动模拟
    setTimeout(() => {
        app.startSimulation();
        // 显示HUD
        setTimeout(() => app.initHUD(), 200);
    }, 500);
});