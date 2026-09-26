const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('prepared Starliner rules reject forged movement, tasks and distant reports',
  { skip: !process.env.TEST_STARLINER_DIR }, async () => {
    const rules = await import(pathToFileURL(path.join(process.env.TEST_STARLINER_DIR, 'starliner-rules.mjs')).href);
    const now = Date.now();
    assert.equal(rules.tasksPerCrew, 5);
    assert.equal(rules.validMove({ x: 400, y: 300, lastMoveAt: now - 250 }, 440, 300, now), true);
    assert.equal(rules.validMove({ x: 400, y: 300, lastMoveAt: now - 250 }, 900, 100, now), false);
    assert.equal(rules.validMove({ x: 460, y: 300, lastMoveAt: now - 250 }, 485, 300, now), false);
    const mover = { x: 400, y: 300, lastMoveAt: now, moveBudget: 8 };
    let accepted = 0;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (!rules.validMove(mover, mover.x + 5, mover.y, now)) continue;
      mover.x += 5;
      mover.lastMoveAt = now;
      accepted++;
    }
    assert.equal(accepted, 1);
    assert.equal(rules.validMove(mover, mover.x + 20, mover.y, now + 100), true);
    const player = { x: 140, y: 140, doneTasks: new Set() };
    assert.equal(rules.validTask(player, 'wires-upper-left'), true);
    assert.equal(rules.validTask(player, 'invented-task'), false);
    player.doneTasks.add('wires-upper-left');
    assert.equal(rules.validTask(player, 'wires-upper-left'), false);
    player.x = 400;
    assert.equal(rules.validTask(player, 'nav-upper-right'), false);
    assert.equal(rules.nearBody(player, [{ x: 481, y: 140 }]), false);
    assert.equal(rules.nearBody(player, [{ x: 460, y: 140 }]), true);
    player.x = 140;
    assert.equal(rules.validRepair(player, 'lights'), true);
    assert.equal(rules.validRepair(player, 'o2', 'left'), false);
    player.x = 220;
    player.y = 420;
    assert.equal(rules.validRepair(player, 'o2', 'left'), true);
    assert.equal(rules.validRepair(player, 'o2', 'right'), false);
    player.x = 740;
    assert.equal(rules.validRepair(player, 'o2', 'right'), true);
    assert.equal(rules.validRepair(player, 'o2', 'invented'), false);
  });

test('every task station is reachable from spawn under the server collision rules',
  { skip: !process.env.TEST_STARLINER_DIR }, async () => {
    const rules = await import(pathToFileURL(path.join(process.env.TEST_STARLINER_DIR, 'starliner-rules.mjs')).href);
    const remainingTasks = new Set([
      'wires-upper-left', 'nav-upper-right', 'med-mid',
      'engine-lower-left', 'shields-lower-right',
    ]);
    const now = Date.now();
    const queue = [[400, 300]];
    const visited = new Set(['400,300']);
    const directions = [[5, 0], [-5, 0], [0, 5], [0, -5]];
    for (let index = 0; index < queue.length && remainingTasks.size; index++) {
      const [playerX, playerY] = queue[index];
      const player = { x: playerX, y: playerY, lastMoveAt: now - 250, doneTasks: new Set() };
      for (const taskId of remainingTasks) {
        if (rules.validTask(player, taskId)) remainingTasks.delete(taskId);
      }
      for (const [deltaX, deltaY] of directions) {
        const destinationX = playerX + deltaX;
        const destinationY = playerY + deltaY;
        const key = `${destinationX},${destinationY}`;
        if (visited.has(key) || !rules.validMove(player, destinationX, destinationY, now)) continue;
        visited.add(key);
        queue.push([destinationX, destinationY]);
      }
    }
    assert.deepEqual([...remainingTasks], []);
  });
