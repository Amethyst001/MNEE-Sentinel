// Full production launcher with tsconfig-paths for alias resolution
require('dotenv').config({ path: '../.env' });
require('tsconfig-paths/register');
require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
        module: 'commonjs',
        esModuleInterop: true,
        skipLibCheck: true
    }
});
require('./src/bot.ts');
