/** 浏览器入口：加载全局样式，并把 React 页面挂到 index.html 提供的 #root。 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import './styles/game.css';

// 页面只挂载一个 App；WebGL/音频实例的启动和释放由 App 的 Effect 成对管理。
createRoot(document.getElementById('root')!).render(<App />);
