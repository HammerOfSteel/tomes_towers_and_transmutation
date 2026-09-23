"""
scripts/blender/export_glb.py

Headless Blender export helper for the 3D Asset Integration initiative.

Many of the older Quaternius packs (Animated Monster Pack, Ultimate Food
Pack, medieval_village_pack, nature_props) ship only .blend/.fbx/.obj, no
glTF. Their materials date from Blender's Blender-Internal era: the shader
graph still routes through a legacy "Diffuse BSDF" node instead of
"Principled BSDF". Blender's own glTF exporter only knows how to translate
a Principled BSDF into glTF's PBR metallic-roughness model — when Surface
is wired to a Diffuse BSDF instead, it silently exports a default *white*
baseColorFactor, which is why these assets rendered as flat gray/black
"shadows" (confirmed by dumping the loaded three.js material — it came back
pure #ffffff for every sub-material, regardless of the source file's actual
authored color).

This script re-wires every material's Diffuse-BSDF colour (or its Image
Texture, if the legacy node is textured rather than flat-shaded) into a
Principled BSDF (creating one if needed) before exporting, so the real
authored colour/texture survives into the .glb. Run once per .blend file:

    blender --background --python scripts/blender/export_glb.py -- \
        <input.blend> <output.glb>

Requires the Blender CLI (`blender`) on PATH or invoked via its full binary
path — no Blender MCP/GUI needed, this runs fully headless.
"""

import bpy
import sys


def _find_base_color_source(node, _visited=None):
    """DFS the shader graph feeding `node`'s Surface looking for something
    usable as a Principled BSDF Base Color: either the first Image Texture
    node reached (its Color output), or — failing that — the first flat
    non-default Color/Base Color value found on a BSDF-ish node along the
    way. Returns (texture_output_socket_or_None, flat_rgba_or_None).

    Needed because some packs (e.g. nature_props' tree/leaf materials) wire
    Surface through a much deeper graph than a single legacy Diffuse BSDF —
    Add Shader / Mix Shader / Refraction BSDF combinations for a
    translucent-leaf look, with the actual leaf texture several hops in.

    Only follows RGBA- and SHADER-typed sockets (e.g. Color/Base Color on a
    BSDF, the two Shader inputs on Add/Mix Shader). Deliberately does NOT
    follow VECTOR/VALUE-typed sockets like Normal/Roughness/IOR/Weight —
    an earlier version of this walked every input indiscriminately and
    picked up a Normal Map node's flat default (0.5, 0.5, 1.0) as if it
    were an authored colour, which is wrong (that's a "no perturbation"
    normal value, not a colour)."""
    if _visited is None:
        _visited = set()
    if node.name in _visited:
        return None, None
    _visited.add(node.name)

    if node.type == 'TEX_IMAGE':
        img = node.image
        if img is not None and tuple(img.size) != (0, 0):
            out = node.outputs.get('Color')
            if out is not None:
                return out, None
        # Image reference exists but the file isn't actually on disk (size
        # (0, 0) — Blender couldn't load it). Confirmed case: nature_props'
        # .blend files reference `//../Textures/*.png` paths that aren't
        # present anywhere in the source zip/Downloads folder we have —
        # this is a genuine missing-asset gap, not something this script
        # can recover. Fall through so the caller's name-based fallback
        # colour kicks in instead of silently exporting a colourless mesh.

    color_input = node.inputs.get('Color') or node.inputs.get('Base Color')
    if color_input is not None and color_input.type == 'RGBA' and not color_input.is_linked:
        val = tuple(color_input.default_value)
        # Ignore plain white/black defaults on non-colour-bearing nodes
        # (e.g. an unused Transparent BSDF's Color) — only trust this as a
        # real authored colour if it's not the socket's untouched default.
        if val not in ((1.0, 1.0, 1.0, 1.0), (0.0, 0.0, 0.0, 1.0)):
            return None, val

    for inp in node.inputs:
        if inp.is_linked and inp.type in ('RGBA', 'SHADER'):
            tex, flat = _find_base_color_source(inp.links[0].from_node, _visited)
            if tex is not None or flat is not None:
                return tex, flat

    return None, None


