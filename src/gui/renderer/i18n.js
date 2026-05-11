// gui/renderer/i18n.js — 多语言 (中文 / ئۇيغۇرچە)
const i18n = {
  zh: {
    title: 'Ctrl · AI 助手',
    newChat: '新对话',
    history: '历史记录',
    placeholder: '输入消息...',
    send: '发送',
    thinking: '思考中...',
    running: '执行中...',
    abort: '中断',
    language: '语言',
    minimize: '最小化',
    maximize: '最大化',
    close: '关闭',
    welcome: '你好，我是 Ctrl，有什么可以帮你？',
    toolRunning: '正在执行',
    toolDone: '执行完成',
    error: '出错了',
    aborted: '已中断',
    workDir: '工作目录',
    changeDir: '点击切换',
  },
  ug: {
    title: 'Ctrl · AI ياردەمچى',
    newChat: 'يېڭى سۆھبەت',
    history: 'تارىخ',
    placeholder: 'ئۇچۇر كىرگۈزۈڭ...',
    send: 'يوللاش',
    thinking: 'ئويلىنىۋاتىدۇ...',
    running: 'ئىجرا قىلىنىۋاتىدۇ...',
    abort: 'توختىتىش',
    language: 'تىل',
    minimize: 'كىچىكلەت',
    maximize: 'چوڭايت',
    close: 'ياپ',
    welcome: 'ياخشىمۇسىز، مەن Ctrl، سىزگە قانداق ياردەم بېرەلەيمەن؟',
    toolRunning: 'ئىجرا قىلىنىۋاتىدۇ',
    toolDone: 'ئىجرا تاماملاندى',
    error: 'خاتالىق',
    aborted: 'توختىتىلدى',
    workDir: 'خىزمەت مۇندەرىجىسى',
    changeDir: 'ئۆزگەرتىش',
  }
};

let currentLang = localStorage.getItem('ctrl_lang') || 'zh';

export function t(key) {
  return i18n[currentLang]?.[key] || i18n.zh[key] || key;
}

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  if (i18n[lang]) {
    currentLang = lang;
    localStorage.setItem('ctrl_lang', lang);
    return true;
  }
  return false;
}

export function getLangList() {
  return [
    { code: 'zh', name: '中文' },
    { code: 'ug', name: 'ئۇيغۇرچە' },
  ];
}
