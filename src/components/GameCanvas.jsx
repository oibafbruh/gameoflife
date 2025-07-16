import React from 'react';

function GameCanvas({
  canvasRef,
  VIEW_COLS,
  VIEW_ROWS,
  cellSize,
  handleCanvasMouseDown,
  handleGridMouseMove,
  handleCanvasMouseUp,
  handleGridMouseLeave,
  handleContextMenu
}) {
  return (
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
  );
}

export default GameCanvas; 