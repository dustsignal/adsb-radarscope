// ADSB Radarscope
//  Author: dustsignal & wire99
//  Version: 0.9.1.1947080925
//  GitHub: https://github.com/dustsignal/adsb-scope
//
//  This program is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  This program is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <https://www.gnu.org/licenses/>. */

// Set up Tailwind theme colors from config
if (window.tailwind) {
    tailwind.config = {
        theme: {
            extend: {
                colors: SCOPE_THEME_COLORS
            }
        }
    };
}

// IIFE with performance optimizations
(function() {
    'use strict';

    // State Management with Proxy Detection
    class StateManager {
        constructor(initialState) {
            this.listeners = new Map();
            this.state = this.createProxy(initialState);
        }

        createProxy(obj) {
            const self = this;
            return new Proxy(obj, {
                set(target, property, value) {
                    const oldValue = target[property];
                    if (CONFIG.PERFORMANCE.IMMUTABLE_STATE_UPDATES && 
                        typeof value === 'object' && value !== null) {
                        value = JSON.parse(JSON.stringify(value));
                    }
                    target[property] = value;
                    
                    if (oldValue !== value) {
                        self.notifyListeners(property, value, oldValue);
                    }
                    return true;
                }
            });
        }

        subscribe(property, callback) {
            if (!this.listeners.has(property)) {
                this.listeners.set(property, new Set());
            }
            this.listeners.get(property).add(callback);
        }

        notifyListeners(property, newValue, oldValue) {
            const callbacks = this.listeners.get(property);
            if (callbacks) {
                callbacks.forEach(callback => callback(newValue, oldValue));
            }
        }
    }

    // Memory Management with Object Pooling
    class ObjectPool {
        constructor(createFn, resetFn, initialSize = CONFIG.PERFORMANCE.OBJECT_POOL_SIZE) {
            this.createFn = createFn;
            this.resetFn = resetFn;
            this.pool = [];
            
            for (let i = 0; i < initialSize; i++) {
                this.pool.push(this.createFn());
            }
        }

        acquire() {
            return this.pool.length > 0 ? this.pool.pop() : this.createFn();
        }

        release(obj) {
            if (this.resetFn) this.resetFn(obj);
            this.pool.push(obj);
        }
    }

    // Object pools for frequently created objects
    const trailPointPool = new ObjectPool(
        () => ({ x: 0, y: 0, lat: 0, lon: 0, timestamp: 0 }),
        (obj) => { obj.x = obj.y = obj.lat = obj.lon = obj.timestamp = 0; }
    );

    // Enhanced Application State with performance optimizations
    const stateManager = new StateManager({
        aircraftData: {},
        displayedAircraft: {},
        sessionStats: {
            uniqueAircraft: new Set(),
            maxConcurrent: 0,
            startTime: Date.now(),
            messagesReceived: 0,
            sourceDistribution: { adsb: 0, mlat: 0, other: 0 }
        },
        selectedHex: null,
        connectionStatus: "Connecting...",
        isPaused: false,
        showDebugInfo: false,
        sweepAngle: 0,
        prevSweepAngle: 0,
        maxRangeNm: CONFIG.DEFAULT_RANGE_NM,
        scopeThemeIndex: 0,
        uiTheme: 'default-dark',
        aircraftFilter: 'all',
        activeAlerts: new Set(),
        lastUiUpdateTime: 0,
        showVectors: false,
        showAirports: false,
        showNavaids: false,
        showRunways: true,
        soundEnabled: false,
        homeLat: CONFIG.DEFAULT_HOME_LAT,
        homeLon: CONFIG.DEFAULT_HOME_LON,
        dataSources: [{ url: CONFIG.DEFAULT_TAR1090_URL, name: 'Default', enabled: true }],
        retryAttempts: {},
        popupAircraft: null,
        popupUpdateInterval: null,
        airports: [],
        navaids: [],
        runways: [],
        dataLoaded: false,
        lastRangeNm: CONFIG.DEFAULT_RANGE_NM,
        minRunwayLength: CONFIG.AIRPORT_DISPLAY.MIN_RUNWAY_LENGTH_FT,
        aircraftSectionExpanded: true,
        metricsSectionExpanded: true,
        maxTrailLength: CONFIG.MAX_TRAIL_LENGTH,
        trailFadeTimeMinutes: CONFIG.TRAIL_FADE_TIME_MINUTES,
        trailWidth: 2,
        lastDataUpdate: 0,
        renderRequested: false,
        lastRenderTime: 0,
        frameCount: 0,
        fps: 0,
        lastFpsUpdateTime: 0,
        eventListeners: [],
        intervals: [],
        timeouts: []
    });

    const state = stateManager.state;

    // WeakMap for aircraft references
    const aircraftReferences = new WeakMap();

    // DOM Elements Cache with error checking
    const elements = {
        canvas: document.getElementById('radarCanvas'),
        canvasContainer: document.getElementById('canvas-container'),
        versionDisplay: document.getElementById('version-display'),
        aircraftListBody: document.getElementById('aircraft-list-body'),
        metricsPanel: document.getElementById('metrics-panel'),
        shortcutBar: document.getElementById('shortcut-bar'),
        scopeStatusBar: document.getElementById('scope-status-bar'),
        pausedText: document.getElementById('pausedText'),
        aircraftPopup: document.getElementById('aircraft-popup'),
        airportPopup: document.getElementById('airport-popup'),
        alertContainer: document.getElementById('alert-container'),
        uiThemeButton: document.getElementById('ui-theme-button'),
        uiThemeMenu: document.getElementById('ui-theme-menu'),
        scopeThemeButton: document.getElementById('scope-theme-button'),
        scopeThemeMenu: document.getElementById('scope-theme-menu'),
        hideUiButton: document.getElementById('hide-ui-button'),
        rightPanel: document.getElementById('right-panel'),
        rightResizer: document.getElementById('right-resizer'),
        helpModal: document.getElementById('help-modal'),
        closeHelpButton: document.getElementById('close-help-button'),
        vectorsButton: document.getElementById('vectors-button'),
        airportsButton: document.getElementById('airports-button'),
        navaidsButton: document.getElementById('navaids-button'),
        runwaysButton: document.getElementById('runways-button'),
        settingsButton: document.getElementById('settings-button'),
        exportButton: document.getElementById('export-button'),
        settingsModal: document.getElementById('settings-modal'),
        mobileMenuButton: document.getElementById('mobile-menu-button'),
        mobileMenu: document.getElementById('mobile-menu'),
        mobileOverlay: document.getElementById('mobile-overlay'),
        loadingIndicator: document.getElementById('loading-indicator'),
        aircraftHeader: document.getElementById('aircraft-header'),
        aircraftToggle: document.getElementById('aircraft-toggle'),
        aircraftSection: document.getElementById('aircraft-section'),
        metricsHeader: document.getElementById('metrics-header'),
        metricsToggle: document.getElementById('metrics-toggle'),
        metricsSection: document.getElementById('metrics-section'),
        ctx: null
    };

    // Initialize canvas context with error checking
    if (elements.canvas) {
        elements.ctx = elements.canvas.getContext('2d');
        if (!elements.ctx) {
            ErrorBoundary.handleError(new Error('Canvas 2D context not supported'), 'Canvas');
        }
    }

    // Canvas Rendering with Offscreen Canvas and Caching
    class CanvasRenderer {
        constructor(ctx) {
            this.ctx = ctx;
            this.offscreenCanvas = null;
            this.offscreenCtx = null;
            this.staticElementsCache = null;
            this.dirtyRegions = [];
            this.lastStaticRender = 0;
            
            if (CONFIG.PERFORMANCE.USE_OFFSCREEN_CANVAS && 'OffscreenCanvas' in window) {
                this.initOffscreenCanvas();
            }
        }

        initOffscreenCanvas() {
            try {
                this.offscreenCanvas = new OffscreenCanvas(
                    elements.canvas.width || 800, 
                    elements.canvas.height || 600
                );
                this.offscreenCtx = this.offscreenCanvas.getContext('2d');
            } catch (e) {
                console.warn('OffscreenCanvas not supported, using fallback');
            }
        }

        markDirty(x, y, width, height) {
            if (CONFIG.PERFORMANCE.DIRTY_REGION_TRACKING) {
                this.dirtyRegions.push({ x, y, width, height });
            }
        }

        clearDirtyRegions() {
            this.dirtyRegions = [];
        }

        cacheStaticElements(cx, cy, radius) {
            if (!CONFIG.PERFORMANCE.CACHE_STATIC_ELEMENTS) return;

            // ***** THE FIX IS HERE *****
            // Added state.scopeThemeIndex to the cache key.
            // This forces a redraw of the static elements whenever the theme changes.
            const cacheKey = `${cx}-${cy}-${radius}-${state.maxRangeNm}-${state.showAirports}-${state.showNavaids}-${state.showRunways}-${state.scopeThemeIndex}`;
            const now = Date.now();
            
            if (this.staticElementsCache && this.staticElementsCache.key === cacheKey) {
                return this.staticElementsCache.imageData;
            }

            // Create static elements cache
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = elements.canvas.width;
            tempCanvas.height = elements.canvas.height;
            const tempCtx = tempCanvas.getContext('2d');

            // Draw static elements
            this.drawStaticScope(tempCtx, cx, cy, radius);
            
            const imageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            this.staticElementsCache = { key: cacheKey, imageData };
            this.lastStaticRender = now;
            
            return imageData;
        }

        drawStaticScope(ctx, cx, cy, radius) {
            // Background
            ctx.fillStyle = ThemeManager.getScopeThemeColor('background');
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            
            // Airports and navaids (static)
            if (state.showAirports || state.showNavaids) {
                this.drawAirportsAndNavaids(ctx, cx, cy, radius);
            }
            
            // Grid
            ctx.strokeStyle = ThemeManager.getScopeThemeColor('grid');
            ctx.lineWidth = 1.2;
            
            // Range rings
            for (let i = 1; i <= 4; i++) {
                const ringRadius = radius * (i / 4);
                const rangeNm = state.maxRangeNm * (i / 4);
                
                ctx.beginPath();
                ctx.arc(cx, cy, ringRadius, 0, 2 * Math.PI);
                ctx.stroke();
                
                // Range labels
                this.drawRangeLabel(ctx, cx, cy, ringRadius, rangeNm, i);
            }
            
            // Crosshairs and tick marks
            this.drawCrosshairsAndTicks(ctx, cx, cy, radius);
        }

        drawRangeLabel(ctx, cx, cy, ringRadius, rangeNm, index) {
            ctx.save();
            ctx.fillStyle = ThemeManager.getScopeThemeColor('text');
            ctx.globalAlpha = 0.9;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 10px monospace';
            
            const labelAngle = (index * 45) % 360;
            const labelAngleRad = MathUtils.toRad(labelAngle);
            const labelX = cx + ringRadius * Math.cos(labelAngleRad) + 8;
            const labelY = cy + ringRadius * Math.sin(labelAngleRad);
            
            // Background for better readability
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            const textMetrics = ctx.measureText(`${rangeNm}nm`);
            ctx.fillRect(labelX - 2, labelY - 7, textMetrics.width + 4, 14);
            
            ctx.fillStyle = ThemeManager.getScopeThemeColor('text');
            ctx.fillText(`${rangeNm}nm`, labelX, labelY);
            ctx.restore();
        }

        drawCrosshairsAndTicks(ctx, cx, cy, radius) {
            // Crosshairs
            ctx.strokeStyle = ThemeManager.getScopeThemeColor('grid');
            ctx.beginPath();
            ctx.moveTo(cx - radius, cy);
            ctx.lineTo(cx + radius, cy);
            ctx.moveTo(cx, cy - radius);
            ctx.lineTo(cx, cy + radius);
            ctx.stroke();
            
            // Tick marks
            ctx.font = '8px monospace';
            ctx.fillStyle = ThemeManager.getScopeThemeColor('text');
            
            for (let i = 0; i < 360; i += 10) {
                const angleRad = MathUtils.toRad(i);
                const tickLength = (i % 90 === 0) ? 12 : ((i % 30 === 0) ? 8 : 4);
                const endR = radius + tickLength;
                
                ctx.beginPath();
                ctx.moveTo(cx + radius * Math.cos(angleRad), cy + radius * Math.sin(angleRad));
                ctx.lineTo(cx + endR * Math.cos(angleRad), cy + endR * Math.sin(angleRad));
                ctx.stroke();
                
                if (i % 30 === 0 && i % 90 !== 0) {
                    this.drawTickLabel(ctx, cx, cy, radius, i, angleRad);
                }
            }
            
            // Cardinal directions
            this.drawCardinalDirections(ctx, cx, cy, radius);
        }

        drawTickLabel(ctx, cx, cy, radius, angle, angleRad) {
            const textRadius = radius + 20;
            const textX = cx + textRadius * Math.cos(angleRad);
            const textY = cy + textRadius * Math.sin(angleRad);
            
            ctx.save();
            ctx.translate(textX, textY);
            ctx.rotate(angleRad + Math.PI/2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(angle.toString(), 0, 0);
            ctx.restore();
        }

        drawCardinalDirections(ctx, cx, cy, radius) {
            const textRadius = radius + 25;
            ctx.font = `${Math.max(10, radius * 0.035)}px monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = ThemeManager.getScopeThemeColor('text');
            
            ctx.fillText("N", cx, cy - textRadius);
            ctx.fillText("E", cx + textRadius, cy);
            ctx.fillText("S", cx, cy + textRadius);
            ctx.fillText("W", cx - textRadius, cy);
        }

        drawAirportsAndNavaids(ctx, cx, cy, radius) {
            const airports = state.showAirports ? 
                CSVDataManager.getAirportsInRange(state.homeLat, state.homeLon, state.maxRangeNm) : [];
            const navaids = state.showNavaids ? 
                CSVDataManager.getNavaidsInRange(state.homeLat, state.homeLon, state.maxRangeNm) : [];
            
            // Draw airports
            if (state.showAirports && airports.length > 0) {
                this.drawAirports(ctx, airports, cx, cy, radius);
            }
            
            // Draw navaids
            if (state.showNavaids && navaids.length > 0) {
                this.drawNavaids(ctx, navaids, cx, cy, radius);
            }
        }

        drawAirports(ctx, airports, cx, cy, radius) {
            ctx.save();
            ctx.strokeStyle = '#8888FF';
            ctx.fillStyle = '#8888FF';
            ctx.lineWidth = 2;
            
            for (const airport of airports) {
                const pos = MathUtils.latLonToScreen(airport.lat, airport.lon, state.maxRangeNm, cx, cy, radius);
                if (!pos) continue;
                
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, CONFIG.AIRPORT_DISPLAY.SYMBOL_SIZE, 0, 2 * Math.PI);
                ctx.stroke();
                
                ctx.font = `${CONFIG.AIRPORT_DISPLAY.LABEL_FONT_SIZE}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText(airport.icao, pos.x, pos.y - 12);
                
                if (state.showRunways) {
                    this.drawRunwaysForAirport(ctx, airport.icao, cx, cy, radius);
                }
            }
            ctx.restore();
        }

        drawNavaids(ctx, navaids, cx, cy, radius) {
            ctx.save();
            ctx.strokeStyle = '#FFAA88';
            ctx.fillStyle = '#FFAA88';
            ctx.lineWidth = 1;
            
            for (const navaid of navaids) {
                const pos = MathUtils.latLonToScreen(navaid.lat, navaid.lon, state.maxRangeNm, cx, cy, radius);
                if (!pos) continue;
                
                ctx.beginPath();
                if (navaid.type === 'VOR' || navaid.type === 'VORTAC') {
                    // Draw hexagon for VOR
                    for (let i = 0; i < 6; i++) {
                        const angle = (i * Math.PI) / 3;
                        const x = pos.x + CONFIG.AIRPORT_DISPLAY.NAVAID_SYMBOL_SIZE * Math.cos(angle);
                        const y = pos.y + CONFIG.AIRPORT_DISPLAY.NAVAID_SYMBOL_SIZE * Math.sin(angle);
                        if (i === 0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    }
                    ctx.closePath();
                } else {
                    ctx.arc(pos.x, pos.y, CONFIG.AIRPORT_DISPLAY.NAVAID_SYMBOL_SIZE, 0, 2 * Math.PI);
                }
                ctx.stroke();
                
                ctx.font = '9px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(navaid.ident, pos.x, pos.y - 10);
            }
            ctx.restore();
        }

        drawRunwaysForAirport(ctx, icao, cx, cy, radius) {
            const runways = CSVDataManager.getRunwaysForAirport(icao);
            
            ctx.save();
            ctx.strokeStyle = '#6666AA';
            ctx.lineWidth = CONFIG.AIRPORT_DISPLAY.RUNWAY_LINE_WIDTH;
            
            for (const runway of runways) {
                const pos1 = MathUtils.latLonToScreen(runway.lat1, runway.lon1, state.maxRangeNm, cx, cy, radius);
                const pos2 = MathUtils.latLonToScreen(runway.lat2, runway.lon2, state.maxRangeNm, cx, cy, radius);
                
                if (pos1 && pos2) {
                    ctx.beginPath();
                    ctx.moveTo(pos1.x, pos1.y);
                    ctx.lineTo(pos2.x, pos2.y);
                    ctx.stroke();
                }
            }
            ctx.restore();
        }
    }

    // Initialize the canvas renderer
    let canvasRenderer = null;
    if (elements.ctx) {
        canvasRenderer = new CanvasRenderer(elements.ctx);
    }

    // Audio context for sound alerts
    let audioContext = null;

    // Global error boundary
    const ErrorBoundary = {
        handleError(error, context = 'Application') {
            console.error(`[${context}] Error:`, error);
            this.showError(`${context} Error: ${error.message}`);
            
            if (window.gtag) {
                window.gtag('event', 'exception', {
                    description: `${context}: ${error.message}`,
                    fatal: false
                });
            }
        },
        
        showError(message) {
            const errorDisplay = document.getElementById('error-display');
            if (!errorDisplay) return;
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.innerHTML = `
                <div class="flex justify-between items-center">
                    <span>${message}</span>
                    <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-white hover:text-red-200">×</button>
                </div>
            `;
            errorDisplay.appendChild(errorDiv);
            
            setTimeout(() => {
                if (errorDiv.parentNode) {
                    errorDiv.remove();
                }
            }, 10000);
        },
        
        showWarning(message) {
            const errorDisplay = document.getElementById('error-display');
            if (!errorDisplay) return;
            
            const warningDiv = document.createElement('div');
            warningDiv.className = 'warning-message';
            warningDiv.innerHTML = `
                <div class="flex justify-between items-center">
                    <span>${message}</span>
                    <button onclick="this.parentElement.parentElement.remove()" class="ml-2 text-white hover:text-orange-200">×</button>
                </div>
            `;
            errorDisplay.appendChild(warningDiv);
            
            setTimeout(() => {
                if (warningDiv.parentNode) {
                    warningDiv.remove();
                }
            }, 7000);
        }
    };

    // Enhanced Memory Management
    const MemoryManager = {
        cleanup() {
            const now = Date.now();
            const cutoffTime = now - (state.trailFadeTimeMinutes * 60 * 1000);
            
            // Clean up old trail points using object pool
            Object.values(state.displayedAircraft).forEach(aircraft => {
                if (aircraft.geoTrail) {
                    const validPoints = [];
                    aircraft.geoTrail.forEach(point => {
                        if (!point.timestamp || point.timestamp > cutoffTime) {
                            validPoints.push(point);
                        } else {
                            trailPointPool.release(point);
                        }
                    });
                    aircraft.geoTrail = validPoints;
                }
            });
            
            // Clean up old aircraft
            const aircraftCutoff = now - (CONFIG.SWEEP_DURATION_S * CONFIG.AIRCRAFT_TIMEOUT_FACTOR * 1000);
            Object.keys(state.displayedAircraft).forEach(hex => {
                const aircraft = state.displayedAircraft[hex];
                if (aircraft.lastUpdateTime && (aircraft.lastUpdateTime * 1000) < aircraftCutoff) {
                    // Clean up trail points before deleting aircraft
                    if (aircraft.geoTrail) {
                        aircraft.geoTrail.forEach(point => trailPointPool.release(point));
                    }
                    delete state.displayedAircraft[hex];
                }
            });

            // Force garbage collection hint (if available)
            if (window.gc && CONFIG.PERFORMANCE.AGGRESSIVE_TRAIL_CLEANUP) {
                window.gc();
            }
        },
        
        scheduleCleanup() {
            const cleanupInterval = setInterval(() => this.cleanup(), CONFIG.MEMORY_CLEANUP_INTERVAL_MS);
            state.intervals.push(cleanupInterval);
        }
    };

    // Enhanced Utility Functions with optimized calculations
    const MathUtils = {
        // Cache for frequently used calculations
        _cache: new Map(),
        
        toRad: (deg) => deg * Math.PI / 180,
        toDeg: (rad) => rad * 180 / Math.PI,
        
        // Optimized haversine with caching
        haversineDistance(lat1, lon1, lat2, lon2) {
            const cacheKey = `${lat1.toFixed(4)}-${lon1.toFixed(4)}-${lat2.toFixed(4)}-${lon2.toFixed(4)}`;
            if (this._cache.has(cacheKey)) {
                return this._cache.get(cacheKey);
            }
            
            const R = 3440.065; // Nautical miles
            const dLat = this.toRad(lat2 - lat1);
            const dLon = this.toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) ** 2 + 
                     Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLon / 2) ** 2;
            const result = R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
            
            this._cache.set(cacheKey, result);
            if (this._cache.size > 1000) {
                const firstKey = this._cache.keys().next().value;
                this._cache.delete(firstKey);
            }
            
            return result;
        },
        
        bearing(lat1, lon1, lat2, lon2) {
            const lat1Rad = this.toRad(lat1);
            const lat2Rad = this.toRad(lat2);
            const dLon = this.toRad(lon2 - lon1);
            const y = Math.sin(dLon) * Math.cos(lat2Rad);
            const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
                     Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
            return (this.toDeg(Math.atan2(y, x)) + 360) % 360;
        },
        
        // Performance optimized screen positioning
        latLonToScreen(lat, lon, maxRange, centerX, centerY, radius) {
            const distNm = this.haversineDistance(state.homeLat, state.homeLon, lat, lon);
            if (distNm > maxRange) return null;
            
            const brngDeg = this.bearing(state.homeLat, state.homeLon, lat, lon);
            const screenAngleRad = this.toRad(brngDeg - 90);
            const distPx = (distNm / maxRange) * radius;
            
            return {
                x: centerX + distPx * Math.cos(screenAngleRad),
                y: centerY + distPx * Math.sin(screenAngleRad),
                dist: distNm
            };
        },
        
        // Remove redundant trail storage
        geoTrailToScreen(geoTrail, maxRange, centerX, centerY, radius) {
            const screenTrail = [];
            for (let i = 0; i < geoTrail.length; i++) {
                const point = geoTrail[i];
                const screenPos = this.latLonToScreen(point.lat, point.lon, maxRange, centerX, centerY, radius);
                if (screenPos) {
                    screenTrail.push({
                        x: screenPos.x,
                        y: screenPos.y,
                        timestamp: point.timestamp
                    });
                }
            }
            return screenTrail;
        },
        
        projectPosition(lat, lon, track, speedKts, minutes) {
            const distNm = (speedKts / 60) * minutes;
            const R = 3440.065;
            const d = distNm / R;
            const brng = this.toRad(track);
            const lat1 = this.toRad(lat);
            const lon1 = this.toRad(lon);
            
            const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + 
                        Math.cos(lat1) * Math.sin(d) * Math.cos(brng));
            const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
                                          Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
            
            return {
                lat: this.toDeg(lat2),
                lon: this.toDeg(lon2)
            };
        }
    };

    // Enhanced Tooltip Manager for mobile support
    const TooltipManager = {
        activeTooltip: null,
        mobileTimeout: null,
        
        init() {
            document.addEventListener('mousemove', (e) => {
                const activeTooltip = document.querySelector('.tooltip:hover .tooltip-text');
                if (activeTooltip) {
                    this.positionTooltip(activeTooltip, e);
                }
            });
            
            if ('ontouchstart' in window) {
                document.addEventListener('touchstart', this.handleMobileTouch.bind(this));
            }
        },
        
        positionTooltip(tooltip, event) {
            const rect = tooltip.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            let x = event.clientX;
            let y = event.clientY - rect.height - 10;
            
            if (x + rect.width > viewportWidth) {
                x = viewportWidth - rect.width - 10;
            }
            if (x < 10) {
                x = 10;
            }
            if (y < 10) {
                y = event.clientY + 20;
            }
            
            tooltip.style.left = `${x}px`;
            tooltip.style.top = `${y}px`;
        },
        
        handleMobileTouch(e) {
            const button = e.target.closest('.tooltip');
            if (button) {
                e.preventDefault();
                this.showMobileTooltip(button, e.touches[0]);
            } else {
                this.hideMobileTooltip();
            }
        },
        
        showMobileTooltip(button, touch) {
            this.hideMobileTooltip();
            
            const tooltip = button.querySelector('.tooltip-text');
            if (tooltip) {
                tooltip.classList.add('mobile-show');
                this.positionTooltip(tooltip, touch);
                this.activeTooltip = tooltip;
                
                this.mobileTimeout = setTimeout(() => {
                    this.hideMobileTooltip();
                }, 3000);
            }
        },
        
        hideMobileTooltip() {
            if (this.activeTooltip) {
                this.activeTooltip.classList.remove('mobile-show');
                this.activeTooltip = null;
            }
            if (this.mobileTimeout) {
                clearTimeout(this.mobileTimeout);
                this.mobileTimeout = null;
            }
        }
    };

    // Sound Manager
    const SoundManager = {
        playEmergencyAlert() {
            if (!state.soundEnabled || !audioContext) return;
            
            try {
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
                oscillator.frequency.setValueAtTime(440, audioContext.currentTime + 0.1);
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.5);
            } catch (error) {
                ErrorBoundary.handleError(error, 'Sound');
            }
        }
    };

    // Enhanced Theme Management
    const ThemeManager = {
        applyUiTheme() {
            try {
                document.documentElement.setAttribute('data-ui-theme', state.uiTheme);
                if (CONFIG.PERFORMANCE.LOCALSTORAGE_DEBOUNCE_MS) {
                    this.debouncedSave();
                } else {
                    localStorage.setItem('adsbScope_uiTheme', state.uiTheme);
                }
            } catch (error) {
                ErrorBoundary.handleError(error, 'Theme');
            }
        },
        
        debouncedSave: (() => {
            let timeout;
            return () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    localStorage.setItem('adsbScope_uiTheme', state.uiTheme);
                }, CONFIG.PERFORMANCE.LOCALSTORAGE_DEBOUNCE_MS);
            };
        })(),
        
        getScopeThemeColor(colorName) {
            const themeKey = SCOPE_THEMES[state.scopeThemeIndex]?.key || 'classic';
            const colorConfig = SCOPE_THEME_COLORS[themeKey] || {};
            return colorConfig[colorName] || '#FF00FF';
        }
    };

    // Enhanced URL Validation
    const URLValidator = {
        isValidUrl(string) {
            try {
                const url = new URL(string);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch {
                return false;
            }
        },
        
        isValidDataSourceUrl(url) {
            if (!this.isValidUrl(url)) return false;
            
            if (url.includes('aircraft.json') || 
                url.includes('/data/') || 
                url.endsWith('.json')) {
                return true;
            }
            
            return false;
        },
        
        sanitizeUrl(url) {
            if (!url) return '';
            return url.trim().replace(/[<>]/g, '');
        }
    };

    // CSV Data Manager with performance optimizations
    const CSVDataManager = {
        async loadAllData() {
            try {
                elements.loadingIndicator?.classList.remove('hidden');
                
                const [airports, navaids, runways] = await Promise.allSettled([
                    this.loadCSV(CONFIG.DATA_PATHS.AIRPORTS, this.parseAirports),
                    this.loadCSV(CONFIG.DATA_PATHS.NAVAIDS, this.parseNavaids),
                    this.loadCSV(CONFIG.DATA_PATHS.RUNWAYS, this.parseRunways)
                ]);
                
                state.airports = airports.status === 'fulfilled' ? airports.value : [];
                state.navaids = navaids.status === 'fulfilled' ? navaids.value : [];
                state.runways = runways.status === 'fulfilled' ? runways.value : [];
                state.dataLoaded = true;
                
                console.log(`Loaded ${state.airports.length} airports, ${state.navaids.length} navaids, ${state.runways.length} runways`);
                
                if (airports.status === 'rejected') {
                    ErrorBoundary.showWarning('Airport data could not be loaded');
                }
                if (navaids.status === 'rejected') {
                    ErrorBoundary.showWarning('Navaid data could not be loaded');
                }
                if (runways.status === 'rejected') {
                    ErrorBoundary.showWarning('Runway data could not be loaded');
                }
            } catch (error) {
                ErrorBoundary.handleError(error, 'CSV Data Loading');
                state.airports = [];
                state.navaids = [];
                state.runways = [];
            } finally {
                elements.loadingIndicator?.classList.add('hidden');
            }
        },
        
        async loadCSV(path, parser) {
            const response = await fetch(path);
            if (!response.ok) {
                throw new Error(`Failed to fetch ${path}: ${response.status}`);
            }
            const text = await response.text();
            return parser(text);
        },
        
        parseAirports(csvText) {
            const lines = csvText.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            const airports = [];
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const values = CSVDataManager.parseCSVLine(line);
                const airport = {};
                
                headers.forEach((header, index) => {
                    airport[header] = values[index] || '';
                });
                
                if (airport.latitude_deg && airport.longitude_deg && 
                    airport.icao_code && airport.icao_code.length === 4) {
                    airports.push({
                        icao: airport.icao_code,
                        name: airport.name,
                        lat: parseFloat(airport.latitude_deg),
                        lon: parseFloat(airport.longitude_deg),
                        elevation: parseFloat(airport.elevation_ft) || 0,
                        type: airport.type,
                        municipality: airport.municipality,
                        iso_country: airport.iso_country
                    });
                }
            }
            
            return airports;
        },
        
        parseNavaids(csvText) {
            const lines = csvText.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            const navaids = [];
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const values = CSVDataManager.parseCSVLine(line);
                const navaid = {};
                
                headers.forEach((header, index) => {
                    navaid[header] = values[index] || '';
                });
                
                if (navaid.latitude_deg && navaid.longitude_deg && navaid.ident) {
                    navaids.push({
                        ident: navaid.ident,
                        name: navaid.name,
                        type: navaid.type,
                        lat: parseFloat(navaid.latitude_deg),
                        lon: parseFloat(navaid.longitude_deg),
                        elevation: parseFloat(navaid.elevation_ft) || 0,
                        frequency: parseFloat(navaid.frequency_khz) || 0,
                        associated_airport: navaid.associated_airport
                    });
                }
            }
            
            return navaids;
        },
        
        parseRunways(csvText) {
            const lines = csvText.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            const runways = [];
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const values = CSVDataManager.parseCSVLine(line);
                const runway = {};
                
                headers.forEach((header, index) => {
                    runway[header] = values[index] || '';
                });
                
                if (runway.le_latitude_deg && runway.le_longitude_deg && 
                    runway.he_latitude_deg && runway.he_longitude_deg) {
                    const length = parseFloat(runway.length_ft) || 0;
                    
                    if (length >= state.minRunwayLength) {
                        runways.push({
                            airport_ident: runway.airport_ident,
                            id: `${runway.le_ident}/${runway.he_ident}`,
                            length: length,
                            width: parseFloat(runway.width_ft) || 0,
                            surface: runway.surface,
                            lighted: runway.lighted === '1',
                            closed: runway.closed === '1',
                            lat1: parseFloat(runway.le_latitude_deg),
                            lon1: parseFloat(runway.le_longitude_deg),
                            lat2: parseFloat(runway.he_latitude_deg),
                            lon2: parseFloat(runway.he_longitude_deg),
                            le_heading: parseFloat(runway.le_heading_degT) || 0,
                            he_heading: parseFloat(runway.he_heading_degT) || 0
                        });
                    }
                }
            }
            
            return runways;
        },
        
        parseCSVLine(line) {
            const values = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim().replace(/"/g, ''));
                    current = '';
                } else {
                    current += char;
                }
            }
            
            values.push(current.trim().replace(/"/g, ''));
            return values;
        },
        
        getAirportsInRange(lat, lon, rangeNm) {
            return state.airports.filter(airport => {
                const dist = MathUtils.haversineDistance(lat, lon, airport.lat, airport.lon);
                return dist <= rangeNm;
            }).slice(0, CONFIG.AIRPORT_DISPLAY.MAX_AIRPORTS_DISPLAY);
        },
        
        getNavaidsInRange(lat, lon, rangeNm) {
            return state.navaids.filter(navaid => {
                const dist = MathUtils.haversineDistance(lat, lon, navaid.lat, navaid.lon);
                return dist <= rangeNm;
            }).slice(0, CONFIG.AIRPORT_DISPLAY.MAX_AIRPORTS_DISPLAY);
        },
        
        getRunwaysForAirport(icao) {
            return state.runways.filter(runway => runway.airport_ident === icao);
        }
    };

    // Network Request Optimization with pooling
    class NetworkRequestPool {
        constructor() {
            this.activeRequests = new Map();
            this.requestQueue = [];
            this.maxConcurrent = 5;
        }

        async fetch(url, options = {}) {
            // Check if similar request is already in progress
            if (CONFIG.PERFORMANCE.REQUEST_POOLING && this.activeRequests.has(url)) {
                return this.activeRequests.get(url);
            }

            const requestPromise = this.executeRequest(url, options);
            
            if (CONFIG.PERFORMANCE.REQUEST_POOLING) {
                this.activeRequests.set(url, requestPromise);
                requestPromise.finally(() => {
                    this.activeRequests.delete(url);
                });
            }

            return requestPromise;
        }

        async executeRequest(url, options) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT_MS);

            try {
                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                    cache: 'no-cache'
                });
                clearTimeout(timeoutId);
                return response;
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        }
    }

    const networkPool = new NetworkRequestPool();

    // Enhanced Data Management with pre-filtering
    const DataManager = {
        async fetchData() {
            try {
                const enabledSources = state.dataSources.filter(source => source.enabled);
                if (enabledSources.length === 0) {
                    throw new Error('No enabled data sources');
                }
                
                const fetchPromises = enabledSources.map(source => this.fetchFromSource(source));
                const results = await Promise.allSettled(fetchPromises);
                
                const successfulData = results
                    .filter(r => r.status === 'fulfilled')
                    .map(r => r.value);
                
                const failedSources = results
                    .filter(r => r.status === 'rejected')
                    .map((r, i) => ({ source: enabledSources[i], error: r.reason }));
                
                if (successfulData.length > 0) {
                    const mergedData = this.mergeAircraftData(successfulData);
                    this.processAircraftData(mergedData);
                    state.connectionStatus = failedSources.length > 0 ? 
                        `Partial (${failedSources.length} failed)` : "OK";
                    state.lastDataUpdate = Date.now();
                } else {
                    state.connectionStatus = "Error - All sources failed";
                    failedSources.forEach(failed => {
                        ErrorBoundary.showWarning(`Data source "${failed.source.name}" failed: ${failed.error.message}`);
                    });
                }
            } catch (error) {
                ErrorBoundary.handleError(error, 'Data Fetch');
                state.connectionStatus = "Error";
            }
        },
        
        async fetchFromSource(source) {
            if (!URLValidator.isValidDataSourceUrl(source.url)) {
                throw new Error(`Invalid URL: ${source.url}`);
            }
            
            const retryKey = source.url;
            let attempts = state.retryAttempts[retryKey] || 0;
            
            while (attempts < CONFIG.MAX_RETRY_ATTEMPTS) {
                try {
                    const response = await networkPool.fetch(source.url);

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    state.retryAttempts[retryKey] = 0;
                    return { ...data, source: source.name };
                } catch (error) {
                    attempts++;
                    state.retryAttempts[retryKey] = attempts;
                    
                    if (attempts < CONFIG.MAX_RETRY_ATTEMPTS) {
                        const delay = CONFIG.INITIAL_RETRY_DELAY_MS * Math.pow(2, attempts - 1);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        console.error(`Failed to fetch from ${source.name} after ${attempts} attempts:`, error);
                        throw error;
                    }
                }
            }
        },
        
        mergeAircraftData(dataArrays) {
            const merged = { aircraft: [], messages: 0 };
            const seenHexes = new Set();
            
            for (const data of dataArrays) {
                merged.messages += data.messages || 0;
                for (const ac of (data.aircraft || [])) {
                    if (!seenHexes.has(ac.hex)) {
                        seenHexes.add(ac.hex);
                        merged.aircraft.push({ ...ac, dataSource: data.source });
                    }
                }
            }
            
            return merged;
        },
        
        // Pre-filter invalid aircraft data
        processAircraftData(data) {
            const newData = {};
            const aircraft = data.aircraft || [];
            
            // Pre-filter invalid aircraft for better performance
            const validAircraft = aircraft.filter(ac => this.isValidAircraft(ac));
            
            for (const ac of validAircraft) {
                const hex = ac.hex.trim().toUpperCase();
                newData[hex] = ac;
                state.sessionStats.uniqueAircraft.add(hex);
                
                this.updateStatistics(ac);
                
                if (CONFIG.EMERGENCY_SQUAWKS.includes(ac.squawk)) {
                    UIManager.createEmergencyAlert(ac);
                    SoundManager.playEmergencyAlert();
                }
            }
            
            state.aircraftData = newData;
            state.sessionStats.messagesReceived = data.messages || state.sessionStats.messagesReceived;
        },
        
        updateStatistics(aircraft) {
            if (aircraft.mlat && aircraft.mlat.length > 0) {
                state.sessionStats.sourceDistribution.mlat++;
            } else if (aircraft.adsb_version !== undefined) {
                state.sessionStats.sourceDistribution.adsb++;
            } else {
                state.sessionStats.sourceDistribution.other++;
            }
        },
        
        isValidAircraft(aircraft) {
            return aircraft && 
                   'lat' in aircraft && 
                   'lon' in aircraft && 
                   aircraft.hex && 
                   aircraft.hex.trim() &&
                   !isNaN(aircraft.lat) &&
                   !isNaN(aircraft.lon) &&
                   Math.abs(aircraft.lat) <= 90 &&
                   Math.abs(aircraft.lon) <= 180;
        },
        
        isMilitary(hex) {
            const icao = parseInt(hex, 16);
            return (icao >= 0xADF7C0 && icao <= 0xADFFFF) || 
                   (icao >= 0xAE0000 && icao <= 0xAE7FFF);
        },
        
        getDataSourceIndicator(aircraft) {
            if (aircraft.mlat && aircraft.mlat.length > 0) return 'M';
            if (aircraft.adsb_version !== undefined) return 'A';
            return 'O';
        }
    };

    // Enhanced Rendering Engine with optimizations
    const Renderer = {
        lastRenderData: null,
        needsRedraw: true,
        lastFrameTime: 0,
        
        markForRedraw() {
            this.needsRedraw = true;
        },
        
        drawScope(cx, cy, radius) {
            if (!canvasRenderer) return;

            // Use cached static elements if available
            const staticCache = canvasRenderer.cacheStaticElements(cx, cy, radius);
            if (staticCache && CONFIG.PERFORMANCE.CACHE_STATIC_ELEMENTS) {
                elements.ctx.putImageData(staticCache, 0, 0);
            } else {
                canvasRenderer.drawStaticScope(elements.ctx, cx, cy, radius);
            }
        },
        
        drawSweep(cx, cy, radius) {
            const ctx = elements.ctx;
            const sweepColor = ThemeManager.getScopeThemeColor('sweep');
            
            for (let i = 0; i < 10; i++) {
                const angleOffset = state.sweepAngle - i * 0.2;
                const lineAngleRad = MathUtils.toRad(angleOffset);
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + radius * Math.cos(lineAngleRad), cy + radius * Math.sin(lineAngleRad));
                ctx.strokeStyle = sweepColor;
                ctx.globalAlpha = 0.4 - i * 0.04;
                ctx.lineWidth = 3;
                ctx.stroke();
            }
            ctx.globalAlpha = 1.0;
        },
        
        // Optimized aircraft rendering
        drawAircraft(canvasWidth, cx, cy, radius) {
            const ctx = elements.ctx;
            const currentTime = Date.now() / 1000;
            
            // Batch aircraft by render properties for efficiency
            const aircraftByType = {
                emergency: [],
                selected: [],
                adsb: [],
                mlat: [],
                other: []
            };
            
            let processedCount = 0;
            const maxPerFrame = CONFIG.PERFORMANCE.MAX_PARTICLES_PER_FRAME || 1000;
            
            Object.keys(state.displayedAircraft).forEach(hex => {
                if (processedCount >= maxPerFrame) return;
                
                const ac = state.displayedAircraft[hex];
                const timeSinceUpdate = currentTime - ac.lastUpdateTime;
                
                if (timeSinceUpdate > CONFIG.SWEEP_DURATION_S * CONFIG.AIRCRAFT_TIMEOUT_FACTOR) {
                    delete state.displayedAircraft[hex];
                    return;
                }
                
                const isEmergency = CONFIG.EMERGENCY_SQUAWKS.includes(ac.data.squawk) && 
                                  (Math.floor(currentTime * 4) % 2);
                
                let category;
                if (isEmergency) {
                    category = 'emergency';
                } else if (hex === state.selectedHex) {
                    category = 'selected';
                } else if (ac.data.mlat && ac.data.mlat.length > 0) {
                    category = 'mlat';
                } else if (ac.data.adsb_version !== undefined) {
                    category = 'adsb';
                } else {
                    category = 'other';
                }
                
                ac.alpha = 1.0 - Math.min(1.0, timeSinceUpdate / CONFIG.SWEEP_DURATION_S) * 0.5;
                ac.category = category;
                aircraftByType[category].push(ac);
                processedCount++;
            });
            
            // Draw trails and aircraft for each category
            Object.entries(aircraftByType).forEach(([category, aircraft]) => {
                if (aircraft.length === 0) return;
                
                const color = ThemeManager.getScopeThemeColor(category);
                ctx.strokeStyle = ctx.fillStyle = color;
                
                // Draw all trails for this category
                aircraft.forEach(ac => {
                    this.drawAircraftTrail(ac, cx, cy, radius, color);
                });
                
                // Draw all symbols for this category
                aircraft.forEach(ac => {
                    this.drawAircraftSymbol(ac, canvasWidth, color);
                });
            });
            
            ctx.globalAlpha = 1.0;
            ctx.textAlign = 'center';
        },
        
        // Enhanced trail drawing (only geographic coordinates)
        drawAircraftTrail(ac, cx, cy, radius, color) {
            const ctx = elements.ctx;
            const currentTime = Date.now();
            const fadeTimeMs = state.trailFadeTimeMinutes * 60 * 1000;
            
            if (!ac.geoTrail || ac.geoTrail.length < 2) return;
            
            // Convert geographic trail to screen coordinates on-demand
            const screenTrail = MathUtils.geoTrailToScreen(ac.geoTrail, state.maxRangeNm, cx, cy, radius);
            
            if (screenTrail.length < 2) return;
            
            // Draw trail segments with time-based fading
            for (let i = 0; i < screenTrail.length - 1; i++) {
                const p1 = screenTrail[i];
                const p2 = screenTrail[i + 1];
                
                if (!p1 || !p2) continue;
                
                // Calculate fade based on age
                const age = currentTime - (p2.timestamp || currentTime);
                const fadeRatio = Math.max(0, 1 - (age / fadeTimeMs));
                const segmentAlpha = ac.alpha * fadeRatio;
                
                if (segmentAlpha <= 0.01) continue;
                
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.strokeStyle = color;
                ctx.globalAlpha = segmentAlpha;
                ctx.lineWidth = state.trailWidth + fadeRatio * (state.trailWidth * 0.5);
                ctx.stroke();
            }
        },
        
        drawAircraftSymbol(ac, canvasWidth, color) {
            const ctx = elements.ctx;
            const { x, y } = ac.displayPos;
            
            ctx.globalAlpha = ac.alpha;
            ctx.fillStyle = ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            // Draw symbol based on altitude
            if (ac.data.gnd) {
                ctx.rect(x - CONFIG.AIRCRAFT_SYMBOL_SIZE, y - CONFIG.AIRCRAFT_SYMBOL_SIZE,
                        CONFIG.AIRCRAFT_SYMBOL_SIZE * 2, CONFIG.AIRCRAFT_SYMBOL_SIZE * 2);
            } else if (ac.data.alt_baro < 1000) {
                ctx.moveTo(x, y - CONFIG.AIRCRAFT_SYMBOL_SIZE);
                ctx.lineTo(x - CONFIG.AIRCRAFT_SYMBOL_SIZE, y + CONFIG.AIRCRAFT_SYMBOL_SIZE);
                ctx.lineTo(x + CONFIG.AIRCRAFT_SYMBOL_SIZE, y + CONFIG.AIRCRAFT_SYMBOL_SIZE);
                ctx.closePath();
            } else {
                ctx.arc(x, y, CONFIG.AIRCRAFT_SYMBOL_SIZE, 0, 2 * Math.PI);
            }
            ctx.fill();
            
            // Draw heading line
            if (!ac.data.gnd && ac.displayHeading) {
                const headingRad = MathUtils.toRad(ac.displayHeading - 90);
                ctx.beginPath();
                ctx.moveTo(x + 6 * Math.cos(headingRad), y + 6 * Math.sin(headingRad));
                ctx.lineTo(x + CONFIG.HEADING_LINE_LENGTH * Math.cos(headingRad), 
                          y + CONFIG.HEADING_LINE_LENGTH * Math.sin(headingRad));
                ctx.stroke();
            }
            
            // Draw speed vector if enabled
            if (state.showVectors && ac.data.track && ac.data.gs && !ac.data.gnd) {
                this.drawSpeedVector(ac, x, y);
            }
            
            // Draw labels
            this.drawAircraftLabels(ac, x, y, canvasWidth);
        },
        
        drawSpeedVector(ac, x, y) {
            const ctx = elements.ctx;
            const projected = MathUtils.projectPosition(
                ac.data.lat, ac.data.lon,
                ac.data.track, ac.data.gs,
                CONFIG.VECTOR_MINUTES
            );
            
            const screenPos = MathUtils.latLonToScreen(
                projected.lat, projected.lon,
                state.maxRangeNm, 
                elements.canvas.width / 2, 
                elements.canvas.height / 2,
                Math.min(elements.canvas.width, elements.canvas.height) / 2 - CONFIG.CANVAS_PADDING
            );
            
            if (screenPos) {
                ctx.globalAlpha = ac.alpha * 0.5;
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(screenPos.x, screenPos.y);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        },
        
        drawAircraftLabels(ac, x, y, canvasWidth) {
            const ctx = elements.ctx;
            ctx.globalAlpha = ac.alpha;
            ctx.fillStyle = ThemeManager.getScopeThemeColor('text');
            
            const onLeftHalf = x < canvasWidth / 2;
            ctx.textAlign = onLeftHalf ? 'left' : 'right';
            const xPos = onLeftHalf ? x + 15 : x - 15;
            
            ctx.font = '12px monospace';
            ctx.fillText((ac.data.flight || 'N/A').trim(), xPos, y + 5);
            ctx.font = '10px monospace';
            ctx.fillText(`${ac.data.alt_baro || '???'}ft | ${ac.data.gs || '???'}kt`, xPos, y + 18);
            ctx.fillText(`HDG ${ac.data.track || '???'}° | SQK ${ac.data.squawk || '????'}`, xPos, y + 30);
        },

        // DEBUG
        drawDebugInfo(ctx) {
            if (!state.showDebugInfo) return;

            ctx.save();
            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(5, 5, 180, 60);

            ctx.font = '12px monospace';
            ctx.fillStyle = '#00FF00';
            ctx.textAlign = 'left';
            
            // Display FPS
            ctx.fillText(`FPS: ${state.fps}`, 10, 20);

            // Display Memory Usage (if available)
            if (performance.memory) {
                const usedMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(1);
                const totalMB = (performance.memory.totalJSHeapSize / 1048576).toFixed(1);
                ctx.fillText(`Mem: ${usedMB}MB / ${totalMB}MB`, 10, 40);
            } else {
                ctx.fillText('Mem: N/A', 10, 40);
            }

            // Display Tracked Aircraft
            const trackedCount = Object.keys(state.displayedAircraft).length;
            ctx.fillText(`Tracked: ${trackedCount}`, 10, 60);

            ctx.restore();
        }
        // DEBUG
    };

    // Enhanced UI Manager with DOM batching
    const UIManager = {
        pendingUpdates: {
            aircraftList: false,
            metrics: false,
            status: false
        },
        
        batchUpdates() {
            if (CONFIG.PERFORMANCE.BATCH_DOM_UPDATES) {
                requestAnimationFrame(() => {
                    if (this.pendingUpdates.aircraftList) {
                        this.updateAircraftListInternal();
                        this.pendingUpdates.aircraftList = false;
                    }
                    if (this.pendingUpdates.metrics) {
                        this.updateMetricsPanelInternal();
                        this.pendingUpdates.metrics = false;
                    }
                    if (this.pendingUpdates.status) {
                        this.updateScopeStatusInternal();
                        this.pendingUpdates.status = false;
                    }
                });
            }
        },
        
        updateAircraftList() {
            if (CONFIG.PERFORMANCE.BATCH_DOM_UPDATES) {
                this.pendingUpdates.aircraftList = true;
                this.batchUpdates();
            } else {
                this.updateAircraftListInternal();
            }
        },
        
        updateAircraftListInternal() {
            const sortedAircraft = Object.values(state.displayedAircraft)
                .sort((a, b) => (a.dist ?? Infinity) - (b.dist ?? Infinity));
            
            if (sortedAircraft.length === 0) {
                elements.aircraftListBody.innerHTML = 
                    `<tr><td colspan="5" class="text-center p-4" style="color: var(--color-text-muted);">No aircraft in range</td></tr>`;
                return;
            }
            
            // Use DocumentFragment for batch DOM updates
            const fragment = CONFIG.PERFORMANCE.USE_DOCUMENT_FRAGMENT ? 
                document.createDocumentFragment() : null;
            
            const rows = sortedAircraft.map(ac => {
                const isSelected = ac.data.hex === state.selectedHex;
                const sourceIndicator = DataManager.getDataSourceIndicator(ac.data);
                const row = document.createElement('tr');
                row.className = `aircraft-row ${isSelected ? 'selected-row' : ''}`;
                row.dataset.hex = ac.data.hex;
                row.innerHTML = `
                    <td class="table-cell font-bold">${ac.data.flight?.trim() || ac.data.hex.slice(0, 6)}</td>
                    <td class="table-cell text-center">${sourceIndicator}</td>
                    <td class="table-cell text-right">${ac.data.alt_baro || 'N/A'}</td>
                    <td class="table-cell text-right">${ac.data.gs || 'N/A'}</td>
                    <td class="table-cell text-right">${ac.dist?.toFixed(1) || 'N/A'}</td>
                `;
                return row;
            });
            
            elements.aircraftListBody.innerHTML = '';
            
            if (fragment) {
                rows.forEach(row => fragment.appendChild(row));
                elements.aircraftListBody.appendChild(fragment);
            } else {
                rows.forEach(row => elements.aircraftListBody.appendChild(row));
            }
            
            if (window.innerWidth <= 768) {
                this.updateMobileAircraftList(sortedAircraft);
            }
        },
        
        updateMobileAircraftList(sortedAircraft) {
            const mobileList = document.getElementById('mobile-aircraft-list');
            if (mobileList) {
                mobileList.innerHTML = sortedAircraft.slice(0, 10).map(ac => 
                    `<div class="p-1 border-b" style="border-color: var(--color-border);">
                        ${ac.data.flight?.trim() || ac.data.hex.slice(0, 6)} - 
                        ${ac.data.alt_baro || '?'}ft - 
                        ${ac.dist?.toFixed(1) || '?'}nm
                    </div>`
                ).join('');
            }
        },
        
        updateMetricsPanel() {
            if (CONFIG.PERFORMANCE.BATCH_DOM_UPDATES) {
                this.pendingUpdates.metrics = true;
                this.batchUpdates();
            } else {
                this.updateMetricsPanelInternal();
            }
        },
        
        updateMetricsPanelInternal() {
            const stats = this.calculateMetrics();
            const metricItem = (label, value) => 
                `<div class="flex justify-between"><span>${label}:</span> <span class="font-bold">${value}</span></div>`;
            
            const metricsHTML = `
                <div class="mb-3">
                    <div class="text-center font-bold text-sm mb-2">Session Stats</div>
                    ${metricItem('Uptime (min)', stats.uptime)}
                    ${metricItem('Max Tracked', state.sessionStats.maxConcurrent)}
                    ${metricItem('Unique Today', state.sessionStats.uniqueAircraft.size)}
                    ${metricItem('Messages', state.sessionStats.messagesReceived.toLocaleString())}
                </div>
                <hr class="my-2" style="border-color: var(--color-border);">
                <div class="mb-3">
                    <div class="text-center font-bold text-sm mb-2">Current Traffic</div>
                    ${metricItem('Military', stats.militaryCount)}
                    ${metricItem('Civilian', stats.civilianCount)}
                    ${metricItem('On Ground', stats.groundCount)}
                    ${metricItem('Emergency', stats.emergencyCount)}
                    ${metricItem('Unique Squawks', stats.uniqueSquawks)}
                </div>
                <hr class="my-2" style="border-color: var(--color-border);">
                <div class="mb-3">
                    <div class="text-center font-bold text-sm mb-2">Averages</div>
                    ${metricItem('Avg Altitude', stats.avgAltitude + (stats.avgAltitude !== 'N/A' ? ' ft' : ''))}
                    ${metricItem('Avg Speed', stats.avgSpeed + (stats.avgSpeed !== 'N/A' ? ' kt' : ''))}
                </div>
                <hr class="my-2" style="border-color: var(--color-border);">
                <div class="mb-3">
                    <div class="text-center font-bold text-sm mb-2">Live Records</div>
                    ${metricItem('Closest', stats.closest)}
                    ${metricItem('Fastest', stats.fastest)}
                    ${metricItem('Highest', stats.highest)}
                    ${metricItem('Lowest', stats.lowest)}
                </div>
            `;
            
            elements.metricsPanel.innerHTML = metricsHTML;
            
            const mobileMetrics = document.getElementById('mobile-metrics');
            if (mobileMetrics) {
                mobileMetrics.innerHTML = metricsHTML;
            }
        },
        
        calculateMetrics() {
            const uptime = ((Date.now() - state.sessionStats.startTime) / 1000 / 60).toFixed(1);
            let fastest = { gs: 0 };
            let closest = { dist: Infinity };
            let highest = { alt_baro: -99999 };
            let lowest = { alt_baro: 99999 };
            let emergencyCount = 0;
            let groundCount = 0;
            let totalAltitude = 0;
            let airborneCount = 0;
            let totalSpeed = 0;
            let speedCount = 0;
            
            const squawks = new Set();
            let militaryCount = 0;
            let civilianCount = 0;
            
            Object.values(state.displayedAircraft).forEach(ac => {
                const hex = ac.data.hex;
                if (DataManager.isMilitary(hex)) {
                    militaryCount++;
                } else {
                    civilianCount++;
                }
                
                if (ac.data.squawk) {
                    squawks.add(ac.data.squawk);
                }
                
                if (ac.data.gnd) {
                    groundCount++;
                } else {
                    airborneCount++;
                    if (ac.data.alt_baro) {
                        totalAltitude += ac.data.alt_baro;
                        if (ac.data.alt_baro > highest.alt_baro) highest = ac.data;
                        if (ac.data.alt_baro < lowest.alt_baro) lowest = ac.data;
                    }
                }
                
                if (ac.data.gs) {
                    totalSpeed += ac.data.gs;
                    speedCount++;
                    if (ac.data.gs > fastest.gs) fastest = ac.data;
                }
                
                if ((ac.dist || Infinity) < closest.dist) {
                    closest = { ...ac.data, dist: ac.dist };
                }
                
                if (CONFIG.EMERGENCY_SQUAWKS.includes(ac.data.squawk)) {
                    emergencyCount++;
                }
            });
            
            const avgAltitude = airborneCount > 0 ? (totalAltitude / airborneCount).toFixed(0) : 'N/A';
            const avgSpeed = speedCount > 0 ? (totalSpeed / speedCount).toFixed(0) : 'N/A';
            
            return {
                uptime,
                groundCount,
                emergencyCount,
                avgAltitude,
                avgSpeed,
                militaryCount,
                civilianCount,
                uniqueSquawks: squawks.size,
                closest: closest.dist !== Infinity ? 
                    `${closest.flight?.trim() || closest.hex} (${closest.dist.toFixed(1)} nm)` : 'N/A',
                fastest: fastest.gs > 0 ? 
                    `${fastest.flight?.trim() || fastest.hex} (${fastest.gs} kt)` : 'N/A',
                highest: highest.alt_baro > -99999 ? 
                    `${highest.flight?.trim() || highest.hex} (${highest.alt_baro} ft)` : 'N/A',
                lowest: lowest.alt_baro < 99999 && airborneCount > 0 ? 
                    `${lowest.flight?.trim() || lowest.hex} (${lowest.alt_baro} ft)` : 'N/A'
            };
        },
        
        updateScopeStatus() {
            if (CONFIG.PERFORMANCE.BATCH_DOM_UPDATES) {
                this.pendingUpdates.status = true;
                this.batchUpdates();
            } else {
                this.updateScopeStatusInternal();
            }
        },
        
        updateScopeStatusInternal() {
            const dataStatus = state.dataLoaded ? 
                `DATA: ${state.airports.length}A/${state.navaids.length}N/${state.runways.length}R` :
                'DATA: Loading...';
            
            let connectionStatusHTML = '';
            if (state.connectionStatus === "OK") {
                connectionStatusHTML = '<span class="status-icon status-ok"></span>CONN: OK';
            } else if (state.connectionStatus.includes("Error")) {
                connectionStatusHTML = '<span class="status-icon status-error"></span>CONN: ' + state.connectionStatus;
            } else {
                connectionStatusHTML = '<span class="status-icon status-connecting"></span>CONN: ' + state.connectionStatus;
            }
            
            elements.scopeStatusBar.innerHTML = [
                `RANGE: ${state.maxRangeNm} NM`,
                connectionStatusHTML,
                `TRACKED: ${Object.keys(state.displayedAircraft).length}`,
                `FILTER: ${state.aircraftFilter.toUpperCase()}`,
                dataStatus,
                `POS: ${state.homeLat.toFixed(5)}, ${state.homeLon.toFixed(5)}`
            ].map(item => `<span>${item}</span>`).join('<span class="mx-2">|</span>');
        },
        
        updateTooltips() {
            const vectorsTooltip = elements.vectorsButton?.querySelector('.tooltip-text');
            const airportsTooltip = elements.airportsButton?.querySelector('.tooltip-text');
            const navaidsTooltip = elements.navaidsButton?.querySelector('.tooltip-text');
            const runwaysTooltip = elements.runwaysButton?.querySelector('.tooltip-text');
            
            if (vectorsTooltip) vectorsTooltip.textContent = `Vectors: ${state.showVectors ? 'ON' : 'OFF'}`;
            if (airportsTooltip) airportsTooltip.textContent = `Airports: ${state.showAirports ? 'ON' : 'OFF'}`;
            if (navaidsTooltip) navaidsTooltip.textContent = `Navaids: ${state.showNavaids ? 'ON' : 'OFF'}`;
            if (runwaysTooltip) runwaysTooltip.textContent = `Runways: ${state.showRunways ? 'ON' : 'OFF'}`;
        },
        
        updatePopup() {
            if (state.popupAircraft && !elements.aircraftPopup.classList.contains('hidden')) {
                const aircraft = state.displayedAircraft[state.popupAircraft];
                if (aircraft) {
                    const { x, y } = aircraft.displayPos;
                    const popupRect = elements.aircraftPopup.getBoundingClientRect();
                    const canvasRect = elements.canvas.getBoundingClientRect();
                    
                    let popupX = x + 15;
                    let popupY = y + 15;
                    
                    if (popupX + popupRect.width > canvasRect.width) {
                        popupX = x - popupRect.width - 15;
                    }
                    if (popupY + popupRect.height > canvasRect.height) {
                        popupY = y - popupRect.height - 15;
                    }
                    
                    elements.aircraftPopup.style.left = `${popupX}px`;
                    elements.aircraftPopup.style.top = `${popupY}px`;
                }
            }
        },
        
        showAirportPopup(airport, x, y) {
            if (!elements.airportPopup) return;
            
            const runways = CSVDataManager.getRunwaysForAirport(airport.icao);
            const runwayInfo = runways.length > 0 ? 
                `<br><strong>Runways:</strong> ${runways.map(r => r.id).join(', ')}` : '';
            
            elements.airportPopup.innerHTML = `
                <div><strong>${airport.icao}</strong> - ${airport.name}</div>
                <div>${airport.municipality}, ${airport.iso_country}</div>
                <div><strong>Elevation:</strong> ${airport.elevation}ft</div>
                <div><strong>Type:</strong> ${airport.type}</div>
                ${runwayInfo}
            `;
            
            const canvasRect = elements.canvas.getBoundingClientRect();
            let popupX = x + 15;
            let popupY = y + 15;
            
            if (popupX + 200 > canvasRect.width) {
                popupX = x - 215;
            }
            if (popupY + 100 > canvasRect.height) {
                popupY = y - 115;
            }
            
            elements.airportPopup.style.left = `${popupX}px`;
            elements.airportPopup.style.top = `${popupY}px`;
            elements.airportPopup.classList.remove('hidden');
            
            setTimeout(() => {
                elements.airportPopup.classList.add('hidden');
            }, 5000);
        },
        
        createShortcutBar() {
            const shortcuts = {
                "H": "Help",
                "D": "Debug Info",
                "Space": "Pause",
                "+/-/Scroll": "Range",
                "M": "Mil/Civ/All",
                "V": "Vectors",
                "A": "Airports",
                "N": "Navaids",
                "R": "Runways",
                "S": "Settings"
            };
            
            const kbdStyle = "font-sans px-1.5 py-0.5 text-xs font-semibold rounded-md border";
            const kbdColors = `background-color: var(--color-kbd-bg); color: var(--color-kbd-text); border-color: var(--color-kbd-border);`;
            
            elements.shortcutBar.innerHTML = Object.entries(shortcuts)
                .map(([key, desc]) => 
                    `<div class="flex items-center gap-1">
                        <kbd class="${kbdStyle}" style="${kbdColors}">${key}</kbd> ${desc}
                    </div>`)
                .join('');
            
            const helpList = document.getElementById('help-shortcut-list');
            if (helpList) {
                helpList.innerHTML = Object.entries(shortcuts)
                    .map(([key, desc]) => 
                        `<div><kbd class="${kbdStyle}" style="${kbdColors}">${key}</kbd> - ${desc}</div>`)
                    .join('');
            }
        },
        
        createEmergencyAlert(aircraft) {
            const hex = aircraft.hex;
            if (state.activeAlerts.has(hex)) return;
            
            state.activeAlerts.add(hex);
            const alertDiv = document.createElement('div');
            alertDiv.className = 'bg-red-500 text-white p-2 rounded-md shadow-lg text-sm alert-animate';
            alertDiv.innerHTML = `<b>EMERGENCY</b><br>${aircraft.flight?.trim() || hex}<br>Squawk: ${aircraft.squawk}`;
            elements.alertContainer.appendChild(alertDiv);
            
            const timeout = setTimeout(() => {
                alertDiv.remove();
                state.activeAlerts.delete(hex);
            }, CONFIG.ALERT_DURATION_MS);
            state.timeouts.push(timeout);
        }
    };

    // Enhanced Export Manager
    const ExportManager = {
        exportCSV() {
            const data = Object.values(state.displayedAircraft);
            const headers = ['hex', 'flight', 'lat', 'lon', 'alt_baro', 'gs', 'track', 'squawk', 'data_source'];
            
            let csv = headers.join(',') + '\n';
            data.forEach(ac => {
                const row = headers.map(h => {
                    if (h === 'data_source') return ac.data.dataSource || '';
                    return ac.data[h] || '';
                }).join(',');
                csv += row + '\n';
            });
            
            this.downloadFile(csv, 'aircraft_data.csv', 'text/csv');
        },
        
        exportKML() {
            const data = Object.values(state.displayedAircraft);
            
            let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>Aircraft Positions</name>`;
            
            data.forEach(ac => {
                kml += `
<Placemark>
    <name>${ac.data.flight || ac.data.hex}</name>
    <description>Alt: ${ac.data.alt_baro}ft, Speed: ${ac.data.gs}kt, Source: ${ac.data.dataSource || 'Unknown'}</description>
    <Point>
        <coordinates>${ac.data.lon},${ac.data.lat},${(ac.data.alt_baro || 0) * 0.3048}</coordinates>
    </Point>
</Placemark>`;
            });
            
            kml += `
</Document>
</kml>`;
            
            this.downloadFile(kml, 'aircraft_positions.kml', 'application/vnd.google-earth.kml+xml');
        },
        
        exportStatistics() {
            const stats = UIManager.calculateMetrics();
            const exportData = {
                session: {
                    startTime: new Date(state.sessionStats.startTime).toISOString(),
                    uptime: stats.uptime,
                    maxConcurrent: state.sessionStats.maxConcurrent,
                    uniqueAircraft: state.sessionStats.uniqueAircraft.size,
                    messagesReceived: state.sessionStats.messagesReceived
                },
                current: {
                    tracked: Object.keys(state.displayedAircraft).length,
                    military: stats.militaryCount,
                    civilian: stats.civilianCount,
                    onGround: stats.groundCount,
                    emergency: stats.emergencyCount,
                    uniqueSquawks: stats.uniqueSquawks
                },
                averages: {
                    altitude: stats.avgAltitude,
                    speed: stats.avgSpeed
                },
                records: {
                    closest: stats.closest,
                    fastest: stats.fastest,
                    highest: stats.highest,
                    lowest: stats.lowest
                },
                configuration: {
                    homePosition: { lat: state.homeLat, lon: state.homeLon },
                    range: state.maxRangeNm,
                    dataSources: state.dataSources.filter(s => s.enabled).map(s => s.name)
                }
            };
            
            this.downloadFile(JSON.stringify(exportData, null, 2), 'adsb_statistics.json', 'application/json');
        },
        
        downloadFile(content, filename, mimeType) {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };

    // Enhanced Aircraft State Manager (geographic-only trail storage)
    const AircraftStateManager = {
        updateAircraftState(cx, cy, radius) {
            const currentTime = Date.now() / 1000;
            state.sessionStats.maxConcurrent = Math.max(
                state.sessionStats.maxConcurrent,
                Object.keys(state.displayedAircraft).length
            );
            
            Object.values(state.aircraftData).forEach(ac_latest => {
                const hex = ac_latest.hex.trim().toUpperCase();
                
                if (!this.shouldDisplayAircraft(ac_latest, hex)) {
                    if (state.displayedAircraft[hex]) {
                        // Clean up trail points before deleting
                        if (state.displayedAircraft[hex].geoTrail) {
                            state.displayedAircraft[hex].geoTrail.forEach(point => 
                                trailPointPool.release(point)
                            );
                        }
                        delete state.displayedAircraft[hex];
                    }
                    return;
                }
                
                const currentBrng = MathUtils.bearing(
                    state.homeLat, state.homeLon,
                    ac_latest.lat, ac_latest.lon
                );
                
                const sweepBrng = ((state.displayedAircraft[hex]?.compassBearing ?? currentBrng) - 90 + 360) % 360;
                const isSwept = this.isInSweepArea(sweepBrng);
                
                if (isSwept) {
                    this.updateAircraftDisplay(hex, ac_latest, currentTime, currentBrng, cx, cy, radius);
                }
            });
        },
        
        shouldDisplayAircraft(aircraft, hex) {
            if (typeof aircraft.alt_baro !== 'number' && !aircraft.gnd) return false;
            
            if (state.aircraftFilter === 'military' && !DataManager.isMilitary(hex)) return false;
            if (state.aircraftFilter === 'civilian' && DataManager.isMilitary(hex)) return false;
            
            return true;
        },
        
        isInSweepArea(sweepBrng) {
            if (state.sweepAngle > state.prevSweepAngle) {
                return sweepBrng > state.prevSweepAngle && sweepBrng <= state.sweepAngle;
            } else if (state.sweepAngle < state.prevSweepAngle) {
                return sweepBrng > state.prevSweepAngle || sweepBrng <= state.sweepAngle;
            }
            return false;
        },
        
        // Store only geographic coordinates for trails
        updateAircraftDisplay(hex, ac_latest, currentTime, currentBrng, cx, cy, radius) {
            const screenPos = MathUtils.latLonToScreen(
                ac_latest.lat, ac_latest.lon,
                state.maxRangeNm, cx, cy, radius
            );
            
            if (!screenPos) {
                if (state.displayedAircraft[hex]) {
                    // Clean up before deleting
                    if (state.displayedAircraft[hex].geoTrail) {
                        state.displayedAircraft[hex].geoTrail.forEach(point => 
                            trailPointPool.release(point)
                        );
                    }
                    delete state.displayedAircraft[hex];
                }
                return;
            }
            
            if (!state.displayedAircraft[hex]) {
                state.displayedAircraft[hex] = { 
                    geoTrail: []  // Only store geographic coordinates
                };
            }
            
            const entry = state.displayedAircraft[hex];
            entry.lastUpdateTime = currentTime;
            entry.displayPos = screenPos;
            entry.displayHeading = ac_latest.track;
            entry.compassBearing = currentBrng;
            entry.data = ac_latest;
            entry.dist = screenPos.dist;
            
            // Store geographic trail points using object pool
            const geoPoint = trailPointPool.acquire();
            geoPoint.lat = ac_latest.lat;
            geoPoint.lon = ac_latest.lon;
            geoPoint.timestamp = Date.now();
            
            entry.geoTrail.push(geoPoint);
            
            // Limit trail length and clean up old points
            while (entry.geoTrail.length > state.maxTrailLength) {
                const oldPoint = entry.geoTrail.shift();
                trailPointPool.release(oldPoint);
            }
        }
    };

    // Enhanced Event Handlers with delegation and debouncing
    const EventHandlers = {
        cleanup() {
            state.eventListeners.forEach(({ element, event, handler }) => {
                element.removeEventListener(event, handler);
            });
            state.eventListeners = [];
            
            state.intervals.forEach(interval => clearInterval(interval));
            state.intervals = [];
            
            state.timeouts.forEach(timeout => clearTimeout(timeout));
            state.timeouts = [];
        },
        
        addEventListenerWithCleanup(element, event, handler, options) {
            if (element) {
                element.addEventListener(event, handler, options);
                state.eventListeners.push({ element, event, handler });
            }
        },
        
        // Debounced resize handler
        createDebouncedResize() {
            let resizeTimeout;
            return () => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    Renderer.markForRedraw();
                    if (canvasRenderer && canvasRenderer.initOffscreenCanvas) {
                        canvasRenderer.initOffscreenCanvas();
                    }
                }, CONFIG.PERFORMANCE.DEBOUNCE_RESIZE_MS);
            };
        },
        
        initializeEventListeners() {
            // Event delegation for dynamic elements
            this.setupEventDelegation();
            
            // Theme dropdowns
            this.setupDropdowns();
            
            // Panel controls
            this.addEventListenerWithCleanup(elements.hideUiButton, 'click', this.togglePanels);
            this.addEventListenerWithCleanup(elements.vectorsButton, 'click', this.toggleVectors.bind(this));
            this.addEventListenerWithCleanup(elements.airportsButton, 'click', this.toggleAirports.bind(this));
            this.addEventListenerWithCleanup(elements.navaidsButton, 'click', this.toggleNavaids.bind(this));
            this.addEventListenerWithCleanup(elements.runwaysButton, 'click', this.toggleRunways.bind(this));
            
            // Modal controls
            this.addEventListenerWithCleanup(elements.settingsButton, 'click', this.showSettings.bind(this));
            this.addEventListenerWithCleanup(elements.exportButton, 'click', this.showExportMenu);
            
            // Collapsible sections
            this.addEventListenerWithCleanup(elements.aircraftHeader, 'click', this.toggleAircraftSection.bind(this));
            this.addEventListenerWithCleanup(elements.metricsHeader, 'click', this.toggleMetricsSection.bind(this));
            
            // Resizers
            this.makeResizable(elements.rightPanel, elements.rightResizer);
            
            // Canvas interactions
            this.addEventListenerWithCleanup(elements.canvas, 'click', this.handleCanvasClick.bind(this));
            this.addEventListenerWithCleanup(elements.canvas, 'wheel', this.handleMouseWheel.bind(this));
            
            // Keyboard shortcuts
            this.addEventListenerWithCleanup(window, 'keydown', this.handleKeydown);
            
            // Debounced window resize
            const debouncedResize = this.createDebouncedResize();
            this.addEventListenerWithCleanup(window, 'resize', debouncedResize);
            
            // Modal close buttons
            this.addEventListenerWithCleanup(elements.closeHelpButton, 'click', () => {
                elements.helpModal.classList.add('hidden');
            });
            
            const closeSettingsBtn = document.getElementById('close-settings-btn');
            this.addEventListenerWithCleanup(closeSettingsBtn, 'click', () => {
                elements.settingsModal.classList.add('hidden');
            });
            
            // Settings save button
            const saveSettingsBtn = document.getElementById('save-settings-btn');
            this.addEventListenerWithCleanup(saveSettingsBtn, 'click', this.saveSettings.bind(this));
            
            // Add source button
            const addSourceBtn = document.getElementById('add-source-btn');
            this.addEventListenerWithCleanup(addSourceBtn, 'click', this.addDataSource.bind(this));
            
            // Mobile menu
            this.addEventListenerWithCleanup(elements.mobileMenuButton, 'click', this.toggleMobileMenu);
            this.addEventListenerWithCleanup(elements.mobileOverlay, 'click', this.toggleMobileMenu);
            
            // Mobile controls
            const mobileButtons = [
                ['mobile-vectors-button', this.toggleVectors.bind(this)],
                ['mobile-airports-button', this.toggleAirports.bind(this)],
                ['mobile-navaids-button', this.toggleNavaids.bind(this)],
                ['mobile-runways-button', this.toggleRunways.bind(this)],
                ['mobile-settings-button', () => { this.toggleMobileMenu(); this.showSettings(); }],
                ['mobile-export-button', () => { this.toggleMobileMenu(); this.showExportMenu(); }]
            ];
            
            mobileButtons.forEach(([id, handler]) => {
                const element = document.getElementById(id);
                this.addEventListenerWithCleanup(element, 'click', handler);
            });
            
            // Initialize audio context on first user interaction
            const initAudio = () => {
                if (!audioContext) {
                    try {
                        audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    } catch (error) {
                        ErrorBoundary.handleError(error, 'Audio Context');
                    }
                }
            };
            this.addEventListenerWithCleanup(document, 'click', initAudio);
        },
        
        // Event delegation for dynamic elements
        setupEventDelegation() {
            // Delegate aircraft list clicks
            this.addEventListenerWithCleanup(elements.aircraftListBody, 'click', (e) => {
                const row = e.target.closest('.aircraft-row');
                if (row) {
                    const hex = row.dataset.hex;
                    state.selectedHex = state.selectedHex === hex ? null : hex;
                    this.saveUIState();
                    UIManager.updateAircraftList();
                }
            });
        },
        
        setupDropdowns() {
            const toggleDropdown = (menu) => {
                document.querySelectorAll('.dropdown-menu').forEach(m => {
                    if (m !== menu) m.classList.add('hidden');
                });
                menu.classList.toggle('hidden');
            };
            
            this.addEventListenerWithCleanup(elements.uiThemeButton, 'click', (e) => {
                e.stopPropagation();
                toggleDropdown(elements.uiThemeMenu);
            });
            
            this.addEventListenerWithCleanup(elements.scopeThemeButton, 'click', (e) => {
                e.stopPropagation();
                toggleDropdown(elements.scopeThemeMenu);
            });
            
            this.addEventListenerWithCleanup(document, 'click', () => {
                elements.uiThemeMenu?.classList.add('hidden');
                elements.scopeThemeMenu?.classList.add('hidden');
                if (!state.popupAircraft) {
                    elements.aircraftPopup?.classList.add('hidden');
                }
                elements.airportPopup?.classList.add('hidden');
            });
            
            this.addEventListenerWithCleanup(elements.uiThemeMenu, 'click', (e) => {
                if (e.target.dataset.theme) {
                    state.uiTheme = e.target.dataset.theme;
                    ThemeManager.applyUiTheme();
                    elements.uiThemeMenu.classList.add('hidden');
                }
            });
            
            this.addEventListenerWithCleanup(elements.scopeThemeMenu, 'click', (e) => {
                if (e.target.dataset.themeId) {
                    state.scopeThemeIndex = parseInt(e.target.dataset.themeId, 10);
                    elements.scopeThemeMenu.classList.add('hidden');
                }
            });
            
            // Mobile theme selects
            const mobileUiSelect = document.getElementById('mobile-ui-theme-select');
            const mobileScopeSelect = document.getElementById('mobile-scope-theme-select');
            
            this.addEventListenerWithCleanup(mobileUiSelect, 'change', (e) => {
                state.uiTheme = e.target.value;
                ThemeManager.applyUiTheme();
            });
            
            this.addEventListenerWithCleanup(mobileScopeSelect, 'change', (e) => {
                state.scopeThemeIndex = parseInt(e.target.value, 10);
            });
        },
        
        toggleMobileMenu() {
            elements.mobileMenu?.classList.toggle('active');
            elements.mobileOverlay?.classList.toggle('active');
        },
        
        togglePanels() {
            const hiding = !elements.rightPanel.classList.contains('hidden');
            elements.rightPanel.classList.toggle('hidden', hiding);
            elements.rightResizer.classList.toggle('hidden', hiding);
            
            const tooltip = elements.hideUiButton?.querySelector('.tooltip-text');
            if (tooltip) {
                tooltip.textContent = hiding ? 'Show Panels' : 'Hide Panels';
            }
        },
        
        toggleVectors() {
            state.showVectors = !state.showVectors;
            UIManager.updateTooltips();
            
            const mobileButton = document.getElementById('mobile-vectors-button');
            if (mobileButton) {
                mobileButton.querySelector('span').textContent = `Vectors: ${state.showVectors ? 'ON' : 'OFF'}`;
            }
        },
        
        toggleAirports() {
            state.showAirports = !state.showAirports;
            UIManager.updateTooltips();
            Renderer.markForRedraw();
            
            const mobileButton = document.getElementById('mobile-airports-button');
            if (mobileButton) {
                mobileButton.querySelector('span').textContent = `Airports: ${state.showAirports ? 'ON' : 'OFF'}`;
            }
        },
        
        toggleNavaids() {
            state.showNavaids = !state.showNavaids;
            UIManager.updateTooltips();
            Renderer.markForRedraw();
            
            const mobileButton = document.getElementById('mobile-navaids-button');
            if (mobileButton) {
                mobileButton.querySelector('span').textContent = `Navaids: ${state.showNavaids ? 'ON' : 'OFF'}`;
            }
        },
        
        toggleRunways() {
            state.showRunways = !state.showRunways;
            UIManager.updateTooltips();
            Renderer.markForRedraw();
            
            const mobileButton = document.getElementById('mobile-runways-button');
            if (mobileButton) {
                mobileButton.querySelector('span').textContent = `Runways: ${state.showRunways ? 'ON' : 'OFF'}`;
            }
        },
        
        toggleAircraftSection() {
            state.aircraftSectionExpanded = !state.aircraftSectionExpanded;
            const section = elements.aircraftSection;
            const toggleIcon = elements.aircraftToggle?.querySelector('svg');
            
            if (state.aircraftSectionExpanded) {
                section.classList.remove('section-collapsed');
                section.classList.add('section-expanded');
                toggleIcon?.classList.remove('collapsed');
            } else {
                section.classList.remove('section-expanded');
                section.classList.add('section-collapsed');
                toggleIcon?.classList.add('collapsed');
            }
            
            this.saveUIState();
        },
        
        toggleMetricsSection() {
            state.metricsSectionExpanded = !state.metricsSectionExpanded;
            const section = elements.metricsSection;
            const toggleIcon = elements.metricsToggle?.querySelector('svg');
            
            if (state.metricsSectionExpanded) {
                section.classList.remove('section-collapsed');
                section.classList.add('section-expanded');
                toggleIcon?.classList.remove('collapsed');
            } else {
                section.classList.remove('section-expanded');
                section.classList.add('section-collapsed');
                toggleIcon?.classList.add('collapsed');
            }
            
            this.saveUIState();
        },
        
        showSettings() {
            document.getElementById('home-lat').value = state.homeLat;
            document.getElementById('home-lon').value = state.homeLon;
            document.getElementById('sound-enabled').checked = state.soundEnabled;
            document.getElementById('show-airports').checked = state.showAirports;
            document.getElementById('show-navaids').checked = state.showNavaids;
            document.getElementById('show-runways').checked = state.showRunways;
            document.getElementById('min-runway-length').value = state.minRunwayLength;
            document.getElementById('max-trail-length').value = state.maxTrailLength;
            document.getElementById('trail-fade-time').value = state.trailFadeTimeMinutes;
            document.getElementById('trail-width').value = state.trailWidth;
            
            this.updateDataSourcesList();
            elements.settingsModal.classList.remove('hidden');
        },
        
        updateDataSourcesList() {
            const sourcesDiv = document.getElementById('data-sources-list');
            sourcesDiv.innerHTML = state.dataSources.map((source, i) => `
                <div class="border rounded p-2 mb-2" style="border-color: var(--color-border);">
                    <input type="text" value="${URLValidator.sanitizeUrl(source.url)}" placeholder="URL" class="w-full px-2 py-1 border rounded mb-2" data-source-index="${i}" data-field="url" style="background-color: var(--color-bg-primary); border-color: var(--color-border);">
                    <input type="text" value="${source.name || ''}" placeholder="Name" class="w-full px-2 py-1 border rounded mb-2" data-source-index="${i}" data-field="name" style="background-color: var(--color-bg-primary); border-color: var(--color-border);">
                    <div class="flex justify-between items-center">
                        <label class="flex items-center gap-2">
                            <input type="checkbox" ${source.enabled ? 'checked' : ''} data-source-index="${i}" data-field="enabled">
                            <span>Enabled</span>
                        </label>
                        <div class="text-xs ${URLValidator.isValidDataSourceUrl(source.url) ? 'text-green-500' : 'text-red-500'}">
                            ${URLValidator.isValidDataSourceUrl(source.url) ? '✓ Valid' : '✗ Invalid URL'}
                        </div>
                        ${state.dataSources.length > 1 ? `<button class="btn text-red-500" onclick="EventHandlers.removeDataSource(${i})">Remove</button>` : ''}
                    </div>
                </div>
            `).join('');
        },
        
        addDataSource() {
            state.dataSources.push({
                url: '',
                name: `Source ${state.dataSources.length + 1}`,
                enabled: false
            });
            this.updateDataSourcesList();
        },
        
        removeDataSource(index) {
            if (state.dataSources.length > 1) {
                state.dataSources.splice(index, 1);
                this.updateDataSourcesList();
            }
        },
        
        saveSettings() {
            try {
                state.homeLat = parseFloat(document.getElementById('home-lat').value) || CONFIG.DEFAULT_HOME_LAT;
                state.homeLon = parseFloat(document.getElementById('home-lon').value) || CONFIG.DEFAULT_HOME_LON;
                state.soundEnabled = document.getElementById('sound-enabled').checked;
                state.showAirports = document.getElementById('show-airports').checked;
                state.showNavaids = document.getElementById('show-navaids').checked;
                state.showRunways = document.getElementById('show-runways').checked;
                state.minRunwayLength = parseInt(document.getElementById('min-runway-length').value) || CONFIG.AIRPORT_DISPLAY.MIN_RUNWAY_LENGTH_FT;
                state.maxTrailLength = parseInt(document.getElementById('max-trail-length').value) || CONFIG.MAX_TRAIL_LENGTH;
                state.trailFadeTimeMinutes = parseInt(document.getElementById('trail-fade-time').value) || CONFIG.TRAIL_FADE_TIME_MINUTES;
                state.trailWidth = parseInt(document.getElementById('trail-width').value) || 2;
                
                // Validate and save data sources
                let hasValidSource = false;
                document.querySelectorAll('[data-source-index]').forEach(input => {
                    const index = parseInt(input.dataset.sourceIndex);
                    const field = input.dataset.field;
                    if (state.dataSources[index]) {
                        if (field === 'enabled') {
                            state.dataSources[index][field] = input.checked;
                        } else if (field === 'url') {
                            const sanitizedUrl = URLValidator.sanitizeUrl(input.value);
                            state.dataSources[index][field] = sanitizedUrl;
                            if (state.dataSources[index].enabled && URLValidator.isValidDataSourceUrl(sanitizedUrl)) {
                                hasValidSource = true;
                            }
                        } else {
                            state.dataSources[index][field] = input.value;
                        }
                    }
                });
                
                if (!hasValidSource) {
                    ErrorBoundary.showWarning('At least one valid and enabled data source is required');
                    return;
                }
                
                // Save to localStorage with debouncing if enabled
                const settings = {
                    homeLat: state.homeLat,
                    homeLon: state.homeLon,
                    soundEnabled: state.soundEnabled,
                    dataSources: state.dataSources,
                    showAirports: state.showAirports,
                    showNavaids: state.showNavaids,
                    showRunways: state.showRunways,
                    minRunwayLength: state.minRunwayLength,
                    maxTrailLength: state.maxTrailLength,
                    trailFadeTimeMinutes: state.trailFadeTimeMinutes,
                    trailWidth: state.trailWidth,
                    aircraftSectionExpanded: state.aircraftSectionExpanded,
                    metricsSectionExpanded: state.metricsSectionExpanded,
                    selectedHex: state.selectedHex
                };
                
                if (CONFIG.PERFORMANCE.LOCALSTORAGE_DEBOUNCE_MS) {
                    this.debouncedSaveSettings(settings);
                } else {
                    localStorage.setItem('adsbScope_settings', JSON.stringify(settings));
                }
                
                elements.settingsModal.classList.add('hidden');
                
                // Clear displayed aircraft to force refresh
                state.displayedAircraft = {};
                
                if (!state.dataLoaded) {
                    CSVDataManager.loadAllData();
                }
                
                ErrorBoundary.showWarning('Settings saved successfully');
            } catch (error) {
                ErrorBoundary.handleError(error, 'Settings Save');
            }
        },
        
        debouncedSaveSettings: (() => {
            let timeout;
            return (settings) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    localStorage.setItem('adsbScope_settings', JSON.stringify(settings));
                }, CONFIG.PERFORMANCE.LOCALSTORAGE_DEBOUNCE_MS);
            };
        })(),
        
        saveUIState() {
            try {
                const uiState = {
                    aircraftSectionExpanded: state.aircraftSectionExpanded,
                    metricsSectionExpanded: state.metricsSectionExpanded,
                    selectedHex: state.selectedHex,
                    maxRangeNm: state.maxRangeNm
                };
                
                if (CONFIG.PERFORMANCE.LOCALSTORAGE_DEBOUNCE_MS) {
                    this.debouncedSaveUIState(uiState);
                } else {
                    localStorage.setItem('adsbScope_uiState', JSON.stringify(uiState));
                }
            } catch (error) {
                ErrorBoundary.handleError(error, 'UI State Save');
            }
        },
        
        debouncedSaveUIState: (() => {
            let timeout;
            return (uiState) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    localStorage.setItem('adsbScope_uiState', JSON.stringify(uiState));
                }, CONFIG.PERFORMANCE.LOCALSTORAGE_DEBOUNCE_MS);
            };
        })(),
        
        showExportMenu() {
            const options = ['CSV', 'KML', 'Statistics'];
            const choice = prompt(`Export format?\n1. CSV\n2. KML\n3. Statistics\nEnter number (1-3):`);
            
            switch(choice) {
                case '1':
                    ExportManager.exportCSV();
                    break;
                case '2':
                    ExportManager.exportKML();
                    break;
                case '3':
                    ExportManager.exportStatistics();
                    break;
                default:
                    if (choice !== null) {
                        ErrorBoundary.showWarning('Invalid choice. Please select 1, 2, or 3.');
                    }
            }
        },
        
        handleMouseWheel(e) {
            e.preventDefault();
            const oldRange = state.maxRangeNm;
            if (e.deltaY < 0) {
                state.maxRangeNm = Math.min(CONFIG.MAX_RANGE_NM, state.maxRangeNm + CONFIG.RANGE_STEP_NM);
            } else {
                state.maxRangeNm = Math.max(CONFIG.MIN_RANGE_NM, state.maxRangeNm - CONFIG.RANGE_STEP_NM);
            }
            
            if (oldRange !== state.maxRangeNm) {
                state.lastRangeNm = oldRange;
                this.saveUIState();
                Renderer.markForRedraw();
            }
        },
        
        makeResizable(panel, resizer) {
            if (!panel || !resizer) return;
            
            const handleMouseMove = (e) => {
                const newWidth = document.body.clientWidth - e.clientX;
                panel.style.width = `${Math.max(CONFIG.MIN_PANEL_WIDTH, newWidth)}px`;
            };
            
            const handleMouseUp = () => {
                document.body.style.cursor = 'default';
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
            };
            
            this.addEventListenerWithCleanup(resizer, 'mousedown', () => {
                document.body.style.cursor = 'col-resize';
                document.addEventListener('mousemove', handleMouseMove);
                document.addEventListener('mouseup', handleMouseUp);
            });
        },
        
        handleCanvasClick(e) {
            e.stopPropagation();
            
            // Check for airport clicks first
            if (state.showAirports) {
                const cx = elements.canvas.width / 2;
                const cy = elements.canvas.height / 2;
                const radius = Math.min(cx, cy) - CONFIG.CANVAS_PADDING;
                
                const airports = CSVDataManager.getAirportsInRange(state.homeLat, state.homeLon, state.maxRangeNm);
                for (const airport of airports) {
                    const pos = MathUtils.latLonToScreen(airport.lat, airport.lon, state.maxRangeNm, cx, cy, radius);
                    if (pos) {
                        const dist = Math.hypot(e.offsetX - pos.x, e.offsetY - pos.y);
                        if (dist < CONFIG.AIRPORT_DISPLAY.SYMBOL_SIZE + 5) {
                            UIManager.showAirportPopup(airport, e.offsetX, e.offsetY);
                            return;
                        }
                    }
                }
            }
            
            // Check for aircraft clicks
            let clickedHex = null;
            let closestDist = CONFIG.CLICK_RADIUS_PX;
            
            for (const hex in state.displayedAircraft) {
                const ac = state.displayedAircraft[hex];
                const dist = Math.hypot(e.offsetX - ac.displayPos.x, e.offsetY - ac.displayPos.y);
                if (dist < closestDist) {
                    clickedHex = hex;
                    closestDist = dist;
                }
            }
            
            if (clickedHex && state.displayedAircraft[clickedHex]) {
                const acData = state.displayedAircraft[clickedHex].data;
                const popupContent = Object.entries(acData)
                    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                    .join('\n');
                
                elements.aircraftPopup.textContent = popupContent;
                
                const popupWidth = 300;
                const popupHeight = 200;
                const canvasRect = elements.canvas.getBoundingClientRect();
                
                let popupX = e.offsetX + 15;
                let popupY = e.offsetY + 15;
                
                if (popupX + popupWidth > canvasRect.width) {
                    popupX = e.offsetX - popupWidth - 15;
                }
                if (popupY + popupHeight > canvasRect.height) {
                    popupY = e.offsetY - popupHeight - 15;
                }
                
                elements.aircraftPopup.style.left = `${popupX}px`;
                elements.aircraftPopup.style.top = `${popupY}px`;
                elements.aircraftPopup.classList.remove('hidden');
                
                state.popupAircraft = clickedHex;
                if (state.popupUpdateInterval) {
                    clearInterval(state.popupUpdateInterval);
                }
                const interval = setInterval(() => UIManager.updatePopup(), 100);
                state.intervals.push(interval);
                state.popupUpdateInterval = interval;
            } else {
                elements.aircraftPopup.classList.add('hidden');
                state.popupAircraft = null;
                if (state.popupUpdateInterval) {
                    clearInterval(state.popupUpdateInterval);
                    state.popupUpdateInterval = null;
                }
            }
        },
        
        handleKeydown(e) {
            switch(e.key.toLowerCase()) {
                case 'd': // DEBUG
                    state.showDebugInfo = !state.showDebugInfo;
                    break;
                case ' ':
                    e.preventDefault();
                    state.isPaused = !state.isPaused;
                    break;
                case 'h':
                    elements.helpModal?.classList.remove('hidden');
                    break;
                case '+':
                case '=':
                    state.maxRangeNm = Math.min(CONFIG.MAX_RANGE_NM, state.maxRangeNm + CONFIG.RANGE_STEP_NM);
                    EventHandlers.saveUIState();
                    break;
                case '-':
                case '_':
                    state.maxRangeNm = Math.max(CONFIG.MIN_RANGE_NM, state.maxRangeNm - CONFIG.RANGE_STEP_NM);
                    EventHandlers.saveUIState();
                    break;
                case 'm':
                    const filters = ['all', 'military', 'civilian'];
                    state.aircraftFilter = filters[(filters.indexOf(state.aircraftFilter) + 1) % filters.length];
                    break;
                case 'v':
                    EventHandlers.toggleVectors();
                    break;
                case 'a':
                    EventHandlers.toggleAirports();
                    break;
                case 'n':
                    EventHandlers.toggleNavaids();
                    break;
                case 'r':
                    EventHandlers.toggleRunways();
                    break;
                case 's':
                    EventHandlers.showSettings();
                    break;
            }
        }
    };

    // Enhanced Main Loop with throttling
    const ScopeLoop = {
        animationId: null,
        lastFrameTime: 0,
        
        start() {
            this.animationId = requestAnimationFrame((time) => this.update(time));
        },
        
        stop() {
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = null;
            }
        },
        
        update(time) {
            try {
                // Frame rate throttling
                const deltaTime = time - this.lastFrameTime;
                if (deltaTime < CONFIG.CANVAS_RENDER_THROTTLE_MS) {
                    this.animationId = requestAnimationFrame((time) => this.update(time));
                    return;
                }
                this.lastFrameTime = time;
                
                const w = elements.canvasContainer.clientWidth;
                const h = elements.canvasContainer.clientHeight;
                
                if (w <= 0 || h <= 0) {
                    this.animationId = requestAnimationFrame((time) => this.update(time));
                    return;
                }
                
                // Only resize canvas if dimensions changed
                if (elements.canvas.width !== w || elements.canvas.height !== h) {
                    elements.canvas.width = w;
                    elements.canvas.height = h;
                    
                    // Reinitialize offscreen canvas if needed
                    if (canvasRenderer && canvasRenderer.initOffscreenCanvas) {
                        canvasRenderer.offscreenCanvas = null;
                        canvasRenderer.initOffscreenCanvas();
                    }
                    
                    Renderer.markForRedraw();
                }
                
                const cx = w / 2;
                const cy = h / 2;
                const radius = Math.min(cx, cy) - CONFIG.CANVAS_PADDING;
                
                // Update sweep angle
                state.prevSweepAngle = state.sweepAngle;
                if (!state.isPaused) {
                    state.sweepAngle = (time / 1000 * (360 / CONFIG.SWEEP_DURATION_S)) % 360;
                    AircraftStateManager.updateAircraftState(cx, cy, radius);
                }
                
                // Only render if needed or forced
                const shouldRender = Renderer.needsRedraw || 
                                   !state.isPaused || 
                                   (time - state.lastRenderTime) > 100;
                
                if (shouldRender) {
                    Renderer.drawScope(cx, cy, radius);
                    Renderer.drawAircraft(w, cx, cy, radius);
                    Renderer.drawSweep(cx, cy, radius);
                    Renderer.needsRedraw = false;
                    state.lastRenderTime = time;
                    state.frameCount++;
                }
                
                // Update UI at reduced frequency
                if (time - state.lastUiUpdateTime > CONFIG.UI_UPDATE_INTERVAL_MS) {
                    UIManager.updateAircraftList();
                    UIManager.updateMetricsPanel();
                    UIManager.updateScopeStatus();
                    UIManager.updateTooltips();
                    state.lastUiUpdateTime = time;
                }
                
                // Update paused overlay
                if (elements.pausedText) {
                    elements.pausedText.classList.toggle('hidden', !state.isPaused);
                }
                // DEBUG
                // Calculate FPS once per second
                const now = performance.now();
                state.frameCount++;
                if (now - state.lastFpsUpdateTime > 1000) {
                    state.fps = state.frameCount;
                    state.frameCount = 0;
                    state.lastFpsUpdateTime = now;
                }

                // Draw debug info if enabled
                Renderer.drawDebugInfo(elements.ctx);
                // DEBUG
                
                // Continue loop
                this.animationId = requestAnimationFrame((time) => this.update(time));
            } catch (error) {
                ErrorBoundary.handleError(error, 'Render Loop');
                // Continue loop even after error
                this.animationId = requestAnimationFrame((time) => this.update(time));
            }
        }
    };

    // Enhanced Initialization with performance optimizations
    const App = {
        init() {
            try {
                // Set up page title and version
                document.title = `ADSB Radarscope | v${CONFIG.VERSION} | by dustsignal`;
                if (elements.versionDisplay) {
                    elements.versionDisplay.innerHTML = 
                        `<a href="https://github.com/dustsignal/adsb-scope" target="_blank" rel="noopener noreferrer" class="hover:underline">v${CONFIG.VERSION}</a>`;
                }
                
                // Load saved settings
                this.loadSettings();
                
                // Initialize theme menus
                this.initializeThemeMenus();
                
                // Set up UI components
                UIManager.createShortcutBar();
                ThemeManager.applyUiTheme();
                
                // Initialize tooltip manager
                TooltipManager.init();
                
                // Initialize collapsible sections
                this.initializeCollapsibleSections();
                
                // Initialize event handlers
                EventHandlers.initializeEventListeners();
                
                // Set up memory management
                MemoryManager.scheduleCleanup();
                
                // Load CSV data
                CSVDataManager.loadAllData();
                
                // Start data fetching with network optimization
                DataManager.fetchData();
                const fetchInterval = setInterval(() => DataManager.fetchData(), CONFIG.FETCH_INTERVAL_MS);
                state.intervals.push(fetchInterval);
                
                // Start render loop
                ScopeLoop.start();
                
                // Global function for removing data sources
                window.EventHandlers = EventHandlers;
                
                console.log(`ADSB Radarscope v${CONFIG.VERSION} initialized successfully with performance optimizations`);
            } catch (error) {
                ErrorBoundary.handleError(error, 'Application Initialization');
            }
        },
        
        loadSettings() {
            try {
                // Load main settings
                const saved = localStorage.getItem('adsbScope_settings');
                if (saved) {
                    const settings = JSON.parse(saved);
                    state.homeLat = settings.homeLat || CONFIG.DEFAULT_HOME_LAT;
                    state.homeLon = settings.homeLon || CONFIG.DEFAULT_HOME_LON;
                    state.soundEnabled = settings.soundEnabled || false;
                    state.dataSources = settings.dataSources || state.dataSources;
                    state.showAirports = settings.showAirports || false;
                    state.showNavaids = settings.showNavaids || false;
                    state.showRunways = settings.showRunways !== undefined ? settings.showRunways : true;
                    state.minRunwayLength = settings.minRunwayLength || CONFIG.AIRPORT_DISPLAY.MIN_RUNWAY_LENGTH_FT;
                    state.maxTrailLength = settings.maxTrailLength || CONFIG.MAX_TRAIL_LENGTH;
                    state.trailFadeTimeMinutes = settings.trailFadeTimeMinutes || CONFIG.TRAIL_FADE_TIME_MINUTES;
                    state.trailWidth = settings.trailWidth || 2;
                    state.aircraftSectionExpanded = settings.aircraftSectionExpanded !== undefined ? settings.aircraftSectionExpanded : true;
                    state.metricsSectionExpanded = settings.metricsSectionExpanded !== undefined ? settings.metricsSectionExpanded : true;
                    state.selectedHex = settings.selectedHex || null;
                }
                
                // Load UI state
                const savedUiState = localStorage.getItem('adsbScope_uiState');
                if (savedUiState) {
                    const uiState = JSON.parse(savedUiState);
                    state.maxRangeNm = uiState.maxRangeNm || CONFIG.DEFAULT_RANGE_NM;
                    state.aircraftSectionExpanded = uiState.aircraftSectionExpanded !== undefined ? uiState.aircraftSectionExpanded : true;
                    state.metricsSectionExpanded = uiState.metricsSectionExpanded !== undefined ? uiState.metricsSectionExpanded : true;
                    state.selectedHex = uiState.selectedHex || null;
                }
                
                // Load UI theme
                const savedTheme = localStorage.getItem('adsbScope_uiTheme');
                if (savedTheme) {
                    state.uiTheme = savedTheme;
                }
            } catch (error) {
                ErrorBoundary.handleError(error, 'Settings Loading');
            }
        },
        
        initializeCollapsibleSections() {
            if (elements.aircraftSection) {
                elements.aircraftSection.classList.add(state.aircraftSectionExpanded ? 'section-expanded' : 'section-collapsed');
                const toggleIcon = elements.aircraftToggle?.querySelector('svg');
                if (toggleIcon && !state.aircraftSectionExpanded) {
                    toggleIcon.classList.add('collapsed');
                }
            }
            
            if (elements.metricsSection) {
                elements.metricsSection.classList.add(state.metricsSectionExpanded ? 'section-expanded' : 'section-collapsed');
                const toggleIcon = elements.metricsToggle?.querySelector('svg');
                if (toggleIcon && !state.metricsSectionExpanded) {
                    toggleIcon.classList.add('collapsed');
                }
            }
        },
        
        initializeThemeMenus() {
            try {
                // UI Theme Menu
                const groupedThemes = UI_THEMES.reduce((acc, theme) => {
                    (acc[theme.group] = acc[theme.group] || []).push(theme);
                    return acc;
                }, {});
                
                if (elements.uiThemeMenu) {
                    elements.uiThemeMenu.innerHTML = Object.entries(groupedThemes)
                        .map(([group, themes]) => `
                            <div class="px-4 py-1 text-xs font-bold" style="color: var(--color-text-muted);">${group}</div>
                            ${themes.map(t => 
                                `<a href="#" class="block px-4 py-2 text-sm hover:bg-opacity-10 hover:bg-white" data-theme="${t.key}">${t.name}</a>`
                            ).join('')}
                        `).join('');
                }
                
                // Scope Theme Menu
                if (elements.scopeThemeMenu) {
                    elements.scopeThemeMenu.innerHTML = SCOPE_THEMES
                        .map((t, i) => 
                            `<a href="#" class="block px-4 py-2 text-sm hover:bg-opacity-10 hover:bg-white" data-theme-id="${i}">${t.name}</a>`
                        ).join('');
                }
                
                // Mobile theme selects
                const mobileUiSelect = document.getElementById('mobile-ui-theme-select');
                const mobileScopeSelect = document.getElementById('mobile-scope-theme-select');
                
                if (mobileUiSelect) {
                    mobileUiSelect.innerHTML = UI_THEMES.map(t => 
                        `<option value="${t.key}">${t.name}</option>`
                    ).join('');
                    mobileUiSelect.value = state.uiTheme;
                }
                
                if (mobileScopeSelect) {
                    mobileScopeSelect.innerHTML = SCOPE_THEMES.map((t, i) => 
                        `<option value="${i}">${t.name}</option>`
                    ).join('');
                    mobileScopeSelect.value = state.scopeThemeIndex;
                }
            } catch (error) {
                ErrorBoundary.handleError(error, 'Theme Menu Initialization');
            }
        },
        
        cleanup() {
            ScopeLoop.stop();
            EventHandlers.cleanup();
            
            // Clean up object pools
            trailPointPool.pool.length = 0;
            
            // Clear caches
            MathUtils._cache.clear();
            if (canvasRenderer) {
                canvasRenderer.staticElementsCache = null;
            }
        }
    };

    // Global error handler
    window.addEventListener('error', (e) => {
        ErrorBoundary.handleError(e.error, 'Global');
    });
    
    window.addEventListener('unhandledrejection', (e) => {
        ErrorBoundary.handleError(e.reason, 'Promise');
    });

    // Start application when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => App.init());
    } else {
        App.init();
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => App.cleanup());
    
})();