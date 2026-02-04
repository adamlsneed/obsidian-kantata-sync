import tsParser from '@typescript-eslint/parser';
import pkg from 'eslint-plugin-obsidianmd';
const eslintPlugin = pkg.default || pkg;

export default [
    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
                project: './tsconfig.json'
            }
        },
        plugins: {
            obsidianmd: eslintPlugin
        },
        rules: {
            ...eslintPlugin.configs.recommended
        }
    }
];
