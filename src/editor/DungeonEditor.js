/**
 * DungeonEditor.ts — Phase L5 Dungeon Editor.
 *
 * Provides a node-graph room layout (top-level) and per-room 3D editing.
 * Rooms are connected by door links. Supports KayKit dungeon structural pieces,
 * trap tiles, encounter placement, and export to DungeonDoc JSON.
 */
import * as THREE from 'three';
import { EDITOR_SCHEMA_VERSION } from './EditorSchema';
// ── Room templates ─────────────────────────────────────────────────────────────
const ROOM_TEMPLATES = {
    entry_chamber: { size: { w: 8, d: 8 }, label: '🚪 Entry Chamber' },
    corridor_narrow: { size: { w: 4, d: 12 }, label: '▮ Narrow Corridor' },
    corridor_wide: { size: { w: 8, d: 12 }, label: '▬ Wide Corridor' },
    side_room: { size: { w: 8, d: 8 }, label: '◻ Side Room' },
    treasure_vault: { size: { w: 8, d: 8 }, label: '💰 Treasure Vault' },
    boss_arena: { size: { w: 16, d: 16 }, label: '💀 Boss Arena' },
};
// ── DungeonEditor ──────────────────────────────────────────────────────────────
export class DungeonEditor {
    core;
    _rooms = [];
    _activeRoom = 0;
    _dungeonId = 'dungeon_new';
    _dungeonName = 'New Dungeon';
    _panel;
    _mapCanvas;
    _idCounter = 0;
    constructor(core, container) {
        this.core = core;
        this._mapCanvas = document.createElement('canvas');
        this._mapCanvas.width = 280;
        this._mapCanvas.height = 120;
        this._mapCanvas.style.cssText = 'border:1px solid #2a1e40;display:block;cursor:crosshair;';
        this._panel = this._buildPanel(container);
    }
    // ── Export ──────────────────────────────────────────────────────────────────
    export() {
        this._saveCurrentRoom();
        return {
            schema: EDITOR_SCHEMA_VERSION,
            type: 'dungeon',
            id: this._dungeonId,
            name: this._dungeonName,
            rooms: this._rooms,
            objects: [],
            spawns: [],
            exits: [],
        };
    }
    download() {
        const doc = this.export();
        const json = JSON.stringify(doc, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${this._dungeonId}.ttt-level.json`;
        a.click();
    }
    // ── Room management ─────────────────────────────────────────────────────────
    addRoom(templateKey) {
        const tpl = ROOM_TEMPLATES[templateKey] ?? ROOM_TEMPLATES['side_room'];
        const id = `room_${String(++this._idCounter).padStart(3, '0')}`;
        const room = {
            id,
            name: tpl.label.replace(/^.*? /, ''),
            template: templateKey,
            size: { ...tpl.size },
            objects: [],
            spawns: [],
            exits: [],
            connections: [],
        };
        this._rooms.push(room);
        this._renderRoomList();
        this._renderNodeMap();
        return room;
    }
    connectRooms(fromId, toId) {
        const from = this._rooms.find(r => r.id === fromId);
        const to = this._rooms.find(r => r.id === toId);
        if (!from || !to)
            return;
        if (!from.connections.includes(toId))
            from.connections.push(toId);
        if (!to.connections.includes(fromId))
            to.connections.push(fromId);
        this._renderNodeMap();
    }
    _saveCurrentRoom() {
        const room = this._rooms[this._activeRoom];
        if (!room)
            return;
        room.objects = this.core.getObjects();
        room.spawns = this.core.getSpawns();
        room.exits = this.core.getExits();
    }
    async _switchToRoom(idx) {
        if (idx < 0 || idx >= this._rooms.length)
            return;
        if (this._rooms[this._activeRoom])
            this._saveCurrentRoom();
        this._activeRoom = idx;
        const room = this._rooms[idx];
        this.core.clearAll();
        await this.core.loadObjects(room.objects);
        this._renderRoomList();
        this._renderNodeMap();
    }
    // ── Node-graph map ──────────────────────────────────────────────────────────
    _renderNodeMap() {
        const ctx = this._mapCanvas.getContext('2d');
        if (!ctx)
            return;
        const W = this._mapCanvas.width;
        const H = this._mapCanvas.height;
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0e0c16';
        ctx.fillRect(0, 0, W, H);
        if (this._rooms.length === 0) {
            ctx.fillStyle = '#332244';
            ctx.font = '11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Add rooms to see the map', W / 2, H / 2);
            return;
        }
        // Layout rooms in a simple grid
        const cols = Math.ceil(Math.sqrt(this._rooms.length));
        const cw = W / (cols + 1);
        const ch = H / (Math.ceil(this._rooms.length / cols) + 1);
        const positions = this._rooms.map((_, i) => ({
            x: ((i % cols) + 1) * cw,
            y: (Math.floor(i / cols) + 1) * ch,
        }));
        // Draw connections
        ctx.strokeStyle = '#2a1e40';
        ctx.lineWidth = 1.5;
        for (const room of this._rooms) {
            const fromIdx = this._rooms.indexOf(room);
            for (const connId of room.connections) {
                const toIdx = this._rooms.findIndex(r => r.id === connId);
                if (toIdx < fromIdx)
                    continue; // draw each connection once
                ctx.beginPath();
                ctx.moveTo(positions[fromIdx].x, positions[fromIdx].y);
                ctx.lineTo(positions[toIdx].x, positions[toIdx].y);
                ctx.stroke();
            }
        }
        // Draw room nodes
        this._rooms.forEach((room, i) => {
            const { x, y } = positions[i];
            const isActive = i === this._activeRoom;
            ctx.beginPath();
            ctx.rect(x - 24, y - 10, 48, 20);
            ctx.fillStyle = isActive ? '#2a1645' : '#1a1626';
            ctx.fill();
            ctx.strokeStyle = isActive ? '#ffcc44' : '#2a1e40';
            ctx.lineWidth = isActive ? 2 : 1;
            ctx.stroke();
            ctx.fillStyle = isActive ? '#ffcc44' : '#998ab8';
            ctx.font = '9px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(room.name.slice(0, 8), x, y);
        });
    }
    // ── Panel ───────────────────────────────────────────────────────────────────
    _buildPanel(container) {
        const panel = document.createElement('div');
        panel.id = 'dungeon-editor-panel';
        panel.style.cssText = 'border-top:1px solid #2a1e40;padding:6px 8px;font-size:11px;flex-shrink:0;';
        // Add map canvas
        panel.appendChild(this._mapCanvas);
        panel.insertAdjacentHTML('beforeend', `
      <div style="font-size:10px;color:#665588;letter-spacing:1px;margin:5px 0 3px">DUNGEON ROOMS</div>
      <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:4px" id="dng-template-btns">
        ${Object.entries(ROOM_TEMPLATES).map(([k, v]) => `<button class="dng-add-room" data-tpl="${k}" style="font-size:9px;padding:2px 4px;background:#1a1626;border:1px solid #2a1e40;color:#665588;border-radius:2px;cursor:pointer">${v.label}</button>`).join('')}
      </div>
      <ul id="dng-room-list" style="list-style:none;padding:0;margin:0;max-height:80px;overflow-y:auto;margin-bottom:4px"></ul>
      <div style="display:flex;gap:4px;margin-top:4px">
        <button id="dng-spawn-enemy" style="flex:1;font-size:9px;padding:2px;background:#2a0808;border:1px solid #880000;color:#ff6666;border-radius:2px;cursor:pointer">⚔ Enemy</button>
        <button id="dng-spawn-npc"   style="flex:1;font-size:9px;padding:2px;background:#08082a;border:1px solid #000888;color:#6688ff;border-radius:2px;cursor:pointer">👤 NPC</button>
        <button id="dng-exit-enter"  style="flex:1;font-size:9px;padding:2px;background:#082028;border:1px solid #004466;color:#44aaff;border-radius:2px;cursor:pointer">▶ Entrance</button>
        <button id="dng-exit-out"    style="flex:1;font-size:9px;padding:2px;background:#082008;border:1px solid #004400;color:#44ff88;border-radius:2px;cursor:pointer">▶ Exit</button>
      </div>
      <div style="display:flex;gap:3px;margin-top:5px">
        <button id="dng-export" style="flex:1;font-size:10px;padding:3px;background:#2a1a00;border:1px solid #aa8800;color:#ffcc44;border-radius:2px;cursor:pointer">💾 Export Dungeon</button>
      </div>
    `);
        container.appendChild(panel);
        this._bindEvents(panel);
        return panel;
    }
    _bindEvents(panel) {
        panel.querySelectorAll('.dng-add-room').forEach(btn => {
            btn.addEventListener('click', () => {
                const room = this.addRoom(btn.dataset['tpl'] ?? 'side_room');
                this._switchToRoom(this._rooms.indexOf(room));
            });
        });
        panel.querySelector('#dng-spawn-enemy')?.addEventListener('click', () => this.core.placeSpawn('enemy', new THREE.Vector3(0, 0, 0)));
        panel.querySelector('#dng-spawn-npc')?.addEventListener('click', () => this.core.placeSpawn('npc', new THREE.Vector3(0, 0, 0)));
        panel.querySelector('#dng-exit-enter')?.addEventListener('click', () => this.core.placeExit('dungeon_entrance', new THREE.Vector3(-4, 0, 0)));
        panel.querySelector('#dng-exit-out')?.addEventListener('click', () => this.core.placeExit('dungeon_exit', new THREE.Vector3(4, 0, 0)));
        panel.querySelector('#dng-export')?.addEventListener('click', () => this.download());
        // Map canvas click — select room
        this._mapCanvas.addEventListener('click', (e) => {
            const rect = this._mapCanvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const cols = Math.ceil(Math.sqrt(this._rooms.length));
            const cw = this._mapCanvas.width / (cols + 1);
            const ch = this._mapCanvas.height / (Math.ceil(this._rooms.length / cols) + 1);
            this._rooms.forEach((_, i) => {
                const x = ((i % cols) + 1) * cw;
                const y = (Math.floor(i / cols) + 1) * ch;
                if (Math.abs(mx - x) < 24 && Math.abs(my - y) < 12) {
                    this._switchToRoom(i);
                }
            });
        });
    }
    _renderRoomList() {
        const listEl = document.getElementById('dng-room-list');
        if (!listEl)
            return;
        listEl.innerHTML = '';
        this._rooms.forEach((room, i) => {
            const li = document.createElement('li');
            li.style.cssText = `
        display:flex;align-items:center;gap:4px;padding:3px 6px;font-size:11px;cursor:pointer;
        background:${i === this._activeRoom ? '#2a1645' : 'transparent'};
        color:${i === this._activeRoom ? '#ffcc44' : '#998ab8'};border-radius:2px;
      `;
            li.textContent = `${room.name} (${room.size.w}×${room.size.d})`;
            li.onclick = () => this._switchToRoom(i);
            listEl.appendChild(li);
        });
    }
    dispose() { this._panel.remove(); }
}
