// ── Editor UI: tabs, sliders, chips, swatches, dock, gallery ────────────────
//
//  Static chrome lives in princess-creator.html; this module renders the
//  dynamic controls and keeps them in sync with the store. Controls are
//  rebuilt on tab/archetype changes and value-synced otherwise (so an open
//  slider never gets yanked out from under the pointer).
import { SPECIES_IDS, CLASS_IDS, DRESS_STYLES, EYE_STYLES, MOUTH_STYLES, HAIR_STYLES, CROWN_IDS, EAR_IDS, TAIL_IDS, BACK_IDS, HAND_ITEM_IDS, IDLE_STYLES, RANGES, } from './types';
import { defaultDna } from './dna';
import { SPECIES_DEFS, CLASS_DEFS, PALETTES } from './species';
import { STATE_IDS } from './anim/clips';
const TABS = [
    { id: 'body', label: 'Body' },
    { id: 'face', label: 'Face' },
    { id: 'hair', label: 'Hair' },
    { id: 'parts', label: 'Parts' },
    { id: 'colors', label: 'Colors' },
    { id: 'motion', label: 'Motion' },
];
/** Signature sliders pinned to the top of the Body tab, per archetype. */
const SIGNATURE = {
    human: [],
    fox: [
        { label: 'Snout', path: 'traits.snoutLength', range: RANGES.traits.snoutLength },
        { label: 'Fluffiness', path: 'traits.fluff', range: RANGES.traits.fluff },
    ],
    slime: [
        { label: 'Wobble', path: 'traits.wobble', range: RANGES.traits.wobble },
        { label: 'Translucency', path: 'traits.translucency', range: RANGES.traits.translucency },
        { label: 'Core Glow', path: 'traits.coreGlow', range: RANGES.traits.coreGlow },
    ],
    skeleton: [
        { label: 'Bone Gauge', path: 'traits.boneThickness', range: RANGES.traits.boneThickness },
        { label: 'Soul Glow', path: 'traits.eyeGlowIntensity', range: RANGES.traits.eyeGlowIntensity },
    ],
    lamia: [
        { label: 'Tail Length', path: 'body.legLength', range: RANGES.body.legLength },
        { label: 'Coil Girth', path: 'body.chubbiness', range: RANGES.body.chubbiness },
    ],
};
function el(tag, cls, parent) {
    const node = document.createElement(tag);
    if (cls)
        node.className = cls;
    parent.appendChild(node);
    return node;
}
function get(dna, path) {
    let cur = dna;
    for (const seg of path.split('.'))
        cur = cur[seg];
    return cur;
}
export class Ui {
    store;
    actions;
    activeTab = 'body';
    updaters = [];
    tabContent;
    tabsBar;
    dock;
    galleryGrid;
    codeField;
    nameField;
    undoBtn;
    redoBtn;
    subtypeWrap;
    constructor(store, actions) {
        this.store = store;
        this.actions = actions;
        this.tabContent = document.getElementById('tab-content');
        this.tabsBar = document.getElementById('tabs');
        this.dock = document.getElementById('dock');
        this.galleryGrid = document.getElementById('gallery-grid');
        this.codeField = document.getElementById('share-code');
        this.nameField = document.getElementById('name-input');
        this.undoBtn = document.getElementById('btn-undo');
        this.redoBtn = document.getElementById('btn-redo');
        this.buildChrome();
        this.renderTab();
    }
    // ── Static chrome wiring ──
    buildChrome() {
        for (const tab of TABS) {
            const b = el('button', 'tab', this.tabsBar);
            b.textContent = tab.label;
            b.dataset.tab = tab.id;
            b.onclick = () => {
                this.activeTab = tab.id;
                this.renderTab();
            };
        }
        // Species row
        const speciesRow = el('div', 'dock-row species-row', this.dock);
        for (const s of SPECIES_IDS) {
            const def = SPECIES_DEFS[s];
            const card = el('button', 'arch-card', speciesRow);
            card.dataset.species = s;
            card.title = def.blurb;
            card.innerHTML = `<span class="arch-icon">${def.icon}</span><span>${def.label}</span>`;
            card.onclick = () => this.actions.setSpecies(s);
        }
        // Class + subtype row
        const metaRow = el('div', 'dock-row meta-row', this.dock);
        const classWrap = el('div', 'dock-chips', metaRow);
        for (const c of CLASS_IDS) {
            const def = CLASS_DEFS[c];
            const chip = el('button', 'chip class-chip', classWrap);
            chip.dataset.pclass = c;
            chip.title = def.blurb;
            chip.textContent = `${def.icon} ${def.label}`;
            chip.onclick = () => this.actions.setClass(c);
        }
        this.subtypeWrap = el('div', 'dock-chips subtype-chips', metaRow);
        this.buildAnimPanel();
        document.getElementById('btn-dice').onclick = () => this.actions.rollName();
        document.getElementById('btn-random').onclick = () => this.actions.randomize();
        document.getElementById('btn-mutate').onclick = () => this.actions.mutate();
        document.getElementById('btn-copy').onclick = () => this.actions.copyCode();
        document.getElementById('btn-export-png').onclick = () => this.actions.exportPng();
        document.getElementById('btn-export-glb').onclick = () => this.actions.exportGlb();
        document.getElementById('btn-export-json').onclick = () => this.actions.exportJson();
        document.getElementById('btn-save-gallery').onclick = () => this.actions.saveToGallery();
        document.getElementById('btn-play-now').onclick = () => this.actions.playNow();
        this.undoBtn.onclick = () => this.actions.undo();
        this.redoBtn.onclick = () => this.actions.redo();
        const importField = document.getElementById('import-code');
        document.getElementById('btn-import').onclick = () => {
            const ok = this.actions.importCode(importField.value);
            if (!ok) {
                importField.classList.remove('shake');
                void importField.offsetWidth; // restart animation
                importField.classList.add('shake');
            }
            else {
                importField.value = '';
            }
        };
        this.nameField.addEventListener('focus', () => this.store.beginDrag());
        this.nameField.addEventListener('input', () => {
            this.store.set('name', this.nameField.value.slice(0, 24), 'none');
        });
        this.nameField.addEventListener('blur', () => this.store.endDrag());
    }
    // ── Control builders ──
    slider(parent, label, path, range) {
        const row = el('div', 'row', parent);
        const lab = el('label', '', row);
        lab.textContent = label;
        const input = el('input', 'slider', row);
        input.type = 'range';
        input.min = String(range.min);
        input.max = String(range.max);
        input.step = String((range.max - range.min) / 100);
        input.value = String(get(this.store.dna, path));
        input.addEventListener('pointerdown', () => this.store.beginDrag());
        input.addEventListener('input', () => {
            this.store.beginDrag();
            this.store.set(path, parseFloat(input.value), 'none');
        });
        input.addEventListener('change', () => this.store.endDrag());
        input.addEventListener('dblclick', () => {
            const def = get(defaultDna(this.store.dna.species), path);
            this.store.set(path, def);
        });
        this.updaters.push((dna) => {
            if (document.activeElement !== input)
                input.value = String(get(dna, path));
        });
    }
    chips(parent, label, path, options) {
        const wrap = el('div', 'chip-group', parent);
        const lab = el('div', 'chip-label', wrap);
        lab.textContent = label;
        const box = el('div', 'chips', wrap);
        const buttons = new Map();
        for (const opt of options) {
            const b = el('button', 'chip', box);
            b.textContent = opt;
            b.onclick = () => this.store.set(path, opt);
            buttons.set(opt, b);
        }
        const update = (dna) => {
            const val = get(dna, path);
            for (const [opt, b] of buttons)
                b.classList.toggle('active', opt === val);
        };
        update(this.store.dna);
        this.updaters.push(update);
    }
    toggle(parent, label, path) {
        const b = el('button', 'chip toggle', parent);
        b.textContent = label;
        b.onclick = () => this.store.set(path, !get(this.store.dna, path));
        const update = (dna) => {
            b.classList.toggle('active', get(dna, path));
        };
        update(this.store.dna);
        this.updaters.push(update);
    }
    colorRow(parent, label, path) {
        const row = el('div', 'row color-row', parent);
        const lab = el('label', '', row);
        lab.textContent = label;
        const input = el('input', 'swatch', row);
        input.type = 'color';
        input.value = get(this.store.dna, path);
        input.addEventListener('input', () => {
            this.store.beginDrag();
            this.store.set(path, input.value, 'none');
        });
        input.addEventListener('change', () => this.store.endDrag());
        this.updaters.push((dna) => {
            if (document.activeElement !== input)
                input.value = get(dna, path);
        });
    }
    section(parent, title) {
        const s = el('div', 'section', parent);
        const h = el('div', 'section-title', s);
        h.textContent = title;
        return s;
    }
    // ── Tab rendering ──
    renderTab() {
        this.updaters = [];
        this.tabContent.innerHTML = '';
        for (const b of this.tabsBar.children) {
            b.classList.toggle('active', b.dataset.tab === this.activeTab);
        }
        const c = this.tabContent;
        const arch = this.store.dna.archetype;
        if (this.activeTab === 'body') {
            const sig = SIGNATURE[arch];
            if (sig.length > 0) {
                const s = this.section(c, `${SPECIES_DEFS[this.store.dna.species].label} signature`);
                for (const def of sig)
                    this.slider(s, def.label, def.path, def.range);
            }
            const s1 = this.section(c, 'Proportions');
            this.slider(s1, 'Height', 'body.height', RANGES.body.height);
            this.slider(s1, 'Head Size', 'body.headSize', RANGES.body.headSize);
            this.slider(s1, 'Chubbiness', 'body.chubbiness', RANGES.body.chubbiness);
            this.slider(s1, 'Arm Length', 'body.armLength', RANGES.body.armLength);
            this.slider(s1, 'Leg Length', 'body.legLength', RANGES.body.legLength);
            this.slider(s1, 'Shoulders', 'body.shoulderWidth', RANGES.body.shoulderWidth);
            this.slider(s1, 'Hips', 'body.hipWidth', RANGES.body.hipWidth);
            const s2 = this.section(c, 'Dress');
            this.chips(s2, 'Style', 'dress.style', DRESS_STYLES);
            this.slider(s2, 'Flare', 'dress.flare', RANGES.dress.flare);
            this.slider(s2, 'Length', 'dress.length', RANGES.dress.length);
            const togs = el('div', 'chips', s2);
            this.toggle(togs, 'trim', 'dress.trim');
            this.toggle(togs, 'sash', 'dress.sash');
            this.toggle(togs, 'puff sleeves', 'dress.puffSleeves');
        }
        else if (this.activeTab === 'face') {
            const s = this.section(c, 'Eyes');
            this.chips(s, 'Style', 'face.eyeStyle', EYE_STYLES);
            this.slider(s, 'Size', 'face.eyeSize', RANGES.face.eyeSize);
            this.slider(s, 'Spacing', 'face.eyeSpacing', RANGES.face.eyeSpacing);
            this.slider(s, 'Tilt', 'face.eyeTilt', RANGES.face.eyeTilt);
            const s2 = this.section(c, 'Expression');
            this.chips(s2, 'Mouth', 'face.mouth', MOUTH_STYLES);
            this.slider(s2, 'Blush', 'face.blush', RANGES.face.blush);
        }
        else if (this.activeTab === 'hair') {
            const s = this.section(c, arch === 'slime' ? 'Hair (jelly!)' : 'Hair');
            this.chips(s, 'Style', 'hair.style', HAIR_STYLES);
            this.slider(s, 'Length', 'hair.length', RANGES.hair.length);
        }
        else if (this.activeTab === 'parts') {
            const s1 = this.section(c, 'Crown');
            this.chips(s1, 'Crown', 'parts.crown', CROWN_IDS);
            this.slider(s1, 'Tilt', 'parts.crownTilt', RANGES.parts.crownTilt);
            this.slider(s1, 'Size', 'parts.crownSize', RANGES.parts.crownSize);
            const s2 = this.section(c, 'Ears & Tail');
            this.chips(s2, 'Ears', 'parts.ears', EAR_IDS);
            this.slider(s2, 'Ear Size', 'parts.earSize', RANGES.parts.earSize);
            this.chips(s2, 'Tail', 'parts.tail', TAIL_IDS);
            this.slider(s2, 'Tail Size', 'parts.tailSize', RANGES.parts.tailSize);
            const s3 = this.section(c, 'Back & Hands');
            this.chips(s3, 'Back', 'parts.back', BACK_IDS);
            this.slider(s3, 'Back Size', 'parts.backSize', RANGES.parts.backSize);
            this.chips(s3, 'Left Hand', 'parts.handL', HAND_ITEM_IDS);
            this.chips(s3, 'Right Hand', 'parts.handR', HAND_ITEM_IDS);
            this.slider(s3, 'Item Size', 'parts.handSize', RANGES.parts.handSize);
            const s4 = this.section(c, 'Extras');
            const extras = el('div', 'chips', s4);
            this.toggle(extras, 'glasses', 'parts.glasses');
        }
        else if (this.activeTab === 'colors') {
            const species = this.store.dna.species;
            const s0 = this.section(c, `${SPECIES_DEFS[species].label} palettes`);
            const hint = el('div', 'chip-label', s0);
            hint.textContent = 'click a card to apply · drag a dot onto her to paint one spot';
            for (const pal of PALETTES[species]) {
                const card = el('button', 'palette-card', s0);
                const dots = el('span', 'palette-dots', card);
                for (const key of ['primary', 'secondary', 'accent', 'skin']) {
                    const dot = el('span', 'dot', dots);
                    dot.style.background = pal.colors[key];
                    dot.style.cursor = 'grab';
                    dot.addEventListener('pointerdown', (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        this.actions.startPaintDrag(pal.colors[key]);
                    });
                }
                const lab = el('span', 'palette-label', card);
                lab.textContent = pal.label;
                card.onclick = () => this.actions.applyPalette(species, pal.id);
            }
            const s = this.section(c, 'Custom');
            this.colorRow(s, 'Dress', 'colors.primary');
            this.colorRow(s, 'Trim', 'colors.secondary');
            this.colorRow(s, 'Accent', 'colors.accent');
            this.colorRow(s, arch === 'fox' ? 'Fur' : arch === 'slime' ? 'Jelly' : arch === 'skeleton' ? 'Bone' : 'Skin', 'colors.skin');
            this.colorRow(s, arch === 'fox' ? 'Fur Alt' : 'Hair', 'colors.hair');
            this.colorRow(s, 'Eyes', 'colors.eyes');
            this.colorRow(s, 'Metal', 'colors.metal');
            this.colorRow(s, 'Glow', 'colors.glow');
        }
        else {
            const s = this.section(c, 'Motion');
            this.slider(s, 'Energy', 'motion.energy', RANGES.motion.energy);
            this.slider(s, 'Bounce', 'motion.bounce', RANGES.motion.bounce);
            this.chips(s, 'Idle Style', 'motion.idleStyle', IDLE_STYLES);
        }
        this.sync(this.store.dna);
    }
    /** Cheap value sync (sliders, chips, name, code, dock, undo/redo). */
    sync(dna) {
        for (const u of this.updaters)
            u(dna);
        if (document.activeElement !== this.nameField)
            this.nameField.value = dna.name;
        this.dock.querySelectorAll('.arch-card').forEach((card) => {
            card.classList.toggle('active', card.dataset.species === dna.species);
        });
        this.dock.querySelectorAll('.class-chip').forEach((chip) => {
            chip.classList.toggle('active', chip.dataset.pclass === dna.pclass);
        });
        // Subtype chips (kitsune tails etc.) render only when the species has them
        const subtypes = SPECIES_DEFS[dna.species].subtypes;
        this.subtypeWrap.innerHTML = '';
        if (subtypes) {
            for (const sub of subtypes) {
                const chip = el('button', 'chip class-chip', this.subtypeWrap);
                chip.textContent = sub.label;
                chip.classList.toggle('active', dna.subtype === sub.id);
                chip.onclick = () => this.actions.setSubtype(sub.id);
            }
        }
        this.undoBtn.disabled = !this.store.canUndo;
        this.redoBtn.disabled = !this.store.canRedo;
    }
    setShareCode(code) {
        this.codeField.value = code;
    }
    setGallery(entries) {
        this.galleryGrid.innerHTML = '';
        for (const entry of entries) {
            const card = el('div', 'gallery-card', this.galleryGrid);
            const img = el('img', '', card);
            img.src = entry.thumb;
            img.alt = entry.name;
            img.title = entry.name;
            img.onclick = () => this.actions.loadGalleryEntry(entry.id);
            const name = el('div', 'gallery-name', card);
            name.textContent = entry.name;
            const del = el('button', 'gallery-del', card);
            del.textContent = '×';
            del.onclick = (e) => {
                e.stopPropagation();
                if (del.classList.contains('confirm')) {
                    this.actions.deleteGalleryEntry(entry.id);
                }
                else {
                    del.classList.add('confirm');
                    del.textContent = '✓?';
                    setTimeout(() => {
                        del.classList.remove('confirm');
                        del.textContent = '×';
                    }, 1600);
                }
            };
        }
        if (entries.length === 0) {
            const empty = el('div', 'gallery-empty', this.galleryGrid);
            empty.textContent = 'No saved princesses yet — press ⭐ Save';
        }
    }
    onArchetypeChanged() {
        this.renderTab();
    }
    // ── Animations panel ───────────────────────────────────────────────────────
    /** Rebuild on species change — clip labels are species-flavored (Slither, Melt…). */
    refreshAnimPanel() {
        this.buildAnimPanel();
    }
    buildAnimPanel() {
        const states = document.getElementById('anim-states');
        const actionsWrap = document.getElementById('anim-actions');
        const tweaks = document.getElementById('anim-tweaks');
        states.innerHTML = '';
        actionsWrap.innerHTML = '';
        tweaks.innerHTML = '';
        const clips = this.actions.listClips();
        const byId = new Map(clips.map((c) => [c.id, c]));
        // Base-state loop chips
        for (const id of STATE_IDS) {
            const meta = byId.get(id);
            if (!meta)
                continue;
            const chip = el('button', 'chip', states);
            chip.dataset.anim = id;
            chip.textContent = meta.label;
            chip.onclick = () => {
                this.actions.setAnimState(id);
                this.setAnimActive(id);
            };
        }
        this.setAnimActive(this.actions.getAnimState());
        // One-shot actions, grouped
        const GROUPS = [
            { id: 'combat', label: 'Combat' },
            { id: 'locomotion', label: 'Jumps' },
            { id: 'reaction', label: 'Reactions' },
            { id: 'misc', label: 'Emotes' },
        ];
        for (const g of GROUPS) {
            const members = clips.filter((c) => c.group === g.id && !c.loop);
            if (members.length === 0)
                continue;
            el('div', 'anim-group-label', actionsWrap).textContent = g.label;
            const grid = el('div', 'anim-grid', actionsWrap);
            for (const c of members) {
                const b = el('button', 'emote-btn', grid);
                b.dataset.anim = c.id;
                b.textContent = c.label;
                b.onclick = () => {
                    this.actions.playClip(c.id);
                    this.setAnimActive(this.actions.getAnimState());
                };
            }
        }
        // Tuning + export
        el('div', 'tweak-title', tweaks).textContent = 'Tune clip · saved per species';
        const sel = el('select', 'anim-select', tweaks);
        for (const c of clips) {
            const o = el('option', '', sel);
            o.value = c.id;
            o.textContent = c.label;
        }
        const speedRow = el('div', 'row', tweaks);
        el('label', '', speedRow).textContent = 'Speed';
        const speed = el('input', 'slider', speedRow);
        speed.type = 'range';
        speed.min = '0.5';
        speed.max = '1.8';
        speed.step = '0.01';
        const ampRow = el('div', 'row', tweaks);
        el('label', '', ampRow).textContent = 'Punch';
        const amp = el('input', 'slider', ampRow);
        amp.type = 'range';
        amp.min = '0.5';
        amp.max = '1.6';
        amp.step = '0.01';
        const syncTweak = () => {
            const t = this.actions.getTweak(sel.value);
            speed.value = String(t.speed);
            amp.value = String(t.amp);
        };
        const preview = () => {
            this.actions.playClip(sel.value);
            this.setAnimActive(this.actions.getAnimState());
        };
        sel.onchange = () => { syncTweak(); preview(); };
        speed.oninput = () => {
            this.actions.setTweakValue(sel.value, { speed: parseFloat(speed.value) });
            preview();
        };
        amp.oninput = () => {
            this.actions.setTweakValue(sel.value, { amp: parseFloat(amp.value) });
            preview();
        };
        const btnRow = el('div', 'btn-row', tweaks);
        const reset = el('button', 'big-btn', btnRow);
        reset.textContent = '↺ Reset';
        reset.onclick = () => { this.actions.resetTweak(sel.value); syncTweak(); preview(); };
        const exp = el('button', 'big-btn gold', btnRow);
        exp.textContent = '💾 Anim JSON';
        exp.title = 'Export every species\' resolved clip set for the game';
        exp.onclick = () => this.actions.exportAnims();
        syncTweak();
    }
    setAnimActive(id) {
        document.querySelectorAll('#anim-states .chip').forEach((c) => {
            c.classList.toggle('active', c.dataset.anim === id);
        });
    }
}
