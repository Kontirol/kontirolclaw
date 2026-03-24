技能名：browser_search
功能：打开浏览器并搜索指定内容
要求：一定是用百度，不要用google
参数：{query:"要搜索的内容", browser:"可选，指定浏览器，如chrome、firefox，默认为系统默认浏览器"}
返回：{"success":true/false,"message":"操作结果描述","url":"打开的搜索URL"}
调用示例：node .\index.js '{"query":"今天天气怎么样","browser":"chrome"}'