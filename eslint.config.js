import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: ['dist', 'info', 'ui/.angular'],
    rules: {
      'curly': ['error', 'all'],
      'no-undef': 'error',
      'perfectionist/sort-exports': 'error',
      'perfectionist/sort-imports': [
        'error',
        {
          groups: [
            ['type-builtin', 'type-external', 'type-internal'],
            ['type-parent', 'type-sibling', 'type-index'],
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'side-effect',
            'unknown',
          ],
          internalPattern: ['^@/.*'],
          order: 'asc',
          type: 'natural',
          newlinesBetween: 1,
        },
      ],
      'perfectionist/sort-named-exports': 'error',
      'perfectionist/sort-named-imports': 'error',
      'style/brace-style': ['error', '1tbs'],
      'style/quote-props': ['error', 'consistent-as-needed'],
      'test/no-only-tests': 'error',
      'ts/consistent-type-imports': 'off',
      'unicorn/no-useless-spread': 'error',
      'unused-imports/no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
    typescript: true,
    angular: true,
    formatters: {
      css: true,
      // html: true,
      markdown: true,
      svg: true,
    },
  },
)
  .override('antfu/angular/rules/ts', config => ({
    ...config,
    files: ['ui/**/*.ts'],
  }))
  .override('antfu/angular/rules/template', config => ({
    ...config,
    files: ['ui/**/*.html'],
  }))
