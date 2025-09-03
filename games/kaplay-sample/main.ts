(async () => {
  let kaplay: any = null;
  try {
    kaplay = (await import('https://unpkg.com/kaplay@latest/dist/kaplay.mjs')).default;
  } catch {
    kaplay = null;
  }

  if (kaplay) {
    try {
      const k = kaplay({ width: 640, height: 400, background: [20, 26, 51] });
      const { add, rect, color, pos, anchor, outline, onUpdate } = k;
      const box = add([rect(200, 120), color(78, 205, 196), pos(320, 200), anchor('center'), outline(4, [32, 38, 72])]);
      onUpdate(() => {
        // @ts-ignore angle property for rotation
        box.angle = ((box.angle || 0) as number) + 60 * k.dt();
      });
      return;
    } catch {
      // Fall through to canvas
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 400;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d')!;
  let a = 0;
  function draw(t: number) {
    a = (t || 0) * 0.06;
    ctx.fillStyle = '#141a33';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(320, 200);
    ctx.rotate(a * Math.PI / 180);
    ctx.fillStyle = '#4ecdc4';
    roundRect(ctx, -100, -60, 200, 120, 16, true, false);
    ctx.restore();
    ctx.fillStyle = '#e9ecf1';
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillText('Kaplay Placeholder', 16, 28);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: boolean, stroke: boolean) {
    if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }
})();

