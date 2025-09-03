import Phaser from 'https://esm.sh/phaser@4.0.0-rc.5';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  width: 640,
  height: 400,
  backgroundColor: '#141a33',
  parent: document.body as unknown as string,
  scene: { create, update },
};

function create(this: Phaser.Scene) {
  const g = this.add.graphics({ x: 320, y: 200 });
  g.fillStyle(0x4ecdc4, 1);
  g.fillRoundedRect(-100, -60, 200, 120, 16);
  this.add.text(16, 16, 'Phaser Sample', { fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#e9ecf1' } as any);
  // @ts-ignore - store on scene
  this.gfx = g;
}

function update(this: Phaser.Scene, _time: number, dt: number) {
  // @ts-ignore
  const gfx: Phaser.GameObjects.Graphics = this.gfx;
  if (gfx) {
    const delta = (dt || 16) * 0.06 * Math.PI / 180;
    gfx.rotation += delta;
  }
}

new Phaser.Game(config);

