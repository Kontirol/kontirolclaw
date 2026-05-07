// src/ui/spinner.js - 自定义微调器动画
// 写入 stderr，避免与 stdout 的流式输出冲突

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const INTERVAL_MS = 80;

export class Spinner {
  constructor() {
    this.frameIndex = 0;
    this.timer = null;
    this.text = '';
    this.isSpinning = false;
  }

  start(text = '') {
    if (this.isSpinning) {
      this.text = text;
      this._render();
      return;
    }
    this.isSpinning = true;
    this.text = text;
    this.frameIndex = 0;
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % FRAMES.length;
      this._render();
    }, INTERVAL_MS);
    this._render();
  }

  _render() {
    const frame = FRAMES[this.frameIndex];
    process.stderr.write(`\r\x1b[K${frame} ${this.text}`);
  }

  stop() {
    if (!this.isSpinning) return;
    clearInterval(this.timer);
    this.timer = null;
    this.isSpinning = false;
    process.stderr.write('\r\x1b[K');
  }

  updateText(text) {
    this.text = text;
    if (this.isSpinning) this._render();
  }
}
