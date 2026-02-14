# Board Skins Spec (v1)

## Themes

- Tropical
- Space
- Family

## Required Assets Per Skin

- `board_base` (square image, no snakes/ladders baked in)
- `overlay_snakes_ladders` (transparent PNG aligned to board grid)
- `thumbnail` (small preview image)

## Alignment Rules

- All skins align to the same master tile coordinate template.
- Tile numbers remain readable and are not baked into skin art by default.
- Overlay transparency must preserve token and number legibility.

## File Naming Suggestion

- `assets/boards/<skin>/board_base.png`
- `assets/boards/<skin>/overlay_snakes_ladders.png`
- `assets/boards/<skin>/thumbnail.png`
