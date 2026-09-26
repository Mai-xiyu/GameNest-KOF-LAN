import { walls, tasks } from './geometry.mjs';

const playerRadius = 14;
const speed = 230;

function hitsWall(x, y) {
  return walls.some(wall => {
    const nearestX = Math.max(wall.x, Math.min(x, wall.x + wall.w));
    const nearestY = Math.max(wall.y, Math.min(y, wall.y + wall.h));
    return Math.hypot(x - nearestX, y - nearestY) <= playerRadius;
  });
}

export function validMove(player, x, y, now) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 20 || x > 940 || y < 20 || y > 520) return false;
  const distance = Math.hypot(x - player.x, y - player.y);
  const elapsed = Math.min(Math.max(now - (player.lastMoveAt ?? now), 0), 250);
  const budget = Math.min(speed * 0.25, (player.moveBudget ?? 8) + speed * elapsed / 1000);
  if (distance > budget) return false;
  const steps = Math.ceil(distance / 7);
  for (let step = 1; step <= steps; step++) {
    const fraction = step / steps;
    if (hitsWall(player.x + (x - player.x) * fraction, player.y + (y - player.y) * fraction)) return false;
  }
  if (hitsWall(x, y)) return false;
  player.moveBudget = budget - distance;
  return true;
}

export function validTask(player, taskId) {
  const task = tasks.find(entry => entry.id === taskId);
  return !!task && !player.doneTasks.has(task.id) &&
    Math.hypot(player.x - task.x, player.y - task.y) <= 40;
}

export function nearBody(player, bodies) {
  return bodies.some(body => Math.hypot(player.x - body.x, player.y - body.y) <= 80);
}

export function validRepair(player, type, side) {
  const stationId = type === 'lights' ? 'wires-upper-left' :
    type === 'o2' && side === 'left' ? 'engine-lower-left' :
    type === 'o2' && side === 'right' ? 'shields-lower-right' : null;
  const station = tasks.find(task => task.id === stationId);
  return !!station && Math.hypot(player.x - station.x, player.y - station.y) <= 40;
}

export const tasksPerCrew = tasks.length;
