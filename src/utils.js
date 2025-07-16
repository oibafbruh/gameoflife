// Utility functions for Game of Life

export const INIT_CELL_SIZE = 20;
export const MIN_CELL_SIZE = 8;
export const MAX_CELL_SIZE = 40;
export const MIN_SPEED = 5;
export const MAX_SPEED = 100;
export const INIT_SPEED = 30;
export const FADE_SPEED = 0.15; // fade step per frame

export function getKey(x, y) {
  return `${x},${y}`;
}
export function parseKey(key) {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

export function getNeighbors(x, y) {
  return [
    [x - 1, y - 1], [x - 1, y], [x - 1, y + 1],
    [x, y - 1],                 [x, y + 1],
    [x + 1, y - 1], [x + 1, y], [x + 1, y + 1],
  ];
}

export function nextGeneration(liveCells, ageMap) {
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

export function getCellColor(age, fade) {
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

// RLE parser
export function parseRLE(text) {
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
export function parseLIF(text) {
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