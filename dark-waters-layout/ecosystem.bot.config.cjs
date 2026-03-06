module.exports = {
  apps: [
    {
      name: "dark-waters-bot",
      cwd: __dirname,
      script: "node",
      args: "scripts/bot-runner.mjs",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      min_uptime: "20s",
      kill_timeout: 10000,
      watch: false,
      env: {
        NODE_ENV: "production",
        BOT_ALLOW_INTERACTIVE_AUTH: "false",
        BOT_POLL_MS: "4000",
      },
    },
  ],
}
