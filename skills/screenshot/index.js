import screenshot from 'screenshot-desktop'
import { writeFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// 获取当前模块的目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 获取命令行参数
const args = process.argv[2];
let options = {};
if (args) {
    try {
        options = JSON.parse(args);
    } catch (e) {
        console.log(JSON.stringify({ success: false, message: '参数解析失败', error: e.message }));
        process.exit(1);
    }
}

async function takeScreenshot() {
    try {
        // 生成默认文件名（如果未提供filePath）
        let filePath = options.filePath;
        if (!filePath) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            filePath = join(process.cwd(), `screenshot_${timestamp}.png`);
        }

        // 确保目录存在
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }

        // 截图
        const buffer = await screenshot();
        // 保存文件
        writeFileSync(filePath, buffer);

        // 获取文件大小
        const stats = statSync(filePath);
        const size = (stats.size / (1024 * 1024)).toFixed(2) + 'MB';

        console.log(JSON.stringify({
            success: true,
            message: '截图成功',
            path: filePath,
            size: size
        }));
    } catch (error) {
        console.log(JSON.stringify({
            success: false,
            message: '截图失败',
            error: error.message
        }));
    }
}

takeScreenshot();
