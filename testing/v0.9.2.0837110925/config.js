// ADSB Radarscope
// Author: dustsignal
// Version: 0.9.2.0837110925
// GitHub: https://github.com/dustsignal/adsb-scope
// Speical thanks to: wire99 & Josh M.

// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// ADSB Radarscope Configuration
// This file contains all user-configurable settings and constants

const CONFIG = {
    VERSION: '0.9.2.0837110925',
    
    // Home Position Settings
    DEFAULT_HOME_LAT: 00.0000,
    DEFAULT_HOME_LON: -00.0000,
    DEFAULT_RANGE_NM: 50,
    
    // Data Source Settings
    DEFAULT_TAR1090_URL: 'http://[your-ip-path]/data/aircraft.json',
    DATA_PATHS: {
        AIRPORTS: 'http://[your-ip-path]/data/airports.csv',
        NAVAIDS: 'http://[your-ip-path]/data/navaids.csv',
        RUNWAYS: 'http://[your-ip-path]/data/runways.csv'
    },
    FETCH_INTERVAL_MS: 1000,
    FETCH_TIMEOUT_MS: 5000,
    MAX_RETRY_ATTEMPTS: 3,
    INITIAL_RETRY_DELAY_MS: 1000,
    
    // Performance Settings
    SWEEP_DURATION_S: 3.8, // You can make this 0.0 for realtime changes of the aircraft.json, not recommended
    AIRCRAFT_TIMEOUT_FACTOR: 3,
    UI_UPDATE_INTERVAL_MS: 700,
    CANVAS_RENDER_THROTTLE_MS: 16, // ~60fps
    MEMORY_CLEANUP_INTERVAL_MS: 30000,
    
    // Trail Settings
    MAX_TRAIL_LENGTH: 100,
    TRAIL_FADE_TIME_MINUTES: 5,
    TRAIL_GRADIENT_SEGMENTS: 40,
    SMOOTHING_FACTOR: 0.3,
    
    // Display Settings
    CANVAS_PADDING: 40,
    AIRCRAFT_SYMBOL_SIZE: 3,
    HEADING_LINE_LENGTH: 10,
    VECTOR_MINUTES: 2,
    CLICK_RADIUS_PX: 15,
    
    // Range Settings
    MIN_RANGE_NM: 5,
    MAX_RANGE_NM: 500,
    RANGE_STEP_NM: 5,
    
    // UI Settings
    MIN_PANEL_WIDTH: 250,
    ALERT_DURATION_MS: 6000,
    
    // Emergency Settings
    EMERGENCY_SQUAWKS: ['7500', '7600', '7700'],
    
    // Airport Display Settings
    AIRPORT_DISPLAY: {
        SYMBOL_SIZE: 6,
        NAVAID_SYMBOL_SIZE: 4,
        LABEL_FONT_SIZE: 10,
        RUNWAY_LINE_WIDTH: 2,
        MAX_AIRPORTS_DISPLAY: 50,
        MIN_RUNWAY_LENGTH_FT: 3000
    },
    
    // Performance Tuning
    PERFORMANCE: {
        // Canvas optimization
        USE_OFFSCREEN_CANVAS: true,
        CACHE_STATIC_ELEMENTS: true,
        DIRTY_REGION_TRACKING: true,
        MAX_PARTICLES_PER_FRAME: 1000,
        
        // Memory management
        OBJECT_POOL_SIZE: 100,
        WEAK_REFERENCE_CLEANUP: true,
        AGGRESSIVE_TRAIL_CLEANUP: true,
        
        // Network optimization
        REQUEST_POOLING: true,
        BATCH_NETWORK_REQUESTS: true,
        RESPONSE_COMPRESSION: true,
        
        // DOM optimization
        BATCH_DOM_UPDATES: true,
        USE_DOCUMENT_FRAGMENT: true,
        DEBOUNCE_RESIZE_MS: 100,
        
        // State management
        IMMUTABLE_STATE_UPDATES: true,
        PROXY_STATE_DETECTION: true,
        LOCALSTORAGE_DEBOUNCE_MS: 500
    }
};

