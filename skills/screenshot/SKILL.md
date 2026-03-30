技能名：screenshot
功能：截取电脑屏幕并保存为图片文件
相对路径：skills\screenshot\index.js
参数：{filePath:"可选，保存路径，如：C:/screenshots/截图.png，默认：当前目录/screenshot_时间戳.png"}
返回：{"success":true/false,"message":"操作结果描述","path":"实际保存的文件路径","size":"文件大小"}
调用示例：node .\skills\screenshot\index.js '{"filePath": "C:/Users/Desktop/screenshot.png"}'
