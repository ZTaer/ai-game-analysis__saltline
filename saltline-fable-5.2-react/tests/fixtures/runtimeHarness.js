import { startGame } from '../../src/game/runtime/startGame.ts';
import '../../src/styles/game.css';

window.runtimeHarness = {
  startGame,
  originalConsoleError: console.error,
};
