import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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

async function openBrowser() {
    try {
        const query = options.query;
        if (!query) {
            console.log(JSON.stringify({ success: false, message: '缺少查询参数query' }));
            return;
        }
        const browser = options.browser || 'default'; // 默认使用系统默认浏览器
        
        // 构建搜索URL（使用百度搜索）
        const encodedQuery = encodeURIComponent(query);
        const searchUrl = `https://www.baidu.com/s?wd=${encodedQuery}`;
        
        let command = '';
        const platform = process.platform;
        
        // 根据平台和指定的浏览器构建命令
        if (browser === 'default') {
            // 使用系统默认浏览器打开
            if (platform === 'darwin') { // macOS
                command = `open "${searchUrl}"`;
            } else if (platform === 'win32') { // Windows
                command = `start "" "${searchUrl}"`;
            } else { // Linux 和其他Unix-like
                command = `xdg-open "${searchUrl}"`;
            }
        } else if (browser === 'chrome') {
            if (platform === 'darwin') {
                command = `open -a "Google Chrome" "${searchUrl}"`;
            } else if (platform === 'win32') {
                command = `start chrome "${searchUrl}"`;
            } else {
                command = `google-chrome "${searchUrl}"`;
            }
        } else if (browser === 'firefox') {
            if (platform === 'darwin') {
                command = `open -a "Firefox" "${searchUrl}"`;
            } else if (platform === 'win32') {
                command = `start firefox "${searchUrl}"`;
            } else {
                command = `firefox "${searchUrl}"`;
            }
        } else if (browser === 'edge') {
            if (platform === 'darwin') {
                command = `open -a "Microsoft Edge" "${searchUrl}"`;
            } else if (platform === 'win32') {
                command = `start msedge "${searchUrl}"`;
            } else {
                command = `microsoft-edge "${searchUrl}"`;
            }
        } else if (browser === 'safari') {
            if (platform === 'darwin') {
                command = `open -a "Safari" "${searchUrl}"`;
            } else {
                console.log(JSON.stringify({ success: false, message: 'Safari仅支持在macOS上使用' }));
                return;
            }
        } else {
            console.log(JSON.stringify({ success: false, message: `不支持的浏览器: ${browser}` }));
            return;
        }
        
        // 执行命令
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.log(JSON.stringify({ success: false, message: '打开浏览器失败', error: error.message }));
                return;
            }
            // 命令执行成功，我们不需要等待浏览器关闭
            console.log(JSON.stringify({ success: true, message: '浏览器已打开并开始搜索', url: searchUrl }));
        });
        
    } catch (error) {
        console.log(JSON.stringify({ success: false, message: '技能执行出错', error: error.message }));
    }
}

openBrowser();