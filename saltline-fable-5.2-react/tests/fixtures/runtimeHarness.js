import { startGame } from '../../src/game/runtime/startGame.js';
import '../../src/styles/game.css';

window.runtimeHarness = {
  startGame,
  originalConsoleError: console.error,
};
