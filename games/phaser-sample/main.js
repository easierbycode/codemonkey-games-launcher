import Phaser from 'https://esm.sh/phaser@4.0.0-rc.5';

const config = {
  type: Phaser.CANVAS,
  width: 640,
  height: 400,
  backgroundColor: '#141a33',
  parent: document.body,
  scene: { create, update },
};

function create() {
  const g = this.add.graphics({ x: 320, y: 200 });
  g.fillStyle(0x4ecdc4, 1);
  g.fillRoundedRect(-100, -60, 200, 120, 16);
  this.add.text(16, 16, 'Phaser Sample', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#e9ecf1' });
  this.gfx = g;
}

function update(_time, dt) {
  const gfx = this.gfx;
  if (gfx) {
    const delta = (dt || 16) * 0.06 * Math.PI / 180;
    gfx.rotation += delta;
  }
}

new Phaser.Game(config);

