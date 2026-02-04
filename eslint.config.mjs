import eslintPlugin from 'eslint-plugin-obsidianmd';

export default [
    {
        files: ['src/**/*.ts'],
        plugins: {
            obsidianmd: eslintPlugin
        },
        rules: {
            ...eslintPlugin.configs.plugin.rules
        }
    }
];
