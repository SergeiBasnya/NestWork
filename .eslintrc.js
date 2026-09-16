module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', '@next/next'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@next/next/recommended',
    'prettier',
  ],
  env: {
    node: true,
    browser: true,
    es2022: true,
  },
  settings: { next: { rootDir: 'apps/web/' } },
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    // React Hooks correctness (was only enforced via Next's lint; now unified
    // here so `pnpm lint` covers the web app too — see CI note that this enables).
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // This app deliberately renders blob/data URLs and sprite sheets that do not
    // benefit from Next's remote image pipeline; navigation uses the App Router.
    '@next/next/no-img-element': 'off',
    '@next/next/no-html-link-for-pages': 'off',
  },
  ignorePatterns: ['node_modules/', 'dist/', '.next/', 'build/', '**/next-env.d.ts'],
};
