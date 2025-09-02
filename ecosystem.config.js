// module.exports = {
//   apps: [
//     {
//       name: 'birkshoes-api',
//       script: './dist/index.js',
//       cwd: '/var/www/birkshoes-api',
//       watch: false,
//       env: {
//         NODE_ENV: 'production',
//         PORT: 4000,
//         // ... config existante
//       }
//     },
//     {
//       name: 'kimland-app',
//       script: './dist/server.js',
//       cwd: '/var/www/kimland-app',
//       watch: false,
//       instances: 1,
//       env: {
//         NODE_ENV: 'production',
//         PORT: 3001
//       },
//       error_file: '/var/log/pm2/kimland-app-error.log',
//       out_file: '/var/log/pm2/kimland-app-out.log',
//       log_file: '/var/log/pm2/kimland-app.log'
//     }
//   ]
// };