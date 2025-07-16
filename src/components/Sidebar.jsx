import React from 'react';

function Sidebar({
  showSidebar, setShowSidebar,
  running, handleStart, handleStop, handleStep, handleClear,
  handleExport, handleImportClick, fileInputRef, handleFileChange,
  speed, setSpeed, MIN_SPEED, MAX_SPEED,
  cellSize, setCellSize, MIN_CELL_SIZE, MAX_CELL_SIZE,
  brushSize, setBrushSize,
  showGridLines, setShowGridLines
}) {
  return (
    <div style={{ position: 'fixed', top: 18, left: 18, zIndex: 100, width: showSidebar ? 260 : 40, background: '#232b3a', color: '#fff', borderRadius: 14, boxShadow: '0 4px 24px #0008', border: '1.5px solid #0ff6', transition: 'width 0.2s', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: showSidebar ? 'flex-start' : 'center', padding: showSidebar ? '18px 12px 12px 12px' : '18px 0 0 0' }}>
      <button onClick={() => setShowSidebar(s => !s)} style={{ marginBottom: 18, width: 32, height: 32, borderRadius: 8, border: 'none', background: '#333', color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer' }}>{showSidebar ? '⏴' : '⏵'}</button>
      {showSidebar && <>
        <button
          onClick={() => window.open('https://en.wikipedia.org/wiki/Conway%27s_Game_of_Life', '_blank', 'noopener,noreferrer')}
          className="sidebar-btn"
          style={{ marginBottom: 10, background: '#0ff', color: '#222', fontWeight: 700 }}
          title="Rules"
        >
          Rules
        </button>
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
  );
}

export default Sidebar; 