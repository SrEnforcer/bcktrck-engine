/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Types must match TSF++ trunk workflow conventions
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'build', 'ci'],
    ],
    // Subject: imperative mood, no period, max 72 chars
    'subject-case':        [2, 'never', ['sentence-case', 'start-case', 'pascal-case', 'upper-case']],
    'subject-full-stop':   [2, 'never', '.'],
    'header-max-length':   [2, 'always', 72],
    // Scope is optional but must be lowercase kebab-case when provided
    'scope-case':          [2, 'always', 'lower-case'],
  },
};