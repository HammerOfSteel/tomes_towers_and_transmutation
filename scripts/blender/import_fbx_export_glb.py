"""
scripts/blender/import_fbx_export_glb.py

Companion to export_glb.py, for the (rare) case where the pack ships no
.blend source and the pre-packaged GLB is missing data the FBX actually
has — e.g. monsters/Bestiary Dungeon Monsters ships a GLB with correct
materials but zero animation clips, while its sibling FBX export in the
same zip carries real AnimStack/action data (confirmed by the presence of
"AnimStack" in the raw FBX bytes). Importing the FBX into a fresh Blender
scene and re-exporting via glTF recovers the animations losslessly; runs
the same _fix_material() pass as export_glb.py so any legacy-shader
materials get the same treatment if present.

Usage:
    blender --background --python scripts/blender/import_fbx_export_glb.py -- \
        <input.fbx> <output.glb>
"""

import bpy
import sys

sys.path.insert(0, __file__.rsplit('/', 1)[0])
from export_glb import _fix_material  # noqa: E402


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    fbx_path, out_path = argv[0], argv[1]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx_path)

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


main()
