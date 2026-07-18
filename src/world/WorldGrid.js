/**
 * WorldGrid — typed per-tile data layer for the overworld.
 *
 * Replaces the raw `Uint8Array _grid` previously inline in OverworldScene.
 * OW-2+ phases extend WorldCell with additional feature/content data rather
 * than adding more parallel arrays.
 */
function _defaultCell() {
    return {
        elevation: 0,
        biome: 'bog',
        feature: 'none',
        content: 'empty',
        dungeonId: 0,
        buildingId: 0,
        settlementId: 0,
        walkable: true,
    };
}
export class WorldGrid {
    width;
    height;
    /** Row-major flat array: `cells[row * width + col]`. */
    cells;
    /** World-space units per tile (always 2, matching interior cell size). */
    tileUnit = 2;
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.cells = Array.from({ length: width * height }, _defaultCell);
    }
    /** Safe read — returns a default cell for out-of-bounds queries. */
    get(col, row) {
        if (col < 0 || col >= this.width || row < 0 || row >= this.height)
            return _defaultCell();
        return this.cells[row * this.width + col];
    }
    /** Partial-patch a cell in-place; silently ignores out-of-bounds. */
    set(col, row, patch) {
        if (col < 0 || col >= this.width || row < 0 || row >= this.height)
            return;
        Object.assign(this.cells[row * this.width + col], patch);
    }
    /** World-space XZ centre of tile (col, row). */
    gridToWorld(col, row) {
        const halfW = (this.width - 1) / 2;
        const halfH = (this.height - 1) / 2;
        return {
            wx: (col - halfW) * this.tileUnit,
            wz: (row - halfH) * this.tileUnit,
        };
    }
    /** Tile col/row from a world-space XZ position. */
    worldToGrid(wx, wz) {
        const halfW = (this.width - 1) / 2;
        const halfH = (this.height - 1) / 2;
        return {
            col: Math.floor(wx / this.tileUnit + halfW),
            row: Math.floor(wz / this.tileUnit + halfH),
        };
    }
}
