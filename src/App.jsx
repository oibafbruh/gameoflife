import { useState, useRef, useEffect } from 'react';
import React from 'react';
import './App.css';

const INIT_CELL_SIZE = 20;
const MIN_CELL_SIZE = 8;
const MAX_CELL_SIZE = 40;
const MIN_SPEED = 5;
const MAX_SPEED = 100;
const INIT_SPEED = 30;
const FADE_SPEED = 0.15; // fade step per frame

function getKey(x, y) {
  return `${x},${y}`;
}
function parseKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function getNeighbors(x, y) {
  return [
    [x - 1, y - 1], [x - 1, y], [x - 1, y + 1],
    [x, y - 1],                 [x, y + 1],
    [x + 1, y - 1], [x + 1, y], [x + 1, y + 1],
  ];
}

function nextGeneration(liveCells, ageMap) {
  const neighborCounts = new Map();
  for (const key of liveCells) {
    const { x, y } = parseKey(key);
    for (const [nx, ny] of getNeighbors(x, y)) {
      const nKey = getKey(nx, ny);
      neighborCounts.set(nKey, (neighborCounts.get(nKey) || 0) + 1);
    }
  }
  const newLiveCells = new Set();
  const newAgeMap = new Map();
  for (const [key, count] of neighborCounts.entries()) {
    if (count === 3 || (count === 2 && liveCells.has(key))) {
      newLiveCells.add(key);
      // If cell was alive, increment age; if new, set to 0
      newAgeMap.set(key, liveCells.has(key) ? (ageMap.get(key) || 0) + 1 : 0);
    }
  }
  return { newLiveCells, newAgeMap };
}

function getCellColor(age, fade) {
  // White (0-9), Red (10-19), Yellow (20-39), Green (40+)
  if (age >= 40) {
    // Green
    return `rgba(0,255,0,${fade})`;
  } else if (age >= 20) {
    // Yellow
    return `rgba(255,255,0,${fade})`;
  } else if (age >= 10) {
    // Red
    return `rgba(255,0,0,${fade})`;
  } else {
    // White
    return `rgba(255,255,255,${fade})`;
  }
}

function App() {
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

  // Paint cell alive or dead from mouse event (with brush)
  const paintCellFromEvent = (e, mode) => {
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
  // Paint a circular brush of the selected size (in pixels)
  const paintBrush = (centerX, centerY, mode) => {
    const cellSize = cellSizeRef.current;
    const radiusPx = brushSize / 2;
    const radiusCells = radiusPx / cellSize;
    for (let dx = Math.floor(-radiusCells); dx <= Math.ceil(radiusCells); dx++) {
      for (let dy = Math.floor(-radiusCells); dy <= Math.ceil(radiusCells); dy++) {
        // Center brush on fractional cell
        const dist = Math.sqrt((dx + 0.5) ** 2 + (dy + 0.5) ** 2);
        if (dist * cellSize <= radiusPx) {
          paintCell(Math.round(centerX + dx), Math.round(centerY + dy), mode);
        }
      }
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
            const age = ageMap.get(key) || 0;
            ctx.fillStyle = getCellColor(age, fade);
            ctx.fillRect(j * cellSize, i * cellSize, cellSize, cellSize);
          }
        }
      }
      // Draw brush preview
      if (mousePos && brushSize > 1) {
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.arc(
          mousePos.mouseX,
          mousePos.mouseY,
          brushSize / 2,
          0,
          2 * Math.PI
        );
        ctx.fillStyle = '#0077ff';
        ctx.fill();
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
  }, [brushSize, mousePos, showGridLines]);

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

  // UI: floating sidebar overlay pinned to top left
  return (
    <div style={{ height: '100vh', width: '100vw', position: 'relative', background: '#111' }}>
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
        </>}
      </div>
      {/* Main grid area */}
      <div style={{ height: '100vh', width: '100vw', marginLeft: showSidebar ? 260 : 40, transition: 'margin-left 0.2s', background: '#000' }}>
        <div className="grid" style={{ width: '100%', height: '100%', background: '#000' }}>
          <canvas
            ref={canvasRef}
            width={VIEW_COLS * cellSize}
            height={VIEW_ROWS * cellSize}
            style={{ display: 'block', background: '#000', border: '2px solid #333', width: '100%', height: '100%' }}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleGridMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleGridMouseLeave}
            onContextMenu={handleContextMenu}
          />
        </div>
      </div>
      <div style={{ position: 'fixed', left: 10, bottom: 10, color: '#888', fontSize: 15, fontWeight: 500, zIndex: 100 }}>
        Experimental Project - Fabio Bauer
      </div>
    </div>
  );
}

export default App;
