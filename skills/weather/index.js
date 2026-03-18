// 定义一个函数
function getWeather() {
  // 函数内部才能用 return
  return JSON.stringify({ "tempratura": 22 });
}

// 调用并输出
console.log(getWeather());