# Policy (per explicit user directive): NEVER invent a replacement colour
# for a material whose real texture/colour data can't be recovered from
# supplied source files. An earlier version of this script guessed a flat
# colour from the material's *name* (e.g. "flower" -> pink) when the real
# texture was missing — that was rejected by the user as fabrication, not a
# fix (first pink was wrong, guessing green before that was also wrong).
# When nothing real is recoverable, `_fix_material` now leaves the material
# untouched rather than synthesising an appearance for it. If a pack is
# missing real texture data, the correct next step is to locate/obtain the
# actual supplied texture (e.g. via a sibling Textures.zip/folder, or the
# live Blender MCP connection to inspect packed data), not to guess a colour.


def _fix_material(mat):
    """Ensure `mat`'s Principled BSDF (created if missing) carries the
    actual authored colour/texture and is what's wired to Material Output,
    so the glTF exporter doesn't silently fall back to white.

    IMPORTANT: a single material can have *multiple* Material Output nodes
    (target='ALL' / 'EEVEE' / 'CYCLES') — Blender's glTF exporter reads
    whichever one has `is_active_output = True` (this is normally the
    'EEVEE' one on these files), which is NOT necessarily the first
    OUTPUT_MATERIAL node found in the node list. Every output node's
    Surface input must be checked/rewired independently, or the fix silently
    patches the wrong node and the export still falls back to white."""
    if not mat.use_nodes or mat.node_tree is None:
        return

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    output_nodes = [n for n in nodes if n.type == 'OUTPUT_MATERIAL']
    if not output_nodes:
        return

    principled = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)

    for output_node in output_nodes:
        surface_input = output_node.inputs.get('Surface')
        if surface_input is None or not surface_input.is_linked:
            continue

        src_node = surface_input.links[0].from_node
        if src_node.type == 'BSDF_PRINCIPLED':
            continue  # already correct on this output — nothing to fix

        texture_src_socket, colour = _find_base_color_source(src_node)
        if texture_src_socket is None and colour is None:
            # No real texture or authored flat colour recoverable from the
            # supplied source file — leave this material's Surface wiring
            # untouched rather than invent an appearance for it.
            continue

        if principled is None:
            principled = nodes.new('ShaderNodeBsdfPrincipled')
            principled.location = (src_node.location.x, src_node.location.y - 200)

        if texture_src_socket is not None:
            links.new(texture_src_socket, principled.inputs['Base Color'])
        else:
            principled.inputs['Base Color'].default_value = colour
        links.new(principled.outputs['BSDF'], output_node.inputs['Surface'])


    # These old files carry THREE Material Output nodes per material
    # (target='ALL'/'EEVEE'/'CYCLES' — a leftover from being opened in
    # successive Blender versions). Even after every output's Surface is
    # correctly wired to a Principled BSDF, Blender's glTF exporter gets
    # confused by the extra output nodes and silently exports an *empty*
    # material (no pbrMetallicRoughness at all) — confirmed by direct
    # inspection of the exported .glb JSON. Prune down to a single
    # target='ALL' output node so the exporter's material-gathering code
    # has an unambiguous node to read from.
    output_nodes = [n for n in nodes if n.type == 'OUTPUT_MATERIAL']
    if len(output_nodes) > 1:
        keep = next((n for n in output_nodes if n.is_active_output), output_nodes[0])
        for n in output_nodes:
            if n is not keep:
                nodes.remove(n)
        keep.target = 'ALL'


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    blend_path, out_path = argv[0], argv[1]

    bpy.ops.wm.open_mainfile(filepath=blend_path)

    for mat in bpy.data.materials:
        _fix_material(mat)

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format='GLB',
        export_animations=True,
        export_skins=True,
        export_apply=False,
        export_yup=True,
        export_materials='EXPORT',
    )
    print(f'EXPORTED: {out_path}')


if __name__ == '__main__':
    main()
