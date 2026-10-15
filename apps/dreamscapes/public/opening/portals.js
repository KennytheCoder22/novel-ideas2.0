// Stable positions are independent from artwork and destination names.
// Replace a portal's art with { src: './opening/new-art.webp' } to use a
// standalone image. No atlas edits or Carnival runtime changes are necessary.
const atlas = './opening/portal-atlas.png';
const tile = (column, row) => ({
  src: atlas,
  size: '400% 200%',
  position: `${column * 100 / 3}% ${row * 100}%`,
});

export const portals = Object.freeze([
  { id: 'dream-01', placeholder: true, description: 'A lantern-lit forest doorway', art: tile(0, 0) },
  { id: 'dream-02', placeholder: true, description: 'An underwater palace beyond a shell arch', art: tile(1, 0) },
  { id: 'creepy-carnival', title: 'Creepy Carnival', href: './experiments/carnival/index.html', description: 'A moonlit carnival behind red velvet curtains', art: tile(2, 0) },
  { id: 'dream-04', placeholder: true, description: 'A golden stairway through a starry sky', art: tile(3, 0) },
  { id: 'dream-05', placeholder: true, description: 'A sunlit castle beyond a stone arch', art: tile(0, 1) },
  { id: 'dream-06', placeholder: true, description: 'A desert palace at sunset', art: tile(1, 1) },
  { id: 'dream-07', placeholder: true, description: 'A winter castle framed by snowflakes', art: tile(2, 1) },
  { id: 'dream-08', placeholder: true, description: 'Waterfalls and ruins beyond a vine-covered arch', art: tile(3, 1) },
]);
