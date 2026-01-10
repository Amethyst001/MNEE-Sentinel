// Minimal launcher
require('dotenv').config({ path: '../.env' });
require('ts-node').register({
    transpileOnly: true,
    compilerOptions: {
        module: 'commonjs',
        esModuleInterop: true,
        skipLibCheck: true
    }
});
require('./src/bot-minimal.ts');
