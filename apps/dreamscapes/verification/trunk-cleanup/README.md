# Zora trunk visual cleanup

Preview only. No main merge or production deployment authorized.

The closed GLB pose was level and rigid: hinge (0,.49,.094), zero closed rotation, lid lower edge z=.094 against body rim z=.091. Its rectangular geometry is unchanged. Scene camera elevation changed from 1.9 to 1.2 to match the scene perspective and reduce the exaggerated top-surface view.

The duplicate was residual source shackle geometry embedded in Trunk_Body, behind the independent animated shackle. Removed locally and repaired the boundary. DOM/SVG remain invisible hit-target controls. The independent padlock, shackle clips, puzzle and saved state remain intact.

Removed the shallow interior insert, raised cylinder and circular details. Repaired only the inner wood lining with a recessed bottom and inner walls using existing wood artwork. Exterior body, lid mesh/UVs, hinge, stays and animation clips are retained. Reproducible Blender bpy script: model-cleanup/cleanup.py. Local Blender source: model-cleanup/Zora_Trunk_Cleanup.blend (not shipped to the browser).

Checks: build PASS; one complete adult desktop Borrowed Light journey, return/closure, persistent unlock, replay without puzzle, explicit reset and refresh PASS. Final interior repair additionally checked closed/open on desktop and mobile emulation. No full carnival or four-age-band regression suite. See journey-results.json and closed/open captures. The journey run preceded the final interior lining boundary refinement; final visual checks used the final GLB.
