/**
 * 无线电字幕原文。播放时机和停留时间由 gameFlow.js 决定。
 * cut 按非最终中继的完成次序索引；最后一个中继使用 all。
 * 如果调整任务目标数量，需同步核对这里及标题页中明确写出数量的文案。
 */
export const RADIO_LINES = {
  intro:
    'Breacher, this is Control. The Harbormaster holds the berth. Cut its three uplinks \u2014 yard, shed, quay.',
  contact: 'It has seen you. Gulls fly, Hounds walk. Put them down.',
  cut: [
    'One relay dark. It felt that \u2014 machines inbound.',
    'Two dark. It is throwing everything it has left at you.',
  ],
  all: 'All three dark. The boat is holding at the quay ladder, south end. Run.',
  low: 'You are hit hard. Get behind steel and breathe.',
  done: 'Breacher is aboard. Saltline is dark. Good work.',
};
