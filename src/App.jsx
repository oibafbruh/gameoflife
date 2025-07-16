import { useState, useRef, useEffect } from 'react';
import React, { memo } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import GameCanvas from './components/GameCanvas';
import Footer from './components/Footer';
import {
  INIT_CELL_SIZE, MIN_CELL_SIZE, MAX_CELL_SIZE,
  MIN_SPEED, MAX_SPEED, INIT_SPEED, FADE_SPEED,
  getKey, parseKey, getNeighbors, nextGeneration, getCellColor, parseRLE, parseLIF
} from './utils';

const MemoGameCanvas = memo(GameCanvas);

function App() {
  // Place color helpers at the top so they are always in scope
  function lerpColor(a, b, t) {
    // a, b: [r,g,b], t: 0-1
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }
  function getHeatmapColor(norm) {
    // norm: 0 (cold) to 1 (hot)
    // 0.0: black, 0.08: dark blue, 0.25: purple, 0.5: yellow, 0.75: red, 1.0: white
    const stops = [
      [0.0, [0, 0, 0]],         // black (#000000)
      [0.08, [0, 0, 139]],      // dark blue (#00008b)
      [0.25, [128, 0, 128]],    // purple   (#800080)
      [0.5, [255, 255, 0]],     // yellow   (#ffff00)
      [0.75, [255, 0, 0]],      // red      (#ff0000)
      [1.0, [255, 255, 255]],   // white    (#ffffff)
    ];
    for (let i = 1; i < stops.length; i++) {
      if (norm <= stops[i][0]) {
        const t = (norm - stops[i-1][0]) / (stops[i][0] - stops[i-1][0]);
        const c = lerpColor(stops[i-1][1], stops[i][1], t);
        return `rgb(${c[0]},${c[1]},${c[2]})`;
      }
    }
    return 'rgb(255,255,255)';
  }
  // Trace and heatmap toggles and refs (must be before any useEffect that uses them)
  const [showTrace, setShowTrace] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const traceMapRef = useRef(new Set());
  const heatMapRef = useRef(new Map());
  // Add state for blur and cool-off toggles
  const [blurHeatmap, setBlurHeatmap] = useState(false);
  const [coolOff, setCoolOff] = useState(false);
  // Add state for heat spread toggle
  const [heatSpread, setHeatSpread] = useState(false);
  // Add state for color by age toggle
  const [colorByAge, setColorByAge] = useState(true);
  // Step count (must be before any useEffect that uses it)
  const [stepCount, setStepCount] = useState(0);
  const [liveCells, setLiveCells] = useState(new Set());
  const [ageMap, setAgeMap] = useState(new Map());
  const [running, setRunning] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0 }); // center cell
  const [cellSize, setCellSize] = useState(INIT_CELL_SIZE);
  const [speed, setSpeed] = useState(INIT_SPEED);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const intervalRef = useRef(null);
  const dragRef = useRef(null);
  const canvasRef = useRef(null);
  const paintingRef = useRef(false);
  const paintModeRef = useRef('alive'); // 'alive' or 'dead'
  const panningRef = useRef(false);
  const liveCellsRef = useRef(liveCells);
  const ageMapRef = useRef(ageMap);
  const viewportRef = useRef(viewport);
  const cellSizeRef = useRef(cellSize);
  const dimensionsRef = useRef(dimensions);
  const fadeMapRef = useRef(new Map()); // key: 'x,y', value: fade (0-1)
  const minimapRef = useRef(null);
  const [brushSize, setBrushSize] = useState(1);
  const [mousePos, setMousePos] = useState(null); // {i, j} or null
  const [showSidebar, setShowSidebar] = useState(true);
  const [showGridLines, setShowGridLines] = useState(true);
  // FPS tracking
  const [fps, setFps] = useState(60);
  const lastFrameTime = useRef(performance.now());
  const frameCount = useRef(0);
  // Mobile hint state
  const [showMobileHint, setShowMobileHint] = useState(false);
  // Add state for hide UI
  const [hideUI, setHideUI] = useState(false);
  useEffect(() => {
    if (window.innerWidth < 700 && !localStorage.getItem('golMobileHint')) {
      setShowMobileHint(true);
      setTimeout(() => {
        setShowMobileHint(false);
        localStorage.setItem('golMobileHint', '1');
      }, 3500);
    }
  }, []);

  // Keep refs in sync
  useEffect(() => { liveCellsRef.current = liveCells; }, [liveCells]);
  useEffect(() => { ageMapRef.current = ageMap; }, [ageMap]);
  useEffect(() => { viewportRef.current = viewport; }, [viewport]);
  useEffect(() => { cellSizeRef.current = cellSize; }, [cellSize]);
  useEffect(() => { dimensionsRef.current = dimensions; }, [dimensions]);

  // Responsive grid: update on window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate rows/cols based on window size and cell size
  const VIEW_ROWS = Math.floor(dimensions.height / cellSize);
  const VIEW_COLS = Math.floor(dimensions.width / cellSize);

  // Start/Stop logic with speed
  const handleStart = () => {
    if (!running) {
      setRunning(true);
    }
  };

  const handleStop = () => {
    setRunning(false);
  };

  // Efficient simulation loop using refs
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timeoutId;
    function step() {
      if (stopped) return;
      const { newLiveCells, newAgeMap } = nextGeneration(liveCellsRef.current, ageMapRef.current);
      liveCellsRef.current = newLiveCells;
      ageMapRef.current = newAgeMap;
      setLiveCells(new Set(newLiveCells)); // update state for controls/UI
      setAgeMap(new Map(newAgeMap));
      timeoutId = setTimeout(step, speed);
    }
    step();
    return () => {
      stopped = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [running, speed]);

  const handleStep = () => {
    const { newLiveCells, newAgeMap } = nextGeneration(liveCells, ageMap);
    setLiveCells(newLiveCells);
    setAgeMap(newAgeMap);
  };

  const handleClear = () => {
    setLiveCells(new Set());
    setAgeMap(new Map());
    liveCellsRef.current = new Set();
    ageMapRef.current = new Map();
    fadeMapRef.current = new Map();
    handleStop();
  };

  // Pan with arrow keys (always enabled)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        setViewport(vp => {
          let { x, y } = vp;
          if (e.key === 'ArrowUp') x -= 1;
          if (e.key === 'ArrowDown') x += 1;
          if (e.key === 'ArrowLeft') y -= 1;
          if (e.key === 'ArrowRight') y += 1;
          return { x, y };
        });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Space bar toggles start/stop
  useEffect(() => {
    const handleSpace = (e) => {
      if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT') {
        setRunning(r => !r);
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleSpace);
    return () => window.removeEventListener('keydown', handleSpace);
  }, []);

  // Mouse events for painting and panning (always enabled)
  const handleCanvasMouseDown = (e) => {
    if (e.button === 2) {
      // Right mouse: start panning
      panningRef.current = true;
      dragRef.current = { startX: e.clientX, startY: e.clientY, ...viewportRef.current };
      window.addEventListener('mousemove', handleMouseMovePan);
      window.addEventListener('mouseup', handleMouseUpPan);
    } else if (e.button === 0 && !e.altKey) {
      // Left click: paint alive
      paintingRef.current = true;
      paintModeRef.current = 'alive';
      paintCellFromEvent(e, 'alive');
    } else if (e.button === 0 && e.altKey) {
      // Alt+left: erase
      paintingRef.current = true;
      paintModeRef.current = 'dead';
      paintCellFromEvent(e, 'dead');
    }
  };
  const handleCanvasMouseMove = (e) => {
    if (paintingRef.current) {
      paintCellFromEvent(e, paintModeRef.current);
    }
  };
  const handleCanvasMouseUp = () => {
    paintingRef.current = false;
  };
  const handleContextMenu = (e) => {
    e.preventDefault();
  };

  // Pan with right mouse drag
  const handleMouseMovePan = (e) => {
    if (!dragRef.current || !panningRef.current) return;
    const cellSize = cellSizeRef.current;
    const dx = Math.round((e.clientY - dragRef.current.startY) / cellSize);
    const dy = Math.round((e.clientX - dragRef.current.startX) / cellSize);
    setViewport({
      x: dragRef.current.x - dx,
      y: dragRef.current.y - dy,
    });
  };
  const handleMouseUpPan = () => {
    dragRef.current = null;
    panningRef.current = false;
    window.removeEventListener('mousemove', handleMouseMovePan);
    window.removeEventListener('mouseup', handleMouseUpPan);
  };

  // Throttle painting for performance
  const lastPaintTime = useRef(0);
  const PAINT_THROTTLE = 8; // ms
  const paintCellFromEvent = (e, mode) => {
    const now = performance.now();
    if (now - lastPaintTime.current < PAINT_THROTTLE) return;
    lastPaintTime.current = now;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const cellSize = cellSizeRef.current;
    const dimensions = dimensionsRef.current;
    const VIEW_ROWS = Math.floor(dimensions.height / cellSize);
    const VIEW_COLS = Math.floor(dimensions.width / cellSize);
    const viewport = viewportRef.current;
    // Center brush on mouse, not cell
    const gridX = viewport.x + (mouseY / cellSize) - (VIEW_ROWS / 2);
    const gridY = viewport.y + (mouseX / cellSize) - (VIEW_COLS / 2);
    paintBrush(gridX, gridY, mode);
  };
  // Paint a circular brush of the selected size (in grid cells)
  const paintBrush = (centerX, centerY, mode) => {
    const radiusCells = Math.max(brushSize / 2, 0.5); // always at least 0.5 cells
    const minCellX = Math.floor(centerX - radiusCells);
    const maxCellX = Math.ceil(centerX + radiusCells);
    const minCellY = Math.floor(centerY - radiusCells);
    const maxCellY = Math.ceil(centerY + radiusCells);
    let painted = false;
    for (let x = minCellX; x <= maxCellX; x++) {
      for (let y = minCellY; y <= maxCellY; y++) {
        const dx = x + 0.5 - centerX;
        const dy = y + 0.5 - centerY;
        if (Math.sqrt(dx * dx + dy * dy) <= radiusCells) {
          paintCell(x, y, mode);
          painted = true;
        }
      }
    }
    if (!painted) {
      paintCell(Math.round(centerX), Math.round(centerY), mode);
    }
  };
  const paintCell = (x, y, mode) => {
    setLiveCells(cells => {
      const newCells = new Set(cells);
      const key = getKey(x, y);
      if (mode === 'alive') {
        newCells.add(key);
      } else {
        newCells.delete(key);
      }
      liveCellsRef.current = newCells;
      // Also update ageMap
      setAgeMap(prev => {
        const newMap = new Map(prev);
        if (mode === 'alive') {
          if (!newMap.has(key)) newMap.set(key, 0);
        } else {
          newMap.delete(key);
        }
        ageMapRef.current = newMap;
        return newMap;
      });
      return newCells;
    });
  };

  // Mouse move for brush preview
  const handleGridMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    setMousePos({ mouseX, mouseY });
    if (paintingRef.current) {
      paintCellFromEvent(e, paintModeRef.current);
    }
  };
  const handleGridMouseLeave = () => {
    setMousePos(null);
    paintingRef.current = false;
  };

  // Zoom with mouse wheel/trackpad
  useEffect(() => {
    const handleWheel = (e) => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        // Zoom only if ctrlKey (pinch) or vertical scroll
        e.preventDefault();
        setCellSize(s => {
          let next = s - Math.sign(e.deltaY) * 2;
          next = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, next));
          return next;
        });
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // requestAnimationFrame canvas drawing for best performance and fade animation
  useEffect(() => {
    let animationFrameId;
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const cellSize = cellSizeRef.current;
      const dimensions = dimensionsRef.current;
      const VIEW_ROWS = Math.floor(dimensions.height / cellSize);
      const VIEW_COLS = Math.floor(dimensions.width / cellSize);
      const viewport = viewportRef.current;
      const liveCells = liveCellsRef.current;
      const fadeMap = fadeMapRef.current;
      const ageMap = ageMapRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Draw trace (faint gray) if enabled
      if (showTrace) {
        ctx.save();
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = '#aaa';
        for (let i = 0; i < VIEW_ROWS; i++) {
          for (let j = 0; j < VIEW_COLS; j++) {
            const x = viewport.x + i - Math.floor(VIEW_ROWS / 2);
            const y = viewport.y + j - Math.floor(VIEW_COLS / 2);
            const key = getKey(x, y);
            if (traceMapRef.current.has(key)) {
              ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
            }
          }
        }
        ctx.restore();
      }
      // Draw heatmap if enabled
      if (showHeatmap) {
        let maxHeat = 10;
        if (showHeatmap) {
          for (let i = 0; i < VIEW_ROWS; i++) {
            for (let j = 0; j < VIEW_COLS; j++) {
              const x = viewport.x + i - Math.floor(VIEW_ROWS / 2);
              const y = viewport.y + j - Math.floor(VIEW_COLS / 2);
              const key = getKey(x, y);
              const count = heatMapRef.current.get(key) || 0;
              if (count > maxHeat) maxHeat = count;
            }
          }
          maxHeat = Math.max(maxHeat, 10); // Clamp to at least 10
        }
        if (blurHeatmap && !running) {
          // Draw heatmap to offscreen, low-res canvas, blur, then draw to main canvas
          const scale = 0.2; // 20% resolution for performance
          const offW = Math.max(1, Math.floor(canvas.width * scale));
          const offH = Math.max(1, Math.floor(canvas.height * scale));
          const offCanvas = document.createElement('canvas');
          offCanvas.width = offW;
          offCanvas.height = offH;
          const offCtx = offCanvas.getContext('2d');
          // Draw heatmap to offscreen canvas
          for (let i = 0; i < VIEW_ROWS; i++) {
            for (let j = 0; j < VIEW_COLS; j++) {
              const x = viewport.x + i - Math.floor(VIEW_ROWS / 2);
              const y = viewport.y + j - Math.floor(VIEW_COLS / 2);
              const key = getKey(x, y);
              const count = heatMapRef.current.get(key) || 0;
              if (count > 0) {
                const blurHeatNorm = Math.min(1, count / maxHeat);
                offCtx.fillStyle = getHeatmapColor(blurHeatNorm);
                // Scale cell to offscreen canvas
                const offX = Math.floor(j * cellSize * scale);
                const offY = Math.floor(i * cellSize * scale);
                const offCell = Math.ceil(cellSize * scale);
                offCtx.fillRect(offX, offY, offCell, offCell);
              }
            }
          }
          // Apply blur filter
          offCtx.filter = 'blur(6px)';
          const blurred = offCtx.getImageData(0, 0, offW, offH);
          offCtx.putImageData(blurred, 0, 0);
          // Draw blurred heatmap to main canvas, scaled up
          ctx.save();
          ctx.globalAlpha = 0.85;
          ctx.drawImage(offCanvas, 0, 0, canvas.width, canvas.height);
          ctx.restore();
        } else {
          // Normal heatmap drawing
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          for (let i = 0; i < VIEW_ROWS; i++) {
            for (let j = 0; j < VIEW_COLS; j++) {
              const x = viewport.x + i - Math.floor(VIEW_ROWS / 2);
              const y = viewport.y + j - Math.floor(VIEW_COLS / 2);
              const key = getKey(x, y);
              const count = heatMapRef.current.get(key) || 0;
              if (count > 0) {
                const mainHeatNorm = Math.min(1, count / maxHeat);
                ctx.fillStyle = getHeatmapColor(mainHeatNorm);
                ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
              }
            }
          }
          ctx.restore();
        }
      }
      // Fade logic: update fadeMap for visible cells
      for (let i = 0; i < VIEW_ROWS; i++) {
        for (let j = 0; j < VIEW_COLS; j++) {
          const x = viewport.x + i - Math.floor(VIEW_ROWS / 2);
          const y = viewport.y + j - Math.floor(VIEW_COLS / 2);
          const key = getKey(x, y);
          const alive = liveCells.has(key);
          let fade = fadeMap.get(key) || 0;
          if (alive) {
            fade = Math.min(1, fade + FADE_SPEED);
          } else {
            fade = Math.max(0, fade - FADE_SPEED);
          }
          if (fade > 0) {
            fadeMap.set(key, fade);
          } else {
            fadeMap.delete(key);
          }
          // Draw cell with fade and age color (no glow for performance)
          if (fade > 0) {
            let fillStyle;
            if (colorByAge) {
              const age = ageMap.get(key) || 0;
              fillStyle = getCellColor(age, fade);
            } else {
              fillStyle = `rgba(255,255,255,${fade})`;
            }
            ctx.fillStyle = fillStyle;
            ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
          }
        }
      }
      // Draw brush preview (filled)
      if (mousePos && brushSize > 1) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(
          mousePos.mouseX,
          mousePos.mouseY,
          (brushSize / 2) * cellSize / (cellSize), // for grid cell units, but since mousePos is in px, just use brushSize/2 * cellSize
          0,
          2 * Math.PI
        );
        ctx.fillStyle = '#0077ff';
        ctx.fill();
        ctx.restore();
      }
      // Draw brush preview (outline)
      if (mousePos && brushSize > 0) {
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(
          mousePos.mouseX,
          mousePos.mouseY,
          (brushSize / 2) * cellSize,
          0,
          2 * Math.PI
        );
        ctx.strokeStyle = '#00aaff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      // Draw grid lines (if enabled)
      if (showGridLines) {
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;
        for (let i = 0; i <= VIEW_ROWS; i++) {
          ctx.beginPath();
          ctx.moveTo(0, i * cellSize);
          ctx.lineTo(VIEW_COLS * cellSize, i * cellSize);
          ctx.stroke();
        }
        for (let j = 0; j <= VIEW_COLS; j++) {
          ctx.beginPath();
          ctx.moveTo(j * cellSize, 0);
          ctx.lineTo(j * cellSize, VIEW_ROWS * cellSize);
          ctx.stroke();
        }
      }
      // Fill background black
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = 'source-over';
      animationFrameId = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(animationFrameId);
  }, [brushSize, mousePos, showGridLines, showTrace, showHeatmap, stepCount, blurHeatmap, running, colorByAge]);

  // FPS tracking
  useEffect(() => {
    let animationFrameId;
    let lastFpsUpdate = performance.now();
    const updateFps = (now) => {
      frameCount.current++;
      if (now - lastFpsUpdate > 500) {
        setFps(Math.round((frameCount.current * 1000) / (now - lastFpsUpdate)));
        frameCount.current = 0;
        lastFpsUpdate = now;
      }
      animationFrameId = requestAnimationFrame(updateFps);
    };
    animationFrameId = requestAnimationFrame(updateFps);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Export pattern as JSON
  const handleExport = () => {
    const pattern = Array.from(liveCellsRef.current);
    const blob = new Blob([JSON.stringify(pattern)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'game-of-life-pattern.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Minimap drawing
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw black background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Draw label
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#0ff';
    ctx.textAlign = 'center';
    ctx.fillText('Minimap', canvas.width / 2, 20);
    const liveCells = liveCellsRef.current;
    if (liveCells.size === 0) return;
    // Find bounds
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const key of liveCells) {
      const { x, y } = parseKey(key);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    // Padding
    minX -= 2; maxX += 2; minY -= 2; maxY += 2;
    const width = maxY - minY + 1;
    const height = maxX - minX + 1;
    // Fit to minimap size
    const mapW = canvas.width, mapH = canvas.height;
    const scale = Math.min(mapW / width, mapH / height);
    // Draw live cells
    for (const key of liveCells) {
      const { x, y } = parseKey(key);
      const px = Math.round((y - minY) * scale);
      const py = Math.round((x - minX) * scale);
      ctx.fillStyle = '#fff';
      ctx.fillRect(px, py, Math.max(1, scale), Math.max(1, scale));
    }
    // Draw viewport rectangle
    const cellSize = cellSizeRef.current;
    const dimensions = dimensionsRef.current;
    const VIEW_ROWS = Math.floor(dimensions.height / cellSize);
    const VIEW_COLS = Math.floor(dimensions.width / cellSize);
    const viewport = viewportRef.current;
    const vpx = Math.round((viewport.y - Math.floor(VIEW_COLS / 2) - minY) * scale);
    const vpy = Math.round((viewport.x - Math.floor(VIEW_ROWS / 2) - minX) * scale);
    const vpw = Math.round(VIEW_COLS * scale);
    const vph = Math.round(VIEW_ROWS * scale);
    ctx.strokeStyle = '#0ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(vpx, vpy, vpw, vph);
  }, [liveCells, viewport, cellSize, dimensions]);

  // RLE import logic
  const fileInputRef = useRef(null);
  const handleImportClick = () => {
    fileInputRef.current.click();
  };
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      let cells = [], width = 0, height = 0;
      if (file.name.endsWith('.rle')) {
        const parsed = parseRLE(text);
        cells = parsed.cells;
        width = parsed.width;
        height = parsed.height;
      } else if (file.name.endsWith('.lif') || file.name.endsWith('.lif.txt')) {
        const parsed = parseLIF(text);
        cells = parsed.cells;
        width = parsed.width;
        height = parsed.height;
      } else {
        alert('Unsupported file type. Please use .rle or .lif');
        return;
      }
      // Center pattern in current viewport
      const cellSize = cellSizeRef.current;
      const dimensions = dimensionsRef.current;
      const VIEW_ROWS = Math.floor(dimensions.height / cellSize);
      const VIEW_COLS = Math.floor(dimensions.width / cellSize);
      const viewport = viewportRef.current;
      const offsetX = viewport.x - Math.floor(VIEW_ROWS / 2) + Math.floor((VIEW_ROWS - height) / 2);
      const offsetY = viewport.y - Math.floor(VIEW_COLS / 2) + Math.floor((VIEW_COLS - width) / 2);
      const newCells = new Set();
      const newAgeMap = new Map();
      for (const [x, y] of cells) {
        const gx = offsetX + x;
        const gy = offsetY + y;
        const key = getKey(gx, gy);
        newCells.add(key);
        newAgeMap.set(key, 0);
      }
      setLiveCells(newCells);
      setAgeMap(newAgeMap);
      liveCellsRef.current = newCells;
      ageMapRef.current = newAgeMap;
      fadeMapRef.current = new Map();
    };
    reader.readAsText(file);
  };

  // RLE parser
  function parseRLE(text) {
    const lines = text.split(/\r?\n/).filter(line => !line.startsWith('#') && line.trim() !== '');
    let header = lines.find(line => line.includes('x') && line.includes('y'));
    let width = 0, height = 0;
    if (header) {
      const match = header.match(/x\s*=\s*(\d+),\s*y\s*=\s*(\d+)/);
      if (match) {
        width = parseInt(match[1], 10);
        height = parseInt(match[2], 10);
      }
    }
    const dataLines = lines.filter(line => !line.includes('x') && !line.includes('y'));
    const data = dataLines.join('');
    let x = 0, y = 0;
    let count = '';
    const cells = [];
    for (let i = 0; i < data.length; i++) {
      const c = data[i];
      if (c >= '0' && c <= '9') {
        count += c;
      } else if (c === 'b') {
        x += count ? parseInt(count, 10) : 1;
        count = '';
      } else if (c === 'o') {
        const n = count ? parseInt(count, 10) : 1;
        for (let j = 0; j < n; j++) {
          cells.push([y, x]);
          x++;
        }
        count = '';
      } else if (c === '$') {
        const n = count ? parseInt(count, 10) : 1;
        y += n;
        x = 0;
        count = '';
      } else if (c === '!') {
        break;
      }
    }
    // Normalize to top-left origin
    let minRow = Math.min(...cells.map(([row]) => row), 0);
    let minCol = Math.min(...cells.map(([, col]) => col), 0);
    const normCells = cells.map(([row, col]) => [row - minRow, col - minCol]);
    return { cells: normCells, width, height };
  }

  // LIF parser (Life 1.05)
  function parseLIF(text) {
    const lines = text.split(/\r?\n/).filter(line => !line.startsWith('#') && line.trim() !== '');
    let cells = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let curX = 0, curY = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('P') || line.startsWith('p')) {
        // #P x y or P x y
        const parts = line.replace('#', '').replace('P', '').replace('p', '').trim().split(/\s+/);
        curX = parseInt(parts[0], 10);
        curY = parseInt(parts[1], 10);
        let j = i + 1;
        while (j < lines.length && !lines[j].startsWith('P') && !lines[j].startsWith('p')) {
          const row = lines[j];
          for (let k = 0; k < row.length; k++) {
            if (row[k] === '*') {
              cells.push([curY, curX + k]);
              if (curY < minY) minY = curY;
              if (curY > maxY) maxY = curY;
              if (curX + k < minX) minX = curX + k;
              if (curX + k > maxX) maxX = curX + k;
            }
          }
          curY++;
          j++;
        }
        i = j - 1;
      }
    }
    // Normalize to top-left origin
    if (cells.length === 0) return { cells: [], width: 0, height: 0 };
    const normCells = cells.map(([row, col]) => [row - minY, col - minX]);
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    return { cells: normCells, width, height };
  }

  // Pinch-to-zoom and improved touch support
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let lastTouchDist = null;
    let lastTouchCenter = null;
    let isPinching = false;
    let isPanning = false;
    let panStart = null;
    let lastTouch = null;
    const getTouchDist = (e) => {
      if (e.touches.length < 2) return 0;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };
    const getTouchCenter = (e) => {
      if (e.touches.length < 2) return { x: 0, y: 0 };
      return {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    };
    const handleTouchStart = (e) => {
      if (e.touches.length === 1) {
        paintingRef.current = true;
        paintModeRef.current = 'alive';
        lastTouch = e.touches[0];
        paintCellFromEvent(e.touches[0], 'alive');
      } else if (e.touches.length === 2) {
        isPinching = true;
        lastTouchDist = getTouchDist(e);
        lastTouchCenter = getTouchCenter(e);
        isPanning = true;
        panStart = [lastTouchCenter.x, lastTouchCenter.y, viewportRef.current.x, viewportRef.current.y];
      }
      e.preventDefault();
    };
    const handleTouchMove = (e) => {
      if (isPinching && e.touches.length === 2) {
        const newDist = getTouchDist(e);
        const scale = newDist / lastTouchDist;
        setCellSize(s => {
          let next = Math.round(s * scale);
          next = Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, next));
          return next;
        });
        lastTouchDist = newDist;
        // Pan with pinch center
        const center = getTouchCenter(e);
        const dx = Math.round((center.y - panStart[1]) / cellSizeRef.current);
        const dy = Math.round((center.x - panStart[0]) / cellSizeRef.current);
        setViewport({ x: panStart[2] - dx, y: panStart[3] - dy });
      } else if (isPanning && e.touches.length === 2) {
        const center = getTouchCenter(e);
        const dx = Math.round((center.y - panStart[1]) / cellSizeRef.current);
        const dy = Math.round((center.x - panStart[0]) / cellSizeRef.current);
        setViewport({ x: panStart[2] - dx, y: panStart[3] - dy });
      } else if (paintingRef.current && e.touches.length === 1) {
        paintCellFromEvent(e.touches[0], paintModeRef.current);
      }
      e.preventDefault();
    };
    const handleTouchEnd = (e) => {
      paintingRef.current = false;
      isPinching = false;
      isPanning = false;
      panStart = null;
      lastTouchDist = null;
      lastTouchCenter = null;
    };
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    // Prevent browser scrolling
    canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchmove', e => e.preventDefault());
    };
  }, [cellSize]);

  // Minimap tap-to-pan
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const handleMinimapTap = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const px = x - rect.left;
      const py = y - rect.top;
      // Find bounds
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const key of liveCellsRef.current) {
        const { x, y } = parseKey(key);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      minX -= 2; maxX += 2; minY -= 2; maxY += 2;
      const width = maxY - minY + 1;
      const height = maxX - minX + 1;
      const mapW = canvas.width, mapH = canvas.height;
      const scale = Math.min(mapW / width, mapH / height);
      // Center viewport on tap
      const gridY = Math.round(px / scale) + minY;
      const gridX = Math.round(py / scale) + minX;
      setViewport({ x: gridX, y: gridY });
    };
    canvas.addEventListener('click', handleMinimapTap);
    canvas.addEventListener('touchstart', handleMinimapTap);
    return () => {
      canvas.removeEventListener('click', handleMinimapTap);
      canvas.removeEventListener('touchstart', handleMinimapTap);
    };
  }, [liveCells, cellSize, dimensions]);

  // Hide grid lines by default on mobile
  useEffect(() => {
    if (window.innerWidth < 700) setShowGridLines(false);
  }, []);

  // Track live cell count history for graph
  const [pixelHistory, setPixelHistory] = useState([]);
  useEffect(() => {
    setPixelHistory(hist => {
      const next = [...hist, liveCells.size];
      return next.length > 100 ? next.slice(next.length - 100) : next;
    });
  }, [liveCells]);

  // Track max pixels ever and rate of change
  const [maxPixels, setMaxPixels] = useState(0);
  const [lastPixelCount, setLastPixelCount] = useState(0);
  const [pixelDelta, setPixelDelta] = useState(0);
  useEffect(() => {
    setMaxPixels(mp => Math.max(mp, liveCells.size));
    setPixelDelta(liveCells.size - lastPixelCount);
    setLastPixelCount(liveCells.size);
  }, [liveCells]);
  const percentToMax = maxPixels > 0 ? ((liveCells.size - maxPixels) / maxPixels) * 100 : 0;

  // Add a ref to track previous generation's live cells
  const prevLiveCellsRef = useRef(new Set());
  // Update trace and heatmap on every generation
  useEffect(() => {
    setStepCount(c => c + 1);
    if (showTrace || showHeatmap) {
      const prevLiveCells = prevLiveCellsRef.current;
      const heatMap = heatMapRef.current;
      for (const key of liveCells) {
        traceMapRef.current.add(key);
        if (showHeatmap) {
          const prev = heatMap.get(key) || 0;
          heatMap.set(key, prev + 1);
        }
      }
      // Cool-off: decrease heat for all cells if enabled
      if (showHeatmap && coolOff) {
        for (const [key, value] of heatMap.entries()) {
          if (!liveCells.has(key)) {
            heatMap.set(key, Math.max(0, value - 0.025));
          }
        }
      }
      // Heat spread: diffuse heat to neighbors if enabled
      if (showHeatmap && heatSpread) {
        const SPREAD_THRESHOLD = 0.5; // Only spread if heat > 0.5
        const SPREAD_FRACTION = 0.12; // 12% of heat is spread
        const tempMap = new Map();
        for (const [key, value] of heatMap.entries()) {
          if (value > SPREAD_THRESHOLD) {
            const spread = value * SPREAD_FRACTION;
            const remain = value - spread;
            heatMap.set(key, remain);
            // Spread to 8 neighbors
            const { x, y } = parseKey(key);
            const perNeighbor = spread / 8;
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nKey = getKey(x + dx, y + dy);
                tempMap.set(nKey, (tempMap.get(nKey) || 0) + perNeighbor);
              }
            }
          }
        }
        // Apply tempMap to heatMap
        for (const [key, add] of tempMap.entries()) {
          heatMap.set(key, (heatMap.get(key) || 0) + add);
        }
      }
      // Update prevLiveCellsRef for next generation
      prevLiveCellsRef.current = new Set(liveCells);
    }
  }, [liveCells, showHeatmap, coolOff, heatSpread]);

  // UI: floating sidebar overlay pinned to top left
  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative', background: '#111' }}>
      {/* Floating Sidebar Overlay */}
      <div style={{ position: 'fixed', top: 18, right: 18, zIndex: 200 }}>
        <button
          onClick={() => setHideUI(h => !h)}
          style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: '#222', color: '#0ff', fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: '0 2px 8px #0008' }}
          title={hideUI ? 'Show UI' : 'Hide UI'}
        >
          {hideUI ? '☰' : '✕'}
        </button>
      </div>
      {!hideUI && (
        <>
          {/* Floating Sidebar Overlay */}
          <div style={{ position: 'fixed', top: 18, left: 18, zIndex: 100, width: showSidebar ? 260 : 40, background: '#232b3a', color: '#fff', borderRadius: 14, boxShadow: '0 4px 24px #0008', border: '1.5px solid #0ff6', transition: 'width 0.2s', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: showSidebar ? 'flex-start' : 'center', padding: showSidebar ? '18px 12px 12px 12px' : '18px 0 0 0' }}>
            <button onClick={() => setShowSidebar(s => !s)} style={{ marginBottom: 18, width: 32, height: 32, borderRadius: 8, border: 'none', background: '#333', color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer' }}>{showSidebar ? '⏴' : '⏵'}</button>
            {showSidebar && <>
              <button onClick={handleStart} disabled={running} className="sidebar-btn">Start</button>
              <button onClick={handleStop} disabled={!running} className="sidebar-btn">Stop</button>
              <button onClick={handleStep} disabled={running} className="sidebar-btn">Step</button>
              <button onClick={handleClear} className="sidebar-btn">Clear</button>
              <button onClick={handleExport} className="sidebar-btn">Export</button>
              <button onClick={handleImportClick} className="sidebar-btn">Import</button>
              <input
                type="file"
                accept=".rle,.lif,.lif.txt"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <label style={{ margin: '8px 0 0 0', display: 'block' }}>
                Speed:
                <input
                  type="range"
                  min={MIN_SPEED}
                  max={MAX_SPEED}
                  step={1}
                  value={speed}
                  onChange={e => setSpeed(Number(e.target.value))}
                  style={{ verticalAlign: 'middle', width: 120 }}
                />
                {speed}ms
              </label>
              <label style={{ margin: '8px 0 0 0', display: 'block' }}>
                Zoom:
                <button onClick={() => setCellSize(s => Math.max(MIN_CELL_SIZE, s - 2))} disabled={cellSize <= MIN_CELL_SIZE} className="sidebar-btn" style={{ width: 36, padding: 0 }}>-</button>
                <span style={{ margin: '0 8px' }}>{cellSize}px</span>
                <button onClick={() => setCellSize(s => Math.min(MAX_CELL_SIZE, s + 2))} disabled={cellSize >= MAX_CELL_SIZE} className="sidebar-btn" style={{ width: 36, padding: 0 }}>+</button>
              </label>
              <label style={{ margin: '8px 0 0 0', display: 'block' }}>
                Brush:
                <input
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))}
                  style={{ verticalAlign: 'middle', width: 80 }}
                />
                {brushSize}px
              </label>
              <label style={{ margin: '8px 0 0 0', display: 'block' }}>
                <input type="checkbox" checked={showGridLines} onChange={e => setShowGridLines(e.target.checked)} style={{ marginRight: 6 }} /> Show Grid Lines
              </label>
              <label style={{ margin: '8px 0 0 0', display: 'block' }}>
                <input type="checkbox" checked={showTrace} onChange={e => setShowTrace(e.target.checked)} style={{ marginRight: 6 }} /> Show Trace
              </label>
              <label style={{ margin: '8px 0 0 0', display: 'block' }}>
                <input type="checkbox" checked={showHeatmap} onChange={e => setShowHeatmap(e.target.checked)} style={{ marginRight: 6 }} /> Show Heatmap
              </label>
              <label style={{ margin: '8px 0 0 0', display: 'block' }}>
                <input type="checkbox" checked={blurHeatmap} onChange={e => setBlurHeatmap(e.target.checked)} style={{ marginRight: 6 }} /> Blur Heatmap (Paused Only)
              </label>
              <label style={{ margin: '8px 0 0 0', display: 'block' }}>
                <input type="checkbox" checked={coolOff} onChange={e => setCoolOff(e.target.checked)} style={{ marginRight: 6 }} /> Heat Cool-Off
              </label>
              <label style={{ margin: '8px 0 0 0', display: 'block' }}>
                <input type="checkbox" checked={heatSpread} onChange={e => setHeatSpread(e.target.checked)} style={{ marginRight: 6 }} /> Heat Spread
              </label>
              <label style={{ margin: '8px 0 0 0', display: 'block' }}>
                <input type="checkbox" checked={colorByAge} onChange={e => setColorByAge(e.target.checked)} style={{ marginRight: 6 }} /> Color by Age
              </label>
            </>}
          </div>
          {/* Main grid area overlays */}
          <div style={{ height: '100vh', width: '100vw', marginLeft: showSidebar ? 260 : 40, transition: 'margin-left 0.2s', background: '#000' }}>
            <MemoGameCanvas
              canvasRef={canvasRef}
              VIEW_COLS={VIEW_COLS}
              VIEW_ROWS={VIEW_ROWS}
              cellSize={cellSize}
              handleCanvasMouseDown={handleCanvasMouseDown}
              handleGridMouseMove={handleGridMouseMove}
              handleCanvasMouseUp={handleCanvasMouseUp}
              handleGridMouseLeave={handleGridMouseLeave}
              handleContextMenu={handleContextMenu}
            />
            {/* Video-style speed controller */}
            <div className="video-controller" style={{
              position: 'fixed',
              left: '50%',
              bottom: 32,
              transform: 'translateX(-50%)',
              background: 'rgba(30,34,40,0.95)',
              borderRadius: 16,
              boxShadow: '0 2px 16px #0008',
              padding: '10px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 24,
              zIndex: 200,
              minWidth: 180,
              height: 64,
            }}>
              <button
                onClick={() => setSpeed(s => Math.max(MIN_SPEED, s - 10))}
                style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Faster (subtract 10ms)"
                disabled={speed <= MIN_SPEED}
              >
                &#x2039;
              </button>
              <button
                onClick={() => setRunning(r => !r)}
                style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title={running ? 'Pause (Space)' : 'Play (Space)'}
              >
                {running ? '❚❚' : '▶'}
              </button>
              <button
                onClick={() => setSpeed(s => Math.min(MAX_SPEED, s + 10))}
                style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'none', color: '#fff', fontSize: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Slower (add 10ms)"
                disabled={speed >= MAX_SPEED}
              >
                &#x203A;
              </button>
            </div>
            {/* Minimap overlay */}
            <canvas
              ref={minimapRef}
              width={280}
              height={280}
              className="minimap"
              style={{
                position: 'fixed',
                right: 24,
                top: 24,
                width: 280,
                height: 280,
                background: 'transparent',
                border: '2px solid #0ff6',
                borderRadius: 12,
                zIndex: 120
              }}
            />
            {/* Game speed and performance stat under minimap */}
            <div style={{
              position: 'fixed',
              right: 24,
              top: 314,
              color: '#fff',
              fontSize: 16,
              fontWeight: 500,
              background: 'rgba(30,34,40,0.95)',
              borderRadius: 8,
              padding: '4px 16px',
              zIndex: 121,
              textAlign: 'center',
              minWidth: 120
            }}>
              <div style={{ fontSize: 15, color: '#0ff', marginBottom: 2 }}>Step: {stepCount}</div>
              Game Speed: {speed}ms<br/>
              <span style={{ color: fps < 10 ? '#ff4444' : fps < 28 ? '#ffe066' : fps >= 40 ? '#00ff66' : '#fff' }}>Performance: {fps} FPS</span>
              <div style={{ color: '#0ff', fontSize: 15, marginTop: 6 }}>Max Pixels: {maxPixels}</div>
              <div style={{ fontSize: 14, marginTop: 2 }}>
                Change to Max: <span style={{ color: percentToMax < 0 ? '#ff4444' : percentToMax > 0 ? '#00ff66' : '#fff' }}>{percentToMax > 0 ? '+' : ''}{percentToMax.toFixed(1)}%</span>
              </div>
              <div style={{ fontSize: 14, marginTop: 2 }}>
                Δ: <span style={{ color: pixelDelta < 0 ? '#ff4444' : pixelDelta > 0 ? '#00ff66' : '#aaa' }}>{pixelDelta > 0 ? '+' : ''}{pixelDelta}</span>
              </div>
            </div>
            {/* Pixel count and graph in bottom right */}
            <div style={{
              position: 'fixed',
              right: 18,
              bottom: 18,
              zIndex: 150,
              background: 'rgba(30,34,40,0.95)',
              borderRadius: 12,
              boxShadow: '0 2px 12px #0008',
              padding: '10px 18px 12px 18px',
              minWidth: 120,
              textAlign: 'center',
            }}>
              <div style={{ color: '#0ff', fontWeight: 600, fontSize: 18, marginBottom: 4 }}>
                Pixels: {liveCells.size}
              </div>
              <canvas
                width={120}
                height={48}
                style={{ width: 120, height: 48, background: '#000', borderRadius: 8 }}
                ref={el => {
                  if (!el) return;
                  const ctx = el.getContext('2d');
                  ctx.clearRect(0, 0, 120, 48);
                  // Black background
                  ctx.fillStyle = '#000';
                  ctx.fillRect(0, 0, 120, 48);
                  ctx.strokeStyle = '#0ff';
                  ctx.lineWidth = 2.5;
                  ctx.beginPath();
                  const hist = pixelHistory;
                  if (hist.length > 0) {
                    const max = Math.max(...hist, 1);
                    const min = Math.min(...hist, 0);
                    // Add margin (5% top/bottom)
                    const margin = 0.05 * (max - min || 1);
                    const graphMax = max + margin;
                    const graphMin = min - margin;
                    for (let i = 0; i < hist.length; i++) {
                      const x = (i / (hist.length - 1)) * 119;
                      // Avoid division by zero for flat lines
                      const y = 46 - ((hist[i] - graphMin) / (graphMax - graphMin || 1)) * 44;
                      if (i === 0) ctx.moveTo(x, y);
                      else ctx.lineTo(x, y);
                    }
                    ctx.stroke();
                  }
                }}
              />
              <div style={{ color: '#888', fontSize: 13, marginTop: 2 }}>Population (last 100 steps)</div>
            </div>
          </div>
        </>
      )}
      {hideUI && (
        <div style={{ height: '100vh', width: '100vw', background: '#000' }}>
          <MemoGameCanvas
            canvasRef={canvasRef}
            VIEW_COLS={VIEW_COLS}
            VIEW_ROWS={VIEW_ROWS}
            cellSize={cellSize}
            handleCanvasMouseDown={handleCanvasMouseDown}
            handleGridMouseMove={handleGridMouseMove}
            handleCanvasMouseUp={handleCanvasMouseUp}
            handleGridMouseLeave={handleGridMouseLeave}
            handleContextMenu={handleContextMenu}
          />
        </div>
      )}
      {/* Mobile hint */}
      {showMobileHint && (
        <div className="mobile-hint">
          Drag to paint, two fingers to pan, pinch to zoom.<br/>
          Tap minimap to pan.<br/>
          <span style={{ fontSize: '0.9em', color: '#0ff' }}>Welcome to Game of Life!</span>
        </div>
      )}
      <div style={{ position: 'fixed', left: 10, bottom: 10, color: '#888', fontSize: 15, fontWeight: 500, zIndex: 100 }}>
        Experimental Project - Fabio Bauer
      </div>
    </div>
  );
}

export default App;
