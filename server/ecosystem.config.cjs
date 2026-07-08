/** PM2 进程配置：cwd 指向 server，应用启动时会自动读取同目录 .env */
module.exports = {
  apps: [
    {
      name: 'tk-server',
      cwd: __dirname,
      script: 'dist/main.js',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
