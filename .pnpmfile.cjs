// .pnpmfile.cjs
function readPackage(pkg) {
  // 允许以下包运行它们的构建脚本
  const allowedBuildScripts = [
    'better-sqlite3',
    'sqlite3',
    'sharp', // 如果你用到 sharp，也需要加上
    'unrs-resolver' // 这个看起来也需要
  ];
  
  if (allowedBuildScripts.includes(pkg.name)) {
    // 设置 ignoreScripts 为 false，即允许执行脚本
    pkg.scripts = pkg.scripts || {};
    pkg.ignoreScripts = false;
  }
  
  return pkg;
}

module.exports = {
  hooks: {
    readPackage
  }
};