// UI Theme Definitions
const UI_THEMES = [
    { key: 'default-dark', name: 'Default Dark', group: 'Dark' },
    { key: 'slate', name: 'Slate', group: 'Dark' },
    { key: 'abyss', name: 'Abyss', group: 'Dark' },
    { key: 'forest', name: 'Forest', group: 'Dark' },
    { key: 'crimson', name: 'Crimson', group: 'Dark' },
    { key: 'royal', name: 'Royal', group: 'Dark' },
    { key: 'mocha', name: 'Mocha', group: 'Dark' },
    { key: 'rose-pine', name: 'Rose Pine', group: 'Dark' },
    { key: 'classic-crt-ui', name: 'Classic CRT', group: 'Dark' },
    { key: 'amber-crt-ui', name: 'Amber CRT', group: 'Dark' },
    { key: 'arctic-blue-ui', name: 'Arctic Blue', group: 'Dark' },
    { key: 'night-vision-ui', name: 'Night Vision', group: 'Dark' },
    { key: 'stealth-gray-ui', name: 'Stealth Gray', group: 'Dark' },
    { key: 'crimson-alert-ui', name: 'Crimson Alert', group: 'Dark' },
    { key: 'cyberpunk-ui', name: 'Cyberpunk', group: 'Dark' },
    { key: 'deep-ocean-ui', name: 'Deep Ocean', group: 'Dark' },
    { key: 'blueprint-ui', name: 'Blueprint', group: 'Dark' },
    { key: 'hacker-matrix-ui', name: 'Hacker Matrix', group: 'Dark' },
    { key: 'solar-flare-ui', name: 'Solar Flare', group: 'Dark' },
    { key: 'nebula-purple-ui', name: 'Nebula Purple', group: 'Dark' },
    { key: 'vintage-sepia-ui', name: 'Vintage Sepia', group: 'Dark' },
    { key: 'lava-flow-ui', name: 'Lava Flow', group: 'Dark' },
    { key: 'starfield-ui', name: 'Starfield', group: 'Dark' },
    { key: 'aurora-ui', name: 'Aurora', group: 'Dark' },
    { key: 'copper-rust-ui', name: 'Copper Rust', group: 'Dark' },
    { key: 'default-light', name: 'Default Light', group: 'Light' },
    { key: 'stone', name: 'Stone', group: 'Light' },
    { key: 'mint', name: 'Mint', group: 'Light' },
    { key: 'sky', name: 'Sky', group: 'Light' },
    { key: 'lavender', name: 'Lavender', group: 'Light' },
    { key: 'paper', name: 'Paper', group: 'Light' },
    { key: 'azure', name: 'Azure', group: 'Light' },
    { key: 'daylight-ui', name: 'Daylight', group: 'Light' },
    { key: 'paper-map-ui', name: 'Paper Map', group: 'Light' },
    { key: 'sandstorm-ui', name: 'Sandstorm', group: 'Light' }
];

// Scope Theme Definitions
const SCOPE_THEMES = [
    { name: 'Classic Green CRT', key: 'classic-green' },
    { name: 'Amber CRT', key: 'amber-crt' },
    { name: 'Arctic Blue', key: 'arctic-blue' },
    { name: 'Desert Amber', key: 'desert-amber' },
    { name: 'Night Vision', key: 'night-vision' },
    { name: 'Stealth Gray', key: 'stealth-gray' },
    { name: 'Crimson Alert', key: 'crimson-alert' },
    { name: 'Cyberpunk', key: 'cyberpunk' },
    { name: 'Solar Flare', key: 'solar-flare' },
    { name: 'Deep Ocean', key: 'deep-ocean' },
    { name: 'Forest Camo', key: 'forest-camo' },
    { name: 'Volcanic Ash', key: 'volcanic-ash' },
    { name: 'Nebula Purple', key: 'nebula-purple' },
    { name: 'Ghost White', key: 'ghost-white' },
    { name: 'Golden Age', key: 'golden-age' },
    { name: 'Retro Vga', key: 'retro-vga' },
    { name: 'Toxic Sludge', key: 'toxic-sludge' },
    { name: 'Strawberry Cream', key: 'strawberry-cream' },
    { name: 'Blueprint', key: 'blueprint' },
    { name: 'Hacker Matrix', key: 'hacker-matrix' },
    { name: 'Autumn Leaves', key: 'autumn-leaves' },
    { name: 'Coral Reef', key: 'coral-reef' },
    { name: 'Lunar Rock', key: 'lunar-rock' },
    { name: 'Sandstone', key: 'sandstone' },
    { name: 'Royal Velvet', key: 'royal-velvet' },
    { name: 'Mint Chocolate', key: 'mint-chocolate' },
    { name: 'Infrared Heat', key: 'infrared-heat' },
    { name: 'Plasma Burn', key: 'plasma-burn' },
    { name: 'Cold Steel', key: 'cold-steel' },
    { name: 'Digital Rain', key: 'digital-rain' },
    { name: 'Copper Rust', key: 'copper-rust' },
    { name: 'Aurora Borealis', key: 'aurora-borealis' },
    { name: 'Vintage Sepia', key: 'vintage-sepia' },
    { name: 'Acid Wash', key: 'acid-wash' },
    { name: 'Moonlit', key: 'moonlit' },
    { name: 'Lava Flow', key: 'lava-flow' },
    { name: 'Emerald City', key: 'emerald-city' },
    { name: 'Grape Soda', key: 'grape-soda' },
    { name: 'Starfield', key: 'starfield' },
    { name: 'Jungle', key: 'jungle' },
    { name: 'Biohazard', key: 'biohazard' },
    { name: 'Daylight', key: 'daylight' },
    { name: 'Cad', key: 'cad' },
    { name: 'Blueprint Light', key: 'blueprint-light' },
    { name: 'Paper Map', key: 'paper-map' },
    { name: 'Arctic Light', key: 'arctic-light' },
    { name: 'Sandstorm', key: 'sandstorm' },
    { name: 'Medical', key: 'medical' },
    { name: 'Clean Room', key: 'clean-room' },
    { name: 'Graph Paper', key: 'graph-paper' },
    { name: 'Hi Vis', key: 'hi-vis' }
];

// Scope Theme Color Schemes
const SCOPE_THEME_COLORS = {
    'classic-green': { background: '#001200', grid: '#003300', sweep: '#00FF00', aircraft: '#00FF00', selected: '#CCFFCC', emergency: '#FF6666', ground: '#00B300', text: '#C8FFC8', mlat: '#FFFF00', adsb: '#00FF00', other: '#00AAAA' },
    'amber-crt': {background: '#1A0F00', grid: '#FFB000', sweep: '#FFB00040', aircraft: '#FFB300', selected: '#FFFFFF', emergency: '#FF0000', ground: '#D9534F', text: '#FFB000', mlat: '#FFFF00', adsb: '#FFC763', other: '#FF8000'},
    'arctic-blue': { background: '#050A14', grid: '#14294F', sweep: '#63C7FF', aircraft: '#00FFFF', selected: '#FFFF00', emergency: '#FF3333', ground: '#63C7FF', text: '#DCF0FF', mlat: '#FFD700', adsb: '#00FFFF', other: '#90EE90' },
    'desert-amber': { background: '#140A00', grid: '#4F3314', sweep: '#FFB300', aircraft: '#FFC763', selected: '#FFFFDB', emergency: '#FF3D3D', ground: '#FFB300', text: '#FFDCB4', mlat: '#FF69B4', adsb: '#FFC763', other: '#87CEEB' },
    'night-vision': { background: '#000000', grid: '#003D00', sweep: '#00FF00', aircraft: '#00FF00', selected: '#CCFFCC', emergency: '#FF0000', ground: '#00B300', text: '#00FF00', mlat: '#ADFF2F', adsb: '#00FF00', other: '#32CD32' },
    'stealth-gray': { background: '#14141A', grid: '#3D3D45', sweep: '#B3B3C7', aircraft: '#DBDBF0', selected: '#FFFF66', emergency: '#FF4F4F', ground: '#B3B3C7', text: '#DCDCF0', mlat: '#FFE4B5', adsb: '#DBDBF0', other: '#DDA0DD' },
    'crimson-alert': { background: '#1A0000', grid: '#4F0000', sweep: '#FF3333', aircraft: '#FF9999', selected: '#FFFFCC', emergency: '#FFFF00', ground: '#FF3333', text: '#FFC8C8', mlat: '#FFA500', adsb: '#FF9999', other: '#FF69B4' },
    'cyberpunk': { background: '#0A0014', grid: '#4F144F', sweep: '#FF00FF', aircraft: '#00FFFF', selected: '#FFFF00', emergency: '#FF1494', ground: '#FF00FF', text: '#DCDCFE', mlat: '#00FF00', adsb: '#00FFFF', other: '#FF00FF' },
    'solar-flare': { background: '#1a0d00', grid: '#4d2a00', sweep: '#ffdd00', aircraft: '#ffaa00', selected: '#ffffff', emergency: '#ff4400', ground: '#ffdd00', text: '#ffecb3', mlat: '#ff6600', adsb: '#ffaa00', other: '#ff8800' },
    'deep-ocean': { background: '#00051a', grid: '#001a4d', sweep: '#00aaff', aircraft: '#66ccff', selected: '#f0f8ff', emergency: '#ff3333', ground: '#00aaff', text: '#cceeff', mlat: '#00ffff', adsb: '#66ccff', other: '#0088ff' },
    'forest-camo': { background: '#0a1a0a', grid: '#1f4d1f', sweep: '#66ff66', aircraft: '#aaffaa', selected: '#ffffcc', emergency: '#ff6600', ground: '#66ff66', text: '#d9ffd9', mlat: '#ccffcc', adsb: '#aaffaa', other: '#88ff88' },
    'volcanic-ash': { background: '#101010', grid: '#333333', sweep: '#ff4d4d', aircraft: '#ff8080', selected: '#ffff00', emergency: '#ff0000', ground: '#ff4d4d', text: '#cccccc', mlat: '#ffaaaa', adsb: '#ff8080', other: '#ff6666' },
    'nebula-purple': { background: '#10001a', grid: '#3d004d', sweep: '#ff00ff', aircraft: '#ff99ff', selected: '#ccffff', emergency: '#ff3333', ground: '#ff00ff', text: '#f2ccff', mlat: '#ff66ff', adsb: '#ff99ff', other: '#ffccff' },
    'ghost-white': { background: '#1a1a1a', grid: '#4d4d4d', sweep: '#ffffff', aircraft: '#cccccc', selected: '#00ff00', emergency: '#ff0000', ground: '#ffffff', text: '#e6e6e6', mlat: '#aaaaaa', adsb: '#cccccc', other: '#888888' },
    'golden-age': { background: '#1a1400', grid: '#4d4200', sweep: '#ffd700', aircraft: '#ffec80', selected: '#ffffff', emergency: '#ff4500', ground: '#ffd700', text: '#fff5cc', mlat: '#ffcc00', adsb: '#ffec80', other: '#ffdd55' },
    'retro-vga': { background: '#0000a0', grid: '#0000c0', sweep: '#ffffff', aircraft: '#00ff00', selected: '#ffff00', emergency: '#ff0000', ground: '#00ff00', text: '#c0c0c0', mlat: '#00ffff', adsb: '#00ff00', other: '#ff00ff' },
    'toxic-sludge': { background: '#1a1a00', grid: '#4d4d00', sweep: '#adff2f', aircraft: '#d2ff80', selected: '#ffffff', emergency: '#ff0000', ground: '#adff2f', text: '#eaffcc', mlat: '#ccff00', adsb: '#d2ff80', other: '#bbff55' },
    'strawberry-cream': { background: '#2a0d0d', grid: '#6a2a2a', sweep: '#ffb6c1', aircraft: '#ffdde1', selected: '#ffffff', emergency: '#ff0000', ground: '#ffb6c1', text: '#ffe6e8', mlat: '#ffccdd', adsb: '#ffdde1', other: '#ffaacc' },
    'blueprint': { background: '#00002a', grid: '#00006a', sweep: '#ffffff', aircraft: '#87cefa', selected: '#ffff00', emergency: '#ff4500', ground: '#ffffff', text: '#d0e0ff', mlat: '#aaccff', adsb: '#87cefa', other: '#6699ff' },
    'hacker-matrix': { background: '#000000', grid: '#002200', sweep: '#00ff00', aircraft: '#66ff66', selected: '#ffffff', emergency: '#ff0000', ground: '#00cc00', text: '#00ff00', mlat: '#88ff88', adsb: '#66ff66', other: '#44ff44' },
    'autumn-leaves': { background: '#2a0a00', grid: '#6a2a00', sweep: '#ff8c00', aircraft: '#ffd480', selected: '#ffff00', emergency: '#dc143c', ground: '#ff8c00', text: '#ffeacc', mlat: '#ffaa55', adsb: '#ffd480', other: '#ffbb66' },
    'coral-reef': { background: '#001a1a', grid: '#004d4d', sweep: '#7fffd4', aircraft: '#ff7f50', selected: '#f0ffff', emergency: '#ff1493', ground: '#7fffd4', text: '#ccfff2', mlat: '#ffaa88', adsb: '#ff7f50', other: '#ff9966' },
    'lunar-rock': { background: '#222222', grid: '#444444', sweep: '#c0c0c0', aircraft: '#dddddd', selected: '#00ff00', emergency: '#ff3333', ground: '#c0c0c0', text: '#e0e0e0', mlat: '#aaaaaa', adsb: '#dddddd', other: '#999999' },
    'sandstone': { background: '#2a1d0d', grid: '#6a4a2a', sweep: '#f4a460', aircraft: '#ffdead', selected: '#ffffff', emergency: '#ff4500', ground: '#f4a460', text: '#ffefd9', mlat: '#ffcc99', adsb: '#ffdead', other: '#ffddaa' },
    'royal-velvet': { background: '#1a001a', grid: '#4d004d', sweep: '#8a2be2', aircraft: '#da70d6', selected: '#ffd700', emergency: '#ff0000', ground: '#8a2be2', text: '#efccff', mlat: '#cc66cc', adsb: '#da70d6', other: '#bb55bb' },
    'mint-chocolate': { background: '#100a0a', grid: '#3d2a2a', sweep: '#98ff98', aircraft: '#d9ffd9', selected: '#ffffff', emergency: '#ff4500', ground: '#98ff98', text: '#e6ffe6', mlat: '#bbffbb', adsb: '#d9ffd9', other: '#aaffaa' },
    'infrared-heat': { background: '#000000', grid: '#220000', sweep: '#ff0000', aircraft: '#ffff00', selected: '#ffffff', emergency: '#ff0000', ground: '#ff9900', text: '#ffaaaa', mlat: '#ff6600', adsb: '#ffff00', other: '#ffcc00' },
    'plasma-burn': { background: '#11001a', grid: '#3d004d', sweep: '#ff00ff', aircraft: '#ff66ff', selected: '#00ffff', emergency: '#ffff00', ground: '#ff00ff', text: '#f2ccff', mlat: '#ff99ff', adsb: '#ff66ff', other: '#ff33ff' },
    'cold-steel': { background: '#0d131a', grid: '#2a3a4d', sweep: '#add8e6', aircraft: '#e0ffff', selected: '#ffffff', emergency: '#ff3333', ground: '#add8e6', text: '#d9ecf2', mlat: '#bbddee', adsb: '#e0ffff', other: '#cceeee' },
    'digital-rain': { background: '#000510', grid: '#001530', sweep: '#00ffff', aircraft: '#00aaff', selected: '#00ff00', emergency: '#ff0000', ground: '#00dddd', text: '#aaddff', mlat: '#0099ff', adsb: '#00aaff', other: '#0088ff' },
    'copper-rust': { background: '#2a0a00', grid: '#6a2a00', sweep: '#b87333', aircraft: '#daa520', selected: '#00ffff', emergency: '#ff0000', ground: '#008080', text: '#ffeacc', mlat: '#cc8844', adsb: '#daa520', other: '#bb9933' },
    'aurora-borealis': { background: '#00001a', grid: '#002030', sweep: '#00ff7f', aircraft: '#ff69b4', selected: '#ffffff', emergency: '#ff0000', ground: '#32cd32', text: '#ccffee', mlat: '#ff88cc', adsb: '#ff69b4', other: '#ff77bb' },
    'vintage-sepia': { background: '#2a1d0d', grid: '#504030', sweep: '#d2b48c', aircraft: '#f5deb3', selected: '#ffffff', emergency: '#a52a2a', ground: '#d2b48c', text: '#fff0d9', mlat: '#e6ccaa', adsb: '#f5deb3', other: '#ddcc99' },
    'acid-wash': { background: '#1a001a', grid: '#4d004d', sweep: '#ff00ff', aircraft: '#00ffff', selected: '#ffff00', emergency: '#ff1493', ground: '#ff00ff', text: '#efccff', mlat: '#00ff00', adsb: '#00ffff', other: '#ff00ff' },
    'moonlit': { background: '#0d0d1a', grid: '#2a2a4d', sweep: '#c0c0c0', aircraft: '#f0f8ff', selected: '#00ff00', emergency: '#ff4500', ground: '#c0c0c0', text: '#e6e6ff', mlat: '#ddddee', adsb: '#f0f8ff', other: '#ccddee' },
    'lava-flow': { background: '#1a0000', grid: '#4d0000', sweep: '#ff4500', aircraft: '#ff8c00', selected: '#ffff00', emergency: '#ff0000', ground: '#ff4500', text: '#ffcccc', mlat: '#ff6600', adsb: '#ff8c00', other: '#ff7700' },
    'emerald-city': { background: '#001a0a', grid: '#004d1f', sweep: '#00ff00', aircraft: '#ffd700', selected: '#ffffff', emergency: '#ff0000', ground: '#50c878', text: '#ccffdd', mlat: '#ffee00', adsb: '#ffd700', other: '#ffcc00' },
    'grape-soda': { background: '#1a0d1a', grid: '#4d2a4d', sweep: '#da70d6', aircraft: '#dda0dd', selected: '#ffffff', emergency: '#ff00ff', ground: '#da70d6', text: '#f2e6f2', mlat: '#cc88cc', adsb: '#dda0dd', other: '#bb77bb' },
    'starfield': { background: '#03051e', grid: '#1c2152', sweep: '#dadaff', aircraft: '#ffffaa', selected: '#aaffff', emergency: '#ff5555', ground: '#dadaff', text: '#dadaff', mlat: '#ffffcc', adsb: '#ffffaa', other: '#ffff88' },
    'jungle': { background: '#081405', grid: '#2a4f14', sweep: '#a3ff00', aircraft: '#d4ff63', selected: '#ffffff', emergency: '#ff3d3d', ground: '#a3ff00', text: '#c8ffb4', mlat: '#bbff33', adsb: '#d4ff63', other: '#ccff55' },
    'biohazard': { background: '#141100', grid: '#4f4414', sweep: '#fff700', aircraft: '#b8ff63', selected: '#ffffff', emergency: '#ff0000', ground: '#fff700', text: '#ffffb4', mlat: '#ccff88', adsb: '#b8ff63', other: '#aaff55' },
    'daylight': { background: '#dce8f2', grid: '#aabccc', sweep: '#0077ff', aircraft: '#ff3333', selected: '#0000ff', emergency: '#ff0000', ground: '#0099ff', text: '#224466', mlat: '#ff6666', adsb: '#ff3333', other: '#ff4444' },
    'cad': { background: '#ffffff', grid: '#cccccc', sweep: '#888888', aircraft: '#0000ff', selected: '#ff00ff', emergency: '#ff0000', ground: '#0000ff', text: '#000000', mlat: '#0066ff', adsb: '#0000ff', other: '#0033ff' },
    'blueprint-light': { background: '#e0e8f6', grid: '#a8bedc', sweep: '#ffffff', aircraft: '#0033cc', selected: '#ff3300', emergency: '#cc0000', ground: '#0033cc', text: '#002266', mlat: '#0066ff', adsb: '#0033cc', other: '#0044dd' },
    'paper-map': { background: '#f5f3e8', grid: '#dcd9c8', sweep: '#b1a18c', aircraft: '#d9534f', selected: '#0275d8', emergency: '#ff0000', ground: '#b1a18c', text: '#6a5f4b', mlat: '#e66666', adsb: '#d9534f', other: '#cc4444' },
    'arctic-light': { background: '#f0f8ff', grid: '#c0d8ef', sweep: '#63c7ff', aircraft: '#0088cc', selected: '#0000ff', emergency: '#ff3333', ground: '#63c7ff', text: '#052a4f', mlat: '#0099dd', adsb: '#0088cc', other: '#0077bb' },
    'sandstorm': { background: '#fdf6e3', grid: '#eee8d5', sweep: '#dc322f', aircraft: '#268bd2', selected: '#d33682', emergency: '#ff0000', ground: '#dc322f', text: '#657b83', mlat: '#2aa198', adsb: '#268bd2', other: '#6c71c4' },
    'medical': { background: '#ffffff', grid: '#d0d0d0', sweep: '#00a0a0', aircraft: '#d90000', selected: '#0000d9', emergency: '#ff0000', ground: '#00a0a0', text: '#444444', mlat: '#ff3333', adsb: '#d90000', other: '#cc0000' },
    'clean-room': { background: '#f8f8f8', grid: '#d8d8d8', sweep: '#a0a0a0', aircraft: '#000000', selected: '#0000ff', emergency: '#ff0000', ground: '#888888', text: '#333333', mlat: '#444444', adsb: '#000000', other: '#222222' },
    'graph-paper': { background: '#ffffff', grid: '#add8e6', sweep: '#4682b4', aircraft: '#ff4500', selected: '#32cd32', emergency: '#ff0000', ground: '#4682b4', text: '#00008b', mlat: '#ff6633', adsb: '#ff4500', other: '#ff5522' },
    'hi-vis': { background: '#ffffff', grid: '#c0c0c0', sweep: '#ffaa00', aircraft: '#000000', selected: '#ff00ff', emergency: '#ff0000', ground: '#ffaa00', text: '#000000', mlat: '#333333', adsb: '#000000', other: '#111111' }
